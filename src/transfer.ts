/**
 * TRANSFER / WARM-START — the brain that remembers, and gets smarter every time. Real labs don't optimize a
 * brand-new process from scratch each morning; they run things that RHYME with what they ran before — the
 * same assay on a new compound, the same kiln with a new clay, the same model on a new dataset. A
 * from-scratch optimizer throws that history away and re-discovers the obvious. TRANSFER doesn't: it mines a
 * prior run for the regions that worked and starts the new search THERE, so you spend your first precious
 * experiments near the answer instead of wandering.
 *
 * warmStartSeeds pulls the diverse high-value settings out of a prior run; transferDiscover evaluates those
 * first on the new process, then continues the normal propose-measure loop. When the new problem is similar
 * to the old one, you reach a strong result in far fewer NEW experiments.
 *
 * Honest by construction (DIAKRISIS): transfer helps to the extent the new problem RESEMBLES the prior one —
 * the seeds are the prior's promising regions, re-measured on the new process (never assumed). If the new
 * optimum has moved far away, the seeds simply don't score well and the normal search takes over — no harm,
 * no false speed-up. The gauntlet measures the advantage on a genuinely similar problem, head-to-head
 * against a cold start; it abstains (falls back to cold) when there's no usable prior.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";
import { proposeNext } from "./interactive.js";

const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/** The diverse, high-value settings from a prior run — the regions worth re-checking on a similar new process. */
export function warmStartSeeds(priorObs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize", k = 4): Experiment[] {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (priorObs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  if (!D || !hist.length) return [];
  const sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const ranked = hist.map((o) => ({ o, p: toN(o.experiment), v: sgn * o.value })).sort((a, b) => b.v - a.v);
  const kept: number[][] = []; const seeds: Experiment[] = [];
  for (const r of ranked) {
    if (kept.some((p) => dst(p, r.p) < 0.2)) continue;          // keep them genuinely different
    kept.push(r.p); seeds.push(r.o.experiment);
    if (seeds.length >= Math.max(1, Math.min(16, Math.floor(k)))) break;
  }
  return seeds;
}

export interface TransferResult { best: Observation; evaluations: number; warmStarted: boolean; obs: Observation[] }

/** Run a discovery on a NEW process, warm-started from a prior (similar) run's promising regions. */
export function transferDiscover(opts: { space: Space; oracle: (e: Experiment) => number; priorObs?: ReadonlyArray<Observation>; budget: number; goal?: Goal; seed?: number }): TransferResult {
  const goal = opts.goal ?? "maximize"; const sgn = goal === "minimize" ? -1 : 1;
  const budget = Math.max(1, Math.floor(opts.budget)); const seed = (opts.seed ?? 1) | 0;
  const obs: Observation[] = [];
  let best: Observation = { experiment: {}, value: goal === "minimize" ? Infinity : -Infinity };
  const take = (e: Experiment) => { const v = opts.oracle(e); const o = { experiment: e, value: v }; obs.push(o); if (sgn * v > sgn * best.value) best = o; };

  const seeds = warmStartSeeds(opts.priorObs ?? [], opts.space, goal, Math.ceil(budget / 2));
  const warmStarted = seeds.length > 0;
  for (const s of seeds) { if (obs.length >= budget) break; take(s); }
  while (obs.length < budget) { take(proposeNext(opts.space, obs, goal, seed + obs.length)); }
  return { best, evaluations: obs.length, warmStarted, obs };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function transferGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  // a NARROW peak — hard to find cold in a small budget, easy if you already know roughly where it is
  const peakAt = (cx: number, cy: number) => (x: number, y: number) => Math.exp(-(((x - cx) ** 2) + ((y - cy) ** 2)) / 0.004);
  const f1 = peakAt(0.70, 0.70);   // the PRIOR process
  const f2 = peakAt(0.73, 0.72);   // the NEW process — SIMILAR (optimum nearby)

  // a prior run that found f1's peak
  const rp = lcg(11); const prior: Observation[] = [];
  for (let i = 0; i < 40; i++) { const x = rp(), y = rp(); prior.push({ experiment: { x, y }, value: f1(x, y) }); }
  for (let i = 0; i < 6; i++) prior.push({ experiment: { x: 0.70 + (rp() - 0.5) * 0.04, y: 0.70 + (rp() - 0.5) * 0.04 }, value: f1(0.70, 0.70) });

  const B = 10;
  const cold = transferDiscover({ space, oracle: (e) => f2(e.x ?? 0, e.y ?? 0), budget: B, goal: "maximize", seed: 3 });
  const warm = transferDiscover({ space, oracle: (e) => f2(e.x ?? 0, e.y ?? 0), priorObs: prior, budget: B, goal: "maximize", seed: 3 });

  const warmFaster = warm.best.value > cold.best.value + 0.05;     // at a small budget, warm reaches a better result
  const warmGood = warm.best.value > 0.7;                          // it actually nails the new (nearby) peak
  const usedSeeds = warm.warmStarted && !cold.warmStarted;

  const seeds = warmStartSeeds(prior, space, "maximize", 4);
  const seedNearPrior = seeds.some((s) => Math.abs((s.x ?? 0) - 0.70) < 0.1 && Math.abs((s.y ?? 0) - 0.70) < 0.1);
  // diverse seeds on a two-region prior
  const rp2 = lcg(5); const prior2: Observation[] = [];
  for (let i = 0; i < 40; i++) { const x = rp2(), y = rp2(); const v = Math.max(peakAt(0.2, 0.2)(x, y), peakAt(0.8, 0.8)(x, y)); prior2.push({ experiment: { x, y }, value: v }); }
  for (let i = 0; i < 6; i++) { prior2.push({ experiment: { x: 0.2, y: 0.2 }, value: 1 }); prior2.push({ experiment: { x: 0.8, y: 0.8 }, value: 1 }); }
  const seeds2 = warmStartSeeds(prior2, space, "maximize", 4);
  const seedsDiverse = seeds2.length >= 2 && Math.abs((seeds2[0].x ?? 0) - (seeds2[1].x ?? 0)) > 0.4;

  const noPrior = transferDiscover({ space, oracle: (e) => f2(e.x ?? 0, e.y ?? 0), budget: B, goal: "maximize", seed: 3 });
  const fallsBack = noPrior.warmStarted === false && noPrior.evaluations === B;
  const det = transferDiscover({ space, oracle: (e) => f2(e.x ?? 0, e.y ?? 0), priorObs: prior, budget: B, seed: 3 }).best.value === warm.best.value;
  const total = (() => { try { warmStartSeeds([], space); transferDiscover({ space, oracle: () => 0, budget: 3 }); warmStartSeeds(null as never, { dims: [] }); return true; } catch { return false; } })();

  const checks = [
    { name: "WARM-START-FASTER", pass: warmFaster, detail: `at budget ${B}: warm best ${warm.best.value.toFixed(3)} > cold best ${cold.best.value.toFixed(3)}` },
    { name: "REACHES-NEW-OPTIMUM", pass: warmGood, detail: `warm start nails the nearby new peak (${warm.best.value.toFixed(3)})` },
    { name: "USES-PRIOR-SEEDS", pass: usedSeeds, detail: "warm run is seeded from prior; cold run isn't" },
    { name: "SEEDS-NEAR-PRIOR-OPTIMUM", pass: seedNearPrior, detail: "the seeds include the prior's best region (≈0.70,0.70)" },
    { name: "SEEDS-DIVERSE", pass: seedsDiverse, detail: `two-region prior → spread-out seeds (x ${seeds2[0]?.x?.toFixed(2)} vs ${seeds2[1]?.x?.toFixed(2)})` },
    { name: "FALLS-BACK-WHEN-NO-PRIOR", pass: fallsBack, detail: "no prior → ordinary cold start, no false speed-up" },
    { name: "DETERMINISTIC", pass: det, detail: "same prior + seed → same result" },
    { name: "TOTAL", pass: total, detail: "empty / null / no-dims never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
