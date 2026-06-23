/**
 * 🚫 THE REVOCATION REGISTRY — CRL/OCSP for AI certificates: withdraw a claim that turned out to be wrong.
 *
 * Every certificate in the stack is, once signed, valid forever — but real trust needs the opposite power too. A
 * model certified "fair" last quarter is found to discriminate; a signing key is compromised; an audit is later shown
 * to have used the wrong test set. Web PKI solved this with Certificate Revocation Lists / OCSP. This is that for AI
 * claims: an AUTHORITY (the issuer self-revoking, or a designated governance / witness-quorum key) appends a signed
 * revocation — the certificate's payloadHash + a reason + an effective timestamp — to a hash-chained, authority-signed
 * registry. A relying party then checks status before acting: GOOD, or REVOKED (with the reason and since-when).
 *
 * The crucial property is TIME-AWARENESS: a decision that relied on a certificate BEFORE its revocation took effect
 * is still historically valid (you did not act on bad information at the time) — only reliance AT/AFTER the effective
 * time is blocked. And because the registry is hash-chained + signed (and can itself be posted to the R50/R52
 * transparency log), a revocation cannot be silently dropped or back-dated: removing or altering one changes the head
 * the world already saw.
 *
 * WHO BENEFITS (≥4): ① the ISSUER can withdraw a faulty claim, bounding ongoing liability; ② RELYING PARTIES stop
 * acting on a certificate that is no longer valid; ③ REGULATORS can require revocation and verify it took effect;
 * ④ END USERS are protected from decisions made on a certificate that was already revoked.
 *
 * (DIAKRISIS — MEASURED: an un-revoked certificate checks GOOD; a revoked one checks REVOKED with the reason + the
 * since-time; status is TIME-AWARE [reliance before the effective time is GOOD, at/after is REVOKED]; the registry is
 * authority-signed and chain-linked, so altering an entry, forging a revocation, or dropping one is caught, and only
 * the DESIGNATED authority key is trusted [a revocation signed by anyone else is rejected]; deterministic + total.
 * HONEST: revocation only protects a relying party who actually CHECKS the registry [exactly like OCSP], and "who may
 * revoke" is an authority/governance policy choice — the registry enforces that whoever it is, their revocations are
 * signed, time-stamped and un-droppable, not who that authority ought to be.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
function fingerprint(pem: string): string { return sha((pem || "").trim()).slice(0, 16); }

export interface RevocationEntry { seq: number; certHash: string; reason: string; revokedAt: number; prevHash: string; entryHash: string; }
export interface RevocationList {
  standard: "melete-revocation-list/v1";
  authority: string; authorityFingerprint: string;
  entries: RevocationEntry[];
  headHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}
function entryHashOf(seq: number, certHash: string, reason: string, revokedAt: number, prevHash: string): string {
  return sha(canonical({ seq, certHash, reason, revokedAt, prevHash }));
}

export interface RevocationRegistry {
  authorityFingerprint: string; publicKeyPem: string;
  revoke: (certHash: string, reason: string, revokedAt: number) => RevocationEntry;
  status: (certHash: string, atTime?: number) => { status: "GOOD" | "REVOKED"; reason: string | null; since: number | null };
  list: () => RevocationList;
}

export function createRevocationRegistry(opts?: { authority?: string; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): RevocationRegistry {
  const kp = opts?.keys ?? generateKeyPairSync("ed25519");
  const pem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  const authority = String(opts?.authority ?? "authority");
  const fp = fingerprint(pem);
  const entries: RevocationEntry[] = []; let prevHash = "genesis";
  function revoke(certHash: string, reason: string, revokedAt: number): RevocationEntry {
    const seq = entries.length; const e: RevocationEntry = { seq, certHash: String(certHash), reason: String(reason), revokedAt: Number(revokedAt) || 0, prevHash, entryHash: "" };
    e.entryHash = entryHashOf(seq, e.certHash, e.reason, e.revokedAt, prevHash); entries.push(e); prevHash = e.entryHash; return e;
  }
  function status(certHash: string, atTime?: number): { status: "GOOD" | "REVOKED"; reason: string | null; since: number | null } {
    const t = Number.isFinite(atTime) ? (atTime as number) : Infinity;
    let hit: RevocationEntry | null = null;
    for (const e of entries) if (e.certHash === certHash && e.revokedAt <= t) { if (!hit || e.revokedAt < hit.revokedAt) hit = e; }
    return hit ? { status: "REVOKED", reason: hit.reason, since: hit.revokedAt } : { status: "GOOD", reason: null, since: null };
  }
  function list(): RevocationList {
    const headHash = entries.length ? entries[entries.length - 1].entryHash : "genesis";
    const body = { standard: "melete-revocation-list/v1" as const, authority, authorityFingerprint: fp, entries, headHash };
    const signature = edSign(null, Buffer.from(sha(canonical(body))), kp.privateKey).toString("base64");
    return { ...body, signature, publicKeyPem: pem, algo: "ed25519+sha256" };
  }
  return { authorityFingerprint: fp, publicKeyPem: pem, revoke, status, list };
}

// verify a revocation list offline; if trustedAuthorityPem is given, the list MUST be signed by that exact key
export function verifyRevocationList(l: RevocationList, trustedAuthorityPem?: string): { ok: boolean; reason: string } {
  try {
    if (l.standard !== "melete-revocation-list/v1") return { ok: false, reason: "unknown standard" };
    if (fingerprint(l.publicKeyPem) !== l.authorityFingerprint) return { ok: false, reason: "authority fingerprint inconsistent with key" };
    if (trustedAuthorityPem && fingerprint(trustedAuthorityPem) !== l.authorityFingerprint) return { ok: false, reason: "list not signed by the trusted authority — unauthorized revocation source" };
    let prevHash = "genesis";
    for (let i = 0; i < l.entries.length; i++) {
      const e = l.entries[i];
      if (e.seq !== i) return { ok: false, reason: `entry ${i} out of order` };
      if (e.prevHash !== prevHash) return { ok: false, reason: `chain broken at ${i} — an entry was inserted/removed/reordered` };
      if (entryHashOf(e.seq, e.certHash, e.reason, e.revokedAt, e.prevHash) !== e.entryHash) return { ok: false, reason: `entry ${i} altered — hash mismatch` };
      prevHash = e.entryHash;
    }
    const headHash = l.entries.length ? l.entries[l.entries.length - 1].entryHash : "genesis";
    if (headHash !== l.headHash) return { ok: false, reason: "head hash mismatch" };
    const body = { standard: l.standard, authority: l.authority, authorityFingerprint: l.authorityFingerprint, entries: l.entries, headHash: l.headHash };
    if (!edVerify(null, Buffer.from(sha(canonical(body))), createPublicKey(l.publicKeyPem), Buffer.from(l.signature, "base64"))) return { ok: false, reason: "bad authority signature" };
    return { ok: true, reason: `${l.entries.length} revocations, authority ${l.authorityFingerprint}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

// status from an exported (verified) list — what a light relying party calls
export function statusFromList(l: RevocationList, certHash: string, atTime?: number): { status: "GOOD" | "REVOKED"; reason: string | null; since: number | null } {
  const t = Number.isFinite(atTime) ? (atTime as number) : Infinity;
  let hit: RevocationEntry | null = null;
  for (const e of l.entries) if (e.certHash === certHash && e.revokedAt <= t) { if (!hit || e.revokedAt < hit.revokedAt) hit = e; }
  return hit ? { status: "REVOKED", reason: hit.reason, since: hit.revokedAt } : { status: "GOOD", reason: null, since: null };
}

export function revocationGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const authKp = generateKeyPairSync("ed25519");
  const reg = createRevocationRegistry({ authority: "EU-AI-Office", keys: authKp });
  const certA = sha("fairness-cert-A"), certB = sha("calibration-cert-B"), certC = sha("pca-cert-C");
  reg.revoke(certB, "model found to discriminate on the intersection of age×region", 1000);

  // GOOD-PASSES: a cert never revoked
  const good = reg.status(certA).status === "GOOD" && reg.status(certC).status === "GOOD";
  // REVOKE-BLOCKS: a revoked cert (checked "now") is REVOKED + names reason + since
  const sNow = reg.status(certB, 5000); const blocks = sNow.status === "REVOKED" && sNow.since === 1000 && /discriminate/.test(sNow.reason || "");
  // TIME-AWARE: reliance BEFORE the effective time is still GOOD; at/after is REVOKED
  const before = reg.status(certB, 999).status === "GOOD"; const at = reg.status(certB, 1000).status === "REVOKED"; const after = reg.status(certB, 2000).status === "REVOKED";
  const timeAware = before && at && after;

  const L = reg.list();
  const listSigned = verifyRevocationList(L).ok && verifyRevocationList(L, authKp.publicKey.export({ type: "spki", format: "pem" }).toString()).ok;
  // light relying party reads status from the exported, verified list
  const lightOk = statusFromList(L, certB, 5000).status === "REVOKED" && statusFromList(L, certA, 5000).status === "GOOD";
  // TAMPER: alter a revocation reason without re-signing → caught
  const tampered = JSON.parse(JSON.stringify(L)); tampered.entries[0].reason = "nothing to see here";
  const tamperCaught = !verifyRevocationList(tampered).ok;
  // FORGE-ADD: append a fake revocation (of certA) without the authority re-signing the head → caught
  const forged = JSON.parse(JSON.stringify(L)); const fe = { seq: 1, certHash: certA, reason: "spite", revokedAt: 1, prevHash: L.headHash, entryHash: "" }; fe.entryHash = entryHashOf(1, certA, "spite", 1, L.headHash); forged.entries.push(fe);
  const forgeCaught = !verifyRevocationList(forged).ok;
  // DROP / UN-REVOKE: a monitor saved the head; a list with the revocation removed has a different head → detected
  const savedHead = L.headHash; const dropped = createRevocationRegistry({ authority: "EU-AI-Office", keys: authKp }).list(); // empty list (revocation un-done)
  const unrevokeCaught = verifyRevocationList(dropped).ok && dropped.headHash !== savedHead; // properly signed but the head the world saw no longer matches
  // AUTHORIZED-ONLY: a list from a DIFFERENT key is rejected when a specific authority is required
  const rogue = createRevocationRegistry({ authority: "EU-AI-Office" }).list(); // different key, same name
  const trustedPem = authKp.publicKey.export({ type: "spki", format: "pem" }).toString();
  const authorizedOnly = !verifyRevocationList(rogue, trustedPem).ok && verifyRevocationList(rogue).ok; // rogue self-verifies but fails the trusted-authority pin

  const d1 = (() => { const r = createRevocationRegistry({ authority: "X", keys: authKp }); r.revoke(certB, "x", 1000); return r.list(); })();
  const d2 = (() => { const r = createRevocationRegistry({ authority: "X", keys: authKp }); r.revoke(certB, "x", 1000); return r.list(); })();
  const deterministic = d1.headHash === d2.headHash && d1.signature === d2.signature;
  let total = true; try { const r = createRevocationRegistry(); r.status("nope"); r.list(); verifyRevocationList({} as RevocationList); statusFromList({ entries: [] } as any, "x"); } catch { total = false; }

  const checks = [
    { name: "GOOD-PASSES", pass: good, detail: "a certificate that was never revoked checks status GOOD" },
    { name: "REVOKE-BLOCKS (+reason/since)", pass: blocks, detail: `a revoked certificate checks REVOKED, naming the reason and the since-time (${sNow.since})` },
    { name: "TIME-AWARE", pass: timeAware, detail: "reliance BEFORE the effective time is still GOOD (historical); at/after the effective time is REVOKED — past decisions are not retroactively invalidated" },
    { name: "LIST-SIGNED + light-check", pass: listSigned && lightOk, detail: "the registry is authority-signed and verifies offline; a light relying party reads status straight from the exported list" },
    { name: "TAMPER-CAUGHT", pass: tamperCaught, detail: "altering a revocation's reason/time breaks the entry hash and the authority signature" },
    { name: "FORGED-REVOCATION-CAUGHT", pass: forgeCaught, detail: "appending a fake revocation without the authority re-signing the head is rejected" },
    { name: "UN-REVOKE-DETECTED", pass: unrevokeCaught, detail: "silently dropping a revocation changes the head the world already saw — a monitor detects the mismatch (post it to the transparency log and it cannot be hidden)" },
    { name: "AUTHORIZED-ONLY", pass: authorizedOnly, detail: "a revocation list signed by anyone other than the designated authority is rejected when the authority key is pinned" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same authority key + revocations → byte-identical signed list" },
    { name: "TOTAL", pass: total, detail: "empty registry / malformed list never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
