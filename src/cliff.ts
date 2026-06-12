/**
 * CLIFF / TIPPING-POINT detector — where does a tiny change make the result fall off a cliff? Most analyses
 * assume the response is smooth. Real processes aren't: a catalyst poisons past a temperature, a model
 * collapses past a learning rate, a material shatters past a load, a yield craters past a pH. These cliffs
 * are where disasters live — and a "best setting" sitting right on the edge of one is a setting that works
 * brilliantly today and fails the morning the room is 1° warmer.
 *
 * CLIFF scans your measurements for NEIGHBOURS that are close in settings but far apart in result — the
 * fingerprint of a cliff — and reports where they are, how big the drop is, and which knob you crossed.
 * Crucially, it flags when your OPTIMUM sits on a cliff edge: a loud warning to step back to a safer,
 * flatter setting even if it scores a hair lower.
 *
 * Honest by construction (DIAKRISIS): a cliff is detected only where two genuinely-near experiments disagree
 * far more than the typical local change AND the drop is a real fraction of your result range — measured
 * from your data, not assumed. It can't see a cliff hiding between samples you never took near; it reports
 * the ones your data actually straddles, and abstains when data is too thin.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface Cliff { at: Record<string, number>; drop: number; steepness: number; variable: string }
export interface CliffReport {
  cliffs: Cliff[];
  optimumOnCliff: boolean;
  note: string;
}

const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/** Find settings where a small change causes a big drop in result (cliffs / tipping points). */
export function analyzeCliffs(obs: ReadonlyArray<Observation>, space: Space, _goal: Goal = "maximize"): CliffReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < 8) return { cliffs: [], optimumOnCliff: false, note: `need ≈8+ measurements to find cliffs (have ${n})` };
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const P = hist.map((o) => toN(o.experiment));
  const V = hist.map((o) => o.value);
  const vRange = Math.max(1e-9, Math.max(...V) - Math.min(...V));

  // typical local spacing
  const nn: number[] = [];
  for (let i = 0; i < n; i++) { let m = Infinity; for (let j = 0; j < n; j++) if (j !== i) m = Math.min(m, dst(P[i], P[j])); nn.push(m); }
  const medNN = nn.slice().sort((a, b) => a - b)[Math.floor(n / 2)] || 0.1;
  const rho = Math.max(1e-6, medNN * 2.5);                       // "neighbour" radius

  // gradients of near pairs
  const grads: Array<{ i: number; j: number; g: number; dv: number }> = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = dst(P[i], P[j]); if (d > 1e-6 && d <= rho) grads.push({ i, j, g: Math.abs(V[i] - V[j]) / d, dv: Math.abs(V[i] - V[j]) }); }
  if (!grads.length) return { cliffs: [], optimumOnCliff: false, note: "no near-neighbour pairs to compare — sample a little denser" };
  const medG = grads.map((x) => x.g).sort((a, b) => a - b)[Math.floor(grads.length / 2)] || 0;

  // a cliff: gradient ≫ typical AND the drop is a real fraction of the result range
  const candidates = grads.filter((x) => x.g > 3 * medG + 1e-9 && x.dv > 0.15 * vRange).sort((a, b) => b.g - a.g);
  const cliffs: Cliff[] = []; const taken: number[][] = [];
  for (const c of candidates) {
    const mid = P[c.i].map((v, k) => (v + P[c.j][k]) / 2);
    if (taken.some((t) => dst(t, mid) < 0.12)) continue;          // dedupe nearby cliffs
    taken.push(mid);
    let vk = 0, vmax = -1; for (let k = 0; k < D; k++) { const dd = Math.abs(P[c.i][k] - P[c.j][k]); if (dd > vmax) { vmax = dd; vk = k; } }
    const at: Record<string, number> = {}; dims.forEach((d, k) => { const real = lo(k) + mid[k] * (hi(k) - lo(k)); at[d.name] = +(d.type === "int" ? Math.round(real) : +real.toFixed(4)); });
    cliffs.push({ at, drop: +c.dv.toFixed(4), steepness: +(c.g / (medG || 1)).toFixed(1), variable: dims[vk].name });
    if (cliffs.length >= 5) break;
  }

  // is the optimum sitting on a cliff edge?
  const sgn = _goal === "minimize" ? -1 : 1;
  let bestIdx = 0; for (let i = 1; i < n; i++) if (sgn * V[i] > sgn * V[bestIdx]) bestIdx = i;
  const optimumOnCliff = candidates.some((c) => c.i === bestIdx || c.j === bestIdx);

  const note = cliffs.length === 0
    ? "no cliffs in range — the response looks smooth where you've measured (small changes → small effects)"
    : `${cliffs.length} cliff${cliffs.length > 1 ? "s" : ""} found — near ${cliffs[0].variable} ≈ ${cliffs[0].at[cliffs[0].variable]}, a small step drops the result by ${cliffs[0].drop}${optimumOnCliff ? ". ⚠ your best setting sits ON a cliff edge — step back to a flatter, safer one" : ""}`;
  return { cliffs, optimumOnCliff, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function cliffGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };

  // STEP: a cliff at x = 0.5 (0.1 below, 0.9 above), gentle in y
  const step = (x: number, y: number) => (x < 0.5 ? 0.1 : 0.9) + 0.05 * y;
  const r1 = lcg(13); const o1: Observation[] = [];
  for (let i = 0; i < 90; i++) { const x = r1(), y = r1(); o1.push({ experiment: { x, y }, value: step(x, y) }); }
  const c1 = analyzeCliffs(o1, space, "maximize");
  const detects = c1.cliffs.length >= 1;
  const locatedRight = detects && Math.abs(c1.cliffs[0].at.x - 0.5) < 0.15;
  const variableRight = detects && c1.cliffs[0].variable === "x";

  // SMOOTH: linear ramp → no cliffs
  const smooth = (x: number, y: number) => 0.5 * (x + y);
  const r2 = lcg(4); const o2: Observation[] = [];
  for (let i = 0; i < 90; i++) { const x = r2(), y = r2(); o2.push({ experiment: { x, y }, value: smooth(x, y) }); }
  const c2 = analyzeCliffs(o2, space, "maximize");
  const smoothClean = c2.cliffs.length === 0 && !c2.optimumOnCliff;

  // OPTIMUM-ON-CLIFF: a narrow high ledge bordered by drops; the best sits on the edge
  const ledge = (x: number, y: number) => (x >= 0.5 && x < 0.58 ? 1.0 : 0.2) + 0.02 * y;
  const r3 = lcg(8); const o3: Observation[] = [];
  for (let i = 0; i < 130; i++) { const x = r3(), y = r3(); o3.push({ experiment: { x, y }, value: ledge(x, y) }); }
  const c3 = analyzeCliffs(o3, space, "maximize");
  const optOnCliff = c3.optimumOnCliff && c3.cliffs.length >= 1;

  const det = JSON.stringify(analyzeCliffs(o1, space, "maximize")) === JSON.stringify(analyzeCliffs(o1, space, "maximize"));
  const abstains = analyzeCliffs(o1.slice(0, 5), space, "maximize").note.indexOf("need") >= 0;
  const total = (() => { try { analyzeCliffs([], space); analyzeCliffs(null as never, space); analyzeCliffs(o1, { dims: [] }); return true; } catch { return false; } })();

  const checks = [
    { name: "DETECTS-CLIFF", pass: detects, detail: `step landscape → ${c1.cliffs.length} cliff(s) found (steepness ${c1.cliffs[0]?.steepness}× typical)` },
    { name: "LOCATES-CLIFF", pass: locatedRight, detail: `cliff at x ≈ ${c1.cliffs[0]?.at.x} (true edge 0.5)` },
    { name: "IDENTIFIES-VARIABLE", pass: variableRight, detail: `the knob you crossed = ${c1.cliffs[0]?.variable} (true: x)` },
    { name: "SMOOTH-NO-FALSE-CLIFF", pass: smoothClean, detail: `smooth ramp → ${c2.cliffs.length} cliffs (no false alarm)` },
    { name: "OPTIMUM-ON-CLIFF-WARNING", pass: optOnCliff, detail: `narrow ledge → best flagged on a cliff edge (${c3.optimumOnCliff})` },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same cliffs" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → no claim" },
    { name: "TOTAL", pass: total, detail: "empty / null / no-dims never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
