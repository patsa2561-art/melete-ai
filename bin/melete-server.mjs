#!/usr/bin/env node
/**
 * Melete discovery-as-a-service HTTP server. Self-contained (node:http + node:vm). Stateless.
 *   GET  /            → landing page (live demo)
 *   GET  /health      → { ok, version }
 *   POST /discover    → { space, objective, budget, goal, engine } → best + armStats + signed trace + verify
 *   POST /verify      → { trace } → { ok, reason }
 *
 * The objective is evaluated in a frozen VM sandbox (Math only) with a timeout — a demo-grade safety
 * boundary, not a hostile-multi-tenant guarantee. Budget is capped server-side.
 */
import { createServer } from "node:http";
import { createContext, runInContext } from "node:vm";
import { readFileSync, existsSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as M from "../dist/index.js";
import { createHash, generateKeyPairSync } from "node:crypto";

// 💾 R52 — durable, file-backed PUBLIC transparency log (survives restarts) + witness set for the live monitor
const _dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
function _fileStore() {
  const linesPath = join(_dataDir, "translog.jsonl"), keyPath = join(_dataDir, "log-key.pem");
  try { mkdirSync(_dataDir, { recursive: true }); } catch (e) {}
  return {
    readLines: () => { try { return readFileSync(linesPath, "utf8").split("\n").filter(Boolean); } catch (e) { return []; } },
    appendLine: (s) => { try { appendFileSync(linesPath, String(s).replace(/\n/g, " ") + "\n"); } catch (e) {} },
    readKeyPem: () => { try { return readFileSync(keyPath, "utf8"); } catch (e) { return null; } },
    writeKeyPem: (pem) => { try { writeFileSync(keyPath, pem); } catch (e) {} },
  };
}
let _durable = null; try { _durable = M.openDurableLog({ logId: "melete-public-claims", store: _fileStore() }); if (_durable.size() === 0) ["genesis:melete-public-log", "melete-cert:fairness:demo", "melete-cert:pca:demo"].forEach((e) => _durable.submit(e)); } catch (e) { _durable = null; }
const _logWitnesses = ["Anthropic-Witness", "Cloudflare-Witness", "EU-AI-Office", "MLCommons", "AlgoWatch-NGO"].map((n) => M.createWitness(n));


// the live MCP trust ledger — meters + audits every agent tool call this server serves (the toll-booth)
const mcpLedger = M.createLedger();

const VERSION = (() => { try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).version; } catch { return "0.2.0"; } })();
const PORT = +(process.env.PORT || 8790); const HOST = process.env.HOST || "127.0.0.1";
const MAX_BUDGET = +(process.env.MELETE_MAX_BUDGET || 120);
const PUB = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
// serve a pre-rendered PNG social card; if it isn't on disk, fall back to the live SVG (never 404s)
function serveCard(res, pngFile, svg) { if (existsSync(pngFile)) { const b = readFileSync(pngFile); res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=3600", "content-length": b.length }); return res.end(b); } res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" }); return res.end(svg); }

const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "content-length": Buffer.byteLength(b) }); res.end(b); };
const readBody = (req) => new Promise((resolve) => { let d = ""; req.on("data", (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve(null); } }); });

function makeOracle(space, objective) {
  const ctx = createContext({ Math });   // sandbox has Math only (no require/process/fs); writable so dims can be bound
  return (e) => { for (const d of space.dims) ctx[d.name] = e[d.name]; const v = Number(runInContext(objective, ctx, { timeout: 100 })); return Number.isFinite(v) ? v : -1e18; };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"); const path = url.pathname;
    if (req.method === "OPTIONS") return json(res, 204, {});
    if (req.method === "GET" && path === "/") { const html = M.landingPage(VERSION); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(html); }
    if (req.method === "GET" && path === "/pitch") { const html = M.pitchDeck(VERSION); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(html); }
    if (req.method === "GET" && path.startsWith("/for/")) { const k = path.slice(5).replace(/\/+$/, ""); const html = M.audiencePage(k, VERSION); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(html); }
    if (req.method === "GET" && path === "/og.png") return serveCard(res, join(PUB, "og.png"), M.socialCard());
    if (req.method === "GET" && path.startsWith("/og/") && path.endsWith(".png")) { const k = path.slice(4, -4); return serveCard(res, join(PUB, "og", k + ".png"), M.socialCard(k)); }
    if (req.method === "GET" && path === "/og.svg") { res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" }); return res.end(M.socialCard()); }
    if (req.method === "GET" && path.startsWith("/og/") && path.endsWith(".svg")) { const k = path.slice(4, -4); res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" }); return res.end(M.socialCard(k)); }
    if (req.method === "GET" && path === "/sitemap.xml") { res.writeHead(200, { "content-type": "application/xml; charset=utf-8" }); return res.end(M.sitemapXml()); }
    if (req.method === "GET" && path === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); return res.end(M.robotsTxt()); }
    if (req.method === "GET" && path === "/favicon.svg") { res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" }); return res.end(M.faviconSvg()); }
    if (req.method === "GET" && path === "/docs") { const html = M.docsPage(VERSION); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(html); }
    if (req.method === "GET" && path === "/health") return json(res, 200, { ok: true, version: VERSION, service: "melete" });

    // ⏪ REPLAY — re-run a Replay Token OFFLINE: verify signature + deterministically reproduce step-by-step
    if (req.method === "POST" && path === "/replay/verify") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try { return json(res, 200, M.replayToken(body)); } catch (e) { return json(res, 400, { error: "replay failed: " + e.message.slice(0, 120) }); }
    }

    // 🛡 IP SHIELD — re-verify a patent-grade IP audit trail OFFLINE
    if (req.method === "POST" && path === "/ip-audit/verify") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try { return json(res, 200, M.verifyIpAuditTrail(body)); } catch (e) { return json(res, 400, { error: "verify failed: " + e.message.slice(0, 120) }); }
    }
    // 🚨 GUARDIAN — one heartbeat: detect drift/breach in a live metric history + recommend a re-tune
    if (req.method === "POST" && path === "/guardian/tick") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const history = Array.isArray(body.history) ? body.history.map(Number).filter(Number.isFinite) : [];
      try { return json(res, 200, M.guardianTick(history, { baseline: body.baseline, lowerIsBetter: !!body.lowerIsBetter, breachFrac: body.breachFrac, degradeFrac: body.degradeFrac, window: body.window })); }
      catch (e) { return json(res, 400, { error: "guardian failed: " + e.message.slice(0, 120) }); }
    }

    // 👑 SOVEREIGN — re-verify a signed Sovereign Verdict OFFLINE (provenance + reproducibility)
    if (req.method === "POST" && path === "/sovereign/verify") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try { return json(res, 200, M.verifySovereign(body)); } catch (e) { return json(res, 400, { error: "verify failed: " + e.message.slice(0, 120) }); }
    }

    // 🛡 AEGIS — the self-aware engine: returns the best ROBUST optimum (survives wobble), not the fragile spike
    if (req.method === "POST" && path === "/aegis") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      if (space.dims.length > 12) return json(res, 400, { error: "demo limit: ≤12 dimensions" });
      if (typeof body.objective !== "string" || !body.objective.trim()) return json(res, 400, { error: "objective must be a JS expression string in your dimension names" });
      const budget = Math.max(4, Math.min(MAX_BUDGET, (body.budget | 0) || 50));
      let oracle; try { oracle = makeOracle(space, body.objective); oracle(Object.fromEntries(space.dims.map((d) => [d.name, (d.min + d.max) / 2]))); } catch (e) { return json(res, 400, { error: "objective failed to evaluate: " + e.message.slice(0, 120) }); }
      const goal = body.goal === "minimize" ? "minimize" : "maximize";
      try { const r = M.aegisDiscover({ space, oracle, budget, goal, seed: (body.seed | 0) || 1, robustWeight: typeof body.robustWeight === "number" ? body.robustWeight : 0.6 });
        return json(res, 200, { best: r.best, rawBest: r.rawBest, robustnessOfBest: r.robustnessOfBest, tradedHeight: r.tradedHeight, evaluations: r.evaluations, goal }); }
      catch (e) { return json(res, 400, { error: "aegis failed: " + e.message.slice(0, 120) }); }
    }

    // 🛰 NOISE-ROBUST — trustworthy optimum under MEASUREMENT noise. Injects deterministic gaussian noise of
    // the given std onto your objective (a stand-in for a noisy real oracle), replicate-measures, and returns
    // the optimum you can trust (highest lower-confidence-bound) + the "lucky max" it rejected + a risk band.
    if (req.method === "POST" && path === "/noise-robust") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      if (space.dims.length > 12) return json(res, 400, { error: "demo limit: ≤12 dimensions" });
      if (typeof body.objective !== "string" || !body.objective.trim()) return json(res, 400, { error: "objective must be a JS expression string in your dimension names" });
      const budget = Math.max(12, Math.min(MAX_BUDGET, (body.budget | 0) || 110));
      const noise = (typeof body.noise === "number" && body.noise >= 0) ? body.noise : 0.3;
      let base; try { base = makeOracle(space, body.objective); base(Object.fromEntries(space.dims.map((d) => [d.name, (d.min + d.max) / 2]))); } catch (e) { return json(res, 400, { error: "objective failed to evaluate: " + e.message.slice(0, 120) }); }
      const goal = body.goal === "minimize" ? "minimize" : "maximize";
      const rng = M.lcg((body.seed | 0) || 1);
      const noisyOracle = (e) => { const u1 = Math.max(1e-9, rng()), u2 = rng(); const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); return base(e) + noise * g; };
      try {
        const r = M.noiseRobustDiscover({ space, oracle: noisyOracle, budget, goal, seed: (body.seed | 0) || 1, z: typeof body.z === "number" ? body.z : 1.85, replicates: (body.replicates | 0) || 5 });
        return json(res, 200, { best: r.best, bestMean: r.bestMean, bestStd: r.bestStd, bestN: r.bestN, bestLcb: r.bestLcb, luckyMax: r.luckyMax, rejectedLucky: r.rejectedLucky, noiseFiltered: r.noiseFiltered, points: r.points.slice(0, 12), evaluations: r.evaluations, goal, noise });
      } catch (e) { return json(res, 400, { error: "noise-robust failed: " + e.message.slice(0, 120) }); }
    }

    // 🧩 MIXED-SPACE — optimize a space with categorical / integer / conditional knobs (not just continuous).
    // Dims accept {type:"categorical",choices:[...]} and {activeWhen:{dim,equals}}; objective is a JS expr that
    // may compare categoricals (e.g. engine==='B'?1:0.7). Returns the best full recipe + per-combo leaderboard.
    if (req.method === "POST" && path === "/mixed") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const dims = Array.isArray(body.space) ? body.space : body.space?.dims;
      if (!Array.isArray(dims) || !dims.length) return json(res, 400, { error: "space must be a non-empty array of dims" });
      if (dims.length > 12) return json(res, 400, { error: "demo limit: ≤12 dimensions" });
      if (dims.some((d) => d.type === "categorical" && (!Array.isArray(d.choices) || !d.choices.length))) return json(res, 400, { error: "each categorical dim needs a non-empty choices[]" });
      if (typeof body.objective !== "string" || !body.objective.trim()) return json(res, 400, { error: "objective must be a JS expression string in your dimension names" });
      const budget = Math.max(12, Math.min(600, (body.budget | 0) || 300));   // mixed is combo-heavy → its own cap
      const goal = body.goal === "minimize" ? "minimize" : "maximize";
      let oracle; try { oracle = makeOracle({ dims }, body.objective); } catch (e) { return json(res, 400, { error: "objective failed to compile: " + e.message.slice(0, 120) }); }
      try {
        const r = M.mixedDiscover({ space: { dims }, oracle, budget, goal, seed: (body.seed | 0) || 1 });
        return json(res, 200, { best: r.best, bestCombo: r.bestCombo, byCombo: r.byCombo.slice(0, 12), evaluations: r.evaluations, comboCount: r.comboCount, sampledCombos: r.sampledCombos, goal });
      } catch (e) { return json(res, 400, { error: "mixed failed: " + e.message.slice(0, 120) }); }
    }

    // 📜 PROVENANCE — demo the O(1) tamper-evident audit trail: build a checkpoint over `count` synthetic
    // events, sign it, and prove (a) the snapshot is bounded and (b) altering any past event is detected.
    if (req.method === "POST" && path === "/provenance") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const count = Math.max(1, Math.min(200000, (body.count | 0) || 5000));
      const windowSize = Math.max(1, Math.min(500, (body.windowSize | 0) || 50));
      try {
        const events = []; for (let i = 0; i < count; i++) events.push({ kind: i % 3 === 0 ? "decision" : "experiment", payload: { i, x: (i * 7) % 100 } });
        const cp = M.signCheckpoint(M.buildCheckpoint(events, windowSize));
        const sizeBytes = M.checkpointSize(cp);
        const sigValid = M.verifyCheckpointSignature(cp).ok;
        const intact = M.verifyAgainst(cp, events).ok;
        // tamper an old event and show it's caught
        const tampered = events.slice(); const pos = Math.floor(count / 2); tampered[pos] = { kind: tampered[pos].kind, payload: { i: pos, x: 999999 } };
        const tamperDetected = !M.verifyAgainst(cp, tampered).ok;
        return json(res, 200, { count: cp.count, windowSize, sizeBytes, foldedRoot: cp.foldedRoot, signatureValid: sigValid, intactVerifies: intact, tamperDetected, algo: cp.algo });
      } catch (e) { return json(res, 400, { error: "provenance failed: " + e.message.slice(0, 120) }); }
    }

    // ⬛ NULL ENGINE — the demo that lands: run the SAME engine on a REAL problem and on PURE NOISE. It calls the
    // real one REAL and the noise one NULL (refusing to invent an optimum) — where every other optimizer lies.
    if (req.method === "POST" && path === "/null-engine") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const budget = Math.max(40, Math.min(160, (body.budget | 0) || 90));
      const seed = (body.seed | 0) || 1;
      const space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
      try {
        const realF = (e) => 100 * Math.exp(-((((e.x ?? 0) - 0.6) ** 2) + (((e.y ?? 0) - 0.4) ** 2)) / 0.06);
        const rng = M.lcg((seed >>> 0) || 1); const noiseF = () => rng() * 100;   // knobs ignored → genuinely null
        const real = M.nullEngineDiscover({ space, oracle: realF, budget, goal: "maximize", seed });
        const noise = M.nullEngineDiscover({ space, oracle: noiseF, budget, goal: "maximize", seed });
        const pick = (r) => ({ verdict: r.verdict, pValue: r.pValue, signalStrength: r.signalStrength, best: r.best, attempts: r.attempts, nullRate: r.nullRate });
        return json(res, 200, { real: pick(real), noise: pick(noise), budget });
      } catch (e) { return json(res, 400, { error: "null-engine failed: " + e.message.slice(0, 120) }); }
    }

    // 🧬 CAUSAL ENGINE — the demo that lands: a system with a HIDDEN CONFOUNDER. x0 looks important in the
    // historical data (it tracked the confounder) but has ZERO causal effect; x1 is the true cause. The engine
    // intervenes, flags x0 confounded, names x1 causal, recommends x1's optimum, and signs a Proof of Causation.
    if (req.method === "POST" && path === "/causal") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 1;
      const space = { dims: [{ name: "x0", type: "real", min: 0, max: 1 }, { name: "x1", type: "real", min: 0, max: 1 }, { name: "x2", type: "real", min: 0, max: 1 }] };
      try {
        const causalY = (x1) => 100 * Math.exp(-((x1 - 0.7) ** 2) / 0.05);
        const r0 = M.lcg((seed >>> 0) || 1); const oracle = (e) => causalY(e.x1 ?? 0) + 60 * r0() + 4 * (r0() - 0.5);
        const ro = M.lcg(((seed * 13 + 3) >>> 0) || 1); const observations = [];
        for (let i = 0; i < 220; i++) { const C = ro(); const x0 = Math.max(0, Math.min(1, C + 0.05 * (ro() - 0.5))); const x1 = ro(), x2 = ro(); observations.push({ experiment: { x0, x1, x2 }, value: causalY(x1) + 60 * C }); }
        const r = M.causalDiscover({ space, oracle, observations, seed, goal: "maximize" });
        return json(res, 200, { variables: r.variables, best: r.best, causalValue: r.causalValue, causalVars: r.causalVars, confoundedVars: r.confoundedVars, interventions: r.interventions, proofValid: M.verifyProofOfCausation(r.proof).ok, proofHash: r.proof.payloadHash.slice(0, 16) });
      } catch (e) { return json(res, 400, { error: "causal failed: " + e.message.slice(0, 120) }); }
    }

    // 🏅 TRUST CERTIFICATE — fuse SIGNAL + CAUSAL + ROBUST into ONE signed verdict. Pick a scenario and watch
    // Melete either stamp it TRUSTWORTHY or refuse it, naming the gate that failed. (The moat, in one call.)
    if (req.method === "POST" && path === "/trust-certificate") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 1; const scenario = String(body.scenario || "good");
      const space = { dims: [{ name: "x0", type: "real", min: 0, max: 1 }, { name: "x1", type: "real", min: 0, max: 1 }] };
      try {
        let oracle, observations;
        const goodF = (e) => 100 * Math.exp(-((((e.x0 ?? 0) - 0.4) ** 2) + (((e.x1 ?? 0) - 0.6) ** 2)) / 0.7);
        const causalY = (x1) => 100 * Math.exp(-((x1 - 0.6) ** 2) / 0.7);
        const mkObs = (s, f) => { const r = M.lcg((s >>> 0) || 1); const o = []; for (let i = 0; i < 80; i++) { const x0 = r(), x1 = r(); o.push({ experiment: { x0, x1 }, value: f({ x0, x1 }) }); } return o; };
        if (scenario === "noise") { const r = M.lcg(((seed * 7 + 1) >>> 0) || 1); oracle = () => r() * 100; observations = mkObs(seed * 3 + 1, goodF); }
        else if (scenario === "fragile") { oracle = (e) => 100 * Math.exp(-((((e.x0 ?? 0) - 0.4) ** 2) + (((e.x1 ?? 0) - 0.6) ** 2)) / 0.0008); observations = mkObs(seed * 5 + 1, oracle); }
        else if (scenario === "confounded") { oracle = (e) => causalY(e.x1 ?? 0); const ro = M.lcg(((seed * 13 + 1) >>> 0) || 1); observations = []; for (let i = 0; i < 240; i++) { const C = ro(); const x0 = Math.max(0, Math.min(1, C + 0.05 * (ro() - 0.5))); const x1 = ro(); observations.push({ experiment: { x0, x1 }, value: causalY(x1) + 100 * C }); } }
        else { oracle = goodF; observations = mkObs(seed * 3 + 1, goodF); }
        const c = M.issueTrustCertificate({ space, oracle, observations, seed, goal: "maximize" });
        return json(res, 200, { scenario, verdict: c.verdict, gates: c.gates, failedGates: c.failedGates, best: c.best, payloadHash: c.payloadHash.slice(0, 16), signatureValid: M.verifyTrustCertificate(c).ok });
      } catch (e) { return json(res, 400, { error: "trust-certificate failed: " + e.message.slice(0, 120) }); }
    }

    // 🏔 STABILITY CERTIFICATE — is the optimum reproducible across independent searches? Pick a scenario:
    //   "easy" (one peak → STABLE) or "split" (twin near-equal peaks at low budget → UNSTABLE).
    if (req.method === "POST" && path === "/stability") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 1; const scenario = String(body.scenario || "easy");
      const space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
      try {
        let oracle, budget;
        if (scenario === "split") { oracle = (e) => 1.0 * Math.exp(-(((e.x ?? 0) - 2) ** 2 + ((e.y ?? 0) - 2) ** 2) / 6) + 0.98 * Math.exp(-(((e.x ?? 0) - 8) ** 2 + ((e.y ?? 0) - 8) ** 2) / 6); budget = 12; }
        else { oracle = (e) => Math.exp(-(((e.x ?? 0) - 7.2) ** 2 + ((e.y ?? 0) - 3.4) ** 2) / 4); budget = 26; }
        const c = await M.stabilityCertificate({ space, oracle, budget, goal: "maximize", seed, replicas: 5 });
        return json(res, 200, { scenario, verdict: c.verdict, consensus: c.consensus, replicas: c.replicas, best: c.best, payloadHash: c.payloadHash.slice(0, 16), signatureValid: M.verifyStabilityCertificate(c).ok });
      } catch (e) { return json(res, 400, { error: "stability failed: " + e.message.slice(0, 120) }); }
    }

    // 💎 HONEST-SEARCH PROOF — prove an optimization was genuinely searched (not faked). Issues a real proof,
    // then forges a copy (random points), and audits BOTH offline — genuine VERIFIES, forgery is REJECTED.
    if (req.method === "POST" && path === "/honest-search") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 1;
      const space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
      const oracle = (e) => Math.exp(-(((e.x ?? 0) - 7.2) ** 2 + ((e.y ?? 0) - 3.4) ** 2) / 3) + 0.6 * Math.exp(-(((e.x ?? 0) - 2) ** 2 + ((e.y ?? 0) - 8) ** 2) / 2);
      try {
        const proof = await M.issueSearchProof({ space, oracle, budget: 22, goal: "maximize", seed, candidatePool: 500 });
        const genuine = await M.auditSearchProof(proof);
        const forged = M.forgeRandomProof(proof, seed);
        const forgedAudit = await M.auditSearchProof(forged);
        return json(res, 200, { evaluations: proof.trace.length, best: proof.best, traceHash: proof.traceHash.slice(0, 16), genuine: { verdict: genuine.genuine ? "GENUINE" : "REJECTED", reason: genuine.reason }, forged: { verdict: forgedAudit.genuine ? "GENUINE" : "REJECTED", reason: forgedAudit.reason } });
      } catch (e) { return json(res, 400, { error: "honest-search failed: " + e.message.slice(0, 120) }); }
    }

    // 🛡 TOLERANCE CERTIFICATE — the certified ±radius around the optimum that still keeps ≥90% (Lipschitz-
    // guaranteed). "broad" earns a big tolerance; "narrow" a small one. Re-verified offline.
    if (req.method === "POST" && path === "/tolerance") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const scenario = String(body.scenario || "broad");
      const space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
      try {
        const f = scenario === "narrow" ? ((e) => Math.exp(-(((e.x ?? 0) - 5) ** 2 + ((e.y ?? 0) - 5) ** 2) / 1.2)) : ((e) => Math.exp(-(((e.x ?? 0) - 5) ** 2 + ((e.y ?? 0) - 5) ** 2) / 18));
        const best = { experiment: { x: 5, y: 5 }, value: f({ x: 5, y: 5 }) };
        const c = M.toleranceCertificate({ space, oracle: f, best, floorFraction: 0.9, goal: "maximize" });
        const v = M.verifyToleranceCertificate(c, { space, oracle: f, goal: "maximize" });
        return json(res, 200, { scenario, radiusPctOfRange: +(c.radius * 100).toFixed(1), floorFraction: c.floorFraction, floor: +c.floor.toFixed(4), best: c.best, payloadHash: c.payloadHash.slice(0, 16), verified: v.ok });
      } catch (e) { return json(res, 400, { error: "tolerance failed: " + e.message.slice(0, 120) }); }
    }

    // 📜 PROOF OF IMPROVEMENT — certify (noise-aware) that recipe B beats current setting A by ≥Δ. On a
    // shared-noise process, common-random-numbers pairing certifies the SAME gain from far fewer measurements.
    if (req.method === "POST" && path === "/improvement") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7; const shareSd = 1.2, residSd = 0.3, gap = 0.7;
      try {
        const gauss = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        // independent measurement (noise NOT shared) — needs many replicates to clear the shared noise
        const giS = M.lcg(seed * 37 + 1), giA = M.lcg(seed * 37 + 5), giB = M.lcg(seed * 37 + 9);
        const indep = (e) => { const sh = gauss(giS); return (e.sel ?? 0) === 0 ? 5.0 + shareSd * sh + residSd * gauss(giA) : 5.0 + gap + shareSd * sh + residSd * gauss(giB); };
        const ci = M.improvementCertificate({ oracle: indep, a: { sel: 0 }, b: { sel: 1 }, replicates: 40, seed });
        // common-random-numbers paired measurement — shared noise cancels in the difference
        const gpS = M.lcg(seed * 53 + 1), gpA = M.lcg(seed * 53 + 5), gpB = M.lcg(seed * 53 + 9);
        const cp = M.improvementCertificate({ pairedOracle: () => { const sh = gauss(gpS); return { a: 5.0 + shareSd * sh + residSd * gauss(gpA), b: 5.0 + gap + shareSd * sh + residSd * gauss(gpB) }; }, a: { sel: 0 }, b: { sel: 1 }, replicates: 8, seed });
        // sequential early-stopping — measures in looks of 8 and STOPS the moment the gain is certified (Bonferroni α-split)
        const gsA = M.lcg(seed * 61 + 3), gsB = M.lcg(seed * 61 + 9);
        const cs = M.sequentialImprovementCertificate({ oracle: (e) => ((e.sel ?? 0) === 0 ? 5.0 + gauss(gsA) : 5.0 + gap + gauss(gsB)), a: { sel: 0 }, b: { sel: 1 }, looks: [8, 16, 24, 32, 40], alpha: 0.025, seed });
        return json(res, 200, {
          independent: { verdict: ci.verdict, measurements: ci.a.n + ci.b.n, certifiedGain: +ci.gainLowerBound.toFixed(2), verified: M.verifyImprovementCertificate(ci).ok },
          paired: { verdict: cp.verdict, measurements: cp.a.n + cp.b.n, certifiedGain: +cp.gainLowerBound.toFixed(2), verified: M.verifyImprovementCertificate(cp).ok },
          sequential: { verdict: cs.verdict, measurements: cs.a.n + cs.b.n, stoppedAt: cs.sequential.stoppedAt, vsFixed: 80, certifiedGain: +cs.gainLowerBound.toFixed(2), verified: M.verifyImprovementCertificate(cs).ok },
        });
      } catch (e) { return json(res, 400, { error: "improvement failed: " + e.message.slice(0, 120) }); }
    }

    // 🔐 PRE-REGISTRATION — commit to a protocol before running, then prove the result obeyed it. A genuine
    // run conforms; a cherry-picked one (reported a worse-but-nicer point) is rejected.
    if (req.method === "POST" && path === "/prereg") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 3;
      try {
        const space = { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
        const protocol = { space, objectiveId: "yield-v1", budget: 40, goal: "maximize", decisionRule: "max-observed" };
        const nonce = "demo-" + seed; const commit = M.preCommit(protocol, nonce);
        const trace = Array.from({ length: 24 }, (_, i) => ({ experiment: { x: (i * 2.3 + seed) % 10, y: (i * 1.7 + seed) % 10 }, value: Math.sin(i + seed) * 3 + i * 0.1 }));
        const best = trace.reduce((a, b) => b.value > a.value ? b : a, trace[0]);
        const genuineRun = { objectiveId: "yield-v1", space, evaluations: 24, trace, best };
        const worse = trace.reduce((a, b) => b.value < a.value ? b : a, trace[0]);
        const cherryRun = { ...genuineRun, best: { experiment: worse.experiment, value: worse.value } };
        const g = M.verifyPreRegistration(commit, protocol, nonce, genuineRun);
        const c = M.verifyPreRegistration(commit, protocol, nonce, cherryRun);
        return json(res, 200, { commitHash: commit.commitHash.slice(0, 16), genuine: { conforms: g.conforms, reason: g.reason }, cherryPicked: { conforms: c.conforms, reason: c.reason } });
      } catch (e) { return json(res, 400, { error: "prereg failed: " + e.message.slice(0, 120) }); }
    }

    // 🪨 DECISION-BREAKDOWN — how many corrupted measurements would it take to flip the "B beats A" verdict?
    // a strong, clean gain survives many corruptions (ROBUST); a marginal one flips on a single bad point (FRAGILE).
    if (req.method === "POST" && path === "/breakdown") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7;
      try {
        const gz = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        const mk = (gainTrue, sd, sd2) => { const gA = M.lcg(sd2 * 17 + 1), gB = M.lcg(sd2 * 17 + 7); return M.breakdownCertificate({ oracle: (e) => ((e.sel ?? 0) === 0 ? 5.0 + sd * gz(gA) : 5.0 + gainTrue + sd * gz(gB)), a: { sel: 0 }, b: { sel: 1 }, replicates: 10, seed: sd2, cap: 5, threshold: 2 }); };
        const strong = mk(1.2, 0.3, seed);            // big gain, low noise → survives many corruptions
        const marginal = mk(0.85, 0.65, seed + 1000); // a real but small gain → one bad point flips it
        const pack = (c) => ({ verdict: c.verdict, breakdown: c.breakdown, atLeast: c.breakdownAtLeast, ofMeasurements: c.n, certifiedGain: +c.gainLowerBound.toFixed(2), verified: M.verifyBreakdownCertificate(c).ok, witness: (c.witness || []).map((w) => ({ measurement: w.index + 1, from: +w.from.toFixed(2), to: +w.to.toFixed(2) })) });
        return json(res, 200, { strong: pack(strong), marginal: pack(marginal) });
      } catch (e) { return json(res, 400, { error: "breakdown failed: " + e.message.slice(0, 120) }); }
    }

    // 📉 SELECTION-BIAS (winner's curse) — searching N settings & reporting the best inflates the number.
    // De-bias it: the TRUE value of the selected setting is ≥ correctedLowerBound (accounting for the optimism).
    if (req.method === "POST" && path === "/selection") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7; const n = Math.min(200, Math.max(3, (body.n | 0) || 30)); const sigma = 1.0;
      try {
        const gz = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        const g = M.lcg(seed * 13 + 1); const mu = [], y = [];
        for (let i = 0; i < n; i++) { const m = 5.0 + 0.25 * gz(g); mu.push(m); y.push(m + sigma * gz(g)); }
        let bi = 0; for (let i = 1; i < n; i++) if (y[i] > y[bi]) bi = i;
        const c = M.selectionCertificate({ values: y, sigma });
        // studentized leg: σ UNKNOWN, estimated from r replicates per candidate (the realistic case)
        const r = 3; const reps = mu.map((m) => { const row = []; for (let k = 0; k < r; k++) row.push(m + sigma * gz(g)); return row; });
        const cs = M.selectionCertificate({ replicates: reps });
        return json(res, 200, {
          searched: n,
          naiveBest: +c.naiveBest.toFixed(2),                  // what every other tool reports
          trueValueOfWinner: +mu[bi].toFixed(2),               // the winner's actual mean (the simulator knows it)
          correctedLowerBound: +c.correctedLowerBound.toFixed(2),
          selectionPenalty: +c.selectionPenalty.toFixed(2),
          naiveOverstatedBy: +(c.naiveBest - mu[bi]).toFixed(2),
          boundIsValid: c.correctedLowerBound <= mu[bi] + 1e-9, // the de-biased bound sits at/below the truth
          confidence: c.confidence, verified: M.verifySelectionCertificate(c).ok,
          estimatedSigma: {                                    // σ UNKNOWN → estimated from r replicates, studentized
            replicatesPerCandidate: r, sigmaEstimate: +cs.sigma.toFixed(2), df: cs.df,
            naiveBest: +cs.naiveBest.toFixed(2), correctedLowerBound: +cs.correctedLowerBound.toFixed(2),
            selectionPenalty: +cs.selectionPenalty.toFixed(2), studentized: !cs.sigmaKnown, verified: M.verifySelectionCertificate(cs).ok,
          },
        });
      } catch (e) { return json(res, 400, { error: "selection failed: " + e.message.slice(0, 120) }); }
    }

    // 🧭 EXTRAPOLATION-GUARD — is a recommended setting INSIDE the sampled evidence, or a blind extrapolation?
    if (req.method === "POST" && path === "/support") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7;
      try {
        const gz = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        // two sampled clusters in [0,1]² (left + right) — leaving an interior VOID around x=0.5
        const mk = (sd, cx, cy) => { const g = M.lcg(sd); const p = []; for (let i = 0; i < 30; i++) p.push([cx + 0.06 * gz(g), cy + 0.06 * gz(g)]); return p; };
        const design = mk(seed * 13 + 1, 0.25, 0.5).concat(mk(seed * 13 + 9, 0.78, 0.5));
        // a thin diagonal band (two correlated knobs) for the off-hull demo
        const bandG = M.lcg(seed * 29 + 3); const band = []; for (let i = 0; i < 40; i++) { const t = 0.1 + 0.8 * bandG(); band.push([t + 0.02 * gz(bandG), t + 0.02 * gz(bandG)]); }
        const pack = (label, dsn, x) => { const c = M.supportCertificate({ design: dsn, recommended: x }); return { label, recommended: x.map((v) => +v.toFixed(2)), verdict: c.verdict, supportRatio: +c.supportRatio.toFixed(2), witness: c.witness.map((w) => ({ knob: w.dim, asked: +w.value.toFixed(2), sampledLimit: +w.limit.toFixed(2), side: w.side })), hullWitness: c.hullWitness ? { direction: c.hullWitness.u.map((v) => +v.toFixed(2)), margin: +(c.hullWitness.xDot - c.hullWitness.dataMax).toFixed(3) } : null, verified: M.verifySupportCertificate(c).ok }; };
        return json(res, 200, {
          designSize: design.length,
          insideCluster: pack("inside a sampled cluster", design, design[0]),       // SUPPORTED
          interiorVoid: pack("an unsampled gap (still inside the hull)", design, [0.5, 0.5]), // SPARSE-INTERIOR
          beyondBox: pack("beyond every sampled value", design, [1.9, 0.5]),         // EXTRAPOLATION + axis witness
          offHull: pack("in-box but off the correlated band", band, [0.82, 0.18]),   // EXTRAPOLATION + hyperplane witness (R16)
        });
      } catch (e) { return json(res, 400, { error: "support failed: " + e.message.slice(0, 120) }); }
    }

    // 📊 FALSE-DISCOVERY — report K findings at once; BH controls the fraction that are false. Naive p<α inflates it.
    if (req.method === "POST" && path === "/fdr") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 4; const m = 40, m1 = 10, delta = 3.5, q = 0.1, alpha = 0.05;
      try {
        const gz = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        const g = M.lcg(seed * 17 + 1); const isReal = [], z = [];
        for (let i = 0; i < m; i++) { const real = i < m1; isReal.push(real); z.push((real ? delta : 0) + gz(g)); }
        const p = z.map(M.pValueFromZ);
        const c = M.falseDiscoveryCertificate({ pValues: p, q, alpha });
        const by = M.falseDiscoveryCertificate({ pValues: p, q, procedure: "BY" });
        const falseInBH = c.discoveries.filter((i) => !isReal[i]).length;
        const falseInBY = by.discoveries.filter((i) => !isReal[i]).length;
        const naiveIdx = p.map((v, i) => i).filter((i) => p[i] < alpha);
        const falseInNaive = naiveIdx.filter((i) => !isReal[i]).length;
        // a few per-hypothesis q-values (sorted) — the threshold-free, per-finding adjusted significance
        const qSorted = c.discoveries.map((i) => +c.qValues[i].toFixed(4)).sort((a, b) => a - b).slice(0, 5);
        return json(res, 200, {
          tested: m, realEffects: m1, targetFDR: q, naiveAlpha: alpha,
          naive: { findings: naiveIdx.length, falseOnes: falseInNaive },                 // no multiplicity control
          bh: { discoveries: c.discoveryCount, falseOnes: falseInBH, threshold: +c.bhThreshold.toExponential(2) },
          by: { discoveries: by.discoveryCount, falseOnes: falseInBY, harmonic: +by.harmonic.toFixed(2) }, // arbitrary-dependence safe
          qValuesOfDiscoveries: qSorted,                                                 // per-hypothesis adjusted FDR
          droppedAsLikelyFalse: c.droppedAsLikelyFalse, verified: M.verifyFalseDiscoveryCertificate(c).ok && M.verifyFalseDiscoveryCertificate(by).ok,
        });
      } catch (e) { return json(res, 400, { error: "fdr failed: " + e.message.slice(0, 120) }); }
    }

    // ⏱ ANYTIME-VALID — an agent peeks after every observation; the e-process keeps the FP guarantee under optional stopping.
    if (req.method === "POST" && path === "/anytime") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7; const sigma = 1, alpha = 0.05, tau2 = 0.3, T = 200;
      try {
        const gz = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        // a real gain (μ=0.3): the agent monitors continuously and stops when the e-value crosses 1/α
        const g = M.lcg(seed * 17 + 1); const obs = []; for (let t = 0; t < T; t++) obs.push(0.3 + gz(g));
        const c = M.anytimeCertificate({ observations: obs, sigma, alpha, tau2 });
        // measured contrast under the NULL: how often does each method falsely fire when you peek every step?
        let eFP = 0, naiveFP = 0, K = 300;
        for (let s = 1; s <= K; s++) { const gg = M.lcg(s * 91 + 13); const nobs = []; for (let t = 0; t < T; t++) nobs.push(gz(gg));
          if (M.anytimeCertificate({ observations: nobs, sigma, alpha, tau2 }).verdict === "ANYTIME-SIGNIFICANT") eFP++;
          let S = 0; for (let t = 1; t <= T; t++) { S += nobs[t - 1]; if (Math.abs(S / Math.sqrt(t)) > 1.96) { naiveFP++; break; } } }
        return json(res, 200, {
          horizon: T, alpha,
          realGain: { verdict: c.verdict, stoppedAt: c.stoppedAt, eValueAtStop: +c.eValueAtStop.toFixed(1), threshold: c.threshold, estimate: +c.estimate.toFixed(3), ciLower: +c.ciLower.toFixed(3), ciUpper: +c.ciUpper.toFixed(3), excludesZero: c.excludesZero, verified: M.verifyAnytimeCertificate(c).ok },
          nullContrast: { peeks: T, trials: K, anytimeFalsePositivePct: +(eFP / K * 100).toFixed(1), naivePeekFalsePositivePct: +(naiveFP / K * 100).toFixed(1) },
        });
      } catch (e) { return json(res, 400, { error: "anytime failed: " + e.message.slice(0, 120) }); }
    }

    // 🤝 SWARM-EVIDENCE — pool many agents' independent streams into one signed verdict; a lying agent is excluded.
    if (req.method === "POST" && path === "/swarm") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7; const sigma = 1, alpha = 0.05, tau2 = 0.3, A = 5, n = 40, mu = 0.25;
      try {
        const gz = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        // 5 honest agents with weak individual evidence + 1 liar claiming a huge e-value on null data
        const eOf = (S, t) => Math.sqrt(1 / (1 + tau2 * t)) * Math.exp(tau2 * S * S / (2 * (1 + tau2 * t)));
        const contribs = []; const singles = [];
        for (let a = 0; a < A; a++) { const g = M.lcg(seed * 97 + a * 13 + 1); const obs = []; let S = 0; for (let i = 0; i < n; i++) { const v = mu + gz(g); obs.push(v); S += v; } contribs.push({ agent: "agent" + a, observations: obs }); singles.push(+eOf(S, n).toFixed(1)); }
        const gl = M.lcg(seed * 41 + 99); const lo = []; for (let i = 0; i < n; i++) lo.push(gz(gl));
        contribs.push({ agent: "liar", observations: lo, claimedEValue: 1e6 });
        const c = M.swarmCertificate({ contributions: contribs, sigma, alpha, tau2 });
        // a second swarm where one rogue agent measures a different effect → the consensus check flags disagreement
        const rogue = []; for (let a = 0; a < 4; a++) { const g = M.lcg(seed * 53 + a * 7 + 3); const o = []; for (let i = 0; i < n; i++) o.push(gz(g)); rogue.push({ agent: "agent" + a, observations: o }); }
        const grg = M.lcg(seed * 53 + 88); const ro = []; for (let i = 0; i < n; i++) ro.push(1.3 + gz(grg)); rogue.push({ agent: "rogue", observations: ro });
        const cr = M.swarmCertificate({ contributions: rogue, sigma, alpha, tau2 });
        return json(res, 200, {
          agents: c.agents, honestCount: c.honestCount, excludedCount: c.excludedCount,
          singleAgentEValues: singles, anySingleSignificant: singles.some((e) => e >= c.threshold),
          combinedEValue: +c.combinedEValue.toFixed(1), threshold: c.threshold, verdict: c.verdict,
          liarExcluded: !c.contributions.find((x) => x.agent === "liar").honest,
          consensus: c.consensus, iSquared: +c.iSquared.toFixed(2),
          rogueScenario: { consensus: cr.consensus, mostHeterogeneousAgent: cr.mostHeterogeneousAgent, iSquared: +cr.iSquared.toFixed(2), pooledVerdict: cr.verdict },
          verified: M.verifySwarmCertificate(c).ok && M.verifySwarmCertificate(cr).ok,
        });
      } catch (e) { return json(res, 400, { error: "swarm failed: " + e.message.slice(0, 120) }); }
    }

    // 📏 CONFORMAL — wrap a predictor with a distribution-free interval; compare to a Gaussian interval on skewed data.
    if (req.method === "POST" && path === "/conformal") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7; const alpha = 0.1, nCal = 200, nTest = 4000, z90 = 1.6448536269514722;
      try {
        const gz = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        const skew = (g) => { const u = Math.max(1e-9, g()); return -Math.log(u) - 1; };   // right-skewed residuals
        const g = M.lcg(seed * 101 + 1); const cal = []; for (let i = 0; i < nCal; i++) cal.push(skew(g));
        const c = M.conformalCertificate({ residuals: cal, alpha, prediction: 5.0 });
        let m = 0; for (const r of cal) m += r; m /= nCal; let sd = 0; for (const r of cal) sd += (r - m) * (r - m); sd = Math.sqrt(sd / (nCal - 1)); const qG = z90 * sd;
        let covC = 0, covG = 0; for (let i = 0; i < nTest; i++) { const r = skew(g); if (Math.abs(r) <= c.halfWidth) covC++; if (Math.abs(r) <= qG) covG++; }
        // adaptive (normalized) leg: heteroscedastic noise σ(x)=1+2x → plain under-covers the hard region; normalized balances
        const kH = 2; const gh = M.lcg(seed * 211 + 9); const hr = [], hd = []; for (let i = 0; i < nCal; i++) { const x = gh(); const sg = 1 + kH * x; hr.push(sg * gz(gh)); hd.push(sg); }
        const cP = M.conformalCertificate({ residuals: hr, alpha }); const cN = M.conformalCertificate({ residuals: hr, alpha, difficulty: hd });
        let plLo = 0, plHi = 0, noLo = 0, noHi = 0, cl = 0, ch = 0; for (let i = 0; i < nTest; i++) { const x = gh(); const sg = 1 + kH * x; const r = sg * gz(gh); const inP = Math.abs(r) <= cP.halfWidth, inN = Math.abs(r) <= cN.halfWidth * sg; if (x < 0.5) { cl++; if (inP) plLo++; if (inN) noLo++; } else { ch++; if (inP) plHi++; if (inN) noHi++; } }
        return json(res, 200, {
          residuals: "skewed", calibrationN: nCal, alpha, targetCoverage: 1 - alpha,
          conformal: { halfWidth: +c.halfWidth.toFixed(3), coverage: +(covC / nTest).toFixed(3), interval: [+c.intervalLower.toFixed(2), +c.intervalUpper.toFixed(2)], coverageBand: [+c.coverageLower.toFixed(3), +c.coverageUpper.toFixed(3)] },
          gaussian: { halfWidth: +qG.toFixed(3), coverage: +(covG / nTest).toFixed(3) },
          conformalTighterBy: +((qG / c.halfWidth - 1) * 100).toFixed(0),
          adaptive: { note: "heteroscedastic noise σ(x)=1+2x", plainCoverage: { easyRegion: +(plLo / cl).toFixed(2), hardRegion: +(plHi / ch).toFixed(2) }, normalizedCoverage: { easyRegion: +(noLo / cl).toFixed(2), hardRegion: +(noHi / ch).toFixed(2) } },
          verified: M.verifyConformalCertificate(c).ok && M.verifyConformalCertificate(cN).ok,
        });
      } catch (e) { return json(res, 400, { error: "conformal failed: " + e.message.slice(0, 120) }); }
    }

    // 👥 SUBGROUP-VALIDITY — does the A/B win hold for every segment, or did the average hide a harmed one?
    if (req.method === "POST" && path === "/subgroup") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7; const G = 4, n = 60, alpha = 0.05; const deltas = [0.8, 0.8, 0.8, -0.9];   // 3 improve, 1 harmed
      try {
        const gz = (g) => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
        const contribs = deltas.map((d, gi) => { const ga = M.lcg(seed * 131 + gi * 7 + 1), gb = M.lcg(seed * 131 + gi * 7 + 5); const A = [], B = []; for (let i = 0; i < n; i++) { A.push(5 + gz(ga)); B.push(5 + d + gz(gb)); } return { group: "segment" + gi, samplesA: A, samplesB: B }; });
        const c = M.subgroupCertificate({ contributions: contribs, alpha });
        return json(res, 200, {
          groups: c.groups, alpha, verdict: c.verdict,
          overall: { effect: +c.overallEffect.toFixed(2), significant: c.overallSignificant },
          overallMisleading: c.overallMisleading, worstSegment: c.worstGroup, worstEffect: +c.worstEffect.toFixed(2),
          subgroups: c.subgroups.map((s) => ({ group: s.group, effect: +s.effect.toFixed(2), status: s.status })),
          verified: M.verifySubgroupCertificate(c).ok,
        });
      } catch (e) { return json(res, 400, { error: "subgroup failed: " + e.message.slice(0, 120) }); }
    }

    // 🎯 CALIBRATION — when the model says 90%, is it right ~90%? Spiegelhalter Z + ECE; overconfident vs calibrated.
    if (req.method === "POST" && path === "/calibration") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const seed = (body.seed | 0) || 7; const N = 1000;
      try {
        const g = M.lcg(seed * 17 + 1);
        const cp = [], cy = [], op = [], oy = [], mp = [], my = [];
        const clip = (p) => Math.min(0.999999999, Math.max(1e-9, p));
        for (let i = 0; i < N; i++) {
          const q = g(); cp.push(q); cy.push(g() < q ? 1 : 0);
          const q2 = g(); op.push(clip(0.5 + 1.5 * (q2 - 0.5))); oy.push(g() < q2 ? 1 : 0);
          // MID-RANGE miscalibration: predictions clustered near 0.5 (where Spiegelhalter's (1−2p) weight ≈ 0), true rate higher
          const q3 = 0.45 + 0.10 * g(); mp.push(q3); my.push(g() < clip(q3 + 0.20) ? 1 : 0);
        }
        const cc = M.calibrationCertificate({ predictions: cp, outcomes: cy }); const co = M.calibrationCertificate({ predictions: op, outcomes: oy });
        const cm = M.calibrationCertificate({ predictions: mp, outcomes: my });
        // recalibrate the overconfident model on a split, re-measure ECE on held-out
        const half = N / 2; const recal = M.histogramRecalibrate(op.slice(0, half), oy.slice(0, half), op.slice(half));
        const cr = M.calibrationCertificate({ predictions: recal, outcomes: oy.slice(half) });
        const pack = (c) => ({ verdict: c.verdict, direction: c.direction, Z: +c.spiegelhalterZ.toFixed(2), ece: +(c.ece * 100).toFixed(1), verified: M.verifyCalibrationCertificate(c).ok });
        return json(res, 200, {
          calibrated: pack(cc), overconfident: pack(co),
          midrange: { ...pack(cm), globally: cm.globallyMiscalibrated, conditionally: cm.conditionallyMiscalibrated, worstBin: cm.worstBin ? { lo: +cm.worstBin.lo.toFixed(2), hi: +cm.worstBin.hi.toFixed(2), confidence: +cm.worstBin.confidence.toFixed(2), accuracy: +cm.worstBin.accuracy.toFixed(2) } : null },
          recalibrated: { ...pack(cr), eceBeforePct: +(M.calibrationCertificate({ predictions: op.slice(half), outcomes: oy.slice(half) }).ece * 100).toFixed(1) },
        });
      } catch (e) { return json(res, 400, { error: "calibration failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/privacy") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const n = Math.max(2, (body.n | 0) || 200), eps = +body.epsilon || 1.0, del = +body.delta || 1e-5;
        const sens = 1 / n; const trueMean = Number.isFinite(+body.mean) ? +body.mean : 0.63;
        // certified release at the requested (ε,δ)
        const cert = M.privacyCertificate({ statistic: [trueMean], sensitivity: sens, epsilon: eps, delta: del });
        // empirical membership-inference attack: does it stay inside the (ε,δ) region? (compare to an under-noised release)
        const T = 60000, gN = () => Math.random();
        const sn = () => { let u = 0, v = 0; while (u < 1e-12) u = gN(); while (v < 1e-12) v = gN(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
        const region = (sigma) => { const od = [], op = []; for (let i = 0; i < T; i++) { od.push(sigma * sn()); op.push(sens + sigma * sn()); } od.sort((a, b) => a - b); op.sort((a, b) => a - b); const frac = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo / a.length; }; let w = 0; for (let q = 0; q <= 200; q++) { const t = -0.6 + (sens + 1.2) * (q / 200); const fpr = 1 - frac(od, t), tpr = 1 - frac(op, t); w = Math.max(w, tpr - Math.exp(eps) * fpr, fpr - Math.exp(eps) * tpr); } return w; };
        const privViol = region(cert.sigma), underViol = region(cert.sigma * 0.2);
        // v2 zCDP ACCOUNTANT: under ONE fixed (ε,δ) budget, how many releases fit vs basic Σε?
        // composition accounting uses a realistic tiny δ (where zCDP's √k advantage is dramatic); the attack panel
        // above uses the request δ for an estimable empirical demonstration.
        const budgetEps = Math.max(eps * 2, +body.budgetEpsilon || 3.0), budgetDelta = 1e-5;
        const led = M.createPrivacyLedger(budgetEps, budgetDelta); let zcdpAccepted = 0;
        for (let i = 0; i < 200; i++) { const c2 = M.privacyCertificate({ statistic: [trueMean], sensitivity: sens, epsilon: eps, delta: budgetDelta }); if (M.ledgerRecord(led, c2).accepted) zcdpAccepted++; else break; }
        const basicAdmits = Math.floor(budgetEps / eps);
        return json(res, 200, {
          epsilon: eps, delta: del, sensitivity: +sens.toFixed(6),
          sigma: +cert.sigma.toExponential(3), sigmaRequired: +cert.sigmaRequired.toExponential(3), rho: +cert.rho.toExponential(3),
          verdict: cert.verdict, release: +cert.release[0].toFixed(4), trueMean,
          achievedDelta: +cert.achievedDelta.toExponential(2), verified: M.verifyPrivacyCertificate(cert).ok,
          attack: { privateViolation: +privViol.toFixed(4), underNoisedViolation: +underViol.toFixed(3), regionBound: del },
          ledger: { budgetEpsilon: budgetEps, budgetDelta, perReleaseEpsilon: eps, zcdpAdmits: zcdpAccepted, basicAdmits, spentEpsilon: +led.spentEpsilon.toFixed(3), spentRho: +led.spentRho.toExponential(3) },
        });
      } catch (e) { return json(res, 400, { error: "privacy failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/unlearning") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const d = 5, n = Math.max(10, (body.n | 0) || 80), lambda = +body.lambda || 1.0;
        const k = Math.max(1, Math.min(20, (body.batch | 0) || 5));
        const g = M.lcg((body.seed | 0) || 7);
        const X = Array.from({ length: n }, () => Array.from({ length: d }, () => g() * 2 - 1));
        const wt = Array.from({ length: d }, () => g() * 2 - 1);
        const y = X.map((r) => r.reduce((s, a, i) => s + a * wt[i], 0) + (g() * 2 - 1) * 0.3);
        // a BATCH of k high-leverage users who all invoke "right to be forgotten" at once
        const extra = Array.from({ length: k }, () => ({ x: Array.from({ length: d }, () => 4 + g()), y: 6 + g() }));
        const Xa = [...X, ...extra.map((e) => e.x)], ya = [...y, ...extra.map((e) => e.y)]; const fit = M.ridgeSufficientStats(Xa, ya, lambda);
        // full retrain WITHOUT the whole batch (ground truth)
        const retrain = M.ridgeSufficientStats(X, y, lambda).weights;
        const genuine = M.unlearningCertificate({ gram: fit.gram, bVector: fit.bVector, deletedRows: extra, lambda });
        const fake = M.unlearningCertificate({ gram: fit.gram, bVector: fit.bVector, deletedRows: extra, servedWeights: fit.weights, lambda });
        const matchRetrain = Math.sqrt(genuine.servedWeights.reduce((s, v, i) => s + (v - retrain[i]) ** 2, 0));
        return json(res, 200, {
          n: n + k, dimension: d, lambda, batchSize: k,
          batchInfluence: +genuine.influenceNorm.toExponential(3),
          genuine: { verdict: genuine.verdict, residualInfluence: +genuine.residualInfluence.toExponential(3), matchesRetrain: +matchRetrain.toExponential(3), sequentialMatchesBatch: genuine.sequentialMatchesBatch, verified: M.verifyUnlearningCertificate(genuine).ok },
          fakeKeptRecord: { verdict: fake.verdict, residualInfluence: +fake.residualInfluence.toExponential(3), verified: M.verifyUnlearningCertificate(fake).ok },
        });
      } catch (e) { return json(res, 400, { error: "unlearning failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/dro") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const rho = Number.isFinite(+body.rho) ? +body.rho : 0.3, nn = Math.max(10, (body.n | 0) || 60);
        const g = M.lcg((body.seed | 0) || 7);
        // two settings with the SAME nominal mean: A fragile (high variance), B robust (low variance)
        const A = Array.from({ length: nn }, () => 6 + 6 * (g() * 2 - 1));
        const B = Array.from({ length: nn }, () => 6 + 0.6 * (g() * 2 - 1));
        const cA = M.droCertificate({ values: A, rho }), cB = M.droCertificate({ values: B, rho });
        // an actual adversarial shift within the ball, applied to each
        const adv = (L) => { const m = L.reduce((a, b) => a + b, 0) / L.length; const c = L.map((v) => v - m); const cn = Math.sqrt(c.reduce((a, b) => a + b * b, 0)); const rmax = Math.sqrt(rho / L.length); const q = L.map((_, i) => 1 / L.length - (rmax / cn) * c[i]); return q.reduce((a, qi, i) => a + qi * L[i], 0); };
        const pack = (c) => ({ nominalMean: +c.mean.toFixed(3), worstCase: +c.worstCase.toFixed(3), variancePenalty: +c.variancePenalty.toFixed(3), verified: M.verifyDroCertificate(c).ok });
        // v2 confidence mode: same fragile data, but ρ=z²/n ⇒ a calibrated (conf) lower bound on the TRUE mean
        const conf = Number.isFinite(+body.confidence) ? +body.confidence : 0.95;
        const cConf = M.droCertificate({ values: A, confidence: conf });
        return json(res, 200, {
          rho, n: nn,
          fragile: { ...pack(cA), underActualShift: +adv(A).toFixed(3) },
          robust: { ...pack(cB), underActualShift: +adv(B).toFixed(3) },
          droPrefersRobust: cB.worstCase > cA.worstCase,
          confidenceMode: { confidence: conf, rho: +cConf.rho.toFixed(4), lowerBoundOnTrueMean: +cConf.worstCase.toFixed(3), nominalMean: +cConf.mean.toFixed(3), verified: M.verifyDroCertificate(cConf).ok },
        });
      } catch (e) { return json(res, 400, { error: "dro failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/fairness") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const tol = Number.isFinite(+body.tolerance) ? +body.tolerance : 0.1, alpha = Number.isFinite(+body.alpha) ? +body.alpha : 0.05;
        const g = M.lcg((body.seed | 0) || 7); const nPer = Math.max(50, (body.n | 0) || 400);
        const build = (rA, rB, m) => { const pred = [], grp = [], out = []; for (const [gn, r] of [["A", rA], ["B", rB]]) for (let i = 0; i < m; i++) { grp.push(gn); out.push(g() < 0.5 ? 1 : 0); pred.push(g() < r ? 1 : 0); } return { pred, grp, out }; };
        // a biased loan model (group A approved 70%, group B 30%) vs a fair one (both 50%, audited at scale so parity is confirmable)
        const biased = build(0.7, 0.3, nPer), fair = build(0.5, 0.5, Math.max(nPer, 3000));
        const cBias = M.fairnessCertificate({ predictions: biased.pred, groupOf: biased.grp, tolerance: tol, alpha });
        const cFair = M.fairnessCertificate({ predictions: fair.pred, groupOf: fair.grp, tolerance: tol, alpha });
        const pack = (c) => { const dp = c.metrics.find((m) => m.metric === "demographic-parity" && m.scope === "marginal"); return { verdict: c.verdict, worstMetric: c.worstMetric, dpGap: dp ? +dp.gap.toFixed(3) : null, dpGapCI: dp ? [+dp.gapLo.toFixed(3), +dp.gapHi.toFixed(3)] : null, highGroup: dp ? dp.highGroup : null, lowGroup: dp ? dp.lowGroup : null, verified: M.verifyFairnessCertificate(c).ok }; };
        // v2 INTERSECTIONAL (XOR gerrymander): fair on each attribute alone, biased at the intersection
        const A = [], B = [], xp = []; const cells = [["A1", "B1", 0.8], ["A1", "B2", 0.2], ["A2", "B1", 0.2], ["A2", "B2", 0.8]];
        for (const [a, b, r] of cells) for (let i = 0; i < nPer; i++) { A.push(a); B.push(b); xp.push(g() < r ? 1 : 0); }
        const cmA = M.fairnessCertificate({ predictions: xp, groupOf: A, tolerance: tol, alpha });
        const cmB = M.fairnessCertificate({ predictions: xp, groupOf: B, tolerance: tol, alpha });
        const cInt = M.fairnessCertificate({ predictions: xp, axes: [{ name: "A", of: A }, { name: "B", of: B }], tolerance: tol, alpha });
        const interDp = cInt.metrics.find((m) => m.scope === "intersectional" && m.metric === "demographic-parity");
        return json(res, 200, {
          tolerance: tol, alpha, n: nPer * 2, biasedModel: pack(cBias), fairModel: pack(cFair),
          intersectional: {
            marginalA: cmA.verdict, marginalB: cmB.verdict,
            intersection: cInt.verdict, worstScope: cInt.worstScope, worstSystem: cInt.worstSystem,
            intersectionGap: interDp ? +interDp.gap.toFixed(3) : null, worstCell: interDp ? interDp.highGroup + " vs " + interDp.lowGroup : null,
            verified: M.verifyFairnessCertificate(cInt).ok,
          },
        });
      } catch (e) { return json(res, 400, { error: "fairness failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/attribution") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        // a small loan model: additive feature effects + one interaction (income × history). Shapley splits it fairly.
        const names = ["age", "income", "debt", "history", "tenure", "noise"]; const nF = names.length;
        const coef = [0.4, 1.6, -1.1, 1.2, 0.5, 0.0];
        const f = (p) => { let v = 0; for (let i = 0; i < nF; i++) if (p[i]) v += coef[i]; if (p[1] && p[3]) v += 0.6; return v; };
        const cert = M.attributionCertificate({ n: nF, value: f, featureNames: names });
        const order = cert.phi.map((v, i) => ({ name: names[i], phi: +v.toFixed(3) })).sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi));
        // a tilted explanation (inflate the top feature) is rejected on re-derivation
        const tilted = { ...cert, phi: cert.phi.map((v, i) => (i === 1 ? v + 0.5 : v)) };
        return json(res, 200, {
          features: nF, baseline: cert.baseline, prediction: cert.prediction,
          attribution: order, efficiencyResidual: cert.efficiencyResidual, axiomsHold: cert.axiomsHold,
          verified: M.verifyAttributionCertificate(cert).ok,
          tiltedRejected: !M.verifyAttributionCertificate(tilted).ok,
          sha256: cert.payloadHash.slice(0, 16) + "…",
        });
      } catch (e) { return json(res, 400, { error: "attribution failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/receipt") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        // PARTY ① the issuer (a lender) produces a real signed certificate — here an attribution explanation
        const names = ["age", "income", "debt", "history", "tenure"]; const nF = names.length;
        const coef = [0.4, 1.6, -1.1, 1.2, 0.5];
        const f = (p) => { let v = 0; for (let i = 0; i < nF; i++) if (p[i]) v += coef[i]; if (p[1] && p[3]) v += 0.6; return v; };
        const cert = M.attributionCertificate({ n: nF, value: f, featureNames: names });
        const kind = "attribution";
        // PARTY ② the verifier (a regulator/auditor) independently re-derives it and counter-signs a receipt
        const receipt = M.issueVerificationReceipt({ cert, certStandard: cert.standard, verify: (c) => M.verifyByKind(kind, c) });
        const check = M.verifyVerificationReceipt({ receipt, cert, verify: (c) => M.verifyByKind(kind, c) });
        return json(res, 200, {
          certKind: kind, certStandard: cert.standard, certHash: cert.payloadHash.slice(0, 16) + "…",
          issuerFingerprint: receipt.issuerFingerprint, verifierFingerprint: receipt.verifierFingerprint,
          independent: receipt.independent, verifierVerdict: receipt.verifierVerdict,
          boundToCert: receipt.certHash === cert.payloadHash, receiptValid: check.ok,
          whoBenefits: {
            issuer: "the lender gets a portable, independently counter-signed attestation that a regulator verified its explanation — worth more to a customer/regulator than a self-signed claim",
            verifier: "the regulator gets an offline-checkable record proving WHAT it verified and WHEN, tamper-evident — protection if the decision is ever challenged",
          },
        });
      } catch (e) { return json(res, 400, { error: "receipt failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/sla") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        // a realistic AI-service SLA; ?breach=1 simulates a period where calibration drifted out of bounds
        const breach = !!(body.breach | 0);
        const terms = [
          { name: "calibration", metric: "ECE", observed: breach ? 0.071 : 0.032, threshold: 0.05, direction: "<=" },
          { name: "fairness", metric: "demographic-parity-gap", observed: 0.04, threshold: 0.1, direction: "<=" },
          { name: "accuracy", metric: "top1", observed: breach ? 0.871 : 0.93, threshold: 0.90, direction: ">=" },
          { name: "latency", metric: "p95-ms", observed: 180, threshold: 200, direction: "<=" },
        ];
        const cert = M.slaCertificate({ provider: "VendorAI", consumer: "BankCo", period: "2026-06", terms });
        // v2 COMPLIANCE LEDGER over a 6-month billing cycle (2 months breach) — tamper-evident, penalty accrues
        const mk = (cal, acc) => M.slaCertificate({ provider: "VendorAI", consumer: "BankCo", terms: [
          { name: "calibration", metric: "ECE", observed: cal, threshold: 0.05, direction: "<=" },
          { name: "accuracy", metric: "top1", observed: acc, threshold: 0.90, direction: ">=" },
        ] });
        const months = [mk(0.03, 0.93), mk(0.04, 0.92), mk(0.03, 0.91), mk(0.08, 0.93), mk(0.02, 0.94), mk(0.03, 0.86)];
        const ledger = M.buildSlaLedger({ provider: "VendorAI", consumer: "BankCo", penaltyPerBreach: 5000, periodCerts: months });
        const rep = M.slaLedgerReport(ledger);
        return json(res, 200, {
          provider: cert.provider, consumer: cert.consumer, period: cert.period, verdict: cert.verdict, breached: cert.breached,
          terms: cert.terms.map((t) => ({ name: t.name, metric: t.metric, observed: t.observed, threshold: t.threshold, direction: t.direction, satisfied: t.satisfied, margin: +t.margin.toFixed(4) })),
          verified: M.verifySlaCertificate(cert).ok, sha256: cert.payloadHash.slice(0, 16) + "…",
          ledger: { periods: rep.periods, perVerdict: ledger.entries.map((e) => e.periodCert.verdict), breachCount: rep.breachCount, breachRate: +rep.breachRate.toFixed(3), longestCleanStreak: rep.longestCleanStreak, penaltyOwed: rep.penaltyOwed, breachesByTerm: rep.breachesByTerm, ledgerVerified: M.verifySlaLedger(ledger).ok, headHash: ledger.headHash.slice(0, 16) + "…" },
          whoBenefits: {
            provider: "turns 'our model is good' into a signed, enforceable promise that wins enterprise deals and bounds liability to the stated terms",
            consumer: "gets a guarantee with teeth — a breach is provable + offline-checkable, so refunds / penalties / switching are no longer he-said-she-said",
          },
        });
      } catch (e) { return json(res, 400, { error: "sla failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/consent") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const subj = generateKeyPairSync("ed25519"), ctrl = generateKeyPairSync("ed25519");
        // PARTY ① the data subject signs a scoped consent grant
        const receipt = M.consentReceipt({ subject: "alice", controller: "BankCo", purposes: ["fraud-detection", "credit-scoring"], fields: ["income", "age", "history"], grantedAt: 1000, expiresAt: 2000, keys: subj });
        const rev = M.consentRevocation({ receipt, revokedAt: 1600, keys: subj });
        // PARTY ② the controller asks to use the data — each use is adjudicated against the signed grant
        const uses = [
          { label: "credit score (in scope)", use: { purpose: "credit-scoring", fields: ["income", "age"], atTime: 1500 }, rev: null },
          { label: "ad targeting (purpose not consented)", use: { purpose: "ad-targeting", fields: ["income"], atTime: 1500 }, rev: null },
          { label: "uses ethnicity (field not consented)", use: { purpose: "credit-scoring", fields: ["income", "ethnicity"], atTime: 1500 }, rev: null },
          { label: "after subject revoked at t=1600", use: { purpose: "credit-scoring", fields: ["income"], atTime: 1800 }, rev },
        ];
        const results = uses.map((u) => { const c = M.useCertificate({ receipt, use: u.use, revocation: u.rev, keys: ctrl }); return { label: u.label, verdict: c.verdict, reasons: c.reasons, verified: M.verifyUseCertificate(c, receipt, u.rev).ok }; });
        return json(res, 200, {
          subject: receipt.subject, controller: receipt.controller, purposes: receipt.purposes, fields: receipt.fields, expiresAt: receipt.expiresAt,
          receiptVerified: M.verifyConsentReceipt(receipt).ok, results,
          whoBenefits: {
            subject: "holds a signed record of exactly what they consented to — and an honestly-DENIED use-certificate is portable proof of any out-of-scope / expired / post-revocation use (real recourse)",
            controller: "holds signed use-certificates proving each use was within consent — an audit-ready, liability-bounding compliance trail",
          },
        });
      } catch (e) { return json(res, 400, { error: "consent failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/passport") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        // a vendor bundles its compliance proof for "credit-model-v3": fairness + calibration + attribution
        const g = M.lcg(7); const pred = [], grp = []; for (let i = 0; i < 600; i++) { grp.push(i < 300 ? "A" : "B"); pred.push(g() < 0.5 ? 1 : 0); }
        const fairCert = M.fairnessCertificate({ predictions: pred, groupOf: grp, tolerance: 0.1 });
        const g2 = M.lcg(11); const cp = [], cy = []; for (let i = 0; i < 1000; i++) { const q = g2(); cp.push(q); cy.push(g2() < q ? 1 : 0); }
        const calCert = M.calibrationCertificate({ predictions: cp, outcomes: cy });
        const attrCert = M.attributionCertificate({ n: 5, value: (p) => { let v = 0; for (let i = 0; i < 5; i++) if (p[i]) v += (i + 1) * 0.3; return v; }, featureNames: ["age", "income", "debt", "history", "tenure"] });
        const members = [{ kind: "fairness", certificate: fairCert }, { kind: "calibration", certificate: calCert }, { kind: "attribution", certificate: attrCert }];
        const passport = M.trustPassport({ issuer: "VendorAI", subject: "credit-model-v3", members, verify: M.verifyByKind });
        const check = M.verifyTrustPassport(passport, M.verifyByKind);
        // PARTY ② a regulator counter-signs the whole bundle with one receipt
        const receipt = M.issueVerificationReceipt({ cert: passport, certStandard: passport.standard, verify: (c) => M.verifyTrustPassport(c, M.verifyByKind) });
        return json(res, 200, {
          issuer: passport.issuer, subject: passport.subject, n: passport.n,
          members: passport.entries.map((e) => ({ kind: e.kind, standard: e.standard, verified: e.ok })),
          overallVerified: passport.overallVerified, merkleRoot: passport.merkleRoot.slice(0, 16) + "…",
          passportVerified: check.ok, passportReason: check.reason,
          counterSigned: { verifierVerdict: receipt.verifierVerdict, independent: receipt.independent, verifierFingerprint: receipt.verifierFingerprint },
          whoBenefits: {
            issuer: "ships ONE portable artifact proving fairness + calibration + attribution at once — a swapped or tampered member is caught",
            verifier: "verifies the entire compliance posture in a single offline call + sees exactly which member failed, then counter-signs the whole bundle once",
          },
        });
      } catch (e) { return json(res, 400, { error: "passport failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/aibom") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const tamper = !!(body.tamper | 0);
        const kBase = generateKeyPairSync("ed25519"), kFt = generateKeyPairSync("ed25519"), kOpt = generateKeyPairSync("ed25519"), kDep = generateKeyPairSync("ed25519");
        const ah = (s) => createHash("sha256").update(s).digest("hex");
        const aBase = ah("base"), aFt = ah("ft"), aOpt = ah("opt"), aDep = ah("dep");
        const steps = [
          { party: "OpenWeights Inc", role: "base-model", action: "pretrain", artifactHash: aBase, inputs: [], keys: kBase },
          { party: "FinTuneCo", role: "fine-tuner", action: "fine-tune on domain data", artifactHash: aFt, inputs: [aBase], keys: kFt },
          { party: "EdgeOpt", role: "optimizer", action: "int8 quantize", artifactHash: aOpt, inputs: [aFt], keys: kOpt },
          { party: "BankCo", role: "deployer", action: "deploy to prod", artifactHash: aDep, inputs: [aOpt], keys: kDep },
        ];
        const lineage = M.buildAibom({ model: "credit-model-v3", steps });
        if (tamper) { lineage.links[1].artifactHash = ah("swapped-evil-weights"); } // simulate a swapped fine-tune artifact
        const v = M.verifyAibom(lineage);
        const rep = M.aibomReport(lineage);
        return json(res, 200, {
          model: lineage.model, steps: rep.steps.map((s) => ({ seq: s.seq, party: s.party, role: s.role, action: s.action, signer: s.signer })),
          distinctParties: rep.distinctParties, verified: v.ok, reason: v.reason, headHash: lineage.headHash.slice(0, 16) + "…",
          whoBenefits: {
            baseVendor: "gets attribution + liability scoped to only their pretraining layer",
            fineTuner: "proves exactly what they changed and on top of which base",
            deployer: "proves it shipped a known, unbroken lineage — not a swapped artifact",
            regulator: "verifies the whole provenance offline and knows who is accountable for each step",
          },
        });
      } catch (e) { return json(res, 400, { error: "aibom failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/log/submit") {
      const body = await readBody(req) || {};
      try {
        if (!_durable) return json(res, 503, { error: "log unavailable" });
        const entry = String(body.entry || ("claim:" + Date.now()));
        const r = _durable.submit(entry);
        return json(res, 200, { index: r.index, size: r.sth.size, rootHash: r.sth.rootHash.slice(0, 16) + "…", logId: _durable.logId });
      } catch (e) { return json(res, 400, { error: "submit failed: " + e.message.slice(0, 120) }); }
    }
    if ((req.method === "POST" || req.method === "GET") && path === "/log/monitor") {
      try {
        if (!_durable) return json(res, 503, { error: "log unavailable" });
        const sth = _durable.sth(); const cosigs = _logWitnesses.map((w) => w.cosign(sth)).filter((c) => !("refused" in c));
        const q = M.collectQuorum(sth, cosigs, 3);
        return json(res, 200, {
          logId: _durable.logId, size: sth.size, rootHash: sth.rootHash.slice(0, 16) + "…", timestamp: sth.timestamp, sthVerified: M.verifySTH(sth).ok,
          recent: _durable.recent(8), witnesses: { total: _logWitnesses.length, quorum: 3, cosigned: q.count, accepted: q.accepted },
          whoBenefits: {
            submitters: "a permanent public record that does not vanish on a deploy or restart",
            auditors: "re-pull an old tree head months later and it still checks out",
            monitors: "watch a live, growing public log of AI claims",
            everyone: "the log + independent witnesses together make AI claims accountable, not assumed",
          },
        });
      } catch (e) { return json(res, 400, { error: "monitor failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/witness") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const quorum = Math.max(1, (body.quorum | 0) || 3);
        let ts = 0; const log = M.createTransparencyLog({ logId: "melete-ai-claims", now: () => ts++ });
        for (let i = 0; i < 64; i++) log.append("melete-cert:" + i);
        const sth = log.sth();
        const names = ["Anthropic-Witness", "Cloudflare-Witness", "EU-AI-Office", "MLCommons", "AlgoWatch-NGO"];
        const W = names.map((n) => M.createWitness(n));
        const cosigs = W.map((w) => w.cosign(sth)).filter((c) => !("refused" in c));
        const q = M.collectQuorum(sth, cosigs, quorum);
        // a malicious operator shows a DIFFERENT root (size 64) to two of the witnesses → split view
        let tb = 0; const logB = M.createTransparencyLog({ logId: "melete-ai-claims", now: () => tb++ });
        for (let i = 0; i < 64; i++) logB.append(i === 5 ? "HIDDEN-FORK" : "melete-cert:" + i);
        const sthB = logB.sth();
        const cosigsB = [W[3].cosign(sthB), W[4].cosign(sthB)].filter((c) => !("refused" in c));
        const sv = M.detectSplitView([...cosigs.slice(0, 3), ...cosigsB]);
        return json(res, 200, {
          logId: sth.logId, size: sth.size, rootHash: sth.rootHash.slice(0, 16) + "…",
          witnesses: W.map((w, i) => ({ name: names[i], fingerprint: w.fingerprint, cosigned: !("refused" in cosigs[i] || {}) })),
          quorum: { needed: quorum, got: q.count, accepted: q.accepted },
          splitView: { detected: sv.splitView, conflictingRoots: sv.conflicts.length ? sv.conflicts[0].roots.map((r) => r.slice(0, 12) + "…") : [] },
          whoBenefits: {
            operator: "earns trust it could not earn alone — its honesty is checkable, not assumed",
            witnesses: "other vendors / NGOs / clouds provide a public good and hold each other accountable",
            relyingParties: "trust a tree head without trusting any single operator — quorum of independents",
            regulators: "get cryptographic proof there is ONE, and only one, history (split views are exposed)",
          },
        });
      } catch (e) { return json(res, 400, { error: "witness failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/translog") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const mk = (n, rewriteAt) => { let ts = 0; const log = M.createTransparencyLog({ logId: "melete-ai-claims", now: () => ts++ }); for (let i = 0; i < n; i++) log.append(i === rewriteAt ? "melete-cert:REWRITTEN-to-hide-bias" : "melete-cert:fairness:" + i); return log; };
        // an honest public log of 100 AI claims
        const log = mk(100, -1); const newSTH = log.sth();
        // a monitor recorded the size-80 head earlier
        const oldSTH = mk(80, -1).sth();
        // ① inclusion: claim #42 is provably in the log
        const incIdx = 42; const incOk = M.verifyInclusion(log.inclusionProof(incIdx), newSTH).ok;
        // ② consistency: the honest log appended-only from 80 → 100
        const honestConsistent = M.verifyConsistency(log.consistencyProof(80), oldSTH, newSTH).ok;
        // ③ rewrite-of-history: a malicious log rewrote claim #30 → inconsistent with the monitor's old head
        const tampered = mk(100, 30); const tamperedSTH = tampered.sth();
        const rewriteCaught = !M.verifyConsistency(tampered.consistencyProof(80), oldSTH, tamperedSTH).ok;
        // ④ split-view: two size-100 heads, different roots
        const forked = mk(100, 10); const splitViewCaught = forked.sth().rootHash !== newSTH.rootHash;
        return json(res, 200, {
          logId: log.logId, size: newSTH.size, rootHash: newSTH.rootHash.slice(0, 16) + "…", sthSigned: M.verifySTH(newSTH).ok,
          inclusion: { claimIndex: incIdx, provenInLog: incOk },
          consistencyAppendOnly: honestConsistent, rewriteOfHistoryCaught: rewriteCaught, splitViewCaught,
          whoBenefits: {
            submitters: "AI vendors get a public, timestamped, non-repudiable record their claim existed",
            auditors: "anyone verifies inclusion + append-only offline with just tree heads and a proof — no full log",
            monitors: "regulators / journalists / the public watch the log and detect a rewrite or a fork",
            endUsers: "trust a claim only if it is in the public, un-rewritable log",
          },
        });
      } catch (e) { return json(res, 400, { error: "translog failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/pca") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const support = { lo: [0, 0, 0, 0], hi: [1, 1, 1, 1] }, reliable = 0.80;
        const lineage = createHash("sha256").update("credit-v3-aibom").digest("hex");
        const calHash = createHash("sha256").update("credit-v3-calibration").digest("hex");
        const mk = (input, conf, output) => M.proveAnswer({ modelId: "credit-v3", input, support, confidence: conf, reliableConfidence: reliable, output, lineageRoot: lineage, slaPeriod: "2026-06", calibrationCertHash: calHash });
        const answers = [
          { label: "applicant inside the certified envelope, high confidence", p: mk([0.42, 0.6, 0.31, 0.55], 0.94, { decision: "approve" }) },
          { label: "income feature far outside training range (extrapolation)", p: mk([0.42, 1.8, 0.31, 0.55], 0.94, { decision: "approve" }) },
          { label: "in-scope but the model is only 64% sure", p: mk([0.5, 0.5, 0.5, 0.5], 0.64, { decision: "approve" }) },
        ];
        const results = answers.map((a) => ({ label: a.label, verdict: a.p.verdict, confidence: +(a.p.confidence * 100).toFixed(0), witnessDim: a.p.witnessDim, verified: M.verifyAnswer(a.p).ok, bytes: JSON.stringify(a.p).length }));
        return json(res, 200, {
          model: "credit-v3", reliableConfidence: reliable * 100, boundLineage: lineage.slice(0, 16) + "…", boundCalibration: calHash.slice(0, 16) + "…",
          answers: results,
          whoBenefits: {
            provider: "every answer carries its own trust + liability is bounded to the certified scope",
            consumer: "an agent verifies each answer offline in microseconds and safely rejects the out-of-scope ones",
            platform: "audits a tamper-evident stream of signed per-answer verdicts",
            endUser: "is protected from confident-but-unbacked answers — they are flagged, not asserted",
          },
        });
      } catch (e) { return json(res, 400, { error: "pca failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/spotcheck") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      try {
        const N = Math.max(100, Math.min(200000, (body.n | 0) || 100000));
        const tau = 0.90, margin = 0.03, k = Math.max(20, Math.min(2000, (body.k | 0) || 300));
        const g = M.lcg((body.seed | 0) || 7);
        const mk = (trueMean) => { const b = []; for (let i = 0; i < N; i++) b.push(g() < trueMean ? 1 : 0); return b; };
        // an HONEST vendor (true accuracy ~93%, claims >=90%) and a CHEATER (true ~80%, claims >=90%)
        const honest = M.buildPrivateAuditProof({ bits: mk(0.93), tau, margin, k });
        const cheater = M.buildPrivateAuditProof({ bits: mk(0.80), tau, margin, k });
        const trueGap = 0.10, soundness = 1 - Math.pow(1 - (trueGap - margin), k); // approx detection bound at this gap
        return json(res, 200, {
          claim: "model correctness rate >= 90%", datasetSize: N, revealed: k, revealedPct: +(k / N * 100).toFixed(3),
          honest: { verdict: honest.verdict, sampleMean: +(honest.sampleMean * 100).toFixed(1), verified: M.verifyPrivateAuditProof(honest).ok, root: honest.root.slice(0, 16) + "…" },
          cheater: { verdict: cheater.verdict, sampleMean: +(cheater.sampleMean * 100).toFixed(1), verified: M.verifyPrivateAuditProof(cheater).ok, root: cheater.root.slice(0, 16) + "…" },
          soundnessAtThisK: +(soundness * 100).toFixed(2),
          whoBenefits: {
            vendor: "proves the claim without surrendering the model or the full (private) dataset",
            auditor: "audits a sound claim by inspecting only " + k + " of " + N + " records",
            dataSubjects: "only a tiny random sample is ever exposed, not the whole corpus",
            relyingParty: "re-checks the same proof offline before trusting the model",
          },
        });
      } catch (e) { return json(res, 400, { error: "spotcheck failed: " + e.message.slice(0, 120) }); }
    }

    // 🎨 the signed Design System — JSON certificate, or the raw DESIGN.md (fetchable like getdesign.md)
    if (req.method === "GET" && (path === "/design.md" || path === "/design.md/")) {
      try { const c = M.designCertificate(); const md = M.toDesignMarkdown(c); res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "access-control-allow-origin": "*" }); res.end(md); return; }
      catch (e) { return json(res, 500, { error: "design.md failed: " + e.message.slice(0, 120) }); }
    }
    if ((req.method === "GET" || req.method === "POST") && path === "/design") {
      try {
        const c = M.designCertificate();
        return json(res, 200, {
          version: c.manifest.version, philosophy: c.manifest.philosophy, canvas: c.manifest.canvas, accents: c.manifest.accents,
          accentCount: Object.keys(c.manifest.accents).length, demoAccentCount: Object.keys(c.manifest.demoAccents).length,
          contrastFloor: c.contrastFloor, minContrast: +c.minContrast.toFixed(2), minContrastAccent: c.minContrastAccent,
          accessible: c.accessible, paletteSelfConsistent: c.paletteSelfConsistent, verified: M.verifyDesignCertificate(c).ok, sha256: c.payloadHash.slice(0, 16) + "…",
        });
      } catch (e) { return json(res, 500, { error: "design failed: " + e.message.slice(0, 120) }); }
    }

    // 🔌 MCP over HTTP — the same agent-callable trust middleware via a JSON-RPC body (any-transport).
    // Every tools/call is metered + audited into the signed trust ledger (the toll-booth).
    if (req.method === "POST" && path === "/mcp") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const agent = (typeof body.agent === "string" && body.agent) || (req.headers["x-agent"] || "anon");
      try { return json(res, 200, M.handleMcpRequest(body, { ledger: mcpLedger, agent })); } catch (e) { return json(res, 400, { error: "mcp failed: " + e.message.slice(0, 120) }); }
    }
    // 🔌 the toll-booth report: tamper-evident usage tally (billing) + chain-integrity of the audit trail
    if (req.method === "POST" && path === "/mcp/usage") {
      const chain = mcpLedger.verifyChain();
      return json(res, 200, { usage: mcpLedger.usage(), chainIntact: chain.ok, totalReceipts: mcpLedger.receipts.length, publicKeyEmbedded: true });
    }

    if (req.method === "POST" && path === "/discover") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      // VERTICAL live-demo: load the domain-shaped (simulated) objective + space + goal from the gallery
      const vert = (typeof body.vertical === "string" && M.VERTICALS && M.VERTICALS[body.vertical]) ? M.VERTICALS[body.vertical] : null;
      if (vert) { body.space = vert.space.dims; body.objective = vert.objective; body.goal = vert.goal; if (!body.budget) body.budget = 50; }
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      if (space.dims.length > 12) return json(res, 400, { error: "demo limit: ≤12 dimensions" });
      if (typeof body.objective !== "string" || !body.objective.trim()) return json(res, 400, { error: "objective must be a JS expression string in your dimension names" });
      const budget = Math.max(2, Math.min(MAX_BUDGET, (body.budget | 0) || 40));
      let oracle; try { oracle = makeOracle(space, body.objective); oracle(Object.fromEntries(space.dims.map((d) => [d.name, (d.min + d.max) / 2]))); } catch (e) { return json(res, 400, { error: "objective failed to evaluate: " + e.message.slice(0, 120) }); }
      const goal = body.goal === "minimize" ? "minimize" : "maximize";
      const sig = await M.discoverSigned({ space, oracle, budget, seed: (body.seed | 0) || 1, goal, engine: ["portfolio", "bayes", "resonance"].includes(body.engine) ? body.engine : "portfolio" });
      // Discovery Map: for a 2-D problem, sample the learned surface on a grid so the client can show
      // WHERE the brain searched and WHY — the visual "story" of the discovery.
      let surface = null;
      if (space.dims.length === 2) {
        const [dx, dy] = space.dims; const N = 44; const z = [];
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const e = { [dx.name]: dx.min + (dx.max - dx.min) * (i / (N - 1)), [dy.name]: dy.min + (dy.max - dy.min) * (j / (N - 1)) }; let v = oracle(e); if (!Number.isFinite(v)) v = 0; z.push(v); }
        surface = { nx: N, ny: N, xName: dx.name, yName: dy.name, xMin: dx.min, xMax: dx.max, yMin: dy.min, yMax: dy.max, z };
      }
      // per-experiment path WITH the strategy (arm) that proposed each — lets the client colour the
      // discovery by strategy and replay it step by step.
      const path = (sig.result.history || []).map((s) => ({ experiment: s.experiment, value: s.value, n: s.n, arm: (String(s.rationale || "").match(/^\[([^\]]+)\]/) || [, "seed"])[1] }));
      const dims = space.dims.map((d) => ({ name: d.name, min: d.min, max: d.max, type: d.type }));
      // FRONTIER: "should you have run more, or was this the practical best?" — decision support from the
      // run's own diminishing-returns curve (honest; no fabricated $ unless the client supplies a cost).
      const frontierObs = (sig.result.history || []).map((st) => ({ experiment: st.experiment, value: st.value }));
      // RELIABLE MODE (opt-in): a Nelder–Mead memetic polish on the global best — the local exploiter that
      // lifts hard curved valleys (Rosenbrock 59%→100%). Deterministic; the signed trace covers the global
      // search, the polish is a reported refinement on top.
      let best = sig.result.best; let extraEvals = 0; const reliable = !!body.reliable;
      if (reliable) {
        const localBudget = Math.max(20, Math.round(budget * 0.6));
        const pol = M.polish(space, oracle, best.experiment, localBudget, goal); extraEvals = localBudget;
        const improved = goal === "minimize" ? pol.value < best.value : pol.value > best.value;
        if (improved) best = { experiment: pol.experiment, value: pol.value };
        frontierObs.push({ experiment: best.experiment, value: best.value });
      }
      const cost = (typeof body.costPerExperiment === "number" && body.costPerExperiment > 0) ? body.costPerExperiment : null;
      const frontier = M.stoppingAdvice(frontierObs, goal, cost);
      // OPTIMALITY CERTIFICATE: a provable "within X% of the best possible" under a data-estimated Lipschitz bound.
      const certificate = M.certifyOptimality(frontierObs, space, goal);
      const totalEvals = sig.result.evaluations + extraEvals;
      // BASELINE — a raw score means nothing without a reference. Compare Melete's best against (a) where you
      // started and (b) a plain random search on the SAME budget, so the number becomes "X% better than random".
      const startVal = frontierObs.length ? frontierObs[0].value : best.value;
      const rng = M.lcg(987654321);
      let randomBest = goal === "minimize" ? Infinity : -Infinity;
      for (let i = 0; i < totalEvals; i++) { const e = {}; for (const dd of space.dims) { const lo2 = dd.min ?? 0, hi2 = dd.max ?? 1; let v = lo2 + (hi2 - lo2) * rng(); if (dd.type === "int") v = Math.round(v); e[dd.name] = v; } const val = oracle(e); if (Number.isFinite(val) && (goal === "minimize" ? val < randomBest : val > randomBest)) randomBest = val; }
      const baseline = { start: startVal, random: Number.isFinite(randomBest) ? randomBest : null, best: best.value, evaluations: totalEvals };
      // PROOF OF OPTIMIZATION — a portable, offline-verifiable certificate fusing efficiency + optimality + provenance.
      let poopt = null;
      try {
        const traceHash = createHash("sha256").update(JSON.stringify(sig.trace)).digest("hex");
        poopt = M.issueProofOfOptimization({
          subject: typeof body.subject === "string" ? body.subject.slice(0, 80) : "optimization",
          goal, dims: space.dims.length, experimentsUsed: totalEvals, bestValue: best.value,
          certifiedWithinPct: certificate ? certificate.withinPct : null, traceHash, issuedAtMs: Date.now(),
          energyPerExperimentKwh: typeof body.energyPerExperimentKwh === "number" ? body.energyPerExperimentKwh : null,
          carbonKgPerKwh: typeof body.carbonKgPerKwh === "number" ? body.carbonKgPerKwh : null,
        });
      } catch { poopt = null; }
      // SENSITIVITY — per-variable process tolerance + robustness of the optimum (Taguchi-style).
      let sensitivity = null; try { sensitivity = M.analyzeSensitivity(frontierObs, space, goal); } catch { sensitivity = null; }
      // NOISE — measurement-reliability / replication advisor.
      let noise = null; try { noise = M.analyzeNoise(frontierObs, space, goal); } catch { noise = null; }
      // INTERACTIONS — which variables are coupled (cannot be tuned independently).
      let interactions = null; try { interactions = M.analyzeInteractions(frontierObs, space, goal); } catch { interactions = null; }
      let coverage = null; try { coverage = M.coverageScore(frontierObs, space); } catch { coverage = null; }
      // DRIFT — is the improvement caused by your variables, or confounded with a time-trend (a hidden factor)?
      let drift = null; try { drift = M.analyzeDrift(frontierObs, space, goal); } catch { drift = null; }
      // EFFICIENCY η = ∛(G·R·T) — one honest number: real gain × robust optimum × trustworthy (not confounded).
      let efficiency = null; try { efficiency = M.discoveryEfficiency(frontierObs, space, goal); } catch { efficiency = null; }
      // PRESCRIPTION — the plain-language action card: what to DO with this result.
      let prescription = null; try { prescription = M.buildPrescription(frontierObs, space, goal); } catch { prescription = null; }
      // DISCOVERY BRAIN — the improvement-lineage tree (search drawn as converging roots)
      let lineage = null; try { lineage = M.buildAibom(frontierObs, space, goal); } catch { lineage = null; }
      // SLOPPINESS — how many combinations of variables actually matter (effective dimensionality)
      let sloppiness = null; try { sloppiness = M.analyzeSloppiness(frontierObs, space, goal); } catch { sloppiness = null; }
      // CLIFFS — tipping points where a small change collapses the result
      let cliffs = null; try { cliffs = M.analyzeCliffs(frontierObs, space, goal); } catch { cliffs = null; }
      // BREAKTHROUGH RADAR — surprising results (potential breakthroughs / anomalies)
      let surprise = null; try { surprise = M.analyzeSurprise(frontierObs, space, goal); } catch { surprise = null; }
      // RASHOMON — the family of genuinely different recipes that all score near-best
      let rashomon = null; try { rashomon = M.analyzeRashomon(frontierObs, space, goal); } catch { rashomon = null; }
      // SHAPE — the geometry of the optimum (peak / ridge / saddle / plateau / bowl)
      let shape = null; try { shape = M.analyzeShape(frontierObs, space, goal); } catch { shape = null; }
      // ◆ MELETE PRIME — the Red Diamond: the unified brain that composes every lens into one decision
      let prime = null; try { prime = M.meletePrime(frontierObs, space, goal); } catch { prime = null; }
      // 👑 SOVEREIGN — the ecosystem verdict: 4 layers + an Ed25519 PROVENANCE certificate, offline-verifiable
      let sovereign = null; try { sovereign = M.sovereignAnalyze(frontierObs, space, goal, { issuedAtMs: 0 }); } catch { sovereign = null; }
      // ⏪ REPLAY TOKEN — deterministic, signed, offline step-by-step replay of this analysis (audit/compliance)
      let replayToken = null; try { replayToken = M.issueReplayToken(frontierObs, space, goal, { issuedAtMs: 0 }); } catch { replayToken = null; }
      // 🛡 AEGIS — the self-aware engine: the best ROBUST optimum (survives wobble) vs the raw peak
      let aegis = null; try { const a = M.aegisDiscover({ space, oracle, budget: Math.min(60, Math.max(24, totalEvals)), goal, seed: (body.seed | 0) || 1, robustWeight: 0.65 }); aegis = { best: a.best, rawBest: a.rawBest, robustnessOfBest: a.robustnessOfBest, tradedHeight: a.tradedHeight }; } catch { aegis = null; }
      // expose the space + a capped sample of observations so the browser can run the WHAT-IF twin (/predict)
      const obsOut = (frontierObs || []).slice(0, 200).map((o) => ({ experiment: o.experiment, value: o.value }));
      // 📡 AI JOURNALIST — Sci-Fi command-center narration of THIS real run (only real numbers), for the vertical gallery
      let narration = null; if (vert) { try { narration = M.narrate(body.vertical, { best, evaluations: totalEvals, vsStartPct: prescription ? prescription.vsStartPct : undefined, verdictHash: sovereign ? sovereign.certify.payloadHash : undefined, robust: !!(aegis && aegis.robustnessOfBest > 0.5) }); } catch { narration = null; } }
      const vertical = vert ? { key: vert.key, emoji: vert.emoji, title: vert.title, sector: vert.sector, knobsCopy: vert.knobsCopy, scoreCopy: vert.scoreCopy, scoreName: vert.scoreName, scoreUnit: vert.scoreUnit, realWorld: vert.realWorld } : null;
      return json(res, 200, { best, evaluations: totalEvals, converged: sig.result.converged, engine: sig.engine, reliable, goal, dims, space: space.dims, observations: obsOut, armStats: sig.result.armStats ?? null, surface, path, frontier, certificate, baseline, poopt, sensitivity, noise, interactions, coverage, drift, efficiency, prescription, lineage, sloppiness, cliffs, surprise, rashomon, shape, aegis, prime, sovereign, replayToken, vertical, narration, trace: sig.trace, verify: M.verifyTrace(sig.trace).ok });
    }

    if (req.method === "POST" && path === "/next") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      if (space.dims.length > 12) return json(res, 400, { error: "demo limit: ≤12 dimensions" });
      const obs = Array.isArray(body.observations) ? body.observations.filter((o) => o && o.experiment && Number.isFinite(+o.value)).map((o) => ({ experiment: o.experiment, value: +o.value })) : [];
      const goal = body.goal === "minimize" ? "minimize" : "maximize";
      try {
        const next = M.proposeNext(space, obs, goal, (body.seed | 0) || 1);
        const best = obs.length ? obs.reduce((a, b) => (goal === "minimize" ? (b.value < a.value ? b : a) : (b.value > a.value ? b : a))) : null;
        const cost = (typeof body.costPerExperiment === "number" && body.costPerExperiment > 0) ? body.costPerExperiment : null;
        const advice = M.stoppingAdvice(obs, goal, cost);
        const territory = M.assessTerritory(next, obs, space);
        const confidence = M.stopConfidence(obs, goal);
        // ACHIEVABILITY — if the user named a target, is it even reachable with these variables?
        let achievability = null, inverse = null;
        if (typeof body.target === "number" && Number.isFinite(body.target)) {
          try { achievability = M.assessAchievability(obs, space, body.target, goal); } catch { achievability = null; }
          // INVERSE DESIGN — the recipes that hit the target (needs a few measurements first)
          if (obs.length >= 5) { try { inverse = M.inverseDesign(obs, space, body.target); } catch { inverse = null; } }
        }
        return json(res, 200, { next, t: obs.length, best, goal, advice, territory, confidence, achievability, inverse });
      } catch (e) { return json(res, 400, { error: "propose failed: " + e.message.slice(0, 120) }); }
    }

    // INVERSE DESIGN — "find the recipes that hit my target value" (the inverse of optimization)
    if (req.method === "POST" && path === "/inverse") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      if (space.dims.length > 12) return json(res, 400, { error: "demo limit: ≤12 dimensions" });
      if (typeof body.target !== "number" || !Number.isFinite(body.target)) return json(res, 400, { error: "target must be a finite number" });
      const obs = Array.isArray(body.observations) ? body.observations.filter((o) => o && o.experiment && Number.isFinite(+o.value)).map((o) => ({ experiment: o.experiment, value: +o.value })) : [];
      try { return json(res, 200, M.inverseDesign(obs, space, body.target)); }
      catch (e) { return json(res, 400, { error: "inverse failed: " + e.message.slice(0, 120) }); }
    }

    // SAFE OPTIMIZATION — best setting within constraints + safety margins, and a safe next proposal
    if (req.method === "POST" && path === "/safe") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      const cons = Array.isArray(body.constraints) ? body.constraints.filter((c) => c && c.name) : [];
      const obs = Array.isArray(body.observations) ? body.observations.filter((o) => o && o.experiment && Number.isFinite(+o.value)).map((o) => ({ experiment: o.experiment, value: +o.value, metrics: (o.metrics && typeof o.metrics === "object") ? o.metrics : undefined })) : [];
      const goal = body.goal === "minimize" ? "minimize" : "maximize";
      try { const report = M.bestFeasible(obs, goal, cons); const nextSafe = M.proposeNextSafe(space, obs, goal, cons, (body.seed | 0) || 1); return json(res, 200, { ...report, nextSafe }); }
      catch (e) { return json(res, 400, { error: "safe failed: " + e.message.slice(0, 120) }); }
    }

    // WHAT-IF TWIN — "what score would I get at THIS setting?" (predict without running it)
    if (req.method === "POST" && path === "/predict") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      const obs = Array.isArray(body.observations) ? body.observations.filter((o) => o && o.experiment && Number.isFinite(+o.value)).map((o) => ({ experiment: o.experiment, value: +o.value })) : [];
      if (!body.query || typeof body.query !== "object") return json(res, 400, { error: "query must be a {name:value} setting object" });
      try { return json(res, 200, M.predictAt(obs, space, body.query)); }
      catch (e) { return json(res, 400, { error: "predict failed: " + e.message.slice(0, 120) }); }
    }

    // BATCH PLANNER — "give me the k best experiments to run in PARALLEL this round"
    if (req.method === "POST" && path === "/batch") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      if (space.dims.length > 12) return json(res, 400, { error: "demo limit: ≤12 dimensions" });
      const obs = Array.isArray(body.observations) ? body.observations.filter((o) => o && o.experiment && Number.isFinite(+o.value)).map((o) => ({ experiment: o.experiment, value: +o.value })) : [];
      const goal = body.goal === "minimize" ? "minimize" : "maximize";
      const k = Math.max(1, Math.min(16, (body.k | 0) || 4));
      try { return json(res, 200, { batch: M.proposeBatch(space, obs, goal, k, (body.seed | 0) || 1), k, t: obs.length, goal }); }
      catch (e) { return json(res, 400, { error: "batch failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/next-multi") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const space = { dims: Array.isArray(body.space) ? body.space : body.space?.dims };
      if (!space.dims?.length) return json(res, 400, { error: "space must be a non-empty array of {name,type,min,max}" });
      if (space.dims.length > 12) return json(res, 400, { error: "demo limit: ≤12 dimensions" });
      const goals = Array.isArray(body.goals) ? body.goals.map((g) => ({ name: g?.name, goal: g?.goal === "minimize" ? "minimize" : "maximize" })) : null;
      if (!goals || !goals.length) return json(res, 400, { error: "goals must be a non-empty array of {goal:'maximize'|'minimize'} — one per objective" });
      if (goals.length > 8) return json(res, 400, { error: "demo limit: ≤8 objectives" });
      const obs = Array.isArray(body.observations) ? body.observations.filter((o) => o && o.experiment && Array.isArray(o.values) && o.values.length === goals.length && o.values.every((v) => Number.isFinite(+v))).map((o) => ({ experiment: o.experiment, values: o.values.map(Number) })) : [];
      try {
        const next = M.proposeNextMulti(space, obs, goals, (body.seed | 0) || 1);
        const pareto = M.paretoFront(obs, goals);
        return json(res, 200, { next, t: obs.length, goals, paretoFront: pareto, paretoSize: pareto.length });
      } catch (e) { return json(res, 400, { error: "propose failed: " + e.message.slice(0, 120) }); }
    }

    if (req.method === "POST" && path === "/verify") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const v = M.verifyTrace(body.trace || body); return json(res, 200, v);
    }
    if (req.method === "POST" && path === "/poopt/verify") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
      const cert = body.poopt || body; const v = M.verifyProofOfOptimization(cert);
      return json(res, 200, { ...v, subject: cert?.subject ?? null, efficiencyPct: cert?.efficiencyPct ?? null, experimentsSaved: cert?.experimentsSaved ?? null, co2SavedKg: cert?.co2SavedKg ?? null });
    }
    json(res, 404, { error: "no such endpoint", path, endpoints: M.ENDPOINTS });
  } catch (e) { json(res, 500, { error: e.message }); }
});
server.listen(PORT, HOST, () => process.stdout.write(`🌟 Melete discovery-as-a-service on http://${HOST}:${PORT}  (max budget ${MAX_BUDGET})\n`));
