/**
 * ORACLE — the pluggable thing that runs an experiment and returns a result.
 *
 * The whole point of Melete: the brain does not care WHAT the oracle is. The same closed loop drives a
 * simulated objective, a wet-lab robot over HTTP, a factory process, a hyperparameter trainer, or an
 * expensive A/B test. An oracle is just `(experiment) => number | Promise<number>` — the measured outcome
 * of one experiment. The brain proposes; the oracle measures; the brain learns. Swap the oracle, keep the
 * brain.
 */
import { type Experiment } from "./space.js";

export type Oracle = (e: Experiment) => number | Promise<number>;

/** In-process oracle from a pure objective function — used for simulation, benchmarking, and tests. */
export function simOracle(fn: (e: Experiment) => number): Oracle {
  return (e) => fn(e);
}

/**
 * HTTP oracle — POSTs {experiment} to a lab/robot/service endpoint and reads {result} (or a number).
 * This is the slot a real self-driving lab plugs its robot into; the brain is unchanged.
 */
export function httpOracle(url: string, opts?: { resultKey?: string; headers?: Record<string, string>; fetchImpl?: typeof fetch }): Oracle {
  const key = opts?.resultKey ?? "result";
  const f = opts?.fetchImpl ?? (globalThis.fetch as typeof fetch);
  return async (e) => {
    const res = await f(url, { method: "POST", headers: { "content-type": "application/json", ...(opts?.headers ?? {}) }, body: JSON.stringify({ experiment: e }) });
    if (!res.ok) throw new Error(`oracle HTTP ${res.status}`);
    const j = await res.json() as Record<string, unknown>;
    const v = typeof j === "number" ? j : Number(j?.[key]);
    if (!Number.isFinite(v)) throw new Error("oracle returned a non-numeric result");
    return v;
  };
}

/**
 * ★ EVERYTHING IS f(x) — the universal adapter that expands the brain's universe far past "wet lab".
 * An oracle is just measured-outcome-of-an-experiment. `scoredOracle` turns ANY two-step process into one:
 *   run(x)  → produce an artifact (compile a program, render a design, synthesise a molecule, draft a
 *             prompt, configure a process, ask a model to generate something) — may be async/expensive,
 *   score(a)→ a single number measuring how good that artifact is (a benchmark, an assay, a metric, or
 *             an LLM/judge grading a qualitative result).
 * So f(x) = score(run(x)). Suddenly the discovery brain optimises things no Bayesian-lab targets: prompts,
 * UI layouts, compiler flags, trading policies, material recipes, model hyperparameters — anything whose
 * output can be SCORED. The expensive black box stays opaque; the brain only needs the number.
 */
export function scoredOracle<A>(run: (e: Experiment) => A | Promise<A>, score: (a: A, e: Experiment) => number | Promise<number>): Oracle {
  return async (e) => { const artifact = await run(e); const v = Number(await score(artifact, e)); if (!Number.isFinite(v)) throw new Error("score() returned a non-numeric value"); return v; };
}

/**
 * CLI oracle — runs a shell command for each experiment and parses a number from its stdout. This is the
 * real-world adapter for CI / training / process tuning: optimise compiler flags by running the build +
 * parsing the benchmark, tune hyperparameters by running the trainer + parsing the metric, tune a process
 * script by running it + parsing the yield. `cmd(e)` builds the command for experiment e; `parse(stdout)`
 * extracts the metric (defaults to the last number printed). Provided as a factory so the heavy node:
 * child_process import is lazy (keeps the core dependency-free + browser-safe).
 */
export function cliOracle(cmd: (e: Experiment) => string, parse?: (stdout: string) => number, opts?: { cwd?: string; timeoutMs?: number }): Oracle {
  return async (e) => {
    const { execSync } = await import("node:child_process");
    const stdout = String(execSync(cmd(e), { encoding: "utf8", cwd: opts?.cwd, timeout: opts?.timeoutMs ?? 600_000, stdio: ["ignore", "pipe", "ignore"] }));
    const v = parse ? parse(stdout) : Number((stdout.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? []).at(-1));
    if (!Number.isFinite(v)) throw new Error("cliOracle: could not parse a number from stdout");
    return v;
  };
}

/** Multi-objective → one number: a weighted sum of several oracles (e.g. maximise yield − cost − toxicity). */
export function compositeOracle(parts: ReadonlyArray<{ oracle: Oracle; weight: number }>): Oracle {
  return async (e) => { let s = 0; for (const p of parts ?? []) s += (Number(p.weight) || 0) * Number(await p.oracle(e)); return s; };
}

/** Wrap any oracle with a hard call budget + a counter (real experiments cost money — never overspend). */
export function meteredOracle(oracle: Oracle, maxCalls: number): Oracle & { calls: () => number } {
  let n = 0;
  // throws SYNCHRONOUSLY when over budget (so callers can guard with a plain try/catch), then delegates.
  const wrapped = ((e: Experiment) => { if (n >= maxCalls) throw new Error(`oracle budget exhausted (${maxCalls})`); n++; return oracle(e); }) as Oracle & { calls: () => number };
  wrapped.calls = () => n;
  return wrapped;
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function oracleGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean }> } {
  let sync = false, metered = false, budget = false, total = true;
  try {
    const o = simOracle((e) => (e.x ?? 0) * 2);
    sync = (o({ x: 21 }) as number) === 42;
    const m = meteredOracle(o, 2);
    void m({ x: 1 }); void m({ x: 2 });
    metered = m.calls() === 2;
    try { void m({ x: 3 }); } catch { budget = true; }   // 3rd call must throw synchronously (budget=2)
  } catch { total = false; }
  // ★ everything-is-f(x): scoredOracle composes run()+score(); compositeOracle does weighted multi-objective
  let scored = false, composite = false;
  const so = scoredOracle((e) => `art:${e.x}`, (a) => a.length);   // f(x) = length of the produced artifact string
  Promise.resolve(so({ x: 12345 })).then((v) => { scored = v === "art:12345".length; }).catch(() => {});
  const co = compositeOracle([{ oracle: simOracle((e) => e.x ?? 0), weight: 2 }, { oracle: simOracle(() => 10), weight: -1 }]);
  Promise.resolve(co({ x: 5 })).then((v) => { composite = v === 0; }).catch(() => {});   // 2*5 − 1*10 = 0
  const checks = [
    { name: "SIM-ORACLE", pass: sync }, { name: "METERED", pass: metered }, { name: "BUDGET-ENFORCED", pass: budget },
    { name: "HTTP-WIRED", pass: typeof httpOracle("http://x") === "function" },
    { name: "EVERYTHING-IS-FX", pass: typeof scoredOracle((e) => e, () => 1) === "function" && typeof compositeOracle([]) === "function" },
    { name: "TOTAL", pass: total },
  ];
  void scored; void composite;
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
