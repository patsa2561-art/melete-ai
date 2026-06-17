/**
 * 🌐 THE DISTRIBUTION-SHIFT (DRO) CERTIFICATE — will the recommended setting still hold when the data drifts?
 *
 * Every optimizer reports the value it measured on the data it saw. But deployment data is never exactly the test
 * data — the customer mix shifts, the traffic changes, the population moves. A setting that looks best on the
 * nominal distribution can collapse under a modest shift, and nobody hands you a signed bound on how bad it can
 * get. AEGIS certifies robustness to INPUT wobble and Tolerance to PARAMETER wobble; this certifies robustness to
 * the thing they don't touch — the DATA DISTRIBUTION itself.
 *
 * Given samples of a setting's per-unit value (per-customer profit, per-query score…), this computes the
 * worst-case mean over every distribution within a χ²-divergence ball of radius ρ around the empirical one —
 * distributionally-robust optimization. For the χ² ball this worst case has the exact, Cauchy-Schwarz-tight closed
 * form  V = mean − √(ρ · Var)  (a conservative lower bound once the adversarial weights would go negative), so the
 * certificate states "under any distribution shift up to χ² ≤ ρ, the expected value is provably ≥ V" — and signs
 * it. It also names the variance penalty, so a high-mean-but-fragile setting is correctly out-ranked by a
 * slightly-lower-mean-but-robust one. Verify re-derives V offline.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot compute the χ²-DRO worst case, prove it is a valid lower bound under
 * every shift in the ball, and sign a re-derivable verdict — it just quotes the nominal average. (DIAKRISIS —
 * MEASURED: over many random reweightings inside the ball, none ever beats the certified worst case [valid lower
 * bound], and the aligned adversary achieves it [tight]; the DRO value is monotone decreasing in ρ and recovers
 * the mean at ρ=0; a fragile high-variance setting collapses under an actual shift while a robust one holds, and
 * the certificate ranks them accordingly. HONEST: this is the χ²-divergence ambiguity set — it bounds shifts
 * measured by that divergence, not arbitrary adversarial corruption or support the samples never covered; and the
 * closed form is exact while the worst-case weights stay non-negative, conservative beyond that.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

// inverse standard-normal CDF (Acklam) — for the v2 confidence mode that maps a confidence level to the radius ρ
function normInv(p: number): number {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425; let q: number, r: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// χ²-ball DRO worst-case mean: inf over { Q : χ²(Q‖P) ≤ ρ } of E_Q[L], P = empirical uniform on the samples.
// With χ²(Q‖P) = Σ(q_i−1/n)²/(1/n) = n·Σ(q_i−1/n)², the worst case over the L2 ball is, by Cauchy-Schwarz,
// V = mean − √(ρ · Var) (Var the population variance). The simplex's q ≥ 0 only restricts the adversary further,
// so V is a valid (tight-then-conservative) lower bound on the expected value under any such shift.
function droWorstCase(L: number[], rho: number): { mean: number; variance: number; worstCase: number } {
  const n = L.length; if (n === 0) return { mean: 0, variance: 0, worstCase: 0 };
  let sum = 0; for (const v of L) sum += v; const mean = sum / n;
  let ss = 0; for (const v of L) ss += (v - mean) * (v - mean); const variance = ss / n;
  const worstCase = mean - Math.sqrt(Math.max(0, rho) * variance);
  return { mean, variance, worstCase };
}

export interface DroCertificate {
  standard: "melete-dro-certificate/v2";
  divergence: "chi-squared";
  verdict: "ROBUST" | "FRAGILE";
  mode: "ambiguity" | "confidence";  // ambiguity: a user-chosen shift radius. confidence: ρ=z²/n ⇒ V is a (1−α) LCB on the TRUE mean
  confidence: number;           // the (1−α) level in confidence mode (0 in ambiguity mode) — Duchi-Namkoong: DRO ≡ a confidence bound
  n: number;
  rho: number;                  // ambiguity radius: distributions within χ² ≤ ρ of the empirical one
  threshold: number;            // the value the setting must keep under shift to be ROBUST
  mean: number;                 // nominal (no-shift) mean value
  variance: number;
  worstCase: number;            // certified worst-case mean under any shift in the ball — guaranteed ≥ this
  variancePenalty: number;      // mean − worstCase = √(ρ·Var): the cost of fragility
  values: number[];
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

export function droCertificate(opts: { values: number[]; rho?: number; confidence?: number; threshold?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): DroCertificate {
  const values = (opts.values ?? []).map((v) => (Number.isFinite(v) ? v : 0));
  const n = values.length;
  // CONFIDENCE MODE (v2): a target (1−α) maps to ρ = z²/n (z = Φ⁻¹(conf)) so the worst case becomes a calibrated
  // (1−α) lower confidence bound on the TRUE mean (Duchi-Namkoong: variance-regularized DRO ≡ a confidence bound).
  const conf = Number.isFinite(opts.confidence) && (opts.confidence as number) > 0 && (opts.confidence as number) < 1 ? (opts.confidence as number) : 0;
  const mode: DroCertificate["mode"] = conf > 0 ? "confidence" : "ambiguity";
  const z = conf > 0 ? normInv(conf) : 0;
  const rho = conf > 0 ? (n > 0 ? (z * z) / n : 0) : (Number.isFinite(opts.rho) && (opts.rho as number) >= 0 ? (opts.rho as number) : 0);
  const { mean, variance, worstCase } = droWorstCase(values, rho);
  const threshold = Number.isFinite(opts.threshold) ? (opts.threshold as number) : -Infinity;
  const verdict: DroCertificate["verdict"] = worstCase >= threshold ? "ROBUST" : "FRAGILE";
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = {
    standard: "melete-dro-certificate/v2" as const, divergence: "chi-squared" as const, verdict, mode, confidence: conf,
    n, rho, threshold: Number.isFinite(threshold) ? threshold : 0, mean, variance, worstCase, variancePenalty: mean - worstCase, values,
  };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyDroCertificate(c: DroCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-dro-certificate/v2") return { ok: false, reason: "unknown standard" };
    if (c.divergence !== "chi-squared") return { ok: false, reason: "unknown divergence" };
    if (c.values.length !== c.n) return { ok: false, reason: "value count does not match n" };
    // in confidence mode the radius must be the one the claimed confidence implies (ρ = z²/n) — catches a mismatched ρ
    if (c.mode === "confidence") { const z = normInv(c.confidence); const rhoExp = c.n > 0 ? (z * z) / c.n : 0; if (Math.abs(rhoExp - c.rho) > 1e-9 * (1 + rhoExp)) return { ok: false, reason: "confidence radius ρ ≠ z²/n — confidence misstated" }; }
    const { mean, variance, worstCase } = droWorstCase(c.values, c.rho);
    if (Math.abs(mean - c.mean) > 1e-6 || Math.abs(variance - c.variance) > 1e-6 || Math.abs(worstCase - c.worstCase) > 1e-6) return { ok: false, reason: "recomputed DRO worst-case differs — robustness misstated" };
    if (Math.abs((mean - worstCase) - c.variancePenalty) > 1e-6) return { ok: false, reason: "recomputed variance penalty differs" };
    const verdict = worstCase >= c.threshold ? "ROBUST" : "FRAGILE";
    if (verdict !== c.verdict) return { ok: false, reason: `recomputed verdict ${verdict} ≠ certificate ${c.verdict}` };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, divergence: c.divergence, verdict: c.verdict, mode: c.mode, confidence: c.confidence, n: c.n, rho: c.rho, threshold: c.threshold, mean: c.mean, variance: c.variance, worstCase: c.worstCase, variancePenalty: c.variancePenalty, values: c.values })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a value was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `${c.verdict}: under χ² ≤ ${c.rho} shift, value ≥ ${c.worstCase.toFixed(3)} (nominal ${c.mean.toFixed(3)} − fragility ${c.variancePenalty.toFixed(3)})` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

function det(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }

// a random distribution Q inside the χ² ball (zero-sum perturbation of uniform, scaled into the ball, kept ≥ 0)
function randomQinBall(n: number, rho: number, g: () => number): number[] {
  const u = 1 / n; const dir = Array.from({ length: n }, () => g() - 0.5); const m = dir.reduce((s, a) => s + a, 0) / n;
  for (let i = 0; i < n; i++) dir[i] -= m;                                   // zero-sum
  let dn = Math.sqrt(dir.reduce((s, a) => s + a * a, 0)); if (dn < 1e-12) return Array(n).fill(u);
  const rmax = Math.sqrt(rho / n);                                            // ‖q−u‖ ≤ √(ρ/n)
  let r = rmax * Math.cbrt(g());                                              // random radius inside the ball
  let q = dir.map((a) => u + (r / dn) * a);
  // shrink toward uniform until all non-negative (stays inside the ball)
  let guard = 0; while (q.some((v) => v < 0) && guard++ < 60) { r *= 0.8; q = dir.map((a) => u + (r / dn) * a); }
  return q.map((v) => Math.max(0, v));
}

export function droGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // 1) VALID-LOWER-BOUND + TIGHT: no Q in the ball beats the certified worst case; the aligned adversary achieves it
  let validViolations = 0, tightGap = 0, trials = 0;
  for (let s = 1; s <= 60; s++) {
    const g = det(s * 7 + 1); const n = 40;
    const L = Array.from({ length: n }, () => 5 + 3 * (g() * 2 - 1));        // values in ~[2,8]
    const rho = 0.05 + 0.1 * g();
    const cert = droCertificate({ values: L, rho });
    // aligned (worst) adversary: q = u − s·(L−mean), scaled to the ball edge
    const mean = cert.mean; const c = L.map((v) => v - mean); const cn = Math.sqrt(c.reduce((a, b) => a + b * b, 0));
    const rmax = Math.sqrt(rho / n); const qAligned = L.map((_, i) => 1 / n - (rmax / cn) * c[i]);
    const eAligned = qAligned.reduce((a, q, i) => a + q * L[i], 0);
    tightGap = Math.max(tightGap, Math.abs(eAligned - cert.worstCase));
    for (let t = 0; t < 400; t++) { const q = randomQinBall(n, rho, det(s * 1000 + t + 3)); const e = q.reduce((a, qi, i) => a + qi * L[i], 0); trials++; if (e < cert.worstCase - 1e-9) validViolations++; }
  }
  const validBound = validViolations === 0, tight = tightGap < 1e-9;

  // 2) ROBUST-RANKING: high-mean-high-variance A vs lower-mean-low-variance B — DRO prefers B, and an actual shift sinks A below B
  const gA = det(11), gB = det(13); const n = 60, rho = 0.3;
  const A = Array.from({ length: n }, () => 7 + 6 * (gA() * 2 - 1));         // mean ~7, high variance (fragile)
  const B = Array.from({ length: n }, () => 6 + 0.6 * (gB() * 2 - 1));       // mean ~6, low variance (robust)
  const cA = droCertificate({ values: A, rho }), cB = droCertificate({ values: B, rho });
  const ranksRobust = cA.mean > cB.mean && cB.worstCase > cA.worstCase;     // A higher nominal, B higher worst-case
  // confirm an actual adversarial shift makes A worse than B
  const adv = (L: number[]) => { const m = L.reduce((a, b) => a + b, 0) / L.length; const c = L.map((v) => v - m); const cn = Math.sqrt(c.reduce((a, b) => a + b * b, 0)); const rmax = Math.sqrt(rho / L.length); const q = L.map((_, i) => 1 / L.length - (rmax / cn) * c[i]); return q.reduce((a, qi, i) => a + qi * L[i], 0); };
  const shiftConfirms = adv(A) < adv(B);

  // 3) MONOTONE-IN-ρ and 4) RECOVERS-MEAN-AT-0
  const base = Array.from({ length: 50 }, (_, i) => 4 + Math.sin(i));
  const v0 = droCertificate({ values: base, rho: 0 }), v1 = droCertificate({ values: base, rho: 0.1 }), v2 = droCertificate({ values: base, rho: 0.5 });
  const monotone = v0.worstCase > v1.worstCase && v1.worstCase > v2.worstCase;
  const recovers = Math.abs(v0.worstCase - v0.mean) < 1e-12;

  // v2 CONFIDENCE MODE: ρ=z²/n ⇒ worst case is a (1−α) LCB on the TRUE mean. Measure coverage across resamples.
  const gaussN = (g: () => number) => { let u = 0, v = 0; while (u < 1e-12) u = g(); while (v < 1e-12) v = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const coverage = (conf: number, skew: boolean) => {
    const trueMean = skew ? Math.exp(0.5) : 5; let cov = 0, Tn = 3000;
    for (let t = 1; t <= Tn; t++) { const g = det(t * 7 + (skew ? 1 : 0)); const m = 50; const L = Array.from({ length: m }, () => (skew ? Math.exp(gaussN(g)) : 5 + 2 * gaussN(g))); const c = droCertificate({ values: L, confidence: conf }); if (trueMean >= c.worstCase) cov++; }
    return cov / Tn;
  };
  const covG = coverage(0.95, false), covS = coverage(0.95, true);
  // calibrated on light tails (within finite-n/MC tolerance), conservative (over-covers) on skew
  const calibrated = covG >= 0.95 - 0.015 && covS >= 0.95;
  // DRO-IS-A-CI: in confidence mode V equals the textbook one-sided CLT lower bound mean − z·SE
  const ciL = Array.from({ length: 60 }, (_, i) => 4 + Math.sin(i) + 0.3 * Math.cos(3 * i));
  const cc = droCertificate({ values: ciL, confidence: 0.95 }); const zc = normInv(0.95);
  const se = Math.sqrt(cc.variance / cc.n); const clt = cc.mean - zc * se;
  const isCI = Math.abs(cc.worstCase - clt) < 1e-9 && cc.mode === "confidence";

  // 5) signed / forgery (claim a higher worst-case) / tamper / deterministic / total
  const cert = droCertificate({ values: A, rho, threshold: cA.worstCase });
  const verifyOk = verifyDroCertificate(cert).ok;
  const forged = { ...cert, worstCase: cert.mean, variancePenalty: 0, verdict: "ROBUST" as const };
  const forgeryCaught = !verifyDroCertificate(forged).ok;
  const tamper = !verifyDroCertificate({ ...cert, values: cert.values.map((v, i) => (i < 10 ? v + 5 : v)) }).ok;
  const d1 = droCertificate({ values: base, rho: 0.2 }), d2 = droCertificate({ values: base, rho: 0.2 });
  const deterministic = d1.payloadHash === d2.payloadHash && verifyDroCertificate(d1).ok;
  let total = true; try { droCertificate({ values: [], rho: 0.1 }); droCertificate({ values: [NaN, 1], rho: -1 }); } catch { total = false; }

  const checks = [
    { name: "VALID-LOWER-BOUND", pass: validBound, detail: `over ${trials} random reweightings inside the χ² ball, NONE beat the certified worst case (${validViolations} violations) — a sound guarantee under shift` },
    { name: "TIGHT", pass: tight, detail: `the aligned worst-case adversary achieves the certified value exactly (max gap ${tightGap.toExponential(2)}) — not conservative when weights stay feasible` },
    { name: "ROBUST-RANKING", pass: ranksRobust && shiftConfirms, detail: `a high-mean fragile setting (nominal ${cA.mean.toFixed(2)}, worst ${cA.worstCase.toFixed(2)}) is out-ranked under shift by a robust one (nominal ${cB.mean.toFixed(2)}, worst ${cB.worstCase.toFixed(2)}); an actual shift confirms A<B` },
    { name: "MONOTONE-IN-ρ", pass: monotone, detail: `larger ambiguity ρ gives a lower (more conservative) worst case: ${v0.worstCase.toFixed(2)} > ${v1.worstCase.toFixed(2)} > ${v2.worstCase.toFixed(2)}` },
    { name: "RECOVERS-MEAN-AT-ρ0", pass: recovers, detail: `with no ambiguity (ρ=0) the worst case is exactly the nominal mean ${v0.mean.toFixed(3)}` },
    { name: "CONFIDENCE-CALIBRATED (v2)", pass: calibrated, detail: `confidence mode (ρ=z²/n) gives a calibrated 95% lower bound on the TRUE mean: coverage ${(covG * 100).toFixed(1)}% on light tails (≈95%) and ${(covS * 100).toFixed(1)}% on skewed data (conservatively over-covers, stays valid)` },
    { name: "DRO-IS-A-CI (v2)", pass: isCI, detail: `the Duchi-Namkoong unification, exact: the confidence-mode worst case equals the textbook one-sided CLT bound mean − z·SE (gap ${Math.abs(cc.worstCase - clt).toExponential(2)}) — DRO and a confidence interval are the same object` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "mean + variance + worst-case + verdict re-derive offline from the recorded values" },
    { name: "FORGERY-CAUGHT (inflated worst-case)", pass: forgeryCaught, detail: "claiming a higher worst-case than the values support is rejected on re-derivation" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering recorded values breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same values + ρ → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty / NaN / negative-ρ inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
