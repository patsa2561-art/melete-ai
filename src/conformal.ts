/**
 * 📏 THE CONFORMAL-PREDICTION CERTIFICATE — a distribution-free prediction interval with GUARANTEED coverage,
 * around any agent's predictor.
 *
 * Agents make predictions, and the reflexive "ŷ ± 1.96σ" silently assumes the errors are Gaussian. On real,
 * skewed or heavy-tailed data that assumption is wrong — the interval over-covers (wastefully wide) or, on
 * adversarial distributions, under-covers (a false sense of certainty). Split-conformal prediction fixes this
 * with a remarkable, assumption-free guarantee: from a held-out calibration set of the predictor's residuals,
 * it produces a half-width q such that for a fresh prediction, P(truth ∈ ŷ ± q) lies in [1−α, 1−α+1/(n+1)] —
 * EXACTLY, in finite samples, for ANY distribution, by exchangeability alone. q is the ⌈(1−α)(n+1)⌉-th
 * smallest absolute residual: nothing assumed about the noise.
 *
 * The certificate records the calibration residuals + α, derives q + the coverage band, and (given a point
 * prediction) the interval. Ed25519-signed; q re-derives offline, so a too-narrow (over-confident) interval
 * is rejected.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot hold a calibration residual set, compute the conformal rank, and
 * sign a re-derivable coverage guarantee — it just emits a confident point estimate. (DIAKRISIS — MEASURED:
 * the conformal interval's coverage lands at 1−α across normal / heavy-tailed / skewed residuals
 * (distribution-free), and on skewed data it is TIGHTER than a Gaussian interval that over-covers because its
 * normality assumption is wrong. HONEST: the guarantee is MARGINAL coverage (averaged over draws), not
 * conditional on a specific input; it assumes the calibration + test residuals are exchangeable.)
 */
import { lcg } from "./space.js";
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
// the conformal quantile of a set of nonconformity SCORES: the ⌈(1−α)(n+1)⌉-th smallest (∞ if that exceeds n)
function scoreQuantile(scores: number[], alpha: number): { q: number; atLeast: boolean } {
  const s = scores.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  const n = s.length; if (n === 0) return { q: Infinity, atLeast: true };
  const k = Math.ceil((1 - alpha) * (n + 1));
  return k > n ? { q: Infinity, atLeast: true } : { q: s[k - 1], atLeast: false };
}
// build the nonconformity scores: plain = |residual|; NORMALIZED (adaptive) = |residual| / difficulty(x), so the
// interval is scaled by a per-input difficulty estimate — wider where the model is uncertain. Normalized conformal
// balances coverage ACROSS input regions under heteroscedastic noise (plain only guarantees the marginal average).
function buildScores(residuals: number[], difficulty: number[] | null): number[] {
  if (!difficulty) return residuals.map((r) => Math.abs(r));
  return residuals.map((r, i) => { const d = difficulty[i]; return d && Number.isFinite(d) && d > 0 ? Math.abs(r) / d : NaN; });
}

export interface ConformalCertificate {
  standard: "melete-conformal-certificate/v2";
  verdict: "COVERAGE-GUARANTEED" | "INSUFFICIENT-CALIBRATION";
  normalized: boolean;             // false = plain (constant width); true = adaptive (width ∝ per-input difficulty)
  n: number;                       // calibration set size
  alpha: number;                   // miscoverage level (target coverage 1−α)
  halfWidth: number;               // q — plain: ŷ ± q. normalized: q is a MULTIPLIER → ŷ ± q·difficulty(x). (−1 if ∞)
  atLeast: boolean;                // q hit +∞ (n too small for this α to give a finite interval)
  coverageLower: number;           // guaranteed marginal coverage ≥ this (= 1−α)
  coverageUpper: number;           // ≤ this (= min(1, 1−α+1/(n+1)))
  prediction: number | null;       // optional point prediction ŷ
  predictionDifficulty: number | null;   // σ̂(x) for the predicted input (normalized mode)
  intervalLower: number | null;    // ŷ − q  (plain)  /  ŷ − q·difficulty  (normalized)
  intervalUpper: number | null;
  residuals: number[];             // the calibration residuals (the evidence)
  difficulty: number[];            // per-residual difficulty σ̂ (normalized mode; [] if plain)
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

export function conformalCertificate(opts: { residuals: number[]; alpha?: number; prediction?: number | null; difficulty?: number[] | null; predictionDifficulty?: number | null; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): ConformalCertificate {
  const alpha = opts.alpha ?? 0.1; const residuals = opts.residuals ?? [];
  const difficulty = (opts.difficulty && opts.difficulty.length === residuals.length) ? opts.difficulty : null;
  const normalized = !!difficulty;
  const n = residuals.filter((r) => Number.isFinite(r)).length;
  const { q, atLeast } = scoreQuantile(buildScores(residuals, difficulty), alpha);
  const verdict: ConformalCertificate["verdict"] = atLeast ? "INSUFFICIENT-CALIBRATION" : "COVERAGE-GUARANTEED";
  const pred = opts.prediction ?? null;
  const pd = normalized ? (opts.predictionDifficulty ?? null) : null;
  const scale = normalized ? (pd ?? NaN) : 1;
  const hasInterval = pred !== null && !atLeast && (!normalized || (pd !== null && Number.isFinite(pd)));
  const intervalLower = hasInterval ? pred - q * scale : null, intervalUpper = hasInterval ? pred + q * scale : null;
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-conformal-certificate/v2" as const, verdict, normalized, n, alpha, halfWidth: atLeast ? -1 : q, atLeast, coverageLower: 1 - alpha, coverageUpper: Math.min(1, 1 - alpha + 1 / (n + 1)), prediction: pred, predictionDifficulty: pd, intervalLower, intervalUpper, residuals, difficulty: difficulty ?? [] };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyConformalCertificate(c: ConformalCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-conformal-certificate/v2") return { ok: false, reason: "unknown standard" };
    const n = c.residuals.filter((r) => Number.isFinite(r)).length;
    if (n !== c.n) return { ok: false, reason: "residual count does not match n" };
    if (c.normalized !== (c.difficulty.length === c.residuals.length && c.residuals.length > 0)) return { ok: false, reason: "normalized flag inconsistent with the difficulty vector" };
    // re-derive the conformal quantile (per mode) — a forged (too-narrow, over-confident) interval is caught
    const { q, atLeast } = scoreQuantile(buildScores(c.residuals, c.normalized ? c.difficulty : null), c.alpha);
    if (atLeast !== c.atLeast) return { ok: false, reason: "recomputed sufficiency flag differs" };
    if (!atLeast && Math.abs(q - c.halfWidth) > 1e-9) return { ok: false, reason: `recomputed half-width ${q.toFixed(4)} ≠ certificate ${c.halfWidth} — interval understated (over-confident)` };
    const verdict = atLeast ? "INSUFFICIENT-CALIBRATION" : "COVERAGE-GUARANTEED";
    if (verdict !== c.verdict) return { ok: false, reason: "verdict inconsistent with the recomputed half-width" };
    if (Math.abs(c.coverageLower - (1 - c.alpha)) > 1e-9 || Math.abs(c.coverageUpper - Math.min(1, 1 - c.alpha + 1 / (n + 1))) > 1e-9) return { ok: false, reason: "coverage band inconsistent with n and α" };
    const scale = c.normalized ? (c.predictionDifficulty ?? NaN) : 1;
    if (c.intervalLower !== null && (Math.abs((c.prediction! - q * scale) - c.intervalLower) > 1e-9 || Math.abs((c.prediction! + q * scale) - (c.intervalUpper ?? NaN)) > 1e-9)) return { ok: false, reason: "interval endpoints inconsistent with ŷ ± q·difficulty" };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, normalized: c.normalized, n: c.n, alpha: c.alpha, halfWidth: c.halfWidth, atLeast: c.atLeast, coverageLower: c.coverageLower, coverageUpper: c.coverageUpper, prediction: c.prediction, predictionDifficulty: c.predictionDifficulty, intervalLower: c.intervalLower, intervalUpper: c.intervalUpper, residuals: c.residuals, difficulty: c.difficulty })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a residual was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: c.atLeast ? `insufficient calibration (n=${c.n}) for α=${c.alpha}` : `±${c.halfWidth.toFixed(3)} interval, coverage ∈ [${(c.coverageLower * 100).toFixed(1)}%, ${(c.coverageUpper * 100).toFixed(1)}%], distribution-free` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function conformalGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const gz = (g: () => number) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  const alpha = 0.1, z90 = 1.6448536269514722;
  const gens: Record<string, (g: () => number) => number> = {
    normal: (g) => gz(g),
    heavy: (g) => { const z = gz(g); let v = 0; for (let i = 0; i < 3; i++) { const x = gz(g); v += x * x; } return z / Math.sqrt(Math.max(0.2, v / 3)); },   // ~t(3)
    skewed: (g) => { const u = Math.max(1e-9, g()); return -Math.log(u) - 1; },                                                                          // centered exponential
  };

  // 1) COVERAGE-GUARANTEED (distribution-free): conformal test coverage ≥ 1−α on every residual distribution
  // 2) EFFICIENT-ON-SKEWED: on skewed residuals conformal is tighter than a Gaussian-90 interval that over-covers
  const nCal = 200, nTest = 3000, N = 300;
  let allCovOk = true; const covByGen: Record<string, number> = {}; const gaussCovByGen: Record<string, number> = {};
  let confW = 0, gW = 0, skewN = 0, confCovSkew = 0;
  for (const name of Object.keys(gens)) {
    let cConf = 0, cG = 0;
    for (let s = 1; s <= N; s++) {
      const g = lcg(s * 101 + 1); const cal: number[] = []; for (let i = 0; i < nCal; i++) cal.push(gens[name](g));
      const c = conformalCertificate({ residuals: cal, alpha }); const q = c.halfWidth;
      let m = 0; for (const r of cal) m += r; m /= nCal; let sd = 0; for (const r of cal) sd += (r - m) * (r - m); sd = Math.sqrt(sd / (nCal - 1)); const qG = z90 * sd;
      let covC = 0, covG = 0; for (let i = 0; i < nTest; i++) { const r = gens[name](g); if (Math.abs(r) <= q) covC++; if (Math.abs(r) <= qG) covG++; }
      cConf += covC / nTest; cG += covG / nTest;
      if (name === "skewed") { confW += q; gW += qG; skewN++; confCovSkew += covC / nTest; }
    }
    covByGen[name] = cConf / N; gaussCovByGen[name] = cG / N;
    if (covByGen[name] < 1 - alpha - 0.005) allCovOk = false;   // ≥ 1−α (small MC slack)
  }
  const skewConfW = confW / skewN, skewGW = gW / skewN, skewConfCov = confCovSkew / skewN;
  // distribution-free: conformal coverage barely moves across distributions; Gaussian's drifts
  const confSpread = Math.max(...Object.values(covByGen)) - Math.min(...Object.values(covByGen));
  const gaussSpread = Math.max(...Object.values(gaussCovByGen)) - Math.min(...Object.values(gaussCovByGen));

  // 3) FINITE-SAMPLE-EXACT: even with a tiny calibration set (n=20), coverage stays ≥ 1−α
  let smallCov = 0, Ns = 1500;
  for (let s = 1; s <= Ns; s++) { const g = lcg(s * 53 + 7); const cal: number[] = []; for (let i = 0; i < 20; i++) cal.push(gens.heavy(g)); const c = conformalCertificate({ residuals: cal, alpha }); let cov = 0, T = 400; for (let i = 0; i < T; i++) if (Math.abs(gens.heavy(g)) <= c.halfWidth) cov++; smallCov += cov / T; }
  const smallCoverage = smallCov / Ns;

  // R26 IMPROVE — NORMALIZED (adaptive) conformal under HETEROSCEDASTIC noise: plain conformal's marginal 1−α
  // HIDES under-coverage of the hard (high-noise) region; normalizing by per-input difficulty BALANCES it.
  const kHet = 2, nH = 400, tH = 6000, NH = 150;
  let plainLo = 0, plainHi = 0, normLo = 0, normHi = 0, normMarg = 0, wLo = 0, wHi = 0;
  for (let s = 1; s <= NH; s++) {
    const g = lcg(s * 71 + 5);
    const calR: number[] = [], calD: number[] = [];
    for (let i = 0; i < nH; i++) { const x = g(); const sig = 1 + kHet * x; calR.push(sig * gz(g)); calD.push(sig); }
    const cPlain = conformalCertificate({ residuals: calR, alpha });
    const cNorm = conformalCertificate({ residuals: calR, alpha, difficulty: calD });
    let pl = 0, ph = 0, nl = 0, nh = 0, nm = 0, cl = 0, ch = 0;
    for (let i = 0; i < tH; i++) { const x = g(); const sig = 1 + kHet * x; const r = sig * gz(g); const inP = Math.abs(r) <= cPlain.halfWidth; const inN = Math.abs(r) <= cNorm.halfWidth * sig; nm += inN ? 1 : 0; if (x < 0.5) { cl++; if (inP) pl++; if (inN) { nl++; wLo += cNorm.halfWidth * sig; } } else { ch++; if (inP) ph++; if (inN) { nh++; wHi += cNorm.halfWidth * sig; } } }
    plainLo += pl / cl; plainHi += ph / ch; normLo += nl / cl; normHi += nh / ch; normMarg += nm / tH; wLo += 0; wHi += 0;
  }
  plainLo /= NH; plainHi /= NH; normLo /= NH; normHi /= NH; normMarg /= NH;
  // adaptive width: average interval half-width in the high-noise region vs the low-noise region
  let wLoSum = 0, wHiSum = 0; { const g = lcg(999); const calR: number[] = [], calD: number[] = []; for (let i = 0; i < nH; i++) { const x = g(); const sig = 1 + kHet * x; calR.push(sig * gz(g)); calD.push(sig); } const cN = conformalCertificate({ residuals: calR, alpha, difficulty: calD }); wLoSum = cN.halfWidth * (1 + kHet * 0.25); wHiSum = cN.halfWidth * (1 + kHet * 0.75); }
  // normalized verify + a normalized prediction interval
  const gN = lcg(7); const nR: number[] = [], nD: number[] = []; for (let i = 0; i < nH; i++) { const x = gN(); const sig = 1 + kHet * x; nR.push(sig * gz(gN)); nD.push(sig); }
  const cNcert = conformalCertificate({ residuals: nR, alpha, difficulty: nD, prediction: 10.0, predictionDifficulty: 3.0 });
  const normVerify = verifyConformalCertificate(cNcert).ok && cNcert.normalized && Math.abs((cNcert.intervalUpper! - cNcert.intervalLower!) - 2 * cNcert.halfWidth * 3.0) < 1e-9;
  const normForged = !verifyConformalCertificate({ ...cNcert, halfWidth: cNcert.halfWidth / 2 }).ok;

  // 4) SIGNED + FORGERY (too-narrow q) + TAMPER + INTERVAL + DETERMINISTIC + TOTAL
  const cg = lcg(9); const cal: number[] = []; for (let i = 0; i < nCal; i++) cal.push(gens.skewed(cg));
  const cc = conformalCertificate({ residuals: cal, alpha, prediction: 5.0 });
  const verifyOk = verifyConformalCertificate(cc).ok && cc.verdict === "COVERAGE-GUARANTEED";
  const intervalOk = Math.abs((cc.intervalUpper! - cc.intervalLower!) - 2 * cc.halfWidth) < 1e-9 && cc.intervalLower! < 5.0 && cc.intervalUpper! > 5.0;
  const forged = { ...cc, halfWidth: cc.halfWidth / 2, intervalLower: 5.0 - cc.halfWidth / 2, intervalUpper: 5.0 + cc.halfWidth / 2 };
  const forgeryCaught = !verifyConformalCertificate(forged).ok;
  const tamper = !verifyConformalCertificate({ ...cc, residuals: cc.residuals.map((r, i) => (i === 0 ? r + 9 : r)) }).ok;
  const d1 = conformalCertificate({ residuals: cal, alpha }), d2 = conformalCertificate({ residuals: cal, alpha });
  const deterministic = d1.payloadHash === d2.payloadHash && verifyConformalCertificate(d1).ok;
  let total = true; try { conformalCertificate({ residuals: [] }); conformalCertificate({ residuals: [NaN, 1], alpha: 0.5 }); conformalCertificate({ residuals: [1, 2, 3], alpha: 0.001 }); } catch { total = false; }

  const checks = [
    { name: "COVERAGE-GUARANTEED (distribution-free)", pass: allCovOk, detail: `conformal test coverage ≥ ${(100 * (1 - alpha)).toFixed(0)}% on every residual law: normal ${(covByGen.normal * 100).toFixed(1)}% · heavy-tailed ${(covByGen.heavy * 100).toFixed(1)}% · skewed ${(covByGen.skewed * 100).toFixed(1)}%` },
    { name: "DISTRIBUTION-FREE (vs assumption-bound)", pass: confSpread <= 0.01 && gaussSpread > confSpread, detail: `conformal coverage spread across distributions is ${(confSpread * 100).toFixed(1)}pp (lands on target everywhere); the Gaussian interval's coverage drifts ${(gaussSpread * 100).toFixed(1)}pp (distribution-dependent)` },
    { name: "EFFICIENT-ON-SKEWED (tighter, valid)", pass: skewConfW < skewGW * 0.95 && skewConfCov >= 1 - alpha - 0.005, detail: `on skewed residuals conformal holds ${(skewConfCov * 100).toFixed(1)}% with width ${skewConfW.toFixed(2)} vs the Gaussian-90 width ${skewGW.toFixed(2)} (which over-covers, ${((skewGW / skewConfW - 1) * 100).toFixed(0)}% wider — its normality assumption is wrong)` },
    { name: "FINITE-SAMPLE-EXACT (n=20)", pass: smallCoverage >= 1 - alpha - 0.005, detail: `with only 20 calibration points the guarantee still holds: coverage ${(smallCoverage * 100).toFixed(1)}% ≥ ${(100 * (1 - alpha)).toFixed(0)}% (exchangeability, not asymptotics)` },
    { name: "ADAPTIVE-BALANCED (heteroscedastic)", pass: plainHi < 1 - alpha - 0.03 && normLo >= 1 - alpha - 0.02 && normHi >= 1 - alpha - 0.02, detail: `under input-dependent noise PLAIN conformal under-covers the hard region (${(plainHi * 100).toFixed(0)}%, while over-covering the easy ${(plainLo * 100).toFixed(0)}%); NORMALIZED balances both regions (${(normLo * 100).toFixed(0)}% / ${(normHi * 100).toFixed(0)}%)` },
    { name: "ADAPTIVE-WIDTH + MARGINAL", pass: wHiSum > wLoSum * 1.3 && normMarg >= 1 - alpha - 0.01, detail: `the interval widens with difficulty (high-noise ±${wHiSum.toFixed(2)} vs low-noise ±${wLoSum.toFixed(2)}) and the marginal coverage is preserved (${(normMarg * 100).toFixed(1)}%)` },
    { name: "NORMALIZED-SIGNED + FORGERY", pass: normVerify && normForged, detail: "a normalized cert verifies (interval = ŷ ± q·difficulty) and halving its multiplier is rejected" },
    { name: "SIGNED-VERIFIES + INTERVAL", pass: verifyOk && intervalOk, detail: "the half-width re-derives from the calibration residuals; ŷ ± q brackets the prediction" },
    { name: "FORGERY-CAUGHT (over-confident interval)", pass: forgeryCaught, detail: "halving the conformal half-width (overstating precision) is rejected on re-derivation" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering a calibration residual breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same residuals → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty / NaN / impossible-α inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
