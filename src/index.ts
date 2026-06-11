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
export * from "./trace.js";
export * from "./bench.js";

import { type DiscoverOpts, type DiscoveryResult, type Step, discover } from "./engine.js";
import { resonanceDiscover, type ResonanceOpts } from "./resonance.js";
import { Tracer, type SignedTrace } from "./trace.js";

export type EngineName = "resonance" | "bayes";
export interface SignedDiscovery { result: DiscoveryResult; trace: SignedTrace; engine: EngineName }

/**
 * Run a discovery AND emit a signed, offline-verifiable trace of how it was made. Every proposed
 * experiment (hypothesis + rationale) and its observation is recorded into a tamper-evident chain.
 */
export async function discoverSigned(opts: (DiscoverOpts | ResonanceOpts) & { engine?: EngineName; tracer?: Tracer }): Promise<SignedDiscovery> {
  const engine: EngineName = opts.engine ?? "bayes";   // bayes is the proven core; resonance is experimental (see resonance.ts)
  const tracer = opts.tracer ?? new Tracer();
  tracer.record("result", { phase: "config", engine, goal: opts.goal ?? "maximize", budget: opts.budget, seed: opts.seed ?? 1, dims: opts.space?.dims?.map((d) => d.name) });
  const onStep = async (s: Step) => {
    tracer.record("hypothesis", { n: s.n, experiment: s.experiment, rationale: s.rationale, acquisition: s.acquisition });
    tracer.record("observation", { n: s.n, experiment: s.experiment, value: s.value });
  };
  const result = engine === "resonance"
    ? await resonanceDiscover({ ...(opts as ResonanceOpts), onStep })
    : await discover({ ...(opts as DiscoverOpts), onStep });
  tracer.record("result", { phase: "final", best: result.best, evaluations: result.evaluations, converged: result.converged });
  return { result, trace: tracer.export(), engine };
}

// ── aggregate gauntlet — every module must score 100 (Mneme-grade discipline) ──────────────────
import { spaceGauntlet } from "./space.js";
import { oracleGauntlet } from "./oracle.js";
import { engineGauntlet } from "./engine.js";
import { resonanceGauntlet } from "./resonance.js";
import { traceGauntlet } from "./trace.js";
import { benchGauntlet } from "./bench.js";

export interface MeleteGauntlet { score: 0 | 100; modules: Array<{ name: string; score: number; checks: Array<{ name: string; pass: boolean }> }> }
export async function meleteGauntlet(): Promise<MeleteGauntlet> {
  const mods: Array<{ name: string; g: { score: number; checks: Array<{ name: string; pass: boolean }> } }> = [
    { name: "space", g: spaceGauntlet() },
    { name: "oracle", g: oracleGauntlet() },
    { name: "engine", g: await engineGauntlet() },
    { name: "resonance", g: await resonanceGauntlet() },
    { name: "trace", g: traceGauntlet() },
    { name: "bench", g: await benchGauntlet() },
  ];
  const modules = mods.map((m) => ({ name: m.name, score: m.g.score, checks: m.g.checks }));
  return { score: modules.every((m) => m.score === 100) ? 100 : 0, modules };
}
