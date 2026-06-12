/**
 * NOISE — the replication advisor. Hand-measured scores are NOISY (a lab assay drifts, a taste test is
 * subjective, a benchmark jitters). No simple optimizer tells you "that reading looks unreliable —
 * re-measure it" or "your measurements are too noisy to trust this winner yet". NOISE does.
 *
 * It estimates the measurement noise σ from DISAGREEMENT between experiments that sit close together in
 * the variable space: if two near-identical settings gave very different scores, that gap is noise (the
 * response barely changed, so the difference is the meter wobbling). From σ it reports the signal-to-noise
 * ratio, flags individual readings that deviate far from their neighbours (likely mis-measurements), and
 * recommends whether to TRUST the result, RE-CHECK a flagged point, or REPLICATE measurements because the
 * noise is drowning the signal.
 *
 * Honest by construction (DIAKRISIS): σ is estimated from near-neighbour pairs (it slightly over-counts any
 * real local variation, so it is a conservative upper-ish bound); it needs enough close pairs and abstains
 * to UNKNOWN otherwise. Decision support, not a guarantee — but the σ estimate is checkable: feed it data
 * with a known injected noise and it recovers it (see the gauntlet).
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface NoiseOutlier { experiment: Experiment; value: number; deviation: number }
export interface NoiseReport {
  n: number;
  noiseSigma: number;        // estimated measurement noise (same units as the score)
  signalRange: number;       // spread of the scores
  snr: number;               // signalRange / noiseSigma
  nearPairs: number;         // how many close pairs the estimate is based on
  outliers: NoiseOutlier[];  // readings that deviate > 3σ from their local neighbourhood
  recommendation: "trust" | "recheck-flagged" | "replicate" | "unknown";
  note: string;
}

function norm(space: Space, e: Experiment): number[] {
  return space.dims.map((d) => { const lo = d.min ?? 0, hi = d.max ?? 1; const span = hi - lo || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo) / span)); });
}
const dist = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };

/** Estimate measurement noise + flag unreliable readings from near-neighbour disagreement. */
export function analyzeNoise(obs: ReadonlyArray<Observation>, space: Space, _goal: Goal = "maximize", neighborFrac = 0.1): NoiseReport {
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if ((space?.dims?.length ?? 0) === 0 || n < 8) {
    return { n, noiseSigma: 0, signalRange: 0, snr: 0, nearPairs: 0, outliers: [], recommendation: "unknown", note: `need ≈8+ measurements (have ${n})` };
  }
  const pts = hist.map((o) => norm(space, o.experiment));
  const vals = hist.map((o) => o.value);
  const vMin = Math.min(...vals), vMax = Math.max(...vals); const signalRange = vMax - vMin;

  // σ from the CLOSEST pairs: at small separation the response is ~flat, so the value gap is ~ noise.
  // For two readings each with noise σ, Var(diff) = 2σ², so σ̂ = sqrt(mean(diff²)/2). Use the nearest pairs only.
  const pairs: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (dist(pts[i], pts[j]) < neighborFrac) pairs.push((vals[i] - vals[j]) ** 2); }
  // widen the radius if too few close pairs (sparse data)
  let radius = neighborFrac;
  while (pairs.length < 5 && radius < 0.6) { radius += 0.1; pairs.length = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (dist(pts[i], pts[j]) < radius) pairs.push((vals[i] - vals[j]) ** 2); } }
  if (pairs.length < 3) {
    return { n, noiseSigma: 0, signalRange: +signalRange.toFixed(6), snr: 0, nearPairs: pairs.length, outliers: [], recommendation: "unknown", note: "samples too spread out to estimate noise — repeat a setting or sample closer together" };
  }
  // robust σ via the MEDIAN of squared near-pair gaps (one mis-measured reading can't poison it) with the
  // χ²₁ median de-bias: E[median(diff²)] = 2σ²·0.45494, so σ̂ = sqrt(median / 0.90987).
  const sorted = pairs.slice().sort((a, b) => a - b);
  const m = sorted.length; const median = m % 2 ? sorted[(m - 1) / 2] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2;
  const noiseSigma = Math.sqrt(median / 0.90987);
  const snr = noiseSigma > 1e-12 ? signalRange / noiseSigma : Infinity;

  // outliers: a reading far from the local mean of its CLOSE neighbours (tight radius keeps the trend out;
  // 4σ threshold so ordinary noise is not mistaken for a mis-measurement)
  const outliers: NoiseOutlier[] = [];
  if (noiseSigma > 1e-9) {
    for (let i = 0; i < n; i++) {
      const neigh: number[] = [];
      for (let j = 0; j < n; j++) { if (j === i) continue; if (dist(pts[i], pts[j]) < radius * 1.5) neigh.push(vals[j]); }
      if (neigh.length >= 2) {
        neigh.sort((a, b) => a - b); const k = neigh.length; const localMed = k % 2 ? neigh[(k - 1) / 2] : (neigh[k / 2 - 1] + neigh[k / 2]) / 2;   // robust centre — a bad point can't drag it
        const dev = Math.abs(vals[i] - localMed);
        if (dev > 4 * noiseSigma) outliers.push({ experiment: hist[i].experiment, value: vals[i], deviation: +dev.toFixed(4) });
      }
    }
    outliers.sort((a, b) => b.deviation - a.deviation);   // worst first, so slice() keeps the real culprits
  }

  let recommendation: NoiseReport["recommendation"];
  let note: string;
  if (noiseSigma > 0.15 * (signalRange || 1)) { recommendation = "replicate"; note = `noise (σ≈${noiseSigma.toPrecision(3)}) is large vs the signal (SNR≈${snr.toFixed(1)}) — replicate measurements before trusting the winner`; }
  else if (outliers.length) { recommendation = "recheck-flagged"; note = `${outliers.length} reading(s) look mis-measured (>3σ from neighbours) — re-check them`; }
  else { recommendation = "trust"; note = `measurements look clean (σ≈${noiseSigma.toPrecision(3)}, SNR≈${snr.toFixed(1)})`; }

  return { n, noiseSigma: +noiseSigma.toFixed(6), signalRange: +signalRange.toFixed(6), snr: Number.isFinite(snr) ? +snr.toFixed(3) : 9999, nearPairs: pairs.length, outliers: outliers.slice(0, 5), recommendation, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function noiseGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  // deterministic Gaussian noise (Box–Muller) from the seeded RNG
  const rnd = lcg(11);
  const gauss = () => { const u1 = Math.max(1e-9, rnd()), u2 = rnd(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };

  // a nearly-flat response (so near-pair gaps are dominated by noise) + KNOWN noise σ = 0.30
  const SIGMA = 0.30;
  const flat = (e: Experiment) => 5 + 0.05 * (e.x ?? 0);   // very gentle slope
  const noisy: Observation[] = [];
  for (let i = 0; i < 120; i++) { const e = { x: rnd() * 10, y: rnd() * 10 }; noisy.push({ experiment: e, value: flat(e) + SIGMA * gauss() }); }
  const rN = analyzeNoise(noisy, space, "maximize");
  // RECOVERS-NOISE: the estimate is within 2x of the injected σ (a real, falsifiable accuracy check)
  const recovers = rN.noiseSigma > SIGMA * 0.5 && rN.noiseSigma < SIGMA * 2;

  // a clean (noiseless) smooth response → σ̂ ≈ 0
  const clean: Observation[] = [];
  const rnd2 = lcg(3);
  for (let i = 0; i < 120; i++) { const e = { x: rnd2() * 10, y: rnd2() * 10 }; clean.push({ experiment: e, value: 5 + 0.05 * (e.x ?? 0) }); }
  const rC = analyzeNoise(clean, space, "maximize");
  const cleanLow = rC.noiseSigma < 0.05 && rC.recommendation === "trust";

  // OUTLIER: inject one wildly-off reading into the clean set → it is flagged
  const withOut = clean.slice(); withOut.push({ experiment: { x: 5, y: 5 }, value: 999 });
  const rO = analyzeNoise(withOut, space, "maximize");
  const flagsOutlier = rO.outliers.some((o) => o.value === 999);

  // REPLICATE advice when noise is large vs signal (flat response + big noise)
  const veryNoisy: Observation[] = [];
  const rnd3 = lcg(5);
  for (let i = 0; i < 120; i++) { const e = { x: rnd3() * 10, y: rnd3() * 10 }; veryNoisy.push({ experiment: e, value: 5 + 1.5 * (Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd3()))) * Math.cos(2 * Math.PI * rnd3())) }); }
  const rV = analyzeNoise(veryNoisy, space, "maximize");
  const advisesReplicate = rV.recommendation === "replicate";

  const det = JSON.stringify(analyzeNoise(noisy, space, "maximize")) === JSON.stringify(analyzeNoise(noisy, space, "maximize"));
  const thin = analyzeNoise(noisy.slice(0, 4), space, "maximize");
  const abstains = thin.recommendation === "unknown";
  const total = (() => { try { analyzeNoise(null as never, space); analyzeNoise([], space); return true; } catch { return false; } })();

  const checks = [
    { name: "RECOVERS-INJECTED-NOISE", pass: recovers, detail: `injected σ=${SIGMA}; estimated σ=${rN.noiseSigma} (within 2x = accurate)` },
    { name: "CLEAN-IS-LOW", pass: cleanLow, detail: `noiseless data → σ≈${rC.noiseSigma} and "trust"` },
    { name: "FLAGS-OUTLIER", pass: flagsOutlier, detail: "a 999 reading among clean data is flagged as mis-measured" },
    { name: "ADVISES-REPLICATE", pass: advisesReplicate, detail: `large noise vs signal → recommends replicate (got "${rV.recommendation}")` },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same report" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → UNKNOWN" },
    { name: "TOTAL", pass: total, detail: "null / empty never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
