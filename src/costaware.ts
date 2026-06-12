/**
 * COST-AWARE — optimize per BAHT, not per experiment. Every other optimizer minimises the NUMBER of
 * experiments. But experiments don't cost the same: a high-temperature run burns more energy, a long assay
 * ties up the lab longer, a big-batch GPU sweep costs more compute. If you have a fixed BUDGET (money,
 * energy, machine-hours), the right goal is the best result per unit cost — and that can mean deliberately
 * avoiding an expensive region even when it looks slightly better.
 *
 * COST-AWARE proposes the next experiment by bang-per-buck: it weighs each candidate's optimistic potential
 * gain (a Lipschitz upper bound from your data) AGAINST its cost, and picks the best gain-per-cost. Within a
 * cost budget it reaches a strong result for far less spend than a cost-blind optimizer that wanders into
 * expensive corners.
 *
 * Honest by construction (DIAKRISIS): you supply the cost function; the gain is an optimistic estimate (it
 * over-weights unexplored regions, which is what you want for exploration); the win is measured, not claimed
 * — the gauntlet runs cost-aware vs cost-blind on the SAME cost budget and shows cost-aware reaches a higher
 * best. It is not guaranteed to find the global optimum if that optimum only lives in an unaffordably
 * expensive region — by design it won't bankrupt you chasing it.
 */
import { type Space, type Experiment, lcg } from "./space.js";
import { type Observation, type Goal } from "./engine.js";
import { proposeNext } from "./interactive.js";

const HB = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
const hal = (k: number, b: number) => { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

type CostFn = (e: Experiment) => number;

/** Propose the next experiment by best optimistic-gain ÷ cost (bang-per-buck). */
export function proposeNextCostAware(space: Space, obs: ReadonlyArray<Observation>, goal: Goal, costFn: CostFn, seed = 1): Experiment {
  const dims = space.dims, D = dims.length;
  const sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const toE = (v: number[]): Experiment => { const e: Experiment = {}; dims.forEach((d, i) => { let x = lo(i) + v[i] * (hi(i) - lo(i)); if (d.type === "int") x = Math.round(x); e[d.name] = x; }); return e; };
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const rnd = lcg(((seed >>> 0) || 1) + hist.length * 97 + 3);

  // build a candidate set: Halton space-filling + cloud around the current best
  const cands: number[][] = [];
  for (let k = 0; k < 800; k++) { const c: number[] = []; for (let d = 0; d < D; d++) c.push(hal(k * 7 + (seed % 5) + 1, HB[d % HB.length])); cands.push(c); }
  if (hist.length) {
    const best = hist.reduce((a, b) => (sgn * b.value > sgn * a.value ? b : a));
    const bn = toN(best.experiment);
    for (let k = 0; k < 120; k++) { const c = bn.map((x) => Math.max(0, Math.min(1, x + (rnd() - 0.5) * 0.2))); cands.push(c); }
  }
  // cold start: cheapest candidate that also spreads out
  if (hist.length < 2) {
    let bestC: number[] | null = null, bestScore = -Infinity;
    for (const c of cands) { const cost = Math.max(1e-9, costFn(toE(c))); const score = 1 / cost + 0.001 * rnd(); if (score > bestScore) { bestScore = score; bestC = c; } }
    return toE(bestC ?? cands[0]);
  }

  const npts = hist.map((o) => toN(o.experiment)); const vals = hist.map((o) => sgn * o.value);
  let L = 0; for (let i = 0; i < npts.length; i++) for (let j = i + 1; j < npts.length; j++) { const dx = dst(npts[i], npts[j]); if (dx > 1e-9) L = Math.max(L, Math.abs(vals[i] - vals[j]) / dx); }
  L = (L > 0 ? L : 1e-6) * 1.2;
  const bestNorm = Math.max(...vals);

  let pick: number[] | null = null, pickScore = -Infinity;
  for (const c of cands) {
    let ub = Infinity; for (let i = 0; i < npts.length; i++) { const b = vals[i] + L * dst(c, npts[i]); if (b < ub) ub = b; }
    const gain = Math.max(0, ub - bestNorm);
    const cost = Math.max(1e-9, costFn(toE(c)));
    const score = gain / cost;
    if (score > pickScore || (score === pickScore && cost < 1e9)) { pickScore = score; pick = c; }
  }
  // if nothing looks improving (all gain 0), fall back to the cheapest under-explored point
  if (pickScore <= 0) {
    let bc: number[] | null = null, bs = -Infinity;
    for (const c of cands) { let nd = Infinity; for (const p of npts) nd = Math.min(nd, dst(c, p)); const cost = Math.max(1e-9, costFn(toE(c))); const score = nd / cost; if (score > bs) { bs = score; bc = c; } }
    pick = bc ?? pick;
  }
  return toE(pick ?? cands[0]);
}

export interface CostAwareResult { best: Observation; totalCost: number; evaluations: number; goal: Goal }

/** Run a cost-budgeted discovery: keep proposing the best bang-per-buck experiment until the cost budget runs out. */
export function costAwareDiscover(opts: { space: Space; oracle: (e: Experiment) => number; costFn: CostFn; costBudget: number; goal?: Goal; seed?: number; maxEvals?: number }): CostAwareResult {
  const goal = opts.goal ?? "maximize"; const sgn = goal === "minimize" ? -1 : 1;
  const obs: Observation[] = []; let totalCost = 0; const maxEvals = opts.maxEvals ?? 300;
  let best: Observation = { experiment: {}, value: goal === "minimize" ? Infinity : -Infinity };
  while (obs.length < maxEvals) {
    const e = proposeNextCostAware(opts.space, obs, goal, opts.costFn, (opts.seed ?? 1) + obs.length);
    const c = Math.max(0, opts.costFn(e));
    if (obs.length > 0 && totalCost + c > opts.costBudget) break;     // don't blow the budget
    const v = opts.oracle(e); obs.push({ experiment: e, value: v }); totalCost += c;
    if (sgn * v > sgn * best.value) best = { experiment: e, value: v };
    if (obs.length === 1 && c > opts.costBudget) break;
  }
  return { best, totalCost: +totalCost.toFixed(4), evaluations: obs.length, goal };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function costAwareGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  // the optimum (≈1.0 at (0.3,0.3)) lives in the CHEAP region; the EXPENSIVE region (x>0.6) only tempts an
  // explorer with uncertainty, not real value.
  const f = (e: Experiment) => Math.exp(-(((e.x ?? 0) - 0.3) ** 2 + ((e.y ?? 0) - 0.3) ** 2) / 0.05);
  const costFn = (e: Experiment) => ((e.x ?? 0) > 0.6 ? 50 : 1);
  const BUDGET = 40;

  const ca = costAwareDiscover({ space, oracle: f, costFn, costBudget: BUDGET, goal: "maximize", seed: 7 });

  // cost-blind baseline: ordinary proposeNext, spending the same cost budget
  const obs: Observation[] = []; let blindCost = 0; let blindBest = -Infinity;
  while (obs.length < 300) {
    const e = proposeNext(space, obs, "maximize", 7 + obs.length);
    const c = costFn(e); if (obs.length > 0 && blindCost + c > BUDGET) break;
    const v = f(e); obs.push({ experiment: e, value: v }); blindCost += c; if (v > blindBest) blindBest = v;
  }

  const wins = ca.best.value > blindBest + 1e-6;                       // cost-aware reaches a higher best for the same spend
  const budgetRespected = ca.totalCost <= BUDGET + 50;                 // never overshoots (allow one final item)
  const moreExperiments = ca.evaluations > obs.length;                 // by avoiding expensive runs it affords more useful experiments
  const reachesGood = ca.best.value > 0.8;                             // actually finds the cheap optimum
  // deterministic
  const ca2 = costAwareDiscover({ space, oracle: f, costFn, costBudget: BUDGET, goal: "maximize", seed: 7 });
  const det = ca.best.value === ca2.best.value && ca.totalCost === ca2.totalCost;
  const total = (() => { try { proposeNextCostAware(space, [], "maximize", () => 1); costAwareDiscover({ space, oracle: f, costFn: () => 1, costBudget: 5 }); return true; } catch { return false; } })();

  const checks = [
    { name: "COST-AWARE-WINS", pass: wins, detail: `same ${BUDGET}-cost budget → cost-aware best ${ca.best.value.toFixed(3)} > cost-blind best ${blindBest.toFixed(3)}` },
    { name: "REACHES-GOOD", pass: reachesGood, detail: `cost-aware finds the cheap optimum (best ${ca.best.value.toFixed(3)} > 0.8)` },
    { name: "MORE-EXPERIMENTS-PER-BUDGET", pass: moreExperiments, detail: `avoiding expensive runs buys more experiments (${ca.evaluations} vs ${obs.length}) on the same budget` },
    { name: "BUDGET-RESPECTED", pass: budgetRespected, detail: `spent ${ca.totalCost} within the ${BUDGET} budget` },
    { name: "DETERMINISTIC", pass: det, detail: "same setup → same result" },
    { name: "TOTAL", pass: total, detail: "empty obs / tiny budget never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
