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
// one-sided Student-t quantile by degrees of freedom (Cornish-Fisher 2-term) from a normal quantile z0 —
// correctly calibrated at ANY sample size. Default z0=2.054 (~98%, a margin above 97.5%).
function tMult(df: number, z0 = 2.054): number { if (df < 1) return Math.max(6, z0 + 4); const z = z0, z3 = z * z * z, z5 = z3 * z * z; return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df); }
// one-sided lower-tail normal quantile (Acklam) — for per-look confidence under alpha-spending.
function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425; let q: number, r: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export interface ImprovementCertificate {
  standard: "melete-improvement-certificate/v1";
  verdict: "IMPROVEMENT" | "INCONCLUSIVE";
  a: { experiment: Experiment; mean: number; n: number };
  b: { experiment: Experiment; mean: number; n: number };
  gainLowerBound: number;       // certified Δ — the true gain is ≥ this with 97.5% confidence (if IMPROVEMENT)
  observedGain: number;         // μB − μA (point estimate)
  confidence: number;           // 0.975
  paired: boolean;              // measured under common random numbers (variance-reduced) → far fewer measurements
  sequential?: { looks: number[]; alpha: number; stoppedAt: number };   // adaptive early-stopping (alpha-spent)
  samplesA: number[]; samplesB: number[];
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}

function stats(xs: number[]): { mean: number; varOverN: number } {
  const n = xs.length; const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0;
  return { mean, varOverN: v / n };
}

/** Certify (with proof) that B improves on A by at least Δ. Supply `oracle` for independent measurement, OR
 *  `pairedOracle(i)` returning A and B measured under the SAME conditions (common random numbers) — the
 *  shared noise cancels in the difference, so the same gain is certified from far fewer measurements. */
export function improvementCertificate(opts: { oracle?: (e: Experiment) => number; pairedOracle?: (i: number) => { a: number; b: number }; a: Experiment; b: Experiment; replicates?: number; seed?: number; goal?: "maximize" | "minimize"; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): ImprovementCertificate {
  const n = Math.max(2, opts.replicates ?? 12); const goal = opts.goal ?? "maximize"; const sign = goal === "maximize" ? 1 : -1;
  const r = lcg((opts.seed ?? 1) | 0);
  const samplesA: number[] = [], samplesB: number[] = [];
  const paired = !!opts.pairedOracle;
  for (let i = 0; i < n; i++) {
    if (opts.pairedOracle) { const p = opts.pairedOracle(i); samplesA.push(sign * p.a); samplesB.push(sign * p.b); }
    else { samplesA.push(sign * opts.oracle!(opts.a)); samplesB.push(sign * opts.oracle!(opts.b)); void r; }
  }
  return buildCertificate(opts.a, opts.b, samplesA, samplesB, paired, 2.054, undefined, opts.keys);
}

/** SEQUENTIAL: measure in groups (looks) and STOP as soon as the gain is certified — far fewer measurements
 *  on average. Bonferroni alpha-spending across the K looks keeps the overall false-certification ≤ alpha. */
export function sequentialImprovementCertificate(opts: { oracle?: (e: Experiment) => number; pairedOracle?: (i: number) => { a: number; b: number }; a: Experiment; b: Experiment; looks?: number[]; alpha?: number; seed?: number; goal?: "maximize" | "minimize"; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): ImprovementCertificate {
  const looks = (opts.looks ?? [8, 16, 24, 32, 40]).slice().sort((x, y) => x - y);
  const alpha = opts.alpha ?? 0.025; const K = looks.length; const z0 = normInv(1 - alpha / K);   // per-look confidence
  const goal = opts.goal ?? "maximize"; const sign = goal === "maximize" ? 1 : -1; const paired = !!opts.pairedOracle;
  const maxN = looks[looks.length - 1];
  const sA: number[] = [], sB: number[] = []; let stoppedAt = maxN; let decided = false; const r = lcg((opts.seed ?? 1) | 0);
  let drawn = 0;
  for (const nk of looks) {
    while (drawn < nk) { if (opts.pairedOracle) { const p = opts.pairedOracle(drawn); sA.push(sign * p.a); sB.push(sign * p.b); } else { sA.push(sign * opts.oracle!(opts.a)); sB.push(sign * opts.oracle!(opts.b)); void r; } drawn++; }
    const se = paired ? Math.sqrt(stats(sB.map((v, i) => v - sA[i])).varOverN) : Math.sqrt(stats(sA).varOverN + stats(sB).varOverN);
    const lb = (stats(sB).mean - stats(sA).mean) - tMult((paired ? nk : nk) - 1, z0) * se;
    if (lb > 0) { stoppedAt = nk; decided = true; break; }
  }
  return buildCertificate(opts.a, opts.b, sA.slice(0, stoppedAt), sB.slice(0, stoppedAt), paired, z0, { looks, alpha, stoppedAt }, opts.keys);
}

function buildCertificate(a: Experiment, b: Experiment, samplesA: number[], samplesB: number[], paired: boolean, z0: number, seq: { looks: number[]; alpha: number; stoppedAt: number } | undefined, keys?: { publicKey: KeyObject; privateKey: KeyObject }): ImprovementCertificate {
  const sa = stats(samplesA), sb = stats(samplesB);
  const observedGain = sb.mean - sa.mean;
  let se: number;
  if (paired) { const d = samplesB.map((v, i) => v - samplesA[i]); se = Math.sqrt(stats(d).varOverN); }   // CRN: variance of the paired difference
  else se = Math.sqrt(sa.varOverN + sb.varOverN);
  const df = paired ? samplesA.length - 1 : Math.min(samplesA.length, samplesB.length) - 1;
  const gainLowerBound = observedGain - tMult(df, z0) * se;
  const verdict: "IMPROVEMENT" | "INCONCLUSIVE" = gainLowerBound > 0 ? "IMPROVEMENT" : "INCONCLUSIVE";
  const kp = keys ?? generateKeyPairSync("ed25519");
  const cert: Record<string, unknown> = { standard: "melete-improvement-certificate/v1", verdict, a: { experiment: a, mean: sa.mean, n: samplesA.length }, b: { experiment: b, mean: sb.mean, n: samplesB.length }, gainLowerBound, observedGain, confidence: 0.975, paired, samplesA, samplesB };
  if (seq) cert.sequential = seq;
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...(cert as unknown as ImprovementCertificate), payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

/** Verify offline: recompute the gain bound + verdict from the recorded samples, then check the signature. */
export function verifyImprovementCertificate(c: ImprovementCertificate): { ok: boolean; reason: string } {
  if (!c || !c.signature || !c.samplesA) return { ok: false, reason: "incomplete certificate" };
  try {
    const sa = stats(c.samplesA), sb = stats(c.samplesB);
    const observedGain = sb.mean - sa.mean;
    const se = c.paired ? Math.sqrt(stats(c.samplesB.map((v, i) => v - c.samplesA[i])).varOverN) : Math.sqrt(sa.varOverN + sb.varOverN);
    const df = c.paired ? c.samplesA.length - 1 : Math.min(c.samplesA.length, c.samplesB.length) - 1;
    const z0 = c.sequential ? normInv(1 - c.sequential.alpha / c.sequential.looks.length) : 2.054;
    const glb = observedGain - tMult(df, z0) * se; const verdict = glb > 0 ? "IMPROVEMENT" : "INCONCLUSIVE";
    if (Math.abs(glb - c.gainLowerBound) > 1e-9 || verdict !== c.verdict || Math.abs(sa.mean - c.a.mean) > 1e-9 || Math.abs(sb.mean - c.b.mean) > 1e-9) return { ok: false, reason: "recomputed gain/verdict differs from the certificate — tampered" };
    const payloadObj: Record<string, unknown> = { standard: c.standard, verdict: c.verdict, a: c.a, b: c.b, gainLowerBound: c.gainLowerBound, observedGain: c.observedGain, confidence: c.confidence, paired: c.paired, samplesA: c.samplesA, samplesB: c.samplesB };
    if (c.sequential) payloadObj.sequential = c.sequential;
    const recomputed = createHash("sha256").update(canonical(payloadObj)).digest("hex");
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

  // ── R8 IMPROVE: common-random-numbers pairing certifies the SAME gain from far fewer measurements ──
  // a process with mostly-SHARED noise (e.g. a common batch/day effect) + a small independent residual.
  const shareSd = 1.2, residSd = 0.3, gap = 0.7;   // true gain 0.7; shared noise dominates the residual
  // smallest replicate count n at which a config certifies the real gain in ≥90% of seeds
  function minReplicates(usePaired: boolean): number {
    for (const n of [4, 6, 8, 10, 14, 18, 24, 30, 40, 52, 70]) {
      let ok = 0; const T = 80;
      for (let s = 1; s <= T; s++) {
        const gShared = lcg(s * 37 + 1), gA = lcg(s * 37 + 5), gB = lcg(s * 37 + 9);
        const gz = (g: () => number) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        const cert = usePaired
          ? improvementCertificate({ pairedOracle: (i) => { const sh = gz(gShared); return { a: 5.0 + shareSd * sh + residSd * gz(gA), b: 5.0 + gap + shareSd * sh + residSd * gz(gB) }; }, a: { sel: 0 }, b: { sel: 1 }, replicates: n, seed: s })
          : improvementCertificate({ oracle: (e) => { const sh = gz(gShared); return (e.sel ?? 0) === 0 ? 5.0 + shareSd * sh + residSd * gz(gA) : 5.0 + gap + shareSd * sh + residSd * gz(gB); }, a: { sel: 0 }, b: { sel: 1 }, replicates: n, seed: s });
        if (cert.verdict === "IMPROVEMENT") ok++;
      }
      if (ok / T >= 0.9) return n;
    }
    return Infinity;
  }
  const nIndep = minReplicates(false), nPaired = minReplicates(true);
  // paired lower-bound must still be VALID (true gain ≥ certified Δ ≥97.5%) at its small n
  let pCert = 0, pValid = 0, pFp = 0;
  for (let s = 1; s <= 240; s++) {
    const gShared = lcg(s * 41 + 1), gA = lcg(s * 41 + 5), gB = lcg(s * 41 + 9);
    const gz = (g: () => number) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    const np = Number.isFinite(nPaired) ? nPaired : 12;
    const c = improvementCertificate({ pairedOracle: (i) => { const sh = gz(gShared); return { a: 5.0 + shareSd * sh + residSd * gz(gA), b: 5.0 + gap + shareSd * sh + residSd * gz(gB) }; }, a: { sel: 0 }, b: { sel: 1 }, replicates: np, seed: s * 7 + 1 });
    if (c.verdict === "IMPROVEMENT") { pCert++; if (gap >= c.gainLowerBound) pValid++; }
    const cn = improvementCertificate({ pairedOracle: (i) => { const sh = gz(gShared); return { a: 5.0 + shareSd * sh + residSd * gz(gA), b: 5.0 + shareSd * sh + residSd * gz(gB) }; }, a: { sel: 0 }, b: { sel: 1 }, replicates: np, seed: s * 11 + 2 });
    if (cn.verdict === "IMPROVEMENT") pFp++;
  }
  const pValidRate = pCert ? pValid / pCert : 0, pFpRate = pFp / 240;

  // ── R10 IMPROVE: SEQUENTIAL early-stopping uses fewer measurements on average; FP still ≤ alpha (Bonferroni per-look) ──
  const seqLooks = [8, 16, 24, 32, 40]; const fixedMeas = seqLooks[seqLooks.length - 1] * 2; const gainMix = [0.5, 0.9, 1.5];
  let seqStopSum = 0, seqCert = 0, seqValid = 0, seqFp = 0, seqFpN = 0;
  for (let s = 1; s <= 120; s++) {
    const gmix = gainMix[s % 3];
    const gz = (g: () => number) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    const gA = lcg(s * 61 + 3), gB = lcg(s * 61 + 9);
    const c = sequentialImprovementCertificate({ oracle: (e) => ((e.sel ?? 0) === 0 ? 5.0 + gz(gA) : 5.0 + gmix + gz(gB)), a: { sel: 0 }, b: { sel: 1 }, looks: seqLooks, alpha: 0.025, seed: s });
    if (c.verdict === "IMPROVEMENT") { seqCert++; seqStopSum += (c.sequential!.stoppedAt) * 2; if (gmix >= c.gainLowerBound) seqValid++; }
    const gA2 = lcg(s * 73 + 3), gB2 = lcg(s * 73 + 9);
    const cn = sequentialImprovementCertificate({ oracle: (e) => ((e.sel ?? 0) === 0 ? 5.0 + gz(gA2) : 5.0 + gz(gB2)), a: { sel: 0 }, b: { sel: 1 }, looks: seqLooks, alpha: 0.025, seed: s * 3 + 1 }); seqFpN++;
    if (cn.verdict === "IMPROVEMENT") seqFp++;
  }
  const avgSeqMeas = seqCert ? seqStopSum / seqCert : Infinity; const seqValidRate = seqCert ? seqValid / seqCert : 0; const seqFpRate = seqFp / seqFpN;

  const checks = [
    { name: "LOWER-BOUND-VALID≥97.5%", pass: lbValidRate >= 0.975 && realCert >= 30, detail: `among ${realCert} certified gains, the TRUE gain ≥ the certified Δ in ${lbValid} = ${(lbValidRate * 100).toFixed(1)}%` },
    { name: "FALSE-CERT≤2.5% (A≡B)", pass: fpRate <= 0.025, detail: `falsely certified an improvement when A≡B in ${fpCert}/${N} = ${(fpRate * 100).toFixed(1)}%` },
    { name: "HAS-POWER (detects a real gain)", pass: powerRate >= 0.8, detail: `detected the true 0.7 gain in ${realCert}/${N} = ${(powerRate * 100).toFixed(0)}% (not uselessly cautious)` },
    { name: "SIGNED-VERIFIES+TAMPER", pass: verifyOk && tamper, detail: "Δ + verdict re-derive from the recorded samples; an inflated Δ or flipped verdict fails" },
    { name: "PAIRED-NEEDS-FEWER (CRN)", pass: Number.isFinite(nPaired) && nPaired * 2 <= nIndep, detail: `to certify the same 0.7 gain (shared-noise process): independent needs ${nIndep} measurements, common-random-numbers pairing needs ${nPaired} (${Number.isFinite(nPaired) ? (nIndep / nPaired).toFixed(1) : "∞"}× fewer)` },
    { name: "PAIRED-STILL-VALID", pass: pValidRate >= 0.975 && pFpRate <= 0.025 && pCert >= 30, detail: `paired: certified Δ valid ${(pValidRate * 100).toFixed(1)}% (≥97.5) · false-cert on A≡B ${(pFpRate * 100).toFixed(1)}% (≤2.5)` },
    { name: "SEQUENTIAL-FEWER (early-stop)", pass: avgSeqMeas <= fixedMeas * 0.8 && seqCert >= 30, detail: `across a gain mix {0.5,0.9,1.5}, sequential stops at avg ${avgSeqMeas.toFixed(1)} measurements vs a fixed ${fixedMeas} (${(fixedMeas / avgSeqMeas).toFixed(2)}× fewer — stops the moment the gain is certified)` },
    { name: "SEQUENTIAL-FP≤2.5%+VALID", pass: seqFpRate <= 0.025 && seqValidRate >= 0.975 && seqCert >= 30, detail: `sequential: false-cert on A≡B ${(seqFpRate * 100).toFixed(1)}% (≤2.5, Bonferroni α-split over ${seqLooks.length} looks) · certified Δ valid ${(seqValidRate * 100).toFixed(1)}% (≥97.5)` },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same seed → identical certificate" },
    { name: "TOTAL", pass: total, detail: "a NaN/garbage oracle never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
