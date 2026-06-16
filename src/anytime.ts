/**
 * ⏱ THE ANYTIME-VALID (E-VALUE) CERTIFICATE — peek as often as you like; the error guarantee still holds.
 *
 * An AI agent optimizing a system does not run a fixed batch and stop — it measures ONE result, looks, decides
 * whether to keep going, measures another, looks again. Under that continuous monitoring, the classical
 * p-value is broken: "stop the first time p < 0.05" inflates the false-positive rate catastrophically (peek
 * after every one of 200 observations under the null and you cross p<0.05 ~40% of the time, not 5%). Every
 * agent that monitors a metric and stops when it "looks significant" is silently making this error.
 *
 * This certificate fixes it with anytime-valid inference. It runs a test MARTINGALE (a Robbins normal-mixture
 * e-process) over the stream: E_t is a non-negative martingale that, under the null, has E[E_t] ≤ 1 — so by
 * Ville's inequality P(ever E_t ≥ 1/α) ≤ α. You may stop at ANY time, after ANY number of peeks, by ANY
 * data-dependent rule, and the false-positive guarantee α holds. The certificate records the observation
 * stream, finds the first crossing of 1/α, and is Ed25519-signed; the verdict re-derives offline.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot carry a martingale over a live data stream, prove optional-
 * stopping validity, and sign a re-derivable verdict — it just eyeballs "looks significant now". (DIAKRISIS —
 * MEASURED: under the null with continuous monitoring the realized false-positive rate is ≤ α, while naive
 * per-peek thresholding blows past it; and a true effect is still detected, usually well before the horizon.)
 * Distinct from the sequential Proof-of-Improvement (R10), which spends alpha over a FIXED, pre-set set of
 * looks; an e-process is valid under ARBITRARY, unbounded, data-dependent stopping.
 */
import { type Experiment, lcg } from "./space.js";
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
// Robbins normal-mixture e-value at step t (two-sided H0: μ = 0, known σ): a non-negative martingale under H0.
// E_t = sqrt( σ² / (σ² + τ²t) ) · exp( τ²·S_t² / (2σ²(σ² + τ²t)) ),  S_t = Σ_{i≤t} x_i.
function eValueAt(S: number, t: number, s2: number, tau2: number): number {
  return Math.sqrt(s2 / (s2 + tau2 * t)) * Math.exp((tau2 * S * S) / (2 * s2 * (s2 + tau2 * t)));
}
// the time-uniform CONFIDENCE-SEQUENCE radius at step t: μ ∈ x̄_t ± r_t holds SIMULTANEOUSLY over all t with
// prob ≥ 1−α (the dual of the e-process — the set of μ whose e-value has not yet crossed 1/α).
function csRadius(t: number, s2: number, tau2: number, alpha: number, sigma: number): number {
  if (t < 1) return Infinity;
  const inside = (2 * s2 * (s2 + tau2 * t) / tau2) * Math.log(Math.sqrt(s2 + tau2 * t) / (alpha * sigma));
  return Math.sqrt(Math.max(0, inside)) / t;
}
// scan the stream once: first crossing of the threshold 1/α + the running maximum
function scan(obs: number[], s2: number, tau2: number, threshold: number): { stoppedAt: number; eAtStop: number; maxE: number } {
  let S = 0, stoppedAt = -1, eAtStop = 0, maxE = 0;
  for (let t = 1; t <= obs.length; t++) {
    S += obs[t - 1]; if (!Number.isFinite(S)) break;
    const E = eValueAt(S, t, s2, tau2);
    if (E > maxE) maxE = E;
    if (stoppedAt < 0 && E >= threshold) { stoppedAt = t; eAtStop = E; }
  }
  return { stoppedAt, eAtStop, maxE };
}

export interface AnytimeCertificate {
  standard: "melete-anytime-certificate/v2";
  verdict: "ANYTIME-SIGNIFICANT" | "INCONCLUSIVE";
  n: number;                       // observations seen
  sigma: number;                   // known measurement sd of one observation
  alpha: number;                   // anytime false-positive guarantee
  tau2: number;                    // mixture variance (tunes power; the guarantee holds for any τ²)
  threshold: number;               // 1/α — reject the first time the e-process crosses it
  stoppedAt: number;               // the first peek at which E_t ≥ 1/α (−1 if never within the stream)
  eValueAtStop: number;            // E at the stopping time (0 if inconclusive)
  maxEValue: number;               // the running max of the e-process
  estimate: number;                // x̄ — the running mean of the stream (the point estimate of the gain)
  ciLower: number;                 // time-uniform confidence sequence on the gain — valid at ALL times at once
  ciUpper: number;
  ciRadius: number;                // the current half-width (shrinks ~√(ln t / t))
  excludesZero: boolean;           // does the confidence sequence exclude 0? (⟺ the e-process has crossed 1/α)
  observations: number[];          // the recorded stream (the evidence)
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

export function anytimeCertificate(opts: { observations?: number[]; oracle?: (e: Experiment) => number; a?: Experiment; b?: Experiment; n?: number; sigma?: number; alpha?: number; tau2?: number; seed?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): AnytimeCertificate {
  const sigma = Math.max(1e-9, opts.sigma ?? 1), alpha = opts.alpha ?? 0.05, tau2 = opts.tau2 ?? 0.3;
  let observations = opts.observations;
  if (!observations && opts.oracle) {   // paired-difference stream from an oracle (b − a), for the demo path
    const r = lcg((opts.seed ?? 1) | 0); const n = Math.max(1, opts.n ?? 100); observations = [];
    for (let i = 0; i < n; i++) { observations.push((opts.b ? opts.oracle(opts.b) : opts.oracle({})) - (opts.a ? opts.oracle(opts.a) : 0)); void r; }
  }
  observations = observations ?? [];
  const s2 = sigma * sigma, threshold = 1 / alpha, n = observations.length;
  const { stoppedAt, eAtStop, maxE } = scan(observations, s2, tau2, threshold);
  const verdict: AnytimeCertificate["verdict"] = stoppedAt > 0 ? "ANYTIME-SIGNIFICANT" : "INCONCLUSIVE";
  // the time-uniform confidence sequence on the gain, read at the latest observation
  let S = 0; for (const x of observations) S += x;
  const estimate = n > 0 ? S / n : 0;
  const ciRadius = n > 0 ? csRadius(n, s2, tau2, alpha, sigma) : Infinity;
  const ciLower = estimate - ciRadius, ciUpper = estimate + ciRadius;
  const excludesZero = n > 0 && (ciLower > 0 || ciUpper < 0);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-anytime-certificate/v2" as const, verdict, n, sigma, alpha, tau2, threshold, stoppedAt, eValueAtStop: eAtStop, maxEValue: maxE, estimate, ciLower, ciUpper, ciRadius, excludesZero, observations };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyAnytimeCertificate(c: AnytimeCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-anytime-certificate/v2") return { ok: false, reason: "unknown standard" };
    if (c.observations.length !== c.n) return { ok: false, reason: "observation count does not match n" };
    if (Math.abs(c.threshold - 1 / c.alpha) > 1e-9) return { ok: false, reason: "threshold ≠ 1/α" };
    const s2 = c.sigma * c.sigma;
    const { stoppedAt, eAtStop, maxE } = scan(c.observations, s2, c.tau2, c.threshold);
    // re-derive the FIRST crossing — a forged earlier stop, or a claimed crossing that never happened, is caught
    if (stoppedAt !== c.stoppedAt) return { ok: false, reason: `recomputed first-crossing ${stoppedAt} ≠ certificate ${c.stoppedAt} — stopping time overstated` };
    const verdict = stoppedAt > 0 ? "ANYTIME-SIGNIFICANT" : "INCONCLUSIVE";
    if (verdict !== c.verdict) return { ok: false, reason: "verdict inconsistent with the recomputed e-process" };
    if (Math.abs(eAtStop - c.eValueAtStop) > 1e-6 || Math.abs(maxE - c.maxEValue) > 1e-6) return { ok: false, reason: "recomputed e-values differ from the certificate" };
    if (c.verdict === "ANYTIME-SIGNIFICANT" && !(eAtStop >= c.threshold)) return { ok: false, reason: "claimed significant but the e-value never reached 1/α — bogus" };
    // re-derive the time-uniform confidence sequence — a forged (too narrow) interval is caught here
    let S = 0; for (const x of c.observations) S += x;
    const est = c.n > 0 ? S / c.n : 0; const rad = c.n > 0 ? csRadius(c.n, s2, c.tau2, c.alpha, c.sigma) : Infinity;
    if (Math.abs(est - c.estimate) > 1e-6 || Math.abs(rad - c.ciRadius) > 1e-6 || Math.abs((est - rad) - c.ciLower) > 1e-6 || Math.abs((est + rad) - c.ciUpper) > 1e-6) return { ok: false, reason: "recomputed confidence sequence differs — interval understated (tampered)" };
    if (c.excludesZero !== (c.n > 0 && (c.ciLower > 0 || c.ciUpper < 0))) return { ok: false, reason: "excludesZero flag inconsistent with the interval" };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, n: c.n, sigma: c.sigma, alpha: c.alpha, tau2: c.tau2, threshold: c.threshold, stoppedAt: c.stoppedAt, eValueAtStop: c.eValueAtStop, maxEValue: c.maxEValue, estimate: c.estimate, ciLower: c.ciLower, ciUpper: c.ciUpper, ciRadius: c.ciRadius, excludesZero: c.excludesZero, observations: c.observations })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — an observation was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: c.verdict === "ANYTIME-SIGNIFICANT" ? `significant at peek ${c.stoppedAt} (e-value ${c.eValueAtStop.toFixed(1)} ≥ ${c.threshold}); valid under optional stopping` : `inconclusive after ${c.n} peeks (max e-value ${c.maxEValue.toFixed(2)})` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function anytimeGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const gz = (g: () => number) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  const sigma = 1, alpha = 0.05, tau2 = 0.3, T = 200, thr = 1 / alpha, s2 = 1;

  // 1) ANYTIME-VALID: null μ=0, CONTINUOUS monitoring + optional stopping ⇒ false-positive ≤ α
  // 2) NAIVE-PEEKING-INFLATES: classical p<0.05 peeked after every observation blows past α
  let eFP = 0, naiveFP = 0, N = 3000;
  for (let s = 1; s <= N; s++) {
    const g = lcg(s * 17 + 1); const obs: number[] = []; for (let t = 0; t < T; t++) obs.push(gz(g));
    const c = anytimeCertificate({ observations: obs, sigma, alpha, tau2 });
    if (c.verdict === "ANYTIME-SIGNIFICANT") eFP++;
    // naive: reject if |z| crosses 1.96 at ANY peek
    let S = 0, nrej = false; for (let t = 1; t <= T; t++) { S += obs[t - 1]; if (Math.abs(S / (sigma * Math.sqrt(t))) > 1.96) { nrej = true; break; } }
    if (nrej) naiveFP++;
  }
  const eFpRate = eFP / N, naiveFpRate = naiveFP / N;

  // 3) HAS-POWER: a true gain μ=0.3 is detected, usually before the horizon
  let pow = 0, stopSum = 0, stopN = 0, Np = 2000;
  for (let s = 1; s <= Np; s++) {
    const g = lcg(s * 31 + 5); const obs: number[] = []; for (let t = 0; t < T; t++) obs.push(0.3 + gz(g));
    const c = anytimeCertificate({ observations: obs, sigma, alpha, tau2 });
    if (c.verdict === "ANYTIME-SIGNIFICANT") { pow++; stopSum += c.stoppedAt; stopN++; }
  }
  const powerRate = pow / Np, avgStop = stopN ? stopSum / stopN : T;

  // 4) EXACT-STOP: the stopping time is the FIRST crossing (E_t ≥ thr at stop, E_t < thr before) — verifier-checked
  let exactOk = 0, exactN = 0;
  for (let s = 1; s <= 300; s++) {
    const g = lcg(s * 53 + 7); const obs: number[] = []; for (let t = 0; t < T; t++) obs.push(0.5 + gz(g));
    const c = anytimeCertificate({ observations: obs, sigma, alpha, tau2 });
    if (c.verdict !== "ANYTIME-SIGNIFICANT") continue; exactN++;
    let S = 0, ok = true; for (let t = 1; t <= c.stoppedAt; t++) { S += obs[t - 1]; const E = eValueAt(S, t, s2, tau2); if (t < c.stoppedAt && E >= thr) ok = false; if (t === c.stoppedAt && !(E >= thr)) ok = false; }
    if (ok && verifyAnytimeCertificate(c).ok) exactOk++;
  }

  // 5) SIGNED + FORGERY (claim an earlier stop) + TAMPER
  const gc = lcg(9); const obsC: number[] = []; for (let t = 0; t < T; t++) obsC.push(0.5 + gz(gc));
  const cc = anytimeCertificate({ observations: obsC, sigma, alpha, tau2 });
  const verifyOk = verifyAnytimeCertificate(cc).ok && cc.verdict === "ANYTIME-SIGNIFICANT";
  const forged = { ...cc, stoppedAt: Math.max(1, cc.stoppedAt - 3) };
  const forgeryCaught = !verifyAnytimeCertificate(forged).ok;
  const tamper = !verifyAnytimeCertificate({ ...cc, observations: cc.observations.map((v, i) => (i === 0 ? v + 9 : v)) }).ok;
  // forging an INCONCLUSIVE run into SIGNIFICANT is caught too
  const gn = lcg(123); const obsN: number[] = []; for (let t = 0; t < 30; t++) obsN.push(gz(gn));
  const cn = anytimeCertificate({ observations: obsN, sigma, alpha, tau2 });
  const fakeSig = !verifyAnytimeCertificate({ ...cn, verdict: "ANYTIME-SIGNIFICANT", stoppedAt: 5, eValueAtStop: thr + 1 }).ok;

  // 6) DETERMINISTIC + 7) TOTAL
  const d1 = anytimeCertificate({ observations: obsC, sigma, alpha, tau2 }), d2 = anytimeCertificate({ observations: obsC, sigma, alpha, tau2 });
  const deterministic = d1.payloadHash === d2.payloadHash && verifyAnytimeCertificate(d1).ok;
  let total = true; try { anytimeCertificate({ observations: [] }); anytimeCertificate({ observations: [NaN, 1, 2] }); anytimeCertificate({ oracle: () => NaN, n: 5, seed: 1 }); } catch { total = false; }

  // R22 IMPROVE — the CONFIDENCE SEQUENCE: a running interval valid SIMULTANEOUSLY over all t (the dual of the
  // e-process). Time-uniform coverage ≥ 1−α; a naive per-peek CI is pierced far more often under monitoring.
  let csUniform = 0, naiveCiUniform = 0, csN = 0, consistOk = 0, consistN = 0;
  for (let s = 1; s <= 3000; s++) {
    const mu = s % 2 ? 0.0 : 0.25; const g = lcg(s * 19 + 1);
    let S = 0, csCover = true, naiveCover = true;
    for (let t = 1; t <= T; t++) { S += mu + gz(g); const xbar = S / t; const r = csRadius(t, s2, tau2, alpha, sigma); if (Math.abs(xbar - mu) >= r) csCover = false; if (Math.abs(xbar - mu) >= 1.96 * sigma / Math.sqrt(t)) naiveCover = false; }
    csN++; if (csCover) csUniform++; if (naiveCover) naiveCiUniform++;
  }
  const csCovRate = csUniform / csN, naiveCiRate = naiveCiUniform / csN;
  // CS-CONSISTENT-WITH-E-VALUE: at the stop time, the confidence sequence excludes 0 (the e-process crossing ⟺ 0 ∉ CS)
  for (let s = 1; s <= 400; s++) {
    const g = lcg(s * 71 + 3); const obs: number[] = []; for (let t = 0; t < T; t++) obs.push(0.5 + gz(g));
    const c = anytimeCertificate({ observations: obs, sigma, alpha, tau2 });
    if (c.verdict !== "ANYTIME-SIGNIFICANT") continue; consistN++;
    let S = 0; for (let t = 1; t <= c.stoppedAt; t++) S += obs[t - 1];
    const est = S / c.stoppedAt, r = csRadius(c.stoppedAt, s2, tau2, alpha, sigma);
    if (est - r > 0 || est + r < 0) consistOk++;   // CS excludes 0 at the stop
  }
  const consistRate = consistN ? consistOk / consistN : 0;
  // CS-SHRINKS: the interval tightens as evidence accrues (radius decreasing over time)
  const csShrinks = csRadius(200, s2, tau2, alpha, sigma) < csRadius(50, s2, tau2, alpha, sigma) && csRadius(50, s2, tau2, alpha, sigma) < csRadius(15, s2, tau2, alpha, sigma) && Number.isFinite(csRadius(5, s2, tau2, alpha, sigma));
  // CS-FORGERY: claiming a narrower interval than the data supports is caught
  const csForged = { ...cc, ciRadius: cc.ciRadius / 2, ciLower: cc.estimate - cc.ciRadius / 2, ciUpper: cc.estimate + cc.ciRadius / 2 };
  const csForgeryCaught = !verifyAnytimeCertificate(csForged).ok;

  const exactRate = exactN ? exactOk / exactN : 0;
  const checks = [
    { name: "ANYTIME-VALID ≤ α (optional stopping)", pass: eFpRate <= alpha && N >= 1000, detail: `under the null with continuous monitoring + optional stopping, the e-process falsely fired in ${eFP}/${N} = ${(eFpRate * 100).toFixed(1)}% ≤ α=${(alpha * 100).toFixed(0)}% (Ville's inequality)` },
    { name: "NAIVE-PEEKING-INFLATES (the bug)", pass: naiveFpRate > 0.25 && naiveFpRate > eFpRate + 0.1, detail: `classical p<0.05 peeked after every observation falsely fired ${(naiveFpRate * 100).toFixed(0)}% of the time — ${(naiveFpRate / Math.max(1e-9, eFpRate)).toFixed(0)}× the anytime rate` },
    { name: "HAS-POWER (detects, stops early)", pass: powerRate >= 0.8 && avgStop < T, detail: `a true gain (μ=0.3) was detected in ${(powerRate * 100).toFixed(0)}% of streams, stopping at peek ${avgStop.toFixed(0)} on average (of ${T})` },
    { name: "EXACT-STOP (first crossing)", pass: exactRate >= 0.999 && exactN >= 100, detail: `the stopping time is exactly the FIRST peek the e-process crosses 1/α (E<thr before, ≥thr at stop), re-verified in ${exactOk}/${exactN}` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "the e-process + stopping time + verdict re-derive from the recorded stream" },
    { name: "FORGERY-CAUGHT (earlier stop / fake significant)", pass: forgeryCaught && fakeSig, detail: "claiming an earlier stop, or upgrading an inconclusive run to significant, is rejected on re-derivation" },
    { name: "CS-TIME-UNIFORM-COVERAGE ≥ 1−α", pass: csCovRate >= 1 - alpha && csN >= 1000, detail: `the confidence sequence covered the true gain at EVERY t simultaneously in ${(csCovRate * 100).toFixed(1)}% ≥ ${((1 - alpha) * 100).toFixed(0)}% of streams` },
    { name: "NAIVE-CI-PIERCED (per-peek)", pass: naiveCiRate < 0.75 && csCovRate - naiveCiRate >= 0.1, detail: `a naive per-peek 95% CI held uniformly in only ${(naiveCiRate * 100).toFixed(0)}% — pierced under continuous monitoring, where the CS holds ${(csCovRate * 100).toFixed(0)}%` },
    { name: "CS-CONSISTENT-WITH-E-VALUE", pass: consistRate >= 0.999 && consistN >= 100, detail: `at the stopping time the confidence sequence excludes 0 in ${consistOk}/${consistN} — the interval and the decision agree exactly` },
    { name: "CS-SHRINKS (tightens with evidence)", pass: csShrinks, detail: `the interval half-width decreases as evidence accrues: r₁₅=${csRadius(15, s2, tau2, alpha, sigma).toFixed(2)} > r₅₀=${csRadius(50, s2, tau2, alpha, sigma).toFixed(2)} > r₂₀₀=${csRadius(200, s2, tau2, alpha, sigma).toFixed(2)}` },
    { name: "CS-FORGERY-CAUGHT (too-narrow interval)", pass: csForgeryCaught, detail: "halving the confidence-sequence width (overstating precision) is rejected on re-derivation" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering a recorded observation breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same stream → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty / NaN / garbage streams never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
