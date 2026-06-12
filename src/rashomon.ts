/**
 * RASHOMON SET (EQUIFINALITY) — you don't have one best recipe, you have a FAMILY. Optimization hands back
 * a single winner, but reality is kinder than that: there are often several genuinely different settings
 * that all score within a hair of the best. That hidden freedom is worth money — among equally-good
 * recipes you can pick the cheapest to run, the safest, the one using materials you already have, the one
 * far from a cliff. A tool that only ever shows you ONE answer throws that choice away.
 *
 * RASHOMON gathers every measurement within a small tolerance of your best, then clusters them into
 * genuinely DISTINCT recipes (not ten copies of the same point). It reports the family: how many real
 * alternatives you have and what they are — so the decision becomes yours, not the optimizer's.
 *
 * Named for the Rashomon set in machine learning (the set of near-equally-good models) and equifinality in
 * systems science (many paths, same end). Honest by construction (DIAKRISIS): every recipe returned is a
 * REAL measurement of yours within the stated tolerance of the best — not an interpolated guess; "distinct"
 * means separated in the normalised variable space. It abstains on thin data and reports just the one
 * winner when the near-optimal points really are all the same place.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface RashomonRecipe { settings: Record<string, number>; value: number }
export interface RashomonReport {
  recipes: RashomonRecipe[];     // distinct settings all within tolerance of the best
  flexibility: "many" | "few" | "one";
  tolerance: number;             // the score window used (best − this)
  note: string;
}

const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/** Find the family of genuinely different recipes that all score within `tolFrac` of the best. */
export function analyzeRashomon(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize", tolFrac = 0.05): RashomonReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < 6) return { recipes: [], flexibility: "one", tolerance: NaN, note: `need ≈6+ measurements to map the family (have ${n})` };
  const sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const V = hist.map((o) => sgn * o.value);
  const range = Math.max(1e-9, Math.max(...V) - Math.min(...V));
  const best = Math.max(...V);
  const threshold = best - tolFrac * range;

  // all near-optimal points, ranked best-first, then greedily kept if spatially distinct
  const near = hist.map((o, i) => ({ o, v: V[i], p: toN(o.experiment) })).filter((x) => x.v >= threshold - 1e-12).sort((a, b) => b.v - a.v);
  const keptP: number[][] = []; const recipes: RashomonRecipe[] = [];
  for (const x of near) {
    if (keptP.some((p) => dst(p, x.p) < 0.2)) continue;          // already represented by a nearby recipe
    keptP.push(x.p);
    const settings: Record<string, number> = {}; dims.forEach((d) => { settings[d.name] = +(+x.o.experiment[d.name]).toFixed(d.type === "int" ? 0 : 4); });
    recipes.push({ settings, value: +x.o.value.toFixed(6) });
    if (recipes.length >= 6) break;
  }
  const flexibility: RashomonReport["flexibility"] = recipes.length >= 3 ? "many" : recipes.length === 2 ? "few" : "one";
  const tolerance = +(tolFrac * range).toFixed(4);
  const note = recipes.length <= 1
    ? "there's essentially one best recipe — no equally-good alternatives to choose from"
    : `you have ${recipes.length} genuinely different recipes that all score within ${tolerance} of the best — pick the cheapest, safest, or most convenient`;
  return { recipes, flexibility, tolerance, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function rashomonGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };

  // TWO equal optima at (0.2,0.2) and (0.8,0.8) — there should be TWO distinct near-best recipes
  const twin = (x: number, y: number) => Math.max(Math.exp(-(((x - 0.2) ** 2) + ((y - 0.2) ** 2)) / 0.02), Math.exp(-(((x - 0.8) ** 2) + ((y - 0.8) ** 2)) / 0.02));
  const r1 = lcg(17); const o1: Observation[] = [];
  for (let i = 0; i < 50; i++) { const x = r1(), y = r1(); o1.push({ experiment: { x, y }, value: twin(x, y) }); }
  for (let i = 0; i < 8; i++) { o1.push({ experiment: { x: 0.2 + (r1() - 0.5) * 0.06, y: 0.2 + (r1() - 0.5) * 0.06 }, value: twin(0.2, 0.2) }); o1.push({ experiment: { x: 0.8 + (r1() - 0.5) * 0.06, y: 0.8 + (r1() - 0.5) * 0.06 }, value: twin(0.8, 0.8) }); }
  const s1 = analyzeRashomon(o1, space, "maximize", 0.05);
  const findsTwo = s1.recipes.length >= 2;
  const recipesDistinct = s1.recipes.length >= 2 && (Math.abs(s1.recipes[0].settings.x - s1.recipes[1].settings.x) > 0.4);
  const allNearBest = s1.recipes.every((r) => r.value >= 0.93);   // all within ~5% of the peak (1.0)

  // SINGLE peak → one recipe
  const single = (x: number, y: number) => Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.03);
  const r2 = lcg(5); const o2: Observation[] = [];
  for (let i = 0; i < 60; i++) { const x = r2(), y = r2(); o2.push({ experiment: { x, y }, value: single(x, y) }); }
  for (let i = 0; i < 10; i++) o2.push({ experiment: { x: 0.5 + (r2() - 0.5) * 0.05, y: 0.5 + (r2() - 0.5) * 0.05 }, value: single(0.5, 0.5) });
  const s2 = analyzeRashomon(o2, space, "maximize", 0.05);
  const singleOk = s2.recipes.length === 1 && s2.flexibility === "one";

  const det = JSON.stringify(analyzeRashomon(o1, space, "maximize")) === JSON.stringify(analyzeRashomon(o1, space, "maximize"));
  const abstains = analyzeRashomon(o1.slice(0, 4), space, "maximize").note.indexOf("need") >= 0;
  const total = (() => { try { analyzeRashomon([], space); analyzeRashomon(null as never, space); analyzeRashomon(o1, { dims: [] }); return true; } catch { return false; } })();

  const checks = [
    { name: "FINDS-MULTIPLE-OPTIMA", pass: findsTwo, detail: `two equal peaks → ${s1.recipes.length} distinct near-best recipes (flexibility "${s1.flexibility}")` },
    { name: "RECIPES-ARE-DISTINCT", pass: recipesDistinct, detail: `the alternatives are genuinely different (x ${s1.recipes[0]?.settings.x} vs ${s1.recipes[1]?.settings.x})` },
    { name: "ALL-WITHIN-TOLERANCE", pass: allNearBest, detail: `every recipe scores within tolerance of the best (≥0.93 of 1.0)` },
    { name: "SINGLE-PEAK-ONE-RECIPE", pass: singleOk, detail: `one peak → ${s2.recipes.length} recipe (no false alternatives)` },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same family" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → no claim" },
    { name: "TOTAL", pass: total, detail: "empty / null / no-dims never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
