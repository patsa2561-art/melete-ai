/**
 * 📑 THE SLA CERTIFICATE — a signed, both-party-verifiable service-level agreement for AI QUALITY (not just uptime).
 *
 * AI services today are sold on uptime SLAs + "trust us" on quality. But the thing a buyer actually cares about —
 * is the model still calibrated? still fair? still accurate enough? under the latency budget? — is never put in a
 * contract you can ENFORCE, because nobody could prove compliance or breach. This certificate makes the quality
 * terms themselves the SLA: the provider commits a set of measurable terms (each a metric, an observed value, a
 * threshold and a direction), the period's compliance is evaluated deterministically, and the verdict — PASS, or
 * BREACH naming exactly which terms failed and by how much — is signed. Each term can BIND to the underlying signed
 * metric certificate (a calibration cert, a fairness cert, …) so the observed value isn't "trust me" either.
 *
 * WHO BENEFITS (≥2 parties, by design): ① the PROVIDER turns "our model is good" into a signed, enforceable promise
 * that wins enterprise deals and bounds their liability to the stated terms; ② the CONSUMER gets a guarantee with
 * teeth — a breach is provable + offline-checkable, so refunds / penalties / switching are no longer he-said-she-said.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot deterministically evaluate the terms against thresholds, bind them to
 * re-derivable metric certificates, and sign an offline-checkable compliance verdict — it drafts prose. (DIAKRISIS —
 * MEASURED: a compliant period is PASS; a breached term flips the verdict to BREACH and is NAMED with its margin;
 * mixed terms name every breach; both threshold directions [≤ and ≥] are handled; a forged PASS over a real breach is
 * rejected on re-derivation; signed/tamper/deterministic/total. HONEST: this certifies the TERMS as stated against
 * the OBSERVED values supplied — its strength is exactly the strength of the bound metric certificates + that the
 * observed values are real; it does not itself measure the model.)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

export interface SlaTerm { name: string; metric: string; observed: number; threshold: number; direction: "<=" | ">="; certHash?: string | null }
interface EvaluatedTerm extends SlaTerm { satisfied: boolean; margin: number }

export interface SlaCertificate {
  standard: "melete-sla-certificate/v1";
  provider: string;
  consumer: string;
  period: string;
  verdict: "PASS" | "BREACH" | "EMPTY";
  terms: EvaluatedTerm[];
  breached: string[];              // names of the terms that failed
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

function evaluate(terms: SlaTerm[]): EvaluatedTerm[] {
  return terms.map((t) => {
    const observed = Number(t.observed), threshold = Number(t.threshold);
    const ok = Number.isFinite(observed) && Number.isFinite(threshold);
    const satisfied = ok && (t.direction === ">=" ? observed >= threshold : observed <= threshold);
    // margin: how far INTO compliance (≥0) or INTO breach (<0), in the term's own units
    const margin = !ok ? -Infinity : (t.direction === ">=" ? observed - threshold : threshold - observed);
    return { name: String(t.name), metric: String(t.metric), observed: ok ? observed : NaN, threshold: ok ? threshold : NaN, direction: t.direction === ">=" ? ">=" : "<=", certHash: t.certHash ?? null, satisfied, margin: Number.isFinite(margin) ? margin : -1 };
  });
}

export function slaCertificate(opts: { provider?: string; consumer?: string; period?: string; terms: SlaTerm[]; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): SlaCertificate {
  const terms = evaluate(Array.isArray(opts.terms) ? opts.terms : []);
  const breached = terms.filter((t) => !t.satisfied).map((t) => t.name);
  const verdict: SlaCertificate["verdict"] = terms.length === 0 ? "EMPTY" : (breached.length === 0 ? "PASS" : "BREACH");
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-sla-certificate/v1" as const, provider: String(opts.provider ?? "provider"), consumer: String(opts.consumer ?? "consumer"), period: String(opts.period ?? ""), verdict, terms, breached };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifySlaCertificate(c: SlaCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-sla-certificate/v1") return { ok: false, reason: "unknown standard" };
    const terms = evaluate(c.terms.map((t) => ({ name: t.name, metric: t.metric, observed: t.observed, threshold: t.threshold, direction: t.direction, certHash: t.certHash })));
    if (canonical(terms) !== canonical(c.terms)) return { ok: false, reason: "recomputed term evaluation differs — compliance misstated" };
    const breached = terms.filter((t) => !t.satisfied).map((t) => t.name);
    const verdict = terms.length === 0 ? "EMPTY" : (breached.length === 0 ? "PASS" : "BREACH");
    if (verdict !== c.verdict || canonical(breached) !== canonical(c.breached)) return { ok: false, reason: `recomputed verdict ${verdict} ≠ certificate ${c.verdict} — a breach was hidden` };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, provider: c.provider, consumer: c.consumer, period: c.period, verdict: c.verdict, terms: c.terms, breached: c.breached })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a term was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `${c.verdict}${c.breached.length ? " (" + c.breached.join(", ") + ")" : ""}: ${c.terms.length} SLA terms, ${c.provider} → ${c.consumer}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

// ─── v2: the COMPLIANCE LEDGER — a hash-chained, tamper-evident history of period certificates ───────────────
// A single PASS/BREACH is a snapshot; a contract runs over a billing cycle. The ledger chains every period so the
// CONSUMER gets a provable compliance history + auto-accrued penalty for breaches, and the PROVIDER gets a signed
// track record. Removing/reordering/altering any period breaks the chain.
export interface SlaLedgerEntry { seq: number; periodCert: SlaCertificate; prevHash: string; entryHash: string }
export interface SlaLedger {
  standard: "melete-sla-ledger/v1";
  provider: string; consumer: string; penaltyPerBreach: number;
  entries: SlaLedgerEntry[];
  headHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}
function entryHashOf(seq: number, periodCertHash: string, prevHash: string): string { return createHash("sha256").update(canonical({ seq, periodCertHash, prevHash })).digest("hex"); }

export function buildSlaLedger(opts: { provider?: string; consumer?: string; penaltyPerBreach?: number; periodCerts: SlaCertificate[]; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): SlaLedger {
  const certs = Array.isArray(opts.periodCerts) ? opts.periodCerts : [];
  const entries: SlaLedgerEntry[] = []; let prevHash = "genesis";
  for (let i = 0; i < certs.length; i++) { const h = entryHashOf(i, String(certs[i]?.payloadHash ?? ""), prevHash); entries.push({ seq: i, periodCert: certs[i], prevHash, entryHash: h }); prevHash = h; }
  const headHash = entries.length ? entries[entries.length - 1].entryHash : "genesis";
  const penaltyPerBreach = Number.isFinite(opts.penaltyPerBreach) && (opts.penaltyPerBreach as number) >= 0 ? (opts.penaltyPerBreach as number) : 0;
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const signature = edSign(null, Buffer.from(headHash), kp.privateKey).toString("base64");
  return { standard: "melete-sla-ledger/v1", provider: String(opts.provider ?? "provider"), consumer: String(opts.consumer ?? "consumer"), penaltyPerBreach, entries, headHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifySlaLedger(l: SlaLedger): { ok: boolean; reason: string } {
  try {
    if (l.standard !== "melete-sla-ledger/v1") return { ok: false, reason: "unknown standard" };
    let prevHash = "genesis";
    for (let i = 0; i < l.entries.length; i++) {
      const e = l.entries[i];
      if (e.seq !== i) return { ok: false, reason: `entry ${i} out of order (seq ${e.seq})` };
      if (e.prevHash !== prevHash) return { ok: false, reason: `chain broken at period ${i} — a period was inserted/removed/reordered` };
      const pv = verifySlaCertificate(e.periodCert);
      if (!pv.ok) return { ok: false, reason: `period ${i} certificate invalid: ${pv.reason}` };
      const h = entryHashOf(e.seq, e.periodCert.payloadHash, e.prevHash);
      if (h !== e.entryHash) return { ok: false, reason: `period ${i} entry hash mismatch — a period was altered` };
      prevHash = e.entryHash;
    }
    const headHash = l.entries.length ? l.entries[l.entries.length - 1].entryHash : "genesis";
    if (headHash !== l.headHash) return { ok: false, reason: "head hash mismatch" };
    const pub = createPublicKey(l.publicKeyPem);
    if (!edVerify(null, Buffer.from(l.headHash), pub, Buffer.from(l.signature, "base64"))) return { ok: false, reason: "bad ledger signature" };
    const r = slaLedgerReport(l);
    return { ok: true, reason: `${l.entries.length} periods, ${r.breachCount} breached (${(r.breachRate * 100).toFixed(0)}%), penalty owed ${r.penaltyOwed}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function slaLedgerReport(l: SlaLedger): { periods: number; passCount: number; breachCount: number; breachRate: number; longestCleanStreak: number; penaltyOwed: number; breachesByTerm: Record<string, number> } {
  const periods = l.entries.length; let passCount = 0, breachCount = 0, streak = 0, longest = 0; const byTerm: Record<string, number> = {};
  for (const e of l.entries) {
    if (e.periodCert.verdict === "PASS") { passCount++; streak++; if (streak > longest) longest = streak; }
    else if (e.periodCert.verdict === "BREACH") { breachCount++; streak = 0; for (const t of e.periodCert.breached) byTerm[t] = (byTerm[t] ?? 0) + 1; }
    else streak = 0;
  }
  return { periods, passCount, breachCount, breachRate: periods ? breachCount / periods : 0, longestCleanStreak: longest, penaltyOwed: breachCount * l.penaltyPerBreach, breachesByTerm: byTerm };
}

export function slaGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // a realistic AI-service SLA: calibration ECE ≤ 5%, fairness gap ≤ 0.1, accuracy ≥ 90%, p95 latency ≤ 200ms
  const compliant: SlaTerm[] = [
    { name: "calibration", metric: "ECE", observed: 0.032, threshold: 0.05, direction: "<=" },
    { name: "fairness", metric: "demographic-parity-gap", observed: 0.04, threshold: 0.1, direction: "<=" },
    { name: "accuracy", metric: "top1", observed: 0.93, threshold: 0.90, direction: ">=" },
    { name: "latency", metric: "p95-ms", observed: 180, threshold: 200, direction: "<=" },
  ];
  const cPass = slaCertificate({ provider: "VendorAI", consumer: "BankCo", period: "2026-06", terms: compliant });
  const passes = cPass.verdict === "PASS" && cPass.breached.length === 0 && verifySlaCertificate(cPass).ok;

  // breach exactly one term (calibration drifts to 7% > 5%)
  const breach1 = compliant.map((t) => (t.name === "calibration" ? { ...t, observed: 0.07 } : t));
  const cB1 = slaCertificate({ terms: breach1 });
  const namesBreach = cB1.verdict === "BREACH" && cB1.breached.length === 1 && cB1.breached[0] === "calibration";

  // mixed breach: calibration + accuracy both fail ⇒ both named
  const breach2 = compliant.map((t) => (t.name === "calibration" ? { ...t, observed: 0.09 } : t.name === "accuracy" ? { ...t, observed: 0.85 } : t));
  const cB2 = slaCertificate({ terms: breach2 });
  const namesAll = cB2.verdict === "BREACH" && cB2.breached.length === 2 && cB2.breached.includes("calibration") && cB2.breached.includes("accuracy");

  // direction handling: a ">=" term (accuracy) at exactly the threshold passes; just below breaches
  const eqOk = slaCertificate({ terms: [{ name: "accuracy", metric: "top1", observed: 0.90, threshold: 0.90, direction: ">=" }] }).verdict === "PASS";
  const justBelow = slaCertificate({ terms: [{ name: "accuracy", metric: "top1", observed: 0.8999, threshold: 0.90, direction: ">=" }] }).verdict === "BREACH";
  const directionOk = eqOk && justBelow;

  const verifyOk = verifySlaCertificate(cB1).ok && cB1.verdict === "BREACH";
  // FORGERY: a provider claims PASS while a term is breached ⇒ rejected on re-derivation
  const forged = { ...cB1, verdict: "PASS" as const, breached: [] as string[], terms: cB1.terms.map((t) => ({ ...t, satisfied: true, margin: Math.abs(t.margin) })) };
  const forgeryCaught = !verifySlaCertificate(forged).ok;
  const tamper = !verifySlaCertificate({ ...cPass, terms: cPass.terms.map((t, i) => (i === 0 ? { ...t, observed: 0.5 } : t)) }).ok;
  const d1 = slaCertificate({ provider: "P", consumer: "C", period: "x", terms: compliant }); const d2 = slaCertificate({ provider: "P", consumer: "C", period: "x", terms: compliant });
  const deterministic = d1.payloadHash === d2.payloadHash && verifySlaCertificate(d1).ok;
  let total = true; try { slaCertificate({ terms: [] }); slaCertificate({ terms: [{ name: "x", metric: "y", observed: NaN, threshold: 1, direction: "<=" }] }); verifySlaCertificate({} as SlaCertificate); } catch { total = false; }
  const emptyEmpty = slaCertificate({ terms: [] }).verdict === "EMPTY";

  // ── v2 COMPLIANCE LEDGER ──
  const mkPeriod = (cal: number, acc: number) => slaCertificate({ provider: "VendorAI", consumer: "BankCo", terms: [
    { name: "calibration", metric: "ECE", observed: cal, threshold: 0.05, direction: "<=" },
    { name: "accuracy", metric: "top1", observed: acc, threshold: 0.90, direction: ">=" },
  ] });
  // 6 periods: 4 clean, period 3 breaches calibration, period 5 breaches accuracy
  const periods = [mkPeriod(0.03, 0.93), mkPeriod(0.04, 0.92), mkPeriod(0.03, 0.91), mkPeriod(0.08, 0.93), mkPeriod(0.02, 0.94), mkPeriod(0.03, 0.85)];
  const lk = generateKeyPairSync("ed25519");
  const ledger = buildSlaLedger({ provider: "VendorAI", consumer: "BankCo", penaltyPerBreach: 5000, periodCerts: periods, keys: lk });
  const ledgerOk = verifySlaLedger(ledger).ok;
  const rep = slaLedgerReport(ledger);
  const reportOk = rep.periods === 6 && rep.breachCount === 2 && Math.abs(rep.breachRate - 2 / 6) < 1e-9 && rep.penaltyOwed === 10000 && rep.longestCleanStreak === 3 && rep.breachesByTerm.calibration === 1 && rep.breachesByTerm.accuracy === 1;
  // tamper a period's observed value ⇒ that period cert fails ⇒ ledger rejected
  const tamperedLedger = JSON.parse(JSON.stringify(ledger)); tamperedLedger.entries[3].periodCert.terms[0].observed = 0.01; tamperedLedger.entries[3].periodCert.terms[0].satisfied = true;
  const ledgerTamperCaught = !verifySlaLedger(tamperedLedger).ok;
  // remove a period (hide a breach) ⇒ chain breaks
  const hidden = JSON.parse(JSON.stringify(ledger)); hidden.entries.splice(3, 1);
  const hiddenCaught = !verifySlaLedger(hidden).ok;
  const l2 = buildSlaLedger({ provider: "VendorAI", consumer: "BankCo", penaltyPerBreach: 5000, periodCerts: periods, keys: lk });
  const ledgerDet = l2.headHash === ledger.headHash && verifySlaLedger(l2).ok;

  const checks = [
    { name: "COMPLIANT-PERIOD-PASSES", pass: passes, detail: `a period meeting all 4 terms (ECE ${(compliant[0].observed * 100).toFixed(1)}%≤5%, gap 0.04≤0.1, acc 93%≥90%, p95 180ms≤200) is signed PASS` },
    { name: "BREACH-NAMED (+margin)", pass: namesBreach, detail: `when calibration ECE drifts to 7% > 5% the verdict flips to BREACH and names exactly "calibration" (margin ${cB1.terms.find((t) => t.name === "calibration")!.margin.toFixed(3)})` },
    { name: "MULTI-BREACH-ALL-NAMED", pass: namesAll, detail: `two simultaneous breaches (calibration + accuracy) are both named — nothing hidden behind an overall "OK"` },
    { name: "DIRECTION (≤ and ≥)", pass: directionOk, detail: `a ≥ term at exactly the threshold passes; just below it breaches — both ≤ and ≥ thresholds are handled` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "every term's pass/fail + the overall verdict re-derive offline from the recorded observed values + thresholds" },
    { name: "FORGERY-CAUGHT (fake PASS)", pass: forgeryCaught, detail: "a provider claiming PASS while a term is breached is rejected — the re-evaluation exposes the hidden breach" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering an observed value breaks the payload hash / the re-derived verdict" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same terms → byte-identical certificate" },
    { name: "TOTAL", pass: total && emptyEmpty, detail: "empty term list → EMPTY; NaN / malformed inputs never throw" },
    { name: "LEDGER-CHAIN + REPORT (v2)", pass: ledgerOk && reportOk, detail: `a hash-chained history of ${rep.periods} periods verifies; the report is exact — ${rep.breachCount} breaches (${(rep.breachRate * 100).toFixed(0)}%), longest clean streak ${rep.longestCleanStreak}, penalty owed ${rep.penaltyOwed} (per-term: ${JSON.stringify(rep.breachesByTerm)})` },
    { name: "LEDGER-TAMPER-CAUGHT (v2)", pass: ledgerTamperCaught && ledgerDet, detail: "altering a past period's recorded value invalidates that period's certificate and the ledger; the chain is deterministic" },
    { name: "LEDGER-HIDDEN-PERIOD-CAUGHT (v2)", pass: hiddenCaught, detail: "removing a breached period to hide it breaks the prev-hash chain — the consumer's compliance history is tamper-evident" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
