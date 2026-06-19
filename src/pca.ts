/**
 * 🎟️ PROOF-CARRYING ANSWERS (PCA) — a verifiable trust tag on EVERY single AI output, checkable in microseconds.
 *
 * The whole honesty stack so far audits a model in BATCH: "it was 90% accurate / fair / calibrated last quarter."
 * But in the agentic world, what you actually consume is ONE answer, right now — and you have no way to know if THIS
 * answer is backed or a confident hallucination. PCA turns the batch audit into a per-answer runtime guarantee: every
 * model output ships with a compact, signed proof that a consumer (a human, or another agent) verifies instantly,
 * offline, with no access to the model or its data. The proof asserts four checkable things and a verdict:
 *   ① PROVENANCE — produced by model M, bound to a lineage root (AIBOM) and an SLA/consent scope;
 *   ② IN-SCOPE — the input lies INSIDE the model's certified evidence envelope (not a blind extrapolation); if not,
 *      it carries the exact offending dimension as a witness the consumer re-derives;
 *   ③ CALIBRATED CONFIDENCE — the stated confidence comes from a model whose calibration certificate is bound by hash;
 *   ④ VERDICT — TRUSTED, or OUT-OF-SCOPE / NEEDS-REVIEW (below the certified-reliable confidence) — so an out-of-scope
 *      or under-confident answer is provably flagged for review instead of asserted.
 * The consumer recomputes the scope test on the input and re-checks the signature in O(dimensions) — no dataset needed.
 *
 * WHY IT MATTERS (the missing primitive for multi-agent AI): agents consume each other's outputs at machine speed;
 * PCA lets them trust a single answer WITHOUT trusting the producer — the proof self-certifies scope + calibration +
 * provenance, and self-flags when the answer is outside what the model can stand behind.
 *
 * WHO BENEFITS (≥3): ① the model PROVIDER ships answers that carry their own trust (and bounds liability to the
 * certified scope); ② the CONSUMER / downstream agent verifies each answer instantly offline and safely rejects the
 * out-of-scope ones; ③ the PLATFORM / regulator audits the stream of signed verdicts; ④ the END USER is protected from
 * confident-but-unbacked answers.
 *
 * (DIAKRISIS — MEASURED: an in-scope, confident answer is TRUSTED and the proof verifies; an out-of-scope input is
 * flagged OUT-OF-SCOPE ~100% with a witness the consumer re-derives, and an in-scope input is never falsely flagged;
 * an under-confident answer becomes NEEDS-REVIEW; tampering the input/output/verdict or a bound cert hash is caught;
 * verification is O(d) and needs no data. HONEST: PCA proves an answer is BACKED + IN-SCOPE + from a calibrated,
 * provenance-bound model — it does NOT prove the answer is factually correct (no per-answer oracle can); its power is
 * catching the out-of-scope / under-confident answers that are most likely to be wrong, with a checkable verdict. The
 * scope test here is the axis-aligned certified envelope; the tighter convex-hull witness is the Extrapolation-Guard
 * certificate, which a PCA may reference.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

export interface AnswerProof {
  standard: "melete-proof-carrying-answer/v1";
  modelId: string;
  lineageRoot: string | null;        // binds to an AIBOM provenance (R47), if supplied
  slaPeriod: string | null;          // binds to an SLA scope (R42), if supplied
  calibrationCertHash: string | null;// binds to a calibration certificate (R29/30), if supplied
  input: number[];                   // the query features
  support: { lo: number[]; hi: number[] };  // the model's certified evidence envelope
  reliableConfidence: number;        // the certified-reliable confidence threshold
  output: unknown;                   // the answer (opaque)
  confidence: number;                // the model's stated confidence
  inScope: boolean;
  witnessDim: number;                // first out-of-envelope dimension, or -1
  verdict: "TRUSTED" | "OUT-OF-SCOPE" | "NEEDS-REVIEW";
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}

function adjudicate(input: number[], lo: number[], hi: number[], confidence: number, reliable: number): { inScope: boolean; witnessDim: number; verdict: AnswerProof["verdict"] } {
  let witnessDim = -1;
  const d = Math.min(input.length, lo.length, hi.length);
  for (let i = 0; i < d; i++) { const x = input[i]; if (!Number.isFinite(x) || x < lo[i] || x > hi[i]) { witnessDim = i; break; } }
  if (input.length !== lo.length || lo.length !== hi.length) witnessDim = witnessDim < 0 ? Math.min(input.length, lo.length) : witnessDim; // dimension mismatch ⇒ out of scope
  const inScope = witnessDim < 0;
  const verdict: AnswerProof["verdict"] = !inScope ? "OUT-OF-SCOPE" : (confidence < reliable ? "NEEDS-REVIEW" : "TRUSTED");
  return { inScope, witnessDim, verdict };
}

export function proveAnswer(opts: { modelId?: string; input: number[]; support: { lo: number[]; hi: number[] }; output?: unknown; confidence: number; reliableConfidence?: number; lineageRoot?: string | null; slaPeriod?: string | null; calibrationCertHash?: string | null; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): AnswerProof {
  const input = (opts.input ?? []).map((x) => (Number.isFinite(x) ? x : NaN));
  const lo = (opts.support?.lo ?? []).map(Number), hi = (opts.support?.hi ?? []).map(Number);
  const confidence = Number.isFinite(opts.confidence) ? Math.min(1, Math.max(0, opts.confidence as number)) : 0;
  const reliable = Number.isFinite(opts.reliableConfidence) ? Math.min(1, Math.max(0, opts.reliableConfidence as number)) : 0.8;
  const a = adjudicate(input, lo, hi, confidence, reliable);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const body = {
    standard: "melete-proof-carrying-answer/v1" as const, modelId: String(opts.modelId ?? "model"),
    lineageRoot: opts.lineageRoot != null ? String(opts.lineageRoot) : null, slaPeriod: opts.slaPeriod != null ? String(opts.slaPeriod) : null, calibrationCertHash: opts.calibrationCertHash != null ? String(opts.calibrationCertHash) : null,
    input, support: { lo, hi }, reliableConfidence: reliable, output: opts.output ?? null, confidence,
    inScope: a.inScope, witnessDim: a.witnessDim, verdict: a.verdict,
  };
  const payloadHash = createHash("sha256").update(canonical(body)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...body, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyAnswer(c: AnswerProof): { ok: boolean; verdict: string; reason: string } {
  try {
    if (c.standard !== "melete-proof-carrying-answer/v1") return { ok: false, verdict: c.verdict, reason: "unknown standard" };
    const a = adjudicate(c.input, c.support.lo, c.support.hi, c.confidence, c.reliableConfidence);
    if (a.inScope !== c.inScope || a.witnessDim !== c.witnessDim || a.verdict !== c.verdict) return { ok: false, verdict: a.verdict, reason: `recomputed verdict ${a.verdict} ≠ proof ${c.verdict} — scope/confidence misstated` };
    // the witness must genuinely be out of the envelope (when OUT-OF-SCOPE)
    if (!c.inScope && c.witnessDim >= 0 && c.witnessDim < c.input.length && c.witnessDim < c.support.lo.length) {
      const x = c.input[c.witnessDim]; if (Number.isFinite(x) && x >= c.support.lo[c.witnessDim] && x <= c.support.hi[c.witnessDim]) return { ok: false, verdict: c.verdict, reason: "witness dimension is actually inside the envelope — bogus OUT-OF-SCOPE" };
    }
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, modelId: c.modelId, lineageRoot: c.lineageRoot, slaPeriod: c.slaPeriod, calibrationCertHash: c.calibrationCertHash, input: c.input, support: c.support, reliableConfidence: c.reliableConfidence, output: c.output, confidence: c.confidence, inScope: c.inScope, witnessDim: c.witnessDim, verdict: c.verdict })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, verdict: c.verdict, reason: "payload hash mismatch — the answer or its tag was altered" };
    if (!edVerify(null, Buffer.from(c.payloadHash), createPublicKey(c.publicKeyPem), Buffer.from(c.signature, "base64"))) return { ok: false, verdict: c.verdict, reason: "bad signature" };
    return { ok: true, verdict: c.verdict, reason: `${c.verdict}: model ${c.modelId}, confidence ${(c.confidence * 100).toFixed(0)}% (reliable ≥ ${(c.reliableConfidence * 100).toFixed(0)}%), ${c.inScope ? "in-scope" : "OUT of envelope @ dim " + c.witnessDim}` };
  } catch (e) { return { ok: false, verdict: c?.verdict ?? "OUT-OF-SCOPE", reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function pcaGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const D = 4; const lo = [0, 0, 0, 0], hi = [1, 1, 1, 1], reliable = 0.8;
  const support = { lo, hi };
  const det = (s: number) => { let x = (s >>> 0) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return (x + 0.5) / 4294967296; }; };
  const kp = generateKeyPairSync("ed25519");
  const calHash = createHash("sha256").update("calcert").digest("hex"), lineage = createHash("sha256").update("aibom").digest("hex");
  const mk = (input: number[], conf: number) => proveAnswer({ modelId: "credit-v3", input, support, confidence: conf, reliableConfidence: reliable, lineageRoot: lineage, calibrationCertHash: calHash, slaPeriod: "2026-06", output: { decision: "approve" }, keys: kp });

  // IN-SCOPE-TRUSTED + NO-FALSE-FLAG: random in-box, confident → TRUSTED 100%, never OUT
  let trusted = 0, falseOut = 0, T = 1000; const g = det(7);
  for (let t = 0; t < T; t++) { const x = [g(), g(), g(), g()]; const p = mk(x, 0.95); if (p.verdict === "TRUSTED" && verifyAnswer(p).ok) trusted++; if (p.verdict === "OUT-OF-SCOPE") falseOut++; }
  const inScopeTrusted = trusted / T >= 0.99 && falseOut === 0;

  // OUT-OF-SCOPE-FLAGGED + WITNESS: push one dim out of [0,1] → OUT-OF-SCOPE with a re-derivable witness
  let out = 0, wgood = 0; const g2 = det(9);
  for (let t = 0; t < T; t++) { const dim = t % D; const x = [g2(), g2(), g2(), g2()]; x[dim] = 1 + g2(); const p = mk(x, 0.95); if (p.verdict === "OUT-OF-SCOPE" && verifyAnswer(p).ok) { out++; const xi = p.input[p.witnessDim]; if (xi < lo[p.witnessDim] || xi > hi[p.witnessDim]) wgood++; } }
  const outFlagged = out / T >= 0.99 && wgood === out;

  // LOW-CONFIDENCE → NEEDS-REVIEW (in-scope but under the certified-reliable threshold)
  let nr = 0; const g3 = det(11);
  for (let t = 0; t < T; t++) { const x = [g3(), g3(), g3(), g3()]; const p = mk(x, 0.65); if (p.verdict === "NEEDS-REVIEW" && verifyAnswer(p).ok) nr++; }
  const lowConf = nr / T >= 0.99;

  // FORGERY: claim TRUSTED for an out-of-scope input → rejected when the consumer re-derives the scope test
  const oop = mk([0.5, 0.5, 0.5, 1.7], 0.95); // dim 3 out
  const forged = { ...oop, verdict: "TRUSTED" as const, inScope: true, witnessDim: -1 };
  const forgeryCaught = oop.verdict === "OUT-OF-SCOPE" && !verifyAnswer(forged).ok;
  // BOGUS-WITNESS: claim OUT-OF-SCOPE but point the witness at an in-envelope dim → rejected
  const inp = mk([0.3, 0.4, 0.5, 0.6], 0.95);
  const bogus = { ...inp, verdict: "OUT-OF-SCOPE" as const, inScope: false, witnessDim: 0 };
  const bogusCaught = !verifyAnswer(bogus).ok;
  // TAMPER: alter the output or a bound cert hash → caught
  const good = mk([0.2, 0.2, 0.2, 0.2], 0.95);
  const tamperOut = !verifyAnswer({ ...good, output: { decision: "deny" } }).ok;
  const tamperBind = !verifyAnswer({ ...good, calibrationCertHash: "deadbeef" }).ok;
  const tamper = tamperOut && tamperBind;
  // COMPACT/FAST: proof carries no dataset; size is bounded (just input + envelope + tag)
  const size = JSON.stringify(good).length; const compact = size < 4000 && good.lineageRoot === lineage && good.calibrationCertHash === calHash;
  const verifyOk = verifyAnswer(good).ok && good.verdict === "TRUSTED";
  const d1 = mk([0.1, 0.2, 0.3, 0.4], 0.9), d2 = mk([0.1, 0.2, 0.3, 0.4], 0.9);
  const deterministic = d1.payloadHash === d2.payloadHash && verifyAnswer(d1).ok;
  let total = true; try { proveAnswer({ input: [], support: { lo: [], hi: [] }, confidence: 0.9 }); proveAnswer({ input: [NaN, 1], support: { lo: [0, 0], hi: [1, 1] }, confidence: 2 }); verifyAnswer({} as AnswerProof); } catch { total = false; }

  const checks = [
    { name: "IN-SCOPE → TRUSTED (no false flag)", pass: inScopeTrusted, detail: `a confident answer whose input is inside the certified envelope is TRUSTED ${(trusted / T * 100).toFixed(0)}% — and an in-scope input is never falsely flagged (${falseOut} false OUT)` },
    { name: "OUT-OF-SCOPE flagged + witness", pass: outFlagged, detail: `an input outside the envelope is flagged OUT-OF-SCOPE ${(out / T * 100).toFixed(0)}% with a witness dimension the consumer re-derives (${wgood}/${out} valid) — the runtime hallucination guard` },
    { name: "LOW-CONFIDENCE → NEEDS-REVIEW", pass: lowConf, detail: `an in-scope answer below the certified-reliable confidence (${(reliable * 100).toFixed(0)}%) is provably marked NEEDS-REVIEW ${(nr / T * 100).toFixed(0)}%, not asserted` },
    { name: "FORGERY-CAUGHT (fake TRUSTED)", pass: forgeryCaught, detail: "claiming TRUSTED for an out-of-scope input is rejected — the consumer recomputes the scope test on the input" },
    { name: "BOGUS-WITNESS-CAUGHT", pass: bogusCaught, detail: "claiming OUT-OF-SCOPE with a witness dimension that is actually inside the envelope is rejected" },
    { name: "SIGNED-TAMPER (output + bindings)", pass: tamper, detail: "altering the answer, or a bound calibration/lineage hash, breaks the payload hash" },
    { name: "COMPACT + DATA-FREE VERIFY", pass: compact, detail: `the proof is ${size} bytes, carries no dataset, and binds the lineage root + calibration cert — verification is O(dimensions)` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "the scope test + confidence gate + verdict + bindings re-derive offline from the proof" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same answer + envelope + key → byte-identical proof" },
    { name: "TOTAL", pass: total, detail: "empty / NaN / dimension-mismatch / malformed inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
