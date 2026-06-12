/**
 * BATCH PLANNER — the physical world runs experiments in PARALLEL. A lab has eight reactors, a fab has eight
 * print heads, a greenhouse has eight plots, a cloud sweep has eight GPUs. A one-at-a-time optimizer wastes
 * them: it proposes a single next experiment and makes the other seven sit idle until the first comes back.
 * BATCH PLANNER proposes the k MOST VALUABLE experiments to run together — and, crucially, makes them
 * DIVERSE, so you aren't burning all eight machines on eight near-identical settings.
 *
 * It scores every candidate by optimistic potential (a Lipschitz upper bound from your data), then picks
 * greedily with a diversity penalty: once a setting is chosen, everything near it loses appeal, so the next
 * pick jumps to a different promising region. The result is a spread of high-potential experiments that
 * explore complementary parts of the space at once — same total experiments, k× fewer rounds of waiting.
 *
 * Honest by construction (DIAKRISIS): the value is wall-clock (you finish in fewer ROUNDS because the
 * machines run in parallel), not fewer total experiments; a purely sequential optimizer can use the
 * information between each run, which a batch cannot. BATCH PLANNER is for when you HAVE parallel capacity.
 * The gauntlet proves the batch is genuinely diverse — it covers separate optima instead of clustering.
 */
import { type Space, type Experiment, lcg } from "./space.js";
import { type Observation, type Goal } from "./engine.js";

const HB = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
const hal = (k: number, b: number) => { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

const DIV_L = 0.28;   // diversity length-scale: picks closer than this strongly suppress each other

/** Propose k diverse, high-potential experiments to run in PARALLEL this round. */
export function proposeBatch(space: Space, obs: ReadonlyArray<Observation>, goal: Goal, k = 4, seed = 1): Experiment[] {
  const dims = space?.dims ?? []; const D = dims.length;
  k = Math.max(1, Math.min(64, Math.floor(k)));
  if (D === 0) return [];
  const sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const toE = (v: number[]): Experiment => { const e: Experiment = {}; dims.forEach((d, i) => { let x = lo(i) + v[i] * (hi(i) - lo(i)); if (d.type === "int") x = Math.round(x); e[d.name] = x; }); return e; };
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const rnd = lcg(((seed >>> 0) || 1) + hist.length * 131 + 7);

  // candidate pool: Halton space-filling + a cloud around the current best
  const cands: number[][] = [];
  for (let c = 0; c < 1200; c++) { const p: number[] = []; for (let d = 0; d < D; d++) p.push(hal(c * 3 + (seed % 7) + 1, HB[d % HB.length])); cands.push(p); }
  if (hist.length) {
    const best = hist.reduce((a, b) => (sgn * b.value > sgn * a.value ? b : a));
    const bn = toN(best.experiment);
    for (let c = 0; c < 200; c++) cands.push(bn.map((x) => Math.max(0, Math.min(1, x + (rnd() - 0.5) * 0.25))));
  }

  // optimistic value of each candidate: Lipschitz upper bound min_i(v_i + L·dist), normalised to [0,1]
  const npts = hist.map((o) => toN(o.experiment)); const vals = hist.map((o) => sgn * o.value);
  let ub: number[];
  if (npts.length >= 2) {
    let L = 0; for (let i = 0; i < npts.length; i++) for (let j = i + 1; j < npts.length; j++) { const dx = dst(npts[i], npts[j]); if (dx > 1e-9) L = Math.max(L, Math.abs(vals[i] - vals[j]) / dx); }
    L = (L > 0 ? L : 1e-6) * 1.2;
    ub = cands.map((c) => { let b = Infinity; for (let i = 0; i < npts.length; i++) { const v = vals[i] + L * dst(c, npts[i]); if (v < b) b = v; } return b; });
  } else {
    ub = cands.map((c) => { let nd = Infinity; for (const p of npts) nd = Math.min(nd, dst(c, p)); return npts.length ? nd : 0; });  // cold start: spread out
  }
  const umin = Math.min(...ub), umax = Math.max(...ub), urange = Math.max(1e-9, umax - umin);
  const ubN = ub.map((u) => (u - umin) / urange);

  // greedy pick with diversity penalty: score = value − strongest proximity to an already-picked point
  const picked: number[][] = [];
  for (let step = 0; step < k; step++) {
    let bestC = -1, bestScore = -Infinity;
    for (let c = 0; c < cands.length; c++) {
      let pen = 0; for (const s of picked) { const p = Math.exp(-(dst(cands[c], s) ** 2) / (2 * DIV_L * DIV_L)); if (p > pen) pen = p; }
      const score = ubN[c] - pen;
      if (score > bestScore) { bestScore = score; bestC = c; }
    }
    if (bestC < 0) break;
    picked.push(cands[bestC]);
  }
  return picked.map(toE);
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function batchGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  const toN = (e: Experiment) => [e.x ?? 0, e.y ?? 0];
  const pair = (b: Experiment[]) => { let m = Infinity; for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) m = Math.min(m, dst(toN(b[i]), toN(b[j]))); return m; };

  // a TWO-peak landscape: peaks at (0.2,0.2) and (0.8,0.8) — a good batch must cover BOTH, not pile on one
  const pA = [0.2, 0.2], pB = [0.8, 0.8];
  const f = (x: number, y: number) => Math.max(Math.exp(-(((x - 0.2) ** 2) + ((y - 0.2) ** 2)) / 0.04), 0.95 * Math.exp(-(((x - 0.8) ** 2) + ((y - 0.8) ** 2)) / 0.04));
  const rnd = lcg(19); const obs: Observation[] = [];
  for (let i = 0; i < 40; i++) { const x = rnd(), y = rnd(); obs.push({ experiment: { x, y }, value: f(x, y) }); }

  const batch = proposeBatch(space, obs, "maximize", 4, 1);
  const returnsK = batch.length === 4;
  const distinct = pair(batch) > 0.1;
  const wellSpread = pair(batch) > 0.25;
  const nearA = batch.some((e) => dst(toN(e), pA) < 0.28);
  const nearB = batch.some((e) => dst(toN(e), pB) < 0.28);
  const coversBoth = nearA && nearB;

  // SINGLE-IS-GREEDY: k=1 returns exactly the first point of the batch (the top-value pick)
  const single = proposeBatch(space, obs, "maximize", 1, 1);
  const singleGreedy = single.length === 1 && dst(toN(single[0]), toN(batch[0])) < 1e-9;

  const det = JSON.stringify(proposeBatch(space, obs, "maximize", 4, 1)) === JSON.stringify(proposeBatch(space, obs, "maximize", 4, 1));
  const total = (() => { try { proposeBatch(space, [], "maximize", 5); proposeBatch({ dims: [] }, obs, "maximize", 3); proposeBatch(space, obs, "maximize", 0); return true; } catch { return false; } })();

  const checks = [
    { name: "RETURNS-K", pass: returnsK, detail: `asked 4 → got ${batch.length}` },
    { name: "ALL-DISTINCT", pass: distinct, detail: `min pairwise distance ${pair(batch).toFixed(2)} > 0.1` },
    { name: "WELL-SPREAD", pass: wellSpread, detail: `not clustered — min pairwise ${pair(batch).toFixed(2)} > 0.25` },
    { name: "COVERS-BOTH-PEAKS", pass: coversBoth, detail: `batch hits peak A (${nearA}) AND peak B (${nearB}) — diverse, not piled on one` },
    { name: "SINGLE-IS-GREEDY", pass: singleGreedy, detail: `k=1 == the batch's top pick` },
    { name: "DETERMINISTIC", pass: det, detail: "same inputs → same batch" },
    { name: "TOTAL", pass: total, detail: "empty obs / no dims / k=0 never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
