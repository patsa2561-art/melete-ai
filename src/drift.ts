/**
 * DRIFT — the temporal-confound detector. The scientific-validity check no optimizer runs: are your results
 * improving because of the variables you changed, or because something you AREN'T controlling drifted over
 * the run — the room warmed up through the day, a reagent batch changed, a sensor aged, the operator got
 * tired? If the part of each score that your variables CAN'T explain trends with the ORDER you measured in,
 * your conclusions may be confounded with time, not caused by your knobs.
 *
 * DRIFT fits a response model to your variables, takes the leftover (residual) of each measurement, and
 * tests whether those residuals correlate with experiment order. A strong correlation flags a likely
 * time-confound — a warning that a "winning" setting might just be the setting you happened to try late, on
 * a good day. It's the difference between a result that replicates and one that doesn't.
 *
 * Honest by construction (DIAKRISIS): correlation of residuals with order is EVIDENCE of a time-confound, not
 * proof of causation (you could have sampled a variable monotonically with time — then it's aliased); it
 * needs enough points and abstains otherwise. It tells you to LOOK, with a measured strength.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface DriftReport {
  n: number;
  residualOrderCorr: number;   // Pearson corr of (unexplained residual) vs experiment order, −1..1
  driftFraction: number;       // how much of the score's spread the time-trend accounts for
  detected: boolean;
  note: string;
}

function norm(space: Space, e: Experiment): number[] {
  return space.dims.map((d) => { const lo = d.min ?? 0, hi = d.max ?? 1; const span = hi - lo || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo) / span)); });
}

/** Solve A x = b (n×n) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length; const M = A.map((r, i) => r.concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col; for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    const t = M[col]; M[col] = M[piv]; M[piv] = t;
    const d = M[col][col]; if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < n; r++) { if (r === col) continue; const f = M[r][col] / d; if (f === 0) continue; for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]; }
  }
  const x = new Array(n).fill(0); for (let i = 0; i < n; i++) { const d = M[i][i]; x[i] = Math.abs(d) > 1e-12 ? M[i][n] / d : 0; } return x;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length; if (n < 2) return 0;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  const den = Math.sqrt(saa * sbb); return den > 1e-12 ? sab / den : 0;
}

/** Detect whether the part of each score your variables can't explain trends with experiment order. */
export function analyzeDrift(obs: ReadonlyArray<Observation>, space: Space, _goal: Goal = "maximize"): DriftReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  const nFeat = 1 + 2 * D;
  if (D === 0 || n < nFeat + 5) {
    return { n, residualOrderCorr: 0, driftFraction: 0, detected: false, note: `need ≈${nFeat + 5} measurements to test for drift (have ${n})` };
  }
  // response model: value ~ 1 + Σ x_k + Σ x_k²  (captures the variables' own effect, NOT order)
  const feats = hist.map((o) => { const x = norm(space, o.experiment); const f = [1]; for (let k = 0; k < D; k++) f.push(x[k]); for (let k = 0; k < D; k++) f.push(x[k] * x[k]); return f; });
  const y = hist.map((o) => o.value);
  const XtX: number[][] = Array.from({ length: nFeat }, () => new Array(nFeat).fill(0));
  const Xty: number[] = new Array(nFeat).fill(0);
  for (let r = 0; r < n; r++) { const f = feats[r]; for (let a = 0; a < nFeat; a++) { Xty[a] += f[a] * y[r]; for (let b = 0; b < nFeat; b++) XtX[a][b] += f[a] * f[b]; } }
  for (let a = 0; a < nFeat; a++) XtX[a][a] += 1e-6;
  const coef = solve(XtX, Xty);
  const resid = hist.map((o, r) => { let pred = 0; for (let a = 0; a < nFeat; a++) pred += coef[a] * feats[r][a]; return y[r] - pred; });
  const order = hist.map((_, i) => i);
  const residualOrderCorr = pearson(resid, order);

  // how much of the score spread the time-trend accounts for: slope of residual-vs-order × span ÷ value range
  const mo = (n - 1) / 2; let so = 0, sro = 0; for (let i = 0; i < n; i++) { so += (order[i] - mo) ** 2; sro += (order[i] - mo) * resid[i]; }
  const slope = so > 1e-12 ? sro / so : 0;
  const vRange = Math.max(1e-12, Math.max(...y) - Math.min(...y));
  const driftFraction = Math.min(1, Math.abs(slope * (n - 1)) / vRange);
  const detected = Math.abs(residualOrderCorr) > 0.4 && driftFraction > 0.1;
  const note = detected
    ? `your results trend with WHEN you measured (residual–order corr ${residualOrderCorr.toFixed(2)}, ~${(driftFraction * 100).toFixed(0)}% of the spread) — a possible time-confound; re-test the winner fresh`
    : "no time-trend in the unexplained part — your results are not obviously confounded with order";
  return { n, residualOrderCorr: +residualOrderCorr.toFixed(3), driftFraction: +driftFraction.toFixed(3), detected, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function driftGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const base = (x: number, y: number) => -((x - 0.5) ** 2) - ((y - 0.5) ** 2);   // the real (variable-driven) response

  // WITH DRIFT: a hidden factor ramps over the run (order-dependent), independent of x,y
  const rnd = lcg(31); const drift: Observation[] = [];
  for (let i = 0; i < 60; i++) { const x = rnd(), y = rnd(); drift.push({ experiment: { x, y }, value: base(x, y) + 0.8 * (i / 60) + 0.02 * (rnd() - 0.5) }); }
  const rD = analyzeDrift(drift, space, "maximize");
  const detectsDrift = rD.detected && Math.abs(rD.residualOrderCorr) > 0.5;

  // NO DRIFT: same response, no order term, just small noise
  const rnd2 = lcg(8); const clean: Observation[] = [];
  for (let i = 0; i < 60; i++) { const x = rnd2(), y = rnd2(); clean.push({ experiment: { x, y }, value: base(x, y) + 0.02 * (rnd2() - 0.5) }); }
  const rC = analyzeDrift(clean, space, "maximize");
  const noFalseAlarm = !rC.detected && Math.abs(rC.residualOrderCorr) < 0.4;

  // STRONGER drift → higher correlation
  const rnd3 = lcg(31); const drift2: Observation[] = [];
  for (let i = 0; i < 60; i++) { const x = rnd3(), y = rnd3(); drift2.push({ experiment: { x, y }, value: base(x, y) + 2.0 * (i / 60) + 0.02 * (rnd3() - 0.5) }); }
  const rD2 = analyzeDrift(drift2, space, "maximize");
  const monotone = Math.abs(rD2.residualOrderCorr) >= Math.abs(rD.residualOrderCorr) - 0.05;

  const det = JSON.stringify(analyzeDrift(drift, space, "maximize")) === JSON.stringify(analyzeDrift(drift, space, "maximize"));
  const abstains = analyzeDrift(drift.slice(0, 5), space, "maximize").note.indexOf("need") >= 0;
  const total = (() => { try { analyzeDrift(null as never, space); analyzeDrift([], space); return true; } catch { return false; } })();

  const checks = [
    { name: "DETECTS-DRIFT", pass: detectsDrift, detail: `an order-ramp confound is flagged (corr ${rD.residualOrderCorr})` },
    { name: "NO-FALSE-ALARM", pass: noFalseAlarm, detail: `clean data with no time-trend is NOT flagged (corr ${rC.residualOrderCorr})` },
    { name: "STRONGER-DRIFT-HIGHER-CORR", pass: monotone, detail: `a bigger drift gives a stronger signal (${rD.residualOrderCorr} → ${rD2.residualOrderCorr})` },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same verdict" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → no claim" },
    { name: "TOTAL", pass: total, detail: "null / empty never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
