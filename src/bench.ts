/**
 * BENCHMARK — the falsifiable proof that the brain is worth it: on a hidden response surface, does the
 * closed loop reach the optimum in FEWER experiments than random search and a systematic grid? Fewer
 * experiments is the entire value — each real experiment costs reagents, robot-time, money. Deterministic
 * + reproducible; the numbers are measured, not claimed.
 */
import { type Space, type Experiment, lcg, gridCandidates } from "./space.js";
import { discover } from "./engine.js";

/** A multimodal surface with a global peak (≈1 at (7.2,3.4)) and a decoy local peak that traps naive search. */
export function multimodal(e: Experiment): number {
  const x = Number(e?.["x"]) || 0, y = Number(e?.["y"]) || 0;
  const g = Math.exp(-((x - 7.2) ** 2 + (y - 3.4) ** 2) / 3.0);
  const d = 0.6 * Math.exp(-((x - 2) ** 2 + (y - 8) ** 2) / 2.0);
  return g + d;
}
export const benchSpace: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };

export interface BenchResult { brain: number | null; random: number; grid: number | null; target: number; budget: number }

function randomSearch(space: Space, oracle: (e: Experiment) => number, budget: number, target: number, seed: number): number | null {
  const rnd = lcg(seed); let best = -Infinity;
  for (let t = 0; t < budget; t++) {
    const e: Experiment = {}; for (const d of space.dims) e[d.name] = d.min + (d.max - d.min) * rnd();
    const v = oracle(e); if (v > best) best = v; if (best >= target) return t + 1;
  }
  return null;
}
function gridSearch(space: Space, oracle: (e: Experiment) => number, budget: number, target: number): number | null {
  const n = Math.floor(Math.sqrt(budget)); const cands = gridCandidates(space, n); let best = -Infinity;
  for (let i = 0; i < cands.length && i < budget; i++) { const v = oracle(cands[i]); if (v > best) best = v; if (best >= target) return i + 1; }
  return null;
}

/** Compare experiments-to-target for brain vs random (averaged over seeds) vs grid. Lower = better. */
export async function benchmark(opts?: { budget?: number; target?: number; seeds?: number }): Promise<BenchResult> {
  const budget = opts?.budget ?? 150; const target = opts?.target ?? 0.99; const seeds = opts?.seeds ?? 30;
  const br = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget, seed: 7, goal: "maximize", target });
  const brain = br.best.value >= target ? br.evaluations : null;
  let rsum = 0, rcount = 0; for (let s = 1; s <= seeds; s++) { const f = randomSearch(benchSpace, multimodal, budget, target, s * 7919); if (f) { rsum += f; rcount++; } }
  const random = rcount ? Math.round((rsum / rcount) * 10) / 10 : budget;
  const grid = gridSearch(benchSpace, multimodal, budget, target);
  return { brain, random, grid, target, budget };
}

/** A rugged Rastrigin-style surface (many local optima; global max 0 at (6.3,3.7)) — where single
 * greedy optimisers get trapped and the portfolio's diversity pays off. */
export function rugged(e: Experiment): number {
  const x = (Number(e?.["x"]) || 0) - 6.3, y = (Number(e?.["y"]) || 0) - 3.7;
  return -(20 + (x * x - 10 * Math.cos(2 * Math.PI * x)) + (y * y - 10 * Math.cos(2 * Math.PI * y)));
}

import { portfolioDiscover } from "./portfolio.js";
import { armKernelUCB, armCMAES, armResonance, armRandom } from "./arms.js";
export interface RobustnessRow { landscape: string; portfolio: number; kernelUcb: number; cmaes: number; resonance: number; random: number; portfolioIsBest: boolean; portfolioIsWorst: boolean }
/** Measure the portfolio vs each single arm across diverse landscapes (mean best over `seeds`). The
 * production thesis, falsifiable: the portfolio is never the worst and tracks the best arm per landscape —
 * and on the rugged surface the ensemble beats every single algorithm. */
export async function robustnessBench(seeds = 6): Promise<RobustnessRow[]> {
  const sp2: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  const sp5: Space = { dims: Array.from({ length: 5 }, (_, i) => ({ name: "x" + i, type: "real" as const, min: 0, max: 1 })) };
  const f5 = (e: Experiment) => { let s = 0; for (let i = 0; i < 5; i++) { const d = (Number(e?.["x" + i]) || 0) - 0.6; s += d * d; } return Math.exp(-s / 0.1); };
  const cases = [
    { landscape: "smooth-2D", space: sp2, oracle: (e: Experiment) => multimodal(e), budget: 80 },
    { landscape: "rugged-2D", space: sp2, oracle: (e: Experiment) => rugged(e), budget: 150 },
    { landscape: "high-5D", space: sp5, oracle: f5, budget: 200 },
  ];
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const rows: RobustnessRow[] = [];
  for (const c of cases) {
    const P: number[] = [], K: number[] = [], C: number[] = [], R: number[] = [], Z: number[] = [];
    for (let s = 1; s <= seeds; s++) {
      P.push((await portfolioDiscover({ space: c.space, oracle: c.oracle, budget: c.budget, seed: s, goal: "maximize" })).best.value);
      K.push((await portfolioDiscover({ space: c.space, oracle: c.oracle, budget: c.budget, seed: s, goal: "maximize", arms: [armKernelUCB()] })).best.value);
      C.push((await portfolioDiscover({ space: c.space, oracle: c.oracle, budget: c.budget, seed: s, goal: "maximize", arms: [armCMAES()] })).best.value);
      R.push((await portfolioDiscover({ space: c.space, oracle: c.oracle, budget: c.budget, seed: s, goal: "maximize", arms: [armResonance()] })).best.value);
      Z.push((await portfolioDiscover({ space: c.space, oracle: c.oracle, budget: c.budget, seed: s, goal: "maximize", arms: [armRandom()] })).best.value);
    }
    const p = mean(P), vals = [mean(K), mean(C), mean(R), mean(Z)];
    rows.push({ landscape: c.landscape, portfolio: p, kernelUcb: vals[0], cmaes: vals[1], resonance: vals[2], random: vals[3], portfolioIsBest: p >= Math.max(...vals) - 1e-9, portfolioIsWorst: p <= Math.min(...vals) + 1e-9 });
  }
  return rows;
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export async function benchGauntlet(): Promise<{ score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> }> {
  const r = await benchmark({ budget: 150, target: 0.99, seeds: 30 });
  const brainFinds = r.brain != null && r.brain <= 150;
  const beatsRandom = r.brain != null && r.brain < r.random;          // the headline claim — measured
  const beatsGridOrTie = r.grid == null || (r.brain != null && r.brain <= r.grid);
  const total = (() => { try { multimodal(null as never); return true; } catch { return false; } })();
  const checks = [
    { name: "BRAIN-CONVERGES", pass: brainFinds, detail: `brain reached 99% of optimum in ${r.brain} experiments` },
    { name: "BEATS-RANDOM", pass: beatsRandom, detail: `brain ${r.brain} < random avg ${r.random} experiments` },
    { name: "BEATS-OR-TIES-GRID", pass: beatsGridOrTie, detail: `grid: ${r.grid ?? ">budget"} experiments` },
    { name: "TOTAL", pass: total, detail: "objective never throws on garbage" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
