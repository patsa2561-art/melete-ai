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

**3) API — connect your real process (air-gapped):**
```bash
POST /next             { space, observations }              → the next setting to try
POST /aegis            { space, objective, budget }         → the best ROBUST setting (survives wobble)
POST /discover         { space, objective, budget }         → full run + signed Sovereign Verdict + Replay Token
POST /sovereign/verify { …verdict }                         → re-verify provenance OFFLINE
POST /replay/verify    { …token }                           → re-derive the decision step-by-step OFFLINE
```
…or call the library directly: `import { sovereignAnalyze, aegisDiscover, proposeNext } from "melete-ai"`.

## What's inside — 43 engines, 4 layers
| | layer | what it does |
|---|---|---|
| 🔍 | **DISCOVER** | find the best setting in the fewest tries (adaptive ensemble) |
| ◆ | **DECIDE** | the Φ brain's safety-first verdict + 🛡 AEGIS, the *robust* answer (not the fragile spike) |
| 🔬 | **DIAGNOSE** | plain-language *why*: which knobs matter, where the cliffs are, the shape, the achievable ceiling |
| 👑 | **CERTIFY** | an Ed25519 **Sovereign Verdict** + a **Replay Token** — signed, offline-verifiable, step-by-step replayable |

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
