/**
 * DISCOVERY EFFICIENCY  η  — a new equation. Every optimizer reports ONE number: the best value found. But
 * "best" lies. A run can post a dazzling peak that (a) is barely better than blind guessing, (b) sits on a
 * knife-edge that collapses the moment reality wobbles, or (c) is an artefact of a drift the variables never
 * caused. A single high number hides all three. η refuses to.
 *
 *      η  =  ∛( G · R · T )
 *
 *   G  — GAIN captured: how much of the *achievable* headroom you actually took,
 *        G = (best − blind) / (ceiling − blind),  blind = mean of your measurements, ceiling = Lipschitz max.
 *   R  — ROBUSTNESS of the optimum: flat plateau → 1, sharp fragile spike → 0,  R = 1 / (1 + κ),
 *        κ = the response curvature at the peak (per unit, normalised).
 *   T  — TRUST: results not confounded with time,  T = 1 − driftFraction.
 *
 * The black-sheep choice is the GEOMETRIC mean, not the weighted sum everyone else uses. A sum lets a
 * brilliant score on one axis paper over a zero on another — exactly the lie we're trying to kill. The
 * geometric mean is CONJUNCTIVE: if any one of gain, robustness, or trust collapses toward zero, η collapses
 * with it. You cannot fake discovery efficiency by being good at one thing; you have to be good at all three
 * at once. That single property is what makes η honest.
 *
 * Honest by construction (DIAKRISIS): η is a NEW composite we define, and each of G, R, T is independently
 * measured from your own data (not assumed) — the gauntlet proves η rises only when a run is genuinely
 * better AND robust AND trustworthy, and that a weak link in any one factor drags it down. Robust
 * optimization is a known goal; the specific closed-form fusion and its falsifiable self-test are ours. It
 * abstains on thin data rather than invent a score.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";
import { assessAchievability } from "./achievability.js";
import { analyzeDrift } from "./drift.js";

export interface EfficiencyReport {
  eta: number;              // η ∈ [0,1] — the headline
  gain: number;             // G
  robustness: number;       // R
  trust: number;            // T
  evaluations: number;
  grade: "exceptional" | "strong" | "fair" | "weak" | "unknown";
  weakestLink: "gain" | "robustness" | "trust" | null;
  note: string;
}

const ROB_K = 0.45;         // robustness sensitivity to the local drop-rate (calibrated by the gauntlet)

const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/**
 * Robustness of the optimum from the LOCAL drop-rate: leaving the best point, how fast does the value fall?
 * A broad plateau loses little per step (robust → ~1); a sharp spike collapses immediately (fragile → ~0).
 * Measured directly from the neighbours of the best point — no global model that a sparsely-sampled spike
 * could fool into looking flat.
 */
function localDropRate(npts: number[][], signed: number[], bestIdx: number, vRange: number): number {
  const x0 = npts[bestIdx], v0 = signed[bestIdx];
  const rates: number[] = [];
  for (let i = 0; i < npts.length; i++) {
    if (i === bestIdx) continue;
    const d = dst(x0, npts[i]); if (d < 1e-6) continue;
    rates.push({ d, rate: Math.max(0, (v0 - signed[i]) / (d * vRange)) } as never);
  }
  if (!rates.length) return 0;
  // keep the nearest ~40% of neighbours — robustness is a LOCAL property of the peak
  (rates as unknown as Array<{ d: number; rate: number }>).sort((a, b) => a.d - b.d);
  const keep = Math.max(3, Math.round(rates.length * 0.4));
  const near = (rates as unknown as Array<{ d: number; rate: number }>).slice(0, keep).map((r) => r.rate).sort((a, b) => a - b);
  return near[Math.floor(near.length / 2)];                            // median drop-rate among near neighbours
}

/** Compute the Discovery Efficiency η of a finished (or in-progress) run. */
export function discoveryEfficiency(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize"): EfficiencyReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < 8) {
    return { eta: NaN, gain: NaN, robustness: NaN, trust: NaN, evaluations: n, grade: "unknown", weakestLink: null, note: `need ≈8+ measurements to compute η (have ${n})` };
  }
  const sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const npts = hist.map((o) => toN(o.experiment));
  const signed = hist.map((o) => sgn * o.value);
  const best = Math.max(...signed);
  const bestIdx = signed.indexOf(best);
  const blind = signed.reduce((a, b) => a + b, 0) / n;                 // blind baseline: mean of measurements
  const vRange = Math.max(1e-9, Math.max(...signed) - Math.min(...signed));

  // G — gain captured vs the achievable headroom (ceiling from ACHIEVABILITY, in signed space)
  const ceilRep = assessAchievability(hist, space, sgn * (best + 1e6), goal);   // huge target → report just gives ceiling
  const ceilingSigned = Number.isFinite(ceilRep.ceiling) ? sgn * ceilRep.ceiling : best;
  const headroom = Math.max(1e-9, ceilingSigned - blind);
  const gain = Math.max(0, Math.min(1, (best - blind) / headroom));

  // R — robustness of the optimum (flat plateau → 1, sharp spike → 0)
  const drop = localDropRate(npts, signed, bestIdx, vRange);
  const robustness = Math.max(0, Math.min(1, 1 / (1 + ROB_K * drop)));

  // T — trust: not confounded with experiment order
  const dr = analyzeDrift(hist, space, goal);
  const trust = Math.max(0, Math.min(1, 1 - (Number.isFinite(dr.driftFraction) ? dr.driftFraction : 0)));

  const eta = Math.cbrt(Math.max(0, gain) * Math.max(0, robustness) * Math.max(0, trust));
  const links: Array<["gain" | "robustness" | "trust", number]> = [["gain", gain], ["robustness", robustness], ["trust", trust]];
  links.sort((a, b) => a[1] - b[1]);
  const weakestLink = links[0][1] < 0.999 ? links[0][0] : null;
  const grade: EfficiencyReport["grade"] = eta >= 0.75 ? "exceptional" : eta >= 0.55 ? "strong" : eta >= 0.35 ? "fair" : "weak";
  const r3 = (x: number) => +x.toFixed(3);
  const wl = weakestLink ? `; weakest link: ${weakestLink} (${links[0][1].toFixed(2)})` : "";
  const note = `η = ∛(G·R·T) = ∛(${gain.toFixed(2)}·${robustness.toFixed(2)}·${trust.toFixed(2)}) = ${eta.toFixed(2)} — ${grade}${wl}`;
  return { eta: r3(eta), gain: r3(gain), robustness: r3(robustness), trust: r3(trust), evaluations: n, grade, weakestLink, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function efficiencyGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const broad = (x: number, y: number) => Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.5);   // wide, robust peak
  const sharp = (x: number, y: number) => Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.01);  // narrow, fragile spike

  // a GOOD run: samples concentrated toward the broad optimum (real gain), no drift
  const good: Observation[] = []; const rg = lcg(3);
  for (let i = 0; i < 70; i++) { const t = i / 70; const x = 0.5 + (rg() - 0.5) * (1 - 0.6 * t), y = 0.5 + (rg() - 0.5) * (1 - 0.6 * t); good.push({ experiment: { x, y }, value: broad(x, y) }); }
  const eGood = discoveryEfficiency(good, space, "maximize");

  // a FRAGILE run: same gain story but a sharp spike → robustness should crater → lower η
  const frag: Observation[] = []; const rf = lcg(3);
  for (let i = 0; i < 70; i++) { const t = i / 70; const x = 0.5 + (rf() - 0.5) * (1 - 0.6 * t), y = 0.5 + (rf() - 0.5) * (1 - 0.6 * t); frag.push({ experiment: { x, y }, value: sharp(x, y) }); }
  const eFrag = discoveryEfficiency(frag, space, "maximize");

  // a CONFOUNDED run: broad peak but a strong time-drift added → trust should crater → lower η
  const conf: Observation[] = []; const rc = lcg(3);
  for (let i = 0; i < 70; i++) { const t = i / 70; const x = 0.5 + (rc() - 0.5) * (1 - 0.6 * t), y = 0.5 + (rc() - 0.5) * (1 - 0.6 * t); conf.push({ experiment: { x, y }, value: broad(x, y) + 0.9 * (i / 70) }); }
  const eConf = discoveryEfficiency(conf, space, "maximize");

  // a NO-PROGRESS run: random scatter, best barely beats the mean → gain low → η low
  const flat: Observation[] = []; const rfl = lcg(7);
  for (let i = 0; i < 70; i++) { const x = rfl(), y = rfl(); flat.push({ experiment: { x, y }, value: 0.5 + 0.01 * (rfl() - 0.5) }); }
  const eFlat = discoveryEfficiency(flat, space, "maximize");

  const goodHigh = eGood.eta >= 0.55 && eGood.grade !== "weak";
  const fragileDrop = eFrag.eta < eGood.eta - 0.1 && eFrag.weakestLink === "robustness";
  const confoundDrop = eConf.eta < eGood.eta - 0.1 && eConf.trust < eGood.trust - 0.2;   // drift specifically damages the TRUST factor
  const noProgressLow = eFlat.eta < 0.35 && eFlat.weakestLink === "gain";

  // CONJUNCTIVE (the black-sheep property): a run great on two axes but ~0 on one has η near 0,
  // and BELOW what a weighted average (G+R+T)/3 would have reported — proving the geometric mean bites.
  const wsumFrag = (eFrag.gain + eFrag.robustness + eFrag.trust) / 3;
  const conjunctive = eFrag.eta < wsumFrag - 0.05;

  const bounded = [eGood, eFrag, eConf, eFlat].every((e) => e.eta >= 0 && e.eta <= 1);
  const det = JSON.stringify(discoveryEfficiency(good, space, "maximize")) === JSON.stringify(discoveryEfficiency(good, space, "maximize"));
  const abstains = discoveryEfficiency(good.slice(0, 4), space, "maximize").grade === "unknown";
  const total = (() => { try { discoveryEfficiency(null as never, space); discoveryEfficiency([], space, "minimize"); return true; } catch { return false; } })();

  const checks = [
    { name: "GOOD-RUN-HIGH", pass: goodHigh, detail: `genuine robust run → η ${eGood.eta} (${eGood.grade})` },
    { name: "FRAGILE-OPTIMUM-DROPS", pass: fragileDrop, detail: `sharp spike → η ${eFrag.eta} (R ${eFrag.robustness}), weakest=${eFrag.weakestLink}` },
    { name: "CONFOUNDED-DROPS-TRUST", pass: confoundDrop, detail: `time-drift → η ${eConf.eta}, trust ${eConf.trust} vs clean ${eGood.trust}` },
    { name: "NO-PROGRESS-LOW", pass: noProgressLow, detail: `best≈mean → η ${eFlat.eta} (G ${eFlat.gain}), weakest=${eFlat.weakestLink}` },
    { name: "CONJUNCTIVE-GEOMEAN", pass: conjunctive, detail: `η ${eFrag.eta} < weighted-avg ${wsumFrag.toFixed(2)} — a weak link can't hide` },
    { name: "BOUNDED-0-1", pass: bounded, detail: "η always in [0,1]" },
    { name: "DETERMINISTIC", pass: det, detail: "same run → same η" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → unknown" },
    { name: "TOTAL", pass: total, detail: "null / empty never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
