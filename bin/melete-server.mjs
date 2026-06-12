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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as M from "../dist/index.js";
import { createHash } from "node:crypto";

const VERSION = (() => { try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).version; } catch { return "0.2.0"; } })();
const PORT = +(process.env.PORT || 8790); const HOST = process.env.HOST || "127.0.0.1";
const MAX_BUDGET = +(process.env.MELETE_MAX_BUDGET || 120);

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
    if (req.method === "GET" && path === "/docs") { const html = M.docsPage(VERSION); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(html); }
    if (req.method === "GET" && path === "/health") return json(res, 200, { ok: true, version: VERSION, service: "melete" });

    if (req.method === "POST" && path === "/discover") {
      const body = await readBody(req); if (!body) return json(res, 400, { error: "invalid JSON" });
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
      return json(res, 200, { best, evaluations: totalEvals, converged: sig.result.converged, engine: sig.engine, reliable, goal, dims, armStats: sig.result.armStats ?? null, surface, path, frontier, certificate, baseline, poopt, sensitivity, noise, interactions, coverage, drift, trace: sig.trace, verify: M.verifyTrace(sig.trace).ok });
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
        return json(res, 200, { next, t: obs.length, best, goal, advice, territory, confidence });
      } catch (e) { return json(res, 400, { error: "propose failed: " + e.message.slice(0, 120) }); }
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
