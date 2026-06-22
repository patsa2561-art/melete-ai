/**
 * 🛰️ THE WITNESS NETWORK — split-view immunity for the AI Transparency Log via independent witness co-signing.
 *
 * A transparency log (R50) is only as honest as the assumption that its operator shows EVERYONE the same history.
 * The real attack — the one Certificate Transparency had to solve for the web — is the SPLIT VIEW: a malicious log
 * shows tree head A (hiding a bad claim) to a regulator and tree head B (with the claim) to everyone else. A single
 * log you must trust cannot rule this out. The fix the CT ecosystem converged on is GOSSIP + WITNESSES: independent
 * parties verify a log's Signed Tree Head (and that it only appended since the head they last saw) and CO-SIGN it;
 * a relying party trusts a tree head only if a QUORUM of distinct, independent witnesses co-signed the SAME root at
 * the same size. The operator then cannot present two histories — to do so it would need two quorums for two
 * different roots at one size, which any monitor detects immediately.
 *
 * WHO BENEFITS (a whole ecosystem, ≥4): ① the LOG OPERATOR earns trust it could not earn alone (its honesty is now
 * checkable, not assumed); ② WITNESSES (other vendors, NGOs, cloud providers) provide a public good and hold each
 * other accountable; ③ RELYING PARTIES / end users trust a tree head without trusting any single operator; ④
 * REGULATORS get cryptographic proof there is one, and only one, history.
 *
 * (DIAKRISIS — MEASURED: a valid tree head co-signed by ≥ quorum distinct witnesses is ACCEPTED; below quorum it is
 * NOT accepted; a forged co-signature [bad key/root] does not count; the same witness co-signing twice counts once
 * [no ballot-stuffing]; a witness refuses to co-sign a tree head that is not append-only vs the head it last
 * co-signed; a SPLIT VIEW [co-signatures for two different roots at the same size] is detected 100%; co-signatures
 * are Ed25519-signed + offline-verifiable. HONEST: this defends against a lying operator GIVEN enough independent
 * honest witnesses — it does not create independence [colluding witnesses sharing one key are caught as one, but
 * sock-puppet witnesses with distinct keys are a Sybil problem solved by WHO you accept as a witness, a policy
 * choice]; it composes on the R50 log + its consistency proofs, adding the trust-distribution layer, not new crypto.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";
import { verifySTH, verifyConsistency, createTransparencyLog, type SignedTreeHead, type ConsistencyProof } from "./translog.js";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
function fingerprint(pem: string): string { return sha((pem || "").trim()).slice(0, 16); }
function cosignBody(logId: string, size: number, rootHash: string) { return { kind: "melete-cosignature/v1", logId, size, rootHash }; }

export interface Cosignature { standard: "melete-cosignature/v1"; logId: string; size: number; rootHash: string; witness: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256"; }
export interface Witness { name: string; fingerprint: string; publicKeyPem: string; cosign: (sth: SignedTreeHead, opts?: { lastHead?: SignedTreeHead; consistency?: ConsistencyProof }) => Cosignature | { refused: true; reason: string }; }

export function createWitness(name: string, keys?: { publicKey: KeyObject; privateKey: KeyObject }): Witness {
  const kp = keys ?? generateKeyPairSync("ed25519");
  const pem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  const fp = fingerprint(pem);
  function cosign(sth: SignedTreeHead, opts?: { lastHead?: SignedTreeHead; consistency?: ConsistencyProof }): Cosignature | { refused: true; reason: string } {
    const v = verifySTH(sth); if (!v.ok) return { refused: true, reason: "STH invalid: " + v.reason };
    // append-only discipline: if the witness was shown a previous head for this log, the new head must extend it
    if (opts?.lastHead) {
      if (opts.lastHead.logId !== sth.logId) return { refused: true, reason: "different log" };
      if (sth.size < opts.lastHead.size) return { refused: true, reason: "tree shrank — not append-only" };
      if (sth.size > opts.lastHead.size) {
        if (!opts.consistency) return { refused: true, reason: "no consistency proof for the extension" };
        const c = verifyConsistency(opts.consistency, opts.lastHead, sth); if (!c.ok) return { refused: true, reason: "not append-only: " + c.reason };
      } else if (sth.rootHash !== opts.lastHead.rootHash) return { refused: true, reason: "same size but different root — split view" };
    }
    const payloadHash = sha(canonical(cosignBody(sth.logId, sth.size, sth.rootHash)));
    const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
    return { standard: "melete-cosignature/v1", logId: sth.logId, size: sth.size, rootHash: sth.rootHash, witness: fp, signature, publicKeyPem: pem, algo: "ed25519+sha256" };
  }
  return { name, fingerprint: fp, publicKeyPem: pem, cosign };
}

export function verifyCosignature(cosig: Cosignature, sth: SignedTreeHead): { ok: boolean; reason: string } {
  try {
    if (cosig.standard !== "melete-cosignature/v1") return { ok: false, reason: "unknown standard" };
    if (cosig.logId !== sth.logId || cosig.size !== sth.size || cosig.rootHash !== sth.rootHash) return { ok: false, reason: "co-signature is for a different tree head" };
    if (fingerprint(cosig.publicKeyPem) !== cosig.witness) return { ok: false, reason: "witness fingerprint inconsistent with key" };
    const payloadHash = sha(canonical(cosignBody(cosig.logId, cosig.size, cosig.rootHash)));
    if (!edVerify(null, Buffer.from(payloadHash), createPublicKey(cosig.publicKeyPem), Buffer.from(cosig.signature, "base64"))) return { ok: false, reason: "bad witness signature" };
    return { ok: true, reason: `witness ${cosig.witness} co-signed size ${cosig.size}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

// a relying party accepts a tree head iff a quorum of DISTINCT valid witnesses co-signed THIS exact root
export function collectQuorum(sth: SignedTreeHead, cosigs: Cosignature[], quorum: number, trusted?: string[]): { accepted: boolean; count: number; quorum: number; witnesses: string[] } {
  const seen = new Set<string>(); const trustSet = trusted && trusted.length ? new Set(trusted) : null;
  for (const c of cosigs) { if (!verifyCosignature(c, sth).ok) continue; if (trustSet && !trustSet.has(c.witness)) continue; seen.add(c.witness); }
  const witnesses = [...seen];
  return { accepted: witnesses.length >= quorum, count: witnesses.length, quorum, witnesses };
}

// detect a split view: co-signatures (valid sig) for two different roots at the same (logId,size)
export function detectSplitView(cosigs: Cosignature[]): { splitView: boolean; conflicts: Array<{ logId: string; size: number; roots: string[] }> } {
  const byHead = new Map<string, Set<string>>();
  for (const c of cosigs) {
    // accept a co-signature as evidence iff its own signature verifies (independent of any single STH)
    const payloadHash = sha(canonical(cosignBody(c.logId, c.size, c.rootHash)));
    let ok = false; try { ok = c.standard === "melete-cosignature/v1" && fingerprint(c.publicKeyPem) === c.witness && edVerify(null, Buffer.from(payloadHash), createPublicKey(c.publicKeyPem), Buffer.from(c.signature, "base64")); } catch { ok = false; }
    if (!ok) continue;
    const key = c.logId + ":" + c.size; if (!byHead.has(key)) byHead.set(key, new Set()); byHead.get(key)!.add(c.rootHash);
  }
  const conflicts: Array<{ logId: string; size: number; roots: string[] }> = [];
  for (const [key, roots] of byHead) if (roots.size > 1) { const [logId, size] = key.split(":"); conflicts.push({ logId, size: Number(size), roots: [...roots] }); }
  return { splitView: conflicts.length > 0, conflicts };
}

export function witnessGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  let ts = 0; const log = createTransparencyLog({ logId: "melete-ai-claims", now: () => ts++ });
  for (let i = 0; i < 64; i++) log.append("melete-cert:" + i);
  const sth = log.sth();
  const W = [createWitness("Anthropic-Witness"), createWitness("Cloudflare-Witness"), createWitness("EU-AI-Office"), createWitness("MLCommons"), createWitness("AlgoWatch-NGO")];
  const cosigs = W.map((w) => w.cosign(sth)).filter((c): c is Cosignature => !("refused" in c));

  // QUORUM-ACCEPT: 5 distinct witnesses co-sign the same valid head → quorum 3 accepted
  const q = collectQuorum(sth, cosigs, 3);
  const quorumAccept = q.accepted && q.count === 5;
  // QUORUM-SHORT: only 2 co-sigs → quorum 3 not met
  const short = collectQuorum(sth, cosigs.slice(0, 2), 3);
  const quorumShort = !short.accepted && short.count === 2;
  // FORGED-COSIG: a co-signature with a tampered root does not count
  const forged = { ...cosigs[0], rootHash: "deadbeef" };
  const forgedRejected = !verifyCosignature(forged, sth).ok && collectQuorum(sth, [forged, ...cosigs.slice(1)], 5).count === 4;
  // NO-BALLOT-STUFFING: the same witness co-signing twice counts once
  const dup = collectQuorum(sth, [cosigs[0], cosigs[0], cosigs[0]], 3);
  const noStuffing = dup.count === 1 && !dup.accepted;
  // WITNESS-APPEND-ONLY: a witness refuses a head that isn't append-only vs the one it last co-signed
  let ts2 = 0; const tampered = createTransparencyLog({ logId: "melete-ai-claims", now: () => ts2++ });
  for (let i = 0; i < 64; i++) tampered.append(i === 10 ? "REWRITTEN" : "melete-cert:" + i);
  const w0 = W[0]; const lastHead = (() => { let t = 0; const l = createTransparencyLog({ logId: "melete-ai-claims", now: () => t++ }); for (let i = 0; i < 40; i++) l.append("melete-cert:" + i); return l.sth(); })();
  const refusal = w0.cosign(tampered.sth(), { lastHead, consistency: tampered.consistencyProof(40) });
  const appendOnlyRefused = ("refused" in refusal) && refusal.reason.includes("append-only");
  // and an HONEST extension is co-signed
  const honestExt = w0.cosign(log.sth(), { lastHead, consistency: log.consistencyProof(40) });
  const honestCosigned = !("refused" in honestExt);

  // SPLIT-VIEW-DETECTED: the operator shows root A to some witnesses, root B to others, at the same size
  let tb = 0; const logB = createTransparencyLog({ logId: "melete-ai-claims", now: () => tb++ });
  for (let i = 0; i < 64; i++) logB.append(i === 5 ? "HIDDEN-FORK" : "melete-cert:" + i);
  const sthB = logB.sth();
  const cosigsA = [W[0].cosign(sth), W[1].cosign(sth)].filter((c): c is Cosignature => !("refused" in c));
  const cosigsB = [W[2].cosign(sthB), W[3].cosign(sthB)].filter((c): c is Cosignature => !("refused" in c));
  const sv = detectSplitView([...cosigsA, ...cosigsB]);
  const splitViewDetected = sthB.rootHash !== sth.rootHash && sv.splitView && sv.conflicts.length === 1 && sv.conflicts[0].roots.length === 2;
  // no false split-view when everyone agrees
  const noFalseSplit = !detectSplitView(cosigs).splitView;

  const cosigVerifies = cosigs.every((c) => verifyCosignature(c, sth).ok);
  const d1 = W[0].cosign(sth), d2 = W[0].cosign(sth); const deterministic = !("refused" in d1) && !("refused" in d2) && (d1 as Cosignature).signature === (d2 as Cosignature).signature;
  let total = true; try { const w = createWitness("x"); w.cosign({} as SignedTreeHead); verifyCosignature({} as Cosignature, sth); detectSplitView([]); collectQuorum(sth, [], 3); } catch { total = false; }

  const checks = [
    { name: "QUORUM-ACCEPT", pass: quorumAccept, detail: "a valid tree head co-signed by 5 distinct independent witnesses is ACCEPTED at quorum 3 — trust without trusting the operator" },
    { name: "QUORUM-SHORT-REJECTED", pass: quorumShort, detail: "below the quorum (2 of 3 needed) the tree head is NOT accepted" },
    { name: "FORGED-COSIG-IGNORED", pass: forgedRejected, detail: "a co-signature with a tampered root fails verification and does not count toward the quorum" },
    { name: "NO-BALLOT-STUFFING", pass: noStuffing, detail: "the same witness co-signing repeatedly counts once — quorum needs DISTINCT witnesses" },
    { name: "WITNESS-APPEND-ONLY", pass: appendOnlyRefused && honestCosigned, detail: "a witness refuses to co-sign a head that rewrote history vs the one it last saw, but co-signs an honest append" },
    { name: "SPLIT-VIEW-DETECTED", pass: splitViewDetected, detail: "if the operator shows two different roots at the same size to different witnesses, the conflicting co-signatures expose the split view" },
    { name: "NO-FALSE-SPLIT", pass: noFalseSplit, detail: "when all witnesses co-sign the same root, no split view is reported" },
    { name: "COSIG-VERIFIES", pass: cosigVerifies, detail: "every co-signature is Ed25519-signed over (logId,size,root) and verifies offline" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "a witness co-signing the same head twice yields the identical signature" },
    { name: "TOTAL", pass: total, detail: "malformed tree heads / empty co-signature sets never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
