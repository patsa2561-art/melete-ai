# Melete — the Self-Driving Discovery Brain

**Find the best settings for any expensive-to-test process in the fewest experiments — with a signed proof.**
Live: **https://melete.mneme-ai.space**

When every experiment costs real money or time (a lab assay, a wafer run, a GPU sweep, a fraud model), you can't try everything. Melete proposes the next experiment to run, you measure it, and it converges to the best — then signs a certificate anyone can verify offline.

## Why it's different
- 🧪 **No formula, no code.** Tell it what you can change (pH, temperature, …); it tells you what to try next. You measure the real result and type the score.
- 🛑 **Knows when to stop.** It tells you when more experiments won't be worth the cost.
- 🧬 **Multi-objective.** Optimize potency *and* stability *and* cost at once — get the Pareto front of trade-offs.
- 🔒 **Air-gapped + signed.** Runs fully offline; every result carries an Ed25519 **Proof of Optimization** anyone verifies without trusting us.

## Quick start
**Web:** open the live site, pick your field (Pharma · Semiconductor · Fintech · AI safety · …), follow the 4-step loop.

**CLI:**
```bash
npm i -g melete-ai
melete bench         # measured: beats random/grid search
melete multi         # multi-objective demo → the Pareto front
melete gauntlet      # every module's correctness check (must be 100)
melete poopt c.json  # verify a Proof of Optimization offline
```

**API (connect your real process):**
```
POST /next         { space, observations }         → next experiment to try
POST /next-multi   { space, goals, observations }  → next + the Pareto front
POST /poopt/verify { …cert }                       → verify offline, no trust needed
```

## The loop
1. Tell Melete what you can change (or pick your field)
2. It proposes the exact next setting to try
3. You run it for real and type the score you measured
4. Repeat ~20–40× → best config + a signed, verifiable proof

## Honest by design
Melete is an **optimizer**, not a fortune-teller. Efficiency and Pareto results are exact and reproducible; the optimality bound is conditional (stated on the certificate). Run `melete gauntlet` — every claim is a check you can re-run.

MIT-licensed · zero runtime dependencies
