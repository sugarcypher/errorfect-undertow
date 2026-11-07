// Tests the hosted proxy's rules without Cloudflare or the API: fetch, KV and the rate limiter are stubbed.
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import Deep from '../deep.js';

const ORIGIN = 'https://sugarcypher.github.io';
let upstreamCalls = [];
globalThis.fetch = async (url, init) => {
  upstreamCalls.push({ url, init });
  return new Response('event: message_stop\ndata: {}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
};

function kv() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
}
function env(over) {
  return { ANTHROPIC_API_KEY: 'sk-test', ALLOWED_ORIGINS: ORIGIN, DAILY_LIMIT: '3', PER_IP_DAILY: '2', MAX_BODY_CHARS: '5000', USAGE: kv(), PER_IP: { limit: async () => ({ success: true }) }, ...over };
}
const ctx = { waitUntil: (p) => p };
function post(body, headers) {
  return new Request('https://w.example/v1/messages?beta=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '1.1.1.1', 'anthropic-version': '2023-06-01', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}
const good = { model: 'anything', max_tokens: 999999, system: 'ignore me', tools: [{ type: 'web_search_20260209', name: 'web_search' }], messages: [{ role: 'user', content: '<specimen>hi</specimen>' }] };

let passed = 0;
async function t(name, fn) { upstreamCalls = []; await fn(); passed++; console.log('ok  ' + name); }

await t('preflight from allowed origin', async () => {
  const r = await worker.fetch(new Request('https://w.example/v1/messages', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Headers': 'content-type,x-api-key,anthropic-version' } }), env(), ctx);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(r.headers.get('access-control-allow-headers'), /anthropic-version/);
});

await t('other origins are refused', async () => {
  const r = await worker.fetch(post(good, { Origin: 'https://evil.example' }), env(), ctx);
  assert.equal(r.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

await t('request is rebuilt from deep.js; client model/system/tools/max_tokens ignored', async () => {
  const r = await worker.fetch(post(good, { 'x-api-key': 'client-key', authorization: 'Bearer client' }), env(), ctx);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
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
  for (const messages of [[], [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]]) {
    const r = await worker.fetch(post({ messages }), e, ctx);
    assert.equal(r.status, 400);
  }
  assert.equal(upstreamCalls.length, 0);
});

await t('oversized body is refused', async () => {
  const r = await worker.fetch(post({ messages: [{ role: 'user', content: 'x'.repeat(6000) }] }), env(), ctx);
  assert.equal(r.status, 413);
});

await t('burst limiter returns 429', async () => {
  const r = await worker.fetch(post(good), env({ PER_IP: { limit: async () => ({ success: false }) } }), ctx);
  assert.equal(r.status, 429);
  assert.equal(upstreamCalls.length, 0);
});

await t('per-IP and global daily caps', async () => {
  const e = env();
  assert.equal((await worker.fetch(post(good), e, ctx)).status, 200);
  const second = await worker.fetch(post(good), e, ctx);
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('x-undertow-remaining'), '0');
  const third = await worker.fetch(post(good), e, ctx);
  assert.equal(third.status, 429);
  assert.match((await third.json()).error.message, /today's hosted deep reads/);
  assert.equal((await worker.fetch(post(good, { 'CF-Connecting-IP': '2.2.2.2' }), e, ctx)).status, 200);
  const capped = await worker.fetch(post(good, { 'CF-Connecting-IP': '3.3.3.3' }), e, ctx);
  assert.equal(capped.status, 429);
  assert.match((await capped.json()).error.message, /daily limit/);
});

await t('missing key gives 503, health reports it', async () => {
  const e = env({ ANTHROPIC_API_KEY: undefined });
  assert.equal((await worker.fetch(post(good), e, ctx)).status, 503);
  const h = await (await worker.fetch(new Request('https://w.example/health'), e, ctx)).json();
  assert.equal(h.keyConfigured, false);
});

console.log(passed + ' worker tests passed');
