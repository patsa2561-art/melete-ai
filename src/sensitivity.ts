/**
 * SENSITIVITY — the diamond no simple optimizer ships: not just "what's the best setting?" but "how tightly
 * must you hold each knob, and is this optimum robust or fragile?"
 *
 * A factory or lab can hit the perfect setting once — but in production every variable DRIFTS. If the optimum
 * is a sharp spike, a tiny drift ruins the batch; if it sits on a plateau, you can be sloppy and still win.
 * SENSITIVITY reads the measurements you already collected and reports, per variable: how much the score
 * moves when that variable moves (a local slope), how important it is relative to the others, and the
 * TOLERANCE — how far it may drift before the score drops meaningfully. It then rates the optimum
 * robust / moderate / fragile. That is process-control guidance (Taguchi-style robust design) straight out
 * of the optimization run — actionable for real manufacturing, not just a number.
 *
 * Honest by construction (DIAKRISIS): this is a LOCAL estimate from your own data via distance-weighted
 * regression (it assumes a roughly smooth response near the best, and sharpens with more measurements);
 * it abstains to UNKNOWN when there are too few points. It is decision support, not a guarantee.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface VarSensitivity { name: string; sensitivity: number; importancePct: number; toleranceFrac: number; toleranceAbs: number }
export interface SensitivityReport {
  n: number;
  best: Observation | null;
  valueRange: number;
  variables: VarSensitivity[];
  robustness: "robust" | "moderate" | "fragile" | "unknown";
  note: string;
}

function norm(space: Space, e: Experiment): number[] {
  return space.dims.map((d) => { const lo = d.min ?? 0, hi = d.max ?? 1; const span = hi - lo || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo) / span)); });
}

/** Per-variable sensitivity + tolerance at the best, estimated from the observations. */
export function analyzeSensitivity(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize"): SensitivityReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < Math.max(5, 2 * D)) {
    return { n, best: n ? hist.reduce((a, b) => (goal === "minimize" ? (b.value < a.value ? b : a) : (b.value > a.value ? b : a))) : null, valueRange: 0, variables: [], robustness: "unknown", note: `need ≈${Math.max(5, 2 * D)} measurements for a reliable estimate (have ${n})` };
  }
  const pts = hist.map((o) => norm(space, o.experiment));
  const vals = hist.map((o) => o.value);
  const best = hist.reduce((a, b) => (goal === "minimize" ? (b.value < a.value ? b : a) : (b.value > a.value ? b : a)));
  const bestN = norm(space, best.experiment);
  const vMin = Math.min(...vals), vMax = Math.max(...vals); const valueRange = Math.max(1e-12, vMax - vMin);

  const dir = goal === "minimize" ? -1 : 1;
  const bestVal = dir * best.value;
  const sens: number[] = [];
  for (let j = 0; j < D; j++) {
    // At an optimum the first-order slope is ~0 — sensitivity is CURVATURE: how fast the score DROPS as the
    // variable deviates from best. Weighted regression of drop (≥0) on squared deviation along x_j, weighting
    // points close to `best` in the OTHER dims. The coefficient ≈ how sharply this knob hurts when it drifts.
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let i = 0; i < n; i++) {
      let od = 0; for (let k = 0; k < D; k++) if (k !== j) od += (pts[i][k] - bestN[k]) ** 2;
      const w = Math.exp(-od / (2 * 0.25 * 0.25));
      const x = (pts[i][j] - bestN[j]) ** 2;            // squared deviation along this variable
      const y = Math.max(0, bestVal - dir * vals[i]);   // how much WORSE than the best (the drop)
      sw += w; swx += w * x; swy += w * y; swxx += w * x * x; swxy += w * x * y;
    }
    const denom = sw * swxx - swx * swx;
    const curv = Math.abs(denom) > 1e-12 ? (sw * swxy - swx * swy) / denom : 0;   // drop per (normalised-range deviation)²
    sens.push(Math.max(0, curv));
  }
  const sumSens = sens.reduce((a, b) => a + b, 0) || 1;
  const variables: VarSensitivity[] = dims.map((d, j) => {
    const span = (d.max ?? 1) - (d.min ?? 0);
    // tolerance: how far (fraction of the variable's range) it can drift before the score drops > 5% of its
    // range — from the curvature: curv·Δ² ≤ 0.05·range  ⇒  Δ ≤ √(0.05·range / curv)
    const tolFrac = sens[j] > 1e-9 ? Math.min(1, Math.sqrt((0.05 * valueRange) / sens[j])) : 1;
    return { name: d.name, sensitivity: +(sens[j] / valueRange).toFixed(4), importancePct: +(100 * sens[j] / sumSens).toFixed(1), toleranceFrac: +tolFrac.toFixed(4), toleranceAbs: +(tolFrac * span).toFixed(4) };
  });
  const meanTol = variables.reduce((a, v) => a + v.toleranceFrac, 0) / (variables.length || 1);
  const robustness: SensitivityReport["robustness"] = meanTol > 0.3 ? "robust" : meanTol < 0.1 ? "fragile" : "moderate";
  const worst = variables.slice().sort((a, b) => b.importancePct - a.importancePct)[0];
  const note = worst ? `hold ${worst.name} tightest (${worst.importancePct}% of the sensitivity); the optimum looks ${robustness}` : "";
  return { n, best, valueRange: +valueRange.toFixed(6), variables, robustness, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function sensitivityGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  // x is ~13x more sensitive than y (slope 4 vs 0.3 per unit); optimum at (5,5)
  const f = (e: Experiment) => -((((e.x ?? 0) - 5) * 4) ** 2) - ((((e.y ?? 0) - 5) * 0.3) ** 2);
  const rnd = lcg(7); const obs: Observation[] = [];
  for (let i = 0; i < 50; i++) { const e = { x: rnd() * 10, y: rnd() * 10 }; obs.push({ experiment: e, value: f(e) }); }
  // bias some points near the optimum for a good local estimate
  for (let i = 0; i < 14; i++) { const e = { x: 5 + (rnd() - 0.5) * 2, y: 5 + (rnd() - 0.5) * 2 }; obs.push({ experiment: e, value: f(e) }); }

  const r = analyzeSensitivity(obs, space, "maximize");
  const vx = r.variables.find((v) => v.name === "x"), vy = r.variables.find((v) => v.name === "y");
  const ranksX = !!vx && !!vy && vx.sensitivity > vy.sensitivity;                 // x more sensitive
  const importanceX = !!vx && vx.importancePct > 60;                              // x dominates the sensitivity
  const toleranceY = !!vx && !!vy && vy.toleranceFrac > vx.toleranceFrac;          // y can drift more (looser)
  const sumImportance = Math.abs(r.variables.reduce((a, v) => a + v.importancePct, 0) - 100) < 0.5;  // importances sum to ~100%
  const robustnessSet = r.robustness !== "unknown";
  // thin data → UNKNOWN (abstain, never bluff)
  const thin = analyzeSensitivity(obs.slice(0, 3), space, "maximize");
  const abstains = thin.robustness === "unknown" && thin.variables.length === 0;
  // deterministic
  const det = JSON.stringify(analyzeSensitivity(obs, space, "maximize")) === JSON.stringify(analyzeSensitivity(obs, space, "maximize"));
  // total
  const total = (() => { try { analyzeSensitivity(null as never, space); analyzeSensitivity([], space); return true; } catch { return false; } })();

  const checks = [
    { name: "RANKS-SENSITIVITY", pass: ranksX, detail: `correctly finds x more sensitive than y (x=${vx?.sensitivity}, y=${vy?.sensitivity})` },
    { name: "IMPORTANCE", pass: importanceX, detail: `x carries the dominant importance (${vx?.importancePct}%)` },
    { name: "TOLERANCE", pass: toleranceY, detail: `the less-sensitive y gets a wider drift tolerance (y=${vy?.toleranceFrac} > x=${vx?.toleranceFrac})` },
    { name: "IMPORTANCE-SUMS-100", pass: sumImportance, detail: "per-variable importance sums to 100%" },
    { name: "ROBUSTNESS-VERDICT", pass: robustnessSet, detail: `classifies the optimum (got "${r.robustness}")` },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → UNKNOWN, never a bluffed estimate" },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same report" },
    { name: "TOTAL", pass: total, detail: "null / empty never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
