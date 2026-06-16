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
> **62 independently-verified modules.** Every claim below is a check you can re-run: `npx melete-ai gauntlet`.

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
| 🛡 **Tolerance Certificate** | the certified **±tolerance** that still keeps ≥90% of the optimum — a worst-case **Lipschitz guarantee**, not an average. *(8400/8400 off-grid adversarial samples held the floor)* |
| 📜 **Proof of Improvement** | switching from setting A to recipe B is a **proven gain of ≥Δ** — noise-aware 97.5% lower bound; refuses within noise. **Common-random-numbers pairing** certifies the same gain from **~8× fewer measurements**; **sequential early-stopping** (Bonferroni α-split) stops the moment the gain is certified — **~1.9× fewer on average** (41.9 vs 80). *(Δ valid ≥97.5%, false-cert ≤2.5%)* |
| 🔐 **Pre-Registration** | **commit** the objective, space, budget &amp; decision rule **before** running, then prove the result obeyed it — **no goalpost-moving, no cherry-picking**. *(6 deviation classes all rejected; the scientific-integrity layer)* |
| 🪨 **Decision-Breakdown** | how many measurements would an adversary (fraud, a glitchy sensor) have to **corrupt to flip** your "B beats A" verdict? The **exact tamper-distance** — a strong clean call survives many corruptions, a marginal one flips on one. The cert **ships the explicit minimal attack** (a witness you re-apply), takes an **arbitrary adversary range** (real sensor/physical bounds), and a stronger adversary provably never raises the count. *(witness truly flips 100%; monotone 100%; an inflated claim caught 100%)* |
| 📉 **Winner's Curse** | you searched N settings and reported the best — but that number is **inflated** (it's the max of N noisy trials, partly luck). The signed **selection correction**: the winner's TRUE value is **≥ this de-biased lower bound**, the discount **grows with N**, and it works with **σ unknown** (estimated from replicates, *studentized*). *(valid bound ≥97.5%, measured 99.5%; with σ estimated a plain plug-in breaks at 94.9% — studentized holds 99.3%; naive overstates 90%)* |
| 🧭 **Extrapolation-Guard** | is the recommended setting **inside the data you measured**, or a blind **extrapolation**? It's flagged with an **exact separating-hyperplane witness** — proof it's outside the **convex hull** of your evidence, in *any* direction (not just out-of-box; it catches an in-box point that's off a correlated-knob manifold, which an axis test misses) — plus a density signal for interior voids. *(out-of-box & in-box-off-hull → flagged 100% with a valid, re-verifiable witness; never false-flags an in-data point; a fake "supported" is caught)* |
| 📊 **False-Discovery Control** *(new)* | report *K* findings at once and some are pure luck. **Benjamini-Hochberg** controls the **fraction of your reported discoveries that are false** at a target *q*, and drops the naive "findings" that don't survive — the multiple-testing layer for sensitivity sweeps & multi-metric reports. *(realized false-discovery proportion ≤ q, measured 7.6% ≤ 10%; naive inflates to 13%; still recovers 89% of real effects; a forged discovery is caught)* |
| ⬛ **Null Engine** | brave enough to say *"there's nothing to find"* on pure noise |
| 👑 **Sovereign Verdict + ⏪ Replay** | Ed25519-signed, deterministic, re-derivable on any machine, forever |

<details><summary><b>How to use →</b></summary>

```bash
curl -X POST https://melete.mneme-ai.space/trust-certificate -d '{"scenario":"good"}'
curl -X POST https://melete.mneme-ai.space/stability         -d '{"scenario":"easy"}'
curl -X POST https://melete.mneme-ai.space/honest-search     -d '{"seed":3}'   # genuine VERIFIES, a fake is REJECTED
curl -X POST https://melete.mneme-ai.space/tolerance         -d '{"scenario":"broad"}'   # certified ±tolerance
curl -X POST https://melete.mneme-ai.space/improvement       -d '{"seed":7}'            # certified gain A→B (independent vs CRN-paired)
curl -X POST https://melete.mneme-ai.space/prereg            -d '{"seed":3}'            # genuine CONFORMS, a cherry-picked run is REJECTED
npx melete-ai poopt proof-of-optimization.json   # verify any signed certificate offline
```
</details>

### 🔬 Diagnose — plain-language *why*
| lens | tells you |
|---|---|
| **Sensitivity · cliffs · shape** | which knobs matter, where it breaks, the response shape |
| **Ceiling · drift** | the achievable best, and whether results drift over time |

### 🔌 Integrate
`npm i melete-ai` · CLI `npx melete-ai …` · HTTP `https://melete.mneme-ai.space` — `/next` `/discover` `/trust-certificate` `/stability` `/honest-search` `/tolerance` `/improvement` `/prereg` `/breakdown` `/selection` `/support` `/fdr` `/verify`

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
