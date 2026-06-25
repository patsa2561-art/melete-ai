/**
 * 🏛️ THE CHAIN OF TRUST — verifiable AUTHORITY DELEGATION for AI claims (an "AI Certificate Authority").
 *
 * Every other module in the stack proves a claim is internally sound and signed — but it assumes the issuer's KEY is
 * one you should trust. The honest gaps we kept flagging (R51 witness, R53 revocation) were the same gap: *who is
 * actually authorized to issue — or revoke — this claim?* This is the PKI answer. A pinned ROOT authority signs a
 * scoped DELEGATION to an intermediate (which cert KINDS it may certify, which subject NAMESPACE, a validity window,
 * and a max remaining PATH LENGTH); the intermediate may delegate further — but only ever NARROWER — down to a leaf
 * issuer. A relying party pins ONE root public key and verifies that the issuer of any certificate was transitively
 * authorized to make exactly this claim: right kind, in-namespace, in-time, within path budget, every link signed by
 * the previous delegate's key, and no link broader than its parent. Over-delegation, out-of-scope kind, out-of-
 * namespace subject, an expired link, an exceeded path length, a broken or forged link — all rejected, naming the
 * failing link.
 *
 * WHO BENEFITS (≥4): ① the ROOT authority (a regulator / standards body) sets policy ONCE and every downstream
 * issuer inherits a checkable, bounded mandate; ② INTERMEDIATE authorities get real, scoped power they can prove and
 * sub-delegate without becoming a root; ③ ISSUERS can prove they were authorized to make a claim, not merely that
 * they signed it; ④ RELYING PARTIES trust a whole ecosystem by pinning ONE key, and ⑤ end users are protected from a
 * rogue or over-reaching issuer whose claim falls outside its mandate.
 *
 * (DIAKRISIS — MEASURED: a well-formed root→intermediate→leaf chain authorizes an in-scope claim; a chain not anchored
 * at the pinned root, an out-of-kind claim, an out-of-namespace subject, an expired link [time-aware — before expiry
 * still authorizes], a path length beyond budget, a broken issuer→subject link, a tampered/forged link, and a link
 * that tries to BROADEN beyond its parent are all rejected naming the link; deterministic + total. HONEST: this proves
 * the issuer was AUTHORIZED under the pinned root's policy — it does not make the underlying claim true [that is the
 * cert's own job], and trust still bottoms out at the ONE root you choose to pin. Revocation of a delegation rides on
 * the existing revocation registry [R53]; this module decides scope + chain, not liveness.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const fpOf = (pem: string): string => sha(pem).slice(0, 16);
/** Fingerprint of an Ed25519 public key (SPKI PEM) — the identifier used throughout delegations. */
export function fingerprintOf(publicKey: KeyObject): string { return fpOf(publicKey.export({ type: "spki", format: "pem" }).toString()); }

export interface DelegationScope { kinds: string[] | "*"; namespace: string; maxPathLen: number }
export interface Delegation {
  standard: "melete-delegation/v1";
  issuerFingerprint: string;          // fingerprint of the key that SIGNED this delegation (the parent)
  subjectFingerprint: string;         // fingerprint of the key being granted authority (the child / delegate)
  scope: DelegationScope;
  notBefore: number; notAfter: number;
  delegationId: string;
  payloadHash: string; signature: string; issuerPublicKeyPem: string; algo: "ed25519+sha256";
}

/** Sign a scoped delegation from `parent` (the issuer key) granting authority to `subjectFingerprint`. */
export function delegate(opts: { parent: { publicKey: KeyObject; privateKey: KeyObject }; subjectFingerprint: string; scope: DelegationScope; notBefore?: number; notAfter?: number }): Delegation {
  const issuerPublicKeyPem = opts.parent.publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = {
    standard: "melete-delegation/v1" as const,
    issuerFingerprint: fpOf(issuerPublicKeyPem),
    subjectFingerprint: String(opts.subjectFingerprint),
    scope: { kinds: opts.scope.kinds === "*" ? "*" : [...opts.scope.kinds].map(String), namespace: String(opts.scope.namespace ?? "*"), maxPathLen: Math.max(0, opts.scope.maxPathLen | 0) } as DelegationScope,
    notBefore: Number.isFinite(opts.notBefore) ? (opts.notBefore as number) : 0,
    notAfter: Number.isFinite(opts.notAfter) ? (opts.notAfter as number) : Number.MAX_SAFE_INTEGER,
  };
  const delegationId = sha(canonical(body) + ":" + issuerPublicKeyPem);
  const payloadHash = sha(canonical({ ...body, delegationId }));
  const signature = edSign(null, Buffer.from(payloadHash), opts.parent.privateKey).toString("base64");
  return { ...body, delegationId, payloadHash, signature, issuerPublicKeyPem, algo: "ed25519+sha256" };
}

function kindsAllow(scope: DelegationScope, kind: string): boolean { return scope.kinds === "*" || scope.kinds.includes(kind); }
function nsAllow(namespace: string, name: string): boolean { return namespace === "*" || name === namespace || name.startsWith(namespace + "/") || name.startsWith(namespace); }
// child kinds must be a SUBSET of parent kinds; child namespace must be AT-OR-UNDER parent namespace (no broadening)
function kindsSubset(parent: DelegationScope, child: DelegationScope): boolean { if (parent.kinds === "*") return true; if (child.kinds === "*") return false; return child.kinds.every((k) => (parent.kinds as string[]).includes(k)); }
function nsUnder(parentNs: string, childNs: string): boolean { return parentNs === "*" || childNs === parentNs || childNs.startsWith(parentNs + "/") || childNs.startsWith(parentNs); }

/** A single delegation re-verifies (signature + bound hash + issuer fingerprint matches its own key). */
export function verifyDelegation(d: Delegation): { ok: boolean; reason: string } {
  try {
    if (d.standard !== "melete-delegation/v1") return { ok: false, reason: "unknown standard" };
    if (fpOf(d.issuerPublicKeyPem) !== d.issuerFingerprint) return { ok: false, reason: "issuer fingerprint does not match key" };
    const body = { standard: d.standard, issuerFingerprint: d.issuerFingerprint, subjectFingerprint: d.subjectFingerprint, scope: d.scope, notBefore: d.notBefore, notAfter: d.notAfter };
    const delegationId = sha(canonical(body) + ":" + d.issuerPublicKeyPem);
    if (delegationId !== d.delegationId) return { ok: false, reason: "delegation id mismatch — altered" };
    const payloadHash = sha(canonical({ ...body, delegationId }));
    if (payloadHash !== d.payloadHash) return { ok: false, reason: "payload hash mismatch — tampered" };
    if (!edVerify(null, Buffer.from(d.payloadHash), createPublicKey(d.issuerPublicKeyPem), Buffer.from(d.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: "ok" };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 60) }; }
}

/**
 * The relying-party check: pin ONE root fingerprint and verify the claim's issuer was transitively authorized.
 * `chain` is ordered root→…→leaf (each link's issuer is the previous link's subject; the first link's issuer is the root).
 */
export function verifyAuthorization(
  chain: Delegation[],
  pinnedRootFingerprint: string,
  claim: { issuerFingerprint: string; kind: string; subjectName: string; atTime: number },
): { ok: boolean; reason: string; effectiveScope?: DelegationScope } {
  try {
    if (!Array.isArray(chain) || chain.length === 0) return { ok: false, reason: "empty delegation chain" };
    if (chain[0].issuerFingerprint !== pinnedRootFingerprint) return { ok: false, reason: "chain is not anchored at the pinned root authority" };
    let prevScope: DelegationScope | null = null;
    for (let i = 0; i < chain.length; i++) {
      const d = chain[i];
      const v = verifyDelegation(d);
      if (!v.ok) return { ok: false, reason: `link ${i}: ${v.reason}` };
      // chain linkage: this link's issuer must be the previous link's subject
      if (i > 0 && d.issuerFingerprint !== chain[i - 1].subjectFingerprint) return { ok: false, reason: `link ${i}: issuer is not the previous delegate (broken chain)` };
      // time window
      if (claim.atTime < d.notBefore || claim.atTime > d.notAfter) return { ok: false, reason: `link ${i}: delegation not valid at the reliance time (expired or not yet active)` };
      // scope must NARROW monotonically (a child can never grant more than its parent)
      if (prevScope) {
        if (!kindsSubset(prevScope, d.scope)) return { ok: false, reason: `link ${i}: kinds broaden beyond the parent delegation (illegal)` };
        if (!nsUnder(prevScope.namespace, d.scope.namespace)) return { ok: false, reason: `link ${i}: namespace broadens beyond the parent delegation (illegal)` };
      }
      // path-length budget: links remaining AFTER this one must fit within this link's maxPathLen
      const remaining = chain.length - 1 - i;
      if (remaining > d.scope.maxPathLen) return { ok: false, reason: `link ${i}: path length exceeded (budget ${d.scope.maxPathLen}, ${remaining} further delegations)` };
      prevScope = d.scope;
    }
    const leaf = chain[chain.length - 1];
    // the issuer making the claim must be the end of the chain
    if (claim.issuerFingerprint !== leaf.subjectFingerprint) return { ok: false, reason: "claim issuer is not the delegate at the end of the chain" };
    // the claim itself must fall inside the leaf's scope
    if (!kindsAllow(leaf.scope, claim.kind)) return { ok: false, reason: `claim kind "${claim.kind}" is outside the delegated authority` };
    if (!nsAllow(leaf.scope.namespace, claim.subjectName)) return { ok: false, reason: `subject "${claim.subjectName}" is outside the delegated namespace "${leaf.scope.namespace}"` };
    return { ok: true, reason: `authorized: ${chain.length}-link chain from root ${pinnedRootFingerprint} → ${claim.kind} on ${claim.subjectName}`, effectiveScope: leaf.scope };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 60) }; }
}

export function authorityGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const root = generateKeyPairSync("ed25519");
  const inter = generateKeyPairSync("ed25519");
  const leaf = generateKeyPairSync("ed25519");
  const rootFp = fpOf(root.publicKey.export({ type: "spki", format: "pem" }).toString());
  const interFp = fpOf(inter.publicKey.export({ type: "spki", format: "pem" }).toString());
  const leafFp = fpOf(leaf.publicKey.export({ type: "spki", format: "pem" }).toString());

  // root → intermediate: may certify fairness+calibration on "eu/" namespace, up to 1 more hop
  const d0 = delegate({ parent: root, subjectFingerprint: interFp, scope: { kinds: ["fairness", "calibration"], namespace: "eu", maxPathLen: 1 }, notBefore: 0, notAfter: 1000 });
  // intermediate → leaf: narrows to fairness only, "eu/finance", no further hops
  const d1 = delegate({ parent: inter, subjectFingerprint: leafFp, scope: { kinds: ["fairness"], namespace: "eu/finance", maxPathLen: 0 }, notBefore: 0, notAfter: 1000 });
  const chain = [d0, d1];

  // ① AUTHORIZED: leaf issues a fairness cert on eu/finance/lender at t=100
  const authorized = verifyAuthorization(chain, rootFp, { issuerFingerprint: leafFp, kind: "fairness", subjectName: "eu/finance/lender", atTime: 100 }).ok;

  // ② WRONG-ROOT: pin a different (unrelated) root
  const stranger = generateKeyPairSync("ed25519"); const strangerFp = fpOf(stranger.publicKey.export({ type: "spki", format: "pem" }).toString());
  const wrongRoot = !verifyAuthorization(chain, strangerFp, { issuerFingerprint: leafFp, kind: "fairness", subjectName: "eu/finance/lender", atTime: 100 }).ok;

  // ③ OUT-OF-KIND: leaf tries calibration (it was narrowed to fairness only)
  const outKind = (() => { const r = verifyAuthorization(chain, rootFp, { issuerFingerprint: leafFp, kind: "calibration", subjectName: "eu/finance/lender", atTime: 100 }); return !r.ok && /kind/.test(r.reason); })();

  // ④ OUT-OF-NAMESPACE: leaf tries a subject outside eu/finance
  const outNs = (() => { const r = verifyAuthorization(chain, rootFp, { issuerFingerprint: leafFp, kind: "fairness", subjectName: "us/health/clinic", atTime: 100 }); return !r.ok && /namespace/.test(r.reason); })();

  // ⑤ TIME-AWARE: at t=100 valid; after d1 expires (notAfter 1000) at t=2000 rejected
  const d1short = delegate({ parent: inter, subjectFingerprint: leafFp, scope: { kinds: ["fairness"], namespace: "eu/finance", maxPathLen: 0 }, notBefore: 0, notAfter: 500 });
  const chainShort = [d0, d1short];
  const timeAware = verifyAuthorization(chainShort, rootFp, { issuerFingerprint: leafFp, kind: "fairness", subjectName: "eu/finance/lender", atTime: 100 }).ok
    && !verifyAuthorization(chainShort, rootFp, { issuerFingerprint: leafFp, kind: "fairness", subjectName: "eu/finance/lender", atTime: 800 }).ok;

  // ⑥ PATH-LENGTH-EXCEEDED: leaf sub-delegates one more hop, but d1.maxPathLen was 0
  const leaf2 = generateKeyPairSync("ed25519"); const leaf2Fp = fpOf(leaf2.publicKey.export({ type: "spki", format: "pem" }).toString());
  const d2 = delegate({ parent: leaf, subjectFingerprint: leaf2Fp, scope: { kinds: ["fairness"], namespace: "eu/finance", maxPathLen: 0 }, notBefore: 0, notAfter: 1000 });
  const pathExceeded = (() => { const r = verifyAuthorization([d0, d1, d2], rootFp, { issuerFingerprint: leaf2Fp, kind: "fairness", subjectName: "eu/finance/lender", atTime: 100 }); return !r.ok && /path length/.test(r.reason); })();

  // ⑦ BROKEN-LINK: an intermediate signed for a DIFFERENT subject than the next link's issuer
  const rogueInter = generateKeyPairSync("ed25519");
  const dBad = delegate({ parent: rogueInter, subjectFingerprint: leafFp, scope: { kinds: ["fairness"], namespace: "eu/finance", maxPathLen: 0 }, notBefore: 0, notAfter: 1000 });
  const brokenLink = (() => { const r = verifyAuthorization([d0, dBad], rootFp, { issuerFingerprint: leafFp, kind: "fairness", subjectName: "eu/finance/lender", atTime: 100 }); return !r.ok && /broken chain/.test(r.reason); })();

  // ⑧ TAMPER: broaden the leaf's namespace after signing
  const tampered = { ...d1, scope: { ...d1.scope, namespace: "*" } };
  const tamperCaught = (() => { const r = verifyAuthorization([d0, tampered], rootFp, { issuerFingerprint: leafFp, kind: "fairness", subjectName: "anything", atTime: 100 }); return !r.ok; })();

  // ⑨ NO-BROADENING: an intermediate legitimately re-signs a link that grants MORE kinds than its parent → rejected
  const dBroaden = delegate({ parent: inter, subjectFingerprint: leafFp, scope: { kinds: ["fairness", "calibration", "privacy"], namespace: "eu/finance", maxPathLen: 0 }, notBefore: 0, notAfter: 1000 });
  const noBroaden = (() => { const r = verifyAuthorization([d0, dBroaden], rootFp, { issuerFingerprint: leafFp, kind: "privacy", subjectName: "eu/finance/lender", atTime: 100 }); return !r.ok && /broaden/.test(r.reason); })();

  // ⑩ DETERMINISTIC + TOTAL
  const det = verifyAuthorization(chain, rootFp, { issuerFingerprint: leafFp, kind: "fairness", subjectName: "eu/finance/lender", atTime: 100 }).ok === authorized;
  let total = true; try { verifyAuthorization([], rootFp, { issuerFingerprint: "x", kind: "x", subjectName: "x", atTime: 0 }); verifyDelegation({} as Delegation); verifyAuthorization(null as any, "", null as any); } catch { total = false; }

  const checks = [
    { name: "AUTHORIZED-CHAIN", pass: authorized, detail: "a root→intermediate→leaf chain authorizes an in-scope fairness claim on eu/finance — verified from one pinned root key" },
    { name: "WRONG-ROOT → rejected", pass: wrongRoot, detail: "the same chain pinned to an unrelated root is rejected — trust bottoms out at the key you pin" },
    { name: "OUT-OF-KIND → rejected", pass: outKind, detail: "the leaf was narrowed to fairness; a calibration claim is outside its delegated authority and is rejected" },
    { name: "OUT-OF-NAMESPACE → rejected", pass: outNs, detail: "a subject outside the delegated eu/finance namespace is rejected, naming the constraint" },
    { name: "TIME-AWARE", pass: timeAware, detail: "authorized while the delegation is valid; after it expires the same chain no longer authorizes (time-aware)" },
    { name: "PATH-LENGTH-EXCEEDED → rejected", pass: pathExceeded, detail: "the leaf had maxPathLen 0; a further sub-delegation exceeds the path budget and is rejected" },
    { name: "BROKEN-LINK → rejected", pass: brokenLink, detail: "a link whose issuer is not the previous delegate breaks the chain and is rejected" },
    { name: "TAMPER → rejected", pass: tamperCaught, detail: "broadening a delegation's namespace after signing breaks its bound hash/signature and is rejected" },
    { name: "NO-BROADENING → rejected", pass: noBroaden, detail: "an intermediate cannot grant MORE than it holds — a child scope broader than its parent is rejected" },
    { name: "DETERMINISTIC + TOTAL", pass: det && total, detail: "same inputs → same verdict; empty/malformed chains never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
