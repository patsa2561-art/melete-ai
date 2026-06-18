/**
 * ✍️ THE CONSENT CERTIFICATE — GDPR-grade consent that BOTH the data subject and the data controller can prove.
 *
 * Consent today is a checkbox in a database the user can't see and the company can rewrite. Neither side has a
 * portable, tamper-evident record of what was actually agreed — so a subject can't prove their data was used outside
 * what they allowed, and a controller can't prove a given use WAS allowed. This makes consent a two-party signed
 * artifact: the SUBJECT signs a scoped grant (which purposes, which data fields, an expiry); the CONTROLLER, to use
 * the data, issues a Use Certificate whose verdict (ALLOWED / DENIED) is deterministically RE-DERIVED from the grant
 * — purpose in scope, fields in scope, not expired, not revoked — and signed. The subject can revoke (signed), and
 * any use after that is provably DENIED. Anyone can re-check the whole chain offline.
 *
 * WHO BENEFITS (≥2 parties, by design): ① the DATA SUBJECT holds a signed record of exactly what they consented to
 * and can PROVE any out-of-scope / expired / post-revocation use — real recourse, not a support ticket; ② the
 * CONTROLLER holds signed Use Certificates proving each use was within consent — an audit-ready compliance trail
 * that bounds liability. Neither can quietly rewrite the agreement.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot bind a scoped grant to a subject key, deterministically adjudicate a
 * use against it, honour a signed revocation, and emit a re-derivable verdict — it just says "looks fine". (DIAKRISIS
 * — MEASURED: an in-scope use is ALLOWED + the use-cert verifies; an out-of-scope purpose / field, an expired use,
 * and a post-revocation use are each DENIED and NAMED; a use BEFORE a later revocation stays ALLOWED; a controller
 * forging ALLOWED for an out-of-scope use is rejected on re-derivation; subject≠controller two-party chain holds.
 * HONEST: this certifies consent SCOPE + that the record wasn't tampered — it cannot enforce what a controller does
 * off-system; its force is that an off-scope use is now provable, not that it is physically prevented.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
function fingerprint(pem: string): string { return createHash("sha256").update((pem || "").trim()).digest("hex").slice(0, 16); }

export interface ConsentReceipt {
  standard: "melete-consent-receipt/v1";
  subject: string; controller: string;
  purposes: string[]; fields: string[];
  grantedAt: number; expiresAt: number;
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";   // signed by the SUBJECT
}
export interface ConsentRevocation { standard: "melete-consent-revocation/v1"; receiptHash: string; revokedAt: number; payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256" } // signed by the SUBJECT
export interface ConsentUse { purpose: string; fields: string[]; atTime: number }
export interface UseCertificate {
  standard: "melete-consent-use/v1";
  receiptHash: string; revocationHash: string | null;
  use: ConsentUse; verdict: "ALLOWED" | "DENIED"; reasons: string[];
  subjectFingerprint: string; controllerFingerprint: string;
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";    // signed by the CONTROLLER
}

// the SUBJECT signs a scoped consent grant
export function consentReceipt(opts: { subject?: string; controller?: string; purposes: string[]; fields: string[]; grantedAt?: number; expiresAt: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): ConsentReceipt {
  const purposes = Array.from(new Set((opts.purposes ?? []).map(String))).sort();
  const fields = Array.from(new Set((opts.fields ?? []).map(String))).sort();
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const body = { standard: "melete-consent-receipt/v1" as const, subject: String(opts.subject ?? "subject"), controller: String(opts.controller ?? "controller"), purposes, fields, grantedAt: Number(opts.grantedAt ?? 0), expiresAt: Number(opts.expiresAt ?? 0) };
  const payloadHash = createHash("sha256").update(canonical(body)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...body, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}
export function verifyConsentReceipt(r: ConsentReceipt): { ok: boolean; reason: string } {
  try {
    if (r.standard !== "melete-consent-receipt/v1") return { ok: false, reason: "unknown standard" };
    const payloadHash = createHash("sha256").update(canonical({ standard: r.standard, subject: r.subject, controller: r.controller, purposes: r.purposes, fields: r.fields, grantedAt: r.grantedAt, expiresAt: r.expiresAt })).digest("hex");
    if (payloadHash !== r.payloadHash) return { ok: false, reason: "receipt payload hash mismatch — the grant was altered" };
    if (!edVerify(null, Buffer.from(r.payloadHash), createPublicKey(r.publicKeyPem), Buffer.from(r.signature, "base64"))) return { ok: false, reason: "bad subject signature" };
    return { ok: true, reason: `consent: ${r.purposes.length} purposes, ${r.fields.length} fields, expires ${r.expiresAt}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

// the SUBJECT signs a revocation bound to a receipt
export function consentRevocation(opts: { receipt: ConsentReceipt; revokedAt: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): ConsentRevocation {
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const body = { standard: "melete-consent-revocation/v1" as const, receiptHash: String(opts.receipt?.payloadHash ?? ""), revokedAt: Number(opts.revokedAt ?? 0) };
  const payloadHash = createHash("sha256").update(canonical(body)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...body, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

// deterministic adjudication of a use against the grant (+ optional revocation)
export function checkUse(r: ConsentReceipt, use: ConsentUse, revocation?: ConsentRevocation | null): { verdict: "ALLOWED" | "DENIED"; reasons: string[] } {
  const reasons: string[] = [];
  const atTime = Number(use?.atTime ?? 0);
  const useFields = Array.from(new Set((use?.fields ?? []).map(String))).sort();
  if (revocation && revocation.receiptHash === r.payloadHash && Number(revocation.revokedAt) <= atTime) reasons.push("consent revoked");
  if (atTime > r.expiresAt) reasons.push("consent expired");
  if (!r.purposes.includes(String(use?.purpose))) reasons.push(`purpose '${use?.purpose}' not consented`);
  for (const f of useFields) if (!r.fields.includes(f)) reasons.push(`field '${f}' not consented`);
  return { verdict: reasons.length ? "DENIED" : "ALLOWED", reasons };
}

// the CONTROLLER issues a signed Use Certificate (verdict re-derived from the grant)
export function useCertificate(opts: { receipt: ConsentReceipt; use: ConsentUse; revocation?: ConsentRevocation | null; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): UseCertificate {
  const r = opts.receipt; const rev = opts.revocation ?? null;
  const res = checkUse(r, opts.use, rev);
  const use = { purpose: String(opts.use?.purpose ?? ""), fields: Array.from(new Set((opts.use?.fields ?? []).map(String))).sort(), atTime: Number(opts.use?.atTime ?? 0) };
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const body = { standard: "melete-consent-use/v1" as const, receiptHash: String(r?.payloadHash ?? ""), revocationHash: rev ? String(rev.payloadHash) : null, use, verdict: res.verdict, reasons: res.reasons, subjectFingerprint: fingerprint(r?.publicKeyPem ?? ""), controllerFingerprint: fingerprint(kp.publicKey.export({ type: "spki", format: "pem" }).toString()) };
  const payloadHash = createHash("sha256").update(canonical(body)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...body, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

// re-check the whole two-party chain offline: subject's receipt sig, controller's use-cert sig, the re-derived
// verdict, the bindings, and independence (subject ≠ controller).
export function verifyUseCertificate(uc: UseCertificate, receipt: ConsentReceipt, revocation?: ConsentRevocation | null): { ok: boolean; reason: string } {
  try {
    if (uc.standard !== "melete-consent-use/v1") return { ok: false, reason: "unknown standard" };
    const rOk = verifyConsentReceipt(receipt); if (!rOk.ok) return { ok: false, reason: "receipt invalid: " + rOk.reason };
    if (uc.receiptHash !== receipt.payloadHash) return { ok: false, reason: "use-cert not bound to this receipt" };
    const rev = revocation ?? null;
    if (rev) { if (!edVerify(null, Buffer.from(rev.payloadHash), createPublicKey(rev.publicKeyPem), Buffer.from(rev.signature, "base64"))) return { ok: false, reason: "bad revocation signature" }; if (fingerprint(rev.publicKeyPem) !== fingerprint(receipt.publicKeyPem)) return { ok: false, reason: "revocation not signed by the subject" }; if ((uc.revocationHash ?? null) !== rev.payloadHash) return { ok: false, reason: "use-cert not bound to the supplied revocation" }; }
    else if (uc.revocationHash) return { ok: false, reason: "use-cert references a revocation that was not supplied" };
    const res = checkUse(receipt, uc.use, rev);
    if (res.verdict !== uc.verdict || canonical(res.reasons) !== canonical(uc.reasons)) return { ok: false, reason: `re-derived verdict ${res.verdict} ≠ certificate ${uc.verdict} — adjudication misstated` };
    if (uc.subjectFingerprint !== fingerprint(receipt.publicKeyPem)) return { ok: false, reason: "subject fingerprint inconsistent" };
    if (uc.controllerFingerprint !== fingerprint(uc.publicKeyPem)) return { ok: false, reason: "controller fingerprint inconsistent" };
    if (uc.subjectFingerprint === uc.controllerFingerprint) return { ok: false, reason: "subject and controller are the same key — not a two-party record" };
    const payloadHash = createHash("sha256").update(canonical({ standard: uc.standard, receiptHash: uc.receiptHash, revocationHash: uc.revocationHash, use: uc.use, verdict: uc.verdict, reasons: uc.reasons, subjectFingerprint: uc.subjectFingerprint, controllerFingerprint: uc.controllerFingerprint })).digest("hex");
    if (payloadHash !== uc.payloadHash) return { ok: false, reason: "use-cert payload hash mismatch — altered" };
    if (!edVerify(null, Buffer.from(uc.payloadHash), createPublicKey(uc.publicKeyPem), Buffer.from(uc.signature, "base64"))) return { ok: false, reason: "bad controller signature" };
    return { ok: true, reason: `${uc.verdict}${uc.reasons.length ? " (" + uc.reasons.join("; ") + ")" : ""}: use '${uc.use.purpose}' — subject ${uc.subjectFingerprint} ↔ controller ${uc.controllerFingerprint}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function consentGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const subj = generateKeyPairSync("ed25519"), ctrl = generateKeyPairSync("ed25519");
  const receipt = consentReceipt({ subject: "alice", controller: "BankCo", purposes: ["fraud-detection", "credit-scoring"], fields: ["income", "age", "history"], grantedAt: 1000, expiresAt: 2000, keys: subj });
  const receiptOk = verifyConsentReceipt(receipt).ok;
  const mk = (use: ConsentUse, rev?: ConsentRevocation | null) => useCertificate({ receipt, use, revocation: rev ?? null, keys: ctrl });

  const inScope = mk({ purpose: "credit-scoring", fields: ["income", "age"], atTime: 1500 });
  const allowed = inScope.verdict === "ALLOWED" && verifyUseCertificate(inScope, receipt).ok;
  const badPurpose = mk({ purpose: "ad-targeting", fields: ["income"], atTime: 1500 });
  const purposeDenied = badPurpose.verdict === "DENIED" && badPurpose.reasons.some((x) => x.includes("ad-targeting")) && verifyUseCertificate(badPurpose, receipt).ok;
  const badField = mk({ purpose: "credit-scoring", fields: ["income", "ethnicity"], atTime: 1500 });
  const fieldDenied = badField.verdict === "DENIED" && badField.reasons.some((x) => x.includes("ethnicity"));
  const expired = mk({ purpose: "credit-scoring", fields: ["income"], atTime: 2500 });
  const expiredDenied = expired.verdict === "DENIED" && expired.reasons.some((x) => x.includes("expired"));

  // revocation: subject revokes at 1600; a use at 1800 is DENIED, a use at 1500 (before) stays ALLOWED
  const rev = consentRevocation({ receipt, revokedAt: 1600, keys: subj });
  const afterRev = mk({ purpose: "credit-scoring", fields: ["income"], atTime: 1800 }, rev);
  const beforeRev = mk({ purpose: "credit-scoring", fields: ["income"], atTime: 1500 }, rev);
  const revocationWorks = afterRev.verdict === "DENIED" && afterRev.reasons.some((x) => x.includes("revoked")) && verifyUseCertificate(afterRev, receipt, rev).ok && beforeRev.verdict === "ALLOWED";

  // FORGERY: controller flips an out-of-scope DENIED to ALLOWED ⇒ rejected on re-derivation
  const forged = { ...badPurpose, verdict: "ALLOWED" as const, reasons: [] as string[] };
  const forgeryCaught = !verifyUseCertificate(forged, receipt).ok;
  // SUBJECT can prove a violation: an out-of-scope use-cert that HONESTLY says DENIED is a portable proof the use wasn't consented
  const subjectProof = verifyUseCertificate(badPurpose, receipt).ok && badPurpose.verdict === "DENIED";
  // TWO-PARTY independence: subject ≠ controller; a self-issued (controller==subject) cert is rejected
  const self = useCertificate({ receipt, use: { purpose: "credit-scoring", fields: ["income"], atTime: 1500 }, keys: subj });
  const independence = inScope.subjectFingerprint !== inScope.controllerFingerprint && !verifyUseCertificate(self, receipt).ok;
  const tamper = !verifyUseCertificate({ ...inScope, use: { ...inScope.use, fields: ["income", "age", "history", "ethnicity"] } }, receipt).ok;
  const d1 = mk({ purpose: "fraud-detection", fields: ["age"], atTime: 1200 }), d2 = mk({ purpose: "fraud-detection", fields: ["age"], atTime: 1200 });
  const deterministic = d1.payloadHash === d2.payloadHash && verifyUseCertificate(d1, receipt).ok;
  let total = true; try { consentReceipt({ purposes: [], fields: [], expiresAt: 0 }); useCertificate({ receipt, use: { purpose: "", fields: [], atTime: NaN } }); verifyUseCertificate({} as UseCertificate, receipt); } catch { total = false; }

  const checks = [
    { name: "GRANT-SIGNED (subject)", pass: receiptOk, detail: "the data subject signs a scoped consent grant (purposes + fields + expiry) that verifies offline" },
    { name: "IN-SCOPE-ALLOWED", pass: allowed, detail: "a use with a consented purpose + consented fields before expiry is ALLOWED and the controller's use-certificate verifies" },
    { name: "PURPOSE-OUT-OF-SCOPE-DENIED", pass: purposeDenied, detail: `a use for a non-consented purpose ('ad-targeting') is DENIED and named` },
    { name: "FIELD-OUT-OF-SCOPE-DENIED", pass: fieldDenied, detail: `a use touching a non-consented field ('ethnicity') is DENIED and named` },
    { name: "EXPIRED-DENIED", pass: expiredDenied, detail: "a use after the consent's expiry is DENIED" },
    { name: "REVOCATION (signed, time-aware)", pass: revocationWorks, detail: "after the subject signs a revocation at t=1600, a use at t=1800 is DENIED; a use at t=1500 (before) stays ALLOWED" },
    { name: "FORGERY-CAUGHT (controller flips DENIED→ALLOWED)", pass: forgeryCaught, detail: "a controller claiming ALLOWED for an out-of-scope use is rejected — the verdict re-derives from the signed grant" },
    { name: "SUBJECT-CAN-PROVE-VIOLATION", pass: subjectProof, detail: "an honestly-DENIED use-certificate is a portable, offline-checkable proof the use was outside consent — real recourse for the subject" },
    { name: "TWO-PARTY-INDEPENDENCE", pass: independence, detail: "subject ≠ controller keys; a self-issued use-certificate (controller = subject) is rejected" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "widening the used fields after signing breaks the payload hash / re-derived verdict" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same grant + use → byte-identical use-certificate" },
    { name: "TOTAL", pass: total, detail: "empty / NaN / malformed inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
