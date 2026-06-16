/**
 * 📉 THE SELECTION-BIAS (WINNER'S-CURSE) CERTIFICATE — the most pervasive lie in optimization, made honest.
 * When you search N candidate settings under measurement noise and report the BEST one, the value you report
 * is upward-biased: the maximum of N noisy trials is optimistic by construction (you partly selected the
 * setting that got lucky, not just the one that is best). Re-measure that "winner" tomorrow and it regresses
 * down — the winner's curse. Every optimizer hands you the inflated number and stops.
 *
 * This certificate de-biases it. It records the full set of N evaluated values + the measurement noise σ, and
 * computes a valid lower bound on the TRUE mean of the SELECTED setting that accounts for the optimism of
 * having picked the max of N: V_lower = max(values) − q_N·σ, where q_N is the (closed-form) upper quantile of
 * the maximum of N standard normals, q_N = Φ⁻¹(level^(1/N)). Under the worst case (all settings truly equal,
 * so the winner is pure luck) the observed max minus its true mean IS distributed as that maximum — so the
 * bound holds with the stated confidence; when there is a genuinely-better setting, selection is less
 * noise-driven and the bound is conservative. The discount GROWS with N: the more you searched, the more you
 * must discount the winner. Ed25519-signed; the bound re-derives offline from the recorded values.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot hold the full set of evaluated trial values, compute the
 * order-statistic selection correction, and sign a re-derivable bound — it just repeats the inflated max.
 * (DIAKRISIS — MEASURED: the de-biased bound is ≤ the selected setting's true value ≥97.5% of the time
 * (a valid lower bound), while the naive reported max OVERSTATES the truth; the discount is monotone in N.)
 */
import { type Experiment, lcg } from "./space.js";
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
// Acklam's inverse normal CDF (one-sided quantile) — same routine used across the honesty stack
function normInv(p: number): number {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
// the upper quantile of the MAXIMUM of n iid standard normals: P(max ≤ q) = Φ(q)^n = level ⇒ q = Φ⁻¹(level^(1/n)).
// Built at a level slightly above the user-facing confidence so the realized coverage is a guaranteed ≥ confidence.
function maxQuantile(n: number, confidence: number): number {
  const level = confidence + (1 - confidence) * 0.6;   // small safety margin → realized coverage ≥ confidence (measured)
  return normInv(Math.pow(level, 1 / Math.max(1, n)));
}
// Student-t inflation of a normal quantile z0 by degrees of freedom (Cornish-Fisher 2-term). When σ is
// ESTIMATED from finite replicates, the selection quantile must be studentized (df → ∞ recovers the normal).
function tMult(df: number, z0: number): number { if (df < 1) return Math.max(6, z0 + 4); const z = z0, z3 = z * z * z, z5 = z3 * z * z; return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df); }
function mean(xs: number[]): number { return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0; }

export interface SelectionCertificate {
  standard: "melete-selection-certificate/v1";
  verdict: "DE-BIASED";
  n: number;                       // number of candidate settings searched
  naiveBest: number;               // the optimistic reported max (what every other tool gives you)
  correctedLowerBound: number;     // a valid lower bound on the SELECTED setting's TRUE mean, after selection
  selectionPenalty: number;        // naiveBest − correctedLowerBound = the winner's-curse discount (grows with N)
  sigma: number;                   // the measurement-noise sd used (supplied, or estimated from replicates)
  sigmaKnown: boolean;             // true ⇒ σ supplied (normal quantile); false ⇒ σ ESTIMATED ⇒ studentized
  df: number;                      // degrees of freedom of the σ estimate (0 ⇒ known σ / ∞)
  se: number;                      // the standard error of the winner's reported value used in the penalty
  confidence: number;              // the lower bound holds with at least this probability
  values: number[];                // the per-candidate values (single observations, or means of replicates)
  replicates: number[][];          // per-candidate replicate measurements (the evidence) when σ is estimated; else []
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

export function selectionCertificate(opts: { values?: number[]; replicates?: number[][]; oracle?: (e: Experiment) => number; candidates?: Experiment[]; sigma?: number; confidence?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): SelectionCertificate {
  const confidence = opts.confidence ?? 0.975;
  let values: number[], replicates: number[][], sigma: number, sigmaKnown: boolean, df: number, se: number;
  if (opts.replicates && opts.replicates.length) {
    // ── ESTIMATED σ (studentized): each candidate has r replicates; pool the within-candidate variance ──
    replicates = opts.replicates; values = replicates.map(mean);
    let ssq = 0, dof = 0;
    for (const reps of replicates) { const m = mean(reps); if (reps.length >= 2) { for (const v of reps) ssq += (v - m) * (v - m); dof += reps.length - 1; } }
    sigma = dof > 0 ? Math.sqrt(ssq / dof) : 0; sigmaKnown = false; df = dof;
    const n = values.length; let bi = 0; for (let i = 1; i < n; i++) if (values[i] > values[bi]) bi = i;
    se = sigma / Math.sqrt(Math.max(1, replicates[bi]?.length ?? 1));
  } else {
    // ── KNOWN σ: one observation per candidate, σ supplied (the R13 mode) ──
    values = opts.values ?? (opts.oracle && opts.candidates ? opts.candidates.map((c) => opts.oracle!(c)) : []);
    replicates = []; sigma = Math.max(0, opts.sigma ?? 0); sigmaKnown = true; df = 0; se = sigma;
  }
  const n = values.length;
  const naiveBest = n ? Math.max(...values) : 0;
  const z = maxQuantile(n, confidence);                              // the max-of-N selection quantile (normal)
  const q = sigmaKnown ? z : tMult(df, z);                           // studentize when σ is estimated
  const selectionPenalty = q * se;
  const correctedLowerBound = naiveBest - selectionPenalty;
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-selection-certificate/v1" as const, verdict: "DE-BIASED" as const, n, naiveBest, correctedLowerBound, selectionPenalty, sigma, sigmaKnown, df, se, confidence, values, replicates };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifySelectionCertificate(c: SelectionCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-selection-certificate/v1") return { ok: false, reason: "unknown standard" };
    if (c.values.length !== c.n) return { ok: false, reason: "value count does not match n" };
    let se = c.se, sigma = c.sigma, df = c.df;
    if (!c.sigmaKnown) {
      // re-derive the means + pooled σ + df from the replicate evidence — a forged σ/df is caught here
      if (c.replicates.length !== c.n) return { ok: false, reason: "replicate count does not match n" };
      const means = c.replicates.map(mean);
      for (let i = 0; i < c.n; i++) if (Math.abs(means[i] - c.values[i]) > 1e-9) return { ok: false, reason: "recorded candidate value ≠ mean of its replicates — tampered" };
      let ssq = 0, dof = 0; for (const reps of c.replicates) { const m = mean(reps); if (reps.length >= 2) { for (const v of reps) ssq += (v - m) * (v - m); dof += reps.length - 1; } }
      sigma = dof > 0 ? Math.sqrt(ssq / dof) : 0; df = dof;
      let bi = 0; for (let i = 1; i < c.n; i++) if (means[i] > means[bi]) bi = i;
      se = sigma / Math.sqrt(Math.max(1, c.replicates[bi]?.length ?? 1));
      if (Math.abs(sigma - c.sigma) > 1e-9 || df !== c.df || Math.abs(se - c.se) > 1e-9) return { ok: false, reason: "recomputed σ̂ / df / se differ from the certificate — the estimate was misstated" };
    } else if (c.replicates.length !== 0 || c.df !== 0 || Math.abs(c.se - c.sigma) > 1e-9) return { ok: false, reason: "known-σ certificate has inconsistent estimate fields" };
    const naiveBest = c.n ? Math.max(...c.values) : 0;
    if (Math.abs(naiveBest - c.naiveBest) > 1e-9) return { ok: false, reason: "recomputed max differs from the recorded best — tampered" };
    const z = maxQuantile(c.n, c.confidence); const q = c.sigmaKnown ? z : tMult(df, z);
    const penalty = q * se, lower = naiveBest - penalty;
    if (Math.abs(penalty - c.selectionPenalty) > 1e-9 || Math.abs(lower - c.correctedLowerBound) > 1e-9) return { ok: false, reason: "recomputed selection correction differs — the discount was understated (winner's curse hidden)" };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, n: c.n, naiveBest: c.naiveBest, correctedLowerBound: c.correctedLowerBound, selectionPenalty: c.selectionPenalty, sigma: c.sigma, sigmaKnown: c.sigmaKnown, df: c.df, se: c.se, confidence: c.confidence, values: c.values, replicates: c.replicates })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a recorded value was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `selection-adjusted lower bound re-derived: ${c.naiveBest.toFixed(2)} − ${c.selectionPenalty.toFixed(2)} = ${c.correctedLowerBound.toFixed(2)} (N=${c.n})` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function selectionGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const gz = (g: () => number) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  const sigma = 1.0;
  // simulate a search: N candidate settings with true means μ_i; observe y_i = μ_i + noise; select argmax y.
  // three regimes: NULL (all μ equal — the winner is pure luck, the hardest case for coverage),
  // CLEAR (one genuinely-better setting), MIXED (a spread of μ).
  const sim = (regime: "null" | "clear" | "mixed", n: number, seed: number) => {
    const g = lcg(seed);
    const mu: number[] = [];
    for (let i = 0; i < n; i++) { if (regime === "null") mu.push(5.0); else if (regime === "clear") mu.push(i === 0 ? 6.5 : 5.0); else mu.push(5.0 + 1.2 * gz(g)); }
    const y = mu.map((m) => m + sigma * gz(g));
    let bi = 0; for (let i = 1; i < n; i++) if (y[i] > y[bi]) bi = i;
    return { values: y, trueBest: mu[bi], naive: y[bi] };
  };

  // 1) COVERAGE: the corrected lower bound ≤ the SELECTED setting's true mean ≥97.5% (a valid lower bound)
  // 2) NAIVE-OVERSTATES: the reported max exceeds the true mean (the bias the correction removes)
  let cov = 0, covN = 0, nullCov = 0, nullN = 0, naiveOver = 0, naiveN = 0, inflSum = 0, gapSum = 0, gapN = 0;
  const regimes: Array<"null" | "clear" | "mixed"> = ["null", "clear", "mixed"];
  for (let s = 1; s <= 1500; s++) {
    const regime = regimes[s % 3]; const n = [3, 8, 20, 60][s % 4];
    const { values, trueBest, naive } = sim(regime, n, s * 13 + 1);
    const c = selectionCertificate({ values, sigma });
    covN++; if (c.correctedLowerBound <= trueBest + 1e-9) cov++;
    if (regime === "null") { nullN++; if (c.correctedLowerBound <= trueBest + 1e-9) nullCov++; }
    naiveN++; if (naive > trueBest) naiveOver++; inflSum += (naive - trueBest);
    gapN++; gapSum += (trueBest - c.correctedLowerBound);   // how far below the truth the bound sits (tightness)
  }
  const covRate = cov / covN, nullRate = nullN ? nullCov / nullN : 0, naiveOverRate = naiveOver / naiveN;
  const avgInflation = inflSum / naiveN, avgGap = gapSum / gapN;

  // 3) MONOTONE-IN-N: the discount grows with the number searched (more search ⇒ more winner's curse)
  const q3 = maxQuantile(3, 0.975), q8 = maxQuantile(8, 0.975), q20 = maxQuantile(20, 0.975), q100 = maxQuantile(100, 0.975);
  const monotone = q3 < q8 && q8 < q20 && q20 < q100 && q3 > 0;

  // 4) SIGNED-VERIFIES + TAMPER + FORGERY (a smaller penalty = hidden curse)
  const cc = selectionCertificate({ values: sim("mixed", 20, 7).values, sigma });
  const verifyOk = verifySelectionCertificate(cc).ok;
  const tamper = !verifySelectionCertificate({ ...cc, values: cc.values.map((v, i) => (i === 0 ? v + 9 : v)) }).ok;
  const forged = { ...cc, selectionPenalty: cc.selectionPenalty / 2, correctedLowerBound: cc.naiveBest - cc.selectionPenalty / 2 };
  const forgeryCaught = !verifySelectionCertificate(forged).ok;

  // 5) DETERMINISTIC + 6) TOTAL
  const d1 = selectionCertificate({ values: [1, 2, 3, 4], sigma: 1 }), d2 = selectionCertificate({ values: [1, 2, 3, 4], sigma: 1 });
  const deterministic = d1.payloadHash === d2.payloadHash && verifySelectionCertificate(d1).ok;
  let total = true; try { selectionCertificate({ values: [], sigma: NaN }); selectionCertificate({ values: [NaN, 1], sigma: 1 }); selectionCertificate({ replicates: [[1, 2]] }); } catch { total = false; }

  // ── R14 IMPROVE: ESTIMATED σ (studentized). When σ is unknown and estimated from r replicates, the
  // known-σ plug-in (normal quantile) UNDER-COVERS; the studentized quantile tMult(df, q_N) restores ≥97.5%. ──
  let studCov = 0, studN = 0, plugUnder = 0, plugN = 0, studVerify = 0, backCompat = 0;
  const designs: Array<[number, number]> = [[4, 2], [4, 3], [8, 3], [8, 2]];   // [N candidates, r replicates] — small df
  for (let s = 1; s <= 1600; s++) {
    const [N, r] = designs[s % designs.length]; const g = lcg(s * 131 + 7);
    const reps: number[][] = []; for (let i = 0; i < N; i++) { const row: number[] = []; for (let k = 0; k < r; k++) row.push(5.0 + sigma * gz(g)); reps.push(row); }   // NULL regime (hardest)
    const means = reps.map(mean); let bi = 0; for (let i = 1; i < N; i++) if (means[i] > means[bi]) bi = i; const trueBest = 5.0;
    const cStud = selectionCertificate({ replicates: reps });   // studentized (estimates σ itself)
    studN++; if (cStud.correctedLowerBound <= trueBest + 1e-9) studCov++; if (verifySelectionCertificate(cStud).ok) studVerify++;
    // the plug-in: estimate σ the same way but use the NORMAL quantile (no studentization) — the thing we fixed
    const z = maxQuantile(N, 0.975); const plugLB = cStud.naiveBest - z * cStud.se;
    plugN++; if (plugLB <= trueBest + 1e-9) plugUnder++;
  }
  const studCovRate = studN ? studCov / studN : 0, plugCovRate = plugN ? plugUnder / plugN : 0, studVerifyRate = studN ? studVerify / studN : 0;
  // BACKWARD-COMPAT: with many replicates (df → large) the studentized bound ≈ the known-σ bound
  { const g = lcg(999); const reps: number[][] = []; for (let i = 0; i < 8; i++) { const row: number[] = []; for (let k = 0; k < 200; k++) row.push(5.0 + sigma * gz(g)); reps.push(row); }
    const cBig = selectionCertificate({ replicates: reps }); const zb = maxQuantile(8, 0.975);
    if (Math.abs((cBig.naiveBest - cBig.correctedLowerBound) - zb * cBig.se) < 0.02 * (zb * cBig.se)) backCompat = 1; }

  const checks = [
    { name: "COVERAGE≥97.5% (valid lower bound)", pass: covRate >= 0.975 && covN >= 500, detail: `the de-biased bound was ≤ the selected setting's TRUE value in ${cov}/${covN} = ${(covRate * 100).toFixed(1)}% (a valid lower bound, all regimes)` },
    { name: "NULL-COVERAGE≥97.5% (hardest)", pass: nullRate >= 0.975 && nullN >= 150, detail: `under the worst case (all settings truly equal, the winner is pure luck), coverage held at ${(nullRate * 100).toFixed(1)}%` },
    { name: "NAIVE-OVERSTATES (the bias)", pass: naiveOverRate >= 0.8 && avgInflation > 0.2, detail: `the naive reported max exceeded the true value in ${(naiveOverRate * 100).toFixed(0)}% of searches, by avg +${avgInflation.toFixed(2)} — exactly the optimism the correction removes` },
    { name: "USEFUL (bound not vacuous)", pass: avgGap < 3 * sigma && avgGap > 0, detail: `the corrected bound sits on average ${avgGap.toFixed(2)} below the truth (< 3σ) — conservative but useful, not −∞` },
    { name: "MONOTONE-IN-N (more search ⇒ more discount)", pass: monotone, detail: `selection discount per σ grows with N: q₃=${q3.toFixed(2)} < q₈=${q8.toFixed(2)} < q₂₀=${q20.toFixed(2)} < q₁₀₀=${q100.toFixed(2)}` },
    { name: "SIGNED-VERIFIES+TAMPER", pass: verifyOk && tamper, detail: "the bound re-derives from the recorded values; altering a value fails the hash" },
    { name: "FORGERY-CAUGHT (hidden curse)", pass: forgeryCaught, detail: "a certificate that halves the selection penalty (hiding the winner's curse) is rejected" },
    { name: "STUDENTIZED-COVERAGE≥97.5% (σ estimated)", pass: studCovRate >= 0.975 && studN >= 500 && studVerifyRate >= 0.999, detail: `with σ UNKNOWN (estimated from few replicates), the studentized bound held coverage at ${(studCovRate * 100).toFixed(1)}% and every cert re-verified (${studVerify}/${studN})` },
    { name: "PLUGIN-UNDERCOVERS (the fix is real)", pass: plugCovRate < 0.965 && studCovRate - plugCovRate >= 0.02, detail: `the naive normal-quantile plug-in (estimated σ, no studentization) under-covered at ${(plugCovRate * 100).toFixed(1)}% — below the 97.5% guarantee; studentization restored it to ${(studCovRate * 100).toFixed(1)}%` },
    { name: "BACKWARD-COMPAT (df→∞ ≈ known-σ)", pass: backCompat === 1, detail: "with many replicates the studentized discount converges to the known-σ (normal-quantile) discount" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same inputs → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty / NaN inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
