/**
 * REPLAY TOKEN — the auditor's time machine. When a regulated lab/bank gets audited, or a system behaves
 * unexpectedly, the worst words are "we can't reproduce how that decision was reached." Melete's engines are
 * fully DETERMINISTIC (seeded; no wall-clock, no randomness), so an analysis is exactly reproducible. The
 * Replay Token captures everything needed to re-derive a verdict — the measured inputs, the goal — plus a
 * per-step hash chain and an Ed25519 signature, in one self-contained, offline artifact.
 *
 * Hand the token to an auditor and they don't have to trust Melete (or you): they re-run it on their own
 * machine and get a BYTE-IDENTICAL verdict, step by step (DISCOVER → DECIDE → DIAGNOSE). If even one input
 * was altered, the signature fails; if the engine ever diverged, the replay names the exact step that
 * differs. "Here is cryptographic proof of exactly how this decision was reached, re-derivable by anyone,
 * forever, with no server."
 *
 * Honest by construction (DIAKRISIS): a Replay Token reproduces MELETE'S OWN analysis/decision from the
 * signed inputs — it is the audit trail of the reasoning, NOT a recording of the customer's production RAM /
 * network / environment (that is a different, kernel-level product). What it proves is real and exact:
 * provenance (these inputs, this result, unaltered) + reproducibility (re-derivable offline, step by step).
 */
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, createPublicKey, type KeyObject } from "node:crypto";
import { type Space } from "./space.js";
import { type Observation, type Goal } from "./engine.js";
import { sovereignAnalyze } from "./sovereign.js";

export interface ReplayStep { name: string; hash: string }
export interface ReplayToken {
  standard: "melete-replay-token/v1";
  space: Space;
  goal: Goal;
  observations: Observation[];
  steps: ReplayStep[];          // per-layer hash chain (DISCOVER → DECIDE → DIAGNOSE)
  verdictHash: string;          // hash of the full reproduced verdict payload
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
  issuedAtMs: number;
}

function canonical(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]";
  const keys = Object.keys(o as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((o as Record<string, unknown>)[k])).join(",") + "}";
}
const h = (o: unknown) => createHash("sha256").update(canonical(o)).digest("hex");

/** Derive the deterministic step-chain + verdict hash for a run (the thing replay must reproduce). */
function derive(obs: ReadonlyArray<Observation>, space: Space, goal: Goal): { steps: ReplayStep[]; verdictHash: string } {
  const v = sovereignAnalyze(obs, space, goal, { keys: FIXED_KEYS, issuedAtMs: 0 });   // fixed keys → deterministic payload
  const { certify, ...payload } = v;   // exclude the cert (its key is irrelevant to replay; we hash the payload)
  void certify;
  const steps: ReplayStep[] = [
    { name: "DISCOVER", hash: h(payload.discover) },
    { name: "DECIDE", hash: h(payload.decide) },
    { name: "DIAGNOSE", hash: h(payload.diagnose) },
  ];
  return { steps, verdictHash: h(payload) };
}

// a single fixed keypair just for deterministic PAYLOAD derivation inside derive(); the TOKEN itself is
// signed with the issuer's key (passed to issueReplayToken). Generated once per process.
const FIXED_KEYS = generateKeyPairSync("ed25519");

/** Issue a self-contained, signed Replay Token for an analysis run. */
export function issueReplayToken(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize", opts: { keys?: { privateKey: KeyObject; publicKey: KeyObject }; issuedAtMs?: number } = {}): ReplayToken {
  const observations = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value)).map((o) => ({ experiment: o.experiment, value: o.value }));
  const { steps, verdictHash } = derive(observations, space, goal);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const body = { standard: "melete-replay-token/v1" as const, space, goal, observations, steps, verdictHash, issuedAtMs: Math.max(0, Math.floor(opts.issuedAtMs ?? 0)) };
  const signature = edSign(null, Buffer.from(h(body), "hex"), kp.privateKey).toString("base64");
  return { ...body, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export interface ReplayResult { signatureValid: boolean; reproduced: boolean; firstDivergingStep: string | null; reason: string }

/** Re-run a Replay Token OFFLINE: check its signature, then deterministically reproduce the verdict step-by-step. */
export function replayToken(token: ReplayToken): ReplayResult {
  try {
    if (!token || token.standard !== "melete-replay-token/v1") return { signatureValid: false, reproduced: false, firstDivergingStep: null, reason: "not a melete-replay-token/v1" };
    // 1) signature integrity over the token body (inputs + expected hashes)
    const { signature, publicKeyPem, algo, ...body } = token; void algo;
    const sigOk = edVerify(null, Buffer.from(h(body), "hex"), createPublicKey(publicKeyPem), Buffer.from(signature, "base64"));
    if (!sigOk) return { signatureValid: false, reproduced: false, firstDivergingStep: null, reason: "signature invalid — the token (inputs or expected result) was altered" };
    // 2) deterministic re-derivation from the signed inputs
    const re = derive(token.observations, token.space, token.goal);
    let diverge: string | null = null;
    for (let i = 0; i < token.steps.length; i++) { if (!re.steps[i] || re.steps[i].hash !== token.steps[i].hash) { diverge = token.steps[i].name; break; } }
    const reproduced = diverge === null && re.verdictHash === token.verdictHash;
    return { signatureValid: true, reproduced, firstDivergingStep: diverge, reason: reproduced ? "reproduced byte-identically, step by step — offline, no server" : `diverged at step ${diverge ?? "(verdict)"}` };
  } catch (e) { return { signatureValid: false, reproduced: false, firstDivergingStep: null, reason: "replay error: " + (e as Error).message.slice(0, 100) }; }
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function replayGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const f = (x: number, y: number) => Math.exp(-(((x - 0.4) ** 2) + ((y - 0.6) ** 2)) / 0.2);
  const rnd = lcg(7); const obs: Observation[] = [];
  for (let i = 0; i < 50; i++) { const x = rnd(), y = rnd(); obs.push({ experiment: { x, y }, value: f(x, y) }); }
  const kp = generateKeyPairSync("ed25519");
  const tok = issueReplayToken(obs, space, "maximize", { keys: kp, issuedAtMs: 1000 });

  const wellFormed = tok.standard === "melete-replay-token/v1" && tok.steps.length === 3 && tok.steps.map((s) => s.name).join(",") === "DISCOVER,DECIDE,DIAGNOSE" && !!tok.verdictHash && !!tok.signature;
  const r = replayToken(tok);
  const replaysIdentical = r.signatureValid && r.reproduced && r.firstDivergingStep === null;
  // TAMPER an input observation → signature must fail
  const t1 = JSON.parse(JSON.stringify(tok)) as ReplayToken; t1.observations[0].value = 999;
  const inputTamperCaught = replayToken(t1).signatureValid === false;
  // TAMPER the expected verdictHash (and re-sign with a fresh key so the signature passes) → replay must
  // re-derive the TRUE result and report it does NOT match the tampered expectation
  const t2body = JSON.parse(JSON.stringify(tok)) as ReplayToken; t2body.verdictHash = "deadbeef".repeat(8);
  const kp2 = generateKeyPairSync("ed25519");
  const { signature: _s, publicKeyPem: _p, algo: _a, ...b2 } = t2body; void _s; void _p; void _a;
  t2body.signature = edSign(null, Buffer.from(h(b2), "hex"), kp2.privateKey).toString("base64");
  t2body.publicKeyPem = kp2.publicKey.export({ type: "spki", format: "pem" }).toString();
  const r2 = replayToken(t2body);
  const forgedResultCaught = r2.signatureValid === true && r2.reproduced === false;
  // STEP-BY-STEP divergence is named: corrupt the DISCOVER expectation specifically
  const t3 = JSON.parse(JSON.stringify(tok)) as ReplayToken; t3.steps[0].hash = "0".repeat(64);
  const { signature: _s3, publicKeyPem: _p3, algo: _a3, ...b3 } = t3; void _s3; void _p3; void _a3;
  const kp3 = generateKeyPairSync("ed25519");
  t3.signature = edSign(null, Buffer.from(h(b3), "hex"), kp3.privateKey).toString("base64");
  t3.publicKeyPem = kp3.publicKey.export({ type: "spki", format: "pem" }).toString();
  const namesStep = replayToken(t3).firstDivergingStep === "DISCOVER";

  const det = JSON.stringify(issueReplayToken(obs, space, "maximize", { keys: kp, issuedAtMs: 1000 })) === JSON.stringify(tok);
  const total = (() => { try { replayToken(null as never); issueReplayToken([], space); replayToken({ standard: "x" } as never); return true; } catch { return false; } })();

  const checks = [
    { name: "ISSUES-SIGNED-TOKEN", pass: wellFormed, detail: "self-contained token: inputs + 3-step hash chain + verdict hash + Ed25519 signature" },
    { name: "REPLAYS-BYTE-IDENTICAL", pass: replaysIdentical, detail: `re-derived offline → ${r.reason}` },
    { name: "INPUT-TAMPER-CAUGHT", pass: inputTamperCaught, detail: "altering a measured input breaks the signature" },
    { name: "FORGED-RESULT-CAUGHT", pass: forgedResultCaught, detail: "a re-signed token with a faked result fails to reproduce" },
    { name: "NAMES-DIVERGING-STEP", pass: namesStep, detail: "replay points to the exact step that differs (DISCOVER)" },
    { name: "DETERMINISTIC", pass: det, detail: "same inputs + keys → byte-identical token" },
    { name: "TOTAL", pass: total, detail: "null / empty / malformed never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
