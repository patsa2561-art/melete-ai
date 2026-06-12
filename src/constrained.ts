/**
 * SAFE OPTIMIZATION — find the best, but never cross a line you can't cross. Real processes are never "just
 * maximise" — they're "maximise yield WHILE cost stays under budget, toxicity under the safety limit,
 * temperature under what the vessel can hold." A naive optimizer happily proposes the brilliant-but-illegal
 * setting that melts the reactor. Competitors (Ax/BoTorch constraints, SafeOpt) handle this; Melete now does
 * too — with a twist no one else ships: a SAFETY-MARGIN CERTIFICATE.
 *
 * Two parts:
 *   • bestFeasible — the best-scoring setting that satisfies EVERY constraint, alongside the (better but
 *     forbidden) unconstrained best, so you see exactly what safety costs you; plus, for the chosen recipe,
 *     how far it sits inside each limit — a warranty: "cost 15 (limit 20, 25% margin), toxicity 0.3 (limit
 *     0.5, 40% margin)."
 *   • proposeNextSafe — the next experiment that is both high-potential AND predicted-feasible, learning the
 *     forbidden region from your labelled runs so it steers away from settings likely to violate a limit.
 *
 * Honest by construction (DIAKRISIS): feasibility is read from the constraint values YOU measured (a setting
 * is feasible iff its measured metrics satisfy the limits — no guessing about the recipe you pick); the
 * safe-proposal's feasibility is a distance-weighted estimate from your labelled points (it steers away from
 * known-unsafe regions, it does not certify an unmeasured point is safe — that's what the experiment is
 * for). It abstains when there's nothing to stand on.
 */
import { type Space, type Experiment, lcg } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export type CObs = Observation & { metrics?: Record<string, number> };
export interface Constraint { name: string; max?: number; min?: number }
export interface MarginItem { name: string; value: number; limit: number; bound: "max" | "min"; marginPct: number }
export interface FeasibleReport {
  best: CObs | null;                  // best setting that satisfies every constraint
  unconstrainedBest: CObs | null;     // best ignoring constraints (the forbidden temptation)
  safetyCost: number;                 // how much value the constraints cost you (unconstrained − feasible)
  feasibilityRate: number;            // fraction of your runs that were within limits
  margins: MarginItem[];              // how far the chosen recipe sits inside each limit
  note: string;
}

const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

function feasible(o: CObs, cons: ReadonlyArray<Constraint>): boolean {
  for (const c of cons) { const v = o.metrics?.[c.name]; if (v == null || !Number.isFinite(v)) continue; if (c.max != null && v > c.max + 1e-12) return false; if (c.min != null && v < c.min - 1e-12) return false; }
  return true;
}

/** The best setting that satisfies every constraint, plus its safety margins. */
export function bestFeasible(obs: ReadonlyArray<CObs>, goal: Goal, cons: ReadonlyArray<Constraint>): FeasibleReport {
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (n === 0) return { best: null, unconstrainedBest: null, safetyCost: NaN, feasibilityRate: NaN, margins: [], note: "no measurements yet" };
  const sgn = goal === "minimize" ? -1 : 1;
  const pickBest = (arr: CObs[]) => arr.reduce((a, b) => (sgn * b.value > sgn * a.value ? b : a));
  const feas = hist.filter((o) => feasible(o, cons));
  const unconstrainedBest = pickBest(hist as CObs[]);
  if (!feas.length) return { best: null, unconstrainedBest, safetyCost: NaN, feasibilityRate: 0, margins: [], note: "none of your runs satisfied all the limits — loosen a limit or explore elsewhere" };
  const best = pickBest(feas);
  const safetyCost = +(sgn * (unconstrainedBest.value - best.value)).toFixed(6);
  const margins: MarginItem[] = [];
  for (const c of cons) {
    const v = best.metrics?.[c.name]; if (v == null || !Number.isFinite(v)) continue;
    if (c.max != null) { const span = Math.max(1e-9, Math.abs(c.max)); margins.push({ name: c.name, value: +v.toFixed(4), limit: c.max, bound: "max", marginPct: +(((c.max - v) / span) * 100).toFixed(1) }); }
    else if (c.min != null) { const span = Math.max(1e-9, Math.abs(c.min)); margins.push({ name: c.name, value: +v.toFixed(4), limit: c.min, bound: "min", marginPct: +(((v - c.min) / span) * 100).toFixed(1) }); }
  }
  const tightest = margins.slice().sort((a, b) => a.marginPct - b.marginPct)[0];
  const note = `best safe setting scores ${(+best.value).toPrecision(4)} (vs ${(+unconstrainedBest.value).toPrecision(4)} if limits were ignored)${tightest ? `; tightest margin: ${tightest.name} ${tightest.marginPct}% inside its limit` : ""}`;
  return { best, unconstrainedBest, safetyCost, feasibilityRate: +(feas.length / n).toFixed(3), margins, note };
}

/** Propose the next experiment that is high-potential AND predicted to stay within the limits. */
export function proposeNextSafe(space: Space, obs: ReadonlyArray<CObs>, goal: Goal, cons: ReadonlyArray<Constraint>, seed = 1): Experiment {
  const dims = space.dims, D = dims.length, sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const toE = (v: number[]): Experiment => { const e: Experiment = {}; dims.forEach((d, i) => { let x = lo(i) + v[i] * (hi(i) - lo(i)); if (d.type === "int") x = Math.round(x); e[d.name] = x; }); return e; };
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const rnd = lcg(((seed >>> 0) || 1) + hist.length * 89 + 5);
  const HB = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
  const hal = (k: number, b: number) => { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

  const cands: number[][] = [];
  for (let k = 0; k < 1000; k++) { const c: number[] = []; for (let d = 0; d < D; d++) c.push(hal(k * 3 + (seed % 5) + 1, HB[d % HB.length])); cands.push(c); }
  if (hist.length) { const fb = hist.filter((o) => feasible(o, cons)); const base = (fb.length ? fb : hist).reduce((a, b) => (sgn * b.value > sgn * a.value ? b : a)); const bn = toN(base.experiment); for (let k = 0; k < 150; k++) cands.push(bn.map((x) => Math.max(0, Math.min(1, x + (rnd() - 0.5) * 0.2)))); }

  const npts = hist.map((o) => toN(o.experiment));
  const vals = hist.map((o) => sgn * o.value);
  const feasLabel = hist.map((o) => (feasible(o, cons) ? 1 : 0));
  // value model (optimistic Lipschitz UB) — feasibility model (distance-weighted vote)
  let L = 0; for (let i = 0; i < npts.length; i++) for (let j = i + 1; j < npts.length; j++) { const dx = dst(npts[i], npts[j]); if (dx > 1e-9) L = Math.max(L, Math.abs(vals[i] - vals[j]) / dx); }
  L = (L > 0 ? L : 1e-6) * 1.2;
  const bestNorm = npts.length ? Math.max(...vals) : 0;

  // SafeOpt-style: first restrict to the predicted-SAFE set, THEN maximise potential within it.
  let pick: number[] | null = null, pickGain = -Infinity;     // best gain among predicted-feasible candidates
  let safest: number[] | null = null, safestP = -Infinity;    // fallback: the most-likely-feasible candidate
  for (const c of cands) {
    let ub = Infinity; for (let i = 0; i < npts.length; i++) { const b = vals[i] + L * dst(c, npts[i]); if (b < ub) ub = b; }
    const gain = npts.length ? Math.max(0, ub - bestNorm) + 1e-6 : 1;
    let sw = 0, swf = 0; for (let i = 0; i < npts.length; i++) { const w = 1 / (dst(c, npts[i]) ** 2 + 1e-6); sw += w; swf += w * feasLabel[i]; }
    const pFeas = npts.length ? swf / sw : 1;                       // predicted probability the candidate is feasible
    if (pFeas > safestP) { safestP = pFeas; safest = c; }
    if (pFeas >= 0.5 && gain > pickGain) { pickGain = gain; pick = c; }   // only consider the safe set
  }
  return toE(pick ?? safest ?? cands[0]);
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function constrainedGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  // value rises with x (so the unconstrained best wants x→1) — but x is the "danger" metric, limited to ≤ 0.7
  const f = (x: number, y: number) => x + 0.3 * Math.exp(-((y - 0.5) ** 2) / 0.1);
  const cons: Constraint[] = [{ name: "danger", max: 0.7 }];
  const rnd = lcg(21); const obs: CObs[] = [];
  for (let i = 0; i < 80; i++) { const x = rnd(), y = rnd(); obs.push({ experiment: { x, y }, value: f(x, y), metrics: { danger: x } }); }

  const r = bestFeasible(obs, "maximize", cons);
  const respects = !!r.best && (r.best.metrics!.danger <= 0.7 + 1e-9);
  const tradeOff = !!r.unconstrainedBest && r.unconstrainedBest.value > r.best!.value && r.unconstrainedBest.metrics!.danger > 0.7 && r.safetyCost > 0;
  const marginOk = r.margins.length === 1 && r.margins[0].bound === "max" && Math.abs(r.margins[0].marginPct - ((0.7 - r.best!.metrics!.danger) / 0.7 * 100)) < 0.5;
  const feasRate = r.feasibilityRate > 0 && r.feasibilityRate < 1;

  // ALL-INFEASIBLE → honest "none satisfied"
  const allBad = obs.map((o) => ({ ...o, metrics: { danger: 0.9 } }));
  const rBad = bestFeasible(allBad, "maximize", cons);
  const honestNone = rBad.best === null && rBad.feasibilityRate === 0;

  // SAFE-PROPOSAL: the next proposed experiment steers into the feasible region (danger = x ≤ ~0.7)
  let safeCount = 0; for (let s = 1; s <= 8; s++) { const e = proposeNextSafe(space, obs, "maximize", cons, s); if ((e.x ?? 1) <= 0.74) safeCount++; }
  const safeProposal = safeCount >= 7;

  const det = JSON.stringify(bestFeasible(obs, "maximize", cons)) === JSON.stringify(bestFeasible(obs, "maximize", cons));
  const total = (() => { try { bestFeasible([], "maximize", cons); bestFeasible(obs, "maximize", []); proposeNextSafe(space, [], "maximize", cons); return true; } catch { return false; } })();

  const checks = [
    { name: "RESPECTS-CONSTRAINTS", pass: respects, detail: `best safe setting has danger ${r.best ? r.best.metrics!.danger.toFixed(3) : "?"} ≤ 0.7` },
    { name: "SHOWS-SAFETY-COST", pass: tradeOff, detail: `unconstrained best ${r.unconstrainedBest ? r.unconstrainedBest.value.toFixed(2) : "?"} (danger>0.7) vs safe ${r.best ? r.best.value.toFixed(2) : "?"} — costs ${r.safetyCost}` },
    { name: "MARGIN-CERTIFICATE", pass: marginOk, detail: `margin ${r.margins[0] ? r.margins[0].marginPct : "?"}% inside the danger limit` },
    { name: "FEASIBILITY-RATE", pass: feasRate, detail: `${(r.feasibilityRate * 100).toFixed(0)}% of runs were within limits` },
    { name: "HONEST-WHEN-NONE-FEASIBLE", pass: honestNone, detail: "all-unsafe data → says none satisfied (no false safe pick)" },
    { name: "SAFE-PROPOSAL-STEERS-AWAY", pass: safeProposal, detail: `${safeCount}/8 proposals land in the feasible region` },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same verdict" },
    { name: "TOTAL", pass: total, detail: "empty obs / no constraints never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
