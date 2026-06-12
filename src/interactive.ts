/**
 * INTERACTIVE / HUMAN-IN-THE-LOOP — "you measure, Melete guides".
 *
 * The web-native way to use Melete on a REAL process with no code and no formula: Melete proposes the next
 * experiment, you go run it (brew the cup, run the assay, benchmark the kernel), type the score back, and
 * Melete proposes the next — converging to the best in as few real experiments as possible.
 *
 * `proposeNext` is the stateless core: given the search space + the history of (experiment, score) so far,
 * it returns the single most useful experiment to try next. Early on it spreads out to cover the space;
 * once there's enough evidence it switches to the Gaussian-Process forecaster (with an occasional
 * evolutionary step). Deterministic given the seed + history, so a guided run is reproducible + signable.
 */
import { type Space, type Experiment, lcg } from "./space.js";
import { type Goal, type Observation } from "./engine.js";
import { armGP, armCMAES, armMaximin, type ArmContext } from "./arms.js";

/** Propose the next experiment to run, given the history of observations so far. */
export function proposeNext(space: Space, obs: ReadonlyArray<Observation>, goal: Goal = "maximize", seed = 1): Experiment {
  const history = (obs ?? []).filter((o) => o && o.experiment);
  const t = history.length;
  const rnd = lcg(((seed >>> 0) || 1) + t * 97 + 1);
  const ctx: ArmContext = { space, obs: history as Observation[], t, budget: t + 2, rnd, goal };
  const warmup = Math.max(4, (space?.dims?.length ?? 1) + 1);
  if (t < warmup) return armMaximin().propose(ctx);      // spread out first → cover the space
  return (t % 3 === 0) ? armCMAES().propose(ctx) : armGP().propose(ctx);
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function interactiveGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  const truth = (e: Experiment) => Math.exp(-(((e.x ?? 0) - 7) ** 2 + ((e.y ?? 0) - 3) ** 2) / 2);   // hidden optimum ≈1 at (7,3)
  // simulate a human-in-the-loop run: propose → "measure" (truth) → record → repeat
  const obs: Observation[] = []; let best = -Infinity;
  for (let i = 0; i < 60; i++) { const e = proposeNext(space, obs, "maximize", 7); const v = truth(e); obs.push({ experiment: e, value: v }); if (v > best) best = v; }
  const converges = best > 0.9;
  // first proposal with no history is valid + in-bounds
  const first = proposeNext(space, [], "maximize", 1);
  const firstOK = typeof first.x === "number" && first.x >= 0 && first.x <= 10 && typeof first.y === "number";
  // deterministic for the same seed + history
  const h: Observation[] = [{ experiment: { x: 5, y: 5 }, value: truth({ x: 5, y: 5 }) }, { experiment: { x: 6, y: 4 }, value: truth({ x: 6, y: 4 }) }];
  const det = JSON.stringify(proposeNext(space, h, "maximize", 3)) === JSON.stringify(proposeNext(space, h, "maximize", 3));
  // minimize works too
  const obsMin: Observation[] = []; let bestMin = Infinity;
  for (let i = 0; i < 60; i++) { const e = proposeNext(space, obsMin, "minimize", 7); const v = -truth(e); obsMin.push({ experiment: e, value: v }); if (v < bestMin) bestMin = v; }
  const minimizes = bestMin < -0.9;
  const total = (() => { try { proposeNext(null as never, null as never); proposeNext(space, []); return true; } catch { return false; } })();
  const checks = [
    { name: "GUIDES-TO-OPTIMUM", pass: converges, detail: `a guided propose→score→repeat loop reaches >0.9 of the optimum (best=${best.toFixed(3)})` },
    { name: "FIRST-PROPOSAL", pass: firstOK, detail: "the first experiment (no history) is valid + in-bounds" },
    { name: "DETERMINISTIC", pass: det, detail: "same seed + history → same next proposal (reproducible)" },
    { name: "MINIMIZE", pass: minimizes, detail: "works for a minimize goal too" },
    { name: "TOTAL", pass: total, detail: "null/empty never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
