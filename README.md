# Melete — the Self-Driving Discovery Brain

> **Mneme remembers; Melete discovers.**
> A closed-loop engine that proposes the next best experiment, reads the result from **any** pluggable oracle, learns, and converges — recording every step as a **signed, offline-verifiable discovery trace**.

Melete (Μελέτη) is one of the three original Greek muses — the muse of **practice and experimentation**. The sister of Mneme (memory). This is her brain.

---

## Why this exists

Producing hypotheses is cheap now. The expensive, scarce thing in real discovery is the **experiment** — each assay, each robot run, each training run, each costly A/B test burns time and money. So the question that matters is:

> **What is the single most informative experiment to run next — and can you prove how you got there?**

Melete answers both. It is **not** a wet-lab automation product and it does **not** need a robot. It is the *decision brain* that any expensive evaluation process plugs into.

## What makes it a moat (honest version)

Self-driving labs and Bayesian optimisation already exist — so "automated lab" is **not** novel, and we don't claim it. Melete's defensible composition is:

1. **Pluggable oracle — everything is `f(x)`.** The brain doesn't care whether the oracle is a simulation, a lab robot over HTTP, a factory process, a hyperparameter trainer, or an **LLM grading a qualitative result**. `f(x) = score(run(x))` turns *anything scorable* into an optimisable experiment. The market is far larger than chemistry.
2. **Cryptographic discovery trace.** Every hypothesis → observation → update is **Ed25519-signed and hash-chained**. Anyone can verify **offline**, with the public key alone, that the discovery path is authentic, unaltered, and in order. In a field with a replication crisis (p-hacking, data ghosting), *provable* provenance-of-discovery is worth a great deal — for patents, audits, journals, acquisitions. **No optimiser or lab ships this.**
3. **Deterministic + reproducible.** Same seed + same oracle ⇒ identical run ⇒ the signed trace actually means something.

---

## Install

```bash
npm install melete-ai          # library
# or use the CLI directly:
npx melete-ai bench
```

## CLI

```bash
melete bench                   # prove the brain beats random/grid (measured)
melete gauntlet                # run every module's correctness gauntlet (must be 100/100)
melete discover --demo         # run a discovery on the built-in surface + write a signed trace
melete discover --objective "-(x-3)**2-(y+1)**2" --goal maximize --budget 50
melete verify melete-trace.json   # re-verify a discovery trace OFFLINE
```

## Library

```ts
import { discoverSigned, verifyTrace, scoredOracle } from "melete-ai";

// 1. define WHAT you can measure (here: an LLM/benchmark grading whatever run() produces)
const oracle = scoredOracle(
  (x) => buildAndRun(x),          // produce an artifact for experiment x (async, expensive)
  (artifact) => grade(artifact),  // score it → a single number
);

// 2. let the brain discover the best x in as few experiments as possible — with a signed trail
const { result, trace } = await discoverSigned({
  space: { dims: [
    { name: "temperature", type: "real", min: 0, max: 1 },
    { name: "depth",       type: "int",  min: 1, max: 12 },
  ]},
  oracle,
  budget: 40,            // never run more than 40 (expensive!) experiments
  goal: "maximize",
  engine: "bayes",       // the proven core engine
});

console.log(result.best);                 // { experiment, value }
console.log(verifyTrace(trace).ok);       // true — provenance verifies offline
```

## Plugging in a real lab / process

```ts
import { httpOracle, meteredOracle } from "melete-ai";
const robot = meteredOracle(httpOracle("https://lab.internal/run"), 100);  // hard budget of 100 runs
// POSTs { experiment } → expects { result: <number> }. The brain is unchanged.
```

---

## Architecture

```
  discoverSigned(opts)
        │
        ├── engine: bayes  ──► closed loop: propose → observe → update → converge   [proven core]
        │       (Gaussian-kernel surrogate + UCB acquisition, exploration anneals)
        ├── engine: resonance ─► Melete Resonance Field — a novel non-Bayesian wave-      [experimental]
        │       interference optimiser. Ships, runs, deterministic — but see HONESTY below.
        │
        ├── Tracer ──► every step Ed25519-signed + sha-256 hash-chained
        │
        ▼
  Pluggable Oracle  f(x)
        ├── simOracle(fn)              — simulation / benchmark / test
        ├── scoredOracle(run, score)   — EVERYTHING IS f(x): compile+bench, render+rate, prompt+judge…
        ├── compositeOracle([...])     — weighted multi-objective (yield − cost − toxicity)
        └── httpOracle(url)            — a lab robot / industrial service / training cluster
```

Every module ships an `xGauntlet()` returning `0 | 100`; `meleteGauntlet()` requires **all** of them at 100.

## Measured proof (`melete bench`)

On a smooth multimodal surface, experiments needed to reach 99% of the optimum (lower = better):

| method | experiments to optimum |
|---|---|
| **Melete brain (bayes core)** | **~26** |
| random search (avg) | ~95 |
| systematic grid | did not reach within budget |

≈ **3.7× more sample-efficient than random.** Each saved experiment is saved reagents / robot-time / money.

## ⚠️ Honesty (DIAKRISIS)

- The **`bayes` core engine works and is the default.** The numbers above are measured + reproducible (`melete bench`).
- The **`resonance` engine is experimental.** It is a genuinely original, deterministic, non-Bayesian mechanism — but head-to-head it does **not** currently beat the core on smooth single-peak surfaces (a greedy interference attractor escapes a bad cold-start slower than UCB exploration). It is shipped, clearly labelled, as open research. We do **not** claim it is a breakthrough.
- The surrogate is a lightweight kernel model, not a full Gaussian process; it is strong on smooth-ish surfaces, and heavier surrogates are an open slot in the architecture.
- "Provenance" proves the **path** (authentic, unaltered, reproducible) — it does not, by itself, prove the **science** is correct. It removes the "did you fake/forget how you got here?" question, which is the one that wrecks replication.

## License

MIT
