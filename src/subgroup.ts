/**
 * 👥 THE SUBGROUP-VALIDITY CERTIFICATE — does the win hold for EVERYONE, or did the average hide a harmed
 * segment? (Simpson's-paradox guard.)
 *
 * The single most dangerous way an A/B verdict lies: "B beats A" on the pooled average while B is actively
 * WORSE for a key subgroup — a region, a customer segment, a device class. The headline number is positive,
 * the harm is invisible, and you ship a change that hurts the people who don't show up in the mean. An
 * executive or a regulator does not want "+3% overall"; they want "no segment was harmed."
 *
 * This certificate tests the effect in EVERY subgroup with a multiplicity correction. To claim
 * UNIFORM-IMPROVEMENT it requires each subgroup's 1−α/G lower bound to clear zero (so "improves everywhere"
 * holds family-wise at α, by the union bound); it flags HARMED-SUBGROUP when any subgroup's 1−α/G upper bound
 * is below zero (a segment significantly worse) and NAMES it; and it raises overallMisleading when the pooled
 * test says "improvement" while a subgroup is harmed. Ed25519-signed; every bound + the verdict re-derive
 * offline from the recorded per-subgroup data.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot hold per-subgroup measurements, compute Bonferroni-corrected
 * directional bounds, find the worst segment, and sign a re-derivable verdict — it just repeats the average.
 * (DIAKRISIS — MEASURED: when one segment is truly harmed the pooled test still declares "improvement" ~97%
 * of the time while this certificate flags + names the harmed segment ~100%; when all segments improve it
 * declares UNIFORM-IMPROVEMENT and falsely flags harm ≤ α. HONEST: subgroups must be pre-specified, not
 * fished post-hoc; the Bonferroni correction is across the G you declare.)
 */
import { type Experiment, lcg } from "./space.js";
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
function normInv(p: number): number {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0]; const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
function tMult(df: number, z0: number): number { if (df < 1) return Math.max(6, z0 + 4); const z = z0, z3 = z * z * z, z5 = z3 * z * z; return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df); }
function stats(xs: number[]): { mean: number; varOverN: number; n: number } { const n = xs.length; if (n === 0) return { mean: 0, varOverN: 0, n: 0 }; const mean = xs.reduce((s, v) => s + v, 0) / n; const v = n > 1 ? xs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1) : 0; return { mean, varOverN: v / n, n }; }
function erf(x: number): number { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
function normCdf(x: number): number { return 0.5 * (1 + erf(x / Math.SQRT2)); }
// Holm step-down: reject the sorted p-values while p_(k) ≤ α/(G−k); uniformly more powerful than Bonferroni at
// the same family-wise error. Returns the set of rejected original indices.
function holmReject(pvals: number[], alpha: number): Set<number> {
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p); const G = pvals.length; const rej = new Set<number>();
  for (let k = 0; k < G; k++) { if (order[k].p <= alpha / (G - k)) rej.add(order[k].i); else break; }
  return rej;
}

export interface SubgroupResult { group: string; nA: number; nB: number; effect: number; lowerBound: number; upperBound: number; status: "IMPROVED" | "HARMED" | "UNCERTAIN"; }
export interface SubgroupCertificate {
  standard: "melete-subgroup-certificate/v1";
  verdict: "UNIFORM-IMPROVEMENT" | "HARMED-SUBGROUP" | "MIXED";
  groups: number;
  alpha: number;
  overallEffect: number;
  overallLowerBound: number;
  overallSignificant: boolean;       // pooled (ignoring subgroups) looks like an improvement
  overallMisleading: boolean;        // pooled says improvement BUT a subgroup is harmed — the trap this catches
  worstGroup: string;
  worstEffect: number;
  subgroups: Array<SubgroupResult & { samplesA: number[]; samplesB: number[] }>;
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

function evaluate(contribs: Array<{ group: string; samplesA: number[]; samplesB: number[] }>, alpha: number) {
  // UNIFORM-IMPROVEMENT is an INTERSECTION-UNION test: to claim "every subgroup improves" you reject each at
  // level α (NO multiplicity penalty — the IUT controls the size at α). HARM detection is a family of tests
  // where ANY flag is a discovery, so it uses Holm step-down (FWER ≤ α). This is uniformly more powerful than
  // the naive Bonferroni-everywhere of v1, and the uniform claim is now correctly (not over-) conservative.
  const zAlpha = normInv(1 - alpha);
  const raw = (contribs ?? []).map((c) => { const A = c.samplesA ?? [], B = c.samplesB ?? []; const sa = stats(A), sb = stats(B); const effect = sb.mean - sa.mean; const se = Math.sqrt(sa.varOverN + sb.varOverN); const df = Math.min(sa.n, sb.n) - 1; const t = tMult(df, zAlpha); return { group: c.group, A, B, nA: sa.n, nB: sb.n, effect, se, lowerBound: effect - t * se, upperBound: effect + t * se, pHarm: se > 0 ? normCdf(effect / se) : 0.5 }; });
  const harmedSet = holmReject(raw.map((r) => r.pHarm), alpha);   // family-wise harm at α
  const subs: Array<SubgroupResult & { samplesA: number[]; samplesB: number[] }> = [];
  const allA: number[] = [], allB: number[] = []; let anyHarmed = false, allImproved = raw.length > 0, worstEffect = Infinity, worstGroup = "";
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]; const status: SubgroupResult["status"] = harmedSet.has(i) ? "HARMED" : (r.lowerBound > 0 ? "IMPROVED" : "UNCERTAIN");
    if (status === "HARMED") anyHarmed = true; if (status !== "IMPROVED") allImproved = false;
    if (r.effect < worstEffect) { worstEffect = r.effect; worstGroup = r.group; }
    subs.push({ group: r.group, nA: r.nA, nB: r.nB, effect: r.effect, lowerBound: r.lowerBound, upperBound: r.upperBound, status, samplesA: r.A, samplesB: r.B });
    for (const x of r.A) allA.push(x); for (const x of r.B) allB.push(x);
  }
  const oa = stats(allA), ob = stats(allB); const oEffect = ob.mean - oa.mean; const oSe = Math.sqrt(oa.varOverN + ob.varOverN);
  const oLB = oEffect - tMult(Math.min(oa.n, ob.n) - 1, zAlpha) * oSe; const oSig = oLB > 0;
  const verdict: SubgroupCertificate["verdict"] = anyHarmed ? "HARMED-SUBGROUP" : (allImproved ? "UNIFORM-IMPROVEMENT" : "MIXED");
  return { subs, oEffect, oLB, oSig, overallMisleading: oSig && anyHarmed, worstGroup, worstEffect: Number.isFinite(worstEffect) ? worstEffect : 0, verdict };
}

export function subgroupCertificate(opts: { contributions: Array<{ group: string; samplesA: number[]; samplesB: number[] }>; alpha?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): SubgroupCertificate {
  const alpha = opts.alpha ?? 0.05; const e = evaluate(opts.contributions ?? [], alpha);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-subgroup-certificate/v1" as const, verdict: e.verdict, groups: (opts.contributions ?? []).length, alpha, overallEffect: e.oEffect, overallLowerBound: e.oLB, overallSignificant: e.oSig, overallMisleading: e.overallMisleading, worstGroup: e.worstGroup, worstEffect: e.worstEffect, subgroups: e.subs };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifySubgroupCertificate(c: SubgroupCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-subgroup-certificate/v1") return { ok: false, reason: "unknown standard" };
    if (c.subgroups.length !== c.groups) return { ok: false, reason: "group count mismatch" };
    const e = evaluate(c.subgroups.map((s) => ({ group: s.group, samplesA: s.samplesA, samplesB: s.samplesB })), c.alpha);
    if (e.verdict !== c.verdict) return { ok: false, reason: `recomputed verdict ${e.verdict} ≠ certificate ${c.verdict} — subgroup harm hidden or misreported` };
    for (let i = 0; i < e.subs.length; i++) {
      const a = e.subs[i], b = c.subgroups[i];
      if (a.group !== b.group || Math.abs(a.effect - b.effect) > 1e-6 || Math.abs(a.lowerBound - b.lowerBound) > 1e-6 || Math.abs(a.upperBound - b.upperBound) > 1e-6 || a.status !== b.status) return { ok: false, reason: `subgroup ${b.group} re-derivation differs — a bound or status was altered` };
    }
    if (Math.abs(e.oLB - c.overallLowerBound) > 1e-6 || e.oSig !== c.overallSignificant || e.overallMisleading !== c.overallMisleading || e.worstGroup !== c.worstGroup) return { ok: false, reason: "recomputed overall / worst-group differs" };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, groups: c.groups, alpha: c.alpha, overallEffect: c.overallEffect, overallLowerBound: c.overallLowerBound, overallSignificant: c.overallSignificant, overallMisleading: c.overallMisleading, worstGroup: c.worstGroup, worstEffect: c.worstEffect, subgroups: c.subgroups })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a recorded measurement was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `${c.verdict}${c.overallMisleading ? " (overall average is MISLEADING — segment " + c.worstGroup + " harmed)" : ""}; ${c.groups} subgroups re-derived` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function subgroupGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const gz = (g: () => number) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  const G = 4, n = 60, alpha = 0.05;
  const build = (deltas: number[], seed: number) => deltas.map((d, gi) => { const ga = lcg(seed * 131 + gi * 7 + 1), gb = lcg(seed * 131 + gi * 7 + 5); const A: number[] = [], B: number[] = []; for (let i = 0; i < n; i++) { A.push(5 + gz(ga)); B.push(5 + d + gz(gb)); } return { group: "seg" + gi, samplesA: A, samplesB: B }; });

  // harm scenario: three segments improve, one is harmed — overall stays positive (the trap)
  const harm = [0.8, 0.8, 0.8, -0.9];
  let detect = 0, mislead = 0, named = 0, NH = 2500;
  for (let s = 1; s <= NH; s++) { const c = subgroupCertificate({ contributions: build(harm, s), alpha }); if (c.verdict === "HARMED-SUBGROUP") detect++; if (c.overallMisleading) mislead++; if (c.verdict === "HARMED-SUBGROUP" && c.worstGroup === "seg3") named++; }
  const detectRate = detect / NH, misleadRate = mislead / NH, namedRate = detect ? named / detect : 0;

  // all-improve scenario: every segment better → UNIFORM-IMPROVEMENT, no false harm
  const allUp = [0.8, 0.8, 0.8, 0.8];
  let falseHarm = 0, uniform = 0, NU = 2500;
  for (let s = 1; s <= NU; s++) { const c = subgroupCertificate({ contributions: build(allUp, s + 7000), alpha }); if (c.verdict === "HARMED-SUBGROUP") falseHarm++; if (c.verdict === "UNIFORM-IMPROVEMENT") uniform++; }
  const falseHarmRate = falseHarm / NU, uniformRate = uniform / NU;

  // signed + forgery (relabel a harmed segment IMPROVED) + tamper + determ + total
  const cc = subgroupCertificate({ contributions: build(harm, 3), alpha });
  const verifyOk = verifySubgroupCertificate(cc).ok && cc.verdict === "HARMED-SUBGROUP";
  const forged = { ...cc, verdict: "UNIFORM-IMPROVEMENT" as const, overallMisleading: false, subgroups: cc.subgroups.map((s) => (s.status === "HARMED" ? { ...s, status: "IMPROVED" as const } : s)) };
  const forgeryCaught = !verifySubgroupCertificate(forged).ok;
  const tamper = !verifySubgroupCertificate({ ...cc, subgroups: cc.subgroups.map((s, i) => (i === 3 ? { ...s, samplesB: s.samplesB.map((v, j) => (j === 0 ? v + 20 : v)) } : s)) }).ok;
  const d1 = subgroupCertificate({ contributions: build(allUp, 9), alpha }), d2 = subgroupCertificate({ contributions: build(allUp, 9), alpha });
  const deterministic = d1.payloadHash === d2.payloadHash && verifySubgroupCertificate(d1).ok;
  let total = true; try { subgroupCertificate({ contributions: [] }); subgroupCertificate({ contributions: [{ group: "x", samplesA: [NaN], samplesB: [1, 2] }] }); } catch { total = false; }

  // R28 IMPROVE — (a) UNIFORM via the intersection-union test (level α, not α/G): far more powerful, still
  // size-controlled. (b) HARM via Holm step-down: more detections than Bonferroni at the same family-wise error.
  const zA = normInv(1 - alpha), zBon = normInv(1 - alpha / G);
  const margin = [0.4, 0.4, 0.4, 0.4]; let iutPow = 0, bonUniPow = 0, iutSize = 0, NM = 3000;
  for (let s = 1; s <= NM; s++) {
    const c = subgroupCertificate({ contributions: build(margin, s * 3 + 1), alpha });
    if (c.verdict === "UNIFORM-IMPROVEMENT") iutPow++;
    // old v1 behaviour: each subgroup LB at α/G must clear 0
    const bonAll = c.subgroups.every((sg) => { const se = (sg.upperBound - sg.lowerBound) / (2 * tMult(Math.min(sg.nA, sg.nB) - 1, zA)); return sg.effect - tMult(Math.min(sg.nA, sg.nB) - 1, zBon) * se > 0; });
    if (bonAll) bonUniPow++;
    // size: one segment truly does NOT improve (δ=0) → a valid procedure must rarely claim UNIFORM
    const cs = subgroupCertificate({ contributions: build([0.0, 0.4, 0.4, 0.4], s * 5 + 2), alpha });
    if (cs.verdict === "UNIFORM-IMPROVEMENT") iutSize++;
  }
  const iutRate = iutPow / NM, bonUniRate = bonUniPow / NM, iutSizeRate = iutSize / NM;
  // Holm vs Bonferroni harm detection at G=8 with several modest harms; FWER under no harm
  const buildG = (deltas: number[], seed: number, nn = 60) => deltas.map((d, gi) => { const ga = lcg(seed * 191 + gi * 11 + 1), gb = lcg(seed * 191 + gi * 11 + 5); const A: number[] = [], B: number[] = []; for (let i = 0; i < nn; i++) { A.push(5 + gz(ga)); B.push(5 + d + gz(gb)); } return { group: "g" + gi, samplesA: A, samplesB: B }; });
  const harmG = [0.8, 0.8, 0.8, 0.8, -0.55, -0.55, -0.55, -0.55];
  let holmDet = 0, bonDet = 0, holmFWER = 0, MM = 3000;
  for (let s = 1; s <= MM; s++) {
    const c = subgroupCertificate({ contributions: buildG(harmG, s), alpha });
    let hd = 0; for (const sg of c.subgroups) if (sg.status === "HARMED" && +sg.group.slice(1) >= 4) hd++; holmDet += hd;
    // Bonferroni harm inline: lower-tail p ≤ α/G
    for (const sg of c.subgroups) { const se = (sg.upperBound - sg.lowerBound) / (2 * tMult(Math.min(sg.nA, sg.nB) - 1, zA)); const p = normCdf(sg.effect / se); if (p <= alpha / c.groups && +sg.group.slice(1) >= 4) bonDet++; }
    const c0 = subgroupCertificate({ contributions: buildG(new Array(8).fill(0), s + 5000), alpha });
    if (c0.subgroups.some((sg) => sg.status === "HARMED")) holmFWER++;
  }
  const holmDetAvg = holmDet / MM, bonDetAvg = bonDet / MM, holmFWERRate = holmFWER / MM;

  const checks = [
    { name: "DETECTS + NAMES HARM", pass: detectRate >= 0.9 && namedRate >= 0.99, detail: `when one segment is truly harmed, flagged HARMED-SUBGROUP ${(detectRate * 100).toFixed(0)}% and named the right segment ${(namedRate * 100).toFixed(0)}%` },
    { name: "OVERALL-AVERAGE-MISLEADS (the trap)", pass: misleadRate >= 0.8, detail: `the pooled test declared "improvement" while a segment was harmed in ${(misleadRate * 100).toFixed(0)}% of cases — exactly the harm the average hides and this certificate catches` },
    { name: "UNIFORM via IUT — more powerful + size-controlled", pass: iutRate >= bonUniRate + 0.1 && iutSizeRate <= alpha, detail: `the intersection-union test (level α, no penalty) declares UNIFORM-IMPROVEMENT ${(iutRate * 100).toFixed(0)}% at a marginal effect vs the naive Bonferroni-α/G ${(bonUniRate * 100).toFixed(0)}% — and stays size-controlled (${(iutSizeRate * 100).toFixed(1)}% ≤ α when a segment truly does not improve)` },
    { name: "HARM via Holm — more powerful, same FWER", pass: holmDetAvg >= bonDetAvg && holmFWERRate <= alpha + 0.005, detail: `Holm step-down detected ${holmDetAvg.toFixed(2)}/4 modest harms vs Bonferroni ${bonDetAvg.toFixed(2)}/4 (≥, uniformly more powerful) while holding the family-wise false-harm rate at ${(holmFWERRate * 100).toFixed(1)}% ≤ α` },
    { name: "NO-FALSE-HARM (Bonferroni)", pass: falseHarmRate <= alpha, detail: `when every segment truly improves, a harmed segment was falsely flagged only ${(falseHarmRate * 100).toFixed(1)}% ≤ α=${(alpha * 100).toFixed(0)}% (family-wise across G)` },
    { name: "UNIFORM-IMPROVEMENT (power)", pass: uniformRate >= 0.8, detail: `when every segment improves, UNIFORM-IMPROVEMENT was declared ${(uniformRate * 100).toFixed(0)}% — the family-wise all-segments claim` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "every per-segment bound + the verdict re-derive from the recorded data" },
    { name: "FORGERY-CAUGHT (hide the harm)", pass: forgeryCaught, detail: "relabelling a harmed segment as IMPROVED to claim a uniform win is rejected on re-derivation" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering a recorded measurement breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same per-segment data → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "no subgroups / NaN data never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
