/**
 * BREAKTHROUGH RADAR (SURPRISE) — the result the model never saw coming. Optimization quietly assumes the
 * response is well-behaved, so it can miss the most important thing that can happen in a real lab: a setting
 * that performs FAR better (or worse) than everything around it predicts. A surprising high is a possible
 * breakthrough — a sweet spot, a synergy, a regime nobody expected — and it deserves to be chased, not
 * averaged away. A surprising low is a warning — a likely measurement error, or a hidden penalty worth
 * re-checking before you trust it.
 *
 * SURPRISE predicts each measurement from all the OTHERS (a leave-one-out stand-in for your process) and
 * flags the ones whose actual result departs far more than the typical prediction error. It separates them
 * by direction: a big positive surprise is tagged a potential breakthrough to verify and explore around; a
 * big negative one is tagged an anomaly to re-check.
 *
 * Honest by construction (DIAKRISIS): a surprise is a residual outlier against your own data's smooth trend
 * — strong EVIDENCE that a point is special, not proof it's a breakthrough (it could still be a lucky
 * misread; that's exactly why the advice is "verify it"). Distinct from the noise lens (near-neighbour
 * disagreement / meter reliability); this is departure from the global trend. Abstains on thin data.
 */
import { type Space, type Experiment } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

export interface SurpriseItem { at: Record<string, number>; value: number; expected: number; sigma: number; direction: "high" | "low" }
export interface SurpriseReport {
  surprises: SurpriseItem[];
  breakthrough: SurpriseItem | null;   // the strongest surprising HIGH — worth chasing
  note: string;
}

const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/** Flag measurements that depart far more than usual from what the rest of the data predicts. */
export function analyzeSurprise(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize"): SurpriseReport {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < 8) return { surprises: [], breakthrough: null, note: `need ≈8+ measurements to spot surprises (have ${n})` };
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const P = hist.map((o) => toN(o.experiment));
  const V = hist.map((o) => o.value);
  const vRange = Math.max(1e-9, Math.max(...V) - Math.min(...V));

  // leave-one-out LOCAL prediction (k nearest neighbours, IDW) → residual for each point.
  // k-nearest (not all points) keeps the prediction on the LOCAL trend, so a point on a smooth slope is
  // predicted well by its neighbours and only a genuine departure stands out — no boundary-bias false alarms.
  const K = Math.min(6, n - 1);
  const resid: number[] = [];
  for (let i = 0; i < n; i++) {
    const near = []; for (let j = 0; j < n; j++) { if (j === i) continue; near.push({ d: dst(P[i], P[j]), v: V[j] }); }
    near.sort((a, b) => a.d - b.d);
    // MEDIAN of the k nearest values — robust to a single extreme neighbour, so one outlier doesn't
    // contaminate its neighbours' predictions (which would manufacture phantom surprises).
    const kv = near.slice(0, K).map((x) => x.v).sort((a, b) => a - b);
    const pred = kv.length ? kv[Math.floor(kv.length / 2)] : V[i];
    resid.push(V[i] - pred);
  }
  // robust scale = median absolute residual
  const absR = resid.map((r) => Math.abs(r)).sort((a, b) => a - b);
  const scale = Math.max(1e-9, absR[Math.floor(n / 2)]);

  const items: Array<SurpriseItem & { score: number; i: number }> = [];
  for (let i = 0; i < n; i++) {
    const sigma = resid[i] / scale;
    if (Math.abs(sigma) > 4 && Math.abs(resid[i]) > 0.25 * vRange) {
      const at: Record<string, number> = {}; dims.forEach((d, k) => { const real = lo(k) + P[i][k] * (hi(k) - lo(k)); at[d.name] = +(d.type === "int" ? Math.round(real) : +real.toFixed(4)); });
      let pred = V[i] - resid[i];
      items.push({ at, value: +V[i].toFixed(6), expected: +pred.toFixed(4), sigma: +Math.abs(sigma).toFixed(1), direction: resid[i] > 0 ? "high" : "low", score: Math.abs(sigma), i });
    }
  }
  items.sort((a, b) => b.score - a.score);
  const surprises: SurpriseItem[] = items.slice(0, 5).map(({ at, value, expected, sigma, direction }) => ({ at, value, expected, sigma, direction }));
  // a breakthrough = the strongest surprising HIGH in the goal's favoured direction
  const favHigh = goal !== "minimize";
  const breakthrough = surprises.find((s) => (favHigh ? s.direction === "high" : s.direction === "low")) ?? null;
  const fmt = (x: number) => (Math.abs(x) < 1 ? +x.toFixed(3) : +x.toFixed(2));
  const note = surprises.length === 0
    ? "no surprises — every result is in line with the smooth trend of your data"
    : breakthrough
      ? `⭐ possible breakthrough: a result of ${fmt(breakthrough.value)} where the trend predicted ~${fmt(breakthrough.expected)} (${breakthrough.sigma}× the usual surprise). Verify it and explore around it.`
      : `${surprises.length} surprising result${surprises.length > 1 ? "s" : ""} — likely measurement issues; re-check before trusting.`;
  return { surprises, breakthrough, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function surpriseGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const smooth = (x: number, y: number) => 0.5 * (x + y);

  // SMOOTH + one injected BREAKTHROUGH spike far above the trend
  const r1 = lcg(15); const o1: Observation[] = [];
  for (let i = 0; i < 70; i++) { const x = r1(), y = r1(); o1.push({ experiment: { x, y }, value: smooth(x, y) }); }
  o1.push({ experiment: { x: 0.3, y: 0.3 }, value: smooth(0.3, 0.3) + 0.7 });   // a surprising HIGH at (0.3,0.3)
  const s1 = analyzeSurprise(o1, space, "maximize");
  const detectsHigh = !!s1.breakthrough && s1.breakthrough.direction === "high";
  const locatedRight = !!s1.breakthrough && Math.abs(s1.breakthrough.at.x - 0.3) < 0.08 && Math.abs(s1.breakthrough.at.y - 0.3) < 0.08;

  // PURE SMOOTH → no surprises
  const r2 = lcg(6); const o2: Observation[] = [];
  for (let i = 0; i < 80; i++) { const x = r2(), y = r2(); o2.push({ experiment: { x, y }, value: smooth(x, y) }); }
  const s2 = analyzeSurprise(o2, space, "maximize");
  const smoothClean = s2.surprises.length === 0 && s2.breakthrough === null;

  // a surprising LOW (anomaly / error), not a breakthrough
  const r3 = lcg(9); const o3: Observation[] = [];
  for (let i = 0; i < 70; i++) { const x = r3(), y = r3(); o3.push({ experiment: { x, y }, value: smooth(x, y) }); }
  o3.push({ experiment: { x: 0.6, y: 0.6 }, value: smooth(0.6, 0.6) - 0.7 });
  const s3 = analyzeSurprise(o3, space, "maximize");
  const lowIsAnomaly = s3.surprises.length >= 1 && s3.surprises[0].direction === "low" && s3.breakthrough === null;

  // bigger spike → bigger sigma
  const o4 = o1.slice(0, 70).concat([{ experiment: { x: 0.3, y: 0.3 }, value: smooth(0.3, 0.3) + 1.4 }]);
  const s4 = analyzeSurprise(o4, space, "maximize");
  const monotone = !!s4.breakthrough && !!s1.breakthrough && s4.breakthrough.sigma >= s1.breakthrough.sigma - 0.1;

  const det = JSON.stringify(analyzeSurprise(o1, space, "maximize")) === JSON.stringify(analyzeSurprise(o1, space, "maximize"));
  const abstains = analyzeSurprise(o1.slice(0, 5), space, "maximize").note.indexOf("need") >= 0;
  const total = (() => { try { analyzeSurprise([], space); analyzeSurprise(null as never, space); analyzeSurprise(o1, { dims: [] }); return true; } catch { return false; } })();

  const checks = [
    { name: "DETECTS-BREAKTHROUGH", pass: detectsHigh, detail: `a +0.7 spike on a smooth trend → flagged as a surprising HIGH (${s1.breakthrough?.sigma}×)` },
    { name: "LOCATES-IT", pass: locatedRight, detail: `breakthrough at (${s1.breakthrough?.at.x}, ${s1.breakthrough?.at.y}) ≈ (0.3, 0.3)` },
    { name: "SMOOTH-NO-FALSE-SURPRISE", pass: smoothClean, detail: `smooth data → ${s2.surprises.length} surprises (no false alarm)` },
    { name: "LOW-IS-ANOMALY-NOT-BREAKTHROUGH", pass: lowIsAnomaly, detail: `a surprising LOW → anomaly to re-check, not a breakthrough` },
    { name: "BIGGER-SPIKE-BIGGER-SIGMA", pass: monotone, detail: `+1.4 spike ≥ +0.7 spike in surprise (${s1.breakthrough?.sigma}→${s4.breakthrough?.sigma})` },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same surprises" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few measurements → no claim" },
    { name: "TOTAL", pass: total, detail: "empty / null / no-dims never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
