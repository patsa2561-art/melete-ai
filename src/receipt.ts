/**
 * 🤝 THE VERIFICATION RECEIPT — turn any one-way Melete certificate into a TWO-PARTY trust record.
 *
 * Every certificate in the stack is a one-way proof: an ISSUER (an AI vendor, a bank, a deployer) signs a property
 * about their own system. But trust is two-sided — the people who need that proof are a VERIFIER (a regulator, an
 * auditor, a customer, a counterparty agent), and today they have no signed record that they independently checked
 * it. This closes the loop: the verifier re-derives the issuer's certificate OFFLINE (no trust in the issuer), then
 * signs a Verification Receipt binding their own verdict to the exact certificate hash with their OWN key. Now BOTH
 * sides hold a cryptographic artifact — the issuer proved it, the verifier confirmed it — and anyone can check the
 * whole two-party chain offline. It is independence-checked (issuer key ≠ verifier key) so a vendor cannot
 * rubber-stamp itself, and it works across EVERY certificate kind in the stack.
 *
 * WHO BENEFITS (≥2 parties, by design): ① the ISSUER gets a portable, counter-signed attestation that a named third
 * party verified their claim — worth more than a self-signed cert to a buyer/regulator; ② the VERIFIER gets an
 * offline-checkable record that protects them (they can prove WHAT they verified and WHEN, and that it wasn't
 * tampered since). Neither has to trust the other; the signatures + re-derivation do the work.
 *
 * (DIAKRISIS — MEASURED: a receipt over a genuine certificate verifies; the receipt is BOUND to that exact
 * certificate [pairing it with a different cert is rejected]; a tampered/forged certificate yields a REJECTED
 * verdict, and a forged "VERIFIED" receipt over a bad certificate is caught on re-derivation; issuer≠verifier
 * independence is enforced; it works across multiple certificate kinds. HONEST: the receipt attests that the
 * verifier re-ran the SAME deterministic offline check the certificate already supports — it inherits that check's
 * scope, it does not add new statistical power; "independent" means a different key, not a different methodology.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
function fingerprint(pubkeyPem: string): string { return createHash("sha256").update((pubkeyPem || "").trim()).digest("hex").slice(0, 16); }

// the minimal shape every Melete certificate shares
interface SignedCert { standard: string; payloadHash: string; signature: string; publicKeyPem: string; [k: string]: unknown }
type VerifyFn = (cert: any) => { ok: boolean; reason: string };

export interface VerificationReceipt {
  standard: "melete-verification-receipt/v1";
  certStandard: string;            // the kind of certificate that was verified
  certHash: string;                // the issuer certificate's payloadHash — the binding
  issuerFingerprint: string;       // sha256(issuer public key) — party ①
  verifierFingerprint: string;     // sha256(verifier public key) — party ②
  independent: boolean;            // issuer key ≠ verifier key (a vendor can't rubber-stamp itself)
  verifierVerdict: "VERIFIED" | "REJECTED";
  reason: string;
  verifiedAt: number;              // ms epoch (caller-supplied for determinism in tests)
  payloadHash: string;
  signature: string;               // the VERIFIER's signature over payloadHash
  publicKeyPem: string;            // the verifier's public key
  algo: "ed25519+sha256";
}

// the verifier independently re-derives the issuer cert, then signs a receipt binding their verdict to its hash.
export function issueVerificationReceipt(opts: { cert: SignedCert; certStandard?: string; verify: VerifyFn; verifierKeys?: { publicKey: KeyObject; privateKey: KeyObject }; verifiedAt?: number }): VerificationReceipt {
  const cert = opts.cert; const certStandard = opts.certStandard ?? (cert?.standard ?? "unknown");
  const res = (() => { try { return opts.verify(cert); } catch (e) { return { ok: false, reason: "verify threw: " + (e as Error).message.slice(0, 60) }; } })();
  const kp = opts.verifierKeys ?? generateKeyPairSync("ed25519");
  const verifierPem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  const issuerFingerprint = fingerprint(cert?.publicKeyPem ?? "");
  const verifierFingerprint = fingerprint(verifierPem);
  const independent = issuerFingerprint !== verifierFingerprint && issuerFingerprint.length > 0;
  const body = {
    standard: "melete-verification-receipt/v1" as const, certStandard,
    certHash: String(cert?.payloadHash ?? ""), issuerFingerprint, verifierFingerprint, independent,
    verifierVerdict: (res.ok ? "VERIFIED" : "REJECTED") as VerificationReceipt["verifierVerdict"],
    reason: res.reason.slice(0, 160), verifiedAt: opts.verifiedAt ?? Date.now(),
  };
  const payloadHash = createHash("sha256").update(canonical(body)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...body, payloadHash, signature, publicKeyPem: verifierPem, algo: "ed25519+sha256" };
}

// check the WHOLE two-party chain offline: (a) the verifier's signature on the receipt, (b) the receipt is bound to
// the supplied certificate (hash match), (c) re-derive the issuer certificate with `verify` and confirm the receipt's
// verdict is truthful, (d) independence. Pass the same kind-specific `verify` the receipt was issued with.
export function verifyVerificationReceipt(opts: { receipt: VerificationReceipt; cert: SignedCert; verify: VerifyFn }): { ok: boolean; reason: string } {
  try {
    const r = opts.receipt, cert = opts.cert;
    if (r.standard !== "melete-verification-receipt/v1") return { ok: false, reason: "unknown receipt standard" };
    // (a) the verifier's signature must hold over the receipt body
    const body = { standard: r.standard, certStandard: r.certStandard, certHash: r.certHash, issuerFingerprint: r.issuerFingerprint, verifierFingerprint: r.verifierFingerprint, independent: r.independent, verifierVerdict: r.verifierVerdict, reason: r.reason, verifiedAt: r.verifiedAt };
    const payloadHash = createHash("sha256").update(canonical(body)).digest("hex");
    if (payloadHash !== r.payloadHash) return { ok: false, reason: "receipt payload hash mismatch — the receipt was altered" };
    const vpub = createPublicKey(r.publicKeyPem);
    if (!edVerify(null, Buffer.from(r.payloadHash), vpub, Buffer.from(r.signature, "base64"))) return { ok: false, reason: "bad verifier signature" };
    // (b) the receipt must be BOUND to this exact certificate
    if (r.certHash !== String(cert?.payloadHash ?? "")) return { ok: false, reason: "receipt is not bound to this certificate (hash differs)" };
    if (fingerprint(r.publicKeyPem) !== r.verifierFingerprint) return { ok: false, reason: "verifier fingerprint inconsistent with the receipt key" };
    if (fingerprint(cert?.publicKeyPem ?? "") !== r.issuerFingerprint) return { ok: false, reason: "issuer fingerprint inconsistent with the certificate" };
    // (c) re-derive the issuer certificate and confirm the receipt told the truth about it
    const res = (() => { try { return opts.verify(cert); } catch (e) { return { ok: false, reason: "verify threw: " + (e as Error).message.slice(0, 60) }; } })();
    const truthful = (res.ok ? "VERIFIED" : "REJECTED") === r.verifierVerdict;
    if (!truthful) return { ok: false, reason: `receipt claims ${r.verifierVerdict} but re-derivation says ${res.ok ? "VERIFIED" : "REJECTED"}` };
    // (d) independence + the receipt must attest a real VERIFIED result to be a useful two-party proof
    const independent = r.issuerFingerprint !== r.verifierFingerprint && r.issuerFingerprint.length > 0;
    if (independent !== r.independent) return { ok: false, reason: "independence flag inconsistent" };
    if (r.verifierVerdict !== "VERIFIED") return { ok: false, reason: "receipt records a REJECTED certificate — not a positive two-party attestation" };
    if (!r.independent) return { ok: false, reason: "issuer and verifier are the same key — not an independent attestation" };
    return { ok: true, reason: `two-party: issuer ${r.issuerFingerprint} proved ${r.certStandard}, verifier ${r.verifierFingerprint} confirmed VERIFIED (independent)` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

function det(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }

export function receiptGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // two self-contained toy "certificates" with the shared signed shape, each with its own verifier — proving the
  // receipt is cert-kind-agnostic without importing the whole stack (avoids an import cycle through index).
  const makeCert = (payload: Record<string, unknown>, keys?: { publicKey: KeyObject; privateKey: KeyObject }) => {
    const kp = keys ?? generateKeyPairSync("ed25519");
    const payloadHash = createHash("sha256").update(canonical(payload)).digest("hex");
    const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
    return { standard: String(payload.standard), payload, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString() } as SignedCert & { payload: Record<string, unknown> };
  };
  const verifyA: VerifyFn = (c: any) => { const h = createHash("sha256").update(canonical(c.payload)).digest("hex"); if (h !== c.payloadHash) return { ok: false, reason: "hash" }; try { return edVerify(null, Buffer.from(c.payloadHash), createPublicKey(c.publicKeyPem), Buffer.from(c.signature, "base64")) ? { ok: true, reason: "ok" } : { ok: false, reason: "sig" }; } catch { return { ok: false, reason: "ex" }; } };

  const issuerKeys = generateKeyPairSync("ed25519");
  const certX = makeCert({ standard: "melete-toy-X/v1", verdict: "PASS", value: 42 }, issuerKeys);
  const certY = makeCert({ standard: "melete-toy-Y/v1", verdict: "FAIR", gap: 0.01 });
  const vk = generateKeyPairSync("ed25519");
  const rX = issueVerificationReceipt({ cert: certX, verify: verifyA, verifierKeys: vk, verifiedAt: 1000 });

  const receiptVerifies = verifyVerificationReceipt({ receipt: rX, cert: certX, verify: verifyA }).ok && rX.verifierVerdict === "VERIFIED";
  // BINDS-TO-CERT: the same receipt paired with a different cert is rejected
  const bindsToCert = !verifyVerificationReceipt({ receipt: rX, cert: certY, verify: verifyA }).ok;
  // CATCHES-BAD-CERT: a tampered cert ⇒ verifier issues REJECTED; a forged "VERIFIED" over it is caught
  const tampered = { ...certX, payload: { ...(certX as any).payload, value: 999 } } as any;
  const rTamper = issueVerificationReceipt({ cert: tampered, verify: verifyA, verifierKeys: vk, verifiedAt: 1001 });
  const forgedPositive = { ...rTamper, verifierVerdict: "VERIFIED" as const };
  const catchesBad = rTamper.verifierVerdict === "REJECTED" && !verifyVerificationReceipt({ receipt: forgedPositive, cert: tampered, verify: verifyA }).ok;
  // INDEPENDENCE: a self-issued receipt (verifier key == issuer key) is flagged not-independent and rejected
  const rSelf = issueVerificationReceipt({ cert: certX, verify: verifyA, verifierKeys: issuerKeys, verifiedAt: 1002 });
  const independence = rSelf.independent === false && !verifyVerificationReceipt({ receipt: rSelf, cert: certX, verify: verifyA }).ok && rX.independent === true;
  // TWO-PARTY-CHAIN: issuer sig (on cert) AND verifier sig (on receipt) both hold over the bound hash
  const issuerSigOk = verifyA(certX).ok; const verifierSigOk = (() => { try { return edVerify(null, Buffer.from(rX.payloadHash), createPublicKey(rX.publicKeyPem), Buffer.from(rX.signature, "base64")); } catch { return false; } })();
  const twoPartyChain = issuerSigOk && verifierSigOk && rX.certHash === certX.payloadHash && rX.issuerFingerprint !== rX.verifierFingerprint;
  // VERIFIER-SIG-TAMPER: editing the recorded verdict breaks the verifier signature
  const sigTamper = !verifyVerificationReceipt({ receipt: { ...rX, reason: "totally fine, trust me" }, cert: certX, verify: verifyA }).ok;
  // CROSS-KIND: a receipt over a different cert kind (Y) works the same
  const rY = issueVerificationReceipt({ cert: certY, verify: verifyA, verifierKeys: vk, verifiedAt: 1003 });
  const crossKind = verifyVerificationReceipt({ receipt: rY, cert: certY, verify: verifyA }).ok && rY.certStandard === "melete-toy-Y/v1";
  const r1 = issueVerificationReceipt({ cert: certX, verify: verifyA, verifierKeys: vk, verifiedAt: 2000 });
  const r2 = issueVerificationReceipt({ cert: certX, verify: verifyA, verifierKeys: vk, verifiedAt: 2000 });
  const deterministic = r1.payloadHash === r2.payloadHash && verifyVerificationReceipt({ receipt: r1, cert: certX, verify: verifyA }).ok;
  let total = true; try { issueVerificationReceipt({ cert: {} as any, verify: (() => { throw new Error("x"); }) as any, verifiedAt: 1 }); verifyVerificationReceipt({ receipt: {} as any, cert: {} as any, verify: verifyA }); } catch { total = false; }

  const checks = [
    { name: "RECEIPT-VERIFIES (two-party)", pass: receiptVerifies, detail: "a verifier independently re-derives a genuine certificate and signs a receipt that checks out offline — both parties now hold a signed record" },
    { name: "BOUND-TO-CERTIFICATE", pass: bindsToCert, detail: "the receipt is bound to one exact certificate by hash — pairing it with a different certificate is rejected" },
    { name: "CATCHES-BAD-CERTIFICATE", pass: catchesBad, detail: "a tampered certificate yields a REJECTED receipt, and a forged 'VERIFIED' receipt over it is caught on re-derivation" },
    { name: "INDEPENDENCE (no self-stamp)", pass: independence, detail: "a receipt where the verifier key equals the issuer key is flagged not-independent and rejected — a vendor cannot rubber-stamp itself" },
    { name: "TWO-PARTY-CHAIN", pass: twoPartyChain, detail: "both signatures hold over the bound hash — issuer over the certificate (party ①), verifier over the receipt (party ②)" },
    { name: "VERIFIER-SIG-TAMPER", pass: sigTamper, detail: "editing the receipt's recorded reason/verdict breaks the verifier's signature" },
    { name: "CROSS-KIND (any certificate)", pass: crossKind, detail: "the receipt is certificate-agnostic — it wraps any kind in the stack the same way" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same certificate + verifier key + timestamp → byte-identical receipt" },
    { name: "TOTAL", pass: total, detail: "malformed certificate / throwing verifier / empty receipt never crash" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
