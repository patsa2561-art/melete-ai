/**
 * MULTI-OBJECTIVE — real problems rarely have ONE goal. A pharma formulation must be more POTENT *and* more
 * STABLE *and* cheaper; a fraud model must catch more fraud *and* decline fewer good customers. These trade
 * off — there is no single best, but a PARETO FRONT of best-possible compromises.
 *
 * MULTI-OBJECTIVE finds that front from hand-measured results: you score each experiment on N objectives,
 * and Melete (a) computes the exact non-dominated set and (b) proposes the next experiment to widen the
 * front, by scalarising the objectives with a deterministically-varying weight vector so successive
 * proposals probe different trade-offs. Deterministic ⇒ reproducible + signable like every Melete run.
 *
 * Honest by construction (DIAKRISIS): the Pareto front (dominance) is EXACT. The proposer uses weighted-sum
 * scalarisation with rotating weights — simple, robust, and it reliably spreads along the front; it is not
 * guaranteed to recover points on a deeply CONCAVE front (a known limitation of linear scalarisation, the
 * honest trade-off for a dependency-free deterministic engine). The front it reports is always exact.
 */
import { type Space, type Experiment, lcg } from "./space.js";
import { proposeNext } from "./interactive.js";

export interface MGoal { name?: string; goal: "maximize" | "minimize" }
export interface MObservation { experiment: Experiment; values: number[] }

/** Does `a` Pareto-dominate `b` across all objectives (≥ in every one, > in at least one, in goal direction)? */
export function dominates(a: number[], b: number[], goals: ReadonlyArray<MGoal>): boolean {
  let strictly = false;
  for (let i = 0; i < goals.length; i++) {
    const dir = goals[i].goal === "minimize" ? -1 : 1;
    const av = dir * a[i], bv = dir * b[i];
    if (av < bv) return false;       // worse on some objective → cannot dominate
    if (av > bv) strictly = true;    // strictly better on at least one
  }
  return strictly;
}

/** The exact non-dominated set — the achievable best trade-offs. */
export function paretoFront(obs: ReadonlyArray<MObservation>, goals: ReadonlyArray<MGoal>): MObservation[] {
  const valid = (obs ?? []).filter((o) => o && Array.isArray(o.values) && o.values.length === goals.length && o.values.every((v) => Number.isFinite(v)));
  return valid.filter((o, i) => !valid.some((p, j) => j !== i && dominates(p.values, o.values, goals)));
}

/**
 * Propose the next experiment to widen the Pareto front. Scalarises the N objectives with a weight vector
 * that rotates with the run, so successive calls probe different corners of the trade-off space.
 */
export function proposeNextMulti(space: Space, obs: ReadonlyArray<MObservation>, goals: ReadonlyArray<MGoal>, seed = 1): Experiment {
  const valid = (obs ?? []).filter((o) => o && o.experiment && Array.isArray(o.values) && o.values.length === goals.length && o.values.every((v) => Number.isFinite(v)));
  const t = valid.length;
  if (t === 0 || goals.length === 0) return proposeNext(space, [], "maximize", seed);
  // deterministic rotating weights (a different trade-off each step)
  const rnd = lcg(((seed >>> 0) || 1) + t * 131 + 7);
  const w = goals.map(() => rnd() + 1e-3); const wsum = w.reduce((a, b) => a + b, 0) || 1; for (let i = 0; i < w.length; i++) w[i] /= wsum;
  // per-objective range for fair normalisation across different scales
  const mins = goals.map((_, i) => Math.min(...valid.map((o) => o.values[i])));
  const maxs = goals.map((_, i) => Math.max(...valid.map((o) => o.values[i])));
  const scalar = (vals: number[]) => {
    let s = 0;
    for (let i = 0; i < goals.length; i++) { const dir = goals[i].goal === "minimize" ? -1 : 1; const rng = (maxs[i] - mins[i]) || 1; s += w[i] * dir * (vals[i] - mins[i]) / rng; }
    return s;
  };
  const sObs = valid.map((o) => ({ experiment: o.experiment, value: scalar(o.values) }));
  return proposeNext(space, sObs, "maximize", seed + t);
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function multiObjectiveGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const goals: MGoal[] = [{ name: "f1", goal: "maximize" }, { name: "f2", goal: "maximize" }];
  // a clean trade-off: f1 peaks at x=2, f2 peaks at x=8 → Pareto front is x ∈ [2,8]
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }] };
  const f = (x: number): number[] => [-((x - 2) ** 2), -((x - 8) ** 2)];

  // DOMINATES: [2,2] dominates [1,1] (both maximise); neither dominates on a trade-off
  const dom = dominates([2, 2], [1, 1], goals) === true && dominates([2, 1], [1, 2], goals) === false && dominates([1, 1], [2, 2], goals) === false;
  // PARETO-FRONT: dominated points excluded
  const pts: MObservation[] = [
    { experiment: { x: 0 }, values: [-4, -64] },   // dominated
    { experiment: { x: 2 }, values: [0, -36] },    // on front (best f1)
    { experiment: { x: 5 }, values: [-9, -9] },    // on front (balanced)
    { experiment: { x: 8 }, values: [-36, 0] },    // on front (best f2)
    { experiment: { x: 5.0 }, values: [-16, -16] }, // dominated by x=5
  ];
  const front = paretoFront(pts, goals);
  const frontOK = front.length === 3 && front.some((o) => o.experiment.x === 2) && front.some((o) => o.experiment.x === 8) && !front.some((o) => o.experiment.x === 0);
  // PROPOSE: valid in-bounds
  const next = proposeNextMulti(space, pts, goals, 3);
  const proposeOK = typeof next.x === "number" && next.x >= 0 && next.x <= 10;
  // SPREAD: a guided multi-objective loop discovers a SPREAD of trade-offs (not one point)
  const obs: MObservation[] = [];
  for (let i = 0; i < 50; i++) { const e = proposeNextMulti(space, obs, goals, 7); const v = f(e.x ?? 0); obs.push({ experiment: e, values: v }); }
  const fr = paretoFront(obs, goals); const xs = fr.map((o) => o.experiment.x ?? 0);
  const spread = (Math.max(...xs) - Math.min(...xs)) > 3 && fr.length >= 3;   // front spans much of [2,8]
  // MIXED goals (one max, one min) works
  const mixed: MGoal[] = [{ goal: "maximize" }, { goal: "minimize" }];
  const mdom = dominates([5, 1], [4, 2], mixed) === true;   // higher f1 + lower f2 dominates
  // DETERMINISTIC
  const det = JSON.stringify(proposeNextMulti(space, pts, goals, 9)) === JSON.stringify(proposeNextMulti(space, pts, goals, 9));
  // TOTAL
  const total = (() => { try { paretoFront(null as never, goals); proposeNextMulti(space, null as never, goals); dominates([], [], []); return true; } catch { return false; } })();

  const checks = [
    { name: "DOMINANCE", pass: dom, detail: "Pareto-dominance is correct (strictly-better-in-one, not-worse-in-any); trade-offs do not dominate" },
    { name: "PARETO-FRONT-EXACT", pass: frontOK, detail: `the non-dominated set is exact (kept 3 front points, dropped the dominated ones)` },
    { name: "PROPOSE-VALID", pass: proposeOK, detail: "proposes a valid in-bounds next experiment" },
    { name: "SPREADS-THE-FRONT", pass: spread, detail: `a guided multi-objective loop discovers a spread of trade-offs (front size ${fr.length}, x-span ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)})` },
    { name: "MIXED-MAX-MIN", pass: mdom, detail: "handles a mix of maximise + minimise objectives" },
    { name: "DETERMINISTIC", pass: det, detail: "same seed + history → same proposal" },
    { name: "TOTAL", pass: total, detail: "null / empty / mismatched inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
