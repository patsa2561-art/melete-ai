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
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as M from "../dist/index.js";
import { createHash } from "node:crypto";

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
      let lineage = null; try { lineage = M.buildLineage(frontierObs, space, goal); } catch { lineage = null; }
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
