/**
 * SEARCH SPACE — the set of experiments the brain may propose.
 *
 * A space is a list of dimensions, each real (continuous) or int (discrete-integer), with bounds. An
 * "experiment" is one point in that space (a Record<dim, number>). The brain proposes experiments; the
 * oracle returns a result per experiment. Deterministic: candidate generation is seeded, so a discovery
 * run is reproducible (which is what makes the signed trace meaningful).
 */
export interface Dim { name: string; type: "real" | "int"; min: number; max: number }
export interface Space { dims: Dim[] }
export type Experiment = Record<string, number>;

/** Deterministic LCG — reproducible across runs (no Math.random). */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0xffffffff; };
}

const clampDim = (d: Dim, v: number): number => {
  const c = Math.max(d.min, Math.min(d.max, v));
  return d.type === "int" ? Math.round(c) : c;
};
export function clampExperiment(space: Space, e: Experiment): Experiment {
  const out: Experiment = {};
  for (const d of space?.dims ?? []) out[d.name] = clampDim(d, Number(e?.[d.name]) || d.min);
  return out;
}

/** A coarse grid of `perDim` points per dimension (bounded cartesian) — the cold-start design of experiments. */
export function gridCandidates(space: Space, perDim = 4, cap = 8000): Experiment[] {
  const dims = space?.dims ?? []; if (!dims.length) return [{}];
  let rows: Experiment[] = [{}];
  for (const d of dims) {
    const steps: number[] = [];
    const n = Math.max(2, perDim);
    for (let i = 0; i < n; i++) steps.push(clampDim(d, d.min + (d.max - d.min) * (i / (n - 1))));
    const next: Experiment[] = [];
    for (const r of rows) { for (const v of steps) { next.push({ ...r, [d.name]: v }); if (next.length >= cap) break; } if (next.length >= cap) break; }
    rows = next;
  }
  return rows;
}

/** `n` deterministic random candidates (seeded) — the dense candidate pool the acquisition maximises over. */
export function randomCandidates(space: Space, n: number, rnd: () => number): Experiment[] {
  const dims = space?.dims ?? []; const out: Experiment[] = [];
  for (let i = 0; i < n; i++) { const e: Experiment = {}; for (const d of dims) e[d.name] = clampDim(d, d.min + (d.max - d.min) * rnd()); out.push(e); }
  return out;
}

/** `n` candidates sampled in a shrinking Gaussian ball around a center — the local refinement that zooms
 * into an optimum (global random candidates alone can't hit a tight target precisely). radius ∈ (0,1] is a
 * fraction of each dimension's span. */
export function localCandidates(space: Space, center: Experiment, n: number, radius: number, rnd: () => number): Experiment[] {
  const dims = space?.dims ?? []; const out: Experiment[] = [];
  for (let i = 0; i < n; i++) {
    const e: Experiment = {};
    for (const d of dims) {
      const span = d.max - d.min;
      // box-muller-ish via two uniforms → roughly normal jitter, scaled by radius·span
      const g = (rnd() + rnd() + rnd() + rnd() - 2) / 2;            // ~N(0, ~0.29), bounded
      e[d.name] = clampDim(d, (Number(center?.[d.name]) || d.min) + g * radius * span);
    }
    out.push(e);
  }
  return out;
}

export function dist2(space: Space, a: Experiment, b: Experiment): number {
  let s = 0; for (const d of space?.dims ?? []) { const span = (d.max - d.min) || 1; const dv = ((Number(a?.[d.name]) || 0) - (Number(b?.[d.name]) || 0)) / span; s += dv * dv; } return s;  // normalised squared distance
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function spaceGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "k", type: "int", min: 1, max: 5 }] };
  const rnd = lcg(42);
  const grid = gridCandidates(space, 4);
  const gridOK = grid.length === 16 && grid.every((e) => e.x >= 0 && e.x <= 10 && Number.isInteger(e.k) && e.k >= 1 && e.k <= 5);
  const rc = randomCandidates(space, 50, rnd);
  const randOK = rc.length === 50 && rc.every((e) => Number.isInteger(e.k));
  const determinism = JSON.stringify(randomCandidates(space, 5, lcg(7))) === JSON.stringify(randomCandidates(space, 5, lcg(7)));
  const clampOK = clampExperiment(space, { x: 999, k: 99 }).x === 10 && clampExperiment(space, { x: -5, k: 0 }).k === 1;
  const distOK = dist2(space, { x: 0, k: 1 }, { x: 0, k: 1 }) === 0 && dist2(space, { x: 0, k: 1 }, { x: 10, k: 1 }) === 1;
  const total = (() => { try { gridCandidates(null as never); randomCandidates(null as never, 3, rnd); clampExperiment(null as never, {}); dist2(null as never, {}, {}); return true; } catch { return false; } })();
  const checks = [
    { name: "GRID", pass: gridOK }, { name: "RANDOM", pass: randOK }, { name: "DETERMINISM", pass: determinism },
    { name: "CLAMP", pass: clampOK }, { name: "DISTANCE", pass: distOK }, { name: "TOTAL", pass: total },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
