/**
 * INVERSE DESIGN — the question every optimizer refuses to answer. An optimizer finds the BEST. But real
 * specs are rarely "best" — they're "hit THIS value": a drug dissolving at exactly 80% in 30 min, an alloy
 * at precisely 600 MPa, a sensor reading dead-on 4.00 V, a model calibrated to a target false-positive rate.
 * "Maximize" is the wrong question; the right one is "give me every recipe that lands on my target — and
 * tell me how much freedom I have around each."
 *
 * INVERSE DESIGN inverts the map. Given your measurements and a target value, it finds the settings whose
 * outcome matches the target, returns SEVERAL distinct recipes (not just one — so you can pick the cheapest
 * or most convenient), measures how much wiggle-room each has, and proposes a fresh setting to probe the
 * target precisely. If the target lies outside what your data can produce, it says so and hands back the
 * closest you can actually reach — the same honest ceiling ACHIEVABILITY draws.
 *
 * Honest by construction (DIAKRISIS): the recipes it returns ARE your real measurements nearest the target
 * (their value is observed, not predicted — so the match is real), plus one interpolated probe to run next.
 * It abstains on thin data and never invents a recipe outside the evidence.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation } from "./engine.js";

export interface InverseSolution { experiment: Experiment; value: number; distanceToTarget: number }
export interface InverseReport {
  target: number;
  feasible: boolean;
  solutions: InverseSolution[];     // distinct real recipes whose measured value is nearest the target
  recipeFreedom: "many" | "few" | "one" | "none";  // how many genuinely different settings hit the target
  proposedProbe: Experiment | null; // a fresh setting predicted to land on the target — run it next
  closest: InverseSolution | null;  // nearest achievable (== best match; meaningful when infeasible)
  note: string;
}

const HB = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
const hal = (k: number, b: number) => { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const dist = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/** Find the settings whose measured outcome matches `target` — the inverse of optimization. */
export function inverseDesign(obs: ReadonlyArray<Observation>, space: Space, target: number): InverseReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < 5 || !Number.isFinite(target)) {
    return { target, feasible: false, solutions: [], recipeFreedom: "none", proposedProbe: null, closest: null, note: `need ≈5+ measurements to invert (have ${n})` };
  }
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const toE = (v: number[]): Experiment => { const e: Experiment = {}; dims.forEach((d, i) => { let x = lo(i) + v[i] * (hi(i) - lo(i)); if (d.type === "int") x = Math.round(x); e[d.name] = x; }); return e; };

  const vals = hist.map((o) => o.value);
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const vRange = Math.max(1e-9, vmax - vmin);
  const feasible = target >= vmin - 1e-9 && target <= vmax + 1e-9;
  const tol = 0.05 * vRange;

  const npts = hist.map((o) => toN(o.experiment));
  // rank measurements by closeness to the target, then greedily keep spatially-DISTINCT recipes
  const ranked = hist.map((o, i) => ({ o, np: npts[i], d: Math.abs(o.value - target) })).sort((a, b) => a.d - b.d);
  const picked: typeof ranked = [];
  for (const r of ranked) {
    if (picked.length >= 4) break;
    if (picked.every((p) => dist(p.np, r.np) > 0.18)) picked.push(r);
  }
  const solutions: InverseSolution[] = picked.map((p) => ({ experiment: p.o.experiment, value: p.o.value, distanceToTarget: +p.d.toFixed(4) }));

  // recipe freedom: how many DISTINCT settings land within tolerance of the target
  const within = ranked.filter((r) => r.d <= tol);
  let distinct = 0; const seen: number[][] = [];
  for (const r of within) { if (seen.every((s) => dist(s, r.np) > 0.18)) { seen.push(r.np); distinct++; } }
  const recipeFreedom: InverseReport["recipeFreedom"] = !feasible ? "none" : distinct >= 3 ? "many" : distinct === 2 ? "few" : "one";

  // proposed probe: interpolate (inverse-distance weighting) a fresh setting predicted to hit the target
  let proposedProbe: Experiment | null = null;
  if (feasible) {
    let best: number[] | null = null, bestErr = Infinity;
    for (let k = 0; k < 1500; k++) {
      const c: number[] = []; for (let d = 0; d < D; d++) c.push(hal(k * 5 + 1, HB[d % HB.length]));
      let sw = 0, swv = 0; for (let i = 0; i < npts.length; i++) { const w = 1 / (dist(c, npts[i]) ** 2 + 1e-6); sw += w; swv += w * vals[i]; }
      const pred = swv / sw; const err = Math.abs(pred - target);
      if (err < bestErr) { bestErr = err; best = c; }
    }
    proposedProbe = best ? toE(best) : null;
  }

  const closest = solutions[0] ?? null;
  const fmt = (x: number) => (Math.abs(x) < 1 ? +x.toFixed(3) : +x.toFixed(2));
  const note = feasible
    ? `${distinct >= 3 ? "many" : distinct === 2 ? "a couple of" : "essentially one"} recipe${distinct === 1 ? "" : "s"} hit target ${fmt(target)} — nearest measured ${closest ? fmt(closest.value) : "?"}; run the proposed probe to land on it precisely`
    : `target ${fmt(target)} is outside what your data can produce (${fmt(vmin)}–${fmt(vmax)}) — closest reachable is ${closest ? fmt(closest.value) : "?"}; add a new lever or relax the target`;
  return { target, feasible, solutions, recipeFreedom, proposedProbe, closest, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function inverseGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };

  // a smooth response spanning 0..1; ask for an exact mid-target and check the returned recipe TRULY hits it
  const f = (x: number, y: number) => 0.5 * (x + y);                       // ranges 0..1, many (x,y) give the same value
  const rnd = lcg(23); const obs: Observation[] = [];
  for (let i = 0; i < 120; i++) { const x = rnd(), y = rnd(); obs.push({ experiment: { x, y }, value: f(x, y) }); }

  const r = inverseDesign(obs, space, 0.5);
  // HITS-TARGET: the top recipe's TRUE value is within tolerance of 0.5 (it's a real measurement, not a guess)
  const top = r.solutions[0];
  const hits = !!top && Math.abs(f(top.experiment.x, top.experiment.y) - 0.5) < 0.05;
  // PROBE-LANDS: the proposed fresh setting, evaluated on the TRUE function, also lands near 0.5
  const probeLands = !!r.proposedProbe && Math.abs(f(r.proposedProbe.x, r.proposedProbe.y) - 0.5) < 0.08;
  // MULTIPLE-RECIPES: x+y=1 is a whole line → the distinct recipes should differ in x (varied settings, same outcome)
  const xs = r.solutions.map((s) => s.experiment.x);
  const spread = xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0;
  const manyRecipes = r.recipeFreedom === "many" && spread > 0.25;

  // INFEASIBLE: target above everything the data produces → flagged; closest == the MAX measured value (the real ceiling)
  const dataMax = Math.max(...obs.map((o) => o.value));
  const rInf = inverseDesign(obs, space, 5.0);
  const infeasibleOk = !rInf.feasible && rInf.proposedProbe === null && !!rInf.closest && Math.abs(rInf.closest.value - dataMax) < 1e-9;

  // UNIQUE-RECIPE: a single-peak function → target near the peak has essentially one recipe
  const g = (x: number, y: number) => Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.02);   // sharp peak 1.0
  const rnd2 = lcg(9); const obs2: Observation[] = [];
  for (let i = 0; i < 140; i++) { const x = rnd2(), y = rnd2(); obs2.push({ experiment: { x, y }, value: g(x, y) }); }
  for (let i = 0; i < 10; i++) { const x = 0.5 + (rnd2() - 0.5) * 0.05, y = 0.5 + (rnd2() - 0.5) * 0.05; obs2.push({ experiment: { x, y }, value: g(x, y) }); }
  const rUniq = inverseDesign(obs2, space, 0.97);
  const uniqueOk = rUniq.feasible && (rUniq.recipeFreedom === "one" || rUniq.recipeFreedom === "few");

  const det = JSON.stringify(inverseDesign(obs, space, 0.5)) === JSON.stringify(inverseDesign(obs, space, 0.5));
  const abstains = inverseDesign(obs.slice(0, 3), space, 0.5).note.indexOf("need") >= 0;
  const total = (() => { try { inverseDesign(null as never, space, 1); inverseDesign([], space, NaN); return true; } catch { return false; } })();

  const checks = [
    { name: "HITS-TARGET", pass: hits, detail: top ? `top recipe's TRUE value ${f(top.experiment.x, top.experiment.y).toFixed(3)} ≈ target 0.5` : "no solution" },
    { name: "PROBE-LANDS", pass: probeLands, detail: r.proposedProbe ? `interpolated probe lands at ${f(r.proposedProbe.x, r.proposedProbe.y).toFixed(3)}` : "no probe" },
    { name: "MULTIPLE-RECIPES", pass: manyRecipes, detail: `level-set x+y=1 → ${r.solutions.length} distinct recipes, x spread ${spread.toFixed(2)} (${r.recipeFreedom})` },
    { name: "INFEASIBLE-FLAGGED", pass: infeasibleOk, detail: `target 5.0 → infeasible, closest ${rInf.closest ? rInf.closest.value.toFixed(3) : "?"} == data max ${dataMax.toFixed(3)} (the real ceiling)` },
    { name: "UNIQUE-RECIPE", pass: uniqueOk, detail: `sharp peak, target 0.97 → freedom "${rUniq.recipeFreedom}"` },
    { name: "DETERMINISTIC", pass: det, detail: "same data+target → same recipes" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → no inversion" },
    { name: "TOTAL", pass: total, detail: "null / empty / NaN never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
