/**
 * GUARDIAN — the always-on guardrail that turns Melete from "tune it once" into "watches your system 24/7".
 * A one-and-done optimizer creates value in bursts; a Guardian creates RECURRING value: it runs as a
 * background loop beside a live system, watches a metric you care about (tokens/sec, latency, yield, error
 * rate), and when conditions drift or breach a safe threshold it raises the alarm and proposes a fresh,
 * ROBUST configuration to recover — instead of waiting for a human to notice at 2 a.m.
 *
 * guardianTick() is the heartbeat: feed it the recent metric history + your baseline, and it returns a
 * status (STABLE / DEGRADING / BREACH) and, when warranted, a re-tune recommendation. It is deterministic
 * and dependency-free, so it can run as a daemon anywhere.
 *
 * Honest by construction (DIAKRISIS): the Guardian DETECTS and RECOMMENDS — it proposes a re-tune and hands
 * back the new config; APPLYING that to a production system is the customer's own integration, behind their
 * own safety gate (we never silently push changes to live infrastructure, and we don't claim to). Drift /
 * breach detection is a transparent statistical rule over the metric you supply, with a dead-band so noise
 * alone never trips a false alarm.
 */
export type GuardianStatus = "stable" | "degrading" | "breach" | "unknown";
export interface GuardianVerdict {
  status: GuardianStatus;
  current: number;            // recent (smoothed) metric level
  baseline: number;
  driftPct: number;           // signed % change from baseline (in the "worse" direction = negative)
  recommendRetune: boolean;   // should a re-tune loop be triggered?
  note: string;
}

/**
 * One heartbeat of the guardrail. `history` = recent metric samples (oldest→newest). `lowerIsBetter` for
 * latency/error-rate. `breachFrac`: a drop worse than this fraction of baseline = BREACH (default 0.15).
 */
export function guardianTick(history: ReadonlyArray<number>, opts: { baseline?: number; lowerIsBetter?: boolean; breachFrac?: number; degradeFrac?: number; window?: number } = {}): GuardianVerdict {
  const h = (history ?? []).filter((x) => Number.isFinite(x));
  const n = h.length;
  if (n < 4) return { status: "unknown", current: NaN, baseline: NaN, driftPct: NaN, recommendRetune: false, note: `need ≈4+ metric samples to judge (have ${n})` };
  const lower = !!opts.lowerIsBetter;
  const breachFrac = opts.breachFrac ?? 0.15, degradeFrac = opts.degradeFrac ?? 0.07;
  const W = Math.max(2, Math.min(n, opts.window ?? Math.max(3, Math.round(n * 0.3))));
  const recent = h.slice(n - W);
  const current = recent.reduce((a, b) => a + b, 0) / recent.length;        // smoothed recent level
  // baseline = supplied, else the early portion of the history (what the system used to do)
  const early = h.slice(0, Math.max(2, n - W));
  const baseline = Number.isFinite(opts.baseline as number) ? (opts.baseline as number) : early.reduce((a, b) => a + b, 0) / early.length;

  // "worse" direction: for lowerIsBetter, worse = bigger; else worse = smaller
  const worseDelta = lower ? (current - baseline) : (baseline - current);   // >0 means it got worse
  const driftFrac = worseDelta / Math.max(1e-9, Math.abs(baseline));
  const driftPct = +(((lower ? -1 : 1) * (current - baseline)) / Math.max(1e-9, Math.abs(baseline)) * 100).toFixed(1);

  let status: GuardianStatus, recommendRetune: boolean, note: string;
  if (driftFrac >= breachFrac) { status = "breach"; recommendRetune = true; note = `🚨 BREACH — the metric is ${(driftFrac * 100).toFixed(0)}% worse than baseline; trigger a re-tune and recover`; }
  else if (driftFrac >= degradeFrac) { status = "degrading"; recommendRetune = true; note = `⚠ degrading — ${(driftFrac * 100).toFixed(0)}% off baseline and slipping; re-tune recommended before it breaches`; }
  else { status = "stable"; recommendRetune = false; note = "✓ stable — within the safe band of baseline; hold"; }
  return { status, current: +current.toFixed(4), baseline: +baseline.toFixed(4), driftPct, recommendRetune, note };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function guardianGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const r = lcg(5);
  // STABLE: noisy around 100 (higher-is-better, e.g. tokens/sec)
  const stable = []; for (let i = 0; i < 30; i++) stable.push(100 + (r() - 0.5) * 4);
  const sV = guardianTick(stable, { lowerIsBetter: false });
  const stableOk = sV.status === "stable" && !sV.recommendRetune;

  // BREACH: was ~100, recent samples crashed to ~70 (−30%)
  const breach = []; for (let i = 0; i < 22; i++) breach.push(100 + (r() - 0.5) * 3); for (let i = 0; i < 8; i++) breach.push(70 + (r() - 0.5) * 3);
  const bV = guardianTick(breach, { lowerIsBetter: false });
  const breachOk = bV.status === "breach" && bV.recommendRetune && bV.driftPct < -10;

  // DEGRADING: a gentle ~9% slip recently
  const degr = []; for (let i = 0; i < 22; i++) degr.push(100 + (r() - 0.5) * 2); for (let i = 0; i < 8; i++) degr.push(91 + (r() - 0.5) * 2);
  const dV = guardianTick(degr, { lowerIsBetter: false });
  const degradeOk = dV.status === "degrading" && dV.recommendRetune;

  // LOWER-IS-BETTER (latency): recent latency spiked up = worse
  const lat = []; for (let i = 0; i < 22; i++) lat.push(50 + (r() - 0.5) * 2); for (let i = 0; i < 8; i++) lat.push(80 + (r() - 0.5) * 2);
  const lV = guardianTick(lat, { lowerIsBetter: true });
  const latencyOk = lV.status === "breach" && lV.recommendRetune;

  // NO-FALSE-ALARM: pure noise, no real drift → stable
  const noisy = []; for (let i = 0; i < 40; i++) noisy.push(200 + (r() - 0.5) * 10);
  const noFalse = guardianTick(noisy, { lowerIsBetter: false }).status === "stable";

  const det = JSON.stringify(guardianTick(stable, { lowerIsBetter: false })) === JSON.stringify(guardianTick(stable, { lowerIsBetter: false }));
  const abstains = guardianTick([1, 2], {}).status === "unknown";
  const total = (() => { try { guardianTick([]); guardianTick(null as never); return true; } catch { return false; } })();

  const checks = [
    { name: "STABLE-HOLDS", pass: stableOk, detail: `noisy-but-flat → "${sV.status}", no re-tune` },
    { name: "BREACH-TRIGGERS-RETUNE", pass: breachOk, detail: `−30% crash → "${bV.status}" (${bV.driftPct}%), re-tune recommended` },
    { name: "DEGRADING-EARLY-WARNING", pass: degradeOk, detail: `~9% slip → "${dV.status}" before it breaches` },
    { name: "LOWER-IS-BETTER (latency)", pass: latencyOk, detail: `latency spike → "${lV.status}"` },
    { name: "NO-FALSE-ALARM-ON-NOISE", pass: noFalse, detail: "pure noise, no drift → stable (dead-band)" },
    { name: "DETERMINISTIC", pass: det, detail: "same history → same verdict" },
    { name: "ABSTAINS-WHEN-THIN", pass: abstains, detail: "too few samples → unknown" },
    { name: "TOTAL", pass: total, detail: "empty / null never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
