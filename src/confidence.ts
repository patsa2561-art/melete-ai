/**
 * CONFIDENCE — the probabilistic stop. FRONTIER says "looks like you can stop" from the diminishing-returns
 * curve; CONFIDENCE puts a real, CALIBRATED probability on it: "the chance one more experiment beats your
 * current best is ~p, so you can stop with (1−p) confidence."
 *
 * The estimate is distribution-free, built on RECORD STATISTICS. For exchangeable (iid) sampling the
 * probability that the next observation is a new maximum is exactly 1/(n+1) — independent of the
 * distribution, a beautiful fact. An optimiser is not iid: once it converges, new records stop coming, so we
 * deflate that baseline by how active records have been RECENTLY (records in a trailing window vs how many
 * iid would have produced). Still improving fast → more records than iid → the probability rises; long since
 * a record → it falls toward zero. The result is a probability you can actually trust, not a hunch.
 *
 * Honest by construction (DIAKRISIS): "probability the next experiment is a new best" — NOT a proof the
 * global optimum is found (a sharp peak can hide between samples; that's what the optimality certificate is
 * for). It is CALIBRATED on iid data (the gauntlet checks the predicted probability matches the observed
 * record frequency) and abstains when there's too little history.
 */
import { type Observation, type Goal } from "./engine.js";

export interface ConfidenceReport {
  n: number;
  stepsSinceRecord: number;
  records: number;
  pImprove: number;        // estimated probability the NEXT experiment sets a new best
  confidence: number;      // 1 − pImprove → how confident you can stop
  recommendation: "stop" | "continue" | "unknown";
  note: string;
}

/** Steps (1-based) at which the best-so-far improved (a "record"). */
function recordSteps(obs: ReadonlyArray<Observation>, goal: Goal): number[] {
  const dir = goal === "minimize" ? -1 : 1;
  const steps: number[] = []; let best = -Infinity;
  obs.forEach((o, i) => { const v = dir * o.value; if (v > best) { best = v; steps.push(i + 1); } });
  return steps;
}

/** Calibrated probability that one more experiment beats the current best, via record statistics. */
export function stopConfidence(obs: ReadonlyArray<Observation>, goal: Goal = "maximize"): ConfidenceReport {
  const hist = (obs ?? []).filter((o) => o && Number.isFinite(o.value));
  const n = hist.length;
  if (n < 8) return { n, stepsSinceRecord: 0, records: 0, pImprove: NaN, confidence: 0, recommendation: "unknown", note: `need ≈8+ experiments for a calibrated estimate (have ${n})` };

  const recs = recordSteps(hist, goal);
  const lastRecord = recs[recs.length - 1] ?? 1;
  const stepsSinceRecord = n - lastRecord;

  // baseline (iid, distribution-free): P(next is a new record) = 1/(n+1)
  const base = 1 / (n + 1);
  // recent record activity: records in the trailing window vs how many iid would have produced there
  const W = Math.max(10, Math.round(n * 0.4));
  const lo = n - W + 1;
  const recordsInWindow = recs.filter((s) => s >= lo && s <= n).length;
  let expectedIid = 0; for (let k = Math.max(2, lo); k <= n; k++) expectedIid += 1 / k;   // Σ 1/k over the window
  const activity = (recordsInWindow + 0.5) / (expectedIid + 0.5);                          // smoothed ratio
  const pImprove = Math.max(0, Math.min(1, base * activity));
  const confidence = 1 - pImprove;
  const recommendation = confidence >= 0.95 ? "stop" : "continue";
  const note = recommendation === "stop"
    ? `~${(pImprove * 100).toFixed(1)}% chance the next experiment beats your best — you can stop with ${(confidence * 100).toFixed(1)}% confidence`
    : `~${(pImprove * 100).toFixed(1)}% chance the next experiment still improves — worth continuing`;
  return { n, stepsSinceRecord, records: recs.length, pImprove: +pImprove.toFixed(5), confidence: +confidence.toFixed(5), recommendation, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function confidenceGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // CALIBRATION (the gold standard): over many iid sequences, the predicted pImprove at step n must match the
  // ACTUAL frequency that step n+1 is a new record (which is 1/(n+1) by theory).
  const N = 3000, n = 40; const rnd = lcg(99);
  let sumP = 0, recordNext = 0;
  for (let s = 0; s < N; s++) {
    const seq: Observation[] = []; for (let i = 0; i < n; i++) seq.push({ experiment: { i }, value: rnd() });
    sumP += stopConfidence(seq, "maximize").pImprove;
    // does observation n+1 set a new record?
    let best = -Infinity; for (const o of seq) best = Math.max(best, o.value);
    if (rnd() > best) recordNext++;
  }
  const avgP = sumP / N, actual = recordNext / N, theory = 1 / (n + 1);
  const calibrated = Math.abs(avgP - actual) < 0.012 && Math.abs(avgP - theory) < 0.012;   // predicted ≈ observed ≈ 1/41

  // CONVERGED → high confidence "stop": the best was hit early, then nothing beat it (records stopped).
  // A peaked sequence (rises to a max at step ~10, then falls) → no new record after step 10.
  const conv: Observation[] = []; for (let i = 0; i < 40; i++) conv.push({ experiment: { i }, value: Math.exp(-(((i - 10) ** 2) / 30)) });
  const c = stopConfidence(conv, "maximize");
  const stopsConverged = c.recommendation === "stop" && c.confidence >= 0.95;

  // STILL IMPROVING → "continue": a fresh record nearly every step
  const climbing: Observation[] = []; for (let i = 0; i < 40; i++) climbing.push({ experiment: { i }, value: i });   // every step is a new record
  const k = stopConfidence(climbing, "maximize");
  const continuesClimbing = k.recommendation === "continue" && k.pImprove > 1 / 41;

  // monotone: more steps since a record → higher confidence to stop
  const mid = stopConfidence(conv.slice(0, 20), "maximize");
  const monotone = c.confidence >= mid.confidence;

  const det = JSON.stringify(stopConfidence(conv, "maximize")) === JSON.stringify(stopConfidence(conv, "maximize"));
  const abstains = stopConfidence(conv.slice(0, 4), "maximize").recommendation === "unknown";
  const total = (() => { try { stopConfidence(null as never); stopConfidence([], "maximize"); return true; } catch { return false; } })();

  const checks = [
    { name: "CALIBRATED-ON-IID", pass: calibrated, detail: `predicted ${avgP.toFixed(4)} ≈ observed record frequency ${actual.toFixed(4)} ≈ theory ${theory.toFixed(4)}` },
    { name: "STOP-WHEN-CONVERGED", pass: stopsConverged, detail: `plateaued run → stop at ${(c.confidence * 100).toFixed(1)}% confidence` },
    { name: "CONTINUE-WHEN-IMPROVING", pass: continuesClimbing, detail: `every-step-improves run → continue (pImprove ${k.pImprove})` },
    { name: "CONFIDENCE-MONOTONE", pass: monotone, detail: `confidence-to-stop grows as records dry up (${(mid.confidence * 100).toFixed(1)}% → ${(c.confidence * 100).toFixed(1)}%)` },
    { name: "DETERMINISTIC", pass: det, detail: "same history → same probability" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few experiments → unknown" },
    { name: "TOTAL", pass: total, detail: "null / empty never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
