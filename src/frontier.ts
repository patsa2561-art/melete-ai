/**
 * FRONTIER — the economics of the NEXT experiment ("should I run another, or stop?").
 *
 * Every other optimizer answers "what should I try next?". For an EXPENSIVE physical experiment
 * (an assay, a wafer run, a GPU sweep) the question that actually decides the budget is the opposite:
 * "is the next try WORTH it, or have I already found the practical best?" Spending one more experiment
 * that gains nothing is real money burned; stopping one too early leaves value on the table.
 *
 * FRONTIER turns the discovery trajectory into a STOP / CONTINUE decision support signal — grounded only
 * in the observed diminishing-returns of THIS run, not a promise about the future. It estimates the
 * expected improvement of one more experiment from how the best-so-far has been improving (improvements
 * get rarer + smaller as you converge), compares it to the run's own noise floor, and — if you tell it
 * the cost of one experiment — frames that gain against the money. Deterministic + total, so the advice
 * is reproducible and signable alongside the discovery trace.
 *
 * Honest by construction: this is decision SUPPORT, not a guarantee. It says "based on your own curve,
 * the next experiment looks worth it / not worth it", and abstains to UNKNOWN when there isn't enough
 * history to tell. It never fabricates a dollar figure — money only appears if you supply a real cost.
 */
import { type Observation, type Goal } from "./engine.js";

export interface StoppingAdvice {
  n: number;                       // experiments observed so far
  best: number;                    // best value so far (raw, in the problem's own units)
  recentGain: number;              // best-so-far improvement over the last `window` experiments
  expectedGainNext: number;        // estimated improvement from ONE more experiment (>= 0, goal-normalised)
  noiseFloor: number;              // the run's own "meaningful change" threshold
  plateau: boolean;                // recent gains have fallen below the noise floor
  recommendation: "CONTINUE" | "STOP" | "UNKNOWN";
  confidence: number;              // 0..1, grows with evidence
  rationale: string;
  costPerExperiment: number | null;
  spentSoFar: number | null;       // n * cost  (null if no cost given)
  reasonCode: "too-few" | "still-improving" | "plateaued";
}

/** Best-so-far series in the goal direction (monotone non-decreasing once mapped to "higher = better"). */
function bestSeries(obs: ReadonlyArray<Observation>, goal: Goal): number[] {
  const dir = goal === "minimize" ? -1 : 1;
  const out: number[] = []; let b = -Infinity;
  for (const o of obs) { const v = dir * (o?.value ?? -Infinity); if (Number.isFinite(v) && v > b) b = v; out.push(b); }
  return out;
}

/**
 * Decide whether the next experiment is worth running.
 * @param obs               the (experiment, value) history so far, in run order
 * @param goal              "maximize" | "minimize"
 * @param costPerExperiment optional real cost of ONE experiment (money/time) — only then is $ math shown
 * @param window            how many recent experiments define "recent" gain (default 5)
 */
export function stoppingAdvice(
  obs: ReadonlyArray<Observation>,
  goal: Goal = "maximize",
  costPerExperiment: number | null = null,
  window = 5,
): StoppingAdvice {
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  const cost = (typeof costPerExperiment === "number" && costPerExperiment > 0) ? costPerExperiment : null;
  const spent = cost != null ? +(n * cost).toFixed(6) : null;

  // too little evidence → abstain (prove-or-unknown; never bluff a STOP that wastes a real discovery)
  const warmup = Math.max(6, window + 1);
  if (n < warmup) {
    return { n, best: n ? hist.reduce((a, b) => (goal === "minimize" ? Math.min(a, b.value) : Math.max(a, b.value)), hist[0].value) : NaN,
      recentGain: 0, expectedGainNext: NaN, noiseFloor: NaN, plateau: false, recommendation: "UNKNOWN",
      confidence: Math.min(0.4, n / warmup * 0.4), rationale: `only ${n} experiment(s) — need ≈${warmup} before a stop/continue call is trustworthy`,
      costPerExperiment: cost, spentSoFar: spent, reasonCode: "too-few" };
  }

  const series = bestSeries(hist, goal);              // higher = better
  const bestNorm = series[n - 1];
  const bestRaw = (goal === "minimize" ? -1 : 1) * bestNorm;
  const range = Math.max(1e-12, series[n - 1] - series[0]);   // total climb this run (goal-normalised, >0)

  // recent gain = best-so-far improvement across the last `window` experiments
  const recentGain = Math.max(0, series[n - 1] - series[n - 1 - window]);

  // noise floor: a "meaningful" change is a small fraction of the total climb. Below it, more tries are
  // chasing noise. Scales with the run so it works on any units.
  const noiseFloor = Math.max(1e-9, 0.02 * range);

  // expected gain of ONE more experiment: improvements decay as you converge. Take the average per-step
  // gain over the recent window and damp it by how stalled the very last steps are (geometric decay).
  const perStepRecent = recentGain / window;
  const lastHalf = Math.max(0, series[n - 1] - series[Math.max(0, n - 1 - Math.ceil(window / 2))]);
  const stall = lastHalf <= noiseFloor ? 0.3 : 1.0;       // if the freshest steps stalled, discount hard
  const expectedGainNext = +(perStepRecent * stall).toFixed(9);

  const plateau = recentGain <= noiseFloor;
  // confidence rises with how many experiments back the verdict, capped — honest about small samples
  const confidence = +Math.min(0.95, 0.5 + 0.45 * Math.min(1, (n - warmup) / 12)).toFixed(3);

  let recommendation: "CONTINUE" | "STOP";
  let reasonCode: "still-improving" | "plateaued";
  let rationale: string;
  if (expectedGainNext > noiseFloor) {
    recommendation = "CONTINUE"; reasonCode = "still-improving";
    rationale = `still climbing — the last ${window} experiments gained ${recentGain.toExponential(2)}, so one more is expected to add ~${expectedGainNext.toExponential(2)} (above the ${noiseFloor.toExponential(2)} noise floor)`;
  } else {
    recommendation = "STOP"; reasonCode = "plateaued";
    rationale = `practical best reached — the last ${window} experiments gained only ${recentGain.toExponential(2)}, below the ${noiseFloor.toExponential(2)} noise floor; more tries are unlikely to beat ${bestRaw.toPrecision(4)} enough to justify their cost`;
  }

  return { n, best: bestRaw, recentGain, expectedGainNext, noiseFloor, plateau, recommendation, confidence, rationale, costPerExperiment: cost, spentSoFar: spent, reasonCode };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function frontierGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // a converging run: gains shrink toward a ceiling of 1.0
  const conv: Observation[] = []; for (let i = 0; i < 40; i++) conv.push({ experiment: { x: i }, value: 1 - Math.exp(-i / 4) });

  // EARLY in the run → CONTINUE (still climbing fast)
  const early = stoppingAdvice(conv.slice(0, 8), "maximize");
  const earlyOK = early.recommendation === "CONTINUE";
  // LATE (converged) → STOP (plateaued)
  const late = stoppingAdvice(conv, "maximize");
  const lateOK = late.recommendation === "STOP" && late.plateau;
  // too few → UNKNOWN, never a confident STOP
  const tiny = stoppingAdvice(conv.slice(0, 3), "maximize");
  const tinyOK = tiny.recommendation === "UNKNOWN" && tiny.reasonCode === "too-few";
  // minimize works symmetrically (descending toward 0)
  const dec: Observation[] = []; for (let i = 0; i < 40; i++) dec.push({ experiment: { x: i }, value: Math.exp(-i / 4) });
  const minLate = stoppingAdvice(dec, "minimize");
  const minOK = minLate.recommendation === "STOP" && Math.abs(minLate.best) < 0.05;
  // economics: cost in → spentSoFar = n*cost, and never invented when cost absent
  const econ = stoppingAdvice(conv, "maximize", 500);
  const econOK = econ.spentSoFar === 40 * 500 && stoppingAdvice(conv, "maximize").spentSoFar === null;
  // deterministic
  const det = JSON.stringify(stoppingAdvice(conv, "maximize", 10)) === JSON.stringify(stoppingAdvice(conv, "maximize", 10));
  // total: never throws on junk
  const total = (() => { try { stoppingAdvice(null as never); stoppingAdvice([], "maximize"); stoppingAdvice([{ experiment: {}, value: NaN } as never], "maximize"); return true; } catch { return false; } })();
  // expected gain is non-negative + finite when decided
  const sane = early.expectedGainNext >= 0 && Number.isFinite(early.expectedGainNext);

  const checks = [
    { name: "CONTINUE-WHEN-CLIMBING", pass: earlyOK, detail: `early in a converging run it recommends CONTINUE (got ${early.recommendation})` },
    { name: "STOP-WHEN-PLATEAUED", pass: lateOK, detail: `after convergence it recommends STOP + flags plateau (got ${late.recommendation})` },
    { name: "ABSTAIN-WHEN-THIN", pass: tinyOK, detail: "with too few experiments it returns UNKNOWN, never a confident STOP" },
    { name: "MINIMIZE", pass: minOK, detail: "works symmetrically for a minimize goal" },
    { name: "ECONOMICS-HONEST", pass: econOK, detail: "spentSoFar = n×cost only when a real cost is given; never fabricated otherwise" },
    { name: "DETERMINISTIC", pass: det, detail: "same history → identical advice (reproducible + signable)" },
    { name: "NON-NEGATIVE-GAIN", pass: sane, detail: "expected gain of the next experiment is finite + ≥ 0" },
    { name: "TOTAL", pass: total, detail: "null / empty / NaN history never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
