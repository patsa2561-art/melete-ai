/**
 * MELETE — the Self-Driving Discovery Brain.
 *
 * Mneme remembers; Melete discovers. A closed-loop engine that proposes the next best experiment, reads
 * the result from ANY pluggable oracle (simulation, a lab robot over HTTP, a factory process, a
 * hyperparameter trainer, an expensive A/B test), learns, and converges — recording every step as a
 * signed, hash-chained, offline-verifiable DISCOVERY TRACE. Two engines: the classical Bayesian-lite, and
 * the original MELETE RESONANCE FIELD (a non-Bayesian wave-interference optimiser).
 */
export * from "./space.js";
export * from "./oracle.js";
export * from "./engine.js";
export * from "./resonance.js";
export * from "./arms.js";
export * from "./portfolio.js";
export * from "./cortex.js";
export * from "./trace.js";
export * from "./bench.js";
export * from "./replicate.js";
export * from "./interactive.js";
export * from "./frontier.js";
export * from "./reliability.js";
export * from "./certify.js";
export * from "./poopt.js";
export * from "./federated.js";
export * from "./multiobjective.js";
export * from "./sensitivity.js";
export * from "./noise.js";
export * from "./interaction.js";
export * from "./territory.js";
export * from "./costaware.js";
export * from "./confidence.js";
export * from "./drift.js";
export * from "./achievability.js";
export * from "./inverse.js";
export * from "./efficiency.js";
export * from "./prescription.js";
export * from "./batch.js";
export * from "./twin.js";
export * from "./constrained.js";
export * from "./lineage.js";
export * from "./sloppiness.js";
export * from "./cliff.js";
export * from "./prime.js";
export * from "./surprise.js";
export * from "./rashomon.js";
export * from "./shape.js";
export * from "./transfer.js";
export * from "./aegis.js";
export * from "./noiserobust.js";
export * from "./mixedspace.js";
export * from "./provenance.js";
export * from "./nullengine.js";
export * from "./causal.js";
export * from "./trustcert.js";
export * from "./summit.js";
export * from "./honestsearch.js";
export * from "./tolerance.js";
export * from "./improvement.js";
export * from "./prereg.js";
export * from "./breakdown.js";
export * from "./winnerscurse.js";
export * from "./support.js";
export * from "./fdr.js";
export * from "./anytime.js";
export * from "./swarm.js";
export * from "./conformal.js";
export * from "./subgroup.js";
export * from "./calibration.js";
export * from "./privacy.js";
export * from "./unlearning.js";
export * from "./dro.js";
export * from "./fairness.js";
export * from "./design.js";
export * from "./shapley.js";
export * from "./receipt.js";
export * from "./sla.js";
export * from "./consent.js";
export * from "./passport.js";
export * from "./aibom.js";
export * from "./spotcheck.js";
export * from "./pca.js";
export * from "./translog.js";
export * from "./witness.js";
export * from "./durable.js";
export * from "./revocation.js";
export * from "./mcp.js";
export * from "./sovereign.js";
export * from "./replay.js";
export * from "./metabrain.js";
export * from "./ipshield.js";
export * from "./guardian.js";
export * from "./journalist.js";
export * from "./server.js";

import { type DiscoverOpts, type DiscoveryResult, type Step, discover } from "./engine.js";
import { resonanceDiscover, type ResonanceOpts } from "./resonance.js";
import { portfolioDiscover, type PortfolioOpts } from "./portfolio.js";
import { Tracer, type SignedTrace } from "./trace.js";

export type EngineName = "portfolio" | "resonance" | "bayes";
export interface SignedDiscovery { result: DiscoveryResult; trace: SignedTrace; engine: EngineName }

/**
 * Run a discovery AND emit a signed, offline-verifiable trace of how it was made. Every proposed
 * experiment (hypothesis + rationale) and its observation is recorded into a tamper-evident chain.
 */
export async function discoverSigned(opts: (DiscoverOpts | ResonanceOpts | PortfolioOpts) & { engine?: EngineName; tracer?: Tracer }): Promise<SignedDiscovery> {
  const engine: EngineName = opts.engine ?? "portfolio";   // portfolio is the production default; bayes = proven single core; resonance = experimental
  const tracer = opts.tracer ?? new Tracer();
  tracer.record("result", { phase: "config", engine, goal: opts.goal ?? "maximize", budget: opts.budget, seed: opts.seed ?? 1, dims: opts.space?.dims?.map((d) => d.name) });
  const onStep = async (s: Step) => {
    tracer.record("hypothesis", { n: s.n, experiment: s.experiment, rationale: s.rationale, acquisition: s.acquisition });
    tracer.record("observation", { n: s.n, experiment: s.experiment, value: s.value });
  };
  const result = engine === "portfolio" ? await portfolioDiscover({ ...(opts as PortfolioOpts), onStep })
    : engine === "resonance" ? await resonanceDiscover({ ...(opts as ResonanceOpts), onStep })
    : await discover({ ...(opts as DiscoverOpts), onStep });
  tracer.record("result", { phase: "final", best: result.best, evaluations: result.evaluations, converged: result.converged });
  return { result, trace: tracer.export(), engine };
}

// ── aggregate gauntlet — every module must score 100 (Mneme-grade discipline) ──────────────────
import { spaceGauntlet } from "./space.js";
import { oracleGauntlet } from "./oracle.js";
import { engineGauntlet } from "./engine.js";
import { resonanceGauntlet } from "./resonance.js";
import { armsGauntlet } from "./arms.js";
import { portfolioGauntlet } from "./portfolio.js";
import { traceGauntlet } from "./trace.js";
import { benchGauntlet } from "./bench.js";
import { cortexGauntlet } from "./cortex.js";
import { replicateGauntlet } from "./replicate.js";
import { interactiveGauntlet } from "./interactive.js";
import { frontierGauntlet } from "./frontier.js";
import { reliabilityGauntlet } from "./reliability.js";
import { certifyGauntlet } from "./certify.js";
import { pooptGauntlet } from "./poopt.js";
import { federatedGauntlet } from "./federated.js";
import { multiObjectiveGauntlet } from "./multiobjective.js";
import { sensitivityGauntlet } from "./sensitivity.js";
import { noiseGauntlet } from "./noise.js";
import { interactionGauntlet } from "./interaction.js";
import { territoryGauntlet } from "./territory.js";
import { costAwareGauntlet } from "./costaware.js";
import { confidenceGauntlet } from "./confidence.js";
import { driftGauntlet } from "./drift.js";
import { achievabilityGauntlet } from "./achievability.js";
import { inverseGauntlet } from "./inverse.js";
import { efficiencyGauntlet } from "./efficiency.js";
import { prescriptionGauntlet } from "./prescription.js";
import { batchGauntlet } from "./batch.js";
import { twinGauntlet } from "./twin.js";
import { constrainedGauntlet } from "./constrained.js";
import { lineageGauntlet } from "./lineage.js";
import { sloppinessGauntlet } from "./sloppiness.js";
import { cliffGauntlet } from "./cliff.js";
import { primeGauntlet } from "./prime.js";
import { surpriseGauntlet } from "./surprise.js";
import { rashomonGauntlet } from "./rashomon.js";
import { shapeGauntlet } from "./shape.js";
import { transferGauntlet } from "./transfer.js";
import { aegisGauntlet } from "./aegis.js";
import { noiseRobustGauntlet } from "./noiserobust.js";
import { mixedGauntlet } from "./mixedspace.js";
import { provenanceGauntlet } from "./provenance.js";
import { nullEngineGauntlet } from "./nullengine.js";
import { causalGauntlet } from "./causal.js";
import { trustCertGauntlet } from "./trustcert.js";
import { stabilityGauntlet } from "./summit.js";
import { honestSearchGauntlet } from "./honestsearch.js";
import { toleranceGauntlet } from "./tolerance.js";
import { improvementGauntlet } from "./improvement.js";
import { preRegGauntlet } from "./prereg.js";
import { breakdownGauntlet } from "./breakdown.js";
import { selectionGauntlet } from "./winnerscurse.js";
import { supportGauntlet } from "./support.js";
import { fdrGauntlet } from "./fdr.js";
import { anytimeGauntlet } from "./anytime.js";
import { swarmGauntlet } from "./swarm.js";
import { conformalGauntlet } from "./conformal.js";
import { subgroupGauntlet } from "./subgroup.js";
import { calibrationGauntlet } from "./calibration.js";
import { privacyGauntlet } from "./privacy.js";
import { unlearningGauntlet } from "./unlearning.js";
import { droGauntlet } from "./dro.js";
import { fairnessGauntlet } from "./fairness.js";
import { designGauntlet } from "./design.js";
import { attributionGauntlet } from "./shapley.js";
import { receiptGauntlet } from "./receipt.js";
import { slaGauntlet } from "./sla.js";
import { consentGauntlet } from "./consent.js";
import { passportGauntlet } from "./passport.js";
import { aibomGauntlet } from "./aibom.js";
import { spotcheckGauntlet } from "./spotcheck.js";
import { pcaGauntlet } from "./pca.js";
import { translogGauntlet } from "./translog.js";
import { witnessGauntlet } from "./witness.js";
import { durableGauntlet } from "./durable.js";
import { revocationGauntlet } from "./revocation.js";
import { mcpGauntlet } from "./mcp.js";
import { sovereignGauntlet } from "./sovereign.js";
import { replayGauntlet } from "./replay.js";
import { metabrainGauntlet } from "./metabrain.js";
import { ipShieldGauntlet } from "./ipshield.js";
import { guardianGauntlet } from "./guardian.js";
import { journalistGauntlet } from "./journalist.js";
import { serverGauntlet } from "./server.js";

export interface MeleteGauntlet { score: 0 | 100; modules: Array<{ name: string; score: number; checks: Array<{ name: string; pass: boolean }> }> }
export async function meleteGauntlet(): Promise<MeleteGauntlet> {
  const mods: Array<{ name: string; g: { score: number; checks: Array<{ name: string; pass: boolean }> } }> = [
    { name: "space", g: spaceGauntlet() },
    { name: "oracle", g: oracleGauntlet() },
    { name: "engine", g: await engineGauntlet() },
    { name: "resonance", g: await resonanceGauntlet() },
    { name: "arms", g: armsGauntlet() },
    { name: "portfolio", g: await portfolioGauntlet() },
    { name: "cortex", g: cortexGauntlet() },
    { name: "replicate", g: await replicateGauntlet() },
    { name: "interactive", g: interactiveGauntlet() },
    { name: "frontier", g: frontierGauntlet() },
    { name: "reliability", g: await reliabilityGauntlet() },
    { name: "certify", g: await certifyGauntlet() },
    { name: "poopt", g: pooptGauntlet() },
    { name: "federated", g: federatedGauntlet() },
    { name: "multiobjective", g: multiObjectiveGauntlet() },
    { name: "sensitivity", g: sensitivityGauntlet() },
    { name: "noise", g: noiseGauntlet() },
    { name: "interaction", g: interactionGauntlet() },
    { name: "territory", g: territoryGauntlet() },
    { name: "costaware", g: costAwareGauntlet() },
    { name: "confidence", g: confidenceGauntlet() },
    { name: "drift", g: driftGauntlet() },
    { name: "achievability", g: achievabilityGauntlet() },
    { name: "inverse", g: inverseGauntlet() },
    { name: "efficiency", g: efficiencyGauntlet() },
    { name: "prescription", g: prescriptionGauntlet() },
    { name: "batch", g: batchGauntlet() },
    { name: "twin", g: twinGauntlet() },
    { name: "constrained", g: constrainedGauntlet() },
    { name: "lineage", g: lineageGauntlet() },
    { name: "sloppiness", g: sloppinessGauntlet() },
    { name: "cliff", g: cliffGauntlet() },
    { name: "prime", g: primeGauntlet() },
    { name: "surprise", g: surpriseGauntlet() },
    { name: "rashomon", g: rashomonGauntlet() },
    { name: "shape", g: shapeGauntlet() },
    { name: "transfer", g: transferGauntlet() },
    { name: "aegis", g: aegisGauntlet() },
    { name: "noiserobust", g: noiseRobustGauntlet() },
    { name: "mixedspace", g: mixedGauntlet() },
    { name: "provenance", g: provenanceGauntlet() },
    { name: "nullengine", g: nullEngineGauntlet() },
    { name: "causal", g: causalGauntlet() },
    { name: "trustcert", g: trustCertGauntlet() },
    { name: "summit", g: await stabilityGauntlet() },
    { name: "honestsearch", g: await honestSearchGauntlet() },
    { name: "tolerance", g: toleranceGauntlet() },
    { name: "improvement", g: improvementGauntlet() },
    { name: "prereg", g: preRegGauntlet() },
    { name: "breakdown", g: breakdownGauntlet() },
    { name: "winnerscurse", g: selectionGauntlet() },
    { name: "support", g: supportGauntlet() },
    { name: "fdr", g: fdrGauntlet() },
    { name: "anytime", g: anytimeGauntlet() },
    { name: "swarm", g: swarmGauntlet() },
    { name: "conformal", g: conformalGauntlet() },
    { name: "subgroup", g: subgroupGauntlet() },
    { name: "calibration", g: calibrationGauntlet() },
    { name: "privacy", g: privacyGauntlet() },
    { name: "unlearning", g: unlearningGauntlet() },
    { name: "dro", g: droGauntlet() },
    { name: "fairness", g: fairnessGauntlet() },
    { name: "design", g: designGauntlet() },
    { name: "shapley", g: attributionGauntlet() },
    { name: "receipt", g: receiptGauntlet() },
    { name: "sla", g: slaGauntlet() },
    { name: "consent", g: consentGauntlet() },
    { name: "passport", g: passportGauntlet() },
    { name: "aibom", g: aibomGauntlet() },
    { name: "spotcheck", g: spotcheckGauntlet() },
    { name: "pca", g: pcaGauntlet() },
    { name: "translog", g: translogGauntlet() },
    { name: "witness", g: witnessGauntlet() },
    { name: "durable", g: durableGauntlet() },
    { name: "revocation", g: revocationGauntlet() },
    { name: "mcp", g: mcpGauntlet() },
    { name: "sovereign", g: sovereignGauntlet() },
    { name: "replay", g: replayGauntlet() },
    { name: "metabrain", g: metabrainGauntlet() },
    { name: "ipshield", g: ipShieldGauntlet() },
    { name: "guardian", g: guardianGauntlet() },
    { name: "journalist", g: journalistGauntlet() },
    { name: "trace", g: traceGauntlet() },
    { name: "bench", g: await benchGauntlet() },
    { name: "server", g: serverGauntlet() },
  ];
  const modules = mods.map((m) => ({ name: m.name, score: m.g.score, checks: m.g.checks }));
  return { score: modules.every((m) => m.score === 100) ? 100 : 0, modules };
}
