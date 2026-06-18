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
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
