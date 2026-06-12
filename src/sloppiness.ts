/**
 * SLOPPINESS — the rarest lens: how many knobs do you REALLY have? Borrowed from "sloppy models" in systems
 * biology and physics (Sethna, Transtrum), an idea almost no optimizer ships. You think you're tuning five
 * variables; the response often cares about only two or three COMBINATIONS of them, and is nearly flat along
 * the rest. Those flat ("sloppy") directions are freedom: you can set them however is cheapest, fastest, or
 * safest without hurting the result. The steep ("stiff") directions are the ones you must hold precisely.
 *
 * SLOPPINESS fits the response curvature (the Hessian) around your data, eigen-decomposes it, and reads off
 * the spectrum: each eigenvector is a combination of your variables, each eigenvalue is how sharply the
 * result changes along it. A spectrum spanning orders of magnitude = a sloppy system: a few stiff
 * directions matter, the rest are free. The headline is the EFFECTIVE DIMENSIONALITY — "you have 5 knobs
 * but only 2 combinations truly move the needle."
 *
 * Honest by construction (DIAKRISIS): this is a LOCAL quadratic (Hessian) picture, valid where your data
 * concentrates; eigenvectors are reported as the literal variable loadings, stiffness as the eigenvalue
 * ratio to the stiffest. It abstains when there isn't enough data to fit a curvature.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface SloppyDirection { stiffness: number; kind: "stiff" | "sloppy"; loadings: Array<{ name: string; weight: number }> }
export interface SloppinessReport {
  effectiveDims: number;     // how many combinations actually matter
  totalDims: number;
  directions: SloppyDirection[];   // eigen-directions, stiffest first
  note: string;
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length; const M = A.map((r, i) => r.concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col; for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    const t = M[col]; M[col] = M[piv]; M[piv] = t;
    const d = M[col][col]; if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < n; r++) { if (r === col) continue; const f = M[r][col] / d; if (f === 0) continue; for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]; }
  }
  const x = new Array(n).fill(0); for (let i = 0; i < n; i++) { const d = M[i][i]; x[i] = Math.abs(d) > 1e-12 ? M[i][n] / d : 0; } return x;
}

/** Jacobi eigenvalue decomposition of a symmetric DxD matrix → {values, vectors(columns)}. */
function jacobiEig(A: number[][]): { values: number[]; vectors: number[][] } {
  const n = A.length;
  const a = A.map((r) => r.slice());
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-20) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let i = 0; i < n; i++) { const aip = a[i][p], aiq = a[i][q]; a[i][p] = c * aip - s * aiq; a[i][q] = s * aip + c * aiq; }
      for (let i = 0; i < n; i++) { const api = a[p][i], aqi = a[q][i]; a[p][i] = c * api - s * aqi; a[q][i] = s * api + c * aqi; }
      for (let i = 0; i < n; i++) { const vip = V[i][p], viq = V[i][q]; V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq; }
    }
  }
  const values = a.map((_, i) => a[i][i]);
  const vectors = V;   // column j is the eigenvector for values[j]
  return { values, vectors };
}

/** Analyse how many independent combinations of variables actually matter (stiff) vs are free (sloppy). */
export function analyzeSloppiness(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize"): SloppinessReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  const nFeat = 1 + 2 * D + (D * (D - 1)) / 2;
  if (D < 2 || n < nFeat + 4) {
    return { effectiveDims: NaN, totalDims: D, directions: [], note: `need ≈${nFeat + 4}+ measurements and ≥2 variables to read sloppiness (have ${n}, ${D}D)` };
  }
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const X = hist.map((o) => toN(o.experiment));
  const y = hist.map((o) => o.value);

  // quadratic feature map: 1, x_k, x_k², x_i x_j (i<j)
  const pairs: Array<[number, number]> = []; for (let i = 0; i < D; i++) for (let j = i + 1; j < D; j++) pairs.push([i, j]);
  const feat = (x: number[]) => { const f = [1]; for (let k = 0; k < D; k++) f.push(x[k]); for (let k = 0; k < D; k++) f.push(x[k] * x[k]); for (const [i, j] of pairs) f.push(x[i] * x[j]); return f; };
  const F = X.map(feat); const m = F[0].length;
  const XtX: number[][] = Array.from({ length: m }, () => new Array(m).fill(0)); const Xty = new Array(m).fill(0);
  for (let r = 0; r < n; r++) { const f = F[r]; for (let a = 0; a < m; a++) { Xty[a] += f[a] * y[r]; for (let b = 0; b < m; b++) XtX[a][b] += f[a] * f[b]; } }
  for (let a = 0; a < m; a++) XtX[a][a] += 1e-7;
  const coef = solve(XtX, Xty);

  // assemble the Hessian H (symmetric): coef(x_k²)=½H_kk → H_kk=2·coef ; coef(x_i x_j)=H_ij
  const H: number[][] = Array.from({ length: D }, () => new Array(D).fill(0));
  for (let k = 0; k < D; k++) H[k][k] = 2 * coef[1 + D + k];
  let pi = 1 + 2 * D; for (const [i, j] of pairs) { H[i][j] = H[j][i] = coef[pi++]; }

  const { values, vectors } = jacobiEig(H);
  // sort eigen-directions by |eigenvalue| descending (stiffest first)
  const idx = values.map((_, i) => i).sort((a, b) => Math.abs(values[b]) - Math.abs(values[a]));
  const absMax = Math.max(1e-12, Math.abs(values[idx[0]]));
  const directions: SloppyDirection[] = idx.map((ix) => {
    const stiff = Math.abs(values[ix]) / absMax;
    const loadings = dims.map((d, k) => ({ name: d.name, weight: +vectors[k][ix].toFixed(3) })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    return { stiffness: +stiff.toFixed(4), kind: stiff >= 0.05 ? "stiff" : "sloppy", loadings };
  });
  const effectiveDims = directions.filter((d) => d.kind === "stiff").length;
  const sloppy = directions.filter((d) => d.kind === "sloppy").length;
  const topCombo = directions[0].loadings.filter((l) => Math.abs(l.weight) > 0.25).map((l) => `${l.weight > 0 ? "" : "−"}${l.name}`).join(" & ");
  const note = sloppy === 0
    ? `all ${D} of your variables matter independently — no free directions to exploit`
    : `only ${effectiveDims} of ${D} combinations truly move the result (the stiffest ≈ ${topCombo}); the other ${sloppy} ${sloppy === 1 ? "direction is" : "directions are"} sloppy — set them however is cheapest/easiest`;
  return { effectiveDims, totalDims: D, directions, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

const cos = (a: number[], b: number[]) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return Math.abs(d) / (Math.sqrt(na * nb) || 1); };

export function sloppinessGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };

  // SLOPPY system: response depends only on (x+y) → one stiff direction (1,1), one sloppy (1,−1)
  const fSloppy = (x: number, y: number) => -((x + y - 1) ** 2);
  const r1 = lcg(7); const o1: Observation[] = [];
  for (let i = 0; i < 60; i++) { const x = r1(), y = r1(); o1.push({ experiment: { x, y }, value: fSloppy(x, y) }); }
  const s1 = analyzeSloppiness(o1, space, "maximize");
  const stiffVec = s1.directions[0] ? [s1.directions[0].loadings.find((l) => l.name === "x")!.weight, s1.directions[0].loadings.find((l) => l.name === "y")!.weight] : [0, 0];
  const recoversStiff = cos(stiffVec, [1, 1]) > 0.95;                 // stiffest direction ≈ (x+y)
  const findsSloppy = s1.effectiveDims === 1 && s1.directions.some((d) => d.kind === "sloppy");

  // ISOTROPIC system: f = -(x²+y²) → both directions equally stiff → effectiveDims 2, no sloppy
  const fIso = (x: number, y: number) => -(((x - 0.5) ** 2) + ((y - 0.5) ** 2));
  const r2 = lcg(3); const o2: Observation[] = [];
  for (let i = 0; i < 60; i++) { const x = r2(), y = r2(); o2.push({ experiment: { x, y }, value: fIso(x, y) }); }
  const s2 = analyzeSloppiness(o2, space, "maximize");
  const isotropicBothStiff = s2.effectiveDims === 2 && s2.directions.every((d) => d.kind === "stiff");

  // SPECTRUM ordered: stiffness descending, top = 1.0
  const ordered = s1.directions.length === 2 && s1.directions[0].stiffness >= s1.directions[1].stiffness && Math.abs(s1.directions[0].stiffness - 1) < 1e-6;
  // the sloppy direction of the (x+y) system is ≈ (1,−1)
  const sloppyDir = s1.directions[1] ? [s1.directions[1].loadings.find((l) => l.name === "x")!.weight, s1.directions[1].loadings.find((l) => l.name === "y")!.weight] : [0, 0];
  const sloppyIsAntidiag = cos(sloppyDir, [1, -1]) > 0.95;

  const det = JSON.stringify(analyzeSloppiness(o1, space, "maximize")) === JSON.stringify(analyzeSloppiness(o1, space, "maximize"));
  const abstains = analyzeSloppiness(o1.slice(0, 5), space, "maximize").note.indexOf("need") >= 0;
  const total = (() => { try { analyzeSloppiness([], space); analyzeSloppiness(null as never, space); analyzeSloppiness(o1, { dims: [{ name: "x", type: "real", min: 0, max: 1 }] }); return true; } catch { return false; } })();

  const checks = [
    { name: "RECOVERS-STIFF-COMBO", pass: recoversStiff, detail: `(x+y)-only response → stiffest direction ≈ x & y together (cos ${cos(stiffVec, [1, 1]).toFixed(3)})` },
    { name: "FINDS-SLOPPY-FREEDOM", pass: findsSloppy, detail: `effective dims ${s1.effectiveDims}/2 — one sloppy (free) direction found` },
    { name: "SLOPPY-DIRECTION-CORRECT", pass: sloppyIsAntidiag, detail: `the free direction ≈ x−y (cos ${cos(sloppyDir, [1, -1]).toFixed(3)})` },
    { name: "ISOTROPIC-ALL-STIFF", pass: isotropicBothStiff, detail: `f=-(x²+y²) → both matter, effective dims ${s2.effectiveDims}/2, no free direction` },
    { name: "SPECTRUM-ORDERED", pass: ordered, detail: "directions sorted stiffest-first, normalised to 1.0" },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same spectrum" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → no claim" },
    { name: "TOTAL", pass: total, detail: "empty / null / 1-D never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
