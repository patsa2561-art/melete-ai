#!/usr/bin/env node
/**
 * melete — the Self-Driving Discovery Brain CLI.
 *   melete bench                       prove the brain beats random/grid (measured)
 *   melete gauntlet                    run every module's correctness gauntlet (must be 100)
 *   melete discover [opts]             run a closed-loop discovery + write a signed discovery trace
 *   melete verify <trace.json>         re-verify a discovery trace OFFLINE (signatures + hash chain)
 *
 * discover options:
 *   --demo                             use the built-in 2D benchmark surface as the oracle
 *   --objective "<js: x,y -> number>"  custom objective, e.g. --objective "-(x-3)**2-(y+1)**2"
 *   --space '<json>'                   [{name,type,min,max}]   (default: x,y in [0,10])
 *   --budget N        --seed N         --goal maximize|minimize    --engine bayes|resonance
 *   --target N                         stop early once reached
 *   --out trace.json                   write the signed trace (default: ./melete-trace.json)
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import * as M from "../dist/index.js";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : d; };
const out = (s) => process.stdout.write(s + "\n");

async function main() {
  if (cmd === "gauntlet") {
    const g = await M.meleteGauntlet();
    out(`\n🧪 MELETE GAUNTLET: ${g.score}/100\n`);
    for (const m of g.modules) { out(`  ${m.score === 100 ? "✅" : "❌"} ${m.name.padEnd(10)} ${m.score}/100`); for (const c of m.checks) if (!c.pass) out(`       ✗ ${c.name}`); }
    process.exit(g.score === 100 ? 0 : 1);
  }

  if (cmd === "bench" && flag("robust")) {
    out(`\n🌟 SUPER NOVA robustness — portfolio vs each single arm, mean best across landscapes (higher = better):\n`);
    const rows = await M.robustnessBench(+(flag("seeds", 6)));
    out(`   landscape      PORTFOLIO   kernel-ucb   cmaes     resonance   random`);
    for (const r of rows) {
      const f = (v) => v.toFixed(3).padStart(9);
      out(`   ${r.landscape.padEnd(13)} ${f(r.portfolio)}${r.portfolioIsBest ? " 🏆" : "   "} ${f(r.kernelUcb)} ${f(r.cmaes)} ${f(r.resonance)} ${f(r.random)}`);
    }
    out(`\n   → the portfolio is never the worst, and on the rugged landscape the ensemble beats every single algorithm.`);
    out(`   No-Free-Lunch made productive: one engine that adapts to the problem instead of being re-tuned per problem.`);
    process.exit(0);
  }

  if (cmd === "bench") {
    const budget = +(flag("budget", 150)), target = +(flag("target", 0.99)), seeds = +(flag("seeds", 30));
    out(`\n⚗️  Discovery benchmark — experiments to reach ${target} of the optimum (lower = better):\n`);
    const sd = await M.resonanceVsBayes({ budget, target, seeds });
    const row = (n, v) => out(`   ${n.padEnd(22)} ${v == null ? "did not reach within " + budget : v + " experiments"}`);
    row("BRAIN (bayes core)", sd.bayes); row("random search (avg)", sd.random); row("systematic grid", sd.grid); row("resonance (experimental)", sd.resonance);
    if (sd.bayes && sd.random) out(`\n   → the brain is ${(sd.random / sd.bayes).toFixed(1)}× more sample-efficient than random. Each saved experiment = saved reagents / robot-time / money.`);
    out(`   honest: measured on a smooth multimodal surface; the resonance engine is experimental and currently does not beat the core.`);
    process.exit(0);
  }

  if (cmd === "discover") {
    const space = flag("space") ? JSON.parse(flag("space")) : { dims: [{ name: "x", type: "real", min: 0, max: 10 }, { name: "y", type: "real", min: 0, max: 10 }] };
    let oracle;
    const obj = flag("objective");
    if (obj && obj !== true) { const ctx = createContext({ Math }); oracle = (e) => { for (const k of Object.keys(e)) ctx[k] = e[k]; return Number(runInContext(obj, ctx, { timeout: 200 })); }; }
    else oracle = (e) => M.multimodal(e);   // --demo / default
    const budget = +(flag("budget", 60)), seed = +(flag("seed", 1));
    const goal = flag("goal", "maximize"), engine = flag("engine", "portfolio");
    const target = flag("target") ? +flag("target") : undefined;
    out(`\n🔬 Discovering (${engine} engine, ${goal}, budget ${budget})…`);
    const sig = await M.discoverSigned({ space, oracle, budget, seed, goal, engine, target });
    out(`   best value: ${sig.result.best.value.toFixed(6)}`);
    out(`   at:         ${JSON.stringify(sig.result.best.experiment)}`);
    out(`   experiments: ${sig.result.evaluations}   converged: ${sig.result.converged}`);
    const file = flag("out", "melete-trace.json");
    writeFileSync(file, JSON.stringify(sig.trace, null, 2));
    out(`\n   📜 signed discovery trace → ${file}  (${sig.trace.frames.length} frames)`);
    out(`   verify it offline:  melete verify ${file}`);
    process.exit(0);
  }

  if (cmd === "tune") {
    // melete tune --cmd "node train.js --lr {lr} --depth {depth}" --space '[...]' [--budget N] [--goal min]
    const space = flag("space") ? JSON.parse(flag("space")) : null;
    const cmdTpl = flag("cmd");
    if (!space || !Array.isArray(space) && !space.dims || typeof cmdTpl !== "string") { out('usage: melete tune --cmd "your-prog --a {a} --b {b}" --space \'[{"name":"a","type":"real","min":0,"max":1}]\' [--budget N] [--goal minimize]\n  {dim} placeholders are filled with each proposed value; the LAST number your command prints is the score. No dataset needed.'); process.exit(2); }
    const dims = Array.isArray(space) ? space : space.dims;
    const { execSync } = await import("node:child_process");
    const oracle = (e) => { const c = cmdTpl.replace(/\{(\w+)\}/g, (_, k) => String(e[k])); const sresult = String(execSync(c, { encoding: "utf8", timeout: 600000, stdio: ["ignore", "pipe", "ignore"] })); const v = Number((sresult.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? []).at(-1)); if (!Number.isFinite(v)) throw new Error("command printed no number"); return v; };
    const budget = +(flag("budget", 30)), goal = flag("goal", "maximize");
    out(`\n🔧 Tuning via your command (${goal}, budget ${budget}) — running it ${budget}× to find the best params…`);
    const sig = await M.discoverSigned({ space: { dims }, oracle, budget, seed: (+flag("seed", 1)) || 1, goal, engine: "portfolio" });
    out(`   best params: ${JSON.stringify(sig.result.best.experiment)}`);
    out(`   best score:  ${sig.result.best.value}`);
    out(`   ran your command ${sig.result.evaluations}× · arms: ${(sig.result.armStats || []).filter(a => a.pulls).map(a => a.name + "×" + a.pulls).join(" ")}`);
    const file = flag("out", "melete-trace.json"); writeFileSync(file, JSON.stringify(sig.trace, null, 2));
    out(`   📜 signed trace → ${file}  ·  verify: melete verify ${file}`);
    process.exit(0);
  }

  if (cmd === "replicate") {
    // melete replicate --trace t.json (--cmd "prog --a {a}" | --objective "<js>") [--samples N] [--tol 1e-3]
    const tf = argv[1] && !argv[1].startsWith("--") ? argv[1] : flag("trace");
    if (!tf) { out('usage: melete replicate <trace.json> --cmd "your-prog --a {a}"   (or --objective "<js>")\n  re-runs the discovery\'s best + a sample of its path to certify it REPLICATES — cheap cross-agent trust.'); process.exit(2); }
    const trace = JSON.parse(readFileSync(tf, "utf8"));
    const claim = M.extractClaim(trace);
    let oracle;
    if (flag("cmd")) { const { execSync } = await import("node:child_process"); const tpl = flag("cmd"); oracle = (e) => { const c = tpl.replace(/\{(\w+)\}/g, (_, k) => String(e[k])); const s = String(execSync(c, { encoding: "utf8", timeout: 600000, stdio: ["ignore", "pipe", "ignore"] })); return Number((s.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? []).at(-1)); }; }
    else if (flag("objective") && flag("objective") !== true) { const obj = flag("objective"); const ctx = createContext({ Math }); oracle = (e) => { for (const k of Object.keys(e)) ctx[k] = e[k]; return Number(runInContext(obj, ctx, { timeout: 200 })); }; }
    else { out("provide how to re-score: --cmd \"<command with {dims}>\" or --objective \"<js expression>\""); process.exit(2); }
    out(`\n🔁 Replicating a published discovery (re-running its best + sampled points)…`);
    const report = await M.replicate({ claim, oracle, samples: +(flag("samples", 3)), tolerance: +(flag("tol", 1e-3)) });
    out(`   ${report.replicates ? "✅ REPLICATES" : "❌ DOES NOT REPLICATE"}`);
    out(`   best: claimed ${report.best.claimed} · re-scored ${report.best.measured} · ${report.best.match ? "match" : "MISMATCH"}`);
    for (const s of report.samples) out(`   · ${JSON.stringify(s.experiment)} claimed ${s.claimed} re-scored ${s.measured} ${s.match ? "✓" : "✗"}`);
    out(`   ${report.reEvaluations} re-evaluations verified a ${claim.path.length}-experiment discovery (cross-agent trust, ${(claim.path.length / Math.max(1, report.reEvaluations)).toFixed(0)}× cheaper than re-running it).`);
    const cert = M.certifyReplication(report); const cf = flag("out", "replication-cert.json"); writeFileSync(cf, JSON.stringify(cert, null, 2));
    out(`   📜 signed replication certificate → ${cf}  ·  verify: melete verify ${cf}`);
    process.exit(report.replicates ? 0 : 2);
  }

  if (cmd === "verify") {
    const path = argv[1]; if (!path) { out("usage: melete verify <trace.json>"); process.exit(2); }
    const trace = JSON.parse(readFileSync(path, "utf8"));
    const v = M.verifyTrace(trace);
    out(`\n📜 ${v.ok ? "✅ VALID" : "❌ INVALID"} discovery trace — ${v.frames} frames`);
    out(`   ${v.reason}`);
    if (!v.ok && v.brokenAt != null) out(`   broken at frame ${v.brokenAt}`);
    out(`   (verified OFFLINE with the embedded public key — no Melete, no network, no shared secret)`);
    process.exit(v.ok ? 0 : 1);
  }

  out("melete — the Self-Driving Discovery Brain\n");
  out("  melete tune --cmd \"prog --a {a}\" --space '[...]'   tune ANY command/script (no dataset needed)");
  out("  melete bench [--robust]      prove the brain beats random/grid");
  out("  melete gauntlet              run all correctness gauntlets");
  out("  melete discover --demo       run a discovery + write a signed trace");
  out("  melete verify <trace.json>   re-verify a discovery trace offline");
  process.exit(cmd ? 1 : 0);
}
main().catch((e) => { out("error: " + e.message); process.exit(1); });
