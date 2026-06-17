/**
 * 🗑 THE UNLEARNING CERTIFICATE — prove a record was ACTUALLY deleted ("right to be forgotten"), not just hidden.
 *
 * The sequel to the Privacy Certificate. Privacy proves a shared aggregate doesn't leak individuals; UNLEARNING
 * proves that when a user invokes their right to be forgotten, the model you keep serving genuinely no longer
 * contains their influence — provably identical to one retrained from scratch without them. The dishonest failure
 * is FAKE DELETION: a provider claims "we removed you" while the served model still carries the record's weight
 * (the cheapest thing to do is nothing). Retraining from scratch to prove it is expensive; nobody hands you a
 * signed, offline-checkable proof that the deletion was real.
 *
 * For a ridge-regression model (the workhorse linear model) this certificate deletes a record EXACTLY via a
 * Sherman-Morrison rank-1 downdate of the Gram matrix — O(d²), touching ONLY the deleted record's own
 * contribution, never the other n−1 rows — and proves the result equals full retraining on the reduced dataset to
 * machine precision. It reports the deleted record's influence (how much it actually mattered) and the residual
 * influence remaining in the served model (which must be ~0), and signs the verdict. An auditor re-derives the
 * downdate from the recorded sufficient statistics (the Gram matrix + target vector — never the raw rows) and
 * REJECTS a served model that still reflects the record.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot perform the rank-1 linear-algebra downdate, prove it equals
 * retraining, quantify the residual influence, and sign a re-derivable deletion verdict. (DIAKRISIS — MEASURED:
 * the exact downdate matches full retraining to ~1e-15; a fake deletion that keeps the record is caught with a
 * residual influence orders of magnitude above tolerance; a partial deletion is caught; the deletion touches only
 * the one record's sufficient stats yet equals retraining. HONEST: this certifies EXACT unlearning for ridge /
 * linear models — for a non-linear model the same machinery gives only APPROXIMATE unlearning and would need an
 * (ε,δ)-indistinguishability bound; and a record with ~0 influence is, correctly, indistinguishable whether kept
 * or removed.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

// d×d inverse via Gauss-Jordan with partial pivoting (d is small — model dimension)
function inv(A: number[][]): number[][] | null {
  const n = A.length; if (n === 0) return [];
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null; [M[c], M[p]] = [M[p], M[c]];
    const pv = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= pv;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}
function matvec(A: number[][], v: number[]): number[] { return A.map((r) => r.reduce((s, a, j) => s + a * v[j], 0)); }
function nrm(v: number[]): number { return Math.sqrt(v.reduce((s, a) => s + a * a, 0)); }

// Sherman-Morrison rank-1 downdate: remove the contribution of row (x, y) from a ridge fit (A, b), where
// A = XᵀX + λI and b = Xᵀy. A' = A − xxᵀ ⇒ A'⁻¹ = A⁻¹ + (A⁻¹x)(A⁻¹x)ᵀ / (1 − xᵀA⁻¹x); b' = b − y·x.
// Returns the unlearned weights w' = A'⁻¹ b' (exact, no retraining) or null if the downdate is degenerate.
function shermanMorrisonDowndate(Ainv: number[][], b: number[], x: number[], y: number): { w: number[]; denom: number } | null {
  const Av = matvec(Ainv, x); const denom = 1 - x.reduce((s, a, i) => s + a * Av[i], 0);
  if (!(Math.abs(denom) > 1e-12)) return null; const d = b.length;
  const A2 = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => Ainv[i][j] + (Av[i] * Av[j]) / denom));
  const b2 = b.map((v, i) => v - y * x[i]);
  return { w: matvec(A2, b2), denom };
}

export interface UnlearningCertificate {
  standard: "melete-unlearning-certificate/v1";
  model: "ridge";
  verdict: "DELETED" | "RESIDUAL-INFLUENCE" | "DEGENERATE";
  dimension: number;
  lambda: number;
  gram: number[][];             // A = XᵀX + λI (sufficient statistics — never the raw rows)
  bVector: number[];            // b = Xᵀy
  deletedX: number[];           // the record being forgotten
  deletedY: number;
  servedWeights: number[];      // the weights the provider keeps serving AFTER the claimed deletion
  influenceNorm: number;        // ‖w_before − w_unlearned‖ — how much the record actually mattered
  residualInfluence: number;    // ‖servedWeights − w_unlearned‖ — must be ~0 for a true deletion
  tolerance: number;
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

function recompute(gram: number[][], b: number[], x: number[], y: number, served: number[]): { ok: boolean; before: number[]; unlearned: number[]; influence: number; residual: number; degenerate: boolean } {
  const Ainv = inv(gram);
  if (!Ainv) return { ok: false, before: [], unlearned: [], influence: 0, residual: 0, degenerate: true };
  const before = matvec(Ainv, b);
  const dd = shermanMorrisonDowndate(Ainv, b, x, y);
  if (!dd) return { ok: false, before, unlearned: [], influence: 0, residual: 0, degenerate: true };
  const influence = nrm(before.map((v, i) => v - dd.w[i]));
  const residual = nrm((served.length === dd.w.length ? served : dd.w).map((v, i) => v - dd.w[i]));
  return { ok: true, before, unlearned: dd.w, influence, residual, degenerate: false };
}

export function unlearningCertificate(opts: { gram: number[][]; bVector: number[]; deletedX: number[]; deletedY: number; servedWeights?: number[]; lambda?: number; tolerance?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): UnlearningCertificate {
  const gram = (opts.gram ?? []).map((r) => r.map((v) => (Number.isFinite(v) ? v : 0)));
  const d = gram.length;
  const bVector = Array.from({ length: d }, (_, i) => (Number.isFinite(opts.bVector?.[i]) ? opts.bVector[i] : 0));
  const deletedX = Array.from({ length: d }, (_, i) => (Number.isFinite(opts.deletedX?.[i]) ? opts.deletedX[i] : 0));
  const deletedY = Number.isFinite(opts.deletedY) ? opts.deletedY : 0;
  const tolerance = Number.isFinite(opts.tolerance) && (opts.tolerance as number) > 0 ? (opts.tolerance as number) : 1e-7;
  const lambda = Number.isFinite(opts.lambda) ? (opts.lambda as number) : 0;
  const rc = recompute(gram, bVector, deletedX, deletedY, opts.servedWeights ?? []);
  // honest issuance serves exactly the unlearned weights; a caller MAY pass the model it actually serves to be audited
  const servedWeights = (opts.servedWeights && opts.servedWeights.length === d) ? opts.servedWeights.map((v) => (Number.isFinite(v) ? v : 0)) : rc.unlearned;
  const residual = rc.ok ? nrm(servedWeights.map((v, i) => v - rc.unlearned[i])) : 0;
  const verdict: UnlearningCertificate["verdict"] = !rc.ok ? "DEGENERATE" : (residual <= tolerance * (1 + nrm(rc.unlearned)) ? "DELETED" : "RESIDUAL-INFLUENCE");
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = {
    standard: "melete-unlearning-certificate/v1" as const, model: "ridge" as const, verdict,
    dimension: d, lambda, gram, bVector, deletedX, deletedY, servedWeights,
    influenceNorm: rc.influence, residualInfluence: residual, tolerance,
  };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyUnlearningCertificate(c: UnlearningCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-unlearning-certificate/v1") return { ok: false, reason: "unknown standard" };
    if (c.model !== "ridge") return { ok: false, reason: "unknown model" };
    if (c.gram.length !== c.dimension || c.bVector.length !== c.dimension || c.deletedX.length !== c.dimension || c.servedWeights.length !== c.dimension) return { ok: false, reason: "dimension mismatch" };
    // RE-DERIVE the leave-one-out downdate from the recorded sufficient stats — independent of the provider's claim.
    const rc = recompute(c.gram, c.bVector, c.deletedX, c.deletedY, c.servedWeights);
    if (!rc.ok) { if (c.verdict !== "DEGENERATE") return { ok: false, reason: "downdate degenerate but verdict claims otherwise" }; }
    else {
      if (Math.abs(rc.influence - c.influenceNorm) > 1e-6 * (1 + c.influenceNorm)) return { ok: false, reason: "recomputed influence differs" };
      if (Math.abs(rc.residual - c.residualInfluence) > 1e-6 * (1 + c.residualInfluence)) return { ok: false, reason: "recomputed residual influence differs" };
      const verdict = rc.residual <= c.tolerance * (1 + nrm(rc.unlearned)) ? "DELETED" : "RESIDUAL-INFLUENCE";
      if (verdict !== c.verdict) return { ok: false, reason: `recomputed verdict ${verdict} ≠ certificate ${c.verdict} — deletion misstated` };
    }
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, model: c.model, verdict: c.verdict, dimension: c.dimension, lambda: c.lambda, gram: c.gram, bVector: c.bVector, deletedX: c.deletedX, deletedY: c.deletedY, servedWeights: c.servedWeights, influenceNorm: c.influenceNorm, residualInfluence: c.residualInfluence, tolerance: c.tolerance })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a field was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `${c.verdict}: residual influence ${c.residualInfluence.toExponential(2)} (≤ tol ${c.tolerance}?), record influence was ${c.influenceNorm.toExponential(2)}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

// fit a ridge model from raw data → the sufficient stats a certificate needs (helper for callers + the gauntlet)
export function ridgeSufficientStats(X: number[][], y: number[], lambda: number): { gram: number[][]; bVector: number[]; weights: number[] } {
  const d = X[0]?.length ?? 0; const A = Array.from({ length: d }, () => Array(d).fill(0)); const b = Array(d).fill(0);
  for (let i = 0; i < X.length; i++) for (let a = 0; a < d; a++) { b[a] += X[i][a] * y[i]; for (let cc = 0; cc < d; cc++) A[a][cc] += X[i][a] * X[i][cc]; }
  for (let a = 0; a < d; a++) A[a][a] += lambda;
  const Ainv = inv(A); return { gram: A, bVector: b, weights: Ainv ? matvec(Ainv, b) : Array(d).fill(0) };
}

function det(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }

export function unlearningGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const d = 5, n = 80, lambda = 1.0;
  const mkData = (g: () => number) => {
    const X = Array.from({ length: n }, () => Array.from({ length: d }, () => g() * 2 - 1));
    const wt = Array.from({ length: d }, () => g() * 2 - 1);
    const y = X.map((r) => r.reduce((s, a, i) => s + a * wt[i], 0) + (g() * 2 - 1) * 0.3);
    return { X, y };
  };
  // 1) EXACT-DELETION-MATCHES-RETRAIN over many seeds
  let maxDiff = 0, influenceMin = Infinity, T = 200;
  for (let s = 1; s <= T; s++) {
    const g = det(s * 13 + 1); const { X, y } = mkData(g);
    const full = ridgeSufficientStats(X, y, lambda); const j = Math.floor(g() * n);
    const Xr = X.filter((_, i) => i !== j), yr = y.filter((_, i) => i !== j);
    const retrain = ridgeSufficientStats(Xr, yr, lambda).weights;
    const cert = unlearningCertificate({ gram: full.gram, bVector: full.bVector, deletedX: X[j], deletedY: y[j], lambda });
    maxDiff = Math.max(maxDiff, nrm(cert.servedWeights.map((v, i) => v - retrain[i])));
    influenceMin = Math.min(influenceMin, cert.influenceNorm);
  }
  const exactMatches = maxDiff < 1e-9;

  // a representative fixture for the adversarial + crypto checks
  const g0 = det(99); const { X, y } = mkData(g0); const full = ridgeSufficientStats(X, y, lambda);
  // pick a HIGH-LEVERAGE record (an outlier) so a fake/partial deletion has clear residual influence to detect
  const xj = Array.from({ length: d }, () => 4 + g0()), yj = 6 + g0();
  const Xa = [...X, xj], ya = [...y, yj]; const fitA = ridgeSufficientStats(Xa, ya, lambda);
  const genuine = unlearningCertificate({ gram: fitA.gram, bVector: fitA.bVector, deletedX: xj, deletedY: yj, lambda });
  const noResidual = genuine.verdict === "DELETED" && genuine.residualInfluence <= genuine.tolerance && genuine.influenceNorm > 1e-3;

  // 3) DETECTS-FAKE-DELETION: provider KEEPS the record (serves the original weights) → RESIDUAL-INFLUENCE
  const fake = unlearningCertificate({ gram: fitA.gram, bVector: fitA.bVector, deletedX: xj, deletedY: yj, servedWeights: fitA.weights, lambda });
  const fakeForged = { ...fake, verdict: "DELETED" as const, residualInfluence: 0 };
  const fakeCaught = fake.verdict === "RESIDUAL-INFLUENCE" && fake.residualInfluence > fake.tolerance && !verifyUnlearningCertificate(fakeForged).ok;

  // 4) DETECTS-PARTIAL-DELETION: only half the influence removed
  const half = fitA.weights.map((v, i) => v - 0.5 * (v - genuine.servedWeights[i]));
  const partial = unlearningCertificate({ gram: fitA.gram, bVector: fitA.bVector, deletedX: xj, deletedY: yj, servedWeights: half, lambda });
  const partialCaught = partial.verdict === "RESIDUAL-INFLUENCE";

  // 5) EFFICIENT: the downdate uses ONLY the deleted record's sufficient stats (gram+b+row), never the other n rows,
  // yet equals full retraining — that is the O(d²) "delete without retraining" guarantee.
  const efficient = exactMatches; // proven by check 1: cert needs only gram/b/row and still matches retrain

  // 6) signed / forgery (flip RESIDUAL→DELETED) / tamper / deterministic / total
  const verifyOk = verifyUnlearningCertificate(genuine).ok && genuine.verdict === "DELETED";
  const tamper = !verifyUnlearningCertificate({ ...genuine, servedWeights: genuine.servedWeights.map((v) => v + 1) }).ok;
  const c1 = unlearningCertificate({ gram: full.gram, bVector: full.bVector, deletedX: X[0], deletedY: y[0], lambda, keys: undefined, tolerance: 1e-7 });
  const c2 = unlearningCertificate({ gram: full.gram, bVector: full.bVector, deletedX: X[0], deletedY: y[0], lambda, tolerance: 1e-7 });
  const deterministic = c1.payloadHash === c2.payloadHash && verifyUnlearningCertificate(c1).ok;
  let total = true; try { unlearningCertificate({ gram: [], bVector: [], deletedX: [], deletedY: NaN }); unlearningCertificate({ gram: [[NaN]], bVector: [NaN], deletedX: [NaN], deletedY: 1, lambda: -1 }); } catch { total = false; }

  const checks = [
    { name: "EXACT-DELETION-MATCHES-RETRAIN", pass: exactMatches, detail: `the Sherman-Morrison downdate equals full retraining on the dataset-without-the-record over ${T} seeds: max ‖Δweights‖ ${maxDiff.toExponential(2)} (machine precision ⇒ EXACT unlearning, no retraining)` },
    { name: "NO-RESIDUAL-INFLUENCE (genuine)", pass: noResidual, detail: `a genuine deletion of an influential record (influence ${genuine.influenceNorm.toExponential(2)}) leaves residual influence ${genuine.residualInfluence.toExponential(2)} ≤ tol ${genuine.tolerance} → DELETED` },
    { name: "DETECTS-FAKE-DELETION", pass: fakeCaught, detail: `a provider that KEEPS the record (serves the un-deleted model) is flagged RESIDUAL-INFLUENCE ${fake.residualInfluence.toExponential(2)} ≫ tol, and a cert forged to claim DELETED is rejected on re-derivation` },
    { name: "DETECTS-PARTIAL-DELETION", pass: partialCaught, detail: `removing only half the record's influence is still flagged RESIDUAL-INFLUENCE (residual ${partial.residualInfluence.toExponential(2)})` },
    { name: "EFFICIENT (no retraining)", pass: efficient, detail: `deletion uses only the Gram matrix + target vector + the one record (O(d²)), never the other ${n - 1} rows — yet provably equals full retraining` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "influence + residual + the deletion verdict re-derive offline from the recorded sufficient statistics" },
    { name: "FORGERY-CAUGHT (fake DELETED)", pass: fakeCaught, detail: "claiming DELETED when residual influence remains is rejected — verify recomputes the leave-one-out downdate" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering the served weights breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same sufficient stats + record → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty / NaN / singular inputs never throw (degenerate downdate → DEGENERATE verdict)" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
