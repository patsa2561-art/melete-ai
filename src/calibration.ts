/**
 * 🎯 THE CALIBRATION CERTIFICATE — when a model or agent says "90% sure", is it right ~90% of the time?
 *
 * Agents emit confidences constantly — a probability on a claim, a risk score, a "likely / unlikely". A
 * confidence is only useful if it is CALIBRATED: of all the times it says 90%, about 90% should come true.
 * Modern models are routinely OVER-confident (they say 90% and are right 70%), and a downstream agent that
 * trusts those numbers compounds the error. Nobody hands you a signed proof that a predictor's stated
 * confidence is trustworthy.
 *
 * This certificate tests calibration with Spiegelhalter's Z (a closed-form test that is N(0,1) under perfect
 * calibration) at a conservative critical value, reports the Expected Calibration Error + the reliability
 * curve + the over/under-confidence gap, and signs the verdict. CALIBRATED means the stated confidences hold
 * up; MISCALIBRATED names the direction. Ed25519-signed; Z, ECE and the verdict re-derive offline.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot hold the prediction-outcome pairs, compute Spiegelhalter's Z and
 * the binned reliability curve, and sign a re-derivable calibration verdict — it just emits another confident
 * number. (DIAKRISIS — MEASURED: a truly-calibrated predictor is falsely flagged ≤ α; an over-confident one
 * is detected ~100% with the direction named and a much higher ECE; histogram recalibration measurably lowers
 * the ECE on held-out data. HONEST: this is MARGINAL calibration over the evaluated set, and the outcomes must
 * be the genuine ground truth — it cannot detect a predictor that is miscalibrated only on inputs you never
 * tested.)
 */
import { lcg } from "./space.js";
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
const CRIT = 2.05;   // conservative critical value for Spiegelhalter's Z → realized false-positive ≤ α (measured)

function clip01(p: number): number { return Math.min(1 - 1e-9, Math.max(1e-9, p)); }
// Spiegelhalter's Z: Σ(yᵢ−pᵢ)(1−2pᵢ) / √Σ(1−2pᵢ)²pᵢ(1−pᵢ) — N(0,1) under perfect calibration
function spiegelhalterZ(p: number[], y: number[]): number {
  let num = 0, den = 0; for (let i = 0; i < p.length; i++) { const pi = clip01(p[i]); num += (y[i] - pi) * (1 - 2 * pi); den += (1 - 2 * pi) * (1 - 2 * pi) * pi * (1 - pi); }
  return den > 0 ? num / Math.sqrt(den) : 0;
}
function reliabilityBins(p: number[], y: number[], M: number): Array<{ lo: number; hi: number; count: number; confidence: number; accuracy: number }> {
  const n = new Array(M).fill(0), sa = new Array(M).fill(0), sc = new Array(M).fill(0);
  for (let i = 0; i < p.length; i++) { const b = Math.min(M - 1, Math.max(0, Math.floor(clip01(p[i]) * M))); n[b]++; sa[b] += y[i]; sc[b] += clip01(p[i]); }
  const out = []; for (let b = 0; b < M; b++) out.push({ lo: b / M, hi: (b + 1) / M, count: n[b], confidence: n[b] ? sc[b] / n[b] : 0, accuracy: n[b] ? sa[b] / n[b] : 0 });
  return out;
}
function eceOf(bins: Array<{ count: number; confidence: number; accuracy: number }>, N: number): number {
  if (N === 0) return 0; let e = 0; for (const b of bins) if (b.count) e += (b.count / N) * Math.abs(b.accuracy - b.confidence); return e;
}
// histogram recalibration: map a prediction to the empirical accuracy of its bin on a calibration split
export function histogramRecalibrate(calP: number[], calY: number[], testP: number[], M = 15): number[] {
  const bins = reliabilityBins(calP, calY, M);
  return testP.map((p) => { const b = Math.min(M - 1, Math.max(0, Math.floor(clip01(p) * M))); return bins[b].count ? bins[b].accuracy : clip01(p); });
}

export interface CalibrationCertificate {
  standard: "melete-calibration-certificate/v1";
  verdict: "CALIBRATED" | "MISCALIBRATED";
  direction: "WELL-CALIBRATED" | "OVERCONFIDENT" | "UNDERCONFIDENT";
  n: number;
  bins: number;
  criticalValue: number;
  spiegelhalterZ: number;            // |Z| ≤ criticalValue ⇒ calibrated
  ece: number;                       // expected calibration error
  meanConfidence: number;
  meanAccuracy: number;
  overconfidenceScore: number;       // mean of sign(pᵢ−½)·(pᵢ−yᵢ): >0 ⇒ predictions too extreme (over-confident), <0 ⇒ too timid
  reliability: Array<{ lo: number; hi: number; count: number; confidence: number; accuracy: number }>;
  predictions: number[];
  outcomes: number[];
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

export function calibrationCertificate(opts: { predictions: number[]; outcomes: number[]; bins?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): CalibrationCertificate {
  const M = Math.max(2, opts.bins ?? 15);
  const predictions = (opts.predictions ?? []).map(clip01); const outcomes = (opts.outcomes ?? []).map((v) => (v ? 1 : 0));
  const n = Math.min(predictions.length, outcomes.length);
  const p = predictions.slice(0, n), y = outcomes.slice(0, n);
  const Z = spiegelhalterZ(p, y); const bins = reliabilityBins(p, y, M); const ece = eceOf(bins, n);
  let sc = 0, sy = 0, sscore = 0; for (let i = 0; i < n; i++) { sc += p[i]; sy += y[i]; sscore += Math.sign(p[i] - 0.5) * (p[i] - y[i]); }
  const meanConfidence = n ? sc / n : 0, meanAccuracy = n ? sy / n : 0, score = n ? sscore / n : 0;
  const calibrated = Math.abs(Z) <= CRIT;
  const direction: CalibrationCertificate["direction"] = calibrated ? "WELL-CALIBRATED" : (score > 0 ? "OVERCONFIDENT" : "UNDERCONFIDENT");
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-calibration-certificate/v1" as const, verdict: (calibrated ? "CALIBRATED" : "MISCALIBRATED") as CalibrationCertificate["verdict"], direction, n, bins: M, criticalValue: CRIT, spiegelhalterZ: Z, ece, meanConfidence, meanAccuracy, overconfidenceScore: score, reliability: bins, predictions: p, outcomes: y };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyCalibrationCertificate(c: CalibrationCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-calibration-certificate/v1") return { ok: false, reason: "unknown standard" };
    if (c.predictions.length !== c.n || c.outcomes.length !== c.n) return { ok: false, reason: "prediction/outcome count does not match n" };
    if (Math.abs(c.criticalValue - CRIT) > 1e-9) return { ok: false, reason: "critical value differs" };
    const Z = spiegelhalterZ(c.predictions, c.outcomes); const bins = reliabilityBins(c.predictions, c.outcomes, c.bins); const ece = eceOf(bins, c.n);
    if (Math.abs(Z - c.spiegelhalterZ) > 1e-6 || Math.abs(ece - c.ece) > 1e-6) return { ok: false, reason: "recomputed Z / ECE differ — calibration misstated" };
    const calibrated = Math.abs(Z) <= CRIT; const verdict = calibrated ? "CALIBRATED" : "MISCALIBRATED";
    if (verdict !== c.verdict) return { ok: false, reason: `recomputed verdict ${verdict} ≠ certificate ${c.verdict} — miscalibration hidden` };
    let sscore = 0; for (let i = 0; i < c.n; i++) sscore += Math.sign(c.predictions[i] - 0.5) * (c.predictions[i] - c.outcomes[i]); const score = c.n ? sscore / c.n : 0;
    if (Math.abs(score - c.overconfidenceScore) > 1e-6) return { ok: false, reason: "recomputed overconfidence score differs" };
    const direction = calibrated ? "WELL-CALIBRATED" : (score > 0 ? "OVERCONFIDENT" : "UNDERCONFIDENT");
    if (direction !== c.direction) return { ok: false, reason: "direction inconsistent with the score" };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, direction: c.direction, n: c.n, bins: c.bins, criticalValue: c.criticalValue, spiegelhalterZ: c.spiegelhalterZ, ece: c.ece, meanConfidence: c.meanConfidence, meanAccuracy: c.meanAccuracy, overconfidenceScore: c.overconfidenceScore, reliability: c.reliability, predictions: c.predictions, outcomes: c.outcomes })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a pair was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `${c.verdict} (${c.direction}); Z=${c.spiegelhalterZ.toFixed(2)} (|Z|≤${CRIT}?), ECE=${(c.ece * 100).toFixed(1)}%` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function calibrationGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const N = 1000;
  const calStream = (g: () => number) => { const p: number[] = [], y: number[] = []; for (let i = 0; i < N; i++) { const q = g(); p.push(q); y.push(g() < q ? 1 : 0); } return { p, y }; };
  const overStream = (g: () => number) => { const p: number[] = [], y: number[] = []; for (let i = 0; i < N; i++) { const q = g(); p.push(clip01(0.5 + 1.5 * (q - 0.5))); y.push(g() < q ? 1 : 0); } return { p, y }; };
  const underStream = (g: () => number) => { const p: number[] = [], y: number[] = []; for (let i = 0; i < N; i++) { const q = g(); p.push(0.5 + 0.4 * (q - 0.5)); y.push(g() < q ? 1 : 0); } return { p, y }; };

  // 1) CALIBRATED-NOT-FLAGGED ≤ α; 2) DETECTS-OVERCONFIDENCE (+direction) ; 3) ECE-CONTRAST
  let calFalse = 0, calEce = 0, overDet = 0, overDir = 0, overEce = 0, underDet = 0, underDir = 0, K = 1500;
  for (let s = 1; s <= K; s++) {
    const cg = calStream(lcg(s * 17 + 1)); const cc = calibrationCertificate({ predictions: cg.p, outcomes: cg.y }); if (cc.verdict === "MISCALIBRATED") calFalse++; calEce += cc.ece;
    const og = overStream(lcg(s * 29 + 3)); const co = calibrationCertificate({ predictions: og.p, outcomes: og.y }); if (co.verdict === "MISCALIBRATED") overDet++; if (co.direction === "OVERCONFIDENT") overDir++; overEce += co.ece;
    const ug = underStream(lcg(s * 41 + 5)); const cu = calibrationCertificate({ predictions: ug.p, outcomes: ug.y }); if (cu.verdict === "MISCALIBRATED") underDet++; if (cu.direction === "UNDERCONFIDENT") underDir++;
  }
  const calFalseRate = calFalse / K, overDetRate = overDet / K, overDirRate = overDet ? overDir / overDet : 0, underDetRate = underDet / K, underDirRate = underDet ? underDir / underDet : 0;
  const calEceAvg = calEce / K, overEceAvg = overEce / K;

  // 4) RECALIBRATION-HELPS: histogram recalibration on a split lowers ECE on held-out
  let before = 0, after = 0, RC = 500;
  for (let s = 1; s <= RC; s++) {
    const g = lcg(s * 53 + 7); const o = overStream(g);   // overconfident; split in half
    const half = N / 2; const calP = o.p.slice(0, half), calY = o.y.slice(0, half), teP = o.p.slice(half), teY = o.y.slice(half);
    const raw = calibrationCertificate({ predictions: teP, outcomes: teY }); before += raw.ece;
    const recalP = histogramRecalibrate(calP, calY, teP); const rc = calibrationCertificate({ predictions: recalP, outcomes: teY }); after += rc.ece;
  }
  const eceBefore = before / RC, eceAfter = after / RC;

  // 5) SIGNED + FORGERY (claim CALIBRATED) + TAMPER + DETERMINISTIC + TOTAL
  const og = overStream(lcg(9)); const cc = calibrationCertificate({ predictions: og.p, outcomes: og.y });
  const verifyOk = verifyCalibrationCertificate(cc).ok && cc.verdict === "MISCALIBRATED";
  const forged = { ...cc, verdict: "CALIBRATED" as const, direction: "WELL-CALIBRATED" as const };
  const forgeryCaught = !verifyCalibrationCertificate(forged).ok;
  const tamper = !verifyCalibrationCertificate({ ...cc, outcomes: cc.outcomes.map((v, i) => (i < 200 ? 1 - v : v)) }).ok;
  const cg = calStream(lcg(3)); const d1 = calibrationCertificate({ predictions: cg.p, outcomes: cg.y }), d2 = calibrationCertificate({ predictions: cg.p, outcomes: cg.y });
  const deterministic = d1.payloadHash === d2.payloadHash && verifyCalibrationCertificate(d1).ok;
  let total = true; try { calibrationCertificate({ predictions: [], outcomes: [] }); calibrationCertificate({ predictions: [NaN, 0.5], outcomes: [1, 0] }); } catch { total = false; }

  const checks = [
    { name: "CALIBRATED-NOT-FLAGGED ≤ α", pass: calFalseRate <= 0.05, detail: `a truly-calibrated predictor was falsely flagged MISCALIBRATED only ${(calFalseRate * 100).toFixed(1)}% (Spiegelhalter Z, conservative crit ${CRIT})` },
    { name: "DETECTS-OVERCONFIDENCE (+direction)", pass: overDetRate >= 0.9 && overDirRate >= 0.999, detail: `an over-confident predictor was flagged MISCALIBRATED ${(overDetRate * 100).toFixed(0)}% and labelled OVERCONFIDENT ${(overDirRate * 100).toFixed(0)}%` },
    { name: "DETECTS-UNDERCONFIDENCE (+direction)", pass: underDetRate >= 0.9 && underDirRate >= 0.999, detail: `an under-confident predictor was flagged MISCALIBRATED ${(underDetRate * 100).toFixed(0)}% and labelled UNDERCONFIDENT ${(underDirRate * 100).toFixed(0)}%` },
    { name: "ECE-CONTRAST", pass: overEceAvg > calEceAvg * 1.5, detail: `expected calibration error: over-confident ${(overEceAvg * 100).toFixed(1)}% vs calibrated ${(calEceAvg * 100).toFixed(1)}% (the binning bias floor)` },
    { name: "RECALIBRATION-HELPS", pass: eceAfter < eceBefore * 0.7, detail: `histogram recalibration on a split lowered held-out ECE from ${(eceBefore * 100).toFixed(1)}% to ${(eceAfter * 100).toFixed(1)}% — the fix, not just the diagnosis` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "Z + ECE + verdict re-derive from the recorded prediction-outcome pairs" },
    { name: "FORGERY-CAUGHT (fake CALIBRATED)", pass: forgeryCaught, detail: "claiming CALIBRATED when the Z-test rejects is rejected on re-derivation" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "flipping recorded outcomes breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same pairs → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty / NaN inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
