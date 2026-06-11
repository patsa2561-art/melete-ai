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
