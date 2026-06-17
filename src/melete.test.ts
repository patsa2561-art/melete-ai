import { describe, it, expect } from "vitest";
import {
  spaceGauntlet, oracleGauntlet, traceGauntlet, meleteGauntlet,
  lcg, gridCandidates, randomCandidates, localCandidates, clampExperiment,
  simOracle, meteredOracle, scoredOracle, compositeOracle,
  discover, engineGauntlet,
  resonanceDiscover, resonanceGauntlet, resonanceVsBayes,
  armsGauntlet, defaultArms,
  portfolioDiscover, portfolioGauntlet,
  replicate, replicateGauntlet, certifyReplication, extractClaim,
  vizProject,
  Tracer, verifyTrace,
  multimodal, rugged, benchSpace, benchmark, benchGauntlet, robustnessBench,
  discoverSigned,
  frontierGauntlet, stoppingAdvice, reliabilityGauntlet, certifyGauntlet, certifyOptimality, pooptGauntlet, issueProofOfOptimization, verifyProofOfOptimization, federatedGauntlet, contribute, mergePool, verifyPool, multiObjectiveGauntlet, paretoFront, dominates, proposeNextMulti, sensitivityGauntlet, analyzeSensitivity, noiseGauntlet, analyzeNoise, interactionGauntlet, analyzeInteractions, territoryGauntlet, assessTerritory, coverageScore, costAwareGauntlet, proposeNextCostAware, costAwareDiscover, confidenceGauntlet, stopConfidence, driftGauntlet, analyzeDrift, achievabilityGauntlet, assessAchievability, inverseGauntlet, inverseDesign, efficiencyGauntlet, discoveryEfficiency, prescriptionGauntlet, buildPrescription, batchGauntlet, proposeBatch, twinGauntlet, predictAt, constrainedGauntlet, bestFeasible, proposeNextSafe, lineageGauntlet, buildLineage, sloppinessGauntlet, analyzeSloppiness, cliffGauntlet, analyzeCliffs, primeGauntlet, meletePrime, surpriseGauntlet, analyzeSurprise, rashomonGauntlet, analyzeRashomon, processIntelligence, shapeGauntlet, analyzeShape, transferGauntlet, warmStartSeeds, transferDiscover, aegisGauntlet, aegisDiscover, noiseRobustGauntlet, noiseRobustDiscover, mixedGauntlet, mixedDiscover, provenanceGauntlet, buildCheckpoint, appendEvent, verifyAgainst, signCheckpoint, verifyCheckpointSignature, nullEngineGauntlet, nullEngineDiscover, causalGauntlet, causalDiscover, verifyProofOfCausation, trustCertGauntlet, issueTrustCertificate, verifyTrustCertificate, stabilityGauntlet, honestSearchGauntlet, issueSearchProof, auditSearchProof, toleranceGauntlet, improvementGauntlet, preRegGauntlet, breakdownGauntlet, selectionGauntlet, supportGauntlet, fdrGauntlet, anytimeGauntlet, swarmGauntlet, conformalGauntlet, subgroupGauntlet, calibrationGauntlet, privacyGauntlet, unlearningGauntlet, mcpGauntlet, handleMcpRequest, sovereignGauntlet, sovereignAnalyze, verifySovereign, replayGauntlet, issueReplayToken, replayToken, metabrainGauntlet, landscapeFingerprint, recommendProfile, ipShieldGauntlet, buildIpAuditTrail, verifyIpAuditTrail, guardianGauntlet, guardianTick, journalistGauntlet, VERTICALS, narrate,
} from "./index.js";

describe("gauntlets (every module = 100)", () => {
  it("space", () => expect(spaceGauntlet().score).toBe(100));
  it("oracle", () => expect(oracleGauntlet().score).toBe(100));
  it("trace", () => expect(traceGauntlet().score).toBe(100));
  it("engine", async () => expect((await engineGauntlet()).score).toBe(100));
  it("resonance", async () => expect((await resonanceGauntlet()).score).toBe(100));
  it("bench", async () => expect((await benchGauntlet()).score).toBe(100));
  it("arms", () => expect(armsGauntlet().score).toBe(100));
  it("portfolio", async () => expect((await portfolioGauntlet()).score).toBe(100));
  it("replicate", async () => expect((await replicateGauntlet()).score).toBe(100));
  it("frontier", () => expect(frontierGauntlet().score).toBe(100));
  it("reliability (≥99% of optimum on every landscape, every seed)", async () => expect((await reliabilityGauntlet()).score).toBe(100));
  it("certify (optimality certificate)", async () => expect((await certifyGauntlet()).score).toBe(100));
  it("poopt (proof of optimization)", () => expect(pooptGauntlet().score).toBe(100));
  it("federated (multi-lab signed pool)", () => expect(federatedGauntlet().score).toBe(100));
  it("multiobjective (Pareto front)", () => expect(multiObjectiveGauntlet().score).toBe(100));
  it("sensitivity (process tolerance)", () => expect(sensitivityGauntlet().score).toBe(100));
  it("noise (replication advisor)", () => expect(noiseGauntlet().score).toBe(100));
  it("interaction (variable coupling map)", () => expect(interactionGauntlet().score).toBe(100));
  it("territory (leap detector)", () => expect(territoryGauntlet().score).toBe(100));
  it("costaware (optimize per cost)", () => expect(costAwareGauntlet().score).toBe(100));
  it("confidence (calibrated probabilistic stop)", () => expect(confidenceGauntlet().score).toBe(100));
  it("drift (temporal-confound detector)", () => expect(driftGauntlet().score).toBe(100));
  it("achievability (is the target reachable)", () => expect(achievabilityGauntlet().score).toBe(100));
  it("inverse design (recipes that hit a target)", () => expect(inverseGauntlet().score).toBe(100));
  it("discovery efficiency η = ∛(G·R·T)", () => expect(efficiencyGauntlet().score).toBe(100));
  it("prescription (the plain-language action card)", () => expect(prescriptionGauntlet().score).toBe(100));
  it("batch planner (k diverse parallel experiments)", () => expect(batchGauntlet().score).toBe(100));
  it("what-if twin (predict a setting with honest confidence)", () => expect(twinGauntlet().score).toBe(100));
  it("safe optimization (constraints + safety margin)", () => expect(constrainedGauntlet().score).toBe(100));
  it("discovery brain (improvement-lineage tree)", () => expect(lineageGauntlet().score).toBe(100));
  it("sloppiness (effective dimensionality / stiff-sloppy)", () => expect(sloppinessGauntlet().score).toBe(100));
  it("cliff / tipping-point detector", () => expect(cliffGauntlet().score).toBe(100));
  it("◆ MELETE PRIME (the Red Diamond — unified brain)", () => expect(primeGauntlet().score).toBe(100));
  it("breakthrough radar / surprise detector", () => expect(surpriseGauntlet().score).toBe(100));
  it("rashomon set / equifinality (the family of best recipes)", () => expect(rashomonGauntlet().score).toBe(100));
  it("response shape (peak / ridge / saddle / plateau / bowl)", () => expect(shapeGauntlet().score).toBe(100));
  it("transfer / warm-start (remember across runs)", () => expect(transferGauntlet().score).toBe(100));
  it("🛡 AEGIS — the self-aware engine (robust, not fragile, optimum)", () => expect(aegisGauntlet().score).toBe(100));
  it("🛰 NOISE-ROBUST — trustworthy optimum under measurement noise (≥97.5% Wilson-LB)", () => expect(noiseRobustGauntlet().score).toBe(100));
  it("🧩 MIXED-SPACE — categorical + integer + conditional optimization (≥97.5% Wilson-LB)", () => expect(mixedGauntlet().score).toBe(100));
  it("📜 PROVENANCE — O(1) tamper-evident audit trail for 24/7 runs (100% tamper detection)", () => expect(provenanceGauntlet().score).toBe(100));
  it("⬛ NULL ENGINE — knows when there's nothing to find (REAL vs NULL, calibrated FP≤2.5%) + never crashes", () => expect(nullEngineGauntlet().score).toBe(100));
  it("🧬 CAUSAL ENGINE — proves causation not correlation: flags confounded knobs + signed Proof of Causation", () => expect(causalGauntlet().score).toBe(100));
  it("🏅 TRUST CERTIFICATE — fuses SIGNAL+CAUSAL+ROBUST into one signed verdict; refuses noisy/confounded/fragile", () => expect(trustCertGauntlet().score).toBe(100));
  it("🏔 STABILITY CERTIFICATE — STABLE⇒reproducible ≥97.5% (held-out) + calibrated + signed", async () => expect((await stabilityGauntlet()).score).toBe(100));
  it("💎 HONEST-SEARCH PROOF — genuine verifies, 6 forgery classes rejected (oracle-free re-derivation)", async () => expect((await honestSearchGauntlet()).score).toBe(100));
  it("🛡 TOLERANCE CERTIFICATE — Lipschitz-guaranteed ±radius floor holds vs off-grid adversarial samples + calibrated + signed", () => expect(toleranceGauntlet().score).toBe(100));
  it("📜 PROOF OF IMPROVEMENT — certified gain Δ valid ≥97.5%, false-cert ≤2.5%, has power, signed", () => expect(improvementGauntlet().score).toBe(100));
  it("🔐 PRE-REGISTRATION — genuine conforms, 6 goalpost-moving deviations rejected (commit-reveal)", () => expect(preRegGauntlet().score).toBe(100));
  it("🪨 DECISION-BREAKDOWN — exact tamper-distance (m flips, m−1 holds), discriminates, forged m rejected, signed", () => expect(breakdownGauntlet().score).toBe(100));
  it("📉 SELECTION-BIAS (winner's curse) — de-biased lower bound valid ≥97.5%, naive overstates, monotone-in-N, signed", () => expect(selectionGauntlet().score).toBe(100));
  it("🧭 EXTRAPOLATION-GUARD (support) — out-of-box flagged with a separating witness, no false positives, signed", () => expect(supportGauntlet().score).toBe(100));
  it("📊 FALSE-DISCOVERY (multiple-testing) — BH controls FDR ≤ q, naive inflates, has power, forged discovery rejected, signed", () => expect(fdrGauntlet().score).toBe(100));
  it("⏱ ANYTIME-VALID (e-value) — optional-stopping FP ≤ α, naive peeking inflates, has power, forged stop rejected, signed", () => expect(anytimeGauntlet().score).toBe(100));
  it("🤝 SWARM-EVIDENCE — pools agents' e-values (swarm>single), null ≤ α, a lying agent excluded by re-derivation, signed", () => expect(swarmGauntlet().score).toBe(100));
  it("📏 CONFORMAL-PREDICTION — distribution-free coverage ≥ 1−α, finite-sample exact, tighter than Gaussian on skew, signed", () => expect(conformalGauntlet().score).toBe(100));
  it("👥 SUBGROUP-VALIDITY — detects + names a harmed segment the average hides, no false harm (Bonferroni), signed", () => expect(subgroupGauntlet().score).toBe(100));
  it("🎯 CALIBRATION v2 — global Spiegelhalter Z + per-bin Hosmer-Lemeshow catch the mid-range blind spot, worst bin localized, false-flag ≤ α, signed", () => expect(calibrationGauntlet().score).toBe(100));
  it("🔒 PRIVACY v2 — analytic-Gaussian (ε,δ)-DP + zCDP accountant: membership attack stays in-region, under-noise caught, zCDP composition admits more releases & stays sound, signed", () => expect(privacyGauntlet().score).toBe(100));
  it("🗑 UNLEARNING — right-to-be-forgotten: rank-1 downdate == full retraining to machine precision, fake/partial deletion caught, signed", () => expect(unlearningGauntlet().score).toBe(100));
  it("🔌 MCP SERVER — agent-callable trust middleware: handshake, tools/list, signed tool round-trips, JSON-RPC errors", () => expect(mcpGauntlet().score).toBe(100));
  it("🏅 TRUST CERTIFICATE — signed, offline-verifiable, breaks on tamper", () => {
    const space = { dims: [{ name: "x0", type: "real" as const, min: 0, max: 1 }, { name: "x1", type: "real" as const, min: 0, max: 1 }] };
    const f = (e: Record<string, number>) => 100 * Math.exp(-((((e.x0 ?? 0) - 0.4) ** 2) + (((e.x1 ?? 0) - 0.6) ** 2)) / 0.7);
    const c = issueTrustCertificate({ space, oracle: f, seed: 3 });
    expect(verifyTrustCertificate(c).ok).toBe(true);
    expect(verifyTrustCertificate({ ...c, verdict: c.verdict === "TRUSTWORTHY" ? "NOT-TRUSTWORTHY" : "TRUSTWORTHY" }).ok).toBe(false);
  });
  it("🧠 META-BRAIN — federated landscape meta-learning (privacy-safe)", () => expect(metabrainGauntlet().score).toBe(100));
  it("🛡 IP SHIELD — patent-grade audit trail", () => expect(ipShieldGauntlet().score).toBe(100));
  it("📡 JOURNALIST — 6 vertical demos + real-number narration", () => expect(journalistGauntlet().score).toBe(100));
  it("🚨 GUARDIAN — continuous guardrail (detect + recommend)", () => expect(guardianGauntlet().score).toBe(100));
  it("⏪ REPLAY TOKEN — deterministic, signed, offline step-by-step replay", () => expect(replayGauntlet().score).toBe(100));
  it("👑 SOVEREIGN — the ecosystem spine (4 layers + signed verifiable verdict)", () => expect(sovereignGauntlet().score).toBe(100));
  it("Φ process-intelligence formula: identity + conjunctive + bounded", () => { expect(processIntelligence({ optimized: 1, robust: 1, trustworthy: 1, confident: 1, understood: 1, safe: 1, feasible: 1 })).toBe(100); expect(processIntelligence({ optimized: 0, robust: 1, trustworthy: 1, confident: 1, understood: 1, safe: 1, feasible: 1 })).toBe(0); });
  it("aggregate meleteGauntlet = 100 over all 70 modules", async () => {
    const g = await meleteGauntlet();
    expect(g.score).toBe(100);
    expect(g.modules.map((m) => m.name).sort()).toEqual(["achievability", "aegis", "anytime", "arms", "batch", "bench", "breakdown", "calibration", "causal", "certify", "cliff", "confidence", "conformal", "constrained", "cortex", "costaware", "drift", "efficiency", "engine", "fdr", "federated", "frontier", "guardian", "honestsearch", "improvement", "interaction", "interactive", "inverse", "ipshield", "journalist", "lineage", "mcp", "metabrain", "mixedspace", "multiobjective", "noise", "noiserobust", "nullengine", "oracle", "poopt", "portfolio", "prereg", "prescription", "prime", "privacy", "provenance", "rashomon", "reliability", "replay", "replicate", "resonance", "sensitivity", "server", "shape", "sloppiness", "sovereign", "space", "subgroup", "summit", "support", "surprise", "swarm", "territory", "tolerance", "trace", "transfer", "trustcert", "twin", "unlearning", "winnerscurse"]);
  });
});

describe("portfolio (SUPER NOVA — context-adaptive ensemble)", () => {
  it("converges on a smooth surface", async () => {
    const r = await portfolioDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 80, seed: 7, goal: "maximize", target: 0.99 });
    expect(r.best.value).toBeGreaterThanOrEqual(0.99);
  });
  it("default portfolio holds the curated arms (incl a real GP) and allocates across them", async () => {
    expect(defaultArms().map((a) => a.name).sort()).toEqual(["anneal", "basin-hop", "cmaes", "gp", "kernel-ucb", "maximin", "random", "trust-region"]);
    const r = await portfolioDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 40, seed: 1, goal: "maximize" });
    expect(r.armStats.reduce((s, a) => s + a.pulls, 0)).toBeGreaterThan(0);
  });
  it("is deterministic (same seed → same result + same allocation)", async () => {
    const a = await portfolioDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 50, seed: 4, goal: "maximize" });
    const b = await portfolioDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 50, seed: 4, goal: "maximize" });
    expect(JSON.stringify(a.best)).toBe(JSON.stringify(b.best));
    expect(JSON.stringify(a.armStats)).toBe(JSON.stringify(b.armStats));
  });
  it("ROBUSTNESS: on the rugged landscape the ensemble beats every single arm (No-Free-Lunch payoff)", async () => {
    const rows = await robustnessBench(3);
    const r = rows.find((x) => x.landscape === "rugged-2D")!;
    expect(r.portfolio).toBeGreaterThan(r.kernelUcb);
    expect(r.portfolio).toBeGreaterThan(r.cmaes);
    expect(r.portfolio).toBeGreaterThan(r.random);
    // and it is never the worst on any landscape
    expect(rows.every((x) => !x.portfolioIsWorst)).toBe(true);
  });
});

describe("space", () => {
  it("seeded candidate generation is reproducible", () => {
    expect(JSON.stringify(randomCandidates(benchSpace, 5, lcg(3)))).toBe(JSON.stringify(randomCandidates(benchSpace, 5, lcg(3))));
  });
  it("clamps + respects int dims", () => {
    const s = { dims: [{ name: "k", type: "int" as const, min: 1, max: 5 }] };
    expect(clampExperiment(s, { k: 99 }).k).toBe(5);
    expect(Number.isInteger(randomCandidates(s, 10, lcg(1))[0].k)).toBe(true);
  });
  it("grid covers the corners", () => expect(gridCandidates(benchSpace, 3).length).toBe(9));
  it("local candidates stay in bounds", () => {
    expect(localCandidates(benchSpace, { x: 5, y: 5 }, 20, 0.1, lcg(2)).every((e) => e.x >= 0 && e.x <= 10)).toBe(true);
  });
});

describe("oracle — everything is f(x)", () => {
  it("sim oracle", () => expect(simOracle((e) => (e.x ?? 0) + 1)({ x: 41 })).toBe(42));
  it("metered oracle throws synchronously over budget", () => {
    const m = meteredOracle(simOracle(() => 1), 1); m({ x: 0 });
    expect(() => m({ x: 0 })).toThrow();
  });
  it("scoredOracle composes run + score (f(x)=score(run(x)))", async () => {
    const o = scoredOracle((e) => ({ art: `v${e.x}` }), (a) => a.art.length);
    expect(await o({ x: 100 })).toBe("v100".length);
  });
  it("compositeOracle does weighted multi-objective", async () => {
    const o = compositeOracle([{ oracle: simOracle((e) => e.x ?? 0), weight: 2 }, { oracle: simOracle(() => 10), weight: -1 }]);
    expect(await o({ x: 5 })).toBe(0);
  });
});

describe("engine (the brain)", () => {
  it("finds a hidden 2D optimum within budget", async () => {
    const r = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 80, seed: 7, goal: "maximize" });
    expect(r.best.value).toBeGreaterThan(0.95);
  });
  it("is sample-efficient: beats random search to 0.99", async () => {
    const r = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 150, seed: 7, goal: "maximize", target: 0.99 });
    expect(r.best.value).toBeGreaterThanOrEqual(0.99);
    expect(r.evaluations).toBeLessThan(70);   // random needs ~95 on average and often misses
  });
  it("deterministic for a fixed seed", async () => {
    const a = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 50, seed: 5, goal: "maximize" });
    const b = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 50, seed: 5, goal: "maximize" });
    expect(JSON.stringify(a.best)).toBe(JSON.stringify(b.best));
  });
  it("minimizes too", async () => {
    const r = await discover({ space: benchSpace, oracle: (e) => -multimodal(e), budget: 80, seed: 7, goal: "minimize" });
    expect(r.best.value).toBeLessThan(-0.95);
  });
});

describe("benchmark proof (measured, not claimed)", () => {
  it("brain reaches the optimum in far fewer experiments than random", async () => {
    const r = await benchmark({ budget: 150, target: 0.99, seeds: 30 });
    expect(r.brain).not.toBeNull();
    expect(r.brain!).toBeLessThan(r.random);   // the headline
  });
});

describe("resonance (experimental, honest)", () => {
  it("runs deterministically", async () => {
    const a = await resonanceDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 40, seed: 7, goal: "maximize" });
    const b = await resonanceDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 40, seed: 7, goal: "maximize" });
    expect(JSON.stringify(a.best)).toBe(JSON.stringify(b.best));
  });
  it("the head-to-head reports the bayes core as the current winner (honest)", async () => {
    const sd = await resonanceVsBayes({ budget: 150, target: 0.99, seeds: 10 });
    expect(sd.winner).toBe("bayes");
  });
});

describe("discovery trace (the moat) — signed + offline-verifiable", () => {
  it("a real trace verifies", () => {
    const t = new Tracer(); t.record("hypothesis", { x: 7 }); t.record("observation", { value: 1 });
    expect(verifyTrace(t.export()).ok).toBe(true);
  });
  it("tampering with any frame is caught", () => {
    const t = new Tracer(); t.record("observation", { value: 0.5 });
    const trace = t.export(); (trace.frames[1].payload as Record<string, number>).value = 9.9;
    expect(verifyTrace(trace).ok).toBe(false);
  });
  it("a forged public key fails verification", () => {
    const t = new Tracer(); t.record("observation", { value: 1 });
    const trace = t.export(); trace.publicKeyPem = new Tracer().publicKeyPem;
    expect(verifyTrace(trace).ok).toBe(false);
  });
});

describe("replication attestation (cross-agent trust)", () => {
  const f = (e: { x: number }) => Math.exp(-((e.x - 7) ** 2) / 2);
  it("an honest discovery replicates; a fabricated one does not", async () => {
    const claim = { best: { experiment: { x: 7 }, value: f({ x: 7 }) }, path: [{ experiment: { x: 5 }, value: f({ x: 5 }) }, { experiment: { x: 7 }, value: f({ x: 7 }) }] };
    expect((await replicate({ claim, oracle: f as never, samples: 1 })).replicates).toBe(true);
    const lie = { ...claim, best: { experiment: { x: 7 }, value: 9.9 } };
    expect((await replicate({ claim: lie, oracle: f as never, samples: 1 })).replicates).toBe(false);
  });
  it("re-running just the best (1 experiment) certifies a whole discovery", async () => {
    const claim = { best: { experiment: { x: 7 }, value: f({ x: 7 }) }, path: Array.from({ length: 40 }, (_, i) => ({ experiment: { x: i / 4 }, value: f({ x: i / 4 }) })) };
    const r = await replicate({ claim, oracle: f as never, samples: 0 });
    expect(r.replicates).toBe(true); expect(r.reEvaluations).toBe(1);
  });
  it("the replication certificate is signed + offline-verifiable", async () => {
    const claim = { best: { experiment: { x: 7 }, value: f({ x: 7 }) }, path: [] };
    const cert = certifyReplication(await replicate({ claim, oracle: f as never, samples: 0 }));
    expect(verifyTrace(cert).ok).toBe(true);
  });
  it("extracts the claim from a signed discovery trace", () => {
    const t = new Tracer(); t.record("observation", { experiment: { x: 7 }, value: 1 }); t.record("result", { phase: "final", best: { experiment: { x: 7 }, value: 1 } });
    expect(extractClaim(t.export()).best.value).toBe(1);
  });
  it("gauntlet is 100", async () => expect((await replicateGauntlet()).score).toBe(100));
});

describe("wave-particle map projection — accuracy", () => {
  const nx = 44, ny = 44;
  it("a higher score projects higher on screen (smaller y)", () => {
    expect(vizProject(20, 20, 1, nx, ny)[1]).toBeLessThan(vizProject(20, 20, 0, nx, ny)[1]);
  });
  it("the height scale is exact + linear in the score", () => {
    expect(vizProject(20, 20, 0, nx, ny)[1] - vizProject(20, 20, 1, nx, ny)[1]).toBeCloseTo(120, 6);
    expect(vizProject(20, 20, 0, nx, ny)[1] - vizProject(20, 20, 0.5, nx, ny)[1]).toBeCloseTo(60, 6);
  });
  it("back rows sit higher than front rows (depth ordering)", () => {
    expect(vizProject(0, ny - 1, 0, nx, ny)[1]).toBeLessThan(vizProject(0, 0, 0, nx, ny)[1]);
  });
  it("every corner (incl back-row peaks) stays inside the 600×600 canvas", () => {
    for (const c of [[0, 0, 0], [nx - 1, ny - 1, 1], [nx - 1, 0, 1], [0, ny - 1, 1], [22, 22, 0.5]] as Array<[number, number, number]>) {
      const [px, py] = vizProject(c[0], c[1], c[2], nx, ny);
      expect(px).toBeGreaterThanOrEqual(0); expect(px).toBeLessThanOrEqual(600);
      expect(py).toBeGreaterThanOrEqual(0); expect(py).toBeLessThanOrEqual(600);
    }
  });
  it("is deterministic", () => {
    expect(vizProject(7, 9, 0.6, nx, ny)).toEqual(vizProject(7, 9, 0.6, nx, ny));
  });
});

describe("discoverSigned (end-to-end)", () => {
  it("produces a discovery AND a verifiable trace of how it was made", async () => {
    const sig = await discoverSigned({ space: benchSpace, oracle: (e) => multimodal(e), budget: 40, seed: 3, goal: "maximize", engine: "bayes" });
    expect(sig.result.best.value).toBeGreaterThan(0.9);
    expect(sig.trace.frames.length).toBeGreaterThan(5);
    expect(verifyTrace(sig.trace).ok).toBe(true);
  });
});
