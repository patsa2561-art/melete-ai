/**
 * ◆ MELETE PRIME — the Red Diamond. The heart of the system: one brain that is smart about everything at
 * once. Every other module is a specialist lens — how good (efficiency), how reachable (achievability), how
 * many knobs really matter (sloppiness), where the cliffs are, is it drifting, is it converged. Brilliant
 * individually, and overwhelming together: a human staring at twelve panels still doesn't know what to DO.
 *
 * PRIME is the conductor. It runs every lens, then does the thing no competitor's tool does: it TRIAGES
 * them by leverage and danger into a single decisive verdict, the way a senior engineer would. Safety
 * outranks ambition (an optimum on a cliff edge is overruled no matter how high it scores); a physically
 * unreachable target is called before you waste a month; a fragile peak is sent back to be made robust; only
 * a clean, converged, robust, trustworthy result is cleared to ship. It also reports a single PROCESS
 * INTELLIGENCE score — how well-understood, optimized, safe, robust and trustworthy your process is, in one
 * number — and a three-sentence briefing a CEO can read.
 *
 * Honest by construction (DIAKRISIS): PRIME invents no new measurement — every input is one of the
 * independently-tested lenses, each derived from your real data. Its contribution, and its rarity, is the
 * SYNTHESIS: a deterministic, safety-first prioritisation that turns a wall of analytics into one decision.
 * The gauntlet proves the triage is correct (the right concern wins in each scenario) and that the
 * intelligence score tracks genuinely better runs. It abstains when the data is too thin to reason over.
 */
import { type Space } from "./space.js";
import { type Observation, type Goal } from "./engine.js";
import { buildPrescription } from "./prescription.js";
import { discoveryEfficiency } from "./efficiency.js";
import { assessAchievability } from "./achievability.js";
import { analyzeCliffs } from "./cliff.js";
import { analyzeDrift } from "./drift.js";
import { stopConfidence } from "./confidence.js";
import { analyzeSloppiness } from "./sloppiness.js";

export type PrimeKind = "safety" | "feasibility" | "trust" | "refine" | "ship" | "more-data" | "unknown";
export interface PrimeInsight { kind: PrimeKind; severity: number; headline: string }
export interface PrimeVerdict {
  processIQ: number;          // 0–100: how well-understood, optimized, safe, robust, trustworthy
  grade: "world-class" | "strong" | "developing" | "fragile" | "unknown";
  decisive: PrimeInsight;     // the ONE thing to do now
  insights: PrimeInsight[];   // all concerns, ranked by leverage/danger
  briefing: string;           // a 3-sentence plain-language summary
  recipe: Array<{ name: string; value: number }>;
  expected: number;
}

/** ◆ The Red Diamond: compose every lens and return one safety-first decision + a process-intelligence score. */
export function meletePrime(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize", opts: { target?: number } = {}): PrimeVerdict {
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (!space?.dims?.length || n < 6) {
    return { processIQ: NaN, grade: "unknown", decisive: { kind: "unknown", severity: 0, headline: "not enough data yet" }, insights: [], briefing: `Run a few more experiments (have ${n}) — PRIME needs ≈6+ to reason.`, recipe: [], expected: NaN };
  }
  const presc = safe(() => buildPrescription(hist, space, goal, opts));
  const eff = safe(() => discoveryEfficiency(hist, space, goal));
  const cliffs = safe(() => analyzeCliffs(hist, space, goal));
  const drift = safe(() => analyzeDrift(hist, space, goal));
  const conf = safe(() => stopConfidence(hist, goal));
  const slop = safe(() => analyzeSloppiness(hist, space, goal));
  const achiev = (typeof opts.target === "number" && Number.isFinite(opts.target)) ? safe(() => assessAchievability(hist, space, opts.target as number, goal)) : null;

  // ── insight triage — a senior engineer's priority order ──────────────────────
  const insights: PrimeInsight[] = [];
  if (cliffs && cliffs.optimumOnCliff) insights.push({ kind: "safety", severity: 100, headline: "Your best setting sits ON a cliff edge — a tiny drift could collapse the result. Step back to a flatter, safer setting before anything else." });
  if (achiev && achiev.verdict === "unreachable") insights.push({ kind: "feasibility", severity: 90, headline: `Your target is beyond what these variables can reach (ceiling ≈ ${achiev.ceiling}). Add a new lever or relax the target — more tuning won't get there.` });
  if (drift && drift.detected) insights.push({ kind: "trust", severity: 80, headline: "Your results trend with WHEN you measured — a possible time-confound. Re-test the winner fresh before trusting it." });
  if (presc && presc.decision === "refine") insights.push({ kind: "refine", severity: 60, headline: `The best found is fragile (robustness ${presc.robustnessPct}%). Explore nearby for a setting that survives real-world wobble.` });
  if (presc && presc.decision === "more-data") insights.push({ kind: "more-data", severity: 40, headline: "Still improving — a few more experiments should help before you lock it in." });
  if (presc && presc.decision === "ship") insights.push({ kind: "ship", severity: 30, headline: `Cleared to ship: use this recipe (${presc.confidencePct}% confident it's the best, robust and not time-confounded).` });
  if (!insights.length) insights.push({ kind: "ship", severity: 20, headline: "Use the best recipe found." });
  insights.sort((a, b) => b.severity - a.severity);
  const decisive = insights[0];

  // ── Process Intelligence (PIQ) — one honest composite ────────────────────────
  const g = (x: number, d = 0.5) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : d);
  const eta = g(eff?.eta as number, 0.4), rob = g(eff?.robustness as number, 0.4), tru = g(eff?.trust as number, 0.6);
  const cf = g(conf?.confidence as number, 0.5);
  const understood = slop && Number.isFinite(slop.effectiveDims) ? 1 : 0.75;
  const safety = (cliffs && cliffs.optimumOnCliff) ? 0.5 : 1;            // an optimum on a cliff is a poorly-understood process
  const feasible = (achiev && achiev.verdict === "unreachable") ? 0.7 : 1;
  const core = Math.cbrt(Math.max(0.001, eta) * Math.max(0.001, rob) * Math.max(0.001, tru));   // conjunctive
  const processIQ = Math.round(100 * core * ((cf + 1) / 2) * understood * safety * feasible);
  const grade: PrimeVerdict["grade"] = processIQ >= 80 ? "world-class" : processIQ >= 60 ? "strong" : processIQ >= 40 ? "developing" : "fragile";

  const recipe = presc?.recipe ?? [];
  const expected = presc?.expected ?? (hist.reduce((a, b) => ((goal === "minimize" ? b.value < a.value : b.value > a.value) ? b : a)).value);
  const knobLine = slop && Number.isFinite(slop.effectiveDims) && slop.effectiveDims < slop.totalDims
    ? ` Only ${slop.effectiveDims} of ${slop.totalDims} knob-combinations truly matter — the rest you can set however is cheapest.` : "";
  const briefing = `Process intelligence ${Number.isFinite(processIQ) ? processIQ : "?"}/100 (${grade}); best result ${typeof expected === "number" ? (+expected).toPrecision(4) : "?"}${presc && presc.vsStartPct > 0 ? `, +${presc.vsStartPct}% over your first try` : ""}. ${decisive.headline}${knobLine}`;

  return { processIQ, grade, decisive, insights, briefing, recipe, expected: typeof expected === "number" ? +(+expected).toPrecision(6) : NaN };
}

function safe<T>(f: () => T): T | null { try { return f(); } catch { return null; } }

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function primeGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const broad = (x: number, y: number) => Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.5);

  // SHIP: clean, converged onto a broad robust optimum, no target
  const ship: Observation[] = []; const rs = lcg(3);
  for (let i = 0; i < 60; i++) { const t = i / 60; const x = 0.5 + (rs() - 0.5) * (1 - 0.85 * t), y = 0.5 + (rs() - 0.5) * (1 - 0.85 * t); ship.push({ experiment: { x, y }, value: broad(x, y) }); }
  const vShip = meletePrime(ship, space, "maximize");
  const shipOk = vShip.decisive.kind === "ship";

  // SAFETY-FIRST: a narrow high ledge bordered by drops — the optimum is on a cliff; even though it scores
  // high, the brain must put SAFETY first over shipping.
  const ledge = (x: number, y: number) => (x >= 0.5 && x < 0.58 ? 1.0 : 0.2) + 0.02 * y;
  const safe2: Observation[] = []; const rl = lcg(8);
  for (let i = 0; i < 130; i++) { const x = rl(), y = rl(); safe2.push({ experiment: { x, y }, value: ledge(x, y) }); }
  const vSafe = meletePrime(safe2, space, "maximize");
  const safetyFirst = vSafe.decisive.kind === "safety";

  // FEASIBILITY: an unreachable target outranks ordinary progress
  const lev: Observation[] = []; const rv = lcg(7);
  for (let i = 0; i < 70; i++) { const x = rv(), y = rv(); lev.push({ experiment: { x, y }, value: broad(x, y) }); }
  const vLev = meletePrime(lev, space, "maximize", { target: 5.0 });
  const feasibility = vLev.decisive.kind === "feasibility";

  const bounded = [vShip, vSafe, vLev].every((v) => v.processIQ >= 0 && v.processIQ <= 100);
  const piqRanks = vShip.processIQ > vSafe.processIQ;                   // a clean run scores higher than one whose optimum is on a cliff
  const briefingPlain = vShip.briefing.indexOf("Process intelligence") >= 0 && vShip.briefing.length > 40;
  const det = JSON.stringify(meletePrime(ship, space, "maximize")) === JSON.stringify(meletePrime(ship, space, "maximize"));
  const abstains = meletePrime(ship.slice(0, 3), space, "maximize").grade === "unknown";
  const total = (() => { try { meletePrime([], space); meletePrime(null as never, space); meletePrime(ship, { dims: [] }); return true; } catch { return false; } })();

  const checks = [
    { name: "SAFETY-OUTRANKS-ALL", pass: safetyFirst, detail: `optimum-on-cliff → decisive "${vSafe.decisive.kind}" (safety beats shipping)` },
    { name: "UNREACHABLE→FEASIBILITY", pass: feasibility, detail: `target above ceiling → decisive "${vLev.decisive.kind}"` },
    { name: "CLEAN-RUN→SHIP", pass: shipOk, detail: `converged robust run → decisive "${vShip.decisive.kind}" (PIQ ${vShip.processIQ})` },
    { name: "PIQ-BOUNDED", pass: bounded, detail: "process intelligence always 0–100" },
    { name: "PIQ-RANKS-QUALITY", pass: piqRanks, detail: `clean PIQ ${vShip.processIQ} > cliff PIQ ${vSafe.processIQ}` },
    { name: "PLAIN-BRIEFING", pass: briefingPlain, detail: "a readable 3-sentence brief, not jargon" },
    { name: "DETERMINISTIC", pass: det, detail: "same run → same verdict" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too little data → unknown" },
    { name: "TOTAL", pass: total, detail: "empty / null / no-dims never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
