/**
 * 🔌 THE MELETE MCP SERVER — Melete as agent-callable trust middleware (the "toll-booth of truth").
 *
 * The 2026 battleground is not model intelligence — it is context, memory, and TRUST between AI agents. The
 * strategic move for Melete is not to be another optimizer app, but the INFRASTRUCTURE any AI agent (Claude,
 * GPT, Gemini, an autonomous coding agent) plugs into over the Model Context Protocol to get answers it can
 * VERIFY rather than take on faith. An agent that just ran experiments POSTs the numbers; Melete hands back a
 * signed, offline-verifiable certificate — de-bias this winner, is this recommendation supported, control the
 * false-discovery rate, propose the next setting. Plug-and-play, every result signed.
 *
 * This module is a transport-agnostic JSON-RPC 2.0 / MCP request handler over a tool registry. `bin/melete-mcp`
 * wires it to stdio so it drops straight into Claude Desktop / Cursor / any MCP client. The differentiator vs a
 * plain tool server: the RESULTS are Ed25519-signed certificates the calling agent re-verifies with the
 * embedded public key — trust without trusting the server.
 *
 * Honest by design (DIAKRISIS): this is a thin, dependency-free protocol shell over the SAME proven engine and
 * honesty stack — its value is reach (any agent, plug-and-play) + the signed results, not a new algorithm.
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";
import { type Space } from "./space.js";
import { proposeNext } from "./interactive.js";
import { selectionCertificate, verifySelectionCertificate } from "./winnerscurse.js";
import { supportCertificate, verifySupportCertificate } from "./support.js";
import { falseDiscoveryCertificate, verifyFalseDiscoveryCertificate } from "./fdr.js";
import { anytimeCertificate, verifyAnytimeCertificate } from "./anytime.js";
import { swarmCertificate, verifySwarmCertificate } from "./swarm.js";
import { conformalCertificate, verifyConformalCertificate } from "./conformal.js";
import { subgroupCertificate, verifySubgroupCertificate } from "./subgroup.js";
import { calibrationCertificate, verifyCalibrationCertificate } from "./calibration.js";
import { privacyCertificate, verifyPrivacyCertificate } from "./privacy.js";
import { unlearningCertificate, verifyUnlearningCertificate, ridgeSufficientStats } from "./unlearning.js";
import { droCertificate, verifyDroCertificate } from "./dro.js";
import { fairnessCertificate, verifyFairnessCertificate } from "./fairness.js";
import { designCertificate, verifyDesignCertificate, toDesignMarkdown } from "./design.js";
import { attributionCertificate, verifyAttributionCertificate, buildValueTable } from "./shapley.js";
import { issueVerificationReceipt, verifyVerificationReceipt } from "./receipt.js";
import { slaCertificate, verifySlaCertificate, buildSlaLedger, verifySlaLedger, slaLedgerReport } from "./sla.js";
import { consentReceipt, verifyConsentReceipt, useCertificate, verifyUseCertificate, checkUse } from "./consent.js";
import { trustPassport, verifyTrustPassport } from "./passport.js";
import { buildAibom, verifyAibom, aibomReport } from "./aibom.js";
import { buildPrivateAuditProof, verifyPrivateAuditProof } from "./spotcheck.js";
import { proveAnswer, verifyAnswer } from "./pca.js";
import { createTransparencyLog, verifySTH, verifyInclusion as verifyLogInclusion, verifyConsistency as verifyLogConsistency, verifyEntryInclusion } from "./translog.js";
import { createWitness, collectQuorum, detectSplitView } from "./witness.js";
import { createRevocationRegistry, verifyRevocationList, statusFromList } from "./revocation.js";
import { buildTrustReport, verifyTrustReport } from "./trustreport.js";
import { selectionGauntlet } from "./winnerscurse.js";
import { supportGauntlet } from "./support.js";
import { fdrGauntlet } from "./fdr.js";

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const MCP_SERVER_NAME = "melete";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
function sha256(s: string): string { return createHash("sha256").update(s).digest("hex"); }

// ── THE TRUST LEDGER ──────────────────────────────────────────────────────────────────────────────────────
// Every agent tool-call leaves a hash-chained, Ed25519-signed receipt: which agent, which tool, the hash of the
// inputs, the hash of the (signed) result, linked to the previous receipt. This is the toll-booth's two missing
// pieces at once — USAGE METERING (a tamper-evident count to bill on) and a SHARED AUDIT TRAIL every agent and
// human can re-verify offline: "who verified what, and is the chain intact?". Multi-agent knowledge sync of
// VERIFIED results — agent B trusts agent A's discovery from the signed receipt, without re-running it.
export interface LedgerReceipt { seq: number; agent: string; tool: string; inputHash: string; resultHash: string; prevHash: string; hash: string; sig: string; }
export interface MeleteLedger {
  record: (agent: string, tool: string, args: unknown, result: unknown) => LedgerReceipt;
  verifyChain: () => { ok: boolean; brokenAt: number; reason: string };
  usage: () => { total: number; byAgent: Record<string, number>; byTool: Record<string, number> };
  receipts: LedgerReceipt[];
  publicKeyPem: string;
}
export function createLedger(keys?: { publicKey: KeyObject; privateKey: KeyObject }): MeleteLedger {
  const kp = keys ?? generateKeyPairSync("ed25519");
  const pub = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  const receipts: LedgerReceipt[] = [];
  const core = (r: { seq: number; agent: string; tool: string; inputHash: string; resultHash: string; prevHash: string }) => canonical({ seq: r.seq, agent: r.agent, tool: r.tool, inputHash: r.inputHash, resultHash: r.resultHash, prevHash: r.prevHash });
  function record(agent: string, tool: string, args: unknown, result: unknown): LedgerReceipt {
    const seq = receipts.length;
    const inputHash = sha256(canonical(args ?? {}));
    // bind to the SIGNED result: if the tool returned a certificate, its payloadHash IS the result identity
    const cert = (result as any)?.certificate;
    const resultHash = cert?.payloadHash ? String(cert.payloadHash) : sha256(canonical(result ?? null));
    const prevHash = seq === 0 ? "genesis" : receipts[seq - 1].hash;
    const base = { seq, agent: agent || "anon", tool, inputHash, resultHash, prevHash };
    const hash = sha256(core(base));
    const sig = edSign(null, Buffer.from(hash), kp.privateKey).toString("base64");
    const r: LedgerReceipt = { ...base, hash, sig };
    receipts.push(r); return r;
  }
  function verifyChain(): { ok: boolean; brokenAt: number; reason: string } {
    const pk = createPublicKey(pub);
    for (let i = 0; i < receipts.length; i++) {
      const r = receipts[i];
      if (r.seq !== i) return { ok: false, brokenAt: i, reason: "sequence out of order" };
      if (sha256(core(r)) !== r.hash) return { ok: false, brokenAt: i, reason: "receipt hash mismatch — tampered" };
      const expectedPrev = i === 0 ? "genesis" : receipts[i - 1].hash;
      if (r.prevHash !== expectedPrev) return { ok: false, brokenAt: i, reason: "broken chain link" };
      if (!edVerify(null, Buffer.from(r.hash), pk, Buffer.from(r.sig, "base64"))) return { ok: false, brokenAt: i, reason: "bad signature" };
    }
    return { ok: true, brokenAt: -1, reason: "chain intact" };
  }
  function usage() {
    const byAgent: Record<string, number> = {}, byTool: Record<string, number> = {};
    for (const r of receipts) { byAgent[r.agent] = (byAgent[r.agent] ?? 0) + 1; byTool[r.tool] = (byTool[r.tool] ?? 0) + 1; }
    return { total: receipts.length, byAgent, byTool };
  }
  return { record, verifyChain, usage, receipts, publicKeyPem: pub };
}

interface McpTool { name: string; description: string; inputSchema: Record<string, unknown>; run: (args: Record<string, any>) => unknown; }

function asSpace(s: any): Space { return Array.isArray(s) ? { dims: s } : (s && Array.isArray(s.dims) ? s : { dims: [] }); }

// shared offline re-derivation dispatch — used by both melete.verify and the two-party receipt tools
export function verifyByKind(kind: string, c: any): { ok: boolean; reason: string } {
  if (kind === "selection") return verifySelectionCertificate(c); if (kind === "support") return verifySupportCertificate(c);
  if (kind === "fdr") return verifyFalseDiscoveryCertificate(c); if (kind === "anytime") return verifyAnytimeCertificate(c);
  if (kind === "swarm") return verifySwarmCertificate(c); if (kind === "conformal") return verifyConformalCertificate(c);
  if (kind === "subgroup") return verifySubgroupCertificate(c); if (kind === "calibration") return verifyCalibrationCertificate(c);
  if (kind === "privacy") return verifyPrivacyCertificate(c); if (kind === "unlearning") return verifyUnlearningCertificate(c);
  if (kind === "dro") return verifyDroCertificate(c); if (kind === "fairness") return verifyFairnessCertificate(c);
  if (kind === "design") return verifyDesignCertificate(c); if (kind === "attribution") return verifyAttributionCertificate(c);
  if (kind === "sla") return verifySlaCertificate(c);
  if (kind === "consent") return verifyConsentReceipt(c);
  if (kind === "aibom") return verifyAibom(c);
  if (kind === "audit") return verifyPrivateAuditProof(c) as any;
  if (kind === "answer") return verifyAnswer(c) as any;
  if (kind === "sth") return verifySTH(c) as any;
  return { ok: false, reason: "unknown certificate kind" };
}

const _translog = createTransparencyLog({ logId: "melete-public-claims" });
const _witnesses = ["Anthropic-Witness","Cloudflare-Witness","EU-AI-Office","MLCommons","AlgoWatch-NGO"].map((n) => createWitness(n));
const _revreg = createRevocationRegistry({ authority: "Melete-Governance" });
export const MELETE_MCP_TOOLS: McpTool[] = [
  {
    name: "melete.next",
    description: "Propose the next setting to evaluate (the adaptive optimizer engine). Give your knobs + the results so far; get the most informative next experiment.",
    inputSchema: { type: "object", properties: { space: { type: "array", description: "knobs: [{name,type:'real'|'int',min,max}]" }, observations: { type: "array", description: "[{experiment:{knob:value}, value:number}]" }, goal: { type: "string", enum: ["maximize", "minimize"] }, seed: { type: "number" } }, required: ["space"] },
    run: (a) => ({ next: proposeNext(asSpace(a.space), a.observations ?? [], a.goal ?? "maximize", a.seed ?? 1) }),
  },
  {
    name: "melete.selection",
    description: "De-bias the best-of-N from a search (winner's-curse). Pass the N observed values + noise σ, or per-candidate replicates. Returns a signed lower bound on the winner's TRUE value.",
    inputSchema: { type: "object", properties: { values: { type: "array" }, replicates: { type: "array" }, sigma: { type: "number" }, q: { type: "number" }, confidence: { type: "number" } } },
    run: (a) => { const c = selectionCertificate({ values: a.values, replicates: a.replicates, sigma: a.sigma, confidence: a.confidence }); return { certificate: c, verified: verifySelectionCertificate(c).ok }; },
  },
  {
    name: "melete.support",
    description: "Is a recommended setting INSIDE your measured evidence, or a blind extrapolation? Pass the evaluated design + the recommended point. Returns a signed verdict with a separating-hyperplane witness when it is outside the convex hull.",
    inputSchema: { type: "object", properties: { design: { type: "array", description: "[[x1,x2,...], ...] evaluated settings" }, recommended: { type: "array", description: "[x1,x2,...] the setting to check" }, tau: { type: "number" } }, required: ["design", "recommended"] },
    run: (a) => { const c = supportCertificate({ design: a.design, recommended: a.recommended, tau: a.tau }); return { certificate: c, verified: verifySupportCertificate(c).ok }; },
  },
  {
    name: "melete.fdr",
    description: "Report K findings at once with the false-discovery rate controlled. Pass p-values (or z-scores) + target q. BH or BY (dependence-robust). Returns per-hypothesis q-values + the signed discovery set.",
    inputSchema: { type: "object", properties: { pValues: { type: "array" }, zScores: { type: "array" }, q: { type: "number" }, alpha: { type: "number" }, procedure: { type: "string", enum: ["BH", "BY"] } } },
    run: (a) => { const c = falseDiscoveryCertificate({ pValues: a.pValues, zScores: a.zScores, q: a.q, alpha: a.alpha, procedure: a.procedure }); return { certificate: c, verified: verifyFalseDiscoveryCertificate(c).ok }; },
  },
  {
    name: "melete.anytime",
    description: "Anytime-valid test for an agent that PEEKS after every observation. Pass the observation stream (e.g. paired gains) + σ + α. Returns a signed verdict whose false-positive guarantee holds under optional stopping (peek as often as you like).",
    inputSchema: { type: "object", properties: { observations: { type: "array" }, sigma: { type: "number" }, alpha: { type: "number" }, tau2: { type: "number" } }, required: ["observations"] },
    run: (a) => { const c = anytimeCertificate({ observations: a.observations, sigma: a.sigma, alpha: a.alpha, tau2: a.tau2 }); return { certificate: c, verified: verifyAnytimeCertificate(c).ok }; },
  },
  {
    name: "melete.swarm",
    description: "Combine MANY agents' independent evidence into one signed meta-verdict. Pass each agent's observation stream; the combiner pools them (stronger than any single agent), and RE-DERIVES each contribution so an agent claiming more than its data supports is excluded. Byzantine-robust.",
    inputSchema: { type: "object", properties: { contributions: { type: "array", description: "[{agent, observations:[...], claimedEValue?}]" }, sigma: { type: "number" }, alpha: { type: "number" }, tau2: { type: "number" } }, required: ["contributions"] },
    run: (a) => { const c = swarmCertificate({ contributions: a.contributions ?? [], sigma: a.sigma, alpha: a.alpha, tau2: a.tau2 }); return { certificate: c, verified: verifySwarmCertificate(c).ok }; },
  },
  {
    name: "melete.conformal",
    description: "Wrap an agent's predictor with a distribution-free prediction interval. Pass calibration residuals + α (+ optional prediction). Returns ŷ ± q, coverage ≥ 1−α, no distributional assumption. For input-dependent noise, also pass per-residual `difficulty` (σ̂) + `predictionDifficulty` → an ADAPTIVE interval that balances coverage across input regions.",
    inputSchema: { type: "object", properties: { residuals: { type: "array" }, alpha: { type: "number" }, prediction: { type: "number" }, difficulty: { type: "array", description: "per-residual difficulty σ̂(x) for adaptive (normalized) conformal" }, predictionDifficulty: { type: "number" } }, required: ["residuals"] },
    run: (a) => { const c = conformalCertificate({ residuals: a.residuals ?? [], alpha: a.alpha, prediction: a.prediction ?? null, difficulty: a.difficulty ?? null, predictionDifficulty: a.predictionDifficulty ?? null }); return { certificate: c, verified: verifyConformalCertificate(c).ok }; },
  },
  {
    name: "melete.subgroup",
    description: "Does an A/B win hold for EVERY segment, or did the average hide a harmed one (Simpson's paradox)? Pass per-segment A/B samples. Returns a signed verdict — UNIFORM-IMPROVEMENT vs HARMED-SUBGROUP (names the segment) — with Bonferroni multiplicity control, and flags when the pooled average is misleading.",
    inputSchema: { type: "object", properties: { contributions: { type: "array", description: "[{group, samplesA:[...], samplesB:[...]}]" }, alpha: { type: "number" } }, required: ["contributions"] },
    run: (a) => { const c = subgroupCertificate({ contributions: a.contributions ?? [], alpha: a.alpha }); return { certificate: c, verified: verifySubgroupCertificate(c).ok }; },
  },
  {
    name: "melete.calibration",
    description: "Is a model/agent's stated confidence trustworthy? Pass its predicted probabilities + the binary outcomes. Returns a signed verdict from TWO tests — the global Spiegelhalter Z (catches over/under-confidence + names the direction) AND a per-bin Hosmer-Lemeshow test (catches mid-range miscalibration near p=0.5, where the global Z is structurally blind), Bonferroni-split so the combined false-flag stays ≤ α. Reports ECE, the reliability curve, and localizes the worst-calibrated bin.",
    inputSchema: { type: "object", properties: { predictions: { type: "array", description: "predicted probabilities p∈[0,1]" }, outcomes: { type: "array", description: "binary outcomes 0/1" }, bins: { type: "number" } }, required: ["predictions", "outcomes"] },
    run: (a) => { const c = calibrationCertificate({ predictions: a.predictions ?? [], outcomes: a.outcomes ?? [], bins: a.bins }); return { certificate: c, verified: verifyCalibrationCertificate(c).ok }; },
  },
  {
    name: "melete.privacy",
    description: "Before you SHARE an aggregate (a mean, a count, a pooled gradient), prove no individual can be re-identified. Pass the true statistic (a number array), its L2 sensitivity (how much one record can change it), and your target (ε, δ). Returns a signed (ε,δ)-differential-privacy certificate: the analytic-Gaussian (Balle-Wang) minimum noise is added and ONLY the noised release is returned (the true value is never stored). An under-noised release that claims a small ε is rejected on re-derivation.",
    inputSchema: { type: "object", properties: { statistic: { type: "array", description: "the true aggregate to release (numbers)" }, sensitivity: { type: "number", description: "L2 sensitivity: max change from one record" }, epsilon: { type: "number", description: "privacy budget ε > 0" }, delta: { type: "number", description: "failure prob δ ∈ (0,1), e.g. 1e-5" } }, required: ["statistic", "sensitivity", "epsilon", "delta"] },
    run: (a) => { const c = privacyCertificate({ statistic: a.statistic ?? [], sensitivity: a.sensitivity, epsilon: a.epsilon, delta: a.delta }); return { certificate: c, verified: verifyPrivacyCertificate(c).ok }; },
  },
  {
    name: "melete.unlearning",
    description: "Prove records were actually DELETED from a ridge model (right to be forgotten) — not just hidden. Pass the training data X (rows) + y + λ, and the index OR indices of the records to forget. Returns a signed certificate that deletes them EXACTLY via a Woodbury block rank-k downdate (O(k³+kd²), no retraining), proves it equals retraining from scratch AND equals one-by-one sequential deletion, reports the batch's influence + the residual influence left in the served model (must be ~0), and is offline-auditable from the Gram matrix alone. A fake/partial deletion is caught as RESIDUAL-INFLUENCE.",
    inputSchema: { type: "object", properties: { X: { type: "array", description: "training rows (array of equal-length number arrays)" }, y: { type: "array", description: "targets" }, lambda: { type: "number", description: "ridge regularization λ (default 1)" }, deleteIndex: { type: "number", description: "single row index to forget" }, deleteIndices: { type: "array", description: "batch of row indices to forget" } }, required: ["X", "y"] },
    run: (a) => {
      const X = a.X ?? [], y = a.y ?? [], lambda = Number.isFinite(a.lambda) ? a.lambda : 1;
      const idx: number[] = Array.isArray(a.deleteIndices) && a.deleteIndices.length ? a.deleteIndices.map((v: number) => v | 0) : [a.deleteIndex | 0];
      const ss = ridgeSufficientStats(X, y, lambda);
      const c = unlearningCertificate({ gram: ss.gram, bVector: ss.bVector, deletedRows: idx.map((j) => ({ x: X[j] ?? [], y: y[j] ?? 0 })), lambda });
      return { certificate: c, verified: verifyUnlearningCertificate(c).ok };
    },
  },
  {
    name: "melete.dro",
    description: "Will a setting still hold when the deployment data distribution drifts? Pass per-unit value samples (per-customer profit, per-query score…) and EITHER an ambiguity radius ρ (χ²-divergence) OR a confidence level (0<conf<1). Returns a signed distributionally-robust certificate: the worst-case mean over EVERY distribution within χ² ≤ ρ — V = mean − √(ρ·Var) — guaranteeing the expected value is ≥ V under any such shift. In CONFIDENCE mode ρ is set to z²/n so V is a calibrated (1−α) lower bound on the TRUE mean (DRO ≡ a confidence interval). A fragile high-variance setting is correctly out-ranked by a robust one.",
    inputSchema: { type: "object", properties: { values: { type: "array", description: "per-unit value samples" }, rho: { type: "number", description: "χ² ambiguity radius ≥ 0 (ambiguity mode)" }, confidence: { type: "number", description: "confidence level e.g. 0.95 (confidence mode; overrides ρ)" }, threshold: { type: "number", description: "value to keep for a ROBUST verdict (optional)" } }, required: ["values"] },
    run: (a) => { const c = droCertificate({ values: a.values ?? [], rho: a.rho, confidence: a.confidence, threshold: a.threshold }); return { certificate: c, verified: verifyDroCertificate(c).ok }; },
  },
  {
    name: "melete.fairness",
    description: "Is an automated decision fair across a protected group, with statistical confidence (EU AI Act / fair-lending grade)? Pass the binary decisions, the protected group of each (or, for v2 INTERSECTIONAL fairness, an `axes` array of several protected attributes), and optionally the true outcomes. Returns a signed certificate: the demographic-parity gap (and, with outcomes, equalized-odds TPR/FPR gaps) each with simultaneous Bonferroni-corrected Wilson confidence intervals across every group — marginal AND intersectional — and a verdict FAIR / UNFAIR (names the metric, the groups, and whether the bias is marginal or at an intersection) / INCONCLUSIVE. v2 catches fairness-gerrymandering: bias hidden at the intersection of attributes while each attribute alone looks fair.",
    inputSchema: { type: "object", properties: { predictions: { type: "array", description: "binary decisions 0/1" }, groupOf: { type: "array", description: "single protected group label per decision (v1 mode)" }, axes: { type: "array", description: "v2 intersectional: [{name, of:[labels per row]}, …] for ≥2 protected attributes", items: { type: "object" } }, outcomes: { type: "array", description: "true outcomes 0/1 (optional, enables equalized odds)" }, tolerance: { type: "number", description: "fairness tolerance τ (default 0.1)" }, alpha: { type: "number", description: "significance level (default 0.05)" } }, required: ["predictions"] },
    run: (a) => { const c = fairnessCertificate({ predictions: a.predictions ?? [], groupOf: a.groupOf ?? undefined, axes: a.axes ?? undefined, outcomes: a.outcomes ?? null, tolerance: a.tolerance, alpha: a.alpha }); return { certificate: c, verified: verifyFairnessCertificate(c).ok }; },
  },
  {
    name: "melete.design",
    description: "Fetch Melete's own design system as a signed, machine-verifiable DESIGN.md (à la getdesign.md, but every token is Ed25519-signed and contrast-verified). Returns the manifest (dark canvas, accent palette, type scale, motion + component rules), the emitted DESIGN.md markdown, and a proof that every accent clears a WCAG ≥3:1 contrast floor on the canvas. An AI agent building on Melete verifies it offline and trusts the tokens.",
    inputSchema: { type: "object", properties: { markdown: { type: "boolean", description: "also return the DESIGN.md text" } }, required: [] },
    run: (a) => { const c = designCertificate(); return { certificate: c, verified: verifyDesignCertificate(c).ok, designMarkdown: a.markdown ? toDesignMarkdown(c) : undefined }; },
  },
  {
    name: "melete.attribution",
    description: "Which feature drove a decision, with a PROOF the credit is fair (GDPR/EU-AI-Act 'right to explanation')? Pass the model's coalition value table — valueTable[mask] = the model output when exactly the features whose bit is set in `mask` are present (others at baseline), length 2^n — or send a precomputed one. Returns the EXACT Shapley attribution with the fairness axioms proven (efficiency: credits sum to prediction−baseline; dummy; symmetry; linearity) and signed. A tilted explanation whose credits don't sum to the prediction is rejected on re-derivation. (Exact, so n ≤ ~16 features.)",
    inputSchema: { type: "object", properties: { valueTable: { type: "array", description: "coalition values, length 2^n (index by feature-presence bitmask)" }, featureNames: { type: "array", description: "optional feature names (length n)" } }, required: ["valueTable"] },
    run: (a) => { const c = attributionCertificate({ valueTable: a.valueTable ?? [], featureNames: a.featureNames }); return { certificate: c, verified: verifyAttributionCertificate(c).ok }; },
  },
  {
    name: "melete.verify",
    description: "Re-verify any Melete signed certificate OFFLINE (no trust in the server). Pass the certificate + its kind.",
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["selection", "support", "fdr", "anytime", "swarm", "conformal", "subgroup", "calibration", "privacy", "unlearning", "dro", "fairness", "design", "attribution", "sla", "consent", "aibom", "audit", "answer", "sth"] }, certificate: { type: "object" } }, required: ["kind", "certificate"] },
    run: (a) => verifyByKind(a.kind, a.certificate),
  },
  {
    name: "melete.sla",
    description: "Put AI QUALITY in an enforceable contract both sides can check. Pass the SLA terms — each { name, metric, observed, threshold, direction:'<='|'>=', certHash? } (e.g. calibration ECE ≤ 0.05, fairness gap ≤ 0.1, accuracy ≥ 0.9, p95 latency ≤ 200) plus provider/consumer/period. Returns a signed compliance certificate: PASS, or BREACH naming exactly which terms failed and by what margin. Each term can bind to the underlying signed metric certificate's hash. WHO BENEFITS: the provider gets an enforceable, liability-bounding promise; the consumer gets a provable breach for refunds/penalties.",
    inputSchema: { type: "object", properties: { provider: { type: "string" }, consumer: { type: "string" }, period: { type: "string" }, terms: { type: "array", description: "[{name, metric, observed, threshold, direction, certHash?}]", items: { type: "object" } } }, required: ["terms"] },
    run: (a) => { const c = slaCertificate({ provider: a.provider, consumer: a.consumer, period: a.period, terms: a.terms ?? [] }); return { certificate: c, verified: verifySlaCertificate(c).ok }; },
  },
  {
    name: "melete.sla.ledger",
    description: "Build a tamper-evident COMPLIANCE LEDGER over a billing cycle: a hash-chained history of signed SLA period certificates with auto-accrued penalty. Pass the period certificates (from melete.sla) + penaltyPerBreach. Returns the signed ledger + a report (breach count/rate, longest clean streak, penalty owed, breaches by term). WHO BENEFITS: the consumer gets a provable compliance history + the penalty owed; the provider gets a signed track record. Removing/reordering/altering any period breaks the chain.",
    inputSchema: { type: "object", properties: { provider: { type: "string" }, consumer: { type: "string" }, penaltyPerBreach: { type: "number" }, periodCerts: { type: "array", description: "signed SLA period certificates", items: { type: "object" } } }, required: ["periodCerts"] },
    run: (a) => { const l = buildSlaLedger({ provider: a.provider, consumer: a.consumer, penaltyPerBreach: a.penaltyPerBreach, periodCerts: a.periodCerts ?? [] }); return { ledger: l, verified: verifySlaLedger(l).ok, report: slaLedgerReport(l) }; },
  },
  {
    name: "melete.revocation.revoke",
    description: "Revoke a Melete certificate (CRL/OCSP for AI) — withdraw a claim later found wrong (model became biased, key compromised, audit invalid). Pass the certificate payloadHash + a reason + an effective timestamp. Appends a signed, hash-chained revocation to the registry; relying parties that check status will then see REVOKED. WHO BENEFITS: issuer (bound liability), relying parties + regulators + end users (stop acting on an invalid certificate).",
    inputSchema: { type: "object", properties: { certHash: { type: "string" }, reason: { type: "string" }, revokedAt: { type: "number", description: "effective epoch ms (default now)" } }, required: ["certHash","reason"] },
    run: (a) => { const e = _revreg.revoke(String(a.certHash||""), String(a.reason||"unspecified"), Number.isFinite(a.revokedAt)?a.revokedAt:Date.now()); return { entry: e, list: _revreg.list() }; },
  },
  {
    name: "melete.revocation.status",
    description: "Check whether a certificate is still valid: GOOD, or REVOKED (with reason + since-when). TIME-AWARE — pass atTime to ask whether it was valid at the moment of reliance (reliance before the effective time stays GOOD). Offline-verifiable against the authority-signed list.",
    inputSchema: { type: "object", properties: { certHash: { type: "string" }, atTime: { type: "number" } }, required: ["certHash"] },
    run: (a) => { const l = _revreg.list(); return { status: statusFromList(l, String(a.certHash||""), Number.isFinite(a.atTime)?a.atTime:undefined), listVerified: verifyRevocationList(l).ok, authority: l.authorityFingerprint }; },
  },
  {
    name: "melete.trustreport.build",
    description: "THE LIVE TRUST REPORT — one signed answer to 'is this AI trustworthy RIGHT NOW?'. Pass an array of member certificates [{ kind, certificate }]. For EVERY member it checks three things at once: (1) it VERIFIES, (2) it is NOT REVOKED as of atTime (time-aware, checked against the live governance revocation registry), and (3) — if a log tree head is available — it is INCLUDED in the public transparency log. Returns TRUSTED-NOW only if every member passes all three, else NOT-TRUSTED-NOW naming the exact member + reason. The verdict is Ed25519-signed and re-derivable offline. WHO BENEFITS: a non-expert consumer/procurement gets ONE answer instead of reading eight proofs; the issuer shows a live-good status; regulators get a current (not stale) signed verdict; end users are protected the moment any claim is revoked.",
    inputSchema: { type: "object", properties: { subject: { type: "string" }, members: { type: "array", description: "[{ kind, certificate }] — the member certificates to compose", items: { type: "object" } }, atTime: { type: "number", description: "reliance time (ms epoch); default now" } }, required: ["members"] },
    run: (a) => { const r = buildTrustReport({ subject: a.subject, members: a.members ?? [], verify: verifyByKind, atTime: Number.isFinite(a.atTime)?a.atTime:undefined, revocationList: _revreg.list() }); return { report: r, verdict: r.verdict, failing: r.failing, verified: verifyTrustReport(r, verifyByKind, { revocationList: _revreg.list() }).ok }; },
  },
  {
    name: "melete.witness.quorum",
    description: "Get the public log's current Signed Tree Head co-signed by a network of independent WITNESSES, and the quorum verdict — split-view immunity for the AI Transparency Log. A relying party trusts a tree head only if a quorum of distinct witnesses co-signed the SAME root. Pass an optional quorum (default 3 of 5).",
    inputSchema: { type: "object", properties: { quorum: { type: "number" } }, required: [] },
    run: (a) => { const sth = _translog.sth(); const cosignatures = (_witnesses.map((w) => w.cosign(sth)).filter((c) => !("refused" in c))) as any[]; const q = collectQuorum(sth, cosignatures, (a.quorum|0)||3); return { sth, cosignatures, quorum: q }; },
  },
  {
    name: "melete.witness.verify",
    description: "Verify a witness-quorum offline: count distinct valid witness co-signatures for a tree head against a quorum, and detect a split view (co-signatures for two different roots at the same size). Pass { sth, cosignatures, quorum }.",
    inputSchema: { type: "object", properties: { sth: { type: "object" }, cosignatures: { type: "array", items: { type: "object" } }, quorum: { type: "number" } }, required: ["sth","cosignatures"] },
    run: (a) => ({ quorum: collectQuorum(a.sth, a.cosignatures||[], (a.quorum|0)||3), splitView: detectSplitView(a.cosignatures||[]) }),
  },
  {
    name: "melete.translog.submit",
    description: "Append a claim (e.g. any Melete certificate payloadHash) to the PUBLIC AI Transparency Log — Certificate-Transparency-for-AI. Returns the leaf index + the new Signed Tree Head (the log's signed commitment to its state). Once logged, the claim is publicly provable and cannot be un-said: rewriting it is detectable via consistency proofs.",
    inputSchema: { type: "object", properties: { entry: { type: "string", description: "the claim to log, e.g. a certificate payloadHash" } }, required: ["entry"] },
    run: (a) => { const index = _translog.append(String(a.entry ?? "")); return { index, sth: _translog.sth() }; },
  },
  {
    name: "melete.translog.inclusion",
    description: "Get an inclusion proof that a logged claim (by leaf index) is in the public log, against the current Signed Tree Head. Verify offline with melete.verify kind sth + the proof.",
    inputSchema: { type: "object", properties: { index: { type: "number" } }, required: ["index"] },
    run: (a) => ({ proof: _translog.inclusionProof((a.index|0)), sth: _translog.sth() }),
  },
  {
    name: "melete.translog.verifyInclusion",
    description: "Verify offline that an entry is included in the log: pass the entry, its inclusion proof, and a Signed Tree Head. Recomputes the Merkle root and checks the tree-head signature.",
    inputSchema: { type: "object", properties: { entry: { type: "string" }, proof: { type: "object" }, sth: { type: "object" } }, required: ["entry","proof","sth"] },
    run: (a) => verifyEntryInclusion(String(a.entry??""), a.proof, a.sth),
  },
  {
    name: "melete.translog.verifyConsistency",
    description: "Verify offline that the log only APPENDED (never rewrote history) between two Signed Tree Heads: pass the consistency proof + the old STH + the new STH. Detects a rewrite or a split view.",
    inputSchema: { type: "object", properties: { proof: { type: "object" }, oldSth: { type: "object" }, newSth: { type: "object" } }, required: ["proof","oldSth","newSth"] },
    run: (a) => verifyLogConsistency(a.proof, a.oldSth, a.newSth),
  },
  {
    name: "melete.answer.prove",
    description: "Attach a verifiable trust tag to a SINGLE AI answer (Proof-Carrying Answer). Pass the input features, the modelʼs certified evidence envelope (support {lo[],hi[]}), the output, the stated confidence, and the certified-reliable confidence threshold (+ optional lineageRoot from an AIBOM, slaPeriod, calibrationCertHash). Returns a signed proof whose verdict is TRUSTED, OUT-OF-SCOPE (with the offending input dimension), or NEEDS-REVIEW (below the reliable threshold). A consumer/agent verifies it offline in O(dimensions) with melete.answer.verify — trusting one answer without trusting the producer.".replace("ʼ","") ,
    inputSchema: { type: "object", properties: { modelId: { type: "string" }, input: { type: "array" }, support: { type: "object", description: "{ lo:[], hi:[] } certified evidence envelope" }, output: {}, confidence: { type: "number" }, reliableConfidence: { type: "number" }, lineageRoot: { type: "string" }, slaPeriod: { type: "string" }, calibrationCertHash: { type: "string" } }, required: ["input","support","confidence"] },
    run: (a) => { const p = proveAnswer({ modelId:a.modelId, input:a.input??[], support:a.support??{lo:[],hi:[]}, output:a.output, confidence:a.confidence, reliableConfidence:a.reliableConfidence, lineageRoot:a.lineageRoot, slaPeriod:a.slaPeriod, calibrationCertHash:a.calibrationCertHash }); return { proof:p, verdict:p.verdict, verified: verifyAnswer(p).ok }; },
  },
  {
    name: "melete.answer.verify",
    description: "Verify a Proof-Carrying Answer offline: recompute the in-scope test on the input + the confidence gate + the verdict, and check the signature. No model or dataset needed.",
    inputSchema: { type: "object", properties: { proof: { type: "object" } }, required: ["proof"] },
    run: (a) => verifyAnswer(a.proof),
  },
  {
    name: "melete.audit.prove",
    description: "PROVE a model-quality claim over a HUGE PRIVATE dataset while the auditor sees only a tiny random sample — audit without handing over the data. Pass the per-record outcome bits (1 = the model was correct / the record satisfies the claim, 0 = not) + the claimed mean tau (+ optional margin, k). Returns a signed proof: a Merkle commitment to ALL records, a Fiat-Shamir challenge derived from the root that selects k records, and the openings for just those k (with Merkle paths). A claim inflated past tolerance is caught with probability rising toward 1 in k; the prover cannot cherry-pick the sample. WHO BENEFITS: the vendor proves compliance without exposing the model/data; the auditor/regulator audits a tiny sample; data subjects stay mostly private.",
    inputSchema: { type: "object", properties: { bits: { type: "array", description: "per-record 0/1 outcome (the thing whose mean is claimed)" }, tau: { type: "number", description: "claimed mean, e.g. 0.90" }, margin: { type: "number", description: "tolerance (default 0.03)" }, k: { type: "number", description: "sample size to reveal (default 300)" } }, required: ["bits", "tau"] },
    run: (a) => { const p = buildPrivateAuditProof({ bits: a.bits ?? [], tau: a.tau, margin: a.margin, k: a.k }); const v = verifyPrivateAuditProof(p); return { proof: p, verdict: p.verdict, revealed: p.openings.length, of: p.n, verified: v.ok }; },
  },
  {
    name: "melete.audit.verify",
    description: "Verify a Private Audit Proof offline: re-derive the Fiat-Shamir indices from the committed root (no cherry-picking), check every opening against the root (Merkle binding), recompute the sample statistic + the SUPPORTED/UNSUPPORTED verdict, and check the signature.",
    inputSchema: { type: "object", properties: { proof: { type: "object" } }, required: ["proof"] },
    run: (a) => verifyPrivateAuditProof(a.proof),
  },
  {
    name: "melete.aibom.verify",
    description: "Verify a Model Supply-Chain Certificate (AI Bill of Materials) — a MULTI-PARTY signed lineage of an AI model (base-model → fine-tune → quantize → deploy), where each step is signed by the key of the party responsible for it. Confirms every signature, the chain order, that no step derives from an artifact missing from the chain (provenance closure), and binds each step to its signer fingerprint. Returns ok + the responsibility map (who did which step). WHO BENEFITS: base-model vendor (attribution), fine-tuner + optimizer (prove their layer), deployer (prove an unbroken lineage), regulator/end-user (verify the whole provenance). Build it offline with buildAibom (each step signs with its own key); it also rides inside a Trust Passport (kind 'aibom').",
    inputSchema: { type: "object", properties: { lineage: { type: "object", description: "the AIBOM certificate to verify" } }, required: ["lineage"] },
    run: (a) => { const v = verifyAibom(a.lineage); return { ...v, report: v.ok ? aibomReport(a.lineage) : undefined }; },
  },
  {
    name: "melete.passport.issue",
    description: "Compose many Melete certificates into ONE signed Trust Passport. Pass members [{ kind, certificate }] (e.g. fairness + calibration + privacy + sla + consent). Returns a signed passport that binds each member by hash into an order-independent merkle root and re-verifies every member — so a buyer/regulator verifies the whole compliance posture in a single offline call (melete.passport.verify). The passport is itself a signed cert, so a verifier can counter-sign it with melete.receipt.issue (two-party). WHO BENEFITS: the issuer ships one artifact; the verifier checks everything at once + sees exactly which member (if any) failed.",
    inputSchema: { type: "object", properties: { issuer: { type: "string" }, subject: { type: "string" }, members: { type: "array", description: "[{ kind, certificate }]", items: { type: "object" } } }, required: ["members"] },
    run: (a) => { const p = trustPassport({ issuer: a.issuer, subject: a.subject, members: a.members ?? [], verify: verifyByKind }); return { passport: p, overallVerified: p.overallVerified, verified: verifyTrustPassport(p, verifyByKind).ok }; },
  },
  {
    name: "melete.passport.verify",
    description: "Verify a Trust Passport offline in one call: re-derives every member certificate (hash binding + per-kind re-verification), the merkle root, and the issuer signature. Returns ok + which members (if any) failed.",
    inputSchema: { type: "object", properties: { passport: { type: "object" } }, required: ["passport"] },
    run: (a) => verifyTrustPassport(a.passport, verifyByKind),
  },
  {
    name: "melete.consent.use",
    description: "Two-party GDPR consent. Given a data subject's signed consent grant (purposes, fields, expiry — issue it with the same shape, signed by the subject) and a proposed USE { purpose, fields, atTime }, the controller gets a signed Use Certificate whose verdict ALLOWED/DENIED is deterministically re-derived from the grant (purpose in scope? fields in scope? not expired? not revoked?). WHO BENEFITS: the subject can PROVE any out-of-scope use; the controller gets an audit-ready proof each use was within consent. Pass an optional signed revocation to enforce it.",
    inputSchema: { type: "object", properties: { receipt: { type: "object", description: "the subject's signed consent grant (from consentReceipt)" }, use: { type: "object", description: "{ purpose, fields:[], atTime }" }, revocation: { type: "object", description: "optional signed revocation" } }, required: ["receipt", "use"] },
    run: (a) => { const c = useCertificate({ receipt: a.receipt, use: a.use ?? {}, revocation: a.revocation ?? null }); return { useCertificate: c, verdict: c.verdict, reasons: c.reasons, verified: verifyUseCertificate(c, a.receipt, a.revocation ?? null).ok }; },
  },
  {
    name: "melete.receipt.issue",
    description: "TWO-PARTY trust: as a VERIFIER (regulator / auditor / customer / counterparty agent), independently re-derive an issuer's Melete certificate OFFLINE and counter-sign a Verification Receipt bound to it with your OWN key. Now both parties hold a signed record — the issuer proved a property, you confirmed it, and neither has to trust the other. Pass the certificate + its kind. Independence is enforced (a vendor cannot rubber-stamp itself).",
    inputSchema: { type: "object", properties: { kind: { type: "string", description: "the certificate kind (e.g. attribution, fairness, privacy, …)" }, certificate: { type: "object", description: "the issuer's signed certificate" } }, required: ["kind", "certificate"] },
    run: (a) => { const receipt = issueVerificationReceipt({ cert: a.certificate, certStandard: a.certificate?.standard, verify: (c) => verifyByKind(a.kind, c) }); return { receipt, valid: verifyVerificationReceipt({ receipt, cert: a.certificate, verify: (c) => verifyByKind(a.kind, c) }).ok }; },
  },
  {
    name: "melete.receipt.verify",
    description: "Check a TWO-PARTY Verification Receipt offline: the verifier's signature, that the receipt is bound to this exact certificate, that the re-derived verdict is truthful, and that issuer ≠ verifier (independent). Pass the receipt + the certificate + its kind.",
    inputSchema: { type: "object", properties: { kind: { type: "string" }, receipt: { type: "object" }, certificate: { type: "object" } }, required: ["kind", "receipt", "certificate"] },
    run: (a) => verifyVerificationReceipt({ receipt: a.receipt, cert: a.certificate, verify: (c) => verifyByKind(a.kind, c) }),
  },
  {
    name: "melete.gauntlet",
    description: "Run a correctness gauntlet — proof the engine works, re-runnable by the caller. Optionally name a module (selection|support|fdr); otherwise runs all.",
    inputSchema: { type: "object", properties: { module: { type: "string", enum: ["selection", "support", "fdr"] } } },
    run: (a) => { const g: Record<string, () => { score: number }> = { selection: selectionGauntlet, support: supportGauntlet, fdr: fdrGauntlet }; const keys = a.module && g[a.module] ? [a.module] : Object.keys(g); const out: Record<string, number> = {}; for (const k of keys) out[k] = g[k]().score; return out; },
  },
];

export interface JsonRpcRequest { jsonrpc?: string; id?: string | number | null; method?: string; params?: any; }
export interface JsonRpcResponse { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string }; }

export interface McpContext { ledger?: MeleteLedger; agent?: string; }

/** Handle one JSON-RPC 2.0 / MCP request. Pure + total: never throws — protocol errors come back as JSON-RPC errors.
 *  Pass a ctx with a ledger to meter + audit every tool call (a signed receipt is attached to the response). */
export function handleMcpRequest(req: JsonRpcRequest, ctx?: McpContext): JsonRpcResponse {
  const id = req && req.id !== undefined ? req.id : null;
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });
  try {
    if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") return err(-32600, "invalid request");
    switch (req.method) {
      case "initialize":
        return ok({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: MCP_SERVER_NAME, version: MCP_PROTOCOL_VERSION } });
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: MELETE_MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
      case "tools/call": {
        const name = req.params?.name; const args = req.params?.arguments ?? {};
        const tool = MELETE_MCP_TOOLS.find((t) => t.name === name);
        if (!tool) return ok({ content: [{ type: "text", text: "unknown tool: " + name }], isError: true });
        try {
          const out = tool.run(args);
          const receipt = ctx?.ledger ? ctx.ledger.record(ctx.agent ?? "anon", name, args, out) : undefined;
          const result: Record<string, unknown> = { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
          if (receipt) result._receipt = { seq: receipt.seq, hash: receipt.hash, sig: receipt.sig };   // signed usage + audit receipt
          return ok(result);
        }
        catch (e) { return ok({ content: [{ type: "text", text: "tool error: " + (e as Error).message.slice(0, 160) }], isError: true }); }
      }
      default:
        return err(-32601, "method not found: " + req.method);
    }
  } catch { return err(-32603, "internal error"); }
}

export function mcpGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const call = (method: string, params?: any, id: number = 1) => handleMcpRequest({ jsonrpc: "2.0", id, method, params });

  const init = call("initialize");
  const initOk = (init.result as any)?.serverInfo?.name === "melete" && !!(init.result as any)?.protocolVersion && !!(init.result as any)?.capabilities?.tools;

  const list = call("tools/list");
  const tools = (list.result as any)?.tools ?? [];
  const listOk = Array.isArray(tools) && tools.length >= 6 && tools.every((t: any) => typeof t.name === "string" && t.description && t.inputSchema && t.inputSchema.type === "object");

  // tools/call each data-driven tool and confirm the returned certificate VERIFIES (signed round-trip)
  const fdr = call("tools/call", { name: "melete.fdr", arguments: { zScores: [4.2, 3.8, 3.5, 0.3, 0.1, -0.2, 3.9], q: 0.1 } });
  const fdrOut = (fdr.result as any)?.structuredContent;
  const fdrOk = fdrOut?.verified === true && fdrOut?.certificate?.standard === "melete-fdr-certificate/v2" && !(fdr.result as any)?.isError;

  const sup = call("tools/call", { name: "melete.support", arguments: { design: [[0, 0], [1, 1], [0, 1], [1, 0]], recommended: [5, 0.5] } });
  const supOut = (sup.result as any)?.structuredContent;
  const supOk = supOut?.verified === true && supOut?.certificate?.verdict === "EXTRAPOLATION";

  const sel = call("tools/call", { name: "melete.selection", arguments: { values: [5.0, 6.1, 5.5, 7.2, 5.3, 6.8], sigma: 1.0 } });
  const selOut = (sel.result as any)?.structuredContent;
  const selOk = selOut?.verified === true && typeof selOut?.certificate?.correctedLowerBound === "number";

  const next = call("tools/call", { name: "melete.next", arguments: { space: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }], observations: [] } });
  const nextOut = (next.result as any)?.structuredContent;
  const nextOk = nextOut?.next && typeof nextOut.next === "object" && !(next.result as any)?.isError;

  // cross-tool: feed the fdr tool's certificate back to melete.verify → ok
  const ver = call("tools/call", { name: "melete.verify", arguments: { kind: "fdr", certificate: fdrOut?.certificate } });
  const verOk = (ver.result as any)?.structuredContent?.ok === true;

  const gaunt = call("tools/call", { name: "melete.gauntlet", arguments: { module: "fdr" } });
  const gauntOk = (gaunt.result as any)?.structuredContent?.fdr === 100;

  // error handling: unknown method, unknown tool, malformed
  const unknownMethod = call("foo/bar").error?.code === -32601;
  const unknownTool = ((call("tools/call", { name: "melete.nope", arguments: {} }).result as any)?.isError) === true;
  const malformed = !!handleMcpRequest({} as any).error && !!handleMcpRequest(null as any).error;   // never throws

  // deterministic: identical fdr calls produce byte-identical signed certificates
  const a1 = (call("tools/call", { name: "melete.fdr", arguments: { pValues: [0.001, 0.02, 0.3, 0.4], q: 0.1 } }).result as any)?.structuredContent?.certificate?.payloadHash;
  const a2 = (call("tools/call", { name: "melete.fdr", arguments: { pValues: [0.001, 0.02, 0.3, 0.4], q: 0.1 } }).result as any)?.structuredContent?.certificate?.payloadHash;
  const deterministic = !!a1 && a1 === a2;

  // R20 IMPROVE — THE TRUST LEDGER: meter + audit every tool call as a hash-chained, signed receipt
  const led = createLedger();
  const calls: Array<[string, string, any]> = [
    ["agentA", "melete.fdr", { zScores: [4.2, 3.5, 0.2], q: 0.1 }],
    ["agentB", "melete.support", { design: [[0, 0], [1, 1], [0, 1], [1, 0]], recommended: [5, 0.5] }],
    ["agentA", "melete.selection", { values: [5, 6, 7, 5.2], sigma: 1 }],
    ["agentA", "melete.fdr", { zScores: [3.9, 0.1, 0.2, 0.3], q: 0.1 }],
    ["agentC", "melete.next", { space: [{ name: "x", type: "real", min: 0, max: 1 }], observations: [] }],
  ];
  let recordedOk = true, fdrReceipt: any = null, fdrCertHash: string | null = null;
  for (let i = 0; i < calls.length; i++) {
    const [agent, name, args] = calls[i];
    const resp = handleMcpRequest({ jsonrpc: "2.0", id: 100 + i, method: "tools/call", params: { name, arguments: args } }, { ledger: led, agent });
    const r = (resp.result as any)?._receipt;
    if (!r || typeof r.hash !== "string" || r.seq !== i) recordedOk = false;
    if (i === 0) { fdrReceipt = r; fdrCertHash = (resp.result as any)?.structuredContent?.certificate?.payloadHash; }
  }
  const ledgerRecorded = recordedOk && led.receipts.length === calls.length;
  const chainOk = led.verifyChain().ok;
  // the receipt binds to the SIGNED result (its resultHash is the certificate's payloadHash)
  const receiptBindsCert = !!fdrCertHash && led.receipts[0].resultHash === fdrCertHash;
  // usage metering (the toll-booth bill): per-agent + per-tool tallies
  const u = led.usage();
  const usageOk = u.total === 5 && u.byAgent.agentA === 3 && u.byAgent.agentB === 1 && u.byAgent.agentC === 1 && u.byTool["melete.fdr"] === 2;
  // tamper: altering any recorded receipt is localized by verifyChain
  const led2 = createLedger();
  for (const [agent, name, args] of calls.slice(0, 3)) handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { ledger: led2, agent });
  led2.receipts[1].tool = "melete.evil";
  const tamperChk = led2.verifyChain(); const tamperCaught = !tamperChk.ok && tamperChk.brokenAt === 1;
  // deterministic chain: same keys + same calls → identical head hash (Ed25519 is deterministic)
  const kp = generateKeyPairSync("ed25519");
  const mkChain = () => { const l = createLedger(kp); for (const [agent, name, args] of calls) handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { ledger: l, agent }); return l.receipts[l.receipts.length - 1].hash; };
  const ledgerDeterministic = mkChain() === mkChain();

  const checks = [
    { name: "INITIALIZE (MCP handshake)", pass: initOk, detail: `serverInfo.name=melete, protocolVersion=${MCP_PROTOCOL_VERSION}, tools capability advertised` },
    { name: "TOOLS-LIST", pass: listOk, detail: `${tools.length} agent-callable tools advertised, each with name + JSON input schema` },
    { name: "CALL melete.fdr (signed round-trip)", pass: fdrOk, detail: "an agent's z-scores → a signed FDR certificate that re-verifies (verified:true)" },
    { name: "CALL melete.support (signed)", pass: supOk, detail: "design + an out-of-hull recommendation → EXTRAPOLATION verdict, verified" },
    { name: "CALL melete.selection (signed)", pass: selOk, detail: "N observed values + σ → a signed de-biased lower bound, verified" },
    { name: "CALL melete.next (engine)", pass: nextOk, detail: "knobs + history → the next setting to evaluate" },
    { name: "CROSS-TOOL melete.verify", pass: verOk, detail: "a certificate returned by one tool re-verifies through melete.verify — trust without trusting the server" },
    { name: "CALL melete.gauntlet", pass: gauntOk, detail: "the caller can re-run a correctness gauntlet over MCP (fdr → 100)" },
    { name: "ERROR-HANDLING (JSON-RPC)", pass: unknownMethod && unknownTool && malformed, detail: "unknown method → -32601; unknown tool → isError; malformed/null → JSON-RPC error, never a throw" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "identical tool calls return byte-identical signed certificates" },
    { name: "LEDGER-RECORDS (signed receipt/call)", pass: ledgerRecorded, detail: `every tool call left a hash-chained signed receipt (${led.receipts.length}/${calls.length}), attached to the response` },
    { name: "LEDGER-CHAIN-VERIFIES", pass: chainOk, detail: "the whole receipt chain re-verifies offline (hashes + prev-links + Ed25519 signatures)" },
    { name: "RECEIPT-BINDS-SIGNED-RESULT", pass: receiptBindsCert, detail: "a receipt's resultHash is the certificate's own payloadHash — it proves WHICH signed result was served" },
    { name: "USAGE-METERED (toll-booth bill)", pass: usageOk, detail: `tamper-evident usage tally: total ${u.total}, agentA=${u.byAgent.agentA}, melete.fdr=${u.byTool["melete.fdr"]} — the number you bill on` },
    { name: "LEDGER-TAMPER-LOCALIZED", pass: tamperCaught, detail: `altering a recorded receipt is caught and pinned to the exact entry (brokenAt=${tamperChk.brokenAt})` },
    { name: "LEDGER-DETERMINISTIC", pass: ledgerDeterministic, detail: "same key + same call sequence → identical chain head hash" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
