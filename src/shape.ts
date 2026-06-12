/**
 * RESPONSE SHAPE — what does your optimum actually look like? "Find the best setting" hides a question that
 * changes everything you do next: is the best a sharp PEAK (one precise spot, hold it tight), a RIDGE (a
 * whole LINE of settings that all work equally well — huge freedom), a SADDLE (improving one knob forces
 * another to get worse — proceed carefully), a PLATEAU (broad and flat — almost anything nearby is fine), or
 * a BOWL/EDGE (the best the data shows is at a boundary — push the limits further)? Knowing the shape tells
 * you how much to trust the optimum, how tightly to hold it, and where to explore.
 *
 * SHAPE fits the response curvature (the Hessian) around your data and reads the SIGNS and magnitudes of its
 * eigenvalues — the geometry of the surface. All curving down → a peak. One flat direction → a ridge. Mixed
 * up-and-down → a saddle. All curving up (for a maximiser) → you're climbing toward an edge. It's the same
 * eigen-geometry physicists use to classify critical points, turned into one plain word.
 *
 * Honest by construction (DIAKRISIS): a LOCAL second-order picture, valid where your data concentrates;
 * eigenvalue signs are read with a small dead-band so near-zero curvatures are honestly called "flat". It
 * abstains when there isn't enough data to fit a curvature.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export type ShapeKind = "peak" | "ridge" | "saddle" | "plateau" | "bowl" | "unknown";
export interface ShapeReport {
  shape: ShapeKind;
  curvatures: number[];        // eigenvalues of the response Hessian (sorted), normalised to max magnitude
  flatDirections: number;      // how many near-zero (free) curvature directions
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

function jacobiValues(A: number[][]): number[] {
  const n = A.length; const a = A.map((r) => r.slice());
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
    }
  }
  return a.map((_, i) => a[i][i]);
}

/** Classify the geometric shape of the response around the data (peak / ridge / saddle / plateau / bowl). */
export function analyzeShape(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize"): ShapeReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  const nFeat = 1 + 2 * D + (D * (D - 1)) / 2;
  if (D < 2 || n < nFeat + 4) return { shape: "unknown", curvatures: [], flatDirections: 0, note: `need ≈${nFeat + 4}+ measurements and ≥2 variables to read the shape (have ${n})` };
  const sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const X = hist.map((o) => toN(o.experiment));
  const y = hist.map((o) => sgn * o.value);   // analyse in maximisation space: a good optimum curves DOWN

  const pairs: Array<[number, number]> = []; for (let i = 0; i < D; i++) for (let j = i + 1; j < D; j++) pairs.push([i, j]);
  const feat = (x: number[]) => { const f = [1]; for (let k = 0; k < D; k++) f.push(x[k]); for (let k = 0; k < D; k++) f.push(x[k] * x[k]); for (const [i, j] of pairs) f.push(x[i] * x[j]); return f; };
  const F = X.map(feat); const m = F[0].length;
  const XtX: number[][] = Array.from({ length: m }, () => new Array(m).fill(0)); const Xty = new Array(m).fill(0);
  for (let r = 0; r < n; r++) { const f = F[r]; for (let a = 0; a < m; a++) { Xty[a] += f[a] * y[r]; for (let b = 0; b < m; b++) XtX[a][b] += f[a] * f[b]; } }
  for (let a = 0; a < m; a++) XtX[a][a] += 1e-7;
  const coef = solve(XtX, Xty);
  const H: number[][] = Array.from({ length: D }, () => new Array(D).fill(0));
  for (let k = 0; k < D; k++) H[k][k] = 2 * coef[1 + D + k];
  let pi = 1 + 2 * D; for (const [i, j] of pairs) { H[i][j] = H[j][i] = coef[pi++]; }

  const ev = jacobiValues(H);
  const maxAbs = Math.max(1e-12, ...ev.map((v) => Math.abs(v)));
  const r = ev.map((v) => v / maxAbs).sort((a, b) => b - a);   // normalised eigenvalues, descending
  const band = 0.08;
  const nPos = r.filter((v) => v > band).length;
  const nNeg = r.filter((v) => v < -band).length;
  const nZero = r.length - nPos - nNeg;

  // in maximisation space: concave (negative) curvature = a real optimum direction
  let shape: ShapeKind;
  if (nPos >= 1 && nNeg >= 1) shape = "saddle";
  else if (nZero === D) shape = "plateau";
  else if (nPos === D) shape = "bowl";                          // convex up → best is at a boundary
  else if (nZero >= 1) shape = "ridge";                         // a flat (free) direction alongside curved ones
  else shape = "peak";                                          // all curving down → a clean optimum point

  const note = {
    peak: "a sharp PEAK — one precise sweet spot; hold the settings tight.",
    ridge: `a RIDGE — ${nZero} whole direction${nZero > 1 ? "s" : ""} of settings score about the same; you have real freedom along it (pick the cheapest).`,
    saddle: "a SADDLE — improving one direction makes another worse; proceed carefully, the optimum is a trade-off.",
    plateau: "a PLATEAU — broad and flat; almost any nearby setting works about as well.",
    bowl: "an EDGE/BOWL — the best your data shows sits at a boundary; push the limits further to keep improving.",
    unknown: "",
  }[shape];
  return { shape, curvatures: r.map((v) => +v.toFixed(3)), flatDirections: nZero, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function shapeGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const sample = (f: (x: number, y: number) => number, seed: number) => { const r = lcg(seed); const o: Observation[] = []; for (let i = 0; i < 70; i++) { const x = r(), y = r(); o.push({ experiment: { x, y }, value: f(x, y) }); } return o; };

  const peak = analyzeShape(sample((x, y) => -(((x - 0.5) ** 2) + ((y - 0.5) ** 2)), 3), space, "maximize");
  const ridge = analyzeShape(sample((x, y) => -((x + y - 1) ** 2), 4), space, "maximize");
  const saddle = analyzeShape(sample((x, y) => ((x - 0.5) ** 2) - ((y - 0.5) ** 2), 5), space, "maximize");
  const bowl = analyzeShape(sample((x, y) => ((x - 0.5) ** 2) + ((y - 0.5) ** 2), 6), space, "maximize");

  const det = JSON.stringify(analyzeShape(sample((x, y) => -(((x - 0.5) ** 2) + ((y - 0.5) ** 2)), 3), space, "maximize")) === JSON.stringify(peak);
  const abstains = analyzeShape(sample((x, y) => x, 3).slice(0, 5), space, "maximize").shape === "unknown";
  const total = (() => { try { analyzeShape([], space); analyzeShape(null as never, space); analyzeShape(sample((x, y) => x, 1), { dims: [{ name: "x", type: "real", min: 0, max: 1 }] }); return true; } catch { return false; } })();

  const checks = [
    { name: "PEAK", pass: peak.shape === "peak", detail: `-(x²+y²) → "${peak.shape}" (curvatures ${peak.curvatures})` },
    { name: "RIDGE", pass: ridge.shape === "ridge" && ridge.flatDirections === 1, detail: `-(x+y)² → "${ridge.shape}", ${ridge.flatDirections} flat direction` },
    { name: "SADDLE", pass: saddle.shape === "saddle", detail: `x²−y² → "${saddle.shape}" (mixed curvature)` },
    { name: "BOWL/EDGE", pass: bowl.shape === "bowl", detail: `x²+y² (maximise) → "${bowl.shape}" — best at a boundary` },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same shape" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → unknown" },
    { name: "TOTAL", pass: total, detail: "empty / null / 1-D never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
