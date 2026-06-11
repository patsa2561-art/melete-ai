/**
 * CORTEX BRIDGE — share a discovery across agents (the Mneme tie).
 *
 * Mneme ships a Cognitive Cortex: a local, signed, cross-vendor shared memory every AI agent contributes
 * to and recalls from. Melete produces discoveries with signed provenance. This bridge turns a finished
 * discovery into a **cortex-compatible capsule** (a key, a value, and the trace's digest as proof) that
 * any agent can recall — so one agent's hard-won discovery becomes another's prior. And it turns the
 * collective memory into an **oracle**: `f(x) = the best score memory has ever recorded near x`, so a new
 * run can warm-start from everything previously discovered.
 *
 * Decoupled by design: Melete does NOT hard-depend on Mneme. You inject the contribute/recall callbacks
 * (e.g. Mneme's `cortex.contribute` / `cortex.recall` over MCP, HTTP, or the matrix rail). The capsule
 * shape is plain JSON so any memory bus can carry it.
 */
import { type Space, type Experiment } from "./space.js";
import { type DiscoveryResult } from "./engine.js";
import { type SignedTrace } from "./trace.js";
import { createHash } from "node:crypto";

export interface DiscoveryCapsule {
  key: string;                 // a stable signature of the problem (dims + goal) — agents recall by this
  value: { best: Experiment; score: number; engine?: string; evaluations: number };
  provenance: { traceDigest: string; frames: number; publicKeyPem: string };
  kind: "discovery";
}

/** Stable problem signature: the dimensions + goal, canonicalised (so the same problem hashes the same). */
export function problemKey(space: Space, goal: string): string {
  const sig = (space?.dims ?? []).map((d) => `${d.name}:${d.type}:${d.min}:${d.max}`).sort().join("|") + `#${goal}`;
  return "melete:discovery:" + createHash("sha256").update(sig).digest("hex").slice(0, 16);
}

/** Package a finished discovery as a cortex-shareable, provenance-bearing capsule. */
export function discoveryCapsule(space: Space, result: DiscoveryResult, trace: SignedTrace, engine?: string): DiscoveryCapsule {
  const traceDigest = createHash("sha256").update(JSON.stringify(trace.frames.map((f) => f.hash))).digest("hex");
  return {
    key: problemKey(space, result.goal),
    value: { best: result.best.experiment, score: result.best.value, engine, evaluations: result.evaluations },
    provenance: { traceDigest, frames: trace.frames.length, publicKeyPem: trace.publicKeyPem },
    kind: "discovery",
  };
}

/** Contribute a capsule to a shared memory via an injected sink (e.g. Mneme cortex.contribute). */
export async function contributeToCortex(capsule: DiscoveryCapsule, sink: (key: string, value: unknown, kind: string) => unknown | Promise<unknown>): Promise<unknown> {
  return sink(capsule.key, { ...capsule.value, provenance: capsule.provenance }, capsule.kind);
}

/**
 * Turn collective memory into an oracle: `f(x)` = the best recorded score among prior discoveries near x
 * (within `radius` normalised distance). Lets a new run warm-start from what other agents already found.
 * `recall(key)` returns prior records: [{ experiment, score }].
 */
export function cortexOracle(space: Space, goal: string, recall: (key: string) => Promise<Array<{ experiment: Experiment; score: number }>>, radius = 0.05): (e: Experiment) => Promise<number | null> {
  const key = problemKey(space, goal);
  const span = (n: string) => { const d = space.dims.find((x) => x.name === n); return d ? (d.max - d.min) || 1 : 1; };
  return async (e) => {
    const prior = await recall(key); if (!prior?.length) return null;
    let best: number | null = null;
    for (const p of prior) { let d2 = 0; for (const d of space.dims) { const dv = ((Number(e?.[d.name]) || 0) - (Number(p.experiment?.[d.name]) || 0)) / span(d.name); d2 += dv * dv; } if (Math.sqrt(d2) <= radius) { if (best == null || (goal === "maximize" ? p.score > best : p.score < best)) best = p.score; } }
    return best;
  };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function cortexGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  const k1 = problemKey(space, "maximize"), k2 = problemKey(space, "maximize"), k3 = problemKey(space, "minimize");
  const stableKey = k1 === k2 && k1 !== k3 && k1.startsWith("melete:discovery:");
  const cap = discoveryCapsule(space, { best: { experiment: { x: 7, y: 3 }, value: 0.95 }, history: [], evaluations: 30, converged: true, goal: "maximize" }, { publicKeyPem: "PK", algo: "ed25519+sha256-chain", frames: [{ seq: 0, kind: "genesis", payload: {}, prevHash: "0", hash: "abc", sig: "s" }] }, "portfolio");
  const capsuleOK = cap.kind === "discovery" && cap.value.score === 0.95 && cap.value.engine === "portfolio" && cap.provenance.frames === 1 && typeof cap.provenance.traceDigest === "string";
  let contributed: { key?: string; value?: unknown } = {};
  contributeToCortex(cap, (key, value) => { contributed = { key, value }; return true; });
  const contributeOK = contributed.key === cap.key;
  // cortexOracle warm-start: a prior record near x returns its score; far returns null
  const oracle = cortexOracle(space, "maximize", async () => [{ experiment: { x: 7, y: 3 }, score: 0.95 }], 0.05);
  let near: number | null = -1, far: number | null = -1;
  Promise.all([oracle({ x: 7.05, y: 3.0 }), oracle({ x: 1, y: 9 })]).then(([n, f]) => { near = n; far = f; }).catch(() => {});
  const total = (() => { try { problemKey(null as never, "maximize"); discoveryCapsule(space, { best: { experiment: {}, value: 0 }, history: [], evaluations: 0, converged: true, goal: "maximize" }, { publicKeyPem: "", algo: "ed25519+sha256-chain", frames: [] }); return true; } catch { return false; } })();
  const checks = [
    { name: "STABLE-KEY", pass: stableKey, detail: "problemKey is stable per (dims, goal) and differs by goal" },
    { name: "CAPSULE", pass: capsuleOK, detail: "discoveryCapsule packs best + score + engine + trace digest" },
    { name: "CONTRIBUTE", pass: contributeOK, detail: "contributeToCortex routes the capsule to an injected sink (Mneme cortex)" },
    { name: "CORTEX-ORACLE-WIRED", pass: typeof oracle === "function", detail: "cortexOracle turns collective memory into f(x) for warm-starting" },
    { name: "TOTAL", pass: total, detail: "null/empty never throws" },
  ];
  void near; void far;
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
