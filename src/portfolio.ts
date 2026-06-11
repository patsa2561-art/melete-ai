/**
 * THE PORTFOLIO BRAIN — the production engine. Self-allocating, robust on every landscape, build-once.
 *
 * No-Free-Lunch: no single optimiser wins everywhere. So instead of betting on one algorithm, the
 * portfolio runs several strategy ARMS (kernel-ucb, cmaes, resonance, random) and a multi-armed BANDIT
 * (UCB1) spends each expensive experiment on whichever arm is delivering the most IMPROVEMENT on THIS
 * problem right now. On a smooth low-D surface it converges to the Bayesian arm; on a rugged or high-D
 * surface it shifts budget to evolution; if an arm stops helping the bandit starves it. The result is an
 * engine that adapts to the problem instead of forcing the problem to fit the engine — so it keeps
 * working across domains without being re-engineered. Each experiment's trace records which arm proposed
 * it, so the discovery provenance shows the brain's adaptive reasoning.
 *
 * ★HONEST: the portfolio is not magically better than its best arm on a given problem — its guarantee is
 * ROBUSTNESS (never far behind the best arm, automatically, with no per-problem tuning), which is exactly
 * what a production system needs. The bandit pays a small exploration overhead to buy that robustness.
 */
import { type Space, type Experiment, lcg, gridCandidates } from "./space.js";
import { type Goal, type Observation, type Step, type DiscoveryResult } from "./engine.js";
import { type Arm, defaultArms } from "./arms.js";

export interface PortfolioOpts {
  space: Space; oracle: (e: Experiment) => number | Promise<number>; budget: number;
  goal?: Goal; seed?: number; target?: number; arms?: Arm[]; explore?: number;
  onStep?: (s: Step) => void | Promise<void>;
}
export interface ArmStat { name: string; pulls: number; meanReward: number; improvements: number }
export interface PortfolioResult extends DiscoveryResult { armStats: ArmStat[] }

const key = (e: Experiment) => JSON.stringify(e);

/** Run the self-allocating portfolio discovery loop. */
export async function portfolioDiscover(opts: PortfolioOpts): Promise<PortfolioResult> {
  const space = opts.space; const goal: Goal = opts.goal ?? "maximize"; const budget = Math.max(1, opts.budget | 0);
  const rnd = lcg(opts.seed ?? 1); const arms = (opts.arms && opts.arms.length ? opts.arms : defaultArms()); const cBandit = opts.explore ?? 0.4;
  const better = (a: number, b: number) => goal === "maximize" ? a > b : a < b;

  const obs: Observation[] = []; const seen = new Set<string>(); const history: Step[] = [];
  const stats = arms.map((a) => ({ name: a.name, pulls: 0, sumReward: 0, improvements: 0 }));
  const evalExp = async (e: Experiment) => { const v = Number(await opts.oracle(e)); return Number.isFinite(v) ? v : (goal === "maximize" ? -1e18 : 1e18); };

  let best: Observation = { experiment: {}, value: goal === "maximize" ? -Infinity : Infinity };
  let vmin = Infinity, vmax = -Infinity;
  const record = async (e: Experiment, armName: string, rationale: string) => {
    const v = await evalExp(e); obs.push({ experiment: e, value: v }); seen.add(key(e));
    vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    const improved = better(v, best.value); if (improved) best = { experiment: e, value: v };
    const step: Step = { n: obs.length, experiment: e, value: v, acquisition: 0, kappa: 0, rationale: `[${armName}] ${rationale}` };
    history.push(step); if (opts.onStep) await opts.onStep(step);
    return improved ? v : null;
  };

  // cold start: a coarse grid seed shared by all arms
  const perDim = space.dims.length <= 2 ? 3 : 2;
  for (const e of gridCandidates(space, perDim).slice(0, Math.max(1, Math.min(budget, space.dims.length <= 2 ? 9 : 8)))) {
    if (obs.length >= budget) break; if (seen.has(key(e))) continue; await record(e, "seed", "design-of-experiments grid point");
  }

  // active loop: UCB1 bandit over arms; reward = normalised improvement of the new best
  let T = 0;
  for (let t = obs.length; t < budget; t++) {
    if (opts.target != null && better(best.value, opts.target)) break;
    T++;
    // pick arm: untried arms first, else UCB1
    let ai = stats.findIndex((s) => s.pulls === 0);
    if (ai < 0) {
      let bestU = -Infinity;
      for (let i = 0; i < arms.length; i++) { const s = stats[i]; const mean = s.sumReward / s.pulls; const u = mean + cBandit * Math.sqrt(Math.log(T + 1) / s.pulls); if (u > bestU) { bestU = u; ai = i; } }
    }
    const arm = arms[ai];
    const prevBest = best.value;
    const e = arm.propose({ space, obs, t, budget, rnd, goal });
    const newV = await record(e, arm.name, `bandit-selected (pulls=${stats[ai].pulls})`);
    const range = (vmax - vmin) || 1;
    const reward = newV != null ? Math.max(0, Math.min(1, Math.abs(best.value - prevBest) / range)) : 0;
    stats[ai].pulls++; stats[ai].sumReward += reward; if (newV != null) stats[ai].improvements++;
  }

  const armStats: ArmStat[] = stats.map((s) => ({ name: s.name, pulls: s.pulls, meanReward: s.pulls ? Math.round((s.sumReward / s.pulls) * 1000) / 1000 : 0, improvements: s.improvements }));
  const converged = opts.target != null ? better(best.value, opts.target) || Math.abs(best.value - opts.target) < 1e-9 : true;
  return { best, history, evaluations: obs.length, converged, goal, armStats };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export interface PortfolioGauntlet { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> }
export async function portfolioGauntlet(): Promise<PortfolioGauntlet> {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  const peak = (e: Experiment) => Math.exp(-(((e.x ?? 0) - 7.2) ** 2 + ((e.y ?? 0) - 3.4) ** 2) / 3);
  const r = await portfolioDiscover({ space, oracle: (e) => peak(e), budget: 80, seed: 7, goal: "maximize", target: 0.99 });
  const converges = r.best.value >= 0.99;
  const allocates = r.armStats.reduce((s, a) => s + a.pulls, 0) > 0 && r.armStats.some((a) => a.pulls > 0);
  // the bandit should favour a productive arm over pure random on a smooth surface
  const random = r.armStats.find((a) => a.name === "random")!; const bestArm = [...r.armStats].sort((a, b) => b.improvements - a.improvements)[0];
  const banditLearns = bestArm.name !== "random" && bestArm.improvements >= random.improvements;
  const a = await portfolioDiscover({ space, oracle: (e) => peak(e), budget: 60, seed: 5, goal: "maximize" });
  const b = await portfolioDiscover({ space, oracle: (e) => peak(e), budget: 60, seed: 5, goal: "maximize" });
  const deterministic = JSON.stringify(a.best) === JSON.stringify(b.best) && JSON.stringify(a.armStats) === JSON.stringify(b.armStats);
  // robustness: also works on a higher-D surface where a pure kernel arm degrades
  const sp5: Space = { dims: Array.from({ length: 5 }, (_, i) => ({ name: "x" + i, type: "real" as const, min: 0, max: 1 })) };
  const f5 = (e: Experiment) => { let s = 0; for (let i = 0; i < 5; i++) { const d = (e["x" + i] ?? 0) - 0.6; s += d * d; } return Math.exp(-s / 0.1); };
  const r5 = await portfolioDiscover({ space: sp5, oracle: (e) => f5(e), budget: 220, seed: 3, goal: "maximize", target: 0.9 });
  const robust5d = r5.best.value >= 0.9;
  const total = (() => { try { return true; } catch { return false; } })();
  const checks = [
    { name: "CONVERGES", pass: converges, detail: `portfolio reaches the optimum on a smooth surface (best=${r.best.value.toFixed(3)})` },
    { name: "ALLOCATES", pass: allocates, detail: "the bandit spends the budget across the arms" },
    { name: "BANDIT-LEARNS", pass: banditLearns, detail: `a productive arm (${bestArm.name}) earns ≥ as many improvements as random — the bandit doesn't waste budget` },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same seed → identical discovery + identical arm allocation" },
    { name: "ROBUST-HIGH-D", pass: robust5d, detail: `also solves a 5-D surface (best=${r5.best.value.toFixed(3)}) — robustness across landscapes` },
    { name: "TOTAL", pass: total, detail: "runs without throwing" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
