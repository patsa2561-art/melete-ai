/**
 * 🎫 THE TRUST PASSPORT — ship the whole proof as ONE signed bundle; verify everything in a single call.
 *
 * The honesty stack has grown to many certificates. In real life a vendor doesn't want to hand a buyer eight
 * separate JSON files, and a regulator doesn't want to verify them one by one. The Trust Passport composes any set
 * of Melete certificates into ONE signed envelope: it binds each member by its hash into a merkle root, signs the
 * root, and re-verifies every member offline in a single call. Because the passport itself has the standard signed
 * shape, the two-party Verification Receipt (a verifier counter-signs it) works on it unchanged — so an auditor can
 * confirm the entire bundle and hand back one counter-signed receipt.
 *
 * WHO BENEFITS (≥2 parties, by design): ① the ISSUER (an AI vendor / deployer) ships a single portable artifact that
 * proves fairness AND calibration AND privacy AND the SLA AND consent at once — and a tampered or swapped member is
 * caught; ② the VERIFIER (a buyer / regulator / procurement) verifies the whole compliance posture in one offline
 * call instead of chasing eight files, and gets an exact list of which member (if any) failed.
 *
 * (DIAKRISIS — MEASURED: a passport over genuine members verifies and reports overall PASS; swapping or tampering
 * any member is caught and named; the merkle root is order-independent; a member whose embedded certificate's hash
 * doesn't match the manifest is rejected; a forged "all-verified" passport with a failing member is rejected on
 * re-derivation; the passport is itself a signed cert so the two-party Verification Receipt verifies over it. HONEST:
 * the passport is exactly as strong as the member certificates it carries — it composes + binds + makes one-call
 * verification possible; it does not add new statistical power, and it needs the per-kind verifier to re-derive
 * members [injected], so a kind the verifier doesn't know is reported UNKNOWN, not silently trusted.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";
import { fairnessCertificate, verifyFairnessCertificate } from "./fairness.js";
import { calibrationCertificate, verifyCalibrationCertificate } from "./calibration.js";
import { attributionCertificate, verifyAttributionCertificate } from "./shapley.js";
import { issueVerificationReceipt, verifyVerificationReceipt } from "./receipt.js";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

interface SignedCert { standard?: string; payloadHash?: string }
type VerifyFn = (kind: string, cert: any) => { ok: boolean; reason: string };
interface PassportEntry { kind: string; certHash: string; standard: string; ok: boolean; reason: string }

export interface TrustPassport {
  standard: "melete-trust-passport/v1";
  issuer: string; subject: string;
  n: number;
  entries: PassportEntry[];        // one per member: kind + bound hash + the re-derived verdict at issue
  merkleRoot: string;              // order-independent hash over {kind, certHash} of every member
  overallVerified: boolean;        // every member re-derived ok at issue
  certificates: any[];             // the embedded member certificates (the evidence the verifier re-derives)
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}

function merkleRoot(entries: Array<{ kind: string; certHash: string }>): string {
  const s = entries.map((e) => ({ kind: e.kind, certHash: e.certHash })).sort((a, b) => (a.certHash < b.certHash ? -1 : a.certHash > b.certHash ? 1 : (a.kind < b.kind ? -1 : 1)));
  return createHash("sha256").update(canonical(s)).digest("hex");
}

export function trustPassport(opts: { issuer?: string; subject?: string; members: Array<{ kind: string; certificate: SignedCert }>; verify: VerifyFn; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): TrustPassport {
  const members = Array.isArray(opts.members) ? opts.members : [];
  const certificates = members.map((m) => m.certificate);
  const entries: PassportEntry[] = members.map((m) => { const certHash = String(m.certificate?.payloadHash ?? ""); const res = (() => { try { return opts.verify(m.kind, m.certificate); } catch (e) { return { ok: false, reason: "verify threw: " + (e as Error).message.slice(0, 50) }; } })(); return { kind: String(m.kind), certHash, standard: String(m.certificate?.standard ?? "unknown"), ok: !!res.ok, reason: res.reason.slice(0, 120) }; });
  const merkle = merkleRoot(entries);
  const overallVerified = entries.length > 0 && entries.every((e) => e.ok);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const body = { standard: "melete-trust-passport/v1" as const, issuer: String(opts.issuer ?? "issuer"), subject: String(opts.subject ?? "subject"), n: entries.length, entries, merkleRoot: merkle, overallVerified };
  const payloadHash = createHash("sha256").update(canonical(body)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...body, certificates, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyTrustPassport(p: TrustPassport, verify: VerifyFn): { ok: boolean; reason: string } {
  try {
    if (p.standard !== "melete-trust-passport/v1") return { ok: false, reason: "unknown standard" };
    if (!Array.isArray(p.entries) || !Array.isArray(p.certificates) || p.entries.length !== p.n || p.certificates.length !== p.n) return { ok: false, reason: "member count mismatch" };
    // re-derive every member: (a) the embedded cert binds to the manifest hash, (b) it re-verifies for its kind
    for (let i = 0; i < p.entries.length; i++) {
      const e = p.entries[i], cert = p.certificates[i];
      if (String(cert?.payloadHash ?? "") !== e.certHash) return { ok: false, reason: `member ${i} (${e.kind}) certificate does not match its manifest hash — swapped/altered` };
      const res = (() => { try { return verify(e.kind, cert); } catch (ex) { return { ok: false, reason: "verify threw" }; } })();
      if (res.ok !== e.ok) return { ok: false, reason: `member ${i} (${e.kind}) re-derived ${res.ok ? "ok" : "FAIL"} ≠ manifest ${e.ok ? "ok" : "FAIL"}` };
    }
    const merkle = merkleRoot(p.entries);
    if (merkle !== p.merkleRoot) return { ok: false, reason: "merkle root mismatch — the member set was altered" };
    const overall = p.entries.length > 0 && p.entries.every((e) => e.ok);
    if (overall !== p.overallVerified) return { ok: false, reason: `recomputed overall ${overall} ≠ passport ${p.overallVerified} — a failing member was hidden` };
    const payloadHash = createHash("sha256").update(canonical({ standard: p.standard, issuer: p.issuer, subject: p.subject, n: p.n, entries: p.entries, merkleRoot: p.merkleRoot, overallVerified: p.overallVerified })).digest("hex");
    if (payloadHash !== p.payloadHash) return { ok: false, reason: "passport payload hash mismatch — manifest altered" };
    if (!edVerify(null, Buffer.from(p.payloadHash), createPublicKey(p.publicKeyPem), Buffer.from(p.signature, "base64"))) return { ok: false, reason: "bad issuer signature" };
    const failed = p.entries.filter((e) => !e.ok).map((e) => e.kind);
    return { ok: true, reason: `${p.overallVerified ? "ALL-VERIFIED" : "INCOMPLETE"}: ${p.n} certificates [${p.entries.map((e) => e.kind).join(", ")}]${failed.length ? " — failing: " + failed.join(", ") : ""}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function passportGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // real members from leaf modules (no import cycle: leaves don't import passport) + a local kind dispatch
  const verify: VerifyFn = (kind, c) => kind === "fairness" ? verifyFairnessCertificate(c) : kind === "calibration" ? verifyCalibrationCertificate(c) : kind === "attribution" ? verifyAttributionCertificate(c) : { ok: false, reason: "unknown kind" };

  // build 3 genuine member certificates
  const N = 600; const det = (s: number) => { let x = (s >>> 0) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return (x + 0.5) / 4294967296; }; };
  const fg = det(7); const pred: number[] = [], grp: string[] = []; for (let i = 0; i < N; i++) { grp.push(i < N / 2 ? "A" : "B"); pred.push(fg() < 0.5 ? 1 : 0); }
  const fairCert = fairnessCertificate({ predictions: pred, groupOf: grp, tolerance: 0.1 });
  const cg = det(11); const cp: number[] = [], cy: number[] = []; for (let i = 0; i < 1000; i++) { const q = cg(); cp.push(q); cy.push(cg() < q ? 1 : 0); }
  const calCert = calibrationCertificate({ predictions: cp, outcomes: cy });
  const attrCert = attributionCertificate({ n: 5, value: (p: boolean[]) => { let v = 0; for (let i = 0; i < 5; i++) if (p[i]) v += (i + 1) * 0.3; return v; } });
  const members = [{ kind: "fairness", certificate: fairCert }, { kind: "calibration", certificate: calCert }, { kind: "attribution", certificate: attrCert }];

  const kp = generateKeyPairSync("ed25519");
  const passport = trustPassport({ issuer: "VendorAI", subject: "credit-model-v3", members, verify, keys: kp });
  const composes = passport.n === 3 && passport.overallVerified === true;
  const oneCall = verifyTrustPassport(passport, verify).ok;
  // CATCHES-BAD-MEMBER: tamper one embedded cert ⇒ rejected (hash no longer binds)
  const tampered = JSON.parse(JSON.stringify(passport)); tampered.certificates[1].predictions = (tampered.certificates[1].predictions || []).slice();
  // force a real change: flip an outcome in the calibration cert
  if (tampered.certificates[1].outcomes && tampered.certificates[1].outcomes.length) tampered.certificates[1].outcomes[0] = 1 - tampered.certificates[1].outcomes[0];
  const badMemberCaught = !verifyTrustPassport(tampered, verify).ok;
  // BINDING: replace a member cert with a different valid cert (hash won't match manifest)
  const swapped = JSON.parse(JSON.stringify(passport)); swapped.certificates[0] = JSON.parse(JSON.stringify(attrCert));
  const bindingCaught = !verifyTrustPassport(swapped, verify).ok;
  // FORGERY: a member actually fails but the passport claims overallVerified true
  const failMember = attributionCertificate({ n: 4, value: (p: boolean[]) => { let v = 0; for (let i = 0; i < 4; i++) if (p[i]) v += 1; return v; } });
  const failMemberBroken = { ...failMember, efficiencyResidual: failMember.efficiencyResidual + 1, axiomsHold: false }; // a cert that will verify=false
  const pBad = trustPassport({ issuer: "X", subject: "y", members: [{ kind: "attribution", certificate: failMemberBroken }], verify, keys: kp });
  const honestIncomplete = pBad.overallVerified === false && verifyTrustPassport(pBad, verify).ok; // honestly reports incomplete + still a valid (signed) passport
  const forgedAllGood = { ...pBad }; forgedAllGood.entries = pBad.entries.map((e) => ({ ...e, ok: true })); forgedAllGood.overallVerified = true;
  const forgeryCaught = !verifyTrustPassport(forgedAllGood, verify).ok;
  // merkle order-independence
  const rev = trustPassport({ issuer: "VendorAI", subject: "credit-model-v3", members: members.slice().reverse(), verify, keys: kp });
  const orderIndependent = rev.merkleRoot === passport.merkleRoot;
  // TWO-PARTY: the passport is a signed cert, so the Verification Receipt counter-signs it
  const receipt = issueVerificationReceipt({ cert: passport as any, certStandard: passport.standard, verify: (c: any) => verifyTrustPassport(c, verify) });
  const twoParty = receipt.verifierVerdict === "VERIFIED" && verifyVerificationReceipt({ receipt, cert: passport as any, verify: (c: any) => verifyTrustPassport(c, verify) }).ok && receipt.independent;
  const tamper = !verifyTrustPassport({ ...passport, overallVerified: false }, verify).ok;
  const d1 = trustPassport({ issuer: "VendorAI", subject: "m", members, verify, keys: kp }), d2 = trustPassport({ issuer: "VendorAI", subject: "m", members, verify, keys: kp });
  const deterministic = d1.payloadHash === d2.payloadHash && verifyTrustPassport(d1, verify).ok;
  let total = true; try { trustPassport({ members: [], verify }); verifyTrustPassport({} as TrustPassport, verify); trustPassport({ members: [{ kind: "nope", certificate: {} as any }], verify }); } catch { total = false; }

  const checks = [
    { name: "COMPOSES-MANY", pass: composes, detail: "one passport binds 3 different certificate kinds (fairness + calibration + attribution) and reports an overall verdict" },
    { name: "ONE-CALL-VERIFY", pass: oneCall, detail: "a single verifyTrustPassport re-derives every member, the merkle root, and the issuer signature — offline" },
    { name: "CATCHES-BAD-MEMBER", pass: badMemberCaught, detail: "tampering any embedded member certificate breaks its hash binding and the passport is rejected" },
    { name: "BINDING (no swap)", pass: bindingCaught, detail: "swapping a member for a different (even valid) certificate fails the manifest-hash binding" },
    { name: "HONEST-INCOMPLETE", pass: honestIncomplete, detail: "a passport with a failing member honestly reports overallVerified=false and still verifies as a signed artifact (names the failing kind)" },
    { name: "FORGERY-CAUGHT (fake all-verified)", pass: forgeryCaught, detail: "claiming overallVerified=true while a member fails is rejected on re-derivation" },
    { name: "MERKLE-ORDER-INDEPENDENT", pass: orderIndependent, detail: "the member set's merkle root is independent of member order — a stable identity for the bundle" },
    { name: "TWO-PARTY (receipt over passport)", pass: twoParty, detail: "the passport is itself a signed cert, so a verifier independently counter-signs it with a Verification Receipt (issuer ↔ verifier)" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering the manifest (e.g. flipping overallVerified) breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same members + key → byte-identical passport" },
    { name: "TOTAL", pass: total, detail: "empty / unknown-kind / malformed members never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
