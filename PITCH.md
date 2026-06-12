# Melete — investor / acquirer brief

> **The Self-Driving Discovery Brain.** Mneme remembers; Melete discovers.
> Live demo: **https://melete.161.35.122.73.nip.io**

---

## 1. The problem

In every R&D-heavy field — drug discovery, materials, semiconductors, ML training, industrial process —
producing *ideas* is now cheap, but running the *experiment* that tests an idea is the expensive,
rate-limiting step. Each assay, robot run, training run, or pilot batch costs real time and money. Two
questions decide who wins:

1. **What is the single most informative experiment to run next?** (sample efficiency = the budget)
2. **Can you *prove* how a discovery was made?** (the field is in a replication crisis — p-hacking, data
   ghosting, unreproducible results; and IP/patents hinge on a defensible discovery record)

No one product answers both.

## 2. The product

Melete is the **decision brain** that plugs into any expensive evaluation process. It does not need a lab
or a robot — it is software.

- **SUPER NOVA engine** — a context-adaptive *ensemble*. By the No-Free-Lunch theorem no single optimiser
  wins on every landscape, so a bandit spends each experiment on whichever strategy (Gaussian-Process + EI,
  CMA-ES evolution, trust-region, simulated annealing, kernel-UCB) is winning *on this problem*. One engine,
  no per-problem re-tuning.
- **Everything is `f(x)`** — the same brain optimises a wet-lab assay, a training run, compiler flags, a
  process recipe, a price point, or an LLM-graded design. The market is far larger than any one vertical.
- **Cryptographic discovery trace** — every hypothesis → experiment → result is Ed25519-signed and
  hash-chained; anyone verifies the full discovery path **offline** with the public key alone.
- **Air-gapped by design** — zero runtime dependencies + local signing ⇒ runs fully offline on an isolated
  machine, yet the result stays provable. Built for regulated/defence/pharma where data cannot leave.

## 3. Why it's defensible (the moat)

Bayesian optimisation is commoditised; a *single* algorithm is not a moat. The defensible composition is:

| layer | why hard to copy |
|---|---|
| **Verifiable provenance-of-discovery** | no lab or optimiser ships a signed, offline-verifiable discovery trail — and it is exactly what patents, audits, and the replication crisis demand |
| **Replication attestation** | provenance proves the *path*; replication proves the *science*. Any agent re-runs just the **best point (1 experiment)** to certify another agent's whole 40-experiment discovery — cheap, portable cross-agent trust + a signed replication certificate. The replication-crisis killer; no optimiser ships it |
| **Universal `f(x)` + air-gap** | one engine across every costly-experiment domain, on-prem, data-never-leaves |
| **Robust ensemble** | adapts to the problem; measured to beat every single algorithm on rugged landscapes |
| **Accumulating signed discovery corpus** | every customer's traces compound into a proprietary prior (cortex bridge) — switching cost grows over time |

## 4. Proof (measured, reproducible — `melete bench --robust`)

Mean best reached across landscapes (higher = better):

| landscape | **PORTFOLIO** | kernel-ucb | cmaes | random |
|---|---|---|---|---|
| smooth-2D | **1.000** | 0.999 | 1.000 | 0.864 |
| **rugged-2D** | **−1.4** 🏆 | −5.5 | −2.2 | −4.2 |
| high-5D | **0.997** | 0.986 | 1.000 | 0.578 |

Sample efficiency: reaches 99% of a hidden optimum in **~26 experiments vs ~95 for random (3.7×)**. On the
rugged landscape the ensemble **beats every single algorithm**. 10 module test-gauntlets at 100/100; 32
tests. Every claim here is produced by a command you can run.

## 5. Honesty (what we do NOT claim)

- It is not a magic single algorithm and does not "disrupt quantum" — the win is **robustness + verifiable
  provenance**, both measured.
- Optimisation cannot be "100% accurate"; we ship 100%-passing correctness gauntlets and reproducible
  benchmarks, not impossible guarantees.
- The brain is the software layer; the physical lab/robot (if any) is the customer's — we plug into it.

## 6. The asset / the ask

A clean, dependency-free TypeScript codebase (engine + arms + signed-trace + pluggable oracle + HTTP
service + deploy), a live demo, full tests. Suited to an **IP acquisition / acqui-hire** by a company that
runs expensive experiments at scale (AI training, chips, materials, pharma) or sells the tooling to those
who do. Sale transfers the private repo, the npm namespace (`melete-ai`), and the founder's roadmap.

*Contact: Shinnapat Phunsriphatchalakul · kreevut@gmail.com*
