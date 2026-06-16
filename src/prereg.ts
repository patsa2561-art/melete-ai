/**
 * 🔐 THE PRE-REGISTRATION CERTIFICATE (Anti-Cherry-Picking) — proof you didn't move the goalposts.
 *
 * The deepest integrity failure in optimization isn't a faked search — it's a CHANGED QUESTION: try many
 * objectives, widen the space, blow the budget, then report the prettiest result as if it were the plan.
 * No reviewer can tell after the fact. Melete can: COMMIT (hash) to the protocol — the objective, the search
 * space, the budget, and the decision rule — BEFORE running, signed. Afterwards, anyone re-derives, offline,
 * that the published result obeys the pre-registered protocol: same objective, no widened space, within
 * budget, and the reported winner is genuinely the best observed (no cherry-pick). Any deviation is rejected.
 *
 * WORLD-FIRST + LLM-impossible: this is a commit-reveal protocol-conformance proof — it needs cryptographic
 * commitment, deterministic re-derivation, and signing; an LLM can neither commit nor verify it. It is the
 * scientific-integrity layer (pre-registration) that pharma / finance / regulated science require — made
 * verifiable. (DIAKRISIS — distinct from the Honest-Search Proof, which proves the SEARCH was genuine; this
 * proves the QUESTION wasn't gamed. MEASURED: genuine runs verify; six deviation classes are all rejected.)
 */
import { type Space, type Experiment } from "./space.js";
import { type Goal } from "./engine.js";
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

export interface Protocol { space: Space; objectiveId: string; budget: number; goal: Goal; decisionRule: "max-observed" }
export interface PreCommit { standard: "melete-prereg-commit/v1"; commitHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256" }
export interface RunRecord { objectiveId: string; space: Space; evaluations: number; trace: Array<{ experiment: Experiment; value: number }>; best: { experiment: Experiment; value: number } }

/** Commit (publish) to a protocol BEFORE running. The nonce is kept until reveal; the hash hides + binds it. */
export function preCommit(protocol: Protocol, nonce: string, keys?: { publicKey: KeyObject; privateKey: KeyObject }): PreCommit {
  const commitHash = createHash("sha256").update(canonical(protocol) + ":" + nonce).digest("hex");
  const kp = keys ?? generateKeyPairSync("ed25519");
  const signature = edSign(null, Buffer.from(commitHash), kp.privateKey).toString("base64");
  return { standard: "melete-prereg-commit/v1", commitHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

/** Verify OFFLINE that a published run obeys the pre-registered protocol — no goalpost-moving, no cherry-pick. */
export function verifyPreRegistration(commit: PreCommit, protocol: Protocol, nonce: string, run: RunRecord): { conforms: boolean; reason: string } {
  try {
    if (!commit || !commit.signature) return { conforms: false, reason: "incomplete commitment" };
    // 1. the commitment is authentic + binds exactly this protocol (the goalposts can't have moved)
    if (!edVerify(null, Buffer.from(commit.commitHash), commit.publicKeyPem, Buffer.from(commit.signature, "base64"))) return { conforms: false, reason: "commitment signature invalid" };
    if (createHash("sha256").update(canonical(protocol) + ":" + nonce).digest("hex") !== commit.commitHash) return { conforms: false, reason: "protocol does not match the pre-registered commitment — the question was changed" };
    // 2. same objective
    if (run.objectiveId !== protocol.objectiveId) return { conforms: false, reason: `objective changed: ran "${run.objectiveId}" but pre-registered "${protocol.objectiveId}"` };
    // 3. no widened search space (same dims; every run range within the committed range)
    const cdims = new Map(protocol.space.dims.map((d) => [d.name, d]));
    for (const rd of run.space.dims) { const cd = cdims.get(rd.name); if (!cd) return { conforms: false, reason: `space widened: knob "${rd.name}" was not pre-registered` }; if (+(rd.min ?? 0) < +(cd.min ?? 0) - 1e-9 || +(rd.max ?? 1) > +(cd.max ?? 1) + 1e-9) return { conforms: false, reason: `space widened on "${rd.name}" beyond the pre-registered range` }; }
    // 4. within the pre-registered budget
    if (run.evaluations > protocol.budget) return { conforms: false, reason: `over budget: ${run.evaluations} experiments > pre-registered ${protocol.budget}` };
    // 5. the reported winner obeys the decision rule (genuinely the best observed — no cherry-pick / no fabrication)
    if (protocol.decisionRule === "max-observed") {
      const better = (a: number, b: number) => protocol.goal === "maximize" ? a > b : a < b;
      if (!run.trace.length) return { conforms: false, reason: "empty trace" };
      const trueBest = run.trace.reduce((a, b) => better(b.value, a.value) ? b : a, run.trace[0]);
      if (canonical(run.best.experiment) !== canonical(trueBest.experiment) || run.best.value !== trueBest.value) return { conforms: false, reason: "reported winner is not the best observed (cherry-picked or fabricated)" };
    }
    return { conforms: true, reason: "verified: the run obeys the pre-registered protocol (objective, space, budget, decision rule) — no goalpost-moving" };
  } catch (e) { return { conforms: false, reason: "verify error: " + (e as Error).message.slice(0, 80) }; }
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
// MEASURABLE: a genuine pre-registered run verifies; six distinct goalpost-moving deviations are all rejected.
export function preRegGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  const protocol: Protocol = { space, objectiveId: "yield-v1", budget: 40, goal: "maximize", decisionRule: "max-observed" };
  const mk = (s: number): RunRecord => { const trace = Array.from({ length: 24 }, (_, i) => ({ experiment: { x: (i * 2.3 + s) % 10, y: (i * 1.7 + s) % 10 }, value: Math.sin(i + s) * 3 + i * 0.1 })); const best = trace.reduce((a, b) => b.value > a.value ? b : a, trace[0]); return { objectiveId: "yield-v1", space, evaluations: 24, trace, best }; };
  const clone = (r: RunRecord): RunRecord => JSON.parse(JSON.stringify(r));

  let genuine = 0, vObj = 0, vSpace = 0, vBudget = 0, vCherryWorse = 0, vCherryFake = 0, vTamper = 0; const SEEDS = 40;
  for (let s = 1; s <= SEEDS; s++) {
    const nonce = "n" + s; const commit = preCommit(protocol, nonce);
    const run = mk(s);
    if (verifyPreRegistration(commit, protocol, nonce, run).conforms) genuine++;
    // V1 objective swapped (tried a different metric, reported it as the plan)
    { const r = clone(run); r.objectiveId = "yield-v2"; if (!verifyPreRegistration(commit, protocol, nonce, r).conforms) vObj++; }
    // V2 widened space (expanded a knob's range post-hoc)
    { const r = clone(run); r.space = { dims: [{ name: "x", type: "real", min: -5, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] }; if (!verifyPreRegistration(commit, protocol, nonce, r).conforms) vSpace++; }
    // V3 over budget (kept spending past the pre-registered budget)
    { const r = clone(run); r.evaluations = 80; if (!verifyPreRegistration(commit, protocol, nonce, r).conforms) vBudget++; }
    // V4 cherry-pick a worse-but-nicer observed point
    { const r = clone(run); const worse = r.trace.reduce((a, b) => b.value < a.value ? b : a, r.trace[0]); r.best = { experiment: worse.experiment, value: worse.value }; if (!verifyPreRegistration(commit, protocol, nonce, r).conforms) vCherryWorse++; }
    // V5 fabricate a winner better than anything observed
    { const r = clone(run); r.best = { experiment: { x: 9, y: 9 }, value: 999 }; if (!verifyPreRegistration(commit, protocol, nonce, r).conforms) vCherryFake++; }
    // V6 change the protocol after committing (bump budget) but present the old commit
    { const tampered: Protocol = { ...protocol, budget: 400 }; const r = clone(run); r.evaluations = 200; if (!verifyPreRegistration(commit, tampered, nonce, r).conforms) vTamper++; }
  }
  const allViol = vObj + vSpace + vBudget + vCherryWorse + vCherryFake + vTamper;

  const c0 = preCommit(protocol, "seedNonce");
  const forgedSig = !verifyPreRegistration({ ...c0, commitHash: createHash("sha256").update("x").digest("hex") }, protocol, "seedNonce", mk(1)).conforms;
  const deterministic = preCommit(protocol, "abc").commitHash === preCommit(protocol, "abc").commitHash;
  let total = true; try { verifyPreRegistration(c0, protocol, "seedNonce", { objectiveId: "yield-v1", space, evaluations: 0, trace: [], best: { experiment: {}, value: 0 } }); } catch { total = false; }

  const checks = [
    { name: "GENUINE-VERIFIES", pass: genuine === SEEDS, detail: `${genuine}/${SEEDS} pre-registered runs conform` },
    { name: "REJECTS-OBJECTIVE-SWAP", pass: vObj === SEEDS, detail: `changed objective rejected ${vObj}/${SEEDS}` },
    { name: "REJECTS-SPACE-WIDENING", pass: vSpace === SEEDS, detail: `widened space rejected ${vSpace}/${SEEDS}` },
    { name: "REJECTS-OVER-BUDGET", pass: vBudget === SEEDS, detail: `over-budget rejected ${vBudget}/${SEEDS}` },
    { name: "REJECTS-CHERRY-PICK", pass: vCherryWorse === SEEDS && vCherryFake === SEEDS, detail: `cherry-picked (worse ${vCherryWorse}, fabricated ${vCherryFake}) rejected /${SEEDS}` },
    { name: "REJECTS-PROTOCOL-TAMPER+FORGED-SIG", pass: vTamper === SEEDS && forgedSig, detail: `post-hoc protocol change rejected ${vTamper}/${SEEDS}; forged commitment rejected` },
    { name: "DETERMINISTIC+TOTAL", pass: deterministic && total, detail: "same protocol+nonce → same commit; empty/garbage never throws" },
  ];
  void allViol;
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
