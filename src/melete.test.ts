import { describe, it, expect } from "vitest";
import {
  spaceGauntlet, oracleGauntlet, traceGauntlet, meleteGauntlet,
  lcg, gridCandidates, randomCandidates, localCandidates, clampExperiment,
  simOracle, meteredOracle, scoredOracle, compositeOracle,
  discover, engineGauntlet,
  resonanceDiscover, resonanceGauntlet, resonanceVsBayes,
  armsGauntlet, defaultArms,
  portfolioDiscover, portfolioGauntlet,
  Tracer, verifyTrace,
  multimodal, rugged, benchSpace, benchmark, benchGauntlet, robustnessBench,
  discoverSigned,
} from "./index.js";

describe("gauntlets (every module = 100)", () => {
  it("space", () => expect(spaceGauntlet().score).toBe(100));
  it("oracle", () => expect(oracleGauntlet().score).toBe(100));
  it("trace", () => expect(traceGauntlet().score).toBe(100));
  it("engine", async () => expect((await engineGauntlet()).score).toBe(100));
  it("resonance", async () => expect((await resonanceGauntlet()).score).toBe(100));
  it("bench", async () => expect((await benchGauntlet()).score).toBe(100));
  it("arms", () => expect(armsGauntlet().score).toBe(100));
  it("portfolio", async () => expect((await portfolioGauntlet()).score).toBe(100));
  it("aggregate meleteGauntlet = 100 over all 9 modules", async () => {
    const g = await meleteGauntlet();
    expect(g.score).toBe(100);
    expect(g.modules.map((m) => m.name).sort()).toEqual(["arms", "bench", "cortex", "engine", "oracle", "portfolio", "resonance", "space", "trace"]);
  });
});

describe("portfolio (SUPER NOVA — context-adaptive ensemble)", () => {
  it("converges on a smooth surface", async () => {
    const r = await portfolioDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 80, seed: 7, goal: "maximize", target: 0.99 });
    expect(r.best.value).toBeGreaterThanOrEqual(0.99);
  });
  it("default portfolio holds 4 arms and allocates across them", async () => {
    expect(defaultArms().map((a) => a.name).sort()).toEqual(["cmaes", "kernel-ucb", "random", "resonance"]);
    const r = await portfolioDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 40, seed: 1, goal: "maximize" });
    expect(r.armStats.reduce((s, a) => s + a.pulls, 0)).toBeGreaterThan(0);
  });
  it("is deterministic (same seed → same result + same allocation)", async () => {
    const a = await portfolioDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 50, seed: 4, goal: "maximize" });
    const b = await portfolioDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 50, seed: 4, goal: "maximize" });
    expect(JSON.stringify(a.best)).toBe(JSON.stringify(b.best));
    expect(JSON.stringify(a.armStats)).toBe(JSON.stringify(b.armStats));
  });
  it("ROBUSTNESS: on the rugged landscape the ensemble beats every single arm (No-Free-Lunch payoff)", async () => {
    const rows = await robustnessBench(3);
    const r = rows.find((x) => x.landscape === "rugged-2D")!;
    expect(r.portfolio).toBeGreaterThan(r.kernelUcb);
    expect(r.portfolio).toBeGreaterThan(r.cmaes);
    expect(r.portfolio).toBeGreaterThan(r.random);
    // and it is never the worst on any landscape
    expect(rows.every((x) => !x.portfolioIsWorst)).toBe(true);
  });
});

describe("space", () => {
  it("seeded candidate generation is reproducible", () => {
    expect(JSON.stringify(randomCandidates(benchSpace, 5, lcg(3)))).toBe(JSON.stringify(randomCandidates(benchSpace, 5, lcg(3))));
  });
  it("clamps + respects int dims", () => {
    const s = { dims: [{ name: "k", type: "int" as const, min: 1, max: 5 }] };
    expect(clampExperiment(s, { k: 99 }).k).toBe(5);
    expect(Number.isInteger(randomCandidates(s, 10, lcg(1))[0].k)).toBe(true);
  });
  it("grid covers the corners", () => expect(gridCandidates(benchSpace, 3).length).toBe(9));
  it("local candidates stay in bounds", () => {
    expect(localCandidates(benchSpace, { x: 5, y: 5 }, 20, 0.1, lcg(2)).every((e) => e.x >= 0 && e.x <= 10)).toBe(true);
  });
});

describe("oracle — everything is f(x)", () => {
  it("sim oracle", () => expect(simOracle((e) => (e.x ?? 0) + 1)({ x: 41 })).toBe(42));
  it("metered oracle throws synchronously over budget", () => {
    const m = meteredOracle(simOracle(() => 1), 1); m({ x: 0 });
    expect(() => m({ x: 0 })).toThrow();
  });
  it("scoredOracle composes run + score (f(x)=score(run(x)))", async () => {
    const o = scoredOracle((e) => ({ art: `v${e.x}` }), (a) => a.art.length);
    expect(await o({ x: 100 })).toBe("v100".length);
  });
  it("compositeOracle does weighted multi-objective", async () => {
    const o = compositeOracle([{ oracle: simOracle((e) => e.x ?? 0), weight: 2 }, { oracle: simOracle(() => 10), weight: -1 }]);
    expect(await o({ x: 5 })).toBe(0);
  });
});

describe("engine (the brain)", () => {
  it("finds a hidden 2D optimum within budget", async () => {
    const r = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 80, seed: 7, goal: "maximize" });
    expect(r.best.value).toBeGreaterThan(0.95);
  });
  it("is sample-efficient: beats random search to 0.99", async () => {
    const r = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 150, seed: 7, goal: "maximize", target: 0.99 });
    expect(r.best.value).toBeGreaterThanOrEqual(0.99);
    expect(r.evaluations).toBeLessThan(70);   // random needs ~95 on average and often misses
  });
  it("deterministic for a fixed seed", async () => {
    const a = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 50, seed: 5, goal: "maximize" });
    const b = await discover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 50, seed: 5, goal: "maximize" });
    expect(JSON.stringify(a.best)).toBe(JSON.stringify(b.best));
  });
  it("minimizes too", async () => {
    const r = await discover({ space: benchSpace, oracle: (e) => -multimodal(e), budget: 80, seed: 7, goal: "minimize" });
    expect(r.best.value).toBeLessThan(-0.95);
  });
});

describe("benchmark proof (measured, not claimed)", () => {
  it("brain reaches the optimum in far fewer experiments than random", async () => {
    const r = await benchmark({ budget: 150, target: 0.99, seeds: 30 });
    expect(r.brain).not.toBeNull();
    expect(r.brain!).toBeLessThan(r.random);   // the headline
  });
});

describe("resonance (experimental, honest)", () => {
  it("runs deterministically", async () => {
    const a = await resonanceDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 40, seed: 7, goal: "maximize" });
    const b = await resonanceDiscover({ space: benchSpace, oracle: (e) => multimodal(e), budget: 40, seed: 7, goal: "maximize" });
    expect(JSON.stringify(a.best)).toBe(JSON.stringify(b.best));
  });
  it("the head-to-head reports the bayes core as the current winner (honest)", async () => {
    const sd = await resonanceVsBayes({ budget: 150, target: 0.99, seeds: 10 });
    expect(sd.winner).toBe("bayes");
  });
});

describe("discovery trace (the moat) — signed + offline-verifiable", () => {
  it("a real trace verifies", () => {
    const t = new Tracer(); t.record("hypothesis", { x: 7 }); t.record("observation", { value: 1 });
    expect(verifyTrace(t.export()).ok).toBe(true);
  });
  it("tampering with any frame is caught", () => {
    const t = new Tracer(); t.record("observation", { value: 0.5 });
    const trace = t.export(); (trace.frames[1].payload as Record<string, number>).value = 9.9;
    expect(verifyTrace(trace).ok).toBe(false);
  });
  it("a forged public key fails verification", () => {
    const t = new Tracer(); t.record("observation", { value: 1 });
    const trace = t.export(); trace.publicKeyPem = new Tracer().publicKeyPem;
    expect(verifyTrace(trace).ok).toBe(false);
  });
});

describe("discoverSigned (end-to-end)", () => {
  it("produces a discovery AND a verifiable trace of how it was made", async () => {
    const sig = await discoverSigned({ space: benchSpace, oracle: (e) => multimodal(e), budget: 40, seed: 3, goal: "maximize", engine: "bayes" });
    expect(sig.result.best.value).toBeGreaterThan(0.9);
    expect(sig.trace.frames.length).toBeGreaterThan(5);
    expect(verifyTrace(sig.trace).ok).toBe(true);
  });
});
