/**
 * REPLICATION ATTESTATION — the gem that closes the replication crisis for machine discovery, and makes
 * discoveries trustworthy across a multiverse of agents.
 *
 * A signed discovery TRACE proves the PATH (who searched, in what order, unaltered). It does NOT, by
 * itself, prove the SCIENCE reproduces — that the claimed best really scores what it claims. In a world of
 * millions of agents each running expensive experiments, the load-bearing question is: can agent B TRUST
 * agent A's discovery without re-running A's entire 40-experiment search?
 *
 * Yes — cheaply. `replicate` takes a published discovery (its claimed best + a sample of its path), re-
 * evaluates just those few points against an oracle (B's own, or a fresh run of the same process), and
 * checks the measured scores match the claimed ones within tolerance. Re-running the BEST point alone (1
 * experiment) verifies a 40-experiment discovery — 40× cheaper trust. The verdict is wrapped in a SIGNED
 * REPLICATION CERTIFICATE anyone can verify offline.
 *
 * ★HONEST (DIAKRISIS): replication checks that the recorded points reproduce on re-evaluation — it catches
 * fabricated / drifted / p-hacked claims (the common failure). It does NOT prove global optimality, and
 * for a genuinely noisy oracle it certifies "within tolerance", not bit-exact. It is the strongest cheap,
 * portable trust signal between agents — not an omniscience claim.
 */
import { type Experiment } from "./space.js";
import { type Oracle } from "./oracle.js";
import { Tracer, verifyTrace, type SignedTrace } from "./trace.js";

export interface Claim { best: { experiment: Experiment; value: number }; path: Array<{ experiment: Experiment; value: number }> }
export interface ReplicationCheck { experiment: Experiment; claimed: number; measured: number; absErr: number; relErr: number; match: boolean }
export interface ReplicationReport {
  replicates: boolean; goal: "maximize" | "minimize";
  best: ReplicationCheck; samples: ReplicationCheck[];
  reEvaluations: number; tolerance: number; matchRate: number; summary: string;
}

/** Pull the claimed best + the path (experiment→value) out of a signed discovery trace. */
export function extractClaim(trace: SignedTrace): Claim {
  const path: Array<{ experiment: Experiment; value: number }> = []; let best: { experiment: Experiment; value: number } | null = null;
  for (const f of trace?.frames ?? []) {
    const p = f.payload as Record<string, unknown> | null;
    if (f.kind === "observation" && p && p["experiment"]) path.push({ experiment: p["experiment"] as Experiment, value: Number(p["value"]) });
    if (f.kind === "result" && p && p["phase"] === "final" && p["best"]) { const b = p["best"] as { experiment: Experiment; value: number }; best = { experiment: b.experiment, value: Number(b.value) }; }
  }
  if (!best && path.length) best = path.reduce((a, b) => (b.value > a.value ? b : a), path[0]);
  return { best: best ?? { experiment: {}, value: 0 }, path };
}

const checkPoint = async (oracle: Oracle, e: Experiment, claimed: number, tol: number): Promise<ReplicationCheck> => {
  const measured = Number(await oracle(e)); const absErr = Math.abs(measured - claimed);
  const relErr = absErr / (Math.abs(claimed) || 1);
  return { experiment: e, claimed, measured, absErr, relErr, match: absErr <= tol || relErr <= tol };
};

/** Re-evaluate a discovery's best + a sample of its path against an oracle; certify whether it replicates. */
export async function replicate(opts: { claim: Claim; oracle: Oracle; samples?: number; tolerance?: number; goal?: "maximize" | "minimize" }): Promise<ReplicationReport> {
  const goal = opts.goal ?? "maximize"; const tol = opts.tolerance ?? 1e-3; const nSamples = Math.max(0, opts.samples ?? 3);
  const claim = opts.claim ?? { best: { experiment: {}, value: 0 }, path: [] };
  const best = await checkPoint(opts.oracle, claim.best.experiment, claim.best.value, tol);
  // sample evenly across the path (deterministic — no RNG), excluding the best if present
  const pool = claim.path.filter((p) => JSON.stringify(p.experiment) !== JSON.stringify(claim.best.experiment));
  const picks: typeof pool = [];
  if (pool.length && nSamples) { const step = pool.length / Math.min(nSamples, pool.length); for (let i = 0; i < Math.min(nSamples, pool.length); i++) picks.push(pool[Math.floor(i * step)]); }
  const samples: ReplicationCheck[] = [];
  for (const p of picks) samples.push(await checkPoint(opts.oracle, p.experiment, p.value, tol));
  const allChecks = [best, ...samples]; const matched = allChecks.filter((c) => c.match).length;
  const matchRate = allChecks.length ? matched / allChecks.length : 0;
  const replicates = best.match && samples.every((s) => s.match);
  const summary = replicates
    ? `REPLICATES — best re-scored ${best.measured} (claimed ${best.claimed}); ${samples.length}/${samples.length} sampled points matched, in ${allChecks.length} re-evaluations.`
    : `DOES NOT REPLICATE — ${best.match ? "" : `best claimed ${best.claimed} but re-scored ${best.measured}; `}${matched}/${allChecks.length} points matched (within tol ${tol}).`;
  return { replicates, goal, best, samples, reEvaluations: allChecks.length, tolerance: tol, matchRate, summary };
}

/** Wrap a replication report in a signed certificate that any third party verifies offline. */
export function certifyReplication(report: ReplicationReport, tracer?: Tracer): SignedTrace {
  const t = tracer ?? new Tracer();
  t.record("result", { phase: "replication", replicates: report.replicates, best: report.best, samples: report.samples, reEvaluations: report.reEvaluations, tolerance: report.tolerance, matchRate: report.matchRate });
  return t.export();
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export async function replicateGauntlet(): Promise<{ score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> }> {
  const f = (e: Experiment) => Math.exp(-(((e["x"] as number) - 7) ** 2) / 2);   // true process, deterministic
  const honest: Claim = { best: { experiment: { x: 7 }, value: f({ x: 7 }) }, path: [{ experiment: { x: 3 }, value: f({ x: 3 }) }, { experiment: { x: 5 }, value: f({ x: 5 }) }, { experiment: { x: 7 }, value: f({ x: 7 }) }] };
  const r1 = await replicate({ claim: honest, oracle: f, samples: 2 });
  const honestOK = r1.replicates === true && r1.best.match && r1.reEvaluations >= 1;
  // a FABRICATED claim — best.value inflated → must fail
  const lie: Claim = { best: { experiment: { x: 7 }, value: 9.9 }, path: honest.path };
  const r2 = await replicate({ claim: lie, oracle: f, samples: 1 });
  const catchesLie = r2.replicates === false && !r2.best.match;
  // cheap trust: re-running just the best (samples 0) still certifies the headline result
  const r3 = await replicate({ claim: honest, oracle: f, samples: 0 });
  const cheap = r3.replicates === true && r3.reEvaluations === 1;
  // signed cert verifies offline; tampering breaks it
  const cert = certifyReplication(r1); const certOK = verifyTrace(cert).ok === true;
  const tampered = JSON.parse(JSON.stringify(cert)) as SignedTrace; const fr = tampered.frames.find((x) => x.kind === "result" && (x.payload as Record<string, unknown>)["phase"] === "replication"); if (fr) (fr.payload as Record<string, unknown>)["replicates"] = !r1.replicates;
  const tamperCaught = verifyTrace(tampered).ok === false;
  // extract a claim from a trace
  const tr = new Tracer(); tr.record("observation", { experiment: { x: 7 }, value: 1 }); tr.record("result", { phase: "final", best: { experiment: { x: 7 }, value: 1 } });
  const ex = extractClaim(tr.export()); const extractOK = ex.best.value === 1 && ex.path.length === 1;
  const total = await (async () => { try { await replicate({ claim: null as never, oracle: f }); extractClaim(null as never); return true; } catch { return false; } })();
  const checks = [
    { name: "HONEST-REPLICATES", pass: honestOK, detail: "a real discovery re-evaluates to its claimed scores → REPLICATES" },
    { name: "CATCHES-FABRICATION", pass: catchesLie, detail: "an inflated/fabricated best fails replication (catches p-hacking / faked claims)" },
    { name: "CHEAP-CROSS-AGENT-TRUST", pass: cheap, detail: "re-running just the best (1 experiment) certifies a whole multi-experiment discovery" },
    { name: "SIGNED-CERTIFICATE", pass: certOK && tamperCaught, detail: "the replication verdict is Ed25519-signed + offline-verifiable; tampering is caught" },
    { name: "EXTRACT-FROM-TRACE", pass: extractOK, detail: "a published discovery trace yields the claim to replicate (cross-agent)" },
    { name: "TOTAL", pass: total, detail: "null/garbage never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
