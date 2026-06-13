/**
 * SOVEREIGN — the ecosystem spine. Melete is "The Sovereign Verifiable AI Analyst & Optimizer": you bring a
 * system you can MEASURE (an ML pipeline, an infra/DB/network config, a process, a simulation), and in ONE
 * call Melete plays four roles end-to-end and hands back a single, signed, offline-verifiable verdict:
 *
 *   ① DISCOVER  — find the best setting in the fewest experiments
 *   ② DECIDE    — the Φ brain's safety-first verdict + AEGIS's ROBUST (survives-the-real-world) answer
 *   ③ DIAGNOSE  — the analyst's plain-language read: which knobs matter, where the cliffs are, the shape,
 *                 the achievable ceiling, the family of equally-good recipes
 *   ④ CERTIFY   — an Ed25519-signed PROVENANCE certificate: a tamper-evident record of WHAT was tested and
 *                 the result reached, verifiable offline with the embedded public key, no Melete needed
 *
 * This is the product face (one call, one verdict — usable) AND the moat (sovereign + a signed, vendor-
 * neutral verdict FORMAT others must speak to audit it). It runs entirely on the caller's machine.
 *
 * Honest by construction (DIAKRISIS): "verifiable" means PROVENANCE + REPRODUCIBILITY — the certificate
 * proves, offline, exactly what was measured and the result found, and that the signed payload wasn't
 * altered. It is NOT a proof that the customer's code is bug-free or exploit-free (that is undecidable in
 * general and we refuse to fake it). Every facet of the verdict comes from an independently-tested engine.
 */
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, createPublicKey, createPrivateKey, type KeyObject } from "node:crypto";
import { type Space } from "./space.js";
import { type Observation, type Goal } from "./engine.js";
import { meletePrime } from "./prime.js";
import { analyzeShape } from "./shape.js";
import { analyzeCliffs } from "./cliff.js";
import { analyzeSloppiness } from "./sloppiness.js";
import { assessAchievability } from "./achievability.js";
import { analyzeRashomon } from "./rashomon.js";

export interface SovereignCertificate { standard: "melete-sovereign-verdict/v1"; payloadHash: string; signature: string; publicKeyPem: string; algo: "ed25519+sha256"; issuedAtMs: number }
export interface SovereignVerdict {
  product: "Melete — The Sovereign Verifiable AI Analyst & Optimizer";
  discover: { best: Observation | null; evaluations: number; goal: Goal };
  decide: { processIQ: number; grade: string; decision: string; briefing: string };
  diagnose: { shape: unknown; cliffs: unknown; sloppiness: unknown; achievability: unknown; options: unknown };
  certify: SovereignCertificate;
  verdict: string;
}

/** Stable JSON (sorted keys) so the signed payload hashes identically on every machine. */
function canonical(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]";
  const keys = Object.keys(o as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((o as Record<string, unknown>)[k])).join(",") + "}";
}

/** Run the full Sovereign analysis on a finished (or in-progress) run and sign the verdict. */
export function sovereignAnalyze(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize", opts: { target?: number; keys?: { privateKey: KeyObject; publicKey: KeyObject }; issuedAtMs?: number } = {}): SovereignVerdict {
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const sgn = goal === "minimize" ? -1 : 1;
  const best = hist.length ? hist.reduce((a, b) => (sgn * b.value > sgn * a.value ? b : a)) : null;

  const prime = safe(() => meletePrime(hist, space, goal));
  const diagnose = {
    shape: safe(() => analyzeShape(hist, space, goal)),
    cliffs: safe(() => analyzeCliffs(hist, space, goal)),
    sloppiness: safe(() => analyzeSloppiness(hist, space, goal)),
    achievability: typeof opts.target === "number" ? safe(() => assessAchievability(hist, space, opts.target as number, goal)) : null,
    options: safe(() => analyzeRashomon(hist, space, goal)),
  };
  const decide = prime
    ? { processIQ: prime.processIQ ?? NaN, grade: prime.grade ?? "unknown", decision: prime.decisive?.kind ?? "unknown", briefing: prime.briefing ?? "" }
    : { processIQ: NaN, grade: "unknown", decision: "unknown", briefing: "" };

  const payload = {
    product: "Melete — The Sovereign Verifiable AI Analyst & Optimizer" as const,
    discover: { best, evaluations: hist.length, goal },
    decide,
    diagnose,
    verdict: prime?.briefing ? String(prime.briefing).split(". ")[0] : (best ? `best ${(+best.value).toPrecision(4)} in ${hist.length} experiments` : "no measurements yet"),
  };

  // CERTIFY — sign the canonical payload (provenance + reproducibility), verifiable offline
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const payloadHash = createHash("sha256").update(canonical(payload)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash, "hex"), kp.privateKey).toString("base64");
  const publicKeyPem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  const certify: SovereignCertificate = { standard: "melete-sovereign-verdict/v1", payloadHash, signature, publicKeyPem, algo: "ed25519+sha256", issuedAtMs: Math.max(0, Math.floor(opts.issuedAtMs ?? 0)) };

  return { ...payload, certify };
}

/** Re-verify a Sovereign Verdict OFFLINE: recompute the payload hash + check the Ed25519 signature. */
export function verifySovereign(v: SovereignVerdict): { ok: boolean; reason: string } {
  try {
    if (!v || !v.certify || v.certify.standard !== "melete-sovereign-verdict/v1") return { ok: false, reason: "not a melete-sovereign-verdict/v1 certificate" };
    const { certify, ...payload } = v;
    const hash = createHash("sha256").update(canonical(payload)).digest("hex");
    if (hash !== certify.payloadHash) return { ok: false, reason: "payload hash mismatch — the verdict was altered after signing" };
    const pub = createPublicKey(certify.publicKeyPem);
    const ok = edVerify(null, Buffer.from(hash, "hex"), pub, Buffer.from(certify.signature, "base64"));
    return ok ? { ok: true, reason: "signature valid — provenance verified offline" } : { ok: false, reason: "signature does not match the public key" };
  } catch (e) { return { ok: false, reason: "verify error: " + (e as Error).message.slice(0, 100) }; }
}

function safe<T>(f: () => T): T | null { try { return f(); } catch { return null; } }

// ── gauntlet ──────────────────────────────────────────────────────────────────
import { lcg } from "./space.js";

export function sovereignGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const f = (x: number, y: number) => Math.exp(-(((x - 0.4) ** 2) + ((y - 0.6) ** 2)) / 0.2);
  const rnd = lcg(7); const obs: Observation[] = [];
  for (let i = 0; i < 50; i++) { const x = rnd(), y = rnd(); obs.push({ experiment: { x, y }, value: f(x, y) }); }
  const kp = generateKeyPairSync("ed25519");
  const v = sovereignAnalyze(obs, space, "maximize", { keys: kp, issuedAtMs: 1000 });

  const composesLayers = !!v.discover && !!v.decide && !!v.diagnose && !!v.certify && !!v.discover.best
    && !!v.diagnose.shape && !!v.diagnose.cliffs && !!v.diagnose.sloppiness && !!v.diagnose.options;
  const signedVerifies = verifySovereign(v).ok === true;
  // TAMPER: alter the discovered best value → verify must fail
  const tampered = JSON.parse(JSON.stringify(v)) as SovereignVerdict; if (tampered.discover.best) tampered.discover.best.value = 999;
  const tamperCaught = verifySovereign(tampered).ok === false;
  // TAMPER the signature itself
  const tampered2 = JSON.parse(JSON.stringify(v)) as SovereignVerdict; tampered2.certify.signature = Buffer.from("nope").toString("base64");
  const sigTamperCaught = verifySovereign(tampered2).ok === false;
  // a DIFFERENT key cannot validate
  const v2 = sovereignAnalyze(obs, space, "maximize", { keys: generateKeyPairSync("ed25519"), issuedAtMs: 1000 });
  const forgedKey = (() => { const swap = JSON.parse(JSON.stringify(v)) as SovereignVerdict; swap.certify.publicKeyPem = v2.certify.publicKeyPem; return verifySovereign(swap).ok === false; })();
  // DETERMINISTIC payload (same keys + time → identical signed verdict)
  const v3 = sovereignAnalyze(obs, space, "maximize", { keys: kp, issuedAtMs: 1000 });
  const deterministic = canonical(v) === canonical(v3);
  const usesPrime = v.decide.decision !== "unknown" && Number.isFinite(v.decide.processIQ);
  const total = (() => { try { const z = sovereignAnalyze([], space, "maximize"); verifySovereign(z); sovereignAnalyze(null as never, space); return true; } catch { return false; } })();

  const checks = [
    { name: "COMPOSES-ALL-4-LAYERS", pass: composesLayers, detail: "discover + decide + diagnose + certify all populated in one verdict" },
    { name: "SIGNED-VERIFIES-OFFLINE", pass: signedVerifies, detail: "the Ed25519 provenance certificate re-verifies with the embedded public key" },
    { name: "TAMPER-CAUGHT", pass: tamperCaught, detail: "altering the result after signing breaks verification" },
    { name: "FORGED-SIGNATURE-CAUGHT", pass: sigTamperCaught, detail: "a fake signature is rejected" },
    { name: "WRONG-KEY-CANNOT-VALIDATE", pass: forgedKey, detail: "swapping in another key fails verification" },
    { name: "DECISION-FROM-PRIME-BRAIN", pass: usesPrime, detail: `verdict carries the Φ brain's decision (IQ ${v.decide.processIQ}, "${v.decide.decision}")` },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same data + keys → byte-identical signed verdict" },
    { name: "TOTAL", pass: total, detail: "empty / null never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
