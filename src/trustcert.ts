/**
 * 🏅 THE TRUSTWORTHY DISCOVERY CERTIFICATE (TDC) — the moat: one signed verdict no competitor can match.
 *
 * Every other optimizer hands you a "best recipe" and stops. Melete already proves, separately, that a result
 * is REAL (not noise), CAUSAL (not confounded), and ROBUST (survives wobble). The TDC FUSES all of them into a
 * SINGLE Ed25519-signed certificate an auditor / regulator / insurer verifies OFFLINE — and it tells you which
 * gate failed when a result is NOT trustworthy:
 *   • SIGNAL  (NULL ENGINE)   — is there a real effect at all, or just luck?            [permutation test]
 *   • CAUSAL  (CAUSAL ENGINE) — does it CAUSE the outcome, or is it confounded?         [randomized intervention]
 *   • ROBUST  (AEGIS)         — does the optimum survive real-world wobble, or is it a fragile spike?
 * TRUSTWORTHY ⟺ every gate passes. One failing gate ⇒ NOT-TRUSTWORTHY, with the reason named.
 *
 * Why it is a MOAT (not just a feature): a competitor can copy any one algorithm, but the value here is the
 * COMPOSITION into a single, signed, offline-verifiable trust artifact — the format an auditor learns to
 * accept. (DIAKRISIS: that ADOPTION is a market outcome, not code; what this module builds is the verifiable
 * substrate of such a standard. The gauntlet proves the substrate: it stamps a genuinely good discovery
 * TRUSTWORTHY, and correctly refuses — naming the failed gate — a noisy / confounded / fragile one, ≥97.5%,
 * with a certificate that verifies offline and breaks on tamper.)
 */
import { lcg, type Space, type Experiment } from "./space.js";
import { type Goal, type Observation } from "./engine.js";
import { nullEngineDiscover } from "./nullengine.js";
import { aegisDiscover } from "./aegis.js";
import { causalDiscover } from "./causal.js";
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

export interface TrustGate { name: string; pass: boolean; assessed: boolean; detail: string; }
export interface TrustCertificate {
  standard: "melete-trust-certificate/v1";
  verdict: "TRUSTWORTHY" | "NOT-TRUSTWORTHY";
  gates: TrustGate[];
  failedGates: string[];
  best: Observation;
  goal: Goal;
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}

/** Canonical payload that the signature covers — recomputed verbatim on verify so any tamper breaks it. */
function tcPayload(c: { verdict: string; gates: TrustGate[]; failedGates: string[]; best: Observation; goal: Goal }): string {
  return canonical({ standard: "melete-trust-certificate/v1", verdict: c.verdict, gates: c.gates, failedGates: c.failedGates, best: c.best, goal: c.goal });
}

/**
 * Issue a Trustworthy Discovery Certificate. Runs the SIGNAL (null), ROBUST (aegis) gates on the oracle, and —
 * if you supply historical `observations` — the CAUSAL gate (confounding check). Composes them into one signed
 * verdict. Deterministic per seed.
 */
export function issueTrustCertificate(opts: { space: Space; oracle: (e: Experiment) => number; observations?: ReadonlyArray<Observation>; goal?: Goal; seed?: number; robustMin?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): TrustCertificate {
  const goal = opts.goal ?? "maximize"; const seed = (opts.seed ?? 1) | 0; const robustMin = opts.robustMin ?? 0.45;

  // SIGNAL — is the effect real, or noise? (strict α=0.01 — a trust certificate should be conservative)
  const sig = nullEngineDiscover({ space: opts.space, oracle: opts.oracle, budget: 100, goal, seed, alpha: 0.01 });
  const signalPass = sig.verdict === "REAL";

  // ROBUST — does the optimum survive a real-world wobble (not a fragile spike)?
  const aeg = aegisDiscover({ space: opts.space, oracle: opts.oracle, budget: 60, goal, seed, robustWeight: 0.6 });
  const robustPass = aeg.robustnessOfBest >= robustMin;

  // CAUSAL — only assessable with historical data: is any relied-upon knob confounded?
  let causalAssessed = false, causalPass = true, causalDetail = "no historical data supplied — causal gate not assessed (run with observations to enable)";
  if (opts.observations && opts.observations.length >= 8) {
    const cau = causalDiscover({ space: opts.space, oracle: opts.oracle, observations: opts.observations, goal, seed });
    causalAssessed = true;
    causalPass = cau.confoundedVars.length === 0;   // any confounded knob ⇒ the data is misleading ⇒ not trustworthy
    causalDetail = causalPass ? `no confounding detected · causal driver(s): ${cau.causalVars.join(", ") || "—"}` : `CONFOUNDED knob(s) in your data: ${cau.confoundedVars.join(", ")} — naive optimisation would be fooled`;
  }

  const gates: TrustGate[] = [
    { name: "SIGNAL", pass: signalPass, assessed: true, detail: `null-hypothesis verdict ${sig.verdict} (p=${sig.pValue}) — ${signalPass ? "a real effect, not noise" : "indistinguishable from noise"}` },
    { name: "CAUSAL", pass: causalPass, assessed: causalAssessed, detail: causalDetail },
    { name: "ROBUST", pass: robustPass, assessed: true, detail: `optimum robustness ${aeg.robustnessOfBest} (≥${robustMin} required) — ${robustPass ? "survives real-world wobble" : "a fragile spike that collapses under a small drift"}` },
  ];
  const failedGates = gates.filter((g) => g.assessed && !g.pass).map((g) => g.name);
  const verdict = failedGates.length === 0 ? "TRUSTWORTHY" : "NOT-TRUSTWORTHY";
  const best: Observation = aeg.best;   // the robust optimum is what we certify

  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const payloadHash = createHash("sha256").update(tcPayload({ verdict, gates, failedGates, best, goal })).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { standard: "melete-trust-certificate/v1", verdict, gates, failedGates, best, goal, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

/** Verify a Trustworthy Discovery Certificate offline (signature + embedded public key). */
export function verifyTrustCertificate(c: TrustCertificate): { ok: boolean; reason: string } {
  if (!c || !c.signature || !c.publicKeyPem || !c.payloadHash) return { ok: false, reason: "incomplete certificate" };
  try {
    // 1. recompute the hash from the certificate's OWN contents — catches a flipped verdict/gate/best.
    const recomputed = createHash("sha256").update(tcPayload(c)).digest("hex");
    if (recomputed !== c.payloadHash) return { ok: false, reason: "content hash mismatch — certificate tampered" };
    // 2. verify the Ed25519 signature over that hash — catches a forged hash/signature.
    const ok = edVerify(null, Buffer.from(c.payloadHash), c.publicKeyPem, Buffer.from(c.signature, "base64"));
    return ok ? { ok: true, reason: "signature valid (Ed25519, offline)" } : { ok: false, reason: "signature invalid — certificate tampered" };
  } catch (e) { return { ok: false, reason: "verify error: " + (e as Error).message.slice(0, 80) }; }
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
// Four scenarios. The TDC must stamp the GOOD one TRUSTWORTHY and refuse each TRAP, naming the right failed gate.
export function trustCertGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x0", type: "real", min: 0, max: 1 }, { name: "x1", type: "real", min: 0, max: 1 }] };
  const lcgImport = lcg;

  // GOOD: a BROAD (robust) genuine peak; both knobs causally affect it; clean (un-confounded) history.
  const goodF = (e: Experiment) => 100 * Math.exp(-((((e.x0 ?? 0) - 0.4) ** 2) + (((e.x1 ?? 0) - 0.6) ** 2)) / 0.7);
  const goodObs = (s: number): Observation[] => { const r = lcgImport((s >>> 0) || 1); const o: Observation[] = []; for (let i = 0; i < 80; i++) { const x0 = r(), x1 = r(); o.push({ experiment: { x0, x1 }, value: goodF({ x0, x1 }) }); } return o; };
  // NOISE trap: outcome independent of the knobs (pure luck).
  const noiseF = (s: number) => { const r = lcgImport((s >>> 0) || 1); return () => r() * 100; };
  // FRAGILE trap: a real, causal, but razor-sharp spike (collapses under a small drift).
  const fragileF = (e: Experiment) => 100 * Math.exp(-((((e.x0 ?? 0) - 0.4) ** 2) + (((e.x1 ?? 0) - 0.6) ** 2)) / 0.0008);
  const fragileObs = (s: number): Observation[] => { const r = lcgImport((s >>> 0) || 1); const o: Observation[] = []; for (let i = 0; i < 80; i++) { const x0 = r(), x1 = r(); o.push({ experiment: { x0, x1 }, value: fragileF({ x0, x1 }) }); } return o; };
  // CONFOUNDED trap: a clean, real, robust, causal-in-x1 oracle — but the HISTORY has a confounded x0 that
  // merely tracks a hidden factor C (drives the outcome but the knob itself does nothing). SIGNAL + ROBUST pass;
  // only the CAUSAL gate catches that the historical data would fool a naive optimizer.
  const causalY = (x1: number) => 100 * Math.exp(-((x1 - 0.6) ** 2) / 0.7);
  const confOracle = (_s: number) => (e: Experiment) => causalY(e.x1 ?? 0);
  const confObs = (s: number): Observation[] => { const r = lcgImport((s >>> 0) || 1); const o: Observation[] = []; for (let i = 0; i < 240; i++) { const C = r(); const x0 = Math.max(0, Math.min(1, C + 0.05 * (r() - 0.5))); const x1 = r(); o.push({ experiment: { x0, x1 }, value: causalY(x1) + 100 * C }); } return o; };

  const SEEDS = 40;
  let goodOK = 0, noiseOK = 0, fragileOK = 0, confOK = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const g = issueTrustCertificate({ space, oracle: goodF, observations: goodObs(s * 3 + 1), seed: s });
    if (g.verdict === "TRUSTWORTHY") goodOK++;
    const n = issueTrustCertificate({ space, oracle: noiseF(s * 7 + 1), observations: goodObs(s * 3 + 1), seed: s });
    if (n.verdict === "NOT-TRUSTWORTHY" && n.failedGates.includes("SIGNAL")) noiseOK++;
    const f = issueTrustCertificate({ space, oracle: fragileF, observations: fragileObs(s * 5 + 1), seed: s });
    if (f.verdict === "NOT-TRUSTWORTHY" && f.failedGates.includes("ROBUST")) fragileOK++;
    const c = issueTrustCertificate({ space, oracle: confOracle(s * 11 + 1), observations: confObs(s * 13 + 1), seed: s });
    if (c.verdict === "NOT-TRUSTWORTHY" && c.failedGates.includes("CAUSAL")) confOK++;
  }
  // point-estimate ≥97.5% across SEEDS for the COMPOSITION; the statistical Wilson-LB rigor of each gate lives
  // in its own component gauntlet (nullEngineGauntlet / causalGauntlet / aegisGauntlet, each proven ≥97.5% LB).
  const rate = (k: number) => k / SEEDS;

  const one = issueTrustCertificate({ space, oracle: goodF, observations: goodObs(99), seed: 9 });
  const certOk = verifyTrustCertificate(one).ok;
  const certBreaks = !verifyTrustCertificate({ ...one, verdict: "NOT-TRUSTWORTHY" }).ok || !verifyTrustCertificate({ ...one, payloadHash: createHash("sha256").update("x").digest("hex") }).ok;
  const composes = one.gates.length === 3 && one.gates.every((g) => typeof g.pass === "boolean");
  const det = (() => { const a = issueTrustCertificate({ space, oracle: goodF, observations: goodObs(5), seed: 5 }); const b = issueTrustCertificate({ space, oracle: goodF, observations: goodObs(5), seed: 5 }); return a.verdict === b.verdict && a.payloadHash === b.payloadHash; })();
  const total = (() => { try { issueTrustCertificate({ space, oracle: () => 0, seed: 1 }); return true; } catch { return false; } })();

  const checks = [
    { name: "STAMPS-A-GOOD-DISCOVERY-TRUSTWORTHY", pass: rate(goodOK) >= 0.975, detail: `real+causal+robust → TRUSTWORTHY in ${goodOK}/${SEEDS} = ${(rate(goodOK) * 100).toFixed(1)}%` },
    { name: "REFUSES-NOISE(names SIGNAL)", pass: rate(noiseOK) >= 0.975, detail: `pure noise → NOT-TRUSTWORTHY via SIGNAL gate in ${noiseOK}/${SEEDS} = ${(rate(noiseOK) * 100).toFixed(1)}%` },
    { name: "REFUSES-FRAGILE-SPIKE(names ROBUST)", pass: rate(fragileOK) >= 0.975, detail: `fragile spike → NOT-TRUSTWORTHY via ROBUST gate in ${fragileOK}/${SEEDS} = ${(rate(fragileOK) * 100).toFixed(1)}%` },
    { name: "REFUSES-CONFOUNDED(names CAUSAL)", pass: rate(confOK) >= 0.975, detail: `confounded history → NOT-TRUSTWORTHY via CAUSAL gate in ${confOK}/${SEEDS} = ${(rate(confOK) * 100).toFixed(1)}%` },
    { name: "COMPOSES-3-GATES", pass: composes, detail: "one certificate fuses SIGNAL + CAUSAL + ROBUST" },
    { name: "SIGNED-VERIFIES-OFFLINE+BREAKS-ON-TAMPER", pass: certOk && certBreaks, detail: "Ed25519 verifies with embedded key; a flipped verdict or hash fails" },
    { name: "DETERMINISTIC", pass: det, detail: "same seed → identical verdict + hash" },
    { name: "TOTAL", pass: total, detail: "no observations / flat oracle never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
