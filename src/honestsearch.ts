/**
 * 💎 THE HONEST-SEARCH PROOF — detect a FAKED optimization. The rarest capability in the stack, and one an
 * LLM structurally cannot provide.
 *
 * Ask GPT/Gemini/Grok "find the best settings for my process" and it will hand you a fluent, plausible answer
 * it never actually searched for — and you cannot tell a genuine search from a hallucinated one. Melete can:
 * a real search leaves a TRACE (the exact sequence of points it evaluated), and because the engine is
 * deterministic, that trace is FORGERY-RESISTANT. An auditor REPLAYS the engine against only the recorded
 * VALUES (no access to your secret oracle needed) — a genuine trace reproduces byte-for-byte; ANY forgery
 * (random points, shuffled order, a truncated/cherry-picked claim, a tweaked point or value) makes the
 * replay diverge → REJECTED. The whole proof is Ed25519-signed and verifies offline.
 *
 * Why an LLM cannot do this: it has no deterministic execution, no seeded policy to re-derive, and no
 * cryptographic signing — it cannot PRODUCE a re-derivable search trace, nor AUDIT one. (DIAKRISIS: this
 * proves the search was genuinely PERFORMED by the declared engine over the declared space — not that the
 * optimum is global. Measurable: genuine proofs verify; five classes of forgery are rejected; ≥97.5%.)
 */
import { lcg, type Space, type Experiment } from "./space.js";
import { discover, type Goal } from "./engine.js";
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

export interface TracePoint { experiment: Experiment; value: number }
export interface HonestSearchProof {
  standard: "melete-honest-search-proof/v1";
  space: Space; seed: number; budget: number; goal: Goal; candidatePool: number;
  best: TracePoint;
  trace: TracePoint[];           // the exact, ordered sequence of evaluated points + their measured values
  traceHash: string;             // sha256 over the canonical trace (tamper-evident)
  payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256";
}

/** Run a genuine search and emit a signed, re-derivable proof that it was actually performed. */
export async function issueSearchProof(opts: { space: Space; oracle: (e: Experiment) => number | Promise<number>; budget: number; goal?: Goal; seed?: number; candidatePool?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): Promise<HonestSearchProof> {
  const goal: Goal = opts.goal ?? "maximize"; const seed = (opts.seed ?? 1) | 0; const budget = Math.max(2, opts.budget | 0);
  const candidatePool = Math.max(64, opts.candidatePool ?? 600);
  const r = await discover({ space: opts.space, oracle: opts.oracle, budget, goal, seed, candidatePool });
  const trace: TracePoint[] = r.history.map((h) => ({ experiment: h.experiment, value: h.value }));
  const best: TracePoint = { experiment: r.best.experiment, value: r.best.value };
  const traceHash = createHash("sha256").update(canonical(trace)).digest("hex");
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const payloadHash = createHash("sha256").update(canonical({ standard: "melete-honest-search-proof/v1", space: opts.space, seed, budget, goal, candidatePool, best, traceHash })).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { standard: "melete-honest-search-proof/v1", space: opts.space, seed, budget, goal, candidatePool, best, trace, traceHash, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

/**
 * Audit a proof OFFLINE, without the oracle. Replays the deterministic engine against ONLY the recorded
 * values; a genuine search reproduces the exact trace, any forgery diverges. Returns genuine + reason.
 */
export async function auditSearchProof(proof: HonestSearchProof): Promise<{ genuine: boolean; reason: string }> {
  if (!proof || !proof.trace || !proof.signature) return { genuine: false, reason: "incomplete proof" };
  try {
    // 1. integrity: the trace hash + the signature must match the proof's own contents.
    if (createHash("sha256").update(canonical(proof.trace)).digest("hex") !== proof.traceHash) return { genuine: false, reason: "trace hash mismatch — tampered" };
    const payloadHash = createHash("sha256").update(canonical({ standard: proof.standard, space: proof.space, seed: proof.seed, budget: proof.budget, goal: proof.goal, candidatePool: proof.candidatePool, best: proof.best, traceHash: proof.traceHash })).digest("hex");
    if (payloadHash !== proof.payloadHash) return { genuine: false, reason: "payload hash mismatch — tampered" };
    if (!edVerify(null, Buffer.from(proof.payloadHash), proof.publicKeyPem, Buffer.from(proof.signature, "base64"))) return { genuine: false, reason: "signature invalid" };
    // 2. the claimed best must actually be the best in the trace.
    const better = (a: number, b: number) => proof.goal === "maximize" ? a > b : a < b;
    const traceBest = proof.trace.reduce((a, b) => better(b.value, a.value) ? b : a, proof.trace[0]);
    if (canonical(traceBest.experiment) !== canonical(proof.best.experiment) || traceBest.value !== proof.best.value) return { genuine: false, reason: "claimed best is not the best of the trace" };
    // 3. re-derivation: REPLAY the engine against the recorded values only (oracle-free).
    const m = new Map<string, number>(); for (const t of proof.trace) m.set(canonical(t.experiment), t.value);
    const replayOracle = (e: Experiment) => { const k = canonical(e); return m.has(k) ? (m.get(k) as number) : (proof.goal === "maximize" ? -1e18 : 1e18); };
    const r = await discover({ space: proof.space, oracle: replayOracle, budget: proof.budget, goal: proof.goal, seed: proof.seed, candidatePool: proof.candidatePool });
    const re = r.history;
    if (re.length !== proof.trace.length) return { genuine: false, reason: `length diverged (replay ${re.length} ≠ trace ${proof.trace.length})` };
    for (let i = 0; i < re.length; i++) {
      if (canonical(re[i].experiment) !== canonical(proof.trace[i].experiment)) return { genuine: false, reason: `step ${i + 1} point diverged — not a genuine engine run` };
      if (re[i].value !== proof.trace[i].value) return { genuine: false, reason: `step ${i + 1} value diverged from the recorded measurement` };
    }
    return { genuine: true, reason: "verified: the trace re-derives exactly under the deterministic engine (offline, oracle-free)" };
  } catch (e) { return { genuine: false, reason: "audit error: " + (e as Error).message.slice(0, 90) }; }
}

/** Demo only: fabricate a fully-resealed forgery (random points, fresh signature) — so an audit must reject
 *  it on the RE-DERIVATION, not just a broken signature. Used to show the proof catching a fake live. */
export function forgeRandomProof(proof: HonestSearchProof, seed = 1): HonestSearchProof {
  const f: HonestSearchProof = JSON.parse(JSON.stringify(proof));
  const r = lcg(seed * 101 + 3);
  f.trace = f.trace.map((t, i) => (i < 9 ? t : { experiment: { x: r() * 10, y: r() * 10 }, value: t.value }));   // keep cold-start, fake the adaptive tail
  const better = (a: number, b: number) => f.goal === "maximize" ? a > b : a < b;
  const tb = f.trace.reduce((a, b) => better(b.value, a.value) ? b : a, f.trace[0]); f.best = { experiment: tb.experiment, value: tb.value };
  f.traceHash = createHash("sha256").update(canonical(f.trace)).digest("hex");
  const kp = generateKeyPairSync("ed25519");
  f.payloadHash = createHash("sha256").update(canonical({ standard: f.standard, space: f.space, seed: f.seed, budget: f.budget, goal: f.goal, candidatePool: f.candidatePool, best: f.best, traceHash: f.traceHash })).digest("hex");
  f.signature = edSign(null, Buffer.from(f.payloadHash), kp.privateKey).toString("base64");
  f.publicKeyPem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  return f;
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
// The MEASURABLE proof: genuine proofs VERIFY, and five distinct forgery classes are all REJECTED.
export async function honestSearchGauntlet(): Promise<{ score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> }> {
  const sp: Space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
  const oracle = (e: Experiment) => Math.exp(-(((e.x ?? 0) - 7.2) ** 2 + ((e.y ?? 0) - 3.4) ** 2) / 3) + 0.6 * Math.exp(-(((e.x ?? 0) - 2) ** 2 + ((e.y ?? 0) - 8) ** 2) / 2);
  const SEEDS = 60;
  const clone = (p: HonestSearchProof): HonestSearchProof => JSON.parse(JSON.stringify(p));
  // re-sign a forged proof with a fresh key so the FORGER isn't caught merely by a broken signature — the
  // re-derivation must be what rejects it. (Tampering-without-resign is covered separately below.)
  function reseal(p: HonestSearchProof): HonestSearchProof {
    p.traceHash = createHash("sha256").update(canonical(p.trace)).digest("hex");
    const kp = generateKeyPairSync("ed25519");
    p.payloadHash = createHash("sha256").update(canonical({ standard: p.standard, space: p.space, seed: p.seed, budget: p.budget, goal: p.goal, candidatePool: p.candidatePool, best: p.best, traceHash: p.traceHash })).digest("hex");
    p.signature = edSign(null, Buffer.from(p.payloadHash), kp.privateKey).toString("base64");
    p.publicKeyPem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
    return p;
  }
  const recomputeBest = (p: HonestSearchProof) => { const better = (a: number, b: number) => p.goal === "maximize" ? a > b : a < b; const tb = p.trace.reduce((a, b) => better(b.value, a.value) ? b : a, p.trace[0]); p.best = { experiment: tb.experiment, value: tb.value }; };

  let genuineOk = 0, fRandom = 0, fShuffle = 0, fPerturb = 0, fValue = 0, fTruncate = 0, fSmart = 0, totalForge = 0;
  const lcgImport = (await import("./space.js")).lcg;
  for (let s = 1; s <= SEEDS; s++) {
    const proof = await issueSearchProof({ space: sp, oracle, budget: 22, goal: "maximize", seed: s * 17 + 1, candidatePool: 500 });
    if ((await auditSearchProof(proof)).genuine) genuineOk++;
    const rnd = lcgImport(s * 101 + 3);
    // F1 random points (an LLM-style "I optimized it" with no real search)
    { const f = clone(proof); f.trace = f.trace.map((t) => ({ experiment: { x: rnd() * 10, y: rnd() * 10 }, value: t.value })); recomputeBest(f); reseal(f); totalForge++; if (!(await auditSearchProof(f)).genuine) fRandom++; }
    // F2 shuffled order (right points, wrong adaptive sequence)
    { const f = clone(proof); for (let i = f.trace.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = f.trace[i]; f.trace[i] = f.trace[j]; f.trace[j] = tmp; } recomputeBest(f); reseal(f); totalForge++; if (!(await auditSearchProof(f)).genuine) fShuffle++; }
    // F3 perturb one active point slightly
    { const f = clone(proof); const k = 12 + Math.floor(rnd() * 6); if (f.trace[k]) f.trace[k] = { experiment: { x: (f.trace[k].experiment.x ?? 0) + 0.3, y: f.trace[k].experiment.y ?? 0 }, value: f.trace[k].value }; recomputeBest(f); reseal(f); totalForge++; if (!(await auditSearchProof(f)).genuine) fPerturb++; }
    // F4 fake a measured value mid-trace
    { const f = clone(proof); const k = 5 + Math.floor(rnd() * 8); if (f.trace[k]) f.trace[k] = { experiment: f.trace[k].experiment, value: f.trace[k].value + 0.25 }; recomputeBest(f); reseal(f); totalForge++; if (!(await auditSearchProof(f)).genuine) fValue++; }
    // F5 truncate + keep the lucky best (claim you found it in fewer evals)
    { const f = clone(proof); f.trace = f.trace.slice(0, Math.max(11, f.trace.length - 6)); f.budget = f.trace.length; recomputeBest(f); reseal(f); totalForge++; if (!(await auditSearchProof(f)).genuine) fTruncate++; }
    // F6 SOPHISTICATED: a forger who KNOWS the deterministic Halton cold-start keeps the first 9 points exact
    // and fabricates only the adaptive tail. Must still be rejected — the active policy is what it can't fake.
    { const f = clone(proof); for (let k = 9; k < f.trace.length; k++) f.trace[k] = { experiment: { x: rnd() * 10, y: rnd() * 10 }, value: f.trace[k].value }; recomputeBest(f); reseal(f); totalForge++; if (!(await auditSearchProof(f)).genuine) fSmart++; }
  }
  const forgedRejected = fRandom + fShuffle + fPerturb + fValue + fTruncate + fSmart;

  // tamper-without-resign must also fail (signature catches it)
  const p0 = await issueSearchProof({ space: sp, oracle, budget: 18, goal: "maximize", seed: 5, candidatePool: 400 });
  const okGenuine = (await auditSearchProof(p0)).genuine;
  const t1 = clone(p0); t1.best = { experiment: { x: 9, y: 9 }, value: 999 };
  const tamperCaught = !(await auditSearchProof(t1)).genuine;
  const p1 = await issueSearchProof({ space: sp, oracle, budget: 18, goal: "maximize", seed: 5, candidatePool: 400 });
  const deterministic = p0.traceHash === p1.traceHash;

  const checks = [
    { name: "GENUINE-PROOFS-VERIFY", pass: genuineOk === SEEDS, detail: `${genuineOk}/${SEEDS} genuine searches re-derived exactly` },
    { name: "FORGERY-REJECTED≥97.5%", pass: forgedRejected / totalForge >= 0.975 && totalForge >= 300, detail: `rejected ${forgedRejected}/${totalForge} forgeries (random ${fRandom}, shuffle ${fShuffle}, perturb ${fPerturb}, fake-value ${fValue}, truncate ${fTruncate}, smart-tail ${fSmart}) / ${SEEDS} seeds` },
    { name: "ORACLE-FREE-AUDIT", pass: okGenuine, detail: "the audit replays the engine against recorded VALUES only — never needs the secret oracle" },
    { name: "SIGNED-TAMPER-CAUGHT", pass: tamperCaught, detail: "a forged 'best' without re-deriving fails signature/best checks" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same seed → identical trace hash" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
