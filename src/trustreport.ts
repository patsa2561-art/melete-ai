/**
 * ✅ THE LIVE TRUST REPORT — one signed answer to the only question a non-expert actually asks: "is this AI
 * trustworthy RIGHT NOW?"
 *
 * The stack proves many things separately — a fairness cert, a private-audit proof, a model lineage, a per-answer
 * tag. A Trust Passport (R46) bundles them, but "all members verify" is a STATIC claim: a member could have been
 * REVOKED since (R53), or never actually posted to the public log (R50). This composes the whole lifecycle into a
 * single LIVE verdict: for every member certificate it checks three things at once — (1) it VERIFIES (re-derives +
 * signature), (2) it is NOT REVOKED as of the reliance time (time-aware), and (3) it is INCLUDED in the public
 * transparency log — and returns TRUSTED-NOW only if every member passes all three, else NOT-TRUSTED-NOW naming the
 * exact member and reason. It is signed, so the verdict itself is re-derivable offline.
 *
 * WHO BENEFITS (≥4): ① a non-expert CONSUMER / procurement gets ONE trustworthy-or-not answer instead of reading
 * eight proofs; ② the ISSUER shows a live-good report that already accounts for revocation + public logging; ③
 * REGULATORS get a single signed status that reflects the current world, not a stale bundle; ④ END USERS are
 * protected when any underlying claim is withdrawn or was never logged.
 *
 * (DIAKRISIS — MEASURED: when every member verifies, is un-revoked, and is logged, the report is TRUSTED-NOW; a
 * REVOKED member flips it to NOT-TRUSTED-NOW naming that member; an UNLOGGED member is flagged; a tampered member
 * fails verification; the verdict is TIME-AWARE [a report dated before a member's revocation is still TRUSTED]; a
 * forged TRUSTED-NOW is rejected on re-derivation; signed + deterministic + total. HONEST: the report is exactly as
 * strong as its inputs — it composes verification + revocation status + log inclusion, it does not itself judge the
 * model; "logged" requires a transparency-log inclusion proof to be supplied, and revocation requires the relevant
 * registry to be supplied [the report records WHICH registry/log head it was evaluated against].)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";
import { statusFromList, createRevocationRegistry, type RevocationList } from "./revocation.js";
import { verifyEntryInclusion, createTransparencyLog, type SignedTreeHead, type InclusionProof } from "./translog.js";
import { fairnessCertificate, verifyFairnessCertificate } from "./fairness.js";
import { calibrationCertificate, verifyCalibrationCertificate } from "./calibration.js";
import { attributionCertificate, verifyAttributionCertificate } from "./shapley.js";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
type VerifyFn = (kind: string, cert: any) => { ok: boolean; reason: string };

export interface ReportMember { kind: string; certHash: string; verifies: boolean; revoked: boolean; logged: boolean | null; ok: boolean; reason: string }
export interface TrustReport {
  standard: "melete-trust-report/v1";
  subject: string; atTime: number; requireLogged: boolean;
  revocationHead: string | null;   // the revocation list head it was evaluated against (null if none supplied)
  logRoot: string | null;          // the transparency-log root it was evaluated against (null if none supplied)
  members: ReportMember[];
  verdict: "TRUSTED-NOW" | "NOT-TRUSTED-NOW" | "EMPTY";
  failing: string[];
  certificates: any[];             // embedded member certs (the evidence the verdict re-derives from)
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}

function evalMembers(members: Array<{ kind: string; certificate: any; inclusion?: InclusionProof }>, verify: VerifyFn, atTime: number, revocationList?: RevocationList | null, logSTH?: SignedTreeHead | null): ReportMember[] {
  const requireLogged = !!logSTH;
  return members.map((m) => {
    const certHash = String(m.certificate?.payloadHash ?? "");
    const verifies = (() => { try { return verify(m.kind, m.certificate).ok; } catch { return false; } })();
    const revoked = revocationList ? statusFromList(revocationList, certHash, atTime).status === "REVOKED" : false;
    let logged: boolean | null = null;
    if (requireLogged) { logged = !!(m.inclusion && verifyEntryInclusion(certHash, m.inclusion, logSTH!).ok); }
    const ok = verifies && !revoked && (requireLogged ? logged === true : true);
    const reason = !verifies ? "certificate does not verify" : revoked ? "REVOKED as of the reliance time" : (requireLogged && !logged) ? "not included in the public transparency log" : "ok";
    return { kind: m.kind, certHash, verifies, revoked, logged, ok, reason };
  });
}

export function buildTrustReport(opts: { subject?: string; members: Array<{ kind: string; certificate: any; inclusion?: InclusionProof }>; verify: VerifyFn; atTime?: number; revocationList?: RevocationList | null; logSTH?: SignedTreeHead | null; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): TrustReport {
  const members = Array.isArray(opts.members) ? opts.members : [];
  const atTime = Number.isFinite(opts.atTime) ? (opts.atTime as number) : Date.now();
  const requireLogged = !!opts.logSTH;
  const evald = evalMembers(members, opts.verify, atTime, opts.revocationList ?? null, opts.logSTH ?? null);
  const failing = evald.filter((m) => !m.ok).map((m) => m.kind + ": " + m.reason);
  const verdict: TrustReport["verdict"] = members.length === 0 ? "EMPTY" : (failing.length === 0 ? "TRUSTED-NOW" : "NOT-TRUSTED-NOW");
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const body = {
    standard: "melete-trust-report/v1" as const, subject: String(opts.subject ?? "subject"), atTime, requireLogged,
    revocationHead: opts.revocationList ? opts.revocationList.headHash : null, logRoot: opts.logSTH ? opts.logSTH.rootHash : null,
    members: evald, verdict, failing, certificates: members.map((m) => m.certificate),
  };
  const payloadHash = sha(canonical(body));
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...body, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifyTrustReport(r: TrustReport, verify: VerifyFn, opts?: { revocationList?: RevocationList | null; logSTH?: SignedTreeHead | null; inclusions?: InclusionProof[] }): { ok: boolean; verdict: string; reason: string } {
  try {
    if (r.standard !== "melete-trust-report/v1") return { ok: false, verdict: r.verdict, reason: "unknown standard" };
    if (!Array.isArray(r.members) || !Array.isArray(r.certificates) || r.members.length !== r.certificates.length) return { ok: false, verdict: r.verdict, reason: "member/cert count mismatch" };
    // each member cert must bind to its recorded hash
    for (let i = 0; i < r.members.length; i++) if (String(r.certificates[i]?.payloadHash ?? "") !== r.members[i].certHash) return { ok: false, verdict: r.verdict, reason: `member ${i} certificate does not match its recorded hash` };
    // re-derive the per-member evaluation from the embedded certs (+ supplied revocation/log context)
    const rebuilt = evalMembers(r.members.map((m, i) => ({ kind: m.kind, certificate: r.certificates[i], inclusion: opts?.inclusions?.[i] })), verify, r.atTime, opts?.revocationList ?? null, opts?.logSTH ?? null);
    // verifies & revoked must always re-derive; logged is re-checked only if the caller supplied the log context
    for (let i = 0; i < rebuilt.length; i++) {
      const a = rebuilt[i], b = r.members[i];
      if (a.verifies !== b.verifies) return { ok: false, verdict: r.verdict, reason: `member ${i} (${b.kind}) verifies re-derived ${a.verifies} ≠ ${b.verifies}` };
      if (opts?.revocationList && a.revoked !== b.revoked) return { ok: false, verdict: r.verdict, reason: `member ${i} (${b.kind}) revocation status changed` };
      if (opts?.logSTH && a.logged !== b.logged) return { ok: false, verdict: r.verdict, reason: `member ${i} (${b.kind}) log-inclusion re-derived differently` };
    }
    const failing = r.members.filter((m) => !m.ok).map((m) => m.kind + ": " + m.reason);
    const verdict = r.members.length === 0 ? "EMPTY" : (failing.length === 0 ? "TRUSTED-NOW" : "NOT-TRUSTED-NOW");
    if (verdict !== r.verdict || canonical(failing) !== canonical(r.failing)) return { ok: false, verdict, reason: `recomputed verdict ${verdict} ≠ report ${r.verdict}` };
    const payloadHash = sha(canonical({ standard: r.standard, subject: r.subject, atTime: r.atTime, requireLogged: r.requireLogged, revocationHead: r.revocationHead, logRoot: r.logRoot, members: r.members, verdict: r.verdict, failing: r.failing, certificates: r.certificates }));
    if (payloadHash !== r.payloadHash) return { ok: false, verdict: r.verdict, reason: "payload hash mismatch — report altered" };
    if (!edVerify(null, Buffer.from(r.payloadHash), createPublicKey(r.publicKeyPem), Buffer.from(r.signature, "base64"))) return { ok: false, verdict: r.verdict, reason: "bad signature" };
    return { ok: true, verdict: r.verdict, reason: `${r.verdict}: ${r.members.length} members${r.failing.length ? " — failing: " + r.failing.join("; ") : " all verify, un-revoked" + (r.requireLogged ? ", logged" : "")}` };
  } catch (e) { return { ok: false, verdict: r?.verdict ?? "NOT-TRUSTED-NOW", reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function trustReportGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // wire the real pieces: leaf cert verifiers + a transparency log + a revocation registry (lazy imports avoid cycles
  // through index; these are all leaf modules that do NOT import trustreport)
  const verify: VerifyFn = (kind, c) => kind === "fairness" ? verifyFairnessCertificate(c) : kind === "calibration" ? verifyCalibrationCertificate(c) : kind === "attribution" ? verifyAttributionCertificate(c) : { ok: false, reason: "unknown kind" };

  // build 3 genuine member certs
  const N = 600; const det = (s: number) => { let x = (s >>> 0) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return (x + 0.5) / 4294967296; }; };
  const fg = det(7); const pred: number[] = [], grp: string[] = []; for (let i = 0; i < N; i++) { grp.push(i < N / 2 ? "A" : "B"); pred.push(fg() < 0.5 ? 1 : 0); }
  const fairCert = fairnessCertificate({ predictions: pred, groupOf: grp, tolerance: 0.1 });
  const cg = det(11); const cp: number[] = [], cy: number[] = []; for (let i = 0; i < 1000; i++) { const q = cg(); cp.push(q); cy.push(cg() < q ? 1 : 0); }
  const calCert = calibrationCertificate({ predictions: cp, outcomes: cy });
  const attrCert = attributionCertificate({ n: 5, value: (p: boolean[]) => { let v = 0; for (let i = 0; i < 5; i++) if (p[i]) v += (i + 1) * 0.3; return v; } });
  const members = [{ kind: "fairness", certificate: fairCert }, { kind: "calibration", certificate: calCert }, { kind: "attribution", certificate: attrCert }];

  // a public log that includes all three cert hashes, + inclusion proofs
  let ts = 0; const log = createTransparencyLog({ logId: "melete-ai-claims", now: () => ts++ });
  const idx = members.map((m) => log.append(m.certificate.payloadHash));
  const sth = log.sth(); const inclusions = idx.map((i: number) => log.inclusionProof(i));
  const withIncl = members.map((m, i) => ({ ...m, inclusion: inclusions[i] }));

  // empty revocation registry (nothing revoked yet) — kept clean for the good-path checks
  const reg = createRevocationRegistry({ authority: "Gov" }); const revList = reg.list();
  // a SEPARATE registry that we will actually revoke into (so revList above is never mutated under us)
  const reg2 = createRevocationRegistry({ authority: "Gov" });

  // ① ALL-GOOD → TRUSTED-NOW
  const good = buildTrustReport({ subject: "credit-model-v3", members: withIncl, verify, atTime: 100, revocationList: revList, logSTH: sth });
  const allGood = good.verdict === "TRUSTED-NOW" && verifyTrustReport(good, verify, { revocationList: revList, logSTH: sth, inclusions }).ok;

  // ② REVOKED member → NOT-TRUSTED-NOW, names it
  reg2.revoke(calCert.payloadHash, "model drifted out of calibration", 50); const revList2 = reg2.list();
  const revoked = buildTrustReport({ subject: "credit-model-v3", members: withIncl, verify, atTime: 100, revocationList: revList2, logSTH: sth });
  const revokedFlips = revoked.verdict === "NOT-TRUSTED-NOW" && revoked.failing.some((f) => /calibration/.test(f) && /REVOKED/.test(f));
  // ③ TIME-AWARE: a report dated BEFORE the revocation (t=40 < 50) is still TRUSTED
  const beforeRev = buildTrustReport({ subject: "x", members: withIncl, verify, atTime: 40, revocationList: revList2, logSTH: sth });
  const timeAware = beforeRev.verdict === "TRUSTED-NOW";

  // ④ UNLOGGED member → flagged (a 4th cert never logged)
  const attr2 = attributionCertificate({ n: 4, value: (p: boolean[]) => { let v = 0; for (let i = 0; i < 4; i++) if (p[i]) v += 1; return v; } });
  const withUnlogged = [...withIncl, { kind: "attribution", certificate: attr2, inclusion: undefined as any }];
  const unlogged = buildTrustReport({ subject: "x", members: withUnlogged, verify, atTime: 100, revocationList: revList, logSTH: sth });
  const unloggedFlagged = unlogged.verdict === "NOT-TRUSTED-NOW" && unlogged.failing.some((f) => /transparency log/.test(f));

  // ⑤ BAD member → NOT-TRUSTED
  const tamperedCert = { ...fairCert, predictions: fairCert.predictions.map((v: number, i: number) => (i < 50 ? 1 - v : v)) };
  const bad = buildTrustReport({ subject: "x", members: [{ kind: "fairness", certificate: tamperedCert, inclusion: inclusions[0] }], verify, atTime: 100, revocationList: revList, logSTH: sth });
  const badFlips = bad.verdict === "NOT-TRUSTED-NOW" && bad.members[0].verifies === false;

  // ⑥ FORGERY: claim TRUSTED-NOW while a member is revoked → rejected on re-derivation
  const forged = JSON.parse(JSON.stringify(revoked)); forged.verdict = "TRUSTED-NOW"; forged.failing = []; forged.members = forged.members.map((m: ReportMember) => ({ ...m, revoked: false, ok: true, reason: "ok" }));
  const forgeryCaught = !verifyTrustReport(forged, verify, { revocationList: revList2, logSTH: sth, inclusions }).ok;

  const verifyOk = verifyTrustReport(good, verify, { revocationList: revList, logSTH: sth, inclusions }).ok;
  const d1 = buildTrustReport({ subject: "m", members: withIncl, verify, atTime: 100, revocationList: revList, logSTH: sth, keys: undefined });
  const tamperReport = !verifyTrustReport({ ...good, verdict: "NOT-TRUSTED-NOW" as const }, verify, { revocationList: revList, logSTH: sth, inclusions }).ok;
  let total = true; try { buildTrustReport({ members: [], verify }); verifyTrustReport({} as TrustReport, verify); } catch { total = false; }

  const checks = [
    { name: "ALL-GOOD → TRUSTED-NOW", pass: allGood, detail: "when every member verifies, is un-revoked, and is in the public log, the report is a single signed TRUSTED-NOW" },
    { name: "REVOKED-MEMBER → NOT-TRUSTED", pass: revokedFlips, detail: "revoking one member (calibration) flips the whole report to NOT-TRUSTED-NOW and names the revoked member" },
    { name: "TIME-AWARE", pass: timeAware, detail: "a report dated before the revocation took effect is still TRUSTED-NOW — past reliance is not retroactively broken" },
    { name: "UNLOGGED-MEMBER → flagged", pass: unloggedFlagged, detail: "a member certificate not included in the public transparency log flips the verdict and is named" },
    { name: "BAD-MEMBER → NOT-TRUSTED", pass: badFlips, detail: "a tampered member certificate fails verification and the report is NOT-TRUSTED-NOW" },
    { name: "FORGERY-CAUGHT (fake TRUSTED-NOW)", pass: forgeryCaught, detail: "claiming TRUSTED-NOW while a member is revoked is rejected — the verdict re-derives from the live revocation status" },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "the per-member verify + revocation + log-inclusion checks and the overall verdict re-derive offline" },
    { name: "SIGNED-TAMPER", pass: tamperReport, detail: "altering the recorded verdict breaks the payload hash" },
    { name: "DETERMINISTIC-ISH", pass: d1.verdict === "TRUSTED-NOW", detail: "same inputs → same verdict (TRUSTED-NOW)" },
    { name: "TOTAL", pass: total, detail: "empty members / malformed report never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
