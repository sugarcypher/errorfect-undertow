# Errorfect Undertow

**Hidden vector detector.** The surface of a text says one thing; the current underneath moves you somewhere. Undertow finds the linguistic mechanisms by which a text — or a whole body of work — covertly applies a **vector**:

- **Belief**: what you are being moved to accept as true
- **Action**: what you are being moved to do
- **Thought**: how your thinking is being shaped, narrowed, or shut down

Undertow is an Errorfect product, distinct from the Word Autopsy. It is built on the Errorfect framework (the operator taxonomy, the mask/mechanism distinction, and the A–D protocol for its probes). Where the autopsy dissects one person's word, Undertow detects mechanisms across sentences, documents and whole bodies of work.

## Run it

**In a browser.** Open `index.html`. No install or server is needed. Paste text, or drop `.txt` / `.md` / `.html` files for a body of work, then press **Scan**. Use `index.html#sample=Recruitment%20pitch` (or `#sample=body`) to open straight into a demo specimen.

**From the command line** (Node 18+):

```bash
node cli.js essay.txt                  # one text → Markdown report
node cli.js ./posts/                   # a body of work (recursive)
cat speech.txt | node cli.js           # stdin
node cli.js ./posts --json             # full data
node cli.js ./posts --out report.md    # write to a file
```

**Deep read with Claude (optional).** Run `npm install` once (this installs `@anthropic-ai/sdk`, pinned to 1.0.0). Then:

```bash
ANTHROPIC_API_KEY=sk-ant-... node cli.js ./posts --deep
```

The CLI also accepts an `ant auth login` profile.

In the browser, the deep read is included with access. It runs through the hosted proxy (`worker/`), within a daily limit. To use your own key instead, open **Deep read → Use your own API key**. That key goes only from your browser to api.anthropic.com.

**Tests:** `npm test`. This runs the engine tests, the deep-read wiring test against a local mock API, and the Worker's tests (access, Stripe webhook, restore by email, limits). None of them call anything external or cost anything. `node test/hosted-smoke.mjs` checks the deployed Worker.

## Access and the hosted Worker

The page opens on a paywall: **$39, one time**, the same price as the Word Autopsy but a separate Stripe product. `worker/` is a Cloudflare Worker that handles access and the hosted deep read.

**Ways in.** Each one ends with a signed access token kept in the browser:
- **Payment.** Stripe Payment Link → back to the page with `?session_id=` → the Worker confirms it via the webhook → token.
- **Password.** "Enter password" → the Worker compares it with `UNDERTOW_PASSWORD` → token. Changing the password signs out password sessions.
- **Restore by email.** "Restore access by email" → if the address matches a purchase, the Worker emails a sign-in link that works once and expires in 30 minutes. Every request gets the same answer, so the form can't be used to look up who bought. Buyer emails are kept only as salted hashes.
- **Refunds.** A refund ends paid access through the `charge.refunded` webhook.

**The deep read** requires a token. It is not a general Claude proxy: it accepts only a single text user message, and it rebuilds the model, system prompt, output schema, thinking and token limit from `deep.js`.

**Limits** are set in `worker/wrangler.toml`:

| Limit | Default |
|---|---|
| Allowed page origins | sugarcypher.github.io, localhost:8000 |
| Deep reads per purchase | 10 a day |
| Deep reads on the password | 25 a day |
| Deep reads, everyone | 60 a day |
| Burst | 2 deep reads a minute per IP |
| Password attempts | 5 a minute per IP |
| Restore emails | 3 requests a minute per IP, 5 emails a day per address |
| Body size | 400,000 characters |

Daily counts are approximate because KV storage is eventually consistent. Set a monthly spend limit in the Anthropic Console as the hard backstop.

**Setup.** Each `secret put` asks for the value at the prompt:

```bash
wrangler secret put ANTHROPIC_API_KEY  --name errorfect-undertow-api
wrangler secret put UNDERTOW_PASSWORD  --name errorfect-undertow-api
bash worker/setup-stripe.sh            # Stripe product, $39 price, payment link, webhook
wrangler secret put RESEND_API_KEY     --name errorfect-undertow-api   # restore by email
wrangler secret put EMAIL_FROM         --name errorfect-undertow-api   # e.g. Errorfect <access@errorfect.com>
cd worker && wrangler deploy           # after changing limits or deep.js
```

The Worker also has a `TOKEN_SECRET`, which signs the tokens. Replacing it signs everyone out.

## How a scan works

The rule-based scan runs entirely locally and reads in three layers:

| Layer | What it finds | Source |
|---|---|---|
| **1 · Lexical operators** | Single words that install a state of affairs instead of describing one. Covers standard-installers, sorting-rule enforcers, threat-coders, identity-fusers, metric-concealers and shame verdicts. Each comes with its **mask** and its **mechanism**. | Errorfect White Paper §8.2 operator taxonomy, §1.1 mask/mechanism |
| **2 · Rhetorical mechanisms** | Sentence-level moves that apply a vector without stating it as a claim (37 mechanisms, listed below). | See the table below |
| **3 · Hidden layer** | Content addressed to machines or invisible to people: Unicode tag payloads (decoded), zero-width characters inside words, direction overrides, variation-selector runs, look-alike letters from other scripts, and prompt-injection phrasing. | ThinkWell Labs / AcePaste work on hidden text |

The lexicon matches through the evasions it reports. Zero-width characters are removed and look-alike letters folded before matching, so "sh​ould" still registers as an obligation. Every hit is mapped back to its exact position in the original text.

**Readouts:**

- **Pressure index (0–100).** Weighted mechanism density per 100 words, with a 60-word floor so a single phrase in a tiny text can't max it out.
  - Bands: *Low signal* below 20, *Ambient* 20–44, *Engineered* 45–69, *Saturated* 70 and up.
  - Calibration on the bundled samples: neutral library report 0, layoff memo 61, sales page 85, recruitment pitch 86.
- **Covert share.** The percentage of pressure that comes from mechanisms rated *covert*, meaning they work below the level of an explicit claim.
- **Convergence.** Follows the ψ Influence Mapping interpretation key: "one or two signals = friction points; three or more converging vectors = an architecture."
  - A *convergence zone* is three or more distinct rhetorical or hidden mechanisms within three consecutive sentences. Lexical operators and absolutes don't count toward it.
- **Where it is pushing you.** The clause each directional mechanism points at, grouped into Do / Believe / Think.
- **Body of work:**
  - per-document table
  - **signature**: mechanisms that recur in at least half the documents
  - **shared phrasing**: four-word phrases in two or more documents, which may be talking points
  - **recurring targets**
- **Repetition** (the illusory-truth pattern) and **Errorfect A-probes** (protocol A applied to the load-bearing words, presented as a subjective probe, not a decoding).
- **Consent checkpoint.** The white paper's three diagnostic questions, plus D³ (disengage · detect · delay).

## The deep read

`deep.js` sends the specimen and the rule-based scan to `claude-opus-5-5`. It uses adaptive thinking, effort `high`, and a JSON-schema structured output.

The read follows the **My-Psi-Self triad** (MODL Paper 3), in the analysis direction:

1. **Myth-Op**: what is presented.
2. **Self-Op**: how the reader is invited to experience the conclusion as their own ("I concluded X," not "I was told X").
3. **PSi-Op**: what the claim actually rests on. The F2 substrate test asks whether the evidence is *real*, *partial*, *reframed*, *fabricated* or *absent*.

Then it returns:

- each **hidden vector**, as one sentence with verbatim evidence
- mechanisms with their mask and mechanism
- where the mechanisms converge
- who benefits
- the **most charitable reading**
- the pre-scan hits that are **false positives**
- **defused** rewrites of the most loaded sentences
- its confidence and what it couldn't determine

**Settings and safeguards:**

- The specimen is treated as data. Instructions inside it, such as an embedded "ignore previous instructions", are analyzed, not followed.
- **Server-side fallback is enabled** (`fallbacks: "default"`). Manipulative or extremist specimens can trip a safety classifier, and the fallback re-runs the request on Anthropic's recommended fallback model instead of failing. Remove `betas` / `fallbacks` in `deep.js` if you don't want this.
- **Cost:** about $0.15–0.20 for a typical page; the browser shows an estimate before each run. Requests over about 150k input tokens ask for confirmation. In the CLI, pass `--yes`.

## Mechanisms

*Covertness:* ● covert (works below the level of a claim) · ◐ subtle · ○ overt. *Vectors:* B = belief, A = action, T = thought.

| Mechanism | Vectors | Covert | Origin |
|---|---|---|---|
| Presupposition smuggling | B | ● | standard linguistics |
| Self-attribution priming | B | ● | MODL Paper 3, My-Psi-Self ("Psy-Op hijacks Self-Op") |
| Frame control | B T | ◐ | Dark psychology tactics (frame control) |
| Pre-emptive discrediting | B T | ● | ψ Influence Mapping, Case 5 (weaponized skepticism) |
| Epistemic closure | B T | ◐ | Dark psychology tactics (information control) |
| Isolation | B A | ◐ | Dark psychology tactics (coercive persuasion) |
| Dissent penalty | B A | ◐ | ψ Influence Mapping, ψ(cell) indicators |
| Empathy deflection | T | ● | ψ Influence Mapping §7, "Mirror Saboteurs" |
| Belonging for compliance | A B | ◐ | Love as a Psy-Ops ("belonging traded for compliance") |
| Dissonance lever | A B | ◐ | Dark psychology tactics |
| Commitment escalation | A | ◐ | Dark psychology tactics (foot-in-the-door) |
| Learned helplessness | A T | ◐ | Dark psychology tactics |
| Blame inversion | B | ◐ | Dark psychology tactics (blame shifting, weaponized apology) |
| Fear-then-relief | A B | ◐ | Dark psychology tactics; counts only after a threat beat in the previous two sentences |
| Obligation injection | A | ○ | Errorfect ("who issued this obligation?") |
| Manufactured consensus | B | ◐ | ψ "synthetic consensus" |
| Agent deletion | T | ● | standard linguistics |
| Identity capture | B A | ● | ψ(cell), ψ(seal) |
| False binary | T | ◐ | |
| Urgency and scarcity | A | ○ | |
| Threat coding | B A | ○ | Errorfect "threat coding" |
| Dehumanization | B T | ◐ | |
| Us/them partition | B | ◐ | |
| Perception invalidation | T | ◐ | |
| Cost minimizer | A | ◐ | |
| Thought-terminating cliché | T | ◐ | |
| Borrowed authority | B | ◐ | |
| Embedded suggestion | T A | ● | |
| Manufactured inevitability | B | ◐ | |
| Guilt and debt leverage | A | ◐ | |
| Absolutes | B | ○ | |
| Euphemistic anesthesia | T | ● | |
| Leading question | B | ◐ | |
| Flattery hook | B | ● | |
| Deniable insinuation | B | ● | |
| Moral loading | B | ◐ | |
| Conditional worth | B A | ● | |
| Machine-directed instruction | A | ● | hidden layer |

Each mechanism comes with what it *does* and a counter-question that makes it show its units. The definitions live in `engine.js`. To add a mechanism, add an entry to `MECHANISMS`; the scan, UI, report and tests pick it up automatically.

## Epistemic boundaries

Undertow honors the same limits as the white paper (§7) and the ψ framework:

- **Signals, not verdicts.** It detects mechanisms, not intent. Many of these moves are also used innocently, and persuasion is not manipulation by default.
- **Visibility, not censorship.** The recommendation is always to verify, never to reject or suppress.
- **Rules miss paraphrase and over-flag some ordinary usage.** The deep read lists the rule hits that are ordinary usage, and it names its own uncertainty.
- **The A-probes are subjective cognitive probes, not decodings,** exactly as in the white paper.
- **Several mechanisms come from a popular-psychology catalogue** ("Dark psychology tactics"). They are used here as detectable *language patterns*, not as established clinical categories.

## Files

| File | |
|---|---|
| `engine.js` | Detection engine and lexicon (no dependencies, browser + Node) |
| `deep.js` | Claude deep-read request, schema, parsing, Markdown |
| `index.html` | Browser tool |
| `cli.js` | Command line |
| `worker/` | Hosted deep-read proxy (Cloudflare Worker) |
| `samples/` | Calibration specimens (fictional) |
| `test/` | Engine, deep-read mock and proxy tests; `hosted-smoke.mjs` for the live proxy |
