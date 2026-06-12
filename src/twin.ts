/**
 * WHAT-IF TWIN — let anyone poke the result without paying for an experiment. Once Melete has watched your
 * process a few times, it has effectively learned a cheap stand-in for it — a digital twin. So a
 * non-technical user can simply ask "what if I set the temperature to 90 and the dose to 19?" and get an
 * instant predicted score — together with the one thing every other predictor hides: HOW MUCH TO TRUST IT.
 *
 * Near settings you've actually measured, the twin is confident and accurate. Far from your data it says so
 * out loud — "this is a guess" — instead of pretending. That honesty is the whole point: a prediction you
 * can't trust is worse than no prediction, so the twin grades its own confidence by how close your question
 * is to real evidence.
 *
 * Honest by construction (DIAKRISIS): the prediction is inverse-distance interpolation of your real
 * measurements (it can't conjure structure that isn't in the data), and confidence is graded purely by
 * distance to the nearest evidence relative to your data's own spacing. The gauntlet proves it with
 * leave-one-out cross-validation (accurate where data is dense) AND that it flags far-away queries as
 * guesses (honest where data is absent). It abstains entirely when there's too little data to stand in for
 * anything.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation } from "./engine.js";

export interface WhatIfReport {
  predicted: number;
  confidence: "measured" | "confident" | "rough" | "guess" | "unknown";
  uncertainty: number;            // ± band, in score units
  nearestKnown: { distance: number; value: number } | null;  // closest real measurement
  note: string;
}

const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/** Predict the score at a proposed setting from the measurements so far, with an honest confidence grade. */
export function predictAt(obs: ReadonlyArray<Observation>, space: Space, query: Experiment): WhatIfReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < 4 || !query) {
    return { predicted: NaN, confidence: "unknown", uncertainty: NaN, nearestKnown: null, note: `need ≈4+ measurements before the twin can predict (have ${n})` };
  }
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const npts = hist.map((o) => toN(o.experiment));
  const vals = hist.map((o) => o.value);
  const q = toN(query);

  // inverse-distance-weighted prediction (Shepard)
  let sw = 0, swv = 0, dmin = Infinity, nearVal = vals[0];
  for (let i = 0; i < n; i++) { const d = dst(q, npts[i]); if (d < dmin) { dmin = d; nearVal = vals[i]; } const w = 1 / (d * d + 1e-9); sw += w; swv += w * vals[i]; }
  const predicted = swv / sw;

  // data's own spacing: median nearest-neighbour distance
  const nn: number[] = [];
  for (let i = 0; i < n; i++) { let m = Infinity; for (let j = 0; j < n; j++) if (j !== i) m = Math.min(m, dst(npts[i], npts[j])); nn.push(m); }
  const sortedNN = nn.slice().sort((a, b) => a - b);
  const spacing = Math.max(1e-6, sortedNN[Math.floor(sortedNN.length / 2)]);
  const vRange = Math.max(1e-9, Math.max(...vals) - Math.min(...vals));

  const ratio = dmin / spacing;                                   // how far the query is, in units of normal spacing
  const uncertainty = +(vRange * (1 - Math.exp(-(ratio * ratio) / 2))).toFixed(4);
  const confidence: WhatIfReport["confidence"] = ratio < 0.4 ? "measured" : ratio < 1.2 ? "confident" : ratio < 2.5 ? "rough" : "guess";
  const f = (x: number) => (Math.abs(x) < 1 ? +x.toFixed(3) : +x.toFixed(2));
  const note = confidence === "measured" ? `≈ ${f(predicted)} — you've measured almost exactly here, so this is reliable`
    : confidence === "confident" ? `≈ ${f(predicted)} ± ${f(uncertainty)} — close to settings you've tested, fairly reliable`
    : confidence === "rough" ? `≈ ${f(predicted)} ± ${f(uncertainty)} — a rough estimate; you haven't tested near here`
    : `≈ ${f(predicted)} but this is a GUESS — far from anything you've measured; test it before trusting it`;
  return { predicted: +predicted.toFixed(6), confidence, uncertainty, nearestKnown: { distance: +dmin.toFixed(4), value: +nearVal.toFixed(6) }, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function twinGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const f = (x: number, y: number) => 0.5 * (x + y) + 0.15 * Math.sin(3 * x);   // smooth, spans a clear range
  const rnd = lcg(13); const obs: Observation[] = [];
  for (let i = 0; i < 90; i++) { const x = rnd(), y = rnd(); obs.push({ experiment: { x, y }, value: f(x, y) }); }

  // ACCURATE-IN-REGION: leave-one-out cross-validation — predict each point from the OTHERS, mean error small
  let sumErr = 0, cnt = 0;
  for (let i = 0; i < obs.length; i += 3) { const rest = obs.filter((_, j) => j !== i); const r = predictAt(rest, space, obs[i].experiment); if (Number.isFinite(r.predicted)) { sumErr += Math.abs(r.predicted - obs[i].value); cnt++; } }
  const cvErr = sumErr / cnt;
  const accurate = cvErr < 0.05;

  // CONFIDENT-NEAR-DATA: query an actual measured point → high confidence + prediction ≈ truth
  const probe = obs[10];
  const near = predictAt(obs, space, probe.experiment);
  const confidentNear = (near.confidence === "measured" || near.confidence === "confident") && Math.abs(near.predicted - probe.value) < 0.05;

  // HONEST-FAR: a query far outside the sampled cloud → flagged a guess, big uncertainty
  // (sample only the lower-left; ask about the far corner)
  const corner: Observation[] = []; const r2 = lcg(4);
  for (let i = 0; i < 60; i++) { const x = r2() * 0.3, y = r2() * 0.3; corner.push({ experiment: { x, y }, value: f(x, y) }); }
  const far = predictAt(corner, space, { x: 0.95, y: 0.95 });
  const honestFar = far.confidence === "guess" && far.uncertainty > 0.05;

  // MONOTONE-UNCERTAINTY: farther from data → not-smaller uncertainty
  const u1 = predictAt(corner, space, { x: 0.2, y: 0.2 }).uncertainty;
  const u2 = predictAt(corner, space, { x: 0.6, y: 0.6 }).uncertainty;
  const u3 = predictAt(corner, space, { x: 0.95, y: 0.95 }).uncertainty;
  const monotone = u2 >= u1 - 1e-9 && u3 >= u2 - 1e-9;

  const det = JSON.stringify(predictAt(obs, space, { x: 0.5, y: 0.5 })) === JSON.stringify(predictAt(obs, space, { x: 0.5, y: 0.5 }));
  const abstains = predictAt(obs.slice(0, 3), space, { x: 0.5, y: 0.5 }).confidence === "unknown";
  const total = (() => { try { predictAt(null as never, space, { x: 0 }); predictAt([], space, { x: 0 }); predictAt(obs, space, null as never); return true; } catch { return false; } })();

  const checks = [
    { name: "ACCURATE-IN-REGION", pass: accurate, detail: `leave-one-out mean error ${cvErr.toFixed(4)} < 0.05` },
    { name: "CONFIDENT-NEAR-DATA", pass: confidentNear, detail: `at a measured point → "${near.confidence}", predicted ${near.predicted.toFixed(3)} vs true ${probe.value.toFixed(3)}` },
    { name: "HONEST-WHEN-FAR", pass: honestFar, detail: `far corner → "${far.confidence}" (±${far.uncertainty}) — owns up that it's guessing` },
    { name: "UNCERTAINTY-GROWS-WITH-DISTANCE", pass: monotone, detail: `± rises as you leave the data (${u1} → ${u2} → ${u3})` },
    { name: "DETERMINISTIC", pass: det, detail: "same query → same prediction" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → unknown" },
    { name: "TOTAL", pass: total, detail: "null / empty / null-query never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
