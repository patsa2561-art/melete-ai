/**
 * 🛰 NOISE-ROBUST DISCOVERY — the engine that doesn't get fooled by luck.
 *
 * Every ordinary optimizer trusts the single highest reading it ever saw. In a deterministic lab that's fine.
 * But run Melete as a 24/7 service on a real system — a satellite link in a solar storm, a database under a
 * traffic spike, an assay with batch-to-batch drift — and the measurements are NOISY: the SAME setting can
 * read 99% one second and 40% the next. A naive optimizer locks onto a setting that got one lucky high
 * reading and then collapses in production. That is the single most expensive failure mode in real Bayesian
 * optimization.
 *
 * NOISE-ROBUST fixes it the honest way:
 *   1. REPLICATE — it re-measures each candidate several times to estimate not just the mean μ but the
 *      spread σ. Noise is HETEROSCEDASTIC (different in different regions), so σ is estimated PER POINT from
 *      that point's own replicates — never assumed global.
 *   2. RACE (LUCB) — it spends extra measurements where it matters: tightening the confidence interval of the
 *      current leader and its closest challenger, so the winner is decided by evidence, not by a single fluke.
 *   3. SELECT BY TRUST — the winner is the point with the highest LOWER confidence bound (μ − z·σ/√n): the
 *      value you can actually rely on. A lucky spike with huge σ has a low LCB and loses; a genuinely good,
 *      quiet setting wins. It also reports the "lucky max" (the naive answer) it rejected and a per-point risk
 *      band, so a human/dashboard can see the noise it filtered.
 *
 * Honest by construction (DIAKRISIS): σ is measured from real replicates, not modelled from a prior; the
 * guarantee is statistical (it needs a few replicates per point) and the gauntlet proves it on a deliberately
 * noisy landscape where a high-variance trap occasionally out-reads the true optimum — NOISE-ROBUST picks the
 * trustworthy optimum ≥97.5% of seeds while a naive max-picker is fooled most of the time. Distinct from
 * AEGIS (which is robust to INPUT wobble / landscape geometry); this is robust to OUTPUT measurement noise.
 */
import { type Space, type Experiment, lcg } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

const HB = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
const hal = (k: number, b: number) => { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const dist = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

export interface RobustPoint { experiment: Experiment; mean: number; std: number; n: number; lcb: number; ucb: number; }
export interface NoiseRobustResult {
  best: Observation;            // the TRUSTWORTHY optimum (highest lower-confidence-bound)
  bestMean: number; bestStd: number; bestN: number; bestLcb: number;
  luckyMax: Observation;        // the single highest reading — what a naive optimizer would hand you
  rejectedLucky: boolean;       // true if robust selection refused the lucky max (it was a noise fluke)
  noiseFiltered: number;        // how much apparent score the lucky max had over the trustworthy pick
  points: RobustPoint[];        // per-point μ/σ/n + risk band (for the live robustness monitor)
  evaluations: number;
}

interface Arm { p: number[]; n: number; mean: number; M2: number; maxRaw: number; maxObs: Observation; }

/**
 * Noise-robust discovery on a stochastic oracle. `replicates` = initial measurements per candidate (≥3);
 * `z` = confidence multiplier for the lower bound (higher = more conservative / trust-demanding).
 */
export function noiseRobustDiscover(opts: { space: Space; oracle: (e: Experiment) => number; budget: number; goal?: Goal; seed?: number; z?: number; replicates?: number }): NoiseRobustResult {
  const goal = opts.goal ?? "maximize"; const sgn = goal === "minimize" ? -1 : 1;
  const budget = Math.max(6, Math.floor(opts.budget)); const seed = (opts.seed ?? 1) | 0;
  const z = opts.z ?? 1.85; const r0 = Math.max(3, Math.floor(opts.replicates ?? 5));
  const dims = opts.space.dims, D = dims.length;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toE = (v: number[]): Experiment => { const e: Experiment = {}; dims.forEach((d, i) => { let x = lo(i) + v[i] * (hi(i) - lo(i)); if (d.type === "int") x = Math.round(x); e[d.name] = x; }); return e; };
  const rnd = lcg((seed >>> 0) || 1);

  const arms: Arm[] = [];
  let evals = 0;
  // one measurement of arm a (in sgn-space so we always "maximize"); Welford running mean/variance
  const measure = (a: Arm) => {
    const e = toE(a.p); const raw = opts.oracle(e); const v = sgn * raw; evals++;
    a.n++; const d = v - a.mean; a.mean += d / a.n; a.M2 += d * (v - a.mean);
    if (raw * sgn > a.maxRaw * sgn || a.n === 1) { a.maxRaw = raw; a.maxObs = { experiment: e, value: raw }; }
  };
  const newArm = (p: number[], reps: number) => { const a: Arm = { p, n: 0, mean: 0, M2: 0, maxRaw: -Infinity * sgn, maxObs: { experiment: toE(p), value: 0 } }; arms.push(a); for (let k = 0; k < reps && evals < budget; k++) measure(a); return a; };
  const std = (a: Arm) => (a.n > 1 ? Math.sqrt(Math.max(0, a.M2 / (a.n - 1))) : 0);
  // a small noise floor (a fraction of the spread of arm-means) so a single-region with 0 sampled variance
  // can't masquerade as perfectly certain; keeps the LCB honest when replicates are few.
  const noiseFloor = () => { if (arms.length < 2) return 0; const ms = arms.map((a) => a.mean); const sp = Math.max(...ms) - Math.min(...ms); return sp * 0.04; };
  const se = (a: Arm, floor: number) => Math.max(std(a), floor) / Math.sqrt(a.n);
  const lcbOf = (a: Arm, floor: number) => a.mean - z * se(a, floor);
  const ucbOf = (a: Arm, floor: number) => a.mean + z * se(a, floor);

  // PHASE 1 — space-filling seeds, each replicated r0 times so every arm starts with a real σ estimate
  const seeds = Math.max(6, Math.min(16, Math.round(budget / (r0 * 2))));
  for (let k = 0; k < seeds && evals < budget; k++) { const p: number[] = []; for (let d = 0; d < D; d++) p.push(hal(k * 5 + 1, HB[d % HB.length])); newArm(p, r0); }

  // PHASE 2 — LUCB race + local refine, until the measurement budget is spent
  let refineTick = 0;
  while (evals < budget) {
    const floor = noiseFloor();
    let leader = arms[0], li = 0; for (let i = 1; i < arms.length; i++) if (lcbOf(arms[i], floor) > lcbOf(leader, floor)) { leader = arms[i]; li = i; }
    let chal: Arm | null = null; for (let i = 0; i < arms.length; i++) { if (i === li) continue; if (!chal || ucbOf(arms[i], floor) > ucbOf(chal, floor)) chal = arms[i]; }
    // every few rounds, open a NEW candidate near the current leader (refine) + an exploratory one (don't miss a region)
    if ((refineTick++ % 3) === 2 && evals + r0 <= budget) {
      const near = leader.p.map((x) => Math.max(0, Math.min(1, x + (rnd() - 0.5) * 0.16)));
      newArm(near, r0);
      continue;
    }
    // LUCB: tighten the leader (by LCB) and the challenger (by UCB) — decide the winner by evidence
    measure(leader);
    if (chal && evals < budget) measure(chal);
  }

  // SELECT — highest lower-confidence-bound = the value you can trust
  const floor = noiseFloor();
  let best = arms[0]; for (const a of arms) if (lcbOf(a, floor) > lcbOf(best, floor)) best = a;
  // the naive answer: the single highest raw reading anyone ever saw
  let lucky = arms[0]; for (const a of arms) if (a.maxRaw * sgn > lucky.maxRaw * sgn) lucky = a;

  const points: RobustPoint[] = arms.map((a) => ({ experiment: toE(a.p), mean: +(sgn * a.mean).toFixed(4), std: +std(a).toFixed(4), n: a.n, lcb: +(sgn * lcbOf(a, floor)).toFixed(4), ucb: +(sgn * ucbOf(a, floor)).toFixed(4) }))
    .sort((p, q) => sgn * (q.lcb - p.lcb));
  const bestObs: Observation = { experiment: toE(best.p), value: +(sgn * best.mean).toFixed(4) };
  const rejected = JSON.stringify(best.p) !== JSON.stringify(lucky.p);
  return {
    best: bestObs,
    bestMean: +(sgn * best.mean).toFixed(4), bestStd: +std(best).toFixed(4), bestN: best.n, bestLcb: +(sgn * lcbOf(best, floor)).toFixed(4),
    luckyMax: lucky.maxObs, rejectedLucky: rejected,
    noiseFiltered: +Math.abs(lucky.maxRaw - sgn * best.mean).toFixed(4),
    points, evaluations: evals,
  };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
// A deliberately noisy 2-D landscape: a TRAP at (0.8,0.8) whose TRUE mean is mediocre but whose noise is HUGE
// (it occasionally reads higher than anything else — pure luck), and the REAL optimum at (0.3,0.3) with a high
// true mean and LOW noise. A naive max-of-readings is repeatedly fooled by the trap; NOISE-ROBUST must pick the
// real optimum ≥97.5% of seeds. The claim is statistical, so it is measured over many independent seeds.
export function noiseRobustGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const trueMean = (x: number, y: number) => {
    const real = 0.9 * Math.exp(-(((x - 0.3) ** 2) + ((y - 0.3) ** 2)) / 0.05);    // the genuine optimum (quiet)
    const trap = 0.62 * Math.exp(-(((x - 0.8) ** 2) + ((y - 0.8) ** 2)) / 0.05);   // mediocre true value (loud)
    return Math.max(real, trap);
  };
  const noiseStd = (x: number, y: number) => 0.05 + 0.85 * Math.exp(-(((x - 0.8) ** 2) + ((y - 0.8) ** 2)) / 0.05); // huge noise at the trap
  // a deterministic noisy oracle per seed (gaussian via Box–Muller from a seeded LCG)
  const makeOracle = (s: number) => { const r = lcg((s >>> 0) || 1); return (e: Experiment) => { const x = e.x ?? 0, y = e.y ?? 0; const u1 = Math.max(1e-9, r()), u2 = r(); const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); return trueMean(x, y) + noiseStd(x, y) * g; }; };
  const inReal = (e: Experiment) => Math.hypot((e.x ?? 0) - 0.3, (e.y ?? 0) - 0.3) < 0.22;
  const inTrap = (e: Experiment) => Math.hypot((e.x ?? 0) - 0.8, (e.y ?? 0) - 0.8) < 0.22;

  const SEEDS = 200; let robustHits = 0, naiveHits = 0, rejected = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const oracle = makeOracle(s * 1009 + 7);
    const res = noiseRobustDiscover({ space, oracle, budget: 220, goal: "maximize", seed: s, z: 1.85, replicates: 6 });
    if (inReal(res.best.experiment)) robustHits++;
    if (inReal(res.luckyMax.experiment)) naiveHits++;     // how often the NAIVE max happens to land in the real optimum
    if (res.rejectedLucky) rejected++;
  }
  const robustRate = robustHits / SEEDS;     // point estimate
  const naiveRate = naiveHits / SEEDS;       // the naive max-picker is fooled by the loud trap much of the time
  // honest statistical claim: require the Wilson 95% LOWER bound ≥ 97.5% (not just the point estimate)
  const wilsonLB = (p: number, n: number) => { const zz = 1.96; const d = 1 + zz * zz / n; return (p + zz * zz / (2 * n) - zz * Math.sqrt(p * (1 - p) / n + zz * zz / (4 * n * n))) / d; };
  const robustLB = wilsonLB(robustRate, SEEDS);

  // goal-direction sanity: on a MINIMIZE problem, noise-robust must pick the quiet LOW-value optimum, not a
  // lucky low single reading at the high-variance trap.
  const trueMeanMin = (x: number, y: number) => 0.9
    - 0.8 * Math.exp(-(((x - 0.3) ** 2) + ((y - 0.3) ** 2)) / 0.05)    // genuine LOW optimum at (0.3,0.3): 0.1
    - 0.4 * Math.exp(-(((x - 0.8) ** 2) + ((y - 0.8) ** 2)) / 0.05);   // mediocre dip at the loud trap: 0.5
  const minOracle = (s: number) => { const r = lcg((s >>> 0) || 1); return (e: Experiment) => { const x = e.x ?? 0, y = e.y ?? 0; const u1 = Math.max(1e-9, r()), u2 = r(); const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); return trueMeanMin(x, y) + noiseStd(x, y) * g; }; };
  let minHits = 0; const MS = 30;
  for (let s = 1; s <= MS; s++) { const res = noiseRobustDiscover({ space, oracle: minOracle(s * 31 + 3), budget: 180, goal: "minimize", seed: s, z: 1.85, replicates: 6 }); if (inReal(res.best.experiment)) minHits++; }
  const minOk = minHits / MS >= 0.9;

  // determinism + heteroscedastic estimate sanity (the trap really reads as higher-variance than the optimum)
  const o1 = makeOracle(123); const a = noiseRobustDiscover({ space, oracle: o1, budget: 120, seed: 5, z: 1.85, replicates: 6 });
  const o2 = makeOracle(123); const b = noiseRobustDiscover({ space, oracle: o2, budget: 120, seed: 5, z: 1.85, replicates: 6 });
  const det = JSON.stringify(a.best.experiment) === JSON.stringify(b.best.experiment) && a.bestLcb === b.bestLcb;
  const trapPt = a.points.find((p) => inTrap(p.experiment)); const realPt = a.points.find((p) => inReal(p.experiment));
  const heteroSeen = !!(trapPt && realPt) && trapPt.std > realPt.std;          // σ is genuinely higher at the trap
  const total = (() => { try { noiseRobustDiscover({ space, oracle: () => 0, budget: 8 }); noiseRobustDiscover({ space: { dims: [{ name: "x", type: "real", min: 0, max: 1 }] }, oracle: () => 1, budget: 10 }); return true; } catch { return false; } })();

  const checks = [
    { name: "PICKS-TRUSTWORTHY-OPTIMUM-≥97.5%(Wilson-LB)", pass: robustLB >= 0.975, detail: `noise-robust picked the real (quiet) optimum in ${robustHits}/${SEEDS} seeds = ${(robustRate * 100).toFixed(1)}% · Wilson-95%-LB ${(robustLB * 100).toFixed(1)}% (target LB ≥97.5%)` },
    { name: "BEATS-THE-NAIVE-MAX-PICKER", pass: robustRate >= naiveRate + 0.2, detail: `robust ${(robustRate * 100).toFixed(1)}% vs a naive single-reading max ${(naiveRate * 100).toFixed(1)}% — it filters the lucky trap` },
    { name: "REJECTS-THE-LUCKY-SPIKE", pass: rejected >= Math.ceil(SEEDS * 0.5), detail: `robust selection refused the lucky single-reading max in ${rejected}/${SEEDS} seeds` },
    { name: "WORKS-ON-MINIMIZE-TOO", pass: minOk, detail: `minimize goal: picked the quiet low optimum in ${minHits}/${MS} seeds (≥90%)` },
    { name: "HETEROSCEDASTIC-σ-ESTIMATED", pass: heteroSeen, detail: trapPt && realPt ? `measured σ at the trap ${trapPt.std} > σ at the optimum ${realPt.std}` : "n/a" },
    { name: "DETERMINISTIC", pass: det, detail: "same seed + same noisy oracle → identical trustworthy optimum" },
    { name: "TOTAL", pass: total, detail: "flat oracle / 1-D / tiny budget never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
