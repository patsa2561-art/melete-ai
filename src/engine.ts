/**
 * THE BRAIN — the closed-loop active-experiment-design engine.
 *
 *   propose  → the most promising UNtried experiment (Bayesian-optimization-lite: a Gaussian-kernel
 *              surrogate predicts the outcome of any candidate; an UCB acquisition trades off exploiting
 *              the best-known region against exploring the uncertain one; exploration DECAYS over the
 *              budget so it explores early and exploits late)
 *   observe  → the oracle measures the proposed experiment
 *   update   → the observation joins the evidence; the surrogate sharpens
 *   converge → repeat until the budget is spent or the goal is reached
 *
 * It learns the shape of an unknown response surface from as FEW experiments as possible — because in the
 * real world each experiment costs reagents / robot-time / money. Deterministic (seeded), so a run is
 * reproducible and its signed trace is meaningful.
 *
 * ★HONEST: this is a lightweight, dependency-free surrogate (kernel-weighted mean + nearest-point
 * uncertainty), not a full Gaussian-process with learned hyperparameters. It reliably beats random/grid
 * on smooth-ish response surfaces (proven in bench.ts); pathological/high-dimensional/very noisy surfaces
 * need a heavier surrogate — a slot the architecture leaves open.
 */
import { type Space, type Experiment, lcg, gridCandidates, randomCandidates, localCandidates, dist2 } from "./space.js";

export type Goal = "maximize" | "minimize";
export interface Observation { experiment: Experiment; value: number }
export interface Step { n: number; experiment: Experiment; value: number; acquisition: number; kappa: number; rationale: string }
export interface DiscoveryResult { best: Observation; history: Step[]; evaluations: number; converged: boolean; goal: Goal }

export interface DiscoverOpts {
  space: Space; oracle: (e: Experiment) => number | Promise<number>; budget: number;
  goal?: Goal; seed?: number; target?: number; candidatePool?: number; kappa0?: number; bandwidth?: number;
  onStep?: (s: Step) => void | Promise<void>;
}

const key = (e: Experiment) => JSON.stringify(e);

/** Run the closed discovery loop. Returns the best experiment found + the full reproducible history. */
export async function discover(opts: DiscoverOpts): Promise<DiscoveryResult> {
  const space = opts.space; const goal: Goal = opts.goal ?? "maximize"; const budget = Math.max(1, opts.budget | 0);
  const seed = opts.seed ?? 1; const rnd = lcg(seed);
  const pool = Math.max(64, opts.candidatePool ?? 2500); const kappa0 = opts.kappa0 ?? 1.0; const bw = opts.bandwidth ?? 0.025;
  const better = (a: number, b: number) => goal === "maximize" ? a > b : a < b;
  const sign = goal === "maximize" ? 1 : -1;                         // acquisition always "wants" larger; flip for minimize

  const obs: Observation[] = []; const seen = new Set<string>(); const history: Step[] = [];
  const evalExp = async (e: Experiment): Promise<number> => { const v = Number(await opts.oracle(e)); return Number.isFinite(v) ? v : (goal === "maximize" ? -1e18 : 1e18); };
  const record = async (e: Experiment, acq: number, kappa: number, rationale: string) => {
    const v = await evalExp(e); obs.push({ experiment: e, value: v }); seen.add(key(e));
    const best = obs.reduce((a, b) => better(b.value, a.value) ? b : a);
    const step: Step = { n: obs.length, experiment: e, value: v, acquisition: acq, kappa, rationale };
    history.push(step); if (opts.onStep) await opts.onStep(step);
    return best;
  };

  // cold start: a coarse grid design of experiments (global coverage before any modelling)
  const perDim = space.dims.length <= 2 ? 3 : 2;
  for (const e of gridCandidates(space, perDim).slice(0, Math.max(1, Math.min(budget, space.dims.length <= 2 ? 9 : 8)))) {
    if (obs.length >= budget) break; if (seen.has(key(e))) continue;
    await record(e, 0, kappa0, "seed: design-of-experiments grid point");
  }
  let best = obs.length ? obs.reduce((a, b) => better(b.value, a.value) ? b : a) : { experiment: {}, value: goal === "maximize" ? -Infinity : Infinity };

  // active loop
  for (let t = obs.length; t < budget; t++) {
    if (opts.target != null && better(best.value, opts.target)) break;
    const progress = (t - obs.length + 1) / Math.max(1, budget - obs.length);          // 0 → 1 across the active budget
    const kappa = kappa0 * Math.exp(-progress * 3.5);                                    // explore early, exploit late
    const radius = 0.25 * Math.exp(-progress * 2.5);                                     // local ball tightens → sub-grid refinement
    // candidate evaluation is FREE (only ORACLE calls cost) → use a dense GRID (guarantees coverage of the
    // true optimum, the way the proven prototype did) + a local cloud around the best for sub-grid refinement.
    const perDim = Math.max(4, Math.min(60, Math.round(Math.pow(pool, 1 / Math.max(1, space.dims.length)))));
    const candidates = [...gridCandidates(space, perDim, pool * 2), ...localCandidates(space, best.experiment, Math.ceil(pool / 3), Math.max(0.02, radius), rnd), ...randomCandidates(space, Math.ceil(pool / 4), rnd)];
    let pick: Experiment | null = null, pa = -Infinity;
    for (const c of candidates) {
      if (seen.has(key(c))) continue;
      let wsum = 0, vsum = 0, nearest = Infinity;
      for (const o of obs) { const d2 = dist2(space, c, o.experiment); const w = Math.exp(-d2 / bw); wsum += w; vsum += w * (sign * o.value); nearest = Math.min(nearest, Math.sqrt(d2)); }
      const mean = wsum > 1e-12 ? vsum / wsum : 0;                    // surrogate prediction (in "maximize" orientation)
      const acq = mean + kappa * nearest;                            // UCB: exploit + explore
      if (acq > pa) { pa = acq; pick = c; }
    }
    if (!pick) break;
    best = await record(pick, pa, kappa, `acquisition=${pa.toFixed(3)} (surrogate mean + ${kappa.toFixed(2)}·uncertainty)`);
  }

  const converged = opts.target != null ? better(best.value, opts.target) || Math.abs(best.value - opts.target) < 1e-9 : true;
  return { best, history, evaluations: obs.length, converged, goal };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export async function engineGauntlet(): Promise<{ score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> }> {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  const peak = (e: Experiment) => Math.exp(-(((e.x ?? 0) - 7.2) ** 2 + ((e.y ?? 0) - 3.4) ** 2) / 3);   // optimum ≈1 at (7.2,3.4)
  const r = await discover({ space, oracle: (e) => peak(e), budget: 60, seed: 7, goal: "maximize" });
  const foundPeak = r.best.value > 0.9;
  const respectsBudget = r.evaluations <= 60;
  // determinism: same seed → same best
  const r2 = await discover({ space, oracle: (e) => peak(e), budget: 60, seed: 7, goal: "maximize" });
  const deterministic = JSON.stringify(r.best) === JSON.stringify(r2.best);
  // minimize works too
  const rm = await discover({ space, oracle: (e) => -peak(e), budget: 60, seed: 7, goal: "minimize" });
  const minimizes = rm.best.value < -0.9;
  // target early-stop
  const rt = await discover({ space, oracle: (e) => peak(e), budget: 200, seed: 7, goal: "maximize", target: 0.8 });
  const earlyStop = rt.best.value >= 0.8 && rt.evaluations < 200;
  let total = true; try { await discover({ space, oracle: () => NaN, budget: 5, seed: 1 }); } catch { total = false; }
  const checks = [
    { name: "FINDS-OPTIMUM", pass: foundPeak, detail: "reaches >0.9 of a hidden 2D peak within 60 experiments" },
    { name: "RESPECTS-BUDGET", pass: respectsBudget, detail: "never exceeds the experiment budget" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same seed → identical discovery (reproducible)" },
    { name: "MINIMIZE", pass: minimizes, detail: "minimize goal works symmetrically" },
    { name: "TARGET-EARLY-STOP", pass: earlyStop, detail: "stops as soon as the target is reached (saves experiments)" },
    { name: "TOTAL", pass: total, detail: "a NaN/garbage oracle never throws (treated as worst value)" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
