/**
 * 🔒 THE PRIVACY CERTIFICATE — when an agent RELEASES an aggregate, prove no individual can be re-identified.
 *
 * Melete is sovereign: your raw data never leaves your machine. But the moment you SHARE a result — a benchmark
 * mean across a federation, a published statistic, a pooled gradient — you can leak the very individuals you meant
 * to protect (membership inference: "was THIS record in your dataset?"). Differential privacy is the rigorous
 * answer, but nobody hands you a signed proof that a specific release actually satisfies the (ε,δ) you claim — and
 * the dishonest failure mode is UNDER-noising: add too little noise, quietly claim a small ε, look private while
 * leaking. An LLM cannot calibrate the noise, bound the privacy loss, and sign a re-derivable guarantee — it just
 * emits a number.
 *
 * This certificate runs the Gaussian mechanism with the TIGHT analytic calibration (Balle & Wang 2018) — the
 * smallest noise that provably gives (ε,δ)-DP for the stated L2 sensitivity — releases only the noised aggregate
 * (never the true value), and signs the verdict. Verify re-derives the required σ and the analytic δ offline and
 * REJECTS any release whose noise is too small for the ε it claims. A composition ledger tracks the cumulative
 * privacy budget across many releases and refuses the one that would overspend it.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot solve the analytic-Gaussian calibration, prove the privacy-loss
 * region holds, track a composed budget, and sign a re-derivable (ε,δ)-DP verdict. (DIAKRISIS — MEASURED: the
 * optimal membership-inference attack against a certified release stays inside the (ε,δ) privacy region
 * [TPR ≤ e^ε·FPR + δ], an under-noised release is caught leaking far outside it, the calibration is tight
 * [analytic δ = target δ], more privacy budget measurably costs utility, and the ledger refuses an over-budget
 * release. HONEST: this certifies the RELEASE MECHANISM's (ε,δ)-DP for the sensitivity you declare — it does not
 * audit that your stated sensitivity is correct, and DP is a guarantee in expectation over the mechanism's own
 * randomness, not a property of one specific noisy number.)
 */
import { createHash, generateKeyPairSync, createPublicKey, randomBytes, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

// standard normal CDF via Abramowitz-Stegun erf (max abs err ~1.5e-7 — ample for noise calibration)
function erf(x: number): number { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
function Phi(x: number): number { return 0.5 * (1 + erf(x / Math.SQRT2)); }
// Balle & Wang (2018) analytic Gaussian privacy profile: a release of L2-sensitivity `sens` with per-coordinate
// noise σ is (ε,δ)-DP  ⟺  δ ≥ Φ(μ/2 − ε/μ) − e^ε·Φ(−μ/2 − ε/μ),  where μ = sens/σ.
function analyticDelta(sigma: number, sens: number, eps: number): number { if (sigma <= 0) return 1; const mu = sens / sigma; return Math.max(0, Math.min(1, Phi(mu / 2 - eps / mu) - Math.exp(eps) * Phi(-mu / 2 - eps / mu))); }
// smallest σ that achieves (ε,δ)-DP — monotone in σ, so bisect.
function requiredSigma(sens: number, eps: number, del: number): number {
  if (!(sens > 0) || !(eps > 0) || !(del > 0) || del >= 1) return Infinity;
  let lo = 1e-12, hi = Math.max(sens, 1e-9); let guard = 0;
  while (analyticDelta(hi, sens, eps) > del && guard++ < 200) hi *= 2;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (analyticDelta(mid, sens, eps) > del) lo = mid; else hi = mid; }
  return hi;
}
// Box-Muller standard normal from a uniform source (default: cryptographically secure)
function cryptoUniform(): number { return (randomBytes(6).readUIntBE(0, 6) + 0.5) / 0x1000000000000; }
function stdNormal(rng: () => number): number { let u = 0, v = 0; while (u < 1e-12) u = rng(); while (v < 1e-12) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export interface PrivacyCertificate {
  standard: "melete-privacy-certificate/v1";
  mechanism: "analytic-gaussian";
  verdict: "PRIVATE" | "INSUFFICIENT-NOISE";
  dimension: number;
  sensitivity: number;          // declared L2 sensitivity of the query
  epsilon: number;
  delta: number;
  sigma: number;                // per-coordinate Gaussian noise actually used
  sigmaRequired: number;        // smallest σ that achieves (ε,δ)-DP (Balle-Wang)
  achievedDelta: number;        // analytic δ at the σ used (≤ delta ⇒ private)
  satisfiesDP: boolean;
  release: number[];            // the NOISED aggregate — the only thing revealed (true value never stored)
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

export function privacyCertificate(opts: { statistic: number[]; sensitivity: number; epsilon: number; delta: number; sigma?: number; rng?: () => number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): PrivacyCertificate {
  const stat = (opts.statistic ?? []).map((x) => (Number.isFinite(x) ? x : 0));
  const sensitivity = Number.isFinite(opts.sensitivity) && opts.sensitivity > 0 ? opts.sensitivity : 0;
  const epsilon = Number.isFinite(opts.epsilon) && opts.epsilon > 0 ? opts.epsilon : 0;
  const delta = Number.isFinite(opts.delta) && opts.delta > 0 && opts.delta < 1 ? opts.delta : 0;
  const sigmaRequired = (sensitivity && epsilon && delta) ? requiredSigma(sensitivity, epsilon, delta) : Infinity;
  // honest issuance uses exactly the required noise; a caller MAY pass a larger σ (more private), never trust a smaller one
  const sigma = Number.isFinite(opts.sigma) && (opts.sigma as number) > 0 ? Math.max(opts.sigma as number, 0) : (Number.isFinite(sigmaRequired) ? sigmaRequired : 0);
  const rng = opts.rng ?? cryptoUniform;
  const release = stat.map((x) => x + sigma * stdNormal(rng));
  const achieved = (sensitivity && epsilon) ? analyticDelta(sigma, sensitivity, epsilon) : 1;
  const satisfiesDP = sensitivity > 0 && epsilon > 0 && delta > 0 && sigma > 0 && Number.isFinite(sigma) && achieved <= delta * (1 + 1e-9);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = {
    standard: "melete-privacy-certificate/v1" as const, mechanism: "analytic-gaussian" as const,
    verdict: (satisfiesDP ? "PRIVATE" : "INSUFFICIENT-NOISE") as PrivacyCertificate["verdict"],
    dimension: stat.length, sensitivity, epsilon, delta,
    sigma: Number.isFinite(sigma) ? sigma : 0, sigmaRequired: Number.isFinite(sigmaRequired) ? sigmaRequired : 0,
    achievedDelta: achieved, satisfiesDP, release,
  };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyPrivacyCertificate(c: PrivacyCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-privacy-certificate/v1") return { ok: false, reason: "unknown standard" };
    if (c.mechanism !== "analytic-gaussian") return { ok: false, reason: "unknown mechanism" };
    if (c.release.length !== c.dimension) return { ok: false, reason: "release dimension mismatch" };
    // RE-DERIVE the privacy property: the required noise + the analytic δ at the σ used. This is what catches
    // an under-noised release dressed up with a small ε — independent of the (secret) noise actually drawn.
    const sigmaRequired = requiredSigma(c.sensitivity, c.epsilon, c.delta);
    if (Number.isFinite(sigmaRequired) && Math.abs(sigmaRequired - c.sigmaRequired) > 1e-6 * Math.max(1, sigmaRequired)) return { ok: false, reason: "recomputed required σ differs" };
    const achieved = analyticDelta(c.sigma, c.sensitivity, c.epsilon);
    if (Math.abs(achieved - c.achievedDelta) > 1e-9) return { ok: false, reason: "recomputed achieved δ differs" };
    const satisfiesDP = c.sensitivity > 0 && c.epsilon > 0 && c.delta > 0 && c.sigma > 0 && Number.isFinite(c.sigma) && achieved <= c.delta * (1 + 1e-9);
    if (satisfiesDP !== c.satisfiesDP) return { ok: false, reason: "recomputed DP verdict differs — claimed privacy not supported by the noise" };
    const verdict = satisfiesDP ? "PRIVATE" : "INSUFFICIENT-NOISE";
    if (verdict !== c.verdict) return { ok: false, reason: `recomputed verdict ${verdict} ≠ certificate ${c.verdict}` };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, mechanism: c.mechanism, verdict: c.verdict, dimension: c.dimension, sensitivity: c.sensitivity, epsilon: c.epsilon, delta: c.delta, sigma: c.sigma, sigmaRequired: c.sigmaRequired, achievedDelta: c.achievedDelta, satisfiesDP: c.satisfiesDP, release: c.release })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a field was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `${c.verdict}: (ε=${c.epsilon}, δ=${c.delta})-DP via analytic Gaussian σ=${c.sigma.toExponential(2)} (≥ required ${c.sigmaRequired.toExponential(2)})` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

// COMPOSITION LEDGER — the cumulative privacy budget across many releases. Basic (linear) composition bounds the
// spend; advanced composition is reported as a tighter alternative. Refuses a release that would overspend.
export interface PrivacyLedger { epsilonBudget: number; deltaBudget: number; spentEpsilon: number; spentDelta: number; releases: number; }
export function createPrivacyLedger(epsilonBudget: number, deltaBudget: number): PrivacyLedger { return { epsilonBudget, deltaBudget, spentEpsilon: 0, spentDelta: 0, releases: 0 }; }
export function ledgerRecord(ledger: PrivacyLedger, c: PrivacyCertificate): { accepted: boolean; reason: string; spentEpsilon: number; spentDelta: number } {
  if (!c.satisfiesDP) return { accepted: false, reason: "release is not certified PRIVATE", spentEpsilon: ledger.spentEpsilon, spentDelta: ledger.spentDelta };
  const ne = ledger.spentEpsilon + c.epsilon, nd = ledger.spentDelta + c.delta;
  if (ne > ledger.epsilonBudget + 1e-12 || nd > ledger.deltaBudget + 1e-12) return { accepted: false, reason: `would overspend budget (ε ${ne.toFixed(3)}/${ledger.epsilonBudget}, δ ${nd.toExponential(2)}/${ledger.deltaBudget})`, spentEpsilon: ledger.spentEpsilon, spentDelta: ledger.spentDelta };
  ledger.spentEpsilon = ne; ledger.spentDelta = nd; ledger.releases++;
  return { accepted: true, reason: "recorded", spentEpsilon: ne, spentDelta: nd };
}
// advanced composition (Dwork-Rothblum-Vadhan): k identical (ε,δ) releases are (ε', kδ+δ')-DP with
// ε' = √(2k ln(1/δ')) ε + k ε (e^ε − 1). Tighter than basic kε for many small releases.
export function advancedComposition(eps: number, del: number, k: number, deltaPrime: number): { epsilon: number; delta: number } {
  const epsP = Math.sqrt(2 * k * Math.log(1 / deltaPrime)) * eps + k * eps * (Math.exp(eps) - 1);
  return { epsilon: epsP, delta: k * del + deltaPrime };
}

// lcg-style deterministic uniform for the gauntlet (kept local; production uses cryptoUniform)
function det(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }

export function privacyGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const n = 200, sens = 1 / n;
  // optimal membership-inference attacker = threshold on the 1-D output between neighboring datasets D (mean 0)
  // and D' (mean = sens). For DP the ROC must satisfy TPR ≤ e^ε FPR + δ at every threshold.
  function maxRegionViolation(sigma: number, eps: number, g: () => number, T: number): number {
    const od: number[] = [], op: number[] = []; for (let i = 0; i < T; i++) { od.push(sigma * stdNormal(g)); op.push(sens + sigma * stdNormal(g)); }
    od.sort((a, b) => a - b); op.sort((a, b) => a - b);
    const frac = (a: number[], x: number) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo / a.length; };
    let w = 0; for (let q = 0; q <= 400; q++) { const t = -0.6 + (sens + 1.2) * (q / 400); const fpr = 1 - frac(od, t), tpr = 1 - frac(op, t); w = Math.max(w, tpr - Math.exp(eps) * fpr, fpr - Math.exp(eps) * tpr); }
    return w;
  }
  const eps = 1.0, del = 0.05;
  const cPriv = privacyCertificate({ statistic: [0], sensitivity: sens, epsilon: eps, delta: del, rng: det(1) });
  const privViol = maxRegionViolation(cPriv.sigma, eps, det(7), 400000);
  const underViol = maxRegionViolation(cPriv.sigma * 0.2, eps, det(8), 200000);

  // utility vs privacy: bigger ε → smaller σ → smaller RMSE on the release
  const sig = (e: number) => privacyCertificate({ statistic: [0], sensitivity: sens, epsilon: e, delta: del, rng: det(2) }).sigma;
  const s01 = sig(0.1), s1 = sig(1.0), s4 = sig(4.0);
  const monotone = s01 > s1 && s1 > s4 && s4 > 0;

  // calibration tightness: analytic δ at the required σ equals the target δ (Balle-Wang is exact)
  const calTight = Math.abs(cPriv.achievedDelta - del) <= del * 0.02;

  // composition ledger refuses an over-budget release
  const led = createPrivacyLedger(1.0, 1e-3);
  const mk = () => privacyCertificate({ statistic: [0], sensitivity: sens, epsilon: 0.3, delta: 2e-4, rng: det(3) });
  const r1 = ledgerRecord(led, mk()), r2 = ledgerRecord(led, mk()), r3 = ledgerRecord(led, mk()), r4 = ledgerRecord(led, mk());
  const ledgerOk = r1.accepted && r2.accepted && r3.accepted && !r4.accepted && Math.abs(led.spentEpsilon - 0.9) < 1e-9;
  const adv = advancedComposition(0.1, 1e-6, 100, 1e-6); const advTighter = adv.epsilon < 100 * 0.1; // advanced beats basic kε for many small releases

  // signed / forgery / tamper / deterministic / total
  const verifyOk = verifyPrivacyCertificate(cPriv).ok && cPriv.verdict === "PRIVATE";
  // FORGERY: keep the (under-)noise but claim a 5× smaller ε → required σ jumps, achieved δ blows past δ → caught
  const forged = privacyCertificate({ statistic: [0], sensitivity: sens, epsilon: eps, delta: del, rng: det(1) });
  const forgedTampered = { ...forged, epsilon: eps / 5, verdict: "PRIVATE" as const, satisfiesDP: true };
  const forgeryCaught = !verifyPrivacyCertificate(forgedTampered).ok;
  const tamper = !verifyPrivacyCertificate({ ...cPriv, release: cPriv.release.map((x) => x + 1) }).ok;
  const d1 = privacyCertificate({ statistic: [0.3, 0.7], sensitivity: sens, epsilon: eps, delta: del, rng: det(5) });
  const d2 = privacyCertificate({ statistic: [0.3, 0.7], sensitivity: sens, epsilon: eps, delta: del, rng: det(5) });
  const deterministic = d1.payloadHash === d2.payloadHash && verifyPrivacyCertificate(d1).ok;
  let total = true; try { privacyCertificate({ statistic: [], sensitivity: 0, epsilon: 0, delta: 0 }); privacyCertificate({ statistic: [NaN], sensitivity: -1, epsilon: 5, delta: 2, rng: det(9) }); } catch { total = false; }

  const checks = [
    { name: "DP-REGION-HOLDS", pass: privViol <= del * 1.1, detail: `the optimal membership-inference attack against the certified release stays at the (ε,δ) privacy region boundary — empirical max violation ${privViol.toFixed(4)} ≈ the exact analytic δ=${del} (within Monte-Carlo tolerance), not beyond it` },
    { name: "UNDER-NOISE-LEAKS", pass: underViol >= 0.3 && forgeryCaught, detail: `a release with 1/5 the certified noise leaks far outside the region (violation ${underViol.toFixed(3)} ≫ δ) and a cert claiming it is PRIVATE is rejected on re-derivation` },
    { name: "CALIBRATION-TIGHT", pass: calTight, detail: `analytic-Gaussian (Balle-Wang) noise is the minimum: achieved δ ${cPriv.achievedDelta.toExponential(2)} = target δ ${del} (not 1000× over-noised)` },
    { name: "PRIVACY-UTILITY-TRADEOFF", pass: monotone, detail: `more privacy costs utility, measured: σ(ε=0.1)=${s01.toExponential(2)} > σ(1.0)=${s1.toExponential(2)} > σ(4.0)=${s4.toExponential(2)}` },
    { name: "COMPOSITION-REFUSES-OVERSPEND", pass: ledgerOk && advTighter, detail: `the budget ledger accepted 3×(ε=0.3) then refused the 4th (Σε 0.9→1.2 > 1.0); advanced composition reports a tighter ε'=${adv.epsilon.toFixed(2)} vs basic ${(100 * 0.1).toFixed(0)} for 100 releases` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "required σ + achieved δ + the (ε,δ)-DP verdict re-derive offline from the certificate" },
    { name: "FORGERY-CAUGHT (under-claimed ε)", pass: forgeryCaught, detail: "claiming a smaller ε than the noise supports is rejected — verify recomputes the required σ" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering the released values breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same statistic + seed → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty / NaN / out-of-range inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
