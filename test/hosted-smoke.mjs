// Smoke test against the deployed proxy, using the same SDK and code path as the page.
// Spends one hosted deep read when the key is configured. Usage: node test/hosted-smoke.mjs [--live]
import Anthropic from '@anthropic-ai/sdk';
import E from '../engine.js';
import D from '../deep.js';

const BASE = 'https://errorfect-undertow-api.13531nxt.workers.dev';
const ORIGIN = 'https://sugarcypher.github.io';

const pre = await fetch(BASE + '/v1/messages', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-api-key,anthropic-version,anthropic-beta,anthropic-dangerous-direct-browser-access' } });
console.log('preflight', pre.status, pre.headers.get('access-control-allow-origin'));
const health = await (await fetch(BASE + '/health')).json();
console.log('health', JSON.stringify(health));

if (!process.argv.includes('--live')) process.exit(0);
const text = 'Act now. Everyone who matters has already joined. Only a fool would wait, and you are smarter than that. This offer disappears at midnight.';
const docs = [{ name: 'smoke', text }];
const client = new Anthropic({ apiKey: 'undertow-hosted', baseURL: BASE, maxRetries: 0, defaultHeaders: { Origin: ORIGIN } });
try {
  const res = await D.runDeepRead(client, docs, E.analyze(text), { onStatus: (s) => process.stdout.write('\r' + s + '      ') });
  console.log('\nmodel', res.model, 'usage', JSON.stringify(res.usage));
  console.log('overview:', res.data.overview);
  console.log('vectors:', res.data.hidden_vectors.map((v) => v.kind + ': ' + v.vector).join(' | '));
} catch (err) {
  console.log('\nerror', err.status, err.error?.error?.message || err.message);
}
