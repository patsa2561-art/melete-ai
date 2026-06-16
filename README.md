<div align="center">

<img src="assets/meli.svg" alt="Meli — the Melete mascot" width="130" />

# Melete

### The Sovereign Verifiable AI Analyst &amp; Optimizer

**Find the best — and most *robust* — settings for any system you can measure, in the fewest experiments — then hand over a signed verdict anyone can re-verify offline.**

🌐 Live demo → **[melete.mneme-ai.space](https://melete.mneme-ai.space)**

`MIT` · zero runtime dependencies · runs on your machine

</div>

---

## What it is (in one line)
You have a system you can **measure** — an ML pipeline, a server/DB/network config, a recipe, a simulation. Melete proposes the next setting to try, you measure it (or give a formula), and it converges to the best **stable** answer — then explains *why* in plain language and signs a verdict you (or an auditor) can re-check offline. **Your data never leaves your machine.**

## Use it in 60 seconds — 3 ways

**1) Through the website (no code).** Open the [live demo](https://melete.mneme-ai.space), pick your field (Pharma · Semiconductor · AI/ML · …), press **Watch** to see it discover, or use **guided mode**: it proposes → you measure in real life → you type the score → repeat.

**2) CLI / npm (on your own machine):**
```bash
npm i -g melete-ai
melete bench            # measured: beats random / grid search
melete gauntlet         # every engine's correctness check (must be 100)
melete poopt cert.json  # verify a signed certificate offline
```

**3) API — connect your real process (air-gapped).**
First, get an endpoint to call — two options:
```bash
# A) hosted demo (quick try):        base URL = https://melete.mneme-ai.space
# B) self-host (sovereign — data never leaves your machine):
npm i -g melete-ai
melete-server                         # → serves on http://localhost:8790
```
Then POST to that base URL:
```bash
POST /next             { space, observations }              → the next setting to try
POST /aegis            { space, objective, budget }         → the best ROBUST setting (survives wobble)
POST /discover         { space, objective, budget }         → full run + signed Sovereign Verdict + Replay Token
POST /sovereign/verify { …verdict }                         → re-verify provenance OFFLINE
POST /replay/verify    { …token }                           → re-derive the decision step-by-step OFFLINE
```
…or skip HTTP entirely and call the library in-process: `import { sovereignAnalyze, aegisDiscover, proposeNext } from "melete-ai"`.

## ✦ What's inside — by category
> **56 independently-verified modules.** Every claim below is a check you can re-run: `npx melete-ai gauntlet`.

### 🔍 Optimize — the best setting in the fewest experiments
| capability | what it does |
|---|---|
| **Adaptive discovery** | a portfolio of search strategies reaches **99% of the optimum in ≈12 experiments — ≈8× fewer than random** *(measured over 300 seeds: avg 12.2, 300/300 reached; `melete bench`)* |
| **Mixed spaces** | real · integer · categorical · conditional knobs, not just dials |
| **Multi-objective** | the Pareto front of best trade-offs (yield **and** cost) |
| **Noise-robust** | the value you can trust under measurement noise, not a lucky spike |

<details><summary><b>How to use →</b></summary>

```js
import { proposeNext } from "melete-ai";          // loop: propose → you measure → repeat
const { next } = proposeNext({ space:[{name:"pH",type:"real",min:3,max:9}], observations:obs, goal:"maximize" });
```
Hosted, no install: `POST https://melete.mneme-ai.space/next`
</details>

### 🛡 Trust & verify — the honesty stack *(no other optimizer ships this)*
| certificate | the question it answers — **signed, offline-verifiable** |
|---|---|
| 🏅 **Trustworthy Discovery** | is it **REAL** (not noise) · **CAUSAL** (not confounded) · **ROBUST** (survives wobble)? |
| 🏔 **Stability** | is the optimum **reproducible**, or a lucky one-off? *(STABLE ⇒ reproduced ≥97.5%, measured)* |
| 💎 **Honest-Search Proof** | is this a **GENUINE** search or a **FAKED** one? Re-derive the trace offline (no oracle) — a forgery is rejected. *(360/360 forgeries caught; something an LLM cannot do)* |
| 🛡 **Tolerance Certificate** *(new)* | the certified **±tolerance** that still keeps ≥90% of the optimum — a worst-case **Lipschitz guarantee**, not an average. *(8400/8400 off-grid adversarial samples held the floor)* |
| ⬛ **Null Engine** | brave enough to say *"there's nothing to find"* on pure noise |
| 👑 **Sovereign Verdict + ⏪ Replay** | Ed25519-signed, deterministic, re-derivable on any machine, forever |

<details><summary><b>How to use →</b></summary>

```bash
curl -X POST https://melete.mneme-ai.space/trust-certificate -d '{"scenario":"good"}'
curl -X POST https://melete.mneme-ai.space/stability         -d '{"scenario":"easy"}'
curl -X POST https://melete.mneme-ai.space/honest-search     -d '{"seed":3}'   # genuine VERIFIES, a fake is REJECTED
curl -X POST https://melete.mneme-ai.space/tolerance         -d '{"scenario":"broad"}'   # certified ±tolerance
npx melete-ai poopt proof-of-optimization.json   # verify any signed certificate offline
```
</details>

### 🔬 Diagnose — plain-language *why*
| lens | tells you |
|---|---|
| **Sensitivity · cliffs · shape** | which knobs matter, where it breaks, the response shape |
| **Ceiling · drift** | the achievable best, and whether results drift over time |

### 🔌 Integrate
`npm i melete-ai` · CLI `npx melete-ai …` · HTTP `https://melete.mneme-ai.space` — `/next` `/discover` `/trust-certificate` `/stability` `/honest-search` `/tolerance` `/verify`

## The moat
- 🔒 **Sovereign** — runs air-gapped, on your machine; data never touches a cloud.
- 👑 **Verifiable** — every verdict is Ed25519-signed; an auditor re-verifies it offline with the embedded public key, no trust in us required.
- ⏪ **Replayable** — the engine is fully deterministic, so a signed Replay Token re-derives the exact decision, step by step, on any machine, forever.

## Honest by design (DIAKRISIS)
Melete is an **optimizer + analyst**, not a fortune-teller. "Verifiable" means **provenance + reproducibility** — proof of *what was tested and the result reached, unaltered and re-derivable* — **not** a proof that your code is bug-free or exploit-free (that is undecidable in general; we don't claim it). Efficiency, robustness, and Pareto results are exact and reproducible. Run `melete gauntlet` — every claim is a check you can re-run.

---

<div align="center">
<sub>Mneme remembers; Melete discovers. · <a href="https://melete.mneme-ai.space/pitch">pitch</a> · <a href="https://melete.mneme-ai.space/docs">API docs</a></sub>
</div>
