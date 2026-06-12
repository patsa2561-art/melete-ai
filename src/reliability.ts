/**
 * RELIABILITY — the falsifiable "97.5% on every landscape" bar.
 *
 * A single benchmark function proves nothing; an optimizer that wins on a smooth bowl can fail badly on a
 * deceptive, multi-trap, or high-dimensional surface. RELIABILITY runs the engine across a deliberately
 * adversarial BATTERY — smooth, many-trap (Rastrigin), deceptive (Ackley), curved-valley (Rosenbrock),
 * oscillatory (Griewank), high-dimensional, and a sharp needle — each NORMALISED so the true global
 * optimum is exactly 1.0. The score for a run is therefore literally "% of the true optimum reached".
 *
 * The bar: the engine must reach a high fraction of the true optimum on EVERY landscape, averaged over
 * several seeds — not just on average across the battery (which would let a smooth-surface win hide a
 * pathological failure). The gauntlet reports the worst landscape, so the claim is honest and falsifiable:
 * anyone can re-run it and check the per-landscape numbers.
 */
import { type Space, type Experiment } from "./space.js";
import { type Goal, type Observation } from "./engine.js";
import { portfolioDiscover } from "./portfolio.js";

export interface Landscape { name: string; space: Space; f: (e: Experiment) => number; budget: number; note: string }

/**
 * POLISH — a deterministic compass / pattern search (Hooke–Jeeves style) that follows a curved valley the
 * global explorer can only get near. From the incumbent best it probes ± a step along each axis; on an
 * improvement it keeps the move, otherwise it halves the step — so it converges into ridges (Rosenbrock)
 * that random/Bayesian sampling burns hundreds of experiments failing to nail. No randomness, no deps:
 * the local exploiter that turns "near the optimum" into "on the optimum".
 */
export function polish(space: Space, oracle: (e: Experiment) => number, start: Experiment, evals: number, goal: Goal = "maximize"): { experiment: Experiment; value: number } {
  const dims = space.dims; const n = dims.length;
  const names = dims.map((d) => d.name);
  const clampV = (i: number, v: number) => Math.max(dims[i].min ?? -Infinity, Math.min(dims[i].max ?? Infinity, v));
  const toArr = (e: Experiment) => names.map((nm) => +(e[nm] || 0));
  const toExp = (a: number[]): Experiment => { const e: Experiment = {}; a.forEach((v, i) => (e[names[i]] = clampV(i, v))); return e; };
  const sgn = goal === "minimize" ? 1 : -1;     // we MINIMISE F = sgn·f, so higher f ⇒ lower F
  let used = 0;
  const F = (a: number[]) => { used++; return sgn * oracle(toExp(a)); };
  // initial simplex: the incumbent + one axis-perturbed point per dimension
  let pts: number[][] = [toArr(start)];
  for (let i = 0; i < n; i++) { const p = toArr(start).slice(); const span = (dims[i].max ?? 1) - (dims[i].min ?? 0) || 1; p[i] = clampV(i, p[i] + 0.08 * span); pts.push(p); }
  let fv = pts.map(F);
  const order = () => { const idx = [...pts.keys()].sort((a, b) => fv[a] - fv[b]); pts = idx.map((i) => pts[i]); fv = idx.map((i) => fv[i]); };
  const A = 1, G = 2, R = 0.5, S = 0.5;          // reflect / expand / contract / shrink
  while (used < evals - 1) {
    order();
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j];
    for (let j = 0; j < n; j++) c[j] /= n;
    const worst = pts[n], fWorst = fv[n], fBest = fv[0], fSecond = fv[n - 1];
    const xr = c.map((cj, j) => clampV(j, cj + A * (cj - worst[j]))); const fr = F(xr);
    if (fr < fBest) {
      const xe = c.map((cj, j) => clampV(j, cj + G * (xr[j] - cj))); const fe = F(xe);
      if (fe < fr) { pts[n] = xe; fv[n] = fe; } else { pts[n] = xr; fv[n] = fr; }
    } else if (fr < fSecond) {
      pts[n] = xr; fv[n] = fr;
    } else {
      const xc = c.map((cj, j) => clampV(j, cj + R * (worst[j] - cj))); const fc = F(xc);
      if (fc < fWorst) { pts[n] = xc; fv[n] = fc; }
      else { for (let i = 1; i <= n && used < evals; i++) { pts[i] = pts[i].map((v, j) => clampV(j, pts[0][j] + S * (v - pts[0][j]))); fv[i] = F(pts[i]); } }
    }
  }
  order();
  return { experiment: toExp(pts[0]), value: sgn * fv[0] };
}

/**
 * RELIABLE DISCOVER — Melete's signature 3-paradigm memetic engine. Three fundamentally different searchers
 * compose into one run: (1) the self-allocating PORTFOLIO explores globally to find the right basin;
 * (2) an OPTIMISTIC LIPSCHITZ INFILL (DIRECT-style) turns Melete's own optimality certificate INTO an
 * acquisition — it samples the single point where the certified upper bound is highest, i.e. the most
 * promising unexplored region the data cannot yet rule out; (3) NELDER–MEAD polish exploits locally to nail
 * the optimum. Global basin → certificate-guided infill of the gaps → local precision. Fully deterministic
 * ⇒ reproducible + signable. The diamond (CERTIFY) is not just a report here — it steers the search.
 */
export async function reliableDiscover(opts: { space: Space; oracle: (e: Experiment) => number; budget: number; seed?: number; goal?: Goal }) {
  const goal = opts.goal ?? "maximize";
  const space = opts.space, oracle = opts.oracle, dims = space.dims, D = dims.length;
  const sgn = goal === "minimize" ? -1 : 1;
  const better = (a: number, b: number) => (goal === "minimize" ? a < b : a > b);
  const globalBudget = Math.max(8, Math.round(opts.budget * 0.30));
  const infillBudget = Math.max(0, Math.round(opts.budget * 0.20));
  const localBudget = Math.max(8, opts.budget - globalBudget - infillBudget);
  // PHASE 1 — global explore (find the basin)
  const g = await portfolioDiscover({ space, oracle, budget: globalBudget, seed: opts.seed ?? 1, goal });
  const obs: Observation[] = (g.history || []).map((s) => ({ experiment: s.experiment, value: s.value }));
  // normalise ↔ real + a deterministic Halton space-filling probe
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const toE = (v: number[]): Experiment => { const e: Experiment = {}; dims.forEach((d, i) => (e[d.name] = lo(i) + v[i] * (hi(i) - lo(i)))); return e; };
  const HB = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
  const hal = (k: number, b: number) => { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };
  // PHASE 2 — optimistic Lipschitz infill (certificate-guided): each step samples the point of highest upper bound
  for (let k = 0; k < infillBudget; k++) {
    const npts = obs.map((o) => toN(o.experiment)), vals = obs.map((o) => sgn * o.value);
    let L = 0; for (let i = 0; i < npts.length; i++) for (let j = i + 1; j < npts.length; j++) { const dx = dst(npts[i], npts[j]); if (dx > 1e-9) L = Math.max(L, Math.abs(vals[i] - vals[j]) / dx); }
    L = (L > 0 ? L : 1e-6) * 1.3;
    let bestC: number[] | null = null, bestUB = -Infinity;
    for (let s = 0; s < 1500; s++) { const c: number[] = []; for (let d = 0; d < D; d++) c.push(hal(k * 1500 + s + 1, HB[d % HB.length])); let ub = Infinity; for (let i = 0; i < npts.length; i++) { const b = vals[i] + L * dst(c, npts[i]); if (b < ub) ub = b; } if (ub > bestUB) { bestUB = ub; bestC = c; } }
    if (bestC) { const e = toE(bestC); obs.push({ experiment: e, value: oracle(e) }); }
  }
  let best = obs.reduce((a, b) => (better(b.value, a.value) ? b : a), g.best);
  // PHASE 3 — Nelder–Mead local polish (nail the optimum)
  const p = polish(space, oracle, best.experiment, localBudget, goal);
  if (better(p.value, best.value)) best = { experiment: p.experiment, value: p.value };
  return { best, armStats: g.armStats, evaluations: globalBudget + infillBudget + localBudget, goal };
}

const realDims = (n: number, lo = -5, hi = 5): Space => ({ dims: Array.from({ length: n }, (_, i) => ({ name: "x" + i, type: "real", min: lo, max: hi })) });
const vec = (e: Experiment, n: number): number[] => Array.from({ length: n }, (_, i) => +(e["x" + i] ?? 0));
const TAU = Math.PI * 2;

/** All landscapes are maximise, normalised so the global optimum value == 1.0 (so best.value == % of optimum). */
export function landscapes(): Landscape[] {
  return [
    { name: "smooth-bowl", space: realDims(2), budget: 50, note: "convex — the easy baseline",
      f: (e) => { const x = vec(e, 2); return Math.exp(-(x[0] * x[0] + x[1] * x[1]) / 8); } },
    { name: "rastrigin-2d", space: realDims(2, -5.12, 5.12), budget: 70, note: "dozens of regular traps",
      f: (e) => { const x = vec(e, 2); const r = 10 * 2 + x.reduce((s, v) => s + v * v - 10 * Math.cos(TAU * v), 0); return 1 / (1 + r); } },
    { name: "ackley-2d", space: realDims(2, -5, 5), budget: 70, note: "deceptive — flat rim, narrow centre",
      f: (e) => { const x = vec(e, 2); const a = -20 * Math.exp(-0.2 * Math.sqrt((x[0] * x[0] + x[1] * x[1]) / 2)) - Math.exp((Math.cos(TAU * x[0]) + Math.cos(TAU * x[1])) / 2) + 20 + Math.E; return Math.exp(-a / 3); } },
    { name: "rosenbrock-2d", space: realDims(2, -2, 2), budget: 130, note: "curved banana valley",
      f: (e) => { const x = vec(e, 2); const r = 100 * (x[1] - x[0] * x[0]) ** 2 + (1 - x[0]) ** 2; return 1 / (1 + r); } },
    { name: "griewank-2d", space: realDims(2, -8, 8), budget: 70, note: "wide + fine oscillation",
      f: (e) => { const x = vec(e, 2); const s = (x[0] * x[0] + x[1] * x[1]) / 4000; const p = Math.cos(x[0] / Math.sqrt(1)) * Math.cos(x[1] / Math.sqrt(2)); return 1 / (1 + (s - p + 1)); } },
    { name: "high-dim-5d", space: realDims(5), budget: 100, note: "5 variables — curse of dimensionality",
      f: (e) => { const x = vec(e, 5); return Math.exp(-x.reduce((s, v) => s + v * v, 0) / 20); } },
    { name: "needle-2d", space: realDims(2, -5, 5), budget: 90, note: "one sharp narrow peak in a flat plain",
      f: (e) => { const x = vec(e, 2); const c0 = 2.3, c1 = -1.7; return Math.exp(-((x[0] - c0) ** 2 + (x[1] - c1) ** 2) / 0.8); } },
  ];
}

export interface LandscapeResult { name: string; meanPct: number; minPct: number; note: string; budget: number; seeds: number }

/** Run the portfolio engine over every landscape × `seeds` seeds; return % of true optimum reached. */
export async function reliabilityBench(seeds = 4): Promise<{ results: LandscapeResult[]; worst: LandscapeResult }> {
  const results: LandscapeResult[] = [];
  for (const L of landscapes()) {
    const pcts: number[] = [];
    for (let s = 1; s <= seeds; s++) {
      const r = await reliableDiscover({ space: L.space, oracle: L.f, budget: L.budget, seed: s, goal: "maximize" });
      pcts.push(Math.max(0, Math.min(1, r.best.value)));   // optimum == 1, so best.value == % of optimum
    }
    const meanPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    results.push({ name: L.name, meanPct, minPct: Math.min(...pcts), note: L.note, budget: L.budget, seeds });
  }
  const worst = results.reduce((a, b) => (b.meanPct < a.meanPct ? b : a));
  return { results, worst };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
const BAR = 0.99;        // every landscape must reach ≥ 99% of its true optimum (mean over seeds)
const SEED_BAR = 0.97;   // and no single seed may fall below 97% (no lucky-average hiding a bad run)

export async function reliabilityGauntlet(): Promise<{ score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> }> {
  const { results, worst } = await reliabilityBench(4);
  const checks = results.map((r) => ({
    name: r.name.toUpperCase(),
    pass: r.meanPct >= BAR && r.minPct >= SEED_BAR,
    detail: `reached ${(r.meanPct * 100).toFixed(1)}% of optimum (worst seed ${(r.minPct * 100).toFixed(1)}%) — ${r.note}`,
  }));
  const minMean = Math.min(...results.map((r) => r.meanPct)), minSeed = Math.min(...results.map((r) => r.minPct));
  checks.push({ name: "EVERY-LANDSCAPE≥99%", pass: minMean >= BAR && minSeed >= SEED_BAR, detail: `worst mean = ${worst.name} ${(minMean * 100).toFixed(1)}%; worst single seed ${(minSeed * 100).toFixed(1)}%` });
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
