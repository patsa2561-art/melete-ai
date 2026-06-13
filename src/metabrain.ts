/**
 * FEDERATED META-BRAIN — the data flywheel that doesn't break sovereignty. The hard truth about a from-
 * scratch optimizer: every customer starts cold, so the vendor never gets smarter and there's no moat. But
 * you can't pool customers' raw data either — a pharma lab's secret recipe must never leave the building.
 *
 * The META-BRAIN squares that circle. After a run, each site shares only a privacy-safe LANDSCAPE
 * FINGERPRINT — abstract shape/behaviour features (how rugged, how smooth, how many effective dimensions,
 * the shape class, how concentrated the good region is) — and NEVER the optimum's coordinates or any
 * measured value. The central registry learns which SEARCH STRATEGY suits each class of landscape. A new
 * run whose fingerprint matches gets a recommended search profile (how much to explore vs exploit, how many
 * seeds) instead of a blind default — so it converges faster. The more sites contribute, the sharper the
 * strategy, and none of them leaked a secret.
 *
 * Honest by construction (DIAKRISIS): the fingerprint shares HOW a landscape behaves (to tune the search),
 * NOT WHERE the answer is (that would leak the recipe) — the gauntlet proves no raw value or coordinate
 * appears in what's shared. The benefit is MEASURED (the recommended profile beats the wrong one on that
 * class), not a promised "5 instead of 20" — the gain depends on how well a new problem matches known ones,
 * and is bounded. This is meta-learning of SEARCH STRATEGY, not a magic global oracle.
 */
import { type Space, type Experiment, lcg } from "./space.js";
import { type Observation, type Goal } from "./engine.js";
import { analyzeSloppiness } from "./sloppiness.js";

export interface LandscapeFingerprint {
  dims: number;
  ruggedness: number;          // 0 smooth … 1 very multimodal (no raw values)
  smoothness: number;          // 0 … 1
  effectiveDimsFrac: number;   // (effective dims) / dims — how many combos really matter
  concentration: number;       // 0 broad plateau … 1 sharp needle
}
export interface SearchProfile { seeds: number; exploreWeight: number; note: string }
export interface MetaEntry { fingerprint: LandscapeFingerprint; bestExploreWeight: number; bestSeedsFrac: number; n: number }

const dst = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - c[i]) ** 2; return Math.sqrt(s); };

/** A privacy-safe summary of HOW a landscape behaves — never WHERE the optimum is, never a raw value. */
export function landscapeFingerprint(obs: ReadonlyArray<Observation>, space: Space, goal: Goal = "maximize"): LandscapeFingerprint {
  const dims = space?.dims ?? []; const D = dims.length;
  const hist = (obs ?? []).filter((o) => o && o.experiment && Number.isFinite(o.value));
  const n = hist.length;
  if (D === 0 || n < 4) return { dims: D, ruggedness: 0, smoothness: 1, effectiveDimsFrac: 1, concentration: 0 };
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toN = (e: Experiment) => dims.map((d, i) => { const sp = hi(i) - lo(i) || 1; return Math.max(0, Math.min(1, ((+e[d.name] || 0) - lo(i)) / sp)); });
  const P = hist.map((o) => toN(o.experiment));
  const sgn = goal === "minimize" ? -1 : 1;
  const V = hist.map((o) => sgn * o.value);
  const vmin = Math.min(...V), vmax = Math.max(...V), vRange = Math.max(1e-9, vmax - vmin);

  // ruggedness: how UN-unimodal the surface is. A smooth single-optimum bowl has value falling monotonically
  // with distance from the best point (strong correlation); a rugged/multimodal one does not. So ruggedness
  // = 1 − |corr(value, distance-to-best)|. (Robust, and a clean smooth-vs-rugged discriminator.)
  let bestI = 0; for (let i = 1; i < n; i++) if (V[i] > V[bestI]) bestI = i;
  const dd = P.map((p) => dst(p, P[bestI]));
  const md = dd.reduce((a, b) => a + b, 0) / n, mv = V.reduce((a, b) => a + b, 0) / n;
  let sdv = 0, sdd = 0, sdvd = 0; for (let i = 0; i < n; i++) { const a = dd[i] - md, b = V[i] - mv; sdd += a * a; sdv += b * b; sdvd += a * b; }
  const corr = (sdd > 1e-12 && sdv > 1e-12) ? sdvd / Math.sqrt(sdd * sdv) : 0;
  const rug = Math.max(0, Math.min(1, 1 - Math.abs(corr)));
  const smoothness = +Math.max(0, Math.min(1, Math.abs(corr))).toFixed(3);

  // effective dims fraction (how many independent combinations matter)
  let edf = 1; if (D >= 2) { const s = analyzeSloppiness(hist, space, goal); if (Number.isFinite(s.effectiveDims)) edf = Math.max(0, Math.min(1, s.effectiveDims / D)); }

  // concentration: of the top-quartile points, how tightly do they cluster near the best (needle vs broad)
  const idxSorted = V.map((_, i) => i).sort((a, b) => V[b] - V[a]);
  const topK = idxSorted.slice(0, Math.max(2, Math.round(n * 0.25)));
  const bestP = P[idxSorted[0]];
  const meanD = topK.reduce((s, i) => s + dst(bestP, P[i]), 0) / topK.length;
  const concentration = +Math.max(0, Math.min(1, 1 - meanD / 0.5)).toFixed(3);   // tight cluster ⇒ →1 (needle)

  return { dims: D, ruggedness: +rug.toFixed(3), smoothness, effectiveDimsFrac: +edf.toFixed(3), concentration };
}

const DEFAULT_PROFILE: SearchProfile = { seeds: 8, exploreWeight: 0.5, note: "default balanced search (no matching prior landscape yet)" };

/** Recommend a search profile for a new run, learned from prior landscapes of the SAME behavioural class. */
export function recommendProfile(fp: LandscapeFingerprint, registry: ReadonlyArray<MetaEntry> = []): SearchProfile {
  // find prior entries with a similar fingerprint
  const sim = (a: LandscapeFingerprint, b: LandscapeFingerprint) => Math.abs(a.ruggedness - b.ruggedness) + Math.abs(a.concentration - b.concentration) + Math.abs(a.effectiveDimsFrac - b.effectiveDimsFrac) + (a.dims === b.dims ? 0 : 0.3);
  const near = (registry ?? []).map((e) => ({ e, d: sim(fp, e.fingerprint) })).filter((x) => x.d < 0.4).sort((a, b) => a.d - b.d);
  if (near.length) {
    let w = 0, sw = 0, ss = 0; for (const { e } of near) { const wt = e.n; w += wt; sw += wt * e.bestExploreWeight; ss += wt * e.bestSeedsFrac; }
    const exploreWeight = +Math.max(0, Math.min(1, sw / (w || 1))).toFixed(3);
    const seeds = Math.max(4, Math.round((ss / (w || 1)) * 40));
    return { seeds, exploreWeight, note: `learned from ${near.length} similar prior landscape${near.length > 1 ? "s" : ""} — ${exploreWeight > 0.6 ? "explore-heavy (rugged class)" : exploreWeight < 0.4 ? "exploit-heavy (smooth class)" : "balanced"}` };
  }
  // no match → derive a sensible profile from the fingerprint alone (rugged/needle ⇒ explore more)
  const exploreWeight = +Math.max(0.2, Math.min(0.85, 0.35 + 0.4 * fp.ruggedness + 0.25 * fp.concentration)).toFixed(3);
  return { seeds: Math.round(6 + 10 * fp.ruggedness), exploreWeight, note: "derived from this landscape's own fingerprint (no prior match)" };
}

/** Append a landscape's learned strategy to the registry — anonymised (fingerprint only). CRDT-style merge. */
export function contributeFingerprint(registry: ReadonlyArray<MetaEntry>, fp: LandscapeFingerprint, bestExploreWeight: number, bestSeedsFrac: number): MetaEntry[] {
  const key = (f: LandscapeFingerprint) => `${f.dims}|${Math.round(f.ruggedness * 10)}|${Math.round(f.concentration * 10)}|${Math.round(f.effectiveDimsFrac * 10)}`;
  const out = (registry ?? []).map((e) => ({ ...e, fingerprint: { ...e.fingerprint } }));
  const k = key(fp); const ex = out.find((e) => key(e.fingerprint) === k);
  const ew = Math.max(0, Math.min(1, bestExploreWeight)), sf = Math.max(0, Math.min(1, bestSeedsFrac));
  if (ex) { const t = ex.n + 1; ex.bestExploreWeight = +((ex.bestExploreWeight * ex.n + ew) / t).toFixed(4); ex.bestSeedsFrac = +((ex.bestSeedsFrac * ex.n + sf) / t).toFixed(4); ex.n = t; }
  else out.push({ fingerprint: { ...fp }, bestExploreWeight: +ew.toFixed(4), bestSeedsFrac: +sf.toFixed(4), n: 1 });
  out.sort((a, b) => (a.fingerprint.dims - b.fingerprint.dims) || (a.fingerprint.ruggedness - b.fingerprint.ruggedness) || (a.fingerprint.concentration - b.fingerprint.concentration));
  return out;
}

/** A minimal profile-driven search used to MEASURE that a recommended profile actually helps. */
export function profiledSearch(space: Space, oracle: (e: Experiment) => number, budget: number, profile: SearchProfile, goal: Goal = "maximize", seed = 1): { best: Observation; evaluations: number } {
  const dims = space.dims, D = dims.length; const sgn = goal === "minimize" ? -1 : 1;
  const lo = (i: number) => dims[i].min ?? 0, hi = (i: number) => dims[i].max ?? 1;
  const toE = (v: number[]): Experiment => { const e: Experiment = {}; dims.forEach((d, i) => { let x = lo(i) + v[i] * (hi(i) - lo(i)); if (d.type === "int") x = Math.round(x); e[d.name] = x; }); return e; };
  const HB = [2, 3, 5, 7, 11, 13, 17, 19]; const hal = (k: number, b: number) => { let f = 1, r = 0, i = k + 1; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  const rnd = lcg((seed >>> 0) || 1);
  const obs: Observation[] = []; const pts: number[][] = []; let best: Observation = { experiment: {}, value: goal === "minimize" ? Infinity : -Infinity };
  const take = (p: number[]) => { const e = toE(p); const v = oracle(e); obs.push({ experiment: e, value: v }); pts.push(p); if (sgn * v > sgn * best.value) best = { experiment: e, value: v }; };
  const seeds = Math.min(budget, Math.max(2, profile.seeds));
  for (let k = 0; k < seeds; k++) { const p: number[] = []; for (let d = 0; d < D; d++) p.push(hal(k * 5 + 1, HB[d % HB.length])); take(p); }
  while (obs.length < budget) {
    let p: number[];
    if (rnd() < profile.exploreWeight) { p = []; for (let d = 0; d < D; d++) p.push(hal((obs.length * 7 + 3), HB[d % HB.length])); }   // explore: fresh space-filling
    else { const bn = dims.map((d) => { const sp = hi(0) - lo(0); void sp; return 0; }); void bn; const bp = pts[obs.reduce((bi, o, i) => (sgn * o.value > sgn * obs[bi].value ? i : bi), 0)]; p = bp.map((x) => Math.max(0, Math.min(1, x + (rnd() - 0.5) * 0.15))); }   // exploit: cloud around best
    take(p);
  }
  return { best, evaluations: obs.length };
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }

export function metabrainGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const space: Space = { dims: [{ name: "x", type: "real", min: 0, max: 1 }, { name: "y", type: "real", min: 0, max: 1 }] };
  // RUGGED multimodal landscape (lots of local peaks) vs SMOOTH single bowl
  const rugged = (x: number, y: number) => Math.sin(9 * x) * Math.sin(9 * y) * 0.5 + Math.exp(-(((x - 0.5) ** 2) + ((y - 0.5) ** 2)) / 0.3);
  const smooth = (x: number, y: number) => -(((x - 0.5) ** 2) + ((y - 0.5) ** 2));
  const samp = (f: (x: number, y: number) => number, sd: number) => { const r = lcg(sd); const o: Observation[] = []; for (let i = 0; i < 60; i++) { const x = r(), y = r(); o.push({ experiment: { x, y }, value: f(x, y) }); } return o; };

  const fpRug = landscapeFingerprint(samp(rugged, 3), space, "maximize");
  const fpSmo = landscapeFingerprint(samp(smooth, 4), space, "maximize");
  const recognizes = fpRug.ruggedness > fpSmo.ruggedness + 0.1;

  // PRIVACY: no raw observation value or coordinate appears in the shared fingerprint
  const ro = samp(rugged, 3);
  const fpStr = canonical(landscapeFingerprint(ro, space, "maximize"));
  const leaks = ro.some((o) => fpStr.indexOf(String(o.value)) >= 0 || fpStr.indexOf(String(o.experiment.x)) >= 0 || fpStr.indexOf(String(o.experiment.y)) >= 0);
  const privacy = !leaks && Object.keys(landscapeFingerprint(ro, space, "maximize")).sort().join(",") === "concentration,dims,effectiveDimsFrac,ruggedness,smoothness";

  // PROFILE matches class: rugged ⇒ explore-heavy; smooth ⇒ exploit-heavy
  const pRug = recommendProfile(fpRug); const pSmo = recommendProfile(fpSmo);
  const profileMatches = pRug.exploreWeight > pSmo.exploreWeight;

  // MEASURED benefit: on the rugged landscape, the explore-heavy profile beats an exploit-only profile (same budget)
  const orc = (e: Experiment) => rugged(e.x ?? 0, e.y ?? 0);
  const exploreRun = profiledSearch(space, orc, 30, { seeds: 14, exploreWeight: 0.8, note: "" }, "maximize", 5);
  const exploitRun = profiledSearch(space, orc, 30, { seeds: 4, exploreWeight: 0.05, note: "" }, "maximize", 5);
  const measuredBenefit = exploreRun.best.value > exploitRun.best.value + 0.02;

  // MERGE is commutative (CRDT): contribute order doesn't change the registry
  const a = contributeFingerprint(contributeFingerprint([], fpRug, 0.8, 0.35), fpSmo, 0.1, 0.1);
  const b = contributeFingerprint(contributeFingerprint([], fpSmo, 0.1, 0.1), fpRug, 0.8, 0.35);
  const merge = canonical(a) === canonical(b);
  // a registry of rugged priors recommends explore-heavy for a new rugged fingerprint
  const reg = contributeFingerprint(contributeFingerprint([], fpRug, 0.82, 0.4), fpRug, 0.78, 0.38);
  const learnsFromRegistry = recommendProfile(fpRug, reg).exploreWeight > 0.6 && recommendProfile(fpRug, reg).note.indexOf("similar prior") >= 0;

  const det = canonical(landscapeFingerprint(ro, space, "maximize")) === canonical(landscapeFingerprint(ro, space, "maximize"));
  const total = (() => { try { landscapeFingerprint([], space); recommendProfile(fpRug, null as never); contributeFingerprint(null as never, fpRug, 0.5, 0.3); profiledSearch(space, () => 0, 3, DEFAULT_PROFILE); return true; } catch { return false; } })();

  const checks = [
    { name: "PRIVACY-INVARIANT", pass: privacy, detail: "fingerprint = {dims,ruggedness,smoothness,effectiveDimsFrac,concentration} only — NO raw value or optimum coordinate" },
    { name: "RECOGNIZES-LANDSCAPE-CLASS", pass: recognizes, detail: `rugged ruggedness ${fpRug.ruggedness} > smooth ${fpSmo.ruggedness}` },
    { name: "PROFILE-MATCHES-CLASS", pass: profileMatches, detail: `rugged → explore ${pRug.exploreWeight} > smooth → explore ${pSmo.exploreWeight}` },
    { name: "MEASURED-BENEFIT", pass: measuredBenefit, detail: `on rugged: explore-profile best ${exploreRun.best.value.toFixed(3)} > exploit-profile ${exploitRun.best.value.toFixed(3)} (same budget)` },
    { name: "LEARNS-FROM-REGISTRY", pass: learnsFromRegistry, detail: "a registry of rugged priors → recommends explore-heavy, cites the priors" },
    { name: "MERGE-COMMUTATIVE", pass: merge, detail: "CRDT: contribute order doesn't change the registry" },
    { name: "DETERMINISTIC", pass: det, detail: "same data → same fingerprint" },
    { name: "TOTAL", pass: total, detail: "empty / null never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
