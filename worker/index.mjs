/*!
 * Errorfect Undertow — access and hosted deep-read proxy (Cloudflare Worker)
 *
 * Access: a $39 one-time Stripe payment, or the owner's password, earns a signed access token
 * that the page keeps in local storage. The hosted deep read requires that token.
 *
 * Deep read: not a general Claude proxy. The client may send only the user message
 * (specimen + prescan); model, system prompt, schema, thinking and token limit are rebuilt
 * from deep.js on every request.
 *
 * Routes
 *   GET  /health
 *   GET  /access/config          payment link URL, whether a password is set
 *   POST /access/redeem          {session_id} → token, once Stripe confirms the payment
 *   POST /access/password        {password}   → token
 *   GET  /access/check           x-undertow-token → is the token still valid
 *   POST /access/restore         {email} → emails a one-time sign-in link to a past buyer
 *   POST /access/restore/redeem  {code}  → token, from that link
 *   POST /stripe/webhook         Stripe events (signature-verified)
 *   POST /v1/messages            hosted deep read (x-undertow-token required)
 *
 * Secrets (wrangler secret put NAME --name errorfect-undertow-api)
 *   ANTHROPIC_API_KEY       Claude API key
 *   TOKEN_SECRET            signs access tokens (random; rotating it signs everyone out)
 *   UNDERTOW_PASSWORD       the bypass password (changing it signs out password sessions)
 *   STRIPE_WEBHOOK_SECRET   whsec_… for /stripe/webhook
 *   STRIPE_PAYMENT_LINK_ID  plink_… — only payments through this link unlock Undertow
 *   STRIPE_PAYMENT_URL      https://buy.stripe.com/… shown on the paywall
 *   STRIPE_SECRET_KEY       optional restricted key (Checkout Sessions: read) — confirms a
 *                           payment directly if the webhook hasn't arrived yet
 *   RESEND_API_KEY          re_… — sends restore-by-email links (resend.com)
 *   EMAIL_FROM              e.g. "Errorfect <access@errorfect.com>", on a domain verified in Resend
 *
 * Buyer emails are never stored in plain text: KV keeps a salted hash → checkout session ids.
 */
import Deep from '../deep.js';

const UPSTREAM = 'https://api.anthropic.com/v1/messages';
const BETA = 'server-side-fallback-2026-07-01';
const DEFAULT_VERSION = '2023-06-01';
const PAID_TTL = 60 * 60 * 24 * 365 * 5; // one-time purchase: five years on this browser
const PASS_TTL = 60 * 60 * 24 * 365;
const RESTORE_TTL = 30 * 60; // sign-in links expire after 30 minutes
const DEFAULT_SITE = 'https://sugarcypher.github.io/errorfect-undertow/';
const enc = new TextEncoder();

// ---------- small helpers ----------
const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date().toISOString().slice(0, 10);
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function sha256hex(s) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))); }
function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function json(status, data, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}
function apiError(status, type, message, headers) { return json(status, { type: 'error', error: { type, message } }, headers); }

async function limited(binding, key) {
  if (!binding) return false;
  const { success } = await binding.limit({ key });
  return !success;
}
async function bump(kv, key, limit) {
  const n = int(await kv.get(key), 0);
  if (n >= limit) return { ok: false, n };
  return { ok: true, n: n + 1, write: kv.put(key, String(n + 1), { expirationTtl: 60 * 60 * 48 }) };
}

// ---------- access tokens ----------
async function passVersion(env) { return (await sha256hex('undertow-pass:' + env.UNDERTOW_PASSWORD)).slice(0, 16); }

async function signToken(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return body + '.' + b64u(await hmac(env.TOKEN_SECRET, body));
}

async function readToken(env, token) {
  if (!token || !env.TOKEN_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!sameString(b64u(await hmac(env.TOKEN_SECRET, body)), sig)) return null;
  let p;
  try { p = JSON.parse(new TextDecoder().decode(fromB64u(body))); } catch (e) { return null; }
  if (!p || !p.exp || p.exp < now()) return null;
  if (p.k === 'pass') {
    if (!env.UNDERTOW_PASSWORD || p.pv !== (await passVersion(env))) return null;
  } else if (p.k === 'paid') {
    if (env.USAGE && (await env.USAGE.get('revoked:' + p.s))) return null;
  } else return null;
  return p;
}

// ---------- Stripe ----------
async function verifyStripe(env, header, payload) {
  if (!env.STRIPE_WEBHOOK_SECRET) return null;
  let t = null;
  const v1 = [];
  for (const part of (header || '').split(',')) {
    const i = part.indexOf('=');
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v; else if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.length || Math.abs(now() - int(t, 0)) > 300) return null;
  const expected = hex(await hmac(env.STRIPE_WEBHOOK_SECRET, t + '.' + payload));
  if (!v1.some((s) => sameString(s, expected))) return null;
  try { return JSON.parse(payload); } catch (e) { return null; }
}

function countsAsPaid(env, session) {
  return !!(session && env.STRIPE_PAYMENT_LINK_ID && session.payment_link === env.STRIPE_PAYMENT_LINK_ID && session.payment_status === 'paid');
}

const normEmail = (e) => String(e || '').trim().toLowerCase();
async function emailKey(email) { return 'email:' + (await sha256hex('undertow-email:' + normEmail(email))); }

async function recordPaid(env, session) {
  await env.USAGE.put('paid:' + session.id, String(now()));
  if (session.payment_intent) await env.USAGE.put('pi:' + session.payment_intent, session.id);
  const email = (session.customer_details && session.customer_details.email) || session.customer_email;
  if (email) {
    const key = await emailKey(email);
    const list = JSON.parse((await env.USAGE.get(key)) || '[]');
    if (!list.includes(session.id)) {
      list.push(session.id);
      await env.USAGE.put(key, JSON.stringify(list));
    }
  }
}

async function confirmWithStripe(env, sessionId) {
  if (!env.STRIPE_SECRET_KEY) return false;
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId), {
    headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }
  });
  if (!r.ok) return false;
  const s = await r.json();
  if (!countsAsPaid(env, s)) return false;
  await recordPaid(env, s);
  return true;
}

// ---------- routes ----------
async function readJson(req, max) {
  const raw = await req.text();
  if (raw.length > max) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function stripeWebhook(req, env) {
  const payload = await req.text();
  const ev = await verifyStripe(env, req.headers.get('Stripe-Signature'), payload);
  if (!ev) return json(400, { error: 'bad signature' });
  const o = (ev.data && ev.data.object) || {};
  if ((ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') && countsAsPaid(env, o)) {
    await recordPaid(env, o);
  } else if (ev.type === 'charge.refunded' && o.refunded && o.payment_intent) {
    const cs = await env.USAGE.get('pi:' + o.payment_intent);
    if (cs) await env.USAGE.put('revoked:' + cs, String(now()));
  }
  return json(200, { received: true });
}

async function redeem(req, env, cors) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env.ACCESS_IP, 'redeem:' + ip)) return apiError(429, 'rate_limit_error', 'Too many attempts. Wait a minute and try again.', cors);
  const body = await readJson(req, 2000);
  const id = body && body.session_id;
  if (typeof id !== 'string' || !/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(id)) return apiError(400, 'invalid_request_error', 'That checkout reference is not valid.', cors);
  if (await env.USAGE.get('revoked:' + id)) return apiError(403, 'permission_error', 'This purchase was refunded, so access has ended.', cors);
  const paid = (await env.USAGE.get('paid:' + id)) || (await confirmWithStripe(env, id));
  if (!paid) return json(202, { pending: true }, cors);
  const iat = now();
  return json(200, { token: await signToken(env, { k: 'paid', s: id, iat, exp: iat + PAID_TTL }), kind: 'paid' }, cors);
}

async function password(req, env, cors) {
  if (!env.UNDERTOW_PASSWORD) return apiError(503, 'api_error', 'Password access is not set up.', cors);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env.PASS_IP, 'pass:' + ip)) return apiError(429, 'rate_limit_error', 'Too many attempts. Wait a minute and try again.', cors);
  const body = await readJson(req, 2000);
  const given = body && typeof body.password === 'string' ? body.password : '';
  const ok = sameString(await sha256hex('cmp:' + given), await sha256hex('cmp:' + env.UNDERTOW_PASSWORD));
  if (!ok) return apiError(401, 'authentication_error', 'That password didn\'t match.', cors);
  const iat = now();
  return json(200, { token: await signToken(env, { k: 'pass', s: 'pass', pv: await passVersion(env), iat, exp: iat + PASS_TTL }), kind: 'pass' }, cors);
}

function restoreEnabled(env) { return !!(env.RESEND_API_KEY && env.EMAIL_FROM); }

async function sendRestoreEmail(env, to, link) {
  const text = [
    'Here is your link to open Errorfect Undertow in a browser:',
    '',
    link,
    '',
    'It works once and expires in 30 minutes. If you didn\'t ask for it, you can ignore this email; nothing about your access changes.',
    '',
    'Errorfect · ThinkWell Labs'
  ].join('\n');
  const html = '<div style="font-family:Courier New,monospace;font-size:15px;line-height:1.6;color:#1a1a2e">' +
    '<p>Here is your link to open Errorfect Undertow in a browser:</p>' +
    '<p><a href="' + link + '" style="display:inline-block;padding:10px 18px;background:#00a8b5;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Open Undertow</a></p>' +
    '<p style="color:#555">It works once and expires in 30 minutes. If you didn\'t ask for it, you can ignore this email; nothing about your access changes.</p>' +
    '<p style="color:#888">Errorfect · ThinkWell Labs</p></div>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.RESEND_API_KEY },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: 'Your Undertow sign-in link', text, html })
  });
  if (!r.ok) console.log('restore email failed', r.status, await r.text());
}

// Same answer whether or not the address bought anything, so the endpoint can't be used to look up buyers.
async function restoreRequest(req, env, ctx, cors) {
  if (!restoreEnabled(env)) return apiError(503, 'api_error', 'Restoring by email isn\'t set up yet.', cors);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env.RESTORE_IP, 'restore:' + ip)) return apiError(429, 'rate_limit_error', 'Too many requests. Wait a minute and try again.', cors);
  const body = await readJson(req, 2000);
  const email = normEmail(body && body.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return apiError(400, 'invalid_request_error', 'Enter the email address you used at checkout.', cors);
  }
  const done = json(200, { ok: true, message: 'If that address was used to buy Undertow, a sign-in link is on its way. It expires in 30 minutes.' }, cors);

  const key = await emailKey(email);
  const sent = await bump(env.USAGE, 'restore-sent:' + key + ':' + today(), int(env.RESTORE_PER_EMAIL_DAILY, 5));
  if (!sent.ok) return done; // don't flood a buyer's inbox
  ctx.waitUntil(sent.write);

  const list = JSON.parse((await env.USAGE.get(key)) || '[]');
  let sid = null;
  for (let i = list.length - 1; i >= 0 && !sid; i--) {
    if (!(await env.USAGE.get('revoked:' + list[i]))) sid = list[i];
  }
  if (!sid) return done;

  const code = b64u(crypto.getRandomValues(new Uint8Array(24)));
  await env.USAGE.put('restore:' + code, sid, { expirationTtl: RESTORE_TTL });
  const link = (env.SITE_URL || DEFAULT_SITE) + '?restore=' + code;
  ctx.waitUntil(sendRestoreEmail(env, email, link));
  return done;
}

async function restoreRedeem(req, env, cors) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env.ACCESS_IP, 'restore-redeem:' + ip)) return apiError(429, 'rate_limit_error', 'Too many attempts. Wait a minute and try again.', cors);
  const body = await readJson(req, 2000);
  const code = body && body.code;
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(code)) return apiError(400, 'invalid_request_error', 'That sign-in link is not valid.', cors);
  const sid = await env.USAGE.get('restore:' + code);
  if (!sid) return apiError(404, 'not_found_error', 'This sign-in link has expired or was already used. You can request a new one.', cors);
  await env.USAGE.delete('restore:' + code); // one use only
  if (await env.USAGE.get('revoked:' + sid)) return apiError(403, 'permission_error', 'This purchase was refunded, so access has ended.', cors);
  const iat = now();
  return json(200, { token: await signToken(env, { k: 'paid', s: sid, iat, exp: iat + PAID_TTL }), kind: 'paid' }, cors);
}

async function deepRead(req, env, ctx, cors) {
  const tok = await readToken(env, req.headers.get('x-undertow-token'));
  if (!tok) return apiError(401, 'authentication_error', 'Access to Undertow has ended in this browser. Unlock it again to run a deep read.', cors);
  if (!env.ANTHROPIC_API_KEY) return apiError(503, 'api_error', 'The hosted deep read is not configured yet. Add your own API key to run it.', cors);

  const maxChars = int(env.MAX_BODY_CHARS, 400000);
  const tooBig = () => apiError(413, 'request_too_large', 'This specimen is too large for the hosted deep read. Use your own API key for large bodies of work.', cors);
  if (int(req.headers.get('content-length'), 0) > maxChars * 2) return tooBig();
  const raw = await req.text();
  if (raw.length > maxChars) return tooBig();
  let body;
  try { body = JSON.parse(raw); } catch (e) { return apiError(400, 'invalid_request_error', 'Body is not JSON.', cors); }
  const m = body && body.messages;
  if (!Array.isArray(m) || m.length !== 1 || m[0].role !== 'user' || typeof m[0].content !== 'string' || !m[0].content.trim()) {
    return apiError(400, 'invalid_request_error', 'Expected a single user message with text content.', cors);
  }

  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env.PER_IP, ip)) return apiError(429, 'rate_limit_error', 'Too many deep reads in a short time. Wait a minute and try again.', cors);

  let remaining = '';
  if (env.USAGE) {
    const day = today();
    const cap = tok.k === 'pass' ? int(env.PASS_DAILY, 25) : int(env.PAID_DAILY, 10);
    const mine = await bump(env.USAGE, 'use:' + day + ':' + tok.s, cap);
    if (!mine.ok) return apiError(429, 'rate_limit_error', 'That\'s today\'s ' + cap + ' deep reads. They reset at midnight UTC, or you can add your own API key to keep going.', cors);
    const all = await bump(env.USAGE, 'all:' + day, int(env.DAILY_LIMIT, 60));
    if (!all.ok) return apiError(429, 'rate_limit_error', 'The hosted deep read has reached its limit for today. Add your own API key to keep going, or try again tomorrow.', cors);
    ctx.waitUntil(Promise.all([mine.write, all.write]));
    remaining = String(cap - mine.n);
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

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // Stripe calls this server-to-server: no Origin, verified by signature instead.
    if (req.method === 'POST' && url.pathname === '/stripe/webhook') return stripeWebhook(req, env);

    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin
      ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Expose-Headers': 'request-id, x-undertow-remaining' }
      : { 'Vary': 'Origin' };

    if (req.method === 'OPTIONS') {
      if (!okOrigin) return new Response(null, { status: 403, headers: cors });
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || 'content-type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(200, {
        ok: true,
        model: Deep.MODEL,
        keyConfigured: !!env.ANTHROPIC_API_KEY,
        tokensConfigured: !!env.TOKEN_SECRET,
        passwordConfigured: !!env.UNDERTOW_PASSWORD,
        stripeConfigured: !!(env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PAYMENT_LINK_ID && env.STRIPE_PAYMENT_URL),
        emailConfigured: restoreEnabled(env)
      }, cors);
    }

    if (!okOrigin) return apiError(403, 'permission_error', 'This endpoint only serves the Undertow page.', cors);
    if (!env.TOKEN_SECRET && url.pathname !== '/access/config') return apiError(503, 'api_error', 'Access is not configured yet.', cors);

    if (req.method === 'GET' && url.pathname === '/access/config') {
      return json(200, {
        paymentUrl: env.STRIPE_PAYMENT_URL || null,
        price: env.PRICE_LABEL || '$39',
        passwordEnabled: !!env.UNDERTOW_PASSWORD,
        restoreEnabled: restoreEnabled(env),
        deepReadsPerDay: int(env.PAID_DAILY, 10)
      }, cors);
    }
    if (req.method === 'POST' && url.pathname === '/access/restore') return restoreRequest(req, env, ctx, cors);
    if (req.method === 'POST' && url.pathname === '/access/restore/redeem') return restoreRedeem(req, env, cors);
    if (req.method === 'POST' && url.pathname === '/access/redeem') return redeem(req, env, cors);
    if (req.method === 'POST' && url.pathname === '/access/password') return password(req, env, cors);
    if (req.method === 'GET' && url.pathname === '/access/check') {
      const tok = await readToken(env, req.headers.get('x-undertow-token'));
      return tok ? json(200, { ok: true, kind: tok.k, exp: tok.exp }, cors) : json(401, { ok: false }, cors);
    }
    if (req.method === 'POST' && url.pathname === '/v1/messages') return deepRead(req, env, ctx, cors);

    return apiError(404, 'not_found_error', 'Not found.', cors);
  }
};
