/**
 * 🌍 THE AI TRANSPARENCY LOG — "Certificate Transparency for AI claims." Every claim publicly logged, history
 * un-rewritable.
 *
 * Certificate Transparency (RFC 6962) changed the security of the entire web: every TLS certificate a CA issues is
 * appended to public, append-only Merkle logs, so a mis-issued certificate cannot stay hidden and a log cannot
 * quietly rewrite history. This is that mechanism for AI claims. Every Melete certificate — a fairness verdict, a
 * private-audit proof, a model lineage (AIBOM), a proof-carrying answer — is appended to a tamper-evident Merkle
 * transparency log. Anyone can then (a) get a Signed Tree Head (the log's signed commitment to its current state),
 * (b) prove a specific claim is INCLUDED in the log (an inclusion proof), and (c) prove the log only ever APPENDED
 * and never rewrote a past claim (a consistency proof between two tree heads). A vendor can no longer show a
 * "fair" certificate to one auditor and bury the "biased" one — everything it logs is publicly auditable, and
 * rewriting the record is mathematically detectable.
 *
 * WHY IT IS THE SUBSTRATE (1000×): the individual certificates prove a property; the transparency log makes the
 * WHOLE ecosystem accountable — non-repudiable, monitorable, fork-detectable — exactly as CT did for HTTPS. It is
 * the layer the entire honesty stack sits on.
 *
 * WHO BENEFITS (a whole ecosystem, ≥4): ① SUBMITTERS (AI vendors) get a public, timestamped, non-repudiable record
 * their claim existed; ② AUDITORS / light clients verify inclusion + consistency offline with only tree heads and a
 * proof (no full log); ③ MONITORS (regulators, journalists, the public) watch the log and detect a rewrite or a
 * split view; ④ END USERS / downstream agents trust a claim only if it is in the public log.
 *
 * (DIAKRISIS — MEASURED, RFC 6962 Merkle math: every appended entry has a valid inclusion proof against the current
 * Signed Tree Head, and a wrong leaf / wrong index is rejected; for every m < n an honest append is consistency-
 * proven (the size-m tree is a prefix of the size-n tree); REWRITING any past entry makes the new tree inconsistent
 * with the old signed tree head → caught; a split view [two tree heads of the same size with different roots] is
 * detected; tree heads are Ed25519-signed and tamper-evident. HONEST: a transparency log proves WHAT was logged and
 * that history was not rewritten — it does not by itself force anyone to log [that is a policy/ecosystem incentive,
 * exactly as with web CT], and the leaf is the claim's hash, not a judgement that the claim is true.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
// RFC 6962 domain separation: leaf = H(0x00 ‖ entry), node = H(0x01 ‖ left ‖ right)
export function leafHash(entry: string): string { return sha(Buffer.concat([Buffer.from([0x00]), Buffer.from(String(entry), "utf8")])); }
function nodeHash(l: string, r: string): string { return sha(Buffer.concat([Buffer.from([0x01]), Buffer.from(l, "hex"), Buffer.from(r, "hex")])); }
function largestPow2Below(n: number): number { let k = 1; while (k < n) k <<= 1; return k >> 1; }
// Merkle Tree Hash over an array of already-computed leaf hashes
function mth(leaves: string[]): string { const n = leaves.length; if (n === 0) return sha(Buffer.alloc(0)); if (n === 1) return leaves[0]; const k = largestPow2Below(n); return nodeHash(mth(leaves.slice(0, k)), mth(leaves.slice(k))); }
function inclusionPath(m: number, leaves: string[]): string[] { const n = leaves.length; if (n <= 1) return []; const k = largestPow2Below(n); return m < k ? inclusionPath(m, leaves.slice(0, k)).concat([mth(leaves.slice(k))]) : inclusionPath(m - k, leaves.slice(k)).concat([mth(leaves.slice(0, k))]); }
function dirsOf(m: number, n: number): string[] { const d: string[] = []; let idx = m, sz = n; while (sz > 1) { const k = largestPow2Below(sz); if (idx < k) { d.push("R"); sz = k; } else { d.push("L"); idx -= k; sz -= k; } } return d; }
function recomputeRoot(m: number, n: number, leaf: string, path: string[]): string | null { const dirs = dirsOf(m, n); if (dirs.length !== path.length) return null; let h = leaf; for (let i = 0; i < path.length; i++) { const dir = dirs[dirs.length - 1 - i]; h = dir === "R" ? nodeHash(h, path[i]) : nodeHash(path[i], h); } return h; }
function subproof(m: number, leaves: string[], b: boolean): string[] { const n = leaves.length; if (m === n) return b ? [] : [mth(leaves)]; const k = largestPow2Below(n); return m <= k ? subproof(m, leaves.slice(0, k), b).concat([mth(leaves.slice(k))]) : subproof(m - k, leaves.slice(k), false).concat([mth(leaves.slice(0, k))]); }
function isPow2(x: number): boolean { return x > 0 && (x & (x - 1)) === 0; }

export interface SignedTreeHead { standard: "melete-translog-sth/v1"; logId: string; size: number; rootHash: string; timestamp: number; payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256"; }
export interface InclusionProof { leafIndex: number; treeSize: number; leaf: string; path: string[]; }
export interface ConsistencyProof { firstSize: number; secondSize: number; proof: string[]; }
export interface TransparencyLog {
  logId: string; publicKeyPem: string; leaves: string[];
  append: (entry: string) => number;
  size: () => number;
  sth: () => SignedTreeHead;
  inclusionProof: (index: number) => InclusionProof;
  consistencyProof: (firstSize: number) => ConsistencyProof;
}

export function createTransparencyLog(opts?: { logId?: string; keys?: { publicKey: KeyObject; privateKey: KeyObject }; now?: () => number }): TransparencyLog {
  const kp = opts?.keys ?? generateKeyPairSync("ed25519");
  const pub = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  const logId = String(opts?.logId ?? "melete-log");
  const now = opts?.now ?? (() => 0);
  const leaves: string[] = [];
  function append(entry: string): number { leaves.push(leafHash(entry)); return leaves.length - 1; }
  function sth(): SignedTreeHead {
    const size = leaves.length, rootHash = mth(leaves), timestamp = now();
    const body = { standard: "melete-translog-sth/v1" as const, logId, size, rootHash, timestamp };
    const payloadHash = sha(Buffer.from(canonical(body)));
    const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
    return { ...body, payloadHash, signature, publicKeyPem: pub, algo: "ed25519+sha256" };
  }
  function inclusionProof(index: number): InclusionProof { return { leafIndex: index, treeSize: leaves.length, leaf: leaves[index], path: inclusionPath(index, leaves) }; }
  function consistencyProof(firstSize: number): ConsistencyProof { return { firstSize, secondSize: leaves.length, proof: (firstSize <= 0 || firstSize >= leaves.length) ? [] : subproof(firstSize, leaves, true) }; }
  return { logId, publicKeyPem: pub, leaves, append, size: () => leaves.length, sth, inclusionProof, consistencyProof };
}

export function verifySTH(s: SignedTreeHead): { ok: boolean; reason: string } {
  try {
    if (s.standard !== "melete-translog-sth/v1") return { ok: false, reason: "unknown standard" };
    const payloadHash = sha(Buffer.from(canonical({ standard: s.standard, logId: s.logId, size: s.size, rootHash: s.rootHash, timestamp: s.timestamp })));
    if (payloadHash !== s.payloadHash) return { ok: false, reason: "tree head payload hash mismatch" };
    if (!edVerify(null, Buffer.from(s.payloadHash), createPublicKey(s.publicKeyPem), Buffer.from(s.signature, "base64"))) return { ok: false, reason: "bad tree-head signature" };
    return { ok: true, reason: `STH size=${s.size} root=${s.rootHash.slice(0, 12)}…` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

// prove a claim is included in the log committed to by `sth`
export function verifyInclusion(proof: InclusionProof, sth: SignedTreeHead): { ok: boolean; reason: string } {
  try {
    const sv = verifySTH(sth); if (!sv.ok) return { ok: false, reason: "STH invalid: " + sv.reason };
    if (proof.treeSize !== sth.size) return { ok: false, reason: "proof tree size ≠ STH size" };
    if (proof.leafIndex < 0 || proof.leafIndex >= proof.treeSize) return { ok: false, reason: "leaf index out of range" };
    const root = recomputeRoot(proof.leafIndex, proof.treeSize, proof.leaf, proof.path);
    if (root === null) return { ok: false, reason: "proof path length wrong for this index/size" };
    if (root !== sth.rootHash) return { ok: false, reason: "recomputed root ≠ signed root — entry is NOT in the log" };
    return { ok: true, reason: `entry ${proof.leafIndex} is in the log of size ${proof.treeSize}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}
export function verifyEntryInclusion(entry: string, proof: InclusionProof, sth: SignedTreeHead): { ok: boolean; reason: string } {
  if (leafHash(entry) !== proof.leaf) return { ok: false, reason: "the entry does not hash to the proof's leaf" };
  return verifyInclusion(proof, sth);
}

// prove the log only appended (the size-m tree is a prefix of the size-n tree) — RFC 6962 §2.1.2
export function verifyConsistency(proof: ConsistencyProof, oldSTH: SignedTreeHead, newSTH: SignedTreeHead): { ok: boolean; reason: string } {
  try {
    const a = verifySTH(oldSTH), b = verifySTH(newSTH); if (!a.ok || !b.ok) return { ok: false, reason: "a tree head is invalid" };
    if (oldSTH.logId !== newSTH.logId) return { ok: false, reason: "different logs" };
    const m = oldSTH.size, n = newSTH.size, oldRoot = oldSTH.rootHash, newRoot = newSTH.rootHash;
    if (m > n) return { ok: false, reason: "old size > new size — not an append" };
    if (m === 0) return { ok: true, reason: "empty old tree is consistent with anything" };
    if (m === n) return (proof.proof.length === 0 && oldRoot === newRoot) ? { ok: true, reason: "same tree" } : { ok: false, reason: "same size but different root — REWRITE/split-view" };
    let pr = proof.proof.slice();
    if (isPow2(m)) pr = [oldRoot].concat(pr);
    if (pr.length === 0) return { ok: false, reason: "empty consistency proof" };
    let fn = m - 1, sn = n - 1;
    while (fn & 1) { fn >>= 1; sn >>= 1; }
    let fr = pr[0], sr = pr[0];
    for (let i = 1; i < pr.length; i++) {
      const c = pr[i];
      if (sn === 0) return { ok: false, reason: "consistency proof too long" };
      if ((fn & 1) || (fn === sn)) { fr = nodeHash(c, fr); sr = nodeHash(c, sr); while (!(fn & 1) && fn !== 0) { fn >>= 1; sn >>= 1; } }
      else { sr = nodeHash(sr, c); }
      fn >>= 1; sn >>= 1;
    }
    if (sn !== 0) return { ok: false, reason: "consistency proof too short" };
    if (fr !== oldRoot) return { ok: false, reason: "old root not reproduced — the log REWROTE a past entry" };
    if (sr !== newRoot) return { ok: false, reason: "new root not reproduced — proof inconsistent with the new tree head" };
    return { ok: true, reason: `append-only verified: size ${m} → ${n} (the first ${m} entries are unchanged)` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function translogGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const kp = generateKeyPairSync("ed25519");
  const mklog = (n: number) => { let ts = 0; const log = createTransparencyLog({ logId: "melete-ai-claims", keys: kp, now: () => ts++ }); for (let i = 0; i < n; i++) log.append("melete-cert:fairness:" + i); return log; };

  // INCLUSION: every entry has a valid inclusion proof against the current STH, across many sizes
  let incOk = true;
  for (const n of [1, 2, 3, 5, 8, 13, 100]) { const log = mklog(n); const s = log.sth(); for (let m = 0; m < n; m++) { if (!verifyInclusion(log.inclusionProof(m), s).ok) incOk = false; } }
  // INCLUSION-REJECTS a non-member entry / wrong index
  const L = mklog(100), S = L.sth();
  const incRejects = !verifyEntryInclusion("melete-cert:NOT-LOGGED", L.inclusionProof(7), S).ok && !verifyInclusion({ ...L.inclusionProof(7), leafIndex: 8 }, S).ok;

  // CONSISTENCY (append-only): for many m<n the size-m tree is proven a prefix of size-n
  let consOk = true;
  for (const [m, n] of [[1, 2], [3, 8], [5, 13], [6, 100], [50, 100], [99, 100], [1, 100]] as Array<[number, number]>) {
    const log = mklog(n); const newS = log.sth();
    const pre = mklog(m); const oldS = pre.sth(); // same keys + same entries[0:m] ⇒ same root as log's prefix
    if (!verifyConsistency(log.consistencyProof(m), oldS, newS).ok) consOk = false;
  }

  // REWRITE-OF-HISTORY CAUGHT: a monitor saved STH(size 80); the log later rewrote entry 30 → inconsistent
  const honest = mklog(100); let ts = 0;
  const monitorOldSTH = (() => { const l = mklog(80); return l.sth(); })(); // the size-80 head a monitor recorded earlier
  const tampered = createTransparencyLog({ logId: "melete-ai-claims", keys: kp, now: () => ts++ });
  for (let i = 0; i < 100; i++) tampered.append(i === 30 ? "melete-cert:REWRITTEN-to-hide-bias" : "melete-cert:fairness:" + i);
  const tamperedNewSTH = tampered.sth();
  const rewriteCaught = !verifyConsistency(tampered.consistencyProof(80), monitorOldSTH, tamperedNewSTH).ok;
  // and an HONEST extension of the same first-80 IS consistent
  const honestExtendsOk = verifyConsistency(honest.consistencyProof(80), monitorOldSTH, honest.sth()).ok;

  // SPLIT-VIEW CAUGHT: two STHs, same size, different roots ⇒ inconsistent
  const forkA = mklog(100).sth(); const forkLog = createTransparencyLog({ logId: "melete-ai-claims", keys: kp, now: () => 0 }); for (let i = 0; i < 100; i++) forkLog.append(i === 10 ? "FORK" : "melete-cert:fairness:" + i); const forkB = forkLog.sth();
  const splitViewCaught = forkA.rootHash !== forkB.rootHash && !verifyConsistency(forkLog.consistencyProof(100), forkA, forkB).ok;

  // SIGNED STH + TAMPER
  const sthOk = verifySTH(S).ok;
  const sthTamper = !verifySTH({ ...S, rootHash: "deadbeef" }).ok && !verifySTH({ ...S, size: S.size + 1 }).ok;
  // DETERMINISTIC: same entries + key ⇒ same root
  const deterministic = mklog(50).sth().rootHash === mklog(50).sth().rootHash;
  let total = true; try { const l = createTransparencyLog({ keys: kp }); l.sth(); l.inclusionProof(0); l.consistencyProof(0); verifySTH({} as SignedTreeHead); verifyInclusion({} as InclusionProof, S); } catch { total = false; }

  const checks = [
    { name: "INCLUSION (every logged claim provable)", pass: incOk, detail: "across sizes 1..100, every appended claim has a valid Merkle inclusion proof against the Signed Tree Head" },
    { name: "INCLUSION-REJECTS non-member", pass: incRejects, detail: "a claim that was never logged (or a wrong index) fails its inclusion proof — you cannot fake membership" },
    { name: "CONSISTENCY (append-only)", pass: consOk, detail: "for every m<n the log proves the size-m tree is an unchanged prefix of the size-n tree (RFC 6962 consistency proof)" },
    { name: "REWRITE-OF-HISTORY CAUGHT", pass: rewriteCaught && honestExtendsOk, detail: "rewriting a past claim makes the new tree inconsistent with the old signed tree head → DETECTED; an honest append of the same prefix verifies — you cannot un-say a logged claim" },
    { name: "SPLIT-VIEW CAUGHT", pass: splitViewCaught, detail: "two tree heads of the same size with different roots (a fork / showing different logs to different people) are detected as inconsistent" },
    { name: "STH-SIGNED", pass: sthOk, detail: "the Signed Tree Head is Ed25519-signed — the log commits to its state non-repudiably" },
    { name: "STH-TAMPER", pass: sthTamper, detail: "altering the root or size of a tree head breaks its signature/hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same entries + key → identical Merkle root" },
    { name: "TOTAL", pass: total, detail: "empty log / malformed proofs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
