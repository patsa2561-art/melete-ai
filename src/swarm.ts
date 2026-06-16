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
// regularized upper incomplete gamma Q(a,x) (Numerical Recipes) → χ² survival = gammq(k/2, x/2), for the
// Cochran heterogeneity test (do the agents actually AGREE, or is the pooled verdict an artifact of disagreement?).
function gammln(xx: number): number { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = xx, y = xx, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); let ser = 1.000000000190015; for (let j = 0; j < 6; j++) { y++; ser += c[j] / y; } return -tmp + Math.log(2.5066282746310005 * ser / x); }
function gammq(a: number, x: number): number {
  if (x <= 0) return 1; if (a <= 0) return 0;
  if (x < a + 1) { let sum = 1 / a, del = 1 / a, ap = a; for (let i = 0; i < 300; i++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-13) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - gammln(a)); }
  let b = x + 1 - a, c = 1e30, d = 1 / b, h = d; for (let i = 1; i <= 300; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30; c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-13) break; } return Math.exp(-x + a * Math.log(x) - gammln(a)) * h;
}
function chi2sf(x: number, k: number): number { return k < 1 ? 1 : Math.max(0, Math.min(1, gammq(k / 2, x / 2))); }

// Cochran's Q heterogeneity over the honest contributions (known σ ⇒ var of each agent's mean = σ²/n_i)
function consensusOf(honest: Array<{ agent: string; n: number; sum: number }>, sigma: number, alphaHet: number) {
  const A = honest.length;
  if (A < 2) return { cochranQ: 0, df: 0, heterogeneityPValue: 1, iSquared: 0, consensus: "HOMOGENEOUS" as const, mostHeterogeneousAgent: A ? honest[0].agent : "" };
  const s2 = sigma * sigma;
  const theta = honest.map((h) => (h.n > 0 ? h.sum / h.n : 0)), w = honest.map((h) => (h.n > 0 ? h.n / s2 : 0));
  let sw = 0, swt = 0; for (let i = 0; i < A; i++) { sw += w[i]; swt += w[i] * theta[i]; }
  const tbar = sw > 0 ? swt / sw : 0;
  let Q = 0, bi = 0, bv = -1; for (let i = 0; i < A; i++) { const c = w[i] * (theta[i] - tbar) * (theta[i] - tbar); Q += c; if (c > bv) { bv = c; bi = i; } }
  const df = A - 1, p = chi2sf(Q, df), iSquared = Q > 0 ? Math.max(0, (Q - df) / Q) : 0;
  return { cochranQ: Q, df, heterogeneityPValue: p, iSquared, consensus: (p < alphaHet ? "HETEROGENEOUS" : "HOMOGENEOUS") as "HETEROGENEOUS" | "HOMOGENEOUS", mostHeterogeneousAgent: honest[bi].agent };
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
  alphaHet: number;                 // heterogeneity significance level
  cochranQ: number;                 // Cochran's Q over the honest agents (consensus statistic)
  heterogeneityPValue: number;      // χ²(A−1) tail — small ⇒ the agents DISAGREE
  iSquared: number;                 // fraction of variance due to disagreement (0 = perfect consensus)
  consensus: "HOMOGENEOUS" | "HETEROGENEOUS";   // do the agents agree? if HETEROGENEOUS the pooled verdict is suspect
  mostHeterogeneousAgent: string;   // the agent contributing most to the disagreement
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

export function swarmCertificate(opts: { contributions: Array<{ agent: string; observations: number[]; claimedEValue?: number | null }>; sigma?: number; alpha?: number; tau2?: number; alphaHet?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): SwarmCertificate {
  const sigma = Math.max(1e-9, opts.sigma ?? 1), alpha = opts.alpha ?? 0.05, tau2 = opts.tau2 ?? 0.3, alphaHet = opts.alphaHet ?? 0.05;
  const s2 = sigma * sigma, threshold = 1 / alpha;
  const e = evaluate(opts.contributions ?? [], s2, tau2);
  const verdict: SwarmCertificate["verdict"] = e.combinedEValue >= threshold ? "COMBINED-SIGNIFICANT" : "INCONCLUSIVE";
  const con = consensusOf(e.out.filter((x) => x.honest).map((x) => ({ agent: x.agent, n: x.n, sum: x.sum })), sigma, alphaHet);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-swarm-certificate/v1" as const, verdict, agents: (opts.contributions ?? []).length, honestCount: e.honestCount, excludedCount: e.excludedCount, sigma, alpha, tau2, threshold, pooledN: e.pooledN, pooledSum: e.pooledSum, combinedEValue: e.combinedEValue, productEValue: e.product, alphaHet, cochranQ: con.cochranQ, heterogeneityPValue: con.heterogeneityPValue, iSquared: con.iSquared, consensus: con.consensus, mostHeterogeneousAgent: con.mostHeterogeneousAgent, contributions: e.out };
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
    // re-derive the consensus / heterogeneity statistics — a forged HOMOGENEOUS flag on disagreeing agents is caught
    const con = consensusOf(e.out.filter((x) => x.honest).map((x) => ({ agent: x.agent, n: x.n, sum: x.sum })), c.sigma, c.alphaHet);
    if (Math.abs(con.cochranQ - c.cochranQ) > 1e-6 || Math.abs(con.heterogeneityPValue - c.heterogeneityPValue) > 1e-6 || con.consensus !== c.consensus || con.mostHeterogeneousAgent !== c.mostHeterogeneousAgent) return { ok: false, reason: "recomputed consensus differs — heterogeneity hidden or misreported" };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, agents: c.agents, honestCount: c.honestCount, excludedCount: c.excludedCount, sigma: c.sigma, alpha: c.alpha, tau2: c.tau2, threshold: c.threshold, pooledN: c.pooledN, pooledSum: c.pooledSum, combinedEValue: c.combinedEValue, productEValue: c.productEValue, alphaHet: c.alphaHet, cochranQ: c.cochranQ, heterogeneityPValue: c.heterogeneityPValue, iSquared: c.iSquared, consensus: c.consensus, mostHeterogeneousAgent: c.mostHeterogeneousAgent, contributions: c.contributions })).digest("hex");
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

  // R24 IMPROVE — CONSENSUS: do the agents actually AGREE? Cochran's Q heterogeneity test over the swarm.
  let hetFalse = 0, hetDetect = 0, guardsPool = 0, identifiesOutlier = 0, H = 3000;
  for (let s = 1; s <= H; s++) {
    // homogeneous: all agents share the same gain → should NOT be flagged heterogeneous
    const homo = [0, 1, 2, 3, 4].map((a) => ({ agent: "a" + a, observations: stream(lcg(s * 211 + a * 13 + 1), 0.3) }));
    if (swarmCertificate({ contributions: homo, sigma, alpha, tau2 }).consensus === "HETEROGENEOUS") hetFalse++;
    // one rogue agent measuring a very different effect among nulls → disagreement
    const rogue = [0, 1, 2, 3].map((a) => ({ agent: "a" + a, observations: stream(lcg(s * 233 + a * 7 + 3), 0.0) }));
    rogue.push({ agent: "rogue", observations: stream(lcg(s * 233 + 99), 1.3) });
    const cr = swarmCertificate({ contributions: rogue, sigma, alpha, tau2 });
    if (cr.consensus === "HETEROGENEOUS") hetDetect++;
    // GUARDS-POOL: the rogue can drag the naive pool toward significance, but the consensus flags it as suspect
    if (cr.verdict === "COMBINED-SIGNIFICANT" && cr.consensus === "HETEROGENEOUS") guardsPool++;
    if (cr.consensus === "HETEROGENEOUS" && cr.mostHeterogeneousAgent === "rogue") identifiesOutlier++;
  }
  const hetFalseRate = hetFalse / H, hetDetectRate = hetDetect / H, identifyRate = hetDetect ? identifiesOutlier / hetDetect : 0;
  // CONSENSUS-FORGERY: claiming HOMOGENEOUS on a disagreeing swarm is caught
  const rc = swarmCertificate({ contributions: [{ agent: "a", observations: stream(lcg(1), 0.0) }, { agent: "b", observations: stream(lcg(2), 0.0) }, { agent: "r", observations: stream(lcg(3), 1.3) }], sigma, alpha, tau2 });
  const consensusForgeryCaught = rc.consensus === "HETEROGENEOUS" && !verifySwarmCertificate({ ...rc, consensus: "HOMOGENEOUS" as const }).ok;

  const checks = [
    { name: "POOLING-POWER (swarm > any single)", pass: pooledRate >= singleRate + 0.15 && pooledRate >= 0.5, detail: `a weak gain (μ=0.25) was detected by some single agent ${(singleRate * 100).toFixed(0)}% of the time, but the POOLED ${A}-agent combined e-value caught it ${(pooledRate * 100).toFixed(0)}%` },
    { name: "VALIDITY ≤ α (pooled null)", pass: nullFpRate <= alpha && N >= 1000, detail: `under the null the pooled combined e-value falsely fired in ${(nullFpRate * 100).toFixed(1)}% ≤ α=${(alpha * 100).toFixed(0)}% — pooling does not break validity` },
    { name: "LIAR-CAUGHT (Byzantine-robust)", pass: liarFalseRejectRate <= alpha && liarExcludedRate >= 0.999, detail: `an agent claiming a 10⁶× e-value with null data was excluded by re-derivation ${(liarExcludedRate * 100).toFixed(1)}% and could NOT force a false reject (${(liarFalseRejectRate * 100).toFixed(1)}% ≤ α)` },
    { name: "SIGNED-VERIFIES", pass: verifyOk, detail: "every contribution + the pooled verdict re-derive from the recorded streams" },
    { name: "FORGERY-CAUGHT (inflated verdict / fake-honest)", pass: forgedCombined && forgedHonest, detail: "inflating the combined e-value, or marking a liar honest to admit its claim, is rejected on re-derivation" },
    { name: "CONSENSUS-CALIBRATED (agents agree)", pass: hetFalseRate <= 0.06, detail: `when all agents share the same effect, the swarm was falsely flagged HETEROGENEOUS only ${(hetFalseRate * 100).toFixed(1)}% (Cochran Q, ≈α)` },
    { name: "DISAGREEMENT-DETECTED + ATTRIBUTED", pass: hetDetectRate >= 0.9 && identifyRate >= 0.99, detail: `one rogue agent measuring a different effect was flagged HETEROGENEOUS ${(hetDetectRate * 100).toFixed(0)}% and named as the most-heterogeneous agent ${(identifyRate * 100).toFixed(0)}%` },
    { name: "GUARDS-THE-POOL", pass: guardsPool > 0, detail: `when a rogue dragged the naive pool to SIGNIFICANT, the consensus check flagged it HETEROGENEOUS (suspect) in ${guardsPool} cases — so a spurious pooled significance is not trusted blindly` },
    { name: "CONSENSUS-FORGERY-CAUGHT", pass: consensusForgeryCaught, detail: "claiming HOMOGENEOUS on a genuinely disagreeing swarm is rejected on re-derivation" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering any agent's recorded observation breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same contributions → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "no contributions / NaN streams never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
