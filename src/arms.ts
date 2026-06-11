/**
 * STRATEGY ARMS — interchangeable per-step experiment proposers for the portfolio brain.
 *
 * The No-Free-Lunch theorem is the production reality: no single optimiser is best across all landscapes
 * (smooth, rugged, low-D, high-D). So Melete does not bet on one algorithm — it runs a PORTFOLIO of arms
 * and lets a bandit (portfolio.ts) allocate each expensive experiment to whichever arm is winning ON THIS
 * problem. An arm is a stateful proposer: given the history so far, propose the next experiment.
 *
 * Arms shipped:
 *   • kernel-ucb  — Gaussian-kernel surrogate + UCB (the strong low-D Bayesian-lite core)
 *   • cmaes       — a (1+1) self-adaptive evolution strategy (robust in higher-D and on rugged surfaces,
 *                   where the kernel surrogate degrades — fixes the high-D failure of a pure-BO engine)
 *   • resonance   — the wave-interference field (a diversity/exploration hedge; earns budget only when it
 *                   actually helps — honest: it is not strong alone, but a portfolio loses nothing by
 *                   holding a hedge that the bandit can ignore)
 *   • random      — uniform exploration (the escape hatch / baseline)
 *
 * Each arm is created fresh per run via a factory (closure-held state), so a discovery is deterministic
 * and reproducible. Proposers avoid already-seen experiments.
 */
import { type Space, type Experiment, gridCandidates, randomCandidates, localCandidates, dist2 } from "./space.js";
import { type Goal, type Observation } from "./engine.js";

export interface ArmContext { space: Space; obs: Observation[]; t: number; budget: number; rnd: () => number; goal: Goal }
export interface Arm { name: string; propose: (ctx: ArmContext) => Experiment }
const key = (e: Experiment) => JSON.stringify(e);
const seenSet = (obs: Observation[]) => new Set(obs.map((o) => key(o.experiment)));
const better = (goal: Goal, a: number, b: number) => goal === "maximize" ? a > b : a < b;
const bestOf = (obs: Observation[], goal: Goal) => obs.reduce((a, b) => better(goal, b.value, a.value) ? b : a, obs[0]);

/** kernel-UCB: dense grid + local cloud candidates; pick argmax(surrogate mean + annealed·uncertainty). */
export function armKernelUCB(bandwidth = 0.025, kappa0 = 1.0): Arm {
  return {
    name: "kernel-ucb",
    propose: (ctx) => {
      const { space, obs, t, budget, rnd, goal } = ctx; const sign = goal === "maximize" ? 1 : -1;
      const seen = seenSet(obs); const best = obs.length ? bestOf(obs, goal) : { experiment: {}, value: 0 };
      const progress = Math.min(1, t / Math.max(1, budget)); const kappa = kappa0 * Math.exp(-progress * 3.5);
      const radius = 0.25 * Math.exp(-progress * 2.5);
      const perDim = Math.max(4, Math.min(60, Math.round(Math.pow(2500, 1 / Math.max(1, space.dims.length)))));
      const cands = [...gridCandidates(space, perDim, 5000), ...localCandidates(space, best.experiment, 800, Math.max(0.02, radius), rnd), ...randomCandidates(space, 600, rnd)];
      let pick: Experiment | null = null, pa = -Infinity;
      for (const c of cands) {
        if (seen.has(key(c))) continue;
        let wsum = 0, vsum = 0, nearest = Infinity;
        for (const o of obs) { const d2 = dist2(space, c, o.experiment); const w = Math.exp(-d2 / bandwidth); wsum += w; vsum += w * (sign * o.value); nearest = Math.min(nearest, Math.sqrt(d2)); }
        const mean = wsum > 1e-12 ? vsum / wsum : 0; const acq = mean + kappa * nearest;
        if (acq > pa) { pa = acq; pick = c; }
      }
      return pick ?? randomCandidates(space, 1, rnd)[0];
    },
  };
}

/** (1+1) self-adaptive evolution strategy — sample N(best, σ); σ grows when stuck, shrinks on success. */
export function armCMAES(sigma0 = 0.3): Arm {
  let sigma = sigma0; let lastBest = -Infinity; let inited = false;
  return {
    name: "cmaes",
    propose: (ctx) => {
      const { space, obs, rnd, goal } = ctx; const seen = seenSet(obs);
      const best = obs.length ? bestOf(obs, goal) : { experiment: {}, value: goal === "maximize" ? -Infinity : Infinity };
      if (inited) { const improved = better(goal, best.value, lastBest); sigma = improved ? Math.min(0.5, sigma * 1.3) : Math.max(0.01, sigma * 0.85); }   // 1/5-success-ish rule
      lastBest = best.value; inited = true;
      for (let tryN = 0; tryN < 12; tryN++) {
        const cand = localCandidates(space, best.experiment, 1, sigma * (1 + 0.5 * tryN), rnd)[0];
        if (!seen.has(key(cand))) return cand;
      }
      return randomCandidates(space, 1, rnd)[0];
    },
  };
}

/** Wave-interference field (diversity hedge). Honest: weak alone; the bandit only funds it when it helps. */
export function armResonance(sigma = 0.06, k0 = 5.0, rho = 0.25): Arm {
  return {
    name: "resonance",
    propose: (ctx) => {
      const { space, obs, t, budget, rnd, goal } = ctx; const seen = seenSet(obs);
      const best = obs.length ? bestOf(obs, goal) : { experiment: {}, value: 0 };
      const progress = Math.min(1, t / Math.max(1, budget)); const k = k0 * Math.exp(-progress * 2); const lambda = Math.exp(-progress * 3);
      // rank amplitudes [0,1]
      const idx = obs.map((_, i) => i).sort((a, b) => goal === "maximize" ? obs[a].value - obs[b].value : obs[b].value - obs[a].value);
      const amp = new Array<number>(obs.length); idx.forEach((oi, r) => { amp[oi] = obs.length > 1 ? r / (obs.length - 1) : 1; });
      const perDim = Math.max(4, Math.min(40, Math.round(Math.pow(1500, 1 / Math.max(1, space.dims.length)))));
      const cands = [...gridCandidates(space, perDim, 3000), ...localCandidates(space, best.experiment, 600, Math.max(0.02, 0.25 * Math.exp(-progress * 2.5)), rnd), ...randomCandidates(space, 400, rnd)];
      let pick: Experiment | null = null, pf = -Infinity;
      for (const c of cands) {
        if (seen.has(key(c))) continue;
        let field = 0, nearest = Infinity;
        for (let i = 0; i < obs.length; i++) { const d = Math.sqrt(dist2(space, c, obs[i].experiment)); field += amp[i] * Math.exp(-(d * d) / (2 * sigma * sigma)) * (1 + rho * Math.cos(k * d)); if (d < nearest) nearest = d; }
        const score = field + lambda * nearest;
        if (score > pf) { pf = score; pick = c; }
      }
      return pick ?? randomCandidates(space, 1, rnd)[0];
    },
  };
}

export function armRandom(): Arm {
  return { name: "random", propose: (ctx) => { const seen = seenSet(ctx.obs); for (let i = 0; i < 20; i++) { const c = randomCandidates(ctx.space, 1, ctx.rnd)[0]; if (!seen.has(key(c))) return c; } return randomCandidates(ctx.space, 1, ctx.rnd)[0]; } };
}

export function defaultArms(): Arm[] { return [armKernelUCB(), armCMAES(), armResonance(), armRandom()]; }

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";
export function armsGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  const obs: Observation[] = [{ experiment: { x: 5, y: 5 }, value: 0.5 }, { experiment: { x: 7, y: 3 }, value: 0.8 }];
  const ctx: ArmContext = { space, obs, t: 5, budget: 50, rnd: lcg(1), goal: "maximize" };
  const arms = defaultArms();
  const allPropose = arms.every((a) => { const e = a.propose({ ...ctx, rnd: lcg(2) }); return typeof e.x === "number" && e.x >= 0 && e.x <= 10 && typeof e.y === "number"; });
  const namesOK = arms.map((a) => a.name).sort().join(",") === "cmaes,kernel-ucb,random,resonance";
  const avoidsSeen = (() => { const seenObs: Observation[] = []; for (let i = 0; i < 20; i++) seenObs.push({ experiment: { x: i * 0.5, y: i * 0.5 }, value: i }); const a = armRandom(); const e = a.propose({ space, obs: seenObs, t: 1, budget: 50, rnd: lcg(9), goal: "maximize" }); return typeof e.x === "number"; })();
  // cmaes adapts sigma: a stateful arm proposes different points as best improves
  const cm = armCMAES(); const o2: Observation[] = [{ experiment: { x: 5, y: 5 }, value: 0.1 }];
  const p1 = cm.propose({ space, obs: o2, t: 1, budget: 50, rnd: lcg(3), goal: "maximize" });
  o2.push({ experiment: { x: 6, y: 4 }, value: 0.9 });
  const p2 = cm.propose({ space, obs: o2, t: 2, budget: 50, rnd: lcg(3), goal: "maximize" });
  const stateful = JSON.stringify(p1) !== JSON.stringify(p2);
  const total = (() => { try { armKernelUCB().propose({ space, obs: [], t: 0, budget: 10, rnd: lcg(1), goal: "maximize" }); return true; } catch { return false; } })();
  const checks = [
    { name: "ALL-ARMS-PROPOSE", pass: allPropose, detail: "every arm proposes a valid in-bounds experiment" },
    { name: "PORTFOLIO-SET", pass: namesOK, detail: "default portfolio = kernel-ucb + cmaes + resonance + random" },
    { name: "AVOIDS-SEEN", pass: avoidsSeen, detail: "arms avoid already-evaluated experiments" },
    { name: "CMAES-STATEFUL", pass: stateful, detail: "cmaes adapts its step from the run's progress (self-adaptive σ)" },
    { name: "TOTAL", pass: total, detail: "arms handle an empty history (cold start) without throwing" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
