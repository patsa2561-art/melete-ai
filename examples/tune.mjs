// Connect Melete to the real process above — NO dataset, NO formula. Melete proposes params, runs the
// script, reads the score, and converges to the best params with a signed trace.
import { discoverSigned, cliOracle, verifyTrace } from "melete-ai";
const space = { dims: [
  { name: "lr",    type: "real", min: 0.001, max: 0.1 },
  { name: "depth", type: "int",  min: 1,     max: 12  },
]};
const oracle = cliOracle(e => `node examples/train.mjs --lr ${e.lr} --depth ${e.depth}`);  // runs YOUR process
const { result, trace } = await discoverSigned({ space, oracle, budget: 25, goal: "maximize", engine: "portfolio" });
console.log("best params:", result.best.experiment, "→ score", result.best.value.toFixed(5));
console.log("experiments run:", result.evaluations, "· trace verified:", verifyTrace(trace).ok);
