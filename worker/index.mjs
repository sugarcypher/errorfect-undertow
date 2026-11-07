/*!
 * Errorfect Undertow — hosted deep-read proxy (Cloudflare Worker)
 *
 * Lets the public page run a deep read without a visitor's own API key. It is deliberately
 * not a general Claude proxy: the client may send only the user message (specimen + prescan);
 * model, system prompt, output schema, thinking and token limit are rebuilt here from deep.js.
 *
 * Limits, in the order they are checked:
 *   1. Origin must be in ALLOWED_ORIGINS (stops other sites' pages, not scripts)
 *   2. Body size ≤ MAX_BODY_CHARS
 *   3. PER_IP rate-limit binding (burst)
 *   4. Per-IP and global daily caps, counted in the USAGE KV namespace (approximate)
 * Set a monthly spend limit in the Anthropic Console as the hard backstop.
 *
 * Secret: ANTHROPIC_API_KEY (wrangler secret put ANTHROPIC_API_KEY)
 */
import Deep from '../deep.js';

const UPSTREAM = 'https://api.anthropic.com/v1/messages';
const BETA = 'server-side-fallback-2026-07-01';
const DEFAULT_VERSION = '2023-06-01';

function apiError(status, type, message, headers) {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

function today() { return new Date().toISOString().slice(0, 10); }

async function bump(kv, key, limit) {
  const n = parseInt((await kv.get(key)) || '0', 10);
  if (n >= limit) return { ok: false, n };
  return { ok: true, n: n + 1, write: kv.put(key, String(n + 1), { expirationTtl: 60 * 60 * 48 }) };
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin
      ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Expose-Headers': 'request-id, x-undertow-remaining' }
      : { 'Vary': 'Origin' };
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      if (!okOrigin) return new Response(null, { status: 403, headers: cors });
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || 'content-type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, model: Deep.MODEL, keyConfigured: !!env.ANTHROPIC_API_KEY }), {
        headers: { 'content-type': 'application/json', ...cors }
      });
    }

    if (req.method !== 'POST' || url.pathname !== '/v1/messages') return apiError(404, 'not_found_error', 'Not found.', cors);
    if (!okOrigin) return apiError(403, 'permission_error', 'This endpoint only serves the Undertow page.', cors);
    if (!env.ANTHROPIC_API_KEY) return apiError(503, 'api_error', 'The hosted deep read is not configured yet. Add your own API key to run it.', cors);

    const maxChars = parseInt(env.MAX_BODY_CHARS || '400000', 10);
    if (parseInt(req.headers.get('content-length') || '0', 10) > maxChars * 2) {
      return apiError(413, 'request_too_large', 'This specimen is too large for the hosted deep read. Use your own API key for large bodies of work.', cors);
    }
    const raw = await req.text();
    if (raw.length > maxChars) {
      return apiError(413, 'request_too_large', 'This specimen is too large for the hosted deep read. Use your own API key for large bodies of work.', cors);
    }

    let body;
    try { body = JSON.parse(raw); } catch (e) { return apiError(400, 'invalid_request_error', 'Body is not JSON.', cors); }
    const m = body && body.messages;
    if (!Array.isArray(m) || m.length !== 1 || m[0].role !== 'user' || typeof m[0].content !== 'string' || !m[0].content.trim()) {
      return apiError(400, 'invalid_request_error', 'Expected a single user message with text content.', cors);
    }

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.PER_IP) {
      const { success } = await env.PER_IP.limit({ key: ip });
      if (!success) return apiError(429, 'rate_limit_error', 'Too many deep reads in a short time. Wait a minute and try again.', cors);
    }

    let remaining = '';
    if (env.USAGE) {
      const day = today();
      const perIp = await bump(env.USAGE, 'ip:' + day + ':' + ip, parseInt(env.PER_IP_DAILY || '5', 10));
      if (!perIp.ok) return apiError(429, 'rate_limit_error', 'You have used today\'s hosted deep reads. Add your own API key to keep going, or come back tomorrow.', cors);
      const global = await bump(env.USAGE, 'all:' + day, parseInt(env.DAILY_LIMIT || '25', 10));
      if (!global.ok) return apiError(429, 'rate_limit_error', 'The hosted deep read has reached its daily limit. Add your own API key to keep going, or come back tomorrow.', cors);
      ctx.waitUntil(Promise.all([perIp.write, global.write]));
      remaining = String(parseInt(env.PER_IP_DAILY || '5', 10) - perIp.n);
    }

    const params = Deep.requestFor(m[0].content);
    delete params.betas; // sent as a header below
    params.stream = true;

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': req.headers.get('anthropic-version') || DEFAULT_VERSION,
        'anthropic-beta': BETA
      },
      body: JSON.stringify(params)
    });

    const headers = { ...cors, 'content-type': upstream.headers.get('content-type') || 'text/event-stream', 'cache-control': 'no-store' };
    const rid = upstream.headers.get('request-id');
    if (rid) headers['request-id'] = rid;
    if (remaining) headers['x-undertow-remaining'] = remaining;
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
