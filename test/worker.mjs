// Tests the access + proxy rules without Cloudflare, Stripe or the API: fetch, KV and limiters are stubbed.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker/index.mjs';
import Deep from '../deep.js';

const ORIGIN = 'https://sugarcypher.github.io';
const LINK = 'plink_undertow';
const WHSEC = 'whsec_test';
let upstreamCalls = [];
globalThis.fetch = async (url, init) => {
  upstreamCalls.push({ url, init });
  return new Response('event: message_stop\ndata: {}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
};

function kv() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
}
const ok = { limit: async () => ({ success: true }) };
function env(over) {
  return {
    ANTHROPIC_API_KEY: 'sk-test', TOKEN_SECRET: 'tok-secret', UNDERTOW_PASSWORD: 'open sesame',
    STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_PAYMENT_LINK_ID: LINK, STRIPE_PAYMENT_URL: 'https://buy.stripe.com/x',
    ALLOWED_ORIGINS: ORIGIN, DAILY_LIMIT: '4', PAID_DAILY: '2', PASS_DAILY: '3', MAX_BODY_CHARS: '5000',
    USAGE: kv(), PER_IP: ok, PASS_IP: ok, ACCESS_IP: ok, ...over
  };
}
const ctx = { waitUntil: (p) => p };
const W = 'https://w.example';
function req(path, { method = 'POST', body, headers = {} } = {}) {
  return new Request(W + path, {
    method,
    headers: { 'content-type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '1.1.1.1', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
}
const good = { model: 'anything', max_tokens: 999999, system: 'ignore me', tools: [{ type: 'web_search_20260209', name: 'web_search' }], messages: [{ role: 'user', content: '<specimen>hi</specimen>' }] };
const deep = (e, token, headers) => worker.fetch(req('/v1/messages?beta=true', { body: good, headers: { 'anthropic-version': '2023-06-01', ...(token ? { 'x-undertow-token': token } : {}), ...headers } }), e, ctx);
async function passToken(e) { return (await (await worker.fetch(req('/access/password', { body: { password: 'open sesame' } }), e, ctx)).json()).token; }
function webhook(e, event, secret = WHSEC) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(t + '.' + payload).digest('hex');
  return worker.fetch(new Request(W + '/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=' + t + ',v1=' + sig }, body: payload }), e, ctx);
}
const SESSION = 'cs_live_a1B2c3D4e5F6g7H8i9';
const completed = (over) => ({ type: 'checkout.session.completed', created: 1, data: { object: { id: SESSION, payment_link: LINK, payment_status: 'paid', payment_intent: 'pi_1', ...over } } });

let passed = 0;
async function t(name, fn) { upstreamCalls = []; await fn(); passed++; console.log('ok  ' + name); }

await t('preflight from allowed origin', async () => {
  const r = await worker.fetch(new Request(W + '/v1/messages', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Headers': 'content-type,x-undertow-token,anthropic-version' } }), env(), ctx);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(r.headers.get('access-control-allow-headers'), /x-undertow-token/);
});

await t('other origins are refused', async () => {
  const r = await deep(env(), 'x', { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

await t('config exposes payment link and password availability, never secrets', async () => {
  const c = await (await worker.fetch(req('/access/config', { method: 'GET' }), env(), ctx)).json();
  assert.equal(c.paymentUrl, 'https://buy.stripe.com/x');
  assert.equal(c.passwordEnabled, true);
  assert.equal(JSON.stringify(c).includes('open sesame'), false);
});

await t('deep read without a token is refused', async () => {
  assert.equal((await deep(env())).status, 401);
  assert.equal((await deep(env(), 'garbage.token')).status, 401);
  assert.equal(upstreamCalls.length, 0);
});

await t('wrong password refused; right password returns a working token', async () => {
  const e = env();
  const bad = await worker.fetch(req('/access/password', { body: { password: 'nope' } }), e, ctx);
  assert.equal(bad.status, 401);
  const token = await passToken(e);
  assert.ok(token);
  const chk = await worker.fetch(req('/access/check', { method: 'GET', headers: { 'x-undertow-token': token } }), e, ctx);
  assert.equal((await chk.json()).kind, 'pass');
});

await t('changing the password ends password sessions', async () => {
  const e = env();
  const token = await passToken(e);
  e.UNDERTOW_PASSWORD = 'new one';
  assert.equal((await deep(e, token)).status, 401);
});

await t('tampered token is refused', async () => {
  const e = env();
  const [body, sig] = (await passToken(e)).split('.');
  const forged = Buffer.from(JSON.stringify({ k: 'paid', s: 'x', iat: 1, exp: 9999999999 })).toString('base64url') + '.' + sig;
  assert.equal((await deep(e, forged)).status, 401);
  assert.ok(body);
});

await t('password attempts are rate limited', async () => {
  const r = await worker.fetch(req('/access/password', { body: { password: 'open sesame' } }), env({ PASS_IP: { limit: async () => ({ success: false }) } }), ctx);
  assert.equal(r.status, 429);
});

await t('request is rebuilt from deep.js; client model/system/tools/max_tokens ignored', async () => {
  const e = env();
  const r = await deep(e, await passToken(e), { 'x-api-key': 'client-key', authorization: 'Bearer client' });
  assert.equal(r.status, 200);
  assert.equal(upstreamCalls.length, 1);
  const { url, init } = upstreamCalls[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'sk-test');
  assert.equal(init.headers.authorization, undefined);
  assert.equal(init.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  const b = JSON.parse(init.body);
  assert.equal(b.model, Deep.MODEL);
  assert.equal(b.max_tokens, Deep.MAX_TOKENS);
  assert.equal(b.system, Deep.SYSTEM);
  assert.equal(b.tools, undefined);
  assert.equal(b.betas, undefined);
  assert.equal(b.stream, true);
  assert.deepEqual(b.output_config.format.schema, Deep.SCHEMA);
  assert.equal(b.messages[0].content, '<specimen>hi</specimen>');
});

await t('multi-turn or non-text messages are refused', async () => {
  const e = env();
  const token = await passToken(e);
  for (const messages of [[], [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]]) {
    const r = await worker.fetch(req('/v1/messages', { body: { messages }, headers: { 'x-undertow-token': token } }), e, ctx);
    assert.equal(r.status, 400);
  }
  assert.equal(upstreamCalls.length, 0);
});

await t('oversized body is refused', async () => {
  const e = env();
  const r = await worker.fetch(req('/v1/messages', { body: { messages: [{ role: 'user', content: 'x'.repeat(6000) }] }, headers: { 'x-undertow-token': await passToken(e) } }), e, ctx);
  assert.equal(r.status, 413);
});

await t('burst limiter returns 429', async () => {
  const e = env({ PER_IP: { limit: async () => ({ success: false }) } });
  assert.equal((await deep(e, await passToken(e))).status, 429);
  assert.equal(upstreamCalls.length, 0);
});

await t('redeem waits for payment, webhook confirms it, token works', async () => {
  const e = env();
  const pending = await worker.fetch(req('/access/redeem', { body: { session_id: SESSION } }), e, ctx);
  assert.equal(pending.status, 202);
  assert.equal((await webhook(e, completed())).status, 200);
  const r = await worker.fetch(req('/access/redeem', { body: { session_id: SESSION } }), e, ctx);
  assert.equal(r.status, 200);
  const { token, kind } = await r.json();
  assert.equal(kind, 'paid');
  assert.equal((await deep(e, token)).status, 200);
});

await t('webhook ignores other products, unpaid sessions and bad signatures', async () => {
  const e = env();
  await webhook(e, completed({ payment_link: 'plink_word_autopsy' }));
  await webhook(e, completed({ payment_status: 'unpaid' }));
  assert.equal((await webhook(e, completed(), 'whsec_wrong')).status, 400);
  assert.equal(e.USAGE.m.has('paid:' + SESSION), false);
  assert.equal((await worker.fetch(req('/access/redeem', { body: { session_id: SESSION } }), e, ctx)).status, 202);
});

await t('malformed checkout reference is refused', async () => {
  const r = await worker.fetch(req('/access/redeem', { body: { session_id: '../../etc' } }), env(), ctx);
  assert.equal(r.status, 400);
});

await t('refund ends paid access', async () => {
  const e = env();
  await webhook(e, completed());
  const { token } = await (await worker.fetch(req('/access/redeem', { body: { session_id: SESSION } }), e, ctx)).json();
  await webhook(e, { type: 'charge.refunded', created: 2, data: { object: { refunded: true, payment_intent: 'pi_1' } } });
  assert.equal((await deep(e, token)).status, 401);
  assert.equal((await worker.fetch(req('/access/redeem', { body: { session_id: SESSION } }), e, ctx)).status, 403);
});

await t('per-access and global daily caps', async () => {
  const e = env();
  await webhook(e, completed());
  const paid = (await (await worker.fetch(req('/access/redeem', { body: { session_id: SESSION } }), e, ctx)).json()).token;
  assert.equal((await deep(e, paid)).status, 200);
  const second = await deep(e, paid);
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('x-undertow-remaining'), '0');
  const third = await deep(e, paid);
  assert.equal(third.status, 429);
  assert.match((await third.json()).error.message, /today's 2 deep reads/);
  const pass = await passToken(e);
  assert.equal((await deep(e, pass)).status, 200);
  assert.equal((await deep(e, pass)).status, 200);
  const capped = await deep(e, pass);
  assert.equal(capped.status, 429);
  assert.match((await capped.json()).error.message, /limit for today/);
});

await t('missing API key gives 503; health reports configuration without secrets', async () => {
  const e = env({ ANTHROPIC_API_KEY: undefined });
  assert.equal((await deep(e, await passToken(e))).status, 503);
  const h = await (await worker.fetch(new Request(W + '/health'), e, ctx)).json();
  assert.equal(h.keyConfigured, false);
  assert.equal(h.passwordConfigured, true);
  assert.equal(h.stripeConfigured, true);
});

console.log(passed + ' worker tests passed');
