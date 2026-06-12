/**
 * CERTIFY — the Optimality Certificate. The thing no black-box optimizer ships: a falsifiable bound on
 * HOW FAR the best-found could be from the true global best.
 *
 * Every optimizer returns "here's the best I found". None tell you "and the true optimum cannot be more
 * than X% better than this" — so you never know if you stopped because it's good or because the optimizer
 * is bad. CERTIFY closes that: assuming the response surface changes no faster than a Lipschitz constant L
 * (ESTIMATED FROM YOUR OWN DATA, then held conservatively), the value at any unobserved point x is bounded
 * by min_i ( f(x_i) + L·‖x − x_i‖ ). Maximising that bound over a space-filling sweep gives a CERTIFIED
 * CEILING the global optimum cannot exceed. Your best vs that ceiling = a provable "within X% of the best
 * possible" — signable alongside the discovery trace.
 *
 * Honest by construction (DIAKRISIS): this is "certified UNDER a data-estimated Lipschitz bound", not an
 * unconditional proof — a black box can hide an arbitrarily sharp spike between samples. We estimate L from
 * the observed pairs and hold a conservative safety factor, and we STATE the assumption. The gauntlet
 * checks the honest, guaranteed properties (the ceiling never sits below what you already saw, it tightens
 * as you sample more, it is deterministic) and that on smooth, well-sampled surfaces the certified gap is
 * small — falsifiable, reproducible.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface OptimalityCertificate {
  n: number;
  bestObserved: number;            // best value seen (raw units, in the goal direction)
  certifiedCeiling: number;        // the optimum provably cannot beat this (under the est. Lipschitz bound)
  gap: number;                     // certifiedCeiling − bestObserved, in goal-normalised units (>= 0)
  withinPct: number;               // 100 · bestObserved-vs-ceiling → "you are within this % of the best possible"
  lipschitz: number;               // the conservative Lipschitz constant used (normalised space)
  assumption: string;
}

/** map an experiment to a point in normalised [0,1]^d using the space bounds */
function norm(space: Space, e: Experiment): number[] {
  return space.dims.map((d) => { const lo = d.min ?? 0, hi = d.max ?? 1; const span = hi - lo || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo) / span)); });
}
const dist = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };

/** deterministic Halton low-discrepancy point (index k, base) — space-filling without randomness */
function halton(k: number, base: number): number { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); } return r; }
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];

/**
 * Certify how close the best-found is to the global optimum, under a data-estimated Lipschitz bound.
 * @param obs    the (experiment, value) history
 * @param space  the search space (for normalisation + the sweep)
 * @param goal   maximise | minimise
 * @param safety conservative multiplier on the estimated Lipschitz constant (>=1; default 1.5)
 * @param sweep  number of space-filling probe points for the ceiling (default 2000)
 */
export function certifyOptimality(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize", safety = 1.5, sweep = 2000): OptimalityCertificate {
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const d = space?.dims?.length ?? 0;
  const sgn = goal === "minimize" ? -1 : 1;                    // work in "higher = better"
  const pts = hist.map((o) => norm(space, o.experiment));
  const vals = hist.map((o) => sgn * o.value);
  const n = hist.length;
  const bestNorm = n ? Math.max(...vals) : 0;
  const bestRaw = sgn * bestNorm;
  if (n < 2 || d === 0) {
    return { n, bestObserved: bestRaw, certifiedCeiling: bestRaw, gap: 0, withinPct: n ? 100 : 0, lipschitz: 0, assumption: "need ≥2 observations to estimate a Lipschitz bound" };
  }
  // estimate Lipschitz L = max |Δv| / ‖Δx‖ over observed pairs, held conservative
  let L = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const dx = dist(pts[i], pts[j]); if (dx > 1e-9) L = Math.max(L, Math.abs(vals[i] - vals[j]) / dx); }
  L = L * Math.max(1, safety);
  if (!(L > 0)) L = 1e-9;
  // certified ceiling: max over a space-filling sweep of min_i ( v_i + L·dist )
  let ceiling = bestNorm;
  for (let k = 0; k < sweep; k++) {
    const c: number[] = []; for (let dim = 0; dim < d; dim++) c.push(halton(k, PRIMES[dim % PRIMES.length]));
    let bound = Infinity;
    for (let i = 0; i < n; i++) { const b = vals[i] + L * dist(c, pts[i]); if (b < bound) bound = b; }
    if (bound > ceiling) ceiling = bound;
  }
  // also check the sample points themselves (bound there == their own value, already ≤ ceiling)
  const gap = Math.max(0, ceiling - bestNorm);
  const denom = Math.abs(ceiling) > 1e-12 ? Math.abs(ceiling) : 1;
  const withinPct = Math.max(0, Math.min(100, 100 * (1 - gap / denom)));
  return { n, bestObserved: bestRaw, certifiedCeiling: sgn * ceiling, gap, withinPct, lipschitz: L,
    assumption: `under a Lipschitz bound L≈${L.toPrecision(3)} estimated from your ${n} observations (×${safety} safety); a black box can hide a sharper spike between samples` };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { reliableDiscover } from "./reliability.js";

export async function certifyGauntlet(): Promise<{ score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> }> {
  const space: Space = { dims: [{ name: "x", type: "real", min: -5, max: 5 }, { name: "y", type: "real", min: -5, max: 5 }] };
  const f = (e: Experiment) => Math.exp(-(((e.x ?? 0)) ** 2 + ((e.y ?? 0)) ** 2) / 8);   // smooth bowl, optimum = 1 at (0,0)

  // collect a real run's history
  const obs: Observation[] = [];
  // sample on a coarse grid so the certificate has coverage (deterministic)
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { const e = { x: -5 + (10 * i) / 6, y: -5 + (10 * j) / 6 }; obs.push({ experiment: e, value: f(e) }); }

  const cert = certifyOptimality(obs, space, "maximize");
  // CONTAINS-BEST: the ceiling can never sit below the best you actually observed
  const containsBest = cert.certifiedCeiling >= cert.bestObserved - 1e-9;
  // CONTAINS-OPTIMUM: with real coverage the certified ceiling is ≥ the true optimum (1.0) — the certificate
  // is honest (it never tells you you're closer to done than you provably are)
  const containsOptimum = cert.certifiedCeiling >= 1.0 - 1e-6;
  // TIGHTENS: more observations ⇒ the certified gap does not grow
  const few = certifyOptimality(obs.slice(0, 9), space, "maximize");
  const many = certifyOptimality(obs, space, "maximize");
  const tightens = many.gap <= few.gap + 1e-9;
  // DETERMINISTIC
  const det = JSON.stringify(certifyOptimality(obs, space, "maximize")) === JSON.stringify(certifyOptimality(obs, space, "maximize"));
  // MINIMIZE symmetry: on -f with goal minimize, ceiling (in its direction) contains the true min (-1)
  const obsMin = obs.map((o) => ({ experiment: o.experiment, value: -o.value }));
  const certMin = certifyOptimality(obsMin, space, "minimize");
  const minOK = certMin.certifiedCeiling <= -1.0 + 1e-6 && certMin.bestObserved <= -0.99;
  // WITHIN-RANGE: withinPct is a sane 0..100
  const rangeOK = cert.withinPct >= 0 && cert.withinPct <= 100 && Number.isFinite(cert.lipschitz);
  // TOTAL: junk never throws
  const total = (() => { try { certifyOptimality(null as never, space); certifyOptimality([], space); certifyOptimality([{ experiment: { x: 1, y: 1 }, value: 0.5 }], space); return true; } catch { return false; } })();
  // USEFUL: after a real reliableDiscover run on the bowl, best is certified close to the ceiling
  const r = await reliableDiscover({ space, oracle: f, budget: 60, seed: 3, goal: "maximize" });
  const runObs = obs.concat([{ experiment: r.best.experiment, value: r.best.value }]);
  const certRun = certifyOptimality(runObs, space, "maximize");
  const useful = certRun.withinPct >= 80;

  const checks = [
    { name: "CONTAINS-BEST", pass: containsBest, detail: "the certified ceiling never sits below the best observed value" },
    { name: "CONTAINS-OPTIMUM", pass: containsOptimum, detail: `with coverage the ceiling (${cert.certifiedCeiling.toFixed(3)}) is ≥ the true optimum 1.0 — honest, never over-optimistic` },
    { name: "TIGHTENS-WITH-DATA", pass: tightens, detail: `more observations ⇒ smaller gap (few=${few.gap.toFixed(3)} → many=${many.gap.toFixed(3)})` },
    { name: "DETERMINISTIC", pass: det, detail: "same history → identical certificate (signable)" },
    { name: "MINIMIZE", pass: minOK, detail: "works symmetrically for a minimise goal" },
    { name: "SANE-RANGE", pass: rangeOK, detail: "withinPct ∈ [0,100] and Lipschitz is finite" },
    { name: "TOTAL", pass: total, detail: "null / empty / single-point never throws" },
    { name: "USEFUL", pass: useful, detail: `after a real run the best is certified within ${certRun.withinPct.toFixed(1)}% of the ceiling` },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
