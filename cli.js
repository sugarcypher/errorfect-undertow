#!/usr/bin/env node
/*
 * Errorfect Undertow — command line
 *
 *   node cli.js essay.txt                 scan one text, print a Markdown report
 *   node cli.js ./posts/                  scan a body of work (every .txt/.md/.html inside)
 *   cat speech.txt | node cli.js          scan stdin
 *   node cli.js a.txt b.md --json         full JSON instead of Markdown
 *   node cli.js ./posts --deep            add the Claude deep read (needs `npm install` + API credentials)
 *   node cli.js ./posts --out report.md   write the report to a file
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const E = require('./engine.js');
const D = require('./deep.js');

const EXTS = new Set(['.txt', '.text', '.md', '.markdown', '.html', '.htm']);

function usage(code) {
  console.log(`Errorfect Undertow ${E.VERSION} — hidden-vector detector

Usage: node cli.js [files or folders…] [options]
       cat text.txt | node cli.js [options]

Options:
  --json        Output the full analysis as JSON
  --deep        Add a Claude deep read (claude-opus-5-5). Needs \`npm install\` and
                ANTHROPIC_API_KEY (or an \`ant auth login\` profile).
  --yes         Skip the confirmation for very large deep reads
  --out FILE    Write the report to FILE instead of printing it
  -h, --help    Show this help

Folders are searched recursively for ${[...EXTS].join(' ')} files.`);
  process.exit(code);
}

function parseArgs(argv) {
  const o = { paths: [], json: false, deep: false, yes: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--deep') o.deep = true;
    else if (a === '--yes' || a === '-y') o.yes = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('--')) { console.error('Unknown option ' + a); usage(1); }
    else o.paths.push(a);
  }
  return o;
}

function collect(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      collect(path.join(p, name), out);
    }
  } else if (EXTS.has(path.extname(p).toLowerCase())) {
    let text = fs.readFileSync(p, 'utf8');
    if (/\.html?$/i.test(p)) text = E.stripMarkup(text);
    out.push({ name: path.relative(process.cwd(), p) || path.basename(p), text });
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let docs = [];
  if (!opts.paths.length || (opts.paths.length === 1 && opts.paths[0] === '-')) {
    if (process.stdin.isTTY) usage(1);
    docs.push({ name: 'stdin', text: await readStdin() });
  } else {
    for (const p of opts.paths) {
      if (!fs.existsSync(p)) { console.error('Not found: ' + p); process.exit(1); }
      collect(p, docs);
    }
  }
  docs = docs.filter((d) => d.text.trim());
  if (!docs.length) { console.error('No readable text found.'); process.exit(1); }

  const scan = docs.length === 1 ? E.analyze(docs[0].text) : E.analyzeCorpus(docs);

  let deep = null;
  if (opts.deep) deep = await deepRead(docs, scan, opts);

  let output;
  if (opts.json) {
    output = JSON.stringify({ scan, deep }, null, 2);
  } else {
    output = docs.length === 1 ? E.toMarkdown(scan, docs[0].name) : E.corpusToMarkdown(scan);
    if (deep) output += '\n\n' + D.deepToMarkdown(deep.data) + `\n\n_Model: ${deep.model} · input ${deep.usage.input_tokens} tokens · output ${deep.usage.output_tokens} tokens_`;
  }

  if (opts.out) { fs.writeFileSync(opts.out, output + '\n'); console.error('Report written to ' + opts.out); }
  else console.log(output);
}

async function deepRead(docs, scan, opts) {
  let Anthropic;
  try { Anthropic = (await import('@anthropic-ai/sdk')).default; }
  catch (e) {
    console.error('The deep read needs the Anthropic SDK. Run `npm install` in ' + __dirname + ' first.');
    process.exit(1);
  }
  const est = D.estimateTokens(docs);
  if (est > D.LARGE_INPUT_TOKENS && !opts.yes) {
    console.error(`This body of work is about ${est.toLocaleString()} input tokens. Re-run with --yes to send it to ${D.MODEL}.`);
    process.exit(1);
  }
  const client = new Anthropic(); // resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile
  try {
    return await D.runDeepRead(client, docs, scan, { onStatus: (s) => process.stderr.write('\r' + s.padEnd(70)) });
  } catch (err) {
    process.stderr.write('\n');
    if (err instanceof Anthropic.AuthenticationError) console.error('Authentication failed: set ANTHROPIC_API_KEY or run `ant auth login`.');
    else if (/resolve authentication/i.test(err.message)) console.error('No API credentials found: set ANTHROPIC_API_KEY or run `ant auth login`.');
    else if (err instanceof Anthropic.RateLimitError) console.error('Rate limited by the API. Wait a moment and retry.');
    else if (err instanceof Anthropic.APIError) console.error('API error ' + (err.status || '') + ': ' + err.message);
    else console.error('Deep read failed: ' + err.message);
    console.error('The rule-based scan below is unaffected.');
    return null;
  } finally {
    process.stderr.write('\n');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
