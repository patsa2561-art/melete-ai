/**
 * TERRITORY — the leap-into-the-unknown detector. Virgin ground no optimizer maps: when the engine hands you
 * the next experiment, is it a SAFE REFINEMENT (sitting inside the region you've already measured, so the
 * prediction is supported by data) or a BOLD LEAP (out beyond everything you've tried, where the score is
 * essentially a guess)?
 *
 * For an expensive or dangerous experiment this is the difference between a routine tweak and a shot in the
 * dark that could waste a batch or stress a machine. Bayesian optimisers deliberately explore into the
 * unknown — but they never TELL the operator "heads up, this one is a leap". TERRITORY does: it measures how
 * far a proposal sits from your data relative to the data's own spacing, classifies it refine / explore /
 * leap, and reports how much of the space you've actually charted (the unexplored gaps).
 *
 * Honest by construction (DIAKRISIS): novelty is relative to YOUR sampling density (a leap means "much
 * farther than your points usually sit from each other", not an absolute safety claim); it abstains with too
 * little data. Decision support for where you're stepping — not a guarantee the leap is bad (leaps are often
 * how you find the big win) or that a refinement is correct.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation } from "./engine.js";

export interface TerritoryAssessment {
  classification: "refine" | "explore" | "leap" | "unknown";
  noveltyScore: number;     // nearest-data distance ÷ the data's own typical spacing (≈1 = as close as usual)
  nearestDist: number;      // normalised distance to the closest measured point
  typicalDist: number;      // the data's own median nearest-neighbour distance
  note: string;
}

function norm(space: Space, e: Experiment): number[] {
  return space.dims.map((d) => { const lo = d.min ?? 0, hi = d.max ?? 1; const span = hi - lo || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo) / span)); });
}
const dist = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
const median = (xs: number[]) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); const m = s.length; return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2; };

/** Is `proposal` a safe refinement inside the measured region, or a leap into unmeasured territory? */
export function assessTerritory(proposal: Experiment, obs: ReadonlyArray<Observation>, space: Space): TerritoryAssessment {
  const hist = (obs ?? []).filter((o) => o && o.experiment);
  if ((space?.dims?.length ?? 0) === 0 || hist.length < 3 || !proposal) {
    return { classification: "unknown", noveltyScore: 0, nearestDist: 0, typicalDist: 0, note: "not enough measured points yet to judge" };
  }
  const pts = hist.map((o) => norm(space, o.experiment));
  const p = norm(space, proposal);
  const nearestDist = Math.min(...pts.map((q) => dist(p, q)));
  // the data's own spacing: each point's distance to its nearest OTHER point
  const nn: number[] = [];
  for (let i = 0; i < pts.length; i++) { let m = Infinity; for (let j = 0; j < pts.length; j++) { if (j !== i) { const d = dist(pts[i], pts[j]); if (d < m) m = d; } } if (Number.isFinite(m)) nn.push(m); }
  const typicalDist = Math.max(1e-9, median(nn));
  const noveltyScore = nearestDist / typicalDist;
  const classification = noveltyScore < 1.5 ? "refine" : noveltyScore < 3 ? "explore" : "leap";
  const note = classification === "refine" ? "a safe refinement — sits inside the region you've measured"
    : classification === "explore" ? "a step outward — partly beyond your measured points"
    : "a leap into unmeasured territory — the prediction here is largely a guess; proceed with care if the experiment is costly or risky";
  return { classification, noveltyScore: +noveltyScore.toFixed(3), nearestDist: +nearestDist.toFixed(4), typicalDist: +typicalDist.toFixed(4), note };
}

/** Fraction of the search space that has been charted (a coarse grid; how many cells hold a measurement). */
export function coverageScore(obs: ReadonlyArray<Observation>, space: Space): { coverage: number; cells: number; filled: number } {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment);
  if (D === 0 || !hist.length) return { coverage: 0, cells: 0, filled: 0 };
  const per = Math.max(2, Math.min(6, Math.round(Math.pow(2000, 1 / D))));   // grid resolution, capped so cells stays sane
  const cells = Math.round(Math.pow(per, D));
  const seen = new Set<string>();
  for (const o of hist) { const p = norm(space, o.experiment); const key = p.map((v) => Math.min(per - 1, Math.floor(v * per))).join(","); seen.add(key); }
  return { coverage: +(seen.size / cells).toFixed(4), cells, filled: seen.size };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function territoryGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  // measured data lives ONLY in the lower-left quarter [0,0.5]²
  const rnd = lcg(17); const obs: Observation[] = [];
  for (let i = 0; i < 60; i++) obs.push({ experiment: { x: rnd() * 0.5, y: rnd() * 0.5 }, value: 0 });

  const inside = assessTerritory({ x: 0.25, y: 0.25 }, obs, space);   // dead centre of the data → refine
  const farLeap = assessTerritory({ x: 0.95, y: 0.95 }, obs, space);  // opposite corner, far from all data → leap
  const edge = assessTerritory({ x: 0.6, y: 0.6 }, obs, space);       // just outside → explore-ish

  const refineInside = inside.classification === "refine";
  const leapFar = farLeap.classification === "leap";
  const monotonic = farLeap.noveltyScore > edge.noveltyScore && edge.noveltyScore > inside.noveltyScore;  // novelty grows with distance
  // coverage: data in 1 quarter → low; data spread over the whole space → high
  const covLow = coverageScore(obs, space).coverage < 0.35;
  const rnd2 = lcg(4); const full: Observation[] = []; for (let i = 0; i < 400; i++) full.push({ experiment: { x: rnd2(), y: rnd2() }, value: 0 });
  const covHigh = coverageScore(full, space).coverage > 0.6;
  // deterministic + abstain + total
  const det = JSON.stringify(assessTerritory({ x: 0.95, y: 0.95 }, obs, space)) === JSON.stringify(assessTerritory({ x: 0.95, y: 0.95 }, obs, space));
  const abstains = assessTerritory({ x: 0.5, y: 0.5 }, obs.slice(0, 2), space).classification === "unknown";
  const total = (() => { try { assessTerritory(null as never, obs, space); assessTerritory({ x: 0 }, [], space); coverageScore(null as never, space); return true; } catch { return false; } })();

  const checks = [
    { name: "REFINE-INSIDE", pass: refineInside, detail: `a point inside the measured region is "refine" (novelty ${inside.noveltyScore})` },
    { name: "LEAP-FAR", pass: leapFar, detail: `a point far beyond the data is "leap" (novelty ${farLeap.noveltyScore})` },
    { name: "NOVELTY-MONOTONIC", pass: monotonic, detail: `novelty grows with distance from data (${inside.noveltyScore} < ${edge.noveltyScore} < ${farLeap.noveltyScore})` },
    { name: "COVERAGE-LOW-WHEN-CLUSTERED", pass: covLow, detail: `data in one quarter → low coverage (${coverageScore(obs, space).coverage})` },
    { name: "COVERAGE-HIGH-WHEN-SPREAD", pass: covHigh, detail: `data over the whole space → high coverage (${coverageScore(full, space).coverage})` },
    { name: "DETERMINISTIC", pass: det, detail: "same proposal + data → same assessment" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "fewer than 3 measured points → unknown" },
    { name: "TOTAL", pass: total, detail: "null / empty never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
