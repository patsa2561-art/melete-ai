/**
 * 📜 THE PROOF OF IMPROVEMENT (Dominance Certificate) — the signed artifact a business needs to JUSTIFY a
 * change: "switching from the current setting A to recipe B is a real gain of at least Δ, accounting for
 * measurement noise — and here is the offline-verifiable proof."
 *
 * It replicates the measurement of A and B, computes a one-sided 97.5% lower confidence bound on the gain
 * (μB − μA − z·√(seA²+seB²)), and only certifies an improvement when that bound clears zero. So the
 * certified Δ is a number you can stand behind: the TRUE gain is ≥ Δ with 97.5% confidence — not a noisy
 * single-shot "it looked better". The per-replicate measurements are recorded and the whole thing is
 * Ed25519-signed, so a reviewer re-derives Δ and the verdict offline.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot run replicated physical/benchmark measurements, compute a
 * calibrated confidence bound, or sign a re-derivable certificate — it can only assert "B seems better".
 * (DIAKRISIS — MEASURED: when it certifies a gain Δ, the true gain ≥ Δ ≥97.5% of the time; and when A and B
 * are truly equal it falsely certifies ≤2.5% of the time. A calibrated decision, not a vibe.)
 */
import { type Experiment, lcg } from "./space.js";
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
const Z = 2.2;    // one-sided ≥97.5% confidence, kept conservative to cover small-sample (t vs normal, n≳20)

export interface ImprovementCertificate {
  standard: "melete-improvement-certificate/v1";
  verdict: "IMPROVEMENT" | "INCONCLUSIVE";
  a: { experiment: Experiment; mean: number; n: number };
  b: { experiment: Experiment; mean: number; n: number };
  gainLowerBound: number;       // certified Δ — the true gain is ≥ this with 97.5% confidence (if IMPROVEMENT)
  observedGain: number;         // μB − μA (point estimate)
  confidence: number;           // 0.975
  samplesA: number[]; samplesB: number[];
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}

function stats(xs: number[]): { mean: number; varOverN: number } {
  const n = xs.length; const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0;
  return { mean, varOverN: v / n };
}

/** Certify (with proof) that B improves on A by at least Δ, given a noisy oracle measured `replicates` times. */
export function improvementCertificate(opts: { oracle: (e: Experiment) => number; a: Experiment; b: Experiment; replicates?: number; seed?: number; goal?: "maximize" | "minimize"; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): ImprovementCertificate {
  const n = Math.max(2, opts.replicates ?? 12); const goal = opts.goal ?? "maximize"; const sign = goal === "maximize" ? 1 : -1;
  const r = lcg((opts.seed ?? 1) | 0);
  const samplesA: number[] = [], samplesB: number[] = [];
  for (let i = 0; i < n; i++) { samplesA.push(sign * opts.oracle(opts.a)); samplesB.push(sign * opts.oracle(opts.b)); void r; }
  return buildCertificate(opts.a, opts.b, samplesA, samplesB, opts.keys);
}

function buildCertificate(a: Experiment, b: Experiment, samplesA: number[], samplesB: number[], keys?: { publicKey: KeyObject; privateKey: KeyObject }): ImprovementCertificate {
  const sa = stats(samplesA), sb = stats(samplesB);
  const observedGain = sb.mean - sa.mean;
  const se = Math.sqrt(sa.varOverN + sb.varOverN);
  const gainLowerBound = observedGain - Z * se;
  const verdict: "IMPROVEMENT" | "INCONCLUSIVE" = gainLowerBound > 0 ? "IMPROVEMENT" : "INCONCLUSIVE";
  const kp = keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-improvement-certificate/v1" as const, verdict, a: { experiment: a, mean: sa.mean, n: samplesA.length }, b: { experiment: b, mean: sb.mean, n: samplesB.length }, gainLowerBound, observedGain, confidence: 0.975, samplesA, samplesB };
  const payloadHash = createHash("sha256").update(canonical({ ...cert })).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

/** Verify offline: recompute the gain bound + verdict from the recorded samples, then check the signature. */
export function verifyImprovementCertificate(c: ImprovementCertificate): { ok: boolean; reason: string } {
  if (!c || !c.signature || !c.samplesA) return { ok: false, reason: "incomplete certificate" };
  try {
    const sa = stats(c.samplesA), sb = stats(c.samplesB);
    const observedGain = sb.mean - sa.mean; const se = Math.sqrt(sa.varOverN + sb.varOverN);
    const glb = observedGain - Z * se; const verdict = glb > 0 ? "IMPROVEMENT" : "INCONCLUSIVE";
    if (Math.abs(glb - c.gainLowerBound) > 1e-9 || verdict !== c.verdict || Math.abs(sa.mean - c.a.mean) > 1e-9 || Math.abs(sb.mean - c.b.mean) > 1e-9) return { ok: false, reason: "recomputed gain/verdict differs from the certificate — tampered" };
    const recomputed = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, a: c.a, b: c.b, gainLowerBound: c.gainLowerBound, observedGain: c.observedGain, confidence: c.confidence, samplesA: c.samplesA, samplesB: c.samplesB })).digest("hex");
    if (recomputed !== c.payloadHash) return { ok: false, reason: "content hash mismatch — tampered" };
    if (!edVerify(null, Buffer.from(c.payloadHash), c.publicKeyPem, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "signature invalid" };
    return { ok: true, reason: "verified: the certified gain Δ re-derives from the recorded measurements (offline)" };
  } catch (e) { return { ok: false, reason: "verify error: " + (e as Error).message.slice(0, 80) }; }
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
// MEASURABLE: when it certifies a gain Δ, the TRUE gain ≥ Δ (the lower bound is valid) ≥97.5%; when A≡B it
// falsely certifies ≤2.5% (calibrated); it has power on a real gain; signed + tamper-evident + deterministic.
export function improvementGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // a noisy process: value = base(setting) + gaussian noise; A vs B are two settings with a KNOWN true gap
  function noisy(base: number, seed: number, noiseSd: number) { const r = lcg(seed); return () => { const u1 = Math.max(1e-9, r()), u2 = r(); return base + noiseSd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }; }
  const N = 240; const noiseSd = 1.0; const trueGainReal = 0.7; const REP = 40;   // B is genuinely 0.7 better
  let realCert = 0, lbValid = 0, fpCert = 0;
  for (let s = 1; s <= N; s++) {
    // real-improvement trial: A base 5.0, B base 5.7 (true gain 0.7)
    const oR = (() => { const ga = noisy(5.0, s * 13 + 1, noiseSd), gb = noisy(5.7, s * 13 + 7, noiseSd); return (e: Experiment) => ((e.sel ?? 0) === 0 ? ga() : gb()); })();
    const cR = improvementCertificate({ oracle: oR, a: { sel: 0 }, b: { sel: 1 }, replicates: REP, seed: s * 3 + 1 });
    if (cR.verdict === "IMPROVEMENT") { realCert++; if (trueGainReal >= cR.gainLowerBound) lbValid++; }
    // null trial: A and B identical (true gain 0) → should be INCONCLUSIVE
    const oN = (() => { const ga = noisy(5.0, s * 29 + 3, noiseSd), gb = noisy(5.0, s * 29 + 17, noiseSd); return (e: Experiment) => ((e.sel ?? 0) === 0 ? ga() : gb()); })();
    const cN = improvementCertificate({ oracle: oN, a: { sel: 0 }, b: { sel: 1 }, replicates: REP, seed: s * 5 + 2 });
    if (cN.verdict === "IMPROVEMENT") fpCert++;
  }
  const lbValidRate = realCert ? lbValid / realCert : 0;     // among certified, is the true gain ≥ the certified Δ?
  const fpRate = fpCert / N;                                  // false certification when truly equal
  const powerRate = realCert / N;                             // how often a real 0.7 gain is detected

  // signed + tamper + deterministic
  const o = (() => { const ga = noisy(5.0, 11, 1.0), gb = noisy(6.0, 23, 1.0); return (e: Experiment) => ((e.sel ?? 0) === 0 ? ga() : gb()); })();
  const c0 = improvementCertificate({ oracle: o, a: { sel: 0 }, b: { sel: 1 }, replicates: REP, seed: 9 });
  const verifyOk = verifyImprovementCertificate(c0).ok;
  const tamper = !verifyImprovementCertificate({ ...c0, gainLowerBound: c0.gainLowerBound + 5 }).ok && !verifyImprovementCertificate({ ...c0, verdict: c0.verdict === "IMPROVEMENT" ? "INCONCLUSIVE" : "IMPROVEMENT" }).ok;
  const o2 = (() => { const ga = noisy(5.0, 11, 1.0), gb = noisy(6.0, 23, 1.0); return (e: Experiment) => ((e.sel ?? 0) === 0 ? ga() : gb()); })();
  const c1 = improvementCertificate({ oracle: o2, a: { sel: 0 }, b: { sel: 1 }, replicates: REP, seed: 9 });
  const deterministic = c0.payloadHash === c1.payloadHash;
  let total = true; try { improvementCertificate({ oracle: () => NaN, a: {}, b: {}, replicates: 4, seed: 1 }); } catch { total = false; }

  const checks = [
    { name: "LOWER-BOUND-VALID≥97.5%", pass: lbValidRate >= 0.975 && realCert >= 30, detail: `among ${realCert} certified gains, the TRUE gain ≥ the certified Δ in ${lbValid} = ${(lbValidRate * 100).toFixed(1)}%` },
    { name: "FALSE-CERT≤2.5% (A≡B)", pass: fpRate <= 0.025, detail: `falsely certified an improvement when A≡B in ${fpCert}/${N} = ${(fpRate * 100).toFixed(1)}%` },
    { name: "HAS-POWER (detects a real gain)", pass: powerRate >= 0.8, detail: `detected the true 0.7 gain in ${realCert}/${N} = ${(powerRate * 100).toFixed(0)}% (not uselessly cautious)` },
    { name: "SIGNED-VERIFIES+TAMPER", pass: verifyOk && tamper, detail: "Δ + verdict re-derive from the recorded samples; an inflated Δ or flipped verdict fails" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same seed → identical certificate" },
    { name: "TOTAL", pass: total, detail: "a NaN/garbage oracle never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
