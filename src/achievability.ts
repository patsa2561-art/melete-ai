/**
 * ACHIEVABILITY — is the target you WANT even reachable with the knobs you have? Every optimizer chases a
 * better number; none tell you when you're chasing one that the physics can't deliver. If your goal is
 * "yield ≥ 95%" but the best these variables can ever produce is ~88%, you can tune forever and never get
 * there — the answer isn't a better setting, it's a new lever (a variable you aren't yet controlling) or a
 * relaxed target. Knowing that EARLY saves weeks of doomed experiments.
 *
 * ACHIEVABILITY estimates the optimistic CEILING of your response over the whole variable space — a
 * Lipschitz (smoothness) upper bound built from your own measurements — and compares your target against it.
 * Target already met → achieved. Target below the ceiling → reachable, keep going. Target ABOVE even the
 * optimistic ceiling → likely out of reach with these variables; stop tuning, change the experiment.
 *
 * Honest by construction (DIAKRISIS): the ceiling is an OPTIMISTIC estimate from the smoothness of your data,
 * so "unreachable" means "above what your measurements can justify" — not a theorem of impossibility (a sharp
 * spike between samples could exceed it; that's exactly what exploration is for). It abstains when data is
 * thin, and it never cries "impossible" for a target your data already brackets.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface AchievabilityReport {
  target: number;
  bestSoFar: number;
  ceiling: number;          // optimistic best the variables can plausibly reach (Lipschitz bound)
  feasibility: number;      // 0..1 — headroom of the ceiling above the target relative to current progress
  verdict: "achieved" | "reachable" | "unreachable" | "unknown";
  note: string;
}

const HB = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
const hal = (k: number, b: number) => { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/** Estimate whether `target` is reachable for this objective given the measurements so far. */
export function assessAchievability(obs: ReadonlyArray<Observation>, space: Space, target: number, goal: Goal = "maximize"): AchievabilityReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < 6 || !Number.isFinite(target)) {
    return { target, bestSoFar: NaN, ceiling: NaN, feasibility: 0, verdict: "unknown", note: `need ≈6+ measurements to estimate the ceiling (have ${n})` };
  }
  const sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const npts = hist.map((o) => toN(o.experiment));
  const vals = hist.map((o) => sgn * o.value);                         // work in "bigger is better" space
  const bestSigned = Math.max(...vals);

  // Lipschitz constant from the data (largest value-change per unit distance)
  let L = 0; for (let i = 0; i < npts.length; i++) for (let j = i + 1; j < npts.length; j++) { const dx = dst(npts[i], npts[j]); if (dx > 1e-9) L = Math.max(L, Math.abs(vals[i] - vals[j]) / dx); }
  L = (L > 0 ? L : 1e-6) * 1.1;

  // optimistic ceiling: max over a dense space-filling grid of the Lipschitz upper bound min_i(v_i + L·dist)
  let ceilingSigned = bestSigned;
  for (let k = 0; k < 1500; k++) {
    const c: number[] = []; for (let d = 0; d < D; d++) c.push(hal(k * 5 + 1, HB[d % HB.length]));
    let ub = Infinity; for (let i = 0; i < npts.length; i++) { const b = vals[i] + L * dst(c, npts[i]); if (b < ub) ub = b; }
    if (ub > ceilingSigned) ceilingSigned = ub;
  }

  const bestSoFar = sgn * bestSigned;
  const ceiling = sgn * ceilingSigned;
  const targetSigned = sgn * target;
  const span = Math.max(1e-9, ceilingSigned - bestSigned);
  const feasibility = Math.max(0, Math.min(1, (ceilingSigned - targetSigned) / span));   // 1 at target=best, 0 at target=ceiling, <0→unreachable

  let verdict: AchievabilityReport["verdict"]; let note: string;
  const cmp = goal === "minimize" ? "≤" : "≥";
  const fmt = (x: number) => (Math.abs(x) < 1 ? +x.toFixed(3) : +x.toFixed(2));
  if (targetSigned <= bestSigned + 1e-9) {
    verdict = "achieved";
    note = `target ${cmp} ${fmt(target)} is already met (best so far ${fmt(bestSoFar)}) — you can stop or push further`;
  } else if (targetSigned <= ceilingSigned) {
    verdict = "reachable";
    note = `target ${fmt(target)} is below the estimated ceiling (~${fmt(ceiling)}) — reachable; keep optimizing (${(feasibility * 100).toFixed(0)}% headroom remaining)`;
  } else {
    verdict = "unreachable";
    note = `target ${fmt(target)} is ABOVE the optimistic ceiling (~${fmt(ceiling)}) these variables can reach — likely out of reach; add a new lever or relax the target`;
  }
  return { target, bestSoFar: +fmt(bestSoFar), ceiling: +fmt(ceiling), feasibility: +feasibility.toFixed(3), verdict, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function achievabilityGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const TRUE_MAX = 1.0;
  const f = (x: number, y: number) => Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.08);   // peak 1.0 at (0.5,0.5)
  const rnd = lcg(17); const obs: Observation[] = [];
  for (let i = 0; i < 80; i++) { const x = rnd(), y = rnd(); obs.push({ experiment: { x, y }, value: f(x, y) }); }
  // make sure the optimum region is sampled so bestSoFar is near the true max
  for (let i = 0; i < 8; i++) { const x = 0.5 + (rnd() - 0.5) * 0.1, y = 0.5 + (rnd() - 0.5) * 0.1; obs.push({ experiment: { x, y }, value: f(x, y) }); }

  const achieved = assessAchievability(obs, space, 0.5, "maximize");      // below best → achieved
  const reachable = assessAchievability(obs, space, 0.97, "maximize");    // just under the true max → reachable, NOT impossible
  const unreach = assessAchievability(obs, space, 1.6, "maximize");       // well above the max → unreachable

  const achievedOk = achieved.verdict === "achieved";
  const reachableOk = reachable.verdict !== "unreachable";                // must NOT falsely cry impossible below the real max
  const unreachOk = unreach.verdict === "unreachable" && unreach.ceiling < 1.6;

  // higher target → lower feasibility
  const fa = assessAchievability(obs, space, 0.9, "maximize").feasibility;
  const fb = assessAchievability(obs, space, 1.1, "maximize").feasibility;
  const monotone = fa >= fb;

  // MINIMIZE: target floor that's unreachably low
  const g = (x: number, y: number) => 1 - f(x, y);                        // min 0.0 at (0.5,0.5)
  const rnd2 = lcg(5); const obsMin: Observation[] = [];
  for (let i = 0; i < 88; i++) { const x = rnd2(), y = rnd2(); obsMin.push({ experiment: { x, y }, value: g(x, y) }); }
  for (let i = 0; i < 8; i++) { const x = 0.5 + (rnd2() - 0.5) * 0.1, y = 0.5 + (rnd2() - 0.5) * 0.1; obsMin.push({ experiment: { x, y }, value: g(x, y) }); }
  const minUnreach = assessAchievability(obsMin, space, -0.5, "minimize");   // can't get below 0 → −0.5 unreachable
  const minReach = assessAchievability(obsMin, space, 0.1, "minimize");      // 0.1 is reachable
  const minOk = minUnreach.verdict === "unreachable" && minReach.verdict !== "unreachable";

  const det = JSON.stringify(assessAchievability(obs, space, 1.6, "maximize")) === JSON.stringify(assessAchievability(obs, space, 1.6, "maximize"));
  const abstains = assessAchievability(obs.slice(0, 4), space, 0.5, "maximize").verdict === "unknown";
  const total = (() => { try { assessAchievability(null as never, space, 1); assessAchievability([], space, NaN); return true; } catch { return false; } })();

  const checks = [
    { name: "ACHIEVED-WHEN-MET", pass: achievedOk, detail: `target below best → achieved (best ${achieved.bestSoFar})` },
    { name: "REACHABLE-BELOW-MAX", pass: reachableOk, detail: `0.97 < true max ${TRUE_MAX} is NOT called impossible (verdict ${reachable.verdict}, ceiling ${reachable.ceiling})` },
    { name: "UNREACHABLE-ABOVE-MAX", pass: unreachOk, detail: `1.6 > ceiling ${unreach.ceiling} → unreachable (add a lever)` },
    { name: "HIGHER-TARGET-LOWER-FEASIBILITY", pass: monotone, detail: `feasibility drops as the target rises (${fa.toFixed(2)} → ${fb.toFixed(2)})` },
    { name: "MINIMIZE-DIRECTION", pass: minOk, detail: `floor 0 → −0.5 unreachable, 0.1 reachable` },
    { name: "DETERMINISTIC", pass: det, detail: "same data+target → same verdict" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → unknown" },
    { name: "TOTAL", pass: total, detail: "null / empty / NaN target never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
