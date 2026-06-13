/**
 * THE PRESCRIPTION — the one thing a human actually wants. Every other module is an engine part: it measures
 * gain, robustness, trust, reachability, coupling. Powerful — and useless to a factory manager, a
 * formulation chemist, or an investor, because they don't speak curvature and Lipschitz bounds. They have
 * exactly one question: "what do I DO now?"
 *
 * THE PRESCRIPTION answers it. It fuses the whole engine into a plain-language, business-ready verdict:
 *   • the RECIPE — the exact settings to use, in your own units;
 *   • the RESULT — what it scores, and how much better that is than where you started and than guessing;
 *   • the DECISION — SHIP IT / RUN A FEW MORE / FIND A NEW LEVER / KEEP GOING — and why;
 *   • how to APPLY it — concrete steps a non-expert can follow tomorrow;
 *   • the GUARDS — how tightly to hold each knob, whether to re-test, whether it's trustworthy.
 *
 * This is the output you can hold: not a number to interpret, a decision to act on. The math is the engine
 * under the hood; this is the steering wheel.
 *
 * Honest by construction (DIAKRISIS): every field is derived from the run's REAL measured signals (gain vs
 * your own first try, robustness from the local drop-rate, trust from the drift check, reachability from the
 * Lipschitz ceiling) — nothing is invented, no fabricated ROI or dollar figure. The decision is a
 * transparent rule over those signals, and it abstains when the data is too thin to advise.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";
import { discoveryEfficiency } from "./efficiency.js";
import { stopConfidence } from "./confidence.js";
import { assessAchievability } from "./achievability.js";
import { analyzeSensitivity } from "./sensitivity.js";
import { analyzeDrift } from "./drift.js";

export type Decision = "ship" | "refine" | "new-lever" | "more-data" | "unknown";

export interface Prescription {
  recipe: Array<{ name: string; value: number }>;
  expected: number;            // the best score found
  vsStartPct: number;          // improvement over the first try (where you started)
  vsRandomPct: number;         // improvement over blind/average
  decision: Decision;
  confidencePct: number;       // how sure you can stop (record-statistics)
  robustnessPct: number;       // how tolerant the optimum is to wobble
  trustPct: number;            // not confounded with time
  tolerances: Array<{ name: string; plusMinus: number }>;  // how tightly to hold each knob
  driftWarning: boolean;
  evaluations: number;
  note: string;                // one-line English summary (the web localises from the structured fields)
}

/** Turn a finished discovery run into a plain-language decision + action plan. */
export function buildPrescription(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize", opts: { target?: number } = {}): Prescription {
  const dims = space?.dims ?? [];
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (!dims.length || n < 4) {
    return { recipe: [], expected: NaN, vsStartPct: NaN, vsRandomPct: NaN, decision: "unknown", confidencePct: 0, robustnessPct: 0, trustPct: 0, tolerances: [], driftWarning: false, evaluations: n, note: `need ≈4+ measurements to prescribe (have ${n})` };
  }
  const sgn = goal === "minimize" ? -1 : 1;
  const best = hist.reduce((a, b) => (sgn * b.value > sgn * a.value ? b : a));
  const start = hist[0].value;                                   // where they began
  const mean = hist.reduce((s, o) => s + o.value, 0) / n;        // blind / average
  // honest improvement-% vs a reference: a relative % is only meaningful when the reference isn't ~0.
  // When the baseline is a negligible fraction of the achieved scale, the ratio explodes into a
  // meaningless mega-number (e.g. 286,000,000%), so we clamp to a sane, defensible ±1000% ceiling.
  const pct = (from: number) => {
    const scale = Math.max(Math.abs(from), Math.abs(best.value), 1e-9);
    const tiny = Math.abs(from) < 0.005 * scale;                 // reference is effectively zero
    const d = tiny ? (sgn * (best.value - from) > 0 ? 1000 : 0) : sgn * (best.value - from) / Math.abs(from) * 100;
    return +Math.max(-1000, Math.min(1000, d)).toFixed(1);
  };

  const recipe = dims.map((d) => ({ name: d.name, value: +(+best.experiment[d.name]).toFixed(d.type === "int" ? 0 : 4) }));

  // engine signals
  const eff = discoveryEfficiency(hist, space, goal);
  const conf = stopConfidence(hist, goal);
  const sens = analyzeSensitivity(hist, space, goal);
  const drift = analyzeDrift(hist, space, goal);
  const achiev = (typeof opts.target === "number" && Number.isFinite(opts.target)) ? assessAchievability(hist, space, opts.target, goal) : null;

  const confidencePct = Number.isFinite(conf.confidence) ? Math.round(conf.confidence * 100) : 0;
  const robustnessPct = Number.isFinite(eff.robustness) ? Math.round(eff.robustness * 100) : 0;
  const trustPct = Number.isFinite(eff.trust) ? Math.round(eff.trust * 100) : 0;

  const tolerances = (sens?.variables ?? []).slice().sort((a, b) => b.importancePct - a.importancePct).slice(0, 3)
    .map((v) => ({ name: v.name, plusMinus: +Math.abs(v.toleranceAbs).toFixed(Math.abs(v.toleranceAbs) < 1 ? 3 : 2) }));

  // the decision — a transparent rule over the real signals
  let decision: Decision;
  if (achiev && achiev.verdict === "unreachable") decision = "new-lever";
  else if (eff.grade !== "unknown" && eff.eta < 0.4 && eff.weakestLink === "robustness") decision = "refine";
  else if (conf.recommendation === "stop") decision = "ship";
  else if (conf.recommendation === "continue") decision = "more-data";
  else decision = "ship";

  const note = decision === "ship" ? `SHIP: use ${recipe.map((r) => r.name + "=" + r.value).join(", ")} → ${(+best.value).toPrecision(4)} (+${pct(start)}% vs your first try); ${confidencePct}% confident this is the best.`
    : decision === "more-data" ? `KEEP GOING: best so far ${(+best.value).toPrecision(4)} (+${pct(start)}% vs first try), still improving — a few more runs should help.`
    : decision === "refine" ? `REFINE: ${(+best.value).toPrecision(4)} found, but the optimum is fragile (robustness ${robustnessPct}%) — explore nearby for a setting that survives real-world wobble.`
    : decision === "new-lever" ? `NEW LEVER: target out of reach with these knobs (ceiling ~${achiev ? achiev.ceiling : "?"}) — add a new variable or relax the target.`
    : `not enough data`;

  return { recipe, expected: +(+best.value).toPrecision(6), vsStartPct: pct(start), vsRandomPct: pct(mean), decision, confidencePct, robustnessPct, trustPct, tolerances, driftWarning: !!drift.detected, evaluations: n, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function prescriptionGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const broad = (x: number, y: number) => Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.5);
  const sharp = (x: number, y: number) => Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.008);

  // SHIP: converged on a broad robust optimum (records dried up, robust) → ship
  const ship: Observation[] = []; const rs = lcg(3);
  for (let i = 0; i < 60; i++) { const t = i / 60; const x = 0.5 + (rs() - 0.5) * (1 - 0.85 * t), y = 0.5 + (rs() - 0.5) * (1 - 0.85 * t); ship.push({ experiment: { x, y }, value: broad(x, y) }); }
  const pShip = buildPrescription(ship, space, "maximize");

  // MORE-DATA: every step a new record (still climbing) → keep going
  const climb: Observation[] = []; for (let i = 0; i < 40; i++) { const x = i / 40, y = i / 40; climb.push({ experiment: { x, y }, value: 0.5 * (x + y) }); }
  const pClimb = buildPrescription(climb, space, "maximize");

  // NEW-LEVER: a target above the achievable ceiling → find a new lever
  const lev: Observation[] = []; const rl = lcg(7);
  for (let i = 0; i < 70; i++) { const x = rl(), y = rl(); lev.push({ experiment: { x, y }, value: broad(x, y) }); }
  const pLev = buildPrescription(lev, space, "maximize", { target: 5.0 });

  // REFINE: converged but onto a sharp fragile spike → refine for robustness
  const frag: Observation[] = []; const rf = lcg(3);
  for (let i = 0; i < 60; i++) { const t = i / 60; const x = 0.5 + (rf() - 0.5) * (1 - 0.85 * t), y = 0.5 + (rf() - 0.5) * (1 - 0.85 * t); frag.push({ experiment: { x, y }, value: sharp(x, y) }); }
  const pFrag = buildPrescription(frag, space, "maximize");

  const shipOk = pShip.decision === "ship" && pShip.recipe.length === 2 && pShip.vsStartPct >= 0;
  const climbOk = pClimb.decision === "more-data";
  const levOk = pLev.decision === "new-lever";
  const fragOk = pFrag.decision === "refine";
  // RECIPE-IS-THE-BEST: the prescribed recipe equals the actual best-scoring experiment
  const bestObs = ship.reduce((a, b) => (b.value > a.value ? b : a));
  const recipeRight = Math.abs(pShip.recipe[0].value - bestObs.experiment.x) < 1e-3 && Math.abs(pShip.expected - bestObs.value) < 1e-3;   // recipe is rounded for display
  // PLAIN-LANGUAGE: the note contains the actual recipe + a vs-start improvement, no jargon
  const plain = pShip.note.indexOf("SHIP") >= 0 && pShip.note.indexOf("vs your first try") >= 0;
  const tolerances = pShip.tolerances.length >= 1 && pShip.tolerances.every((t) => t.plusMinus >= 0);
  const det = JSON.stringify(buildPrescription(ship, space, "maximize")) === JSON.stringify(buildPrescription(ship, space, "maximize"));
  const abstains = buildPrescription(ship.slice(0, 2), space, "maximize").decision === "unknown";
  const total = (() => { try { buildPrescription(null as never, space); buildPrescription([], space, "minimize"); return true; } catch { return false; } })();

  const checks = [
    { name: "SHIP-WHEN-CONVERGED-ROBUST", pass: shipOk, detail: `converged broad optimum → "${pShip.decision}" (+${pShip.vsStartPct}% vs start, ${pShip.confidencePct}% sure)` },
    { name: "MORE-DATA-WHEN-CLIMBING", pass: climbOk, detail: `still improving → "${pClimb.decision}"` },
    { name: "NEW-LEVER-WHEN-UNREACHABLE", pass: levOk, detail: `target 5.0 > ceiling → "${pLev.decision}"` },
    { name: "REFINE-WHEN-FRAGILE", pass: fragOk, detail: `sharp fragile optimum → "${pFrag.decision}" (robustness ${pFrag.robustnessPct}%)` },
    { name: "RECIPE-IS-THE-BEST", pass: recipeRight, detail: `prescribed recipe == the top-scoring run (${pShip.expected})` },
    { name: "PLAIN-LANGUAGE-NOTE", pass: plain, detail: "the verdict reads as an instruction, not math" },
    { name: "TOLERANCES-GIVEN", pass: tolerances, detail: `how tightly to hold each knob (${pShip.tolerances.map((t) => t.name + "±" + t.plusMinus).join(", ")})` },
    { name: "DETERMINISTIC", pass: det, detail: "same run → same prescription" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → unknown" },
    { name: "TOTAL", pass: total, detail: "null / empty never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
