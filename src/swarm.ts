/**
 * 🤝 THE SWARM-EVIDENCE CERTIFICATE — combine many agents' independent verifications into ONE signed
 * meta-verdict, stronger than any single agent's, and robust to an agent that lies.
 *
 * A swarm of AI agents each runs its own experiments on the same question — different machines, different
 * slices of the system. Individually each may have only weak, inconclusive evidence. The strategic question
 * for multi-agent knowledge sync is: how do you POOL their evidence into one conclusion you can trust, when
 * any one agent might be wrong or adversarial? Naive meta-analysis is fragile — one agent claiming a huge
 * effect swings the result.
 *
 * This certificate pools the agents' sufficient statistics (Σn, Σx) into a single anytime-valid e-value — the
 * statistically correct way to combine, equivalent to one long experiment, so it DETECTS what no single agent
 * could (measured: a weak gain ~29% of single agents catch is caught ~60% pooled) while the null false-
 * positive stays ≤ α. The Byzantine defence is the key: the combiner RE-DERIVES each agent's evidence from its
 * submitted data, so an agent that CLAIMS more evidence than its data supports is detected and EXCLUDED — it
 * cannot swing the verdict. Ed25519-signed; every contribution + the pooled verdict re-derive offline.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot re-derive each agent's e-value from raw streams, pool sufficient
 * statistics into a valid combined e-value, exclude an inflated contribution, and sign the meta-verdict — it
 * just averages opinions. (DIAKRISIS — MEASURED: pooling boosts detection of a real weak effect while holding
 * the null ≤ α; a single lying agent inflating its e-value 10⁶× is caught by re-derivation and cannot force a
 * false rejection. HONEST LIMIT: this defends against e-value INFLATION, not an agent fabricating raw data —
 * no statistic can distinguish fabricated-but-plausible data without external ground truth.) Distinct from the
 * FEDERATED pool (which CRDT-merges shared experiment records); this combines signed statistical EVIDENCE.
 */
import { lcg } from "./space.js";
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
// Robbins mixture e-value from sufficient statistics: sum S over t observations (known σ), a valid e-value at t.
function eOf(S: number, t: number, s2: number, tau2: number): number {
  if (t < 1 || !Number.isFinite(S)) return 1;
  return Math.sqrt(s2 / (s2 + tau2 * t)) * Math.exp((tau2 * S * S) / (2 * s2 * (s2 + tau2 * t)));
}

export interface SwarmContribution { agent: string; n: number; sum: number; eValue: number; claimedEValue: number | null; honest: boolean; }
export interface SwarmCertificate {
  standard: "melete-swarm-certificate/v1";
  verdict: "COMBINED-SIGNIFICANT" | "INCONCLUSIVE";
  agents: number;
  honestCount: number;
  excludedCount: number;            // contributions whose claimed e-value did not match their data
  sigma: number;
  alpha: number;
  tau2: number;
  threshold: number;                // 1/α
  pooledN: number;                  // Σ n over honest contributions
  pooledSum: number;                // Σ x over honest contributions
  combinedEValue: number;           // the pooled-sufficient-statistic e-value (the power combiner)
  productEValue: number;            // Π e-value over honest contributions (independence combiner)
  contributions: Array<SwarmContribution & { observations: number[] }>;
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

function evaluate(contribs: Array<{ agent: string; observations: number[]; claimedEValue?: number | null }>, s2: number, tau2: number) {
  const out: Array<SwarmContribution & { observations: number[] }> = [];
  let pooledN = 0, pooledSum = 0, product = 1, honestCount = 0, excludedCount = 0;
  for (const c of contribs) {
    const obs = c.observations ?? []; let sum = 0; for (const x of obs) sum += x;
    const ev = eOf(sum, obs.length, s2, tau2);
    const claimed = (c.claimedEValue ?? null);
    const honest = claimed === null ? true : Math.abs(claimed - ev) <= Math.max(1e-6, 0.01 * Math.abs(ev));
    out.push({ agent: c.agent, n: obs.length, sum, eValue: ev, claimedEValue: claimed, honest, observations: obs });
    if (honest) { pooledN += obs.length; pooledSum += sum; product *= ev; honestCount++; } else excludedCount++;
  }
  const combinedEValue = eOf(pooledSum, pooledN, s2, tau2);
  return { out, pooledN, pooledSum, product, honestCount, excludedCount, combinedEValue };
}

export function swarmCertificate(opts: { contributions: Array<{ agent: string; observations: number[]; claimedEValue?: number | null }>; sigma?: number; alpha?: number; tau2?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): SwarmCertificate {
  const sigma = Math.max(1e-9, opts.sigma ?? 1), alpha = opts.alpha ?? 0.05, tau2 = opts.tau2 ?? 0.3;
  const s2 = sigma * sigma, threshold = 1 / alpha;
  const e = evaluate(opts.contributions ?? [], s2, tau2);
  const verdict: SwarmCertificate["verdict"] = e.combinedEValue >= threshold ? "COMBINED-SIGNIFICANT" : "INCONCLUSIVE";
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-swarm-certificate/v1" as const, verdict, agents: (opts.contributions ?? []).length, honestCount: e.honestCount, excludedCount: e.excludedCount, sigma, alpha, tau2, threshold, pooledN: e.pooledN, pooledSum: e.pooledSum, combinedEValue: e.combinedEValue, productEValue: e.product, contributions: e.out };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifySwarmCertificate(c: SwarmCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-swarm-certificate/v1") return { ok: false, reason: "unknown standard" };
    if (c.contributions.length !== c.agents) return { ok: false, reason: "agent count mismatch" };
    if (Math.abs(c.threshold - 1 / c.alpha) > 1e-9) return { ok: false, reason: "threshold ≠ 1/α" };
    const s2 = c.sigma * c.sigma;
    // re-derive every contribution from its raw observations — a forged e-value or a mis-flagged liar is caught
    const e = evaluate(c.contributions.map((x) => ({ agent: x.agent, observations: x.observations, claimedEValue: x.claimedEValue })), s2, c.tau2);
    for (let i = 0; i < e.out.length; i++) {
      const a = e.out[i], b = c.contributions[i];
      if (a.n !== b.n || Math.abs(a.sum - b.sum) > 1e-6 || Math.abs(a.eValue - b.eValue) > 1e-6 || a.honest !== b.honest) return { ok: false, reason: `contribution ${i} (${b.agent}) re-derivation differs — evidence overstated or liar mis-flagged` };
    }
    if (e.honestCount !== c.honestCount || e.excludedCount !== c.excludedCount) return { ok: false, reason: "honest/excluded counts differ" };
    if (e.pooledN !== c.pooledN || Math.abs(e.pooledSum - c.pooledSum) > 1e-6) return { ok: false, reason: "pooled sufficient statistics differ" };
    if (Math.abs(e.combinedEValue - c.combinedEValue) > 1e-6 || Math.abs(e.product - c.productEValue) > 1e-6) return { ok: false, reason: "recomputed combined/product e-value differs — verdict overstated" };
    const verdict = e.combinedEValue >= c.threshold ? "COMBINED-SIGNIFICANT" : "INCONCLUSIVE";
    if (verdict !== c.verdict) return { ok: false, reason: "verdict inconsistent with the recomputed combined e-value" };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, agents: c.agents, honestCount: c.honestCount, excludedCount: c.excludedCount, sigma: c.sigma, alpha: c.alpha, tau2: c.tau2, threshold: c.threshold, pooledN: c.pooledN, pooledSum: c.pooledSum, combinedEValue: c.combinedEValue, productEValue: c.productEValue, contributions: c.contributions })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — a contribution was altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `${c.verdict} from ${c.honestCount} honest agents (${c.excludedCount} excluded); combined e-value ${c.combinedEValue.toFixed(1)} vs 1/α=${c.threshold}` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function swarmGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const gz = (g: () => number) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  const sigma = 1, alpha = 0.05, tau2 = 0.3, s2 = 1, thr = 1 / alpha, A = 5, n = 40;
  const stream = (g: () => number, mu: number) => { const o: number[] = []; for (let i = 0; i < n; i++) o.push(mu + gz(g)); return o; };

  // 1) POOLING-POWER: pooled detection of a weak gain ≫ any single agent
  // 2) VALIDITY: under the null, the pooled combined e-value falsely fires ≤ α
  let single = 0, pooled = 0, nullFP = 0, N = 3000;
  for (let s = 1; s <= N; s++) {
    const contribsGain: Array<{ agent: string; observations: number[] }> = [], contribsNull: Array<{ agent: string; observations: number[] }> = [];
    let anySingle = false;
    for (let a = 0; a < A; a++) { const og = stream(lcg(s * 97 + a * 13 + 1), 0.25); contribsGain.push({ agent: "a" + a, observations: og }); let S = 0; for (const x of og) S += x; if (eOf(S, n, s2, tau2) >= thr) anySingle = true; contribsNull.push({ agent: "a" + a, observations: stream(lcg(s * 131 + a * 7 + 3), 0.0) }); }
    if (anySingle) single++;
    if (swarmCertificate({ contributions: contribsGain, sigma, alpha, tau2 }).verdict === "COMBINED-SIGNIFICANT") pooled++;
    if (swarmCertificate({ contributions: contribsNull, sigma, alpha, tau2 }).verdict === "COMBINED-SIGNIFICANT") nullFP++;
  }
  const singleRate = single / N, pooledRate = pooled / N, nullFpRate = nullFP / N;

  // 3) LIAR-CAUGHT: 4 honest null agents + 1 liar claiming e-value 1e6 ⇒ excluded, cannot force a false reject
  let liarFalseReject = 0, liarExcluded = 0, M = 2000;
  for (let s = 1; s <= M; s++) {
    const contribs: Array<{ agent: string; observations: number[]; claimedEValue?: number }> = [];
    for (let a = 0; a < 4; a++) contribs.push({ agent: "h" + a, observations: stream(lcg(s * 41 + a * 7 + 1), 0.0) });
    contribs.push({ agent: "liar", observations: stream(lcg(s * 41 + 99), 0.0), claimedEValue: 1e6 });
    const c = swarmCertificate({ contributions: contribs, sigma, alpha, tau2 });
    if (c.verdict === "COMBINED-SIGNIFICANT") liarFalseReject++;
    if (c.excludedCount === 1 && !c.contributions.find((x) => x.agent === "liar")!.honest) liarExcluded++;
  }
  const liarFalseRejectRate = liarFalseReject / M, liarExcludedRate = liarExcluded / M;

  // 4) SIGNED + FORGERY + TAMPER
  const cc = swarmCertificate({ contributions: [0, 1, 2, 3, 4].map((a) => ({ agent: "a" + a, observations: stream(lcg(7 + a * 11), 0.25) })), sigma, alpha, tau2 });
  const verifyOk = verifySwarmCertificate(cc).ok;
  const forgedCombined = !verifySwarmCertificate({ ...cc, combinedEValue: cc.combinedEValue * 100, verdict: "COMBINED-SIGNIFICANT" as const }).ok;
  // forge: mark a real liar as honest to sneak its (claimed) evidence in
  const liarC = swarmCertificate({ contributions: [{ agent: "h", observations: stream(lcg(3), 0.0) }, { agent: "liar", observations: stream(lcg(5), 0.0), claimedEValue: 1e6 }], sigma, alpha, tau2 });
  const forgedHonest = !verifySwarmCertificate({ ...liarC, contributions: liarC.contributions.map((x) => ({ ...x, honest: true })) }).ok;
  const tamper = !verifySwarmCertificate({ ...cc, contributions: cc.contributions.map((x, i) => (i === 0 ? { ...x, observations: x.observations.map((v, j) => (j === 0 ? v + 9 : v)) } : x)) }).ok;

  // 5) DETERMINISTIC + 6) TOTAL
  const d1 = swarmCertificate({ contributions: [{ agent: "x", observations: [1, 2, 1.5] }], sigma, alpha, tau2 });
  const d2 = swarmCertificate({ contributions: [{ agent: "x", observations: [1, 2, 1.5] }], sigma, alpha, tau2 });
  const deterministic = d1.payloadHash === d2.payloadHash && verifySwarmCertificate(d1).ok;
  let total = true; try { swarmCertificate({ contributions: [] }); swarmCertificate({ contributions: [{ agent: "n", observations: [NaN, 1] }] }); } catch { total = false; }

  const checks = [
    { name: "POOLING-POWER (swarm > any single)", pass: pooledRate >= singleRate + 0.15 && pooledRate >= 0.5, detail: `a weak gain (μ=0.25) was detected by some single agent ${(singleRate * 100).toFixed(0)}% of the time, but the POOLED ${A}-agent combined e-value caught it ${(pooledRate * 100).toFixed(0)}%` },
    { name: "VALIDITY ≤ α (pooled null)", pass: nullFpRate <= alpha && N >= 1000, detail: `under the null the pooled combined e-value falsely fired in ${(nullFpRate * 100).toFixed(1)}% ≤ α=${(alpha * 100).toFixed(0)}% — pooling does not break validity` },
    { name: "LIAR-CAUGHT (Byzantine-robust)", pass: liarFalseRejectRate <= alpha && liarExcludedRate >= 0.999, detail: `an agent claiming a 10⁶× e-value with null data was excluded by re-derivation ${(liarExcludedRate * 100).toFixed(1)}% and could NOT force a false reject (${(liarFalseRejectRate * 100).toFixed(1)}% ≤ α)` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "every contribution + the pooled verdict re-derive from the recorded streams" },
    { name: "FORGERY-CAUGHT (inflated verdict / fake-honest)", pass: forgedCombined && forgedHonest, detail: "inflating the combined e-value, or marking a liar honest to admit its claim, is rejected on re-derivation" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering any agent's recorded observation breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same contributions → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "no contributions / NaN streams never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
