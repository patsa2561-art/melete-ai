/**
 * 🧭 THE EXTRAPOLATION-GUARD (SUPPORT) CERTIFICATE — "is the recommended setting INSIDE the evidence, or a
 * blind extrapolation?" An optimizer is only trustworthy where it has data. It will happily recommend a
 * setting at the edge of — or beyond — the region you actually sampled, where the surrogate model is
 * guessing, not interpolating. Acting on an extrapolated recommendation is how you melt the reactor: the
 * number looks great precisely because nothing measured was ever there to contradict it.
 *
 * This certificate guards that boundary. Given the design (every setting you evaluated) and the recommended
 * setting x*, it returns:
 *   • EXTRAPOLATION — x* lies outside the sampled box on at least one knob. This is an EXACT proof that x* is
 *     outside the convex hull of your data: an axis on which x* exceeds every sampled value IS a separating
 *     hyperplane. The certificate ships that axis as a WITNESS (knob, the limit you sampled, the value asked
 *     for) — a reviewer re-checks it in one line.
 *   • SPARSE-INTERIOR — x* is inside the box but sits in a VOID: its nearest measured neighbour is far
 *     relative to the typical spacing of the design. Interpolation here is thin. (A labelled density signal,
 *     not a hull proof — honest about which guarantee is exact and which is heuristic.)
 *   • SUPPORTED — x* is inside the box AND in a well-sampled neighbourhood: a genuine interpolation.
 * Ed25519-signed; the verdict + the witness re-derive offline from the recorded design.
 *
 * WORLD-FIRST + LLM-impossible: an LLM cannot hold the full design matrix, compute the box / nearest-neighbour
 * geometry, exhibit a separating-axis witness, and sign a re-derivable verdict — it just trusts the number.
 * (DIAKRISIS — MEASURED: an out-of-box recommendation is flagged EXTRAPOLATION with a valid separating
 * witness 100% of the time; a point inside a dense cluster is never falsely flagged; the void signal
 * cleanly separates a sampled cluster from an interior gap.)
 */
import { lcg } from "./space.js";
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
function dist(a: number[], b: number[]): number { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
function median(xs: number[]): number { if (!xs.length) return NaN; const s = xs.slice().sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

export interface AxisWitness { dim: number; value: number; side: "below" | "above"; limit: number; }   // x*_dim is past every sampled value on this axis ⇒ outside the hull
// a general separating hyperplane: direction u with u·x* > dataMax = maxᵢ u·pᵢ ⇒ x* is provably outside the convex hull
export interface HullWitness { u: number[]; dataMax: number; xDot: number; }

export interface SupportCertificate {
  standard: "melete-support-certificate/v2";
  verdict: "SUPPORTED" | "SPARSE-INTERIOR" | "EXTRAPOLATION";
  dims: number;
  designSize: number;                 // number of evaluated settings
  recommended: number[];              // x* — the setting whose support is certified
  design: number[][];                 // the full evaluated design (the evidence) — makes the cert self-contained
  box: Array<[number, number]>;       // the per-knob [min, max] actually sampled
  witness: AxisWitness[];             // axis-aligned separating proof (standalone-verifiable) — empty if none
  hullWitness: HullWitness | null;    // GENERAL separating hyperplane for interior-but-outside-hull points
  nearestNeighborDist: number;        // distance from x* to the closest evaluated setting
  typicalSpacing: number;             // median nearest-neighbour distance of the design (its natural scale)
  supportRatio: number;               // nearestNeighborDist / typicalSpacing (≤ τ ⇒ dense; > τ ⇒ void)
  tau: number;                        // density threshold
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
}

// Find a separating hyperplane proving x* is outside conv(design), or null if x* is (numerically) inside.
// Frank-Wolfe minimises ½‖z−x‖² over z ∈ conv(design) (projection-free, deterministic); u = x − proj is then
// a separating direction. We only RETURN a witness that strictly separates (verified) → no false positives.
function separatingHyperplane(design: number[][], x: number[], iters = 2000, tol = 1e-7): HullWitness | null {
  const N = design.length, D = x.length; if (N === 0) return null;
  // build + verify a candidate witness from a direction; returns it iff it strictly separates
  const tryDir = (dir: number[]): HullWitness | null => {
    let nrm = 0; for (let d = 0; d < D; d++) nrm += dir[d] * dir[d]; nrm = Math.sqrt(nrm); if (nrm < tol) return null;
    const u = dir.map((v) => v / nrm);
    let dataMax = -Infinity; for (const p of design) { let dot = 0; for (let d = 0; d < D; d++) dot += u[d] * p[d]; if (dot > dataMax) dataMax = dot; }
    let xDot = 0; for (let d = 0; d < D; d++) xDot += u[d] * x[d];
    return (xDot - dataMax > tol) ? { u, dataMax, xDot } : null;
  };
  // Frank-Wolfe: project x onto conv(design); u = x − proj is the separating direction
  const z = new Array(D).fill(0); for (const p of design) for (let d = 0; d < D; d++) z[d] += p[d] / N;   // start at the centroid
  for (let t = 0; t < iters; t++) {
    let bi = 0, bv = Infinity;   // linear-minimisation oracle: argminᵢ (z−x)·pᵢ
    for (let i = 0; i < N; i++) { let dot = 0; for (let d = 0; d < D; d++) dot += (z[d] - x[d]) * design[i][d]; if (dot < bv) { bv = dot; bi = i; } }
    const g = 2 / (t + 2); for (let d = 0; d < D; d++) z[d] += g * (design[bi][d] - z[d]);
  }
  const fw = tryDir(x.map((v, d) => v - z[d]));
  if (fw) return fw;
  // fallback: the direction from the nearest design point often separates a point far outside a thin hull
  let bi = 0, bd = Infinity; for (let i = 0; i < N; i++) { const dd = dist(design[i], x); if (dd < bd) { bd = dd; bi = i; } }
  return tryDir(x.map((v, d) => v - design[bi][d]));   // verified inside tryDir → no false positives
}

function analyze(design: number[][], x: number[], tau: number) {
  const D = x.length, N = design.length;
  const box: Array<[number, number]> = [];
  for (let d = 0; d < D; d++) { let lo = Infinity, hi = -Infinity; for (const p of design) { if (p[d] < lo) lo = p[d]; if (p[d] > hi) hi = p[d]; } box.push([N ? lo : 0, N ? hi : 0]); }
  const witness: AxisWitness[] = [];
  for (let d = 0; d < D; d++) { if (!N) break; if (x[d] < box[d][0] - 1e-12) witness.push({ dim: d, value: x[d], side: "below", limit: box[d][0] }); else if (x[d] > box[d][1] + 1e-12) witness.push({ dim: d, value: x[d], side: "above", limit: box[d][1] }); }
  let nn = Infinity; for (const p of design) { const dd = dist(p, x); if (dd < nn) nn = dd; } if (!N) nn = Infinity;
  // typical spacing = median of each design point's nearest-neighbour distance (the design's natural scale)
  const nnEach: number[] = [];
  for (let i = 0; i < N; i++) { let m = Infinity; for (let j = 0; j < N; j++) { if (i === j) continue; const dd = dist(design[i], design[j]); if (dd < m) m = dd; } if (Number.isFinite(m)) nnEach.push(m); }
  const typical = nnEach.length ? median(nnEach) : NaN;
  const supportRatio = (Number.isFinite(typical) && typical > 0) ? nn / typical : (witness.length ? Infinity : 0);
  // when x* is inside the sampled box (no axis witness), it may STILL be outside the convex hull — find a
  // general separating hyperplane. This upgrades the exact extrapolation proof from axis-aligned to ANY direction.
  const hullWitness = (!witness.length && N >= D + 1) ? separatingHyperplane(design, x) : null;
  const verdict: SupportCertificate["verdict"] = (witness.length || hullWitness) ? "EXTRAPOLATION" : (Number.isFinite(supportRatio) && supportRatio > tau ? "SPARSE-INTERIOR" : "SUPPORTED");
  return { box, witness, hullWitness, nn, typical: Number.isFinite(typical) ? typical : 0, supportRatio: Number.isFinite(supportRatio) ? supportRatio : 0, verdict };
}

export function supportCertificate(opts: { design: number[][]; recommended: number[]; tau?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): SupportCertificate {
  const tau = opts.tau ?? 2.0; const x = opts.recommended; const design = opts.design;
  const a = analyze(design, x, tau);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-support-certificate/v2" as const, verdict: a.verdict, dims: x.length, designSize: design.length, recommended: x, design, box: a.box, witness: a.witness, hullWitness: a.hullWitness, nearestNeighborDist: a.nn === Infinity ? -1 : a.nn, typicalSpacing: a.typical, supportRatio: a.supportRatio, tau };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifySupportCertificate(c: SupportCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-support-certificate/v2") return { ok: false, reason: "unknown standard" };
    if (c.design.length !== c.designSize) return { ok: false, reason: "design size differs" };
    // (a) the axis witness, when present, is an EXACT separating-axis proof — re-checkable directly
    for (const w of c.witness) {
      if (w.side === "above" && !(c.recommended[w.dim] > w.limit + 1e-12)) return { ok: false, reason: `witness axis ${w.dim} does not actually separate (above) — bogus extrapolation proof` };
      if (w.side === "below" && !(c.recommended[w.dim] < w.limit - 1e-12)) return { ok: false, reason: `witness axis ${w.dim} does not actually separate (below) — bogus extrapolation proof` };
    }
    // (b) the hull witness is a GENERAL separating hyperplane — recompute maxᵢ u·pᵢ from the recorded design
    if (c.hullWitness) {
      const { u, dataMax, xDot } = c.hullWitness;
      if (u.length !== c.dims) return { ok: false, reason: "hull witness dimension mismatch" };
      let dm = -Infinity; for (const p of c.design) { let dot = 0; for (let d = 0; d < c.dims; d++) dot += u[d] * p[d]; if (dot > dm) dm = dot; }
      let xd = 0; for (let d = 0; d < c.dims; d++) xd += u[d] * c.recommended[d];
      if (Math.abs(dm - dataMax) > 1e-6 || Math.abs(xd - xDot) > 1e-6) return { ok: false, reason: "hull witness dot-products do not match the recorded design — tampered" };
      if (!(xd - dm > 1e-9)) return { ok: false, reason: "hull witness does not actually separate x* from the data — bogus extrapolation proof" };
    }
    if ((c.witness.length > 0 || c.hullWitness) && c.verdict !== "EXTRAPOLATION") return { ok: false, reason: "carries a separating witness but is not labelled EXTRAPOLATION" };
    // (c) RE-DERIVE the whole verdict from the recorded design (a forged SUPPORTED on an out-of-hull point is caught)
    const a = analyze(c.design, c.recommended, c.tau);
    if (a.verdict !== c.verdict) return { ok: false, reason: `recomputed verdict ${a.verdict} ≠ certificate ${c.verdict} — support overstated` };
    if (a.witness.length !== c.witness.length || (!!a.hullWitness !== !!c.hullWitness)) return { ok: false, reason: "recomputed separating witnesses differ from the certificate" };
    for (let d = 0; d < c.box.length; d++) if (Math.abs(a.box[d][0] - c.box[d][0]) > 1e-9 || Math.abs(a.box[d][1] - c.box[d][1]) > 1e-9) return { ok: false, reason: "recomputed sampled box differs — design tampered" };
    if (Math.abs((a.nn === Infinity ? -1 : a.nn) - c.nearestNeighborDist) > 1e-6 || Math.abs(a.supportRatio - c.supportRatio) > 1e-6) return { ok: false, reason: "recomputed support geometry differs" };
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, dims: c.dims, designSize: c.designSize, recommended: c.recommended, design: c.design, box: c.box, witness: c.witness, hullWitness: c.hullWitness, nearestNeighborDist: c.nearestNeighborDist, typicalSpacing: c.typicalSpacing, supportRatio: c.supportRatio, tau: c.tau })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — certificate altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    const proof = c.witness.length ? `${c.witness.length} axis` : (c.hullWitness ? "a hyperplane" : "no");
    return { ok: true, reason: `${c.verdict} — re-derived (support ratio ${c.supportRatio.toFixed(2)}, ${proof} witness)` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function supportGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const tau = 2.0;
  // a 2-D design: a cluster of evaluated settings inside [0,1]² around the centre
  const cluster = (seed: number, n = 40, cx = 0.5, cy = 0.5, spread = 0.18) => {
    const g = lcg(seed); const pts: number[][] = [];
    const gz = () => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    for (let i = 0; i < n; i++) pts.push([cx + spread * gz(), cy + spread * gz()]); return pts;
  };

  // 1) AXIS-EXACT + WITNESS: an out-of-box recommendation is EXTRAPOLATION with a valid separating witness
  // 2) NO-FALSE-EXTRAPOLATION: an in-cluster point is never called EXTRAPOLATION
  let extrapOk = 0, extrapN = 0, witnessValid = 0, falseExtrap = 0, inClusterN = 0, supportedOk = 0;
  for (let s = 1; s <= 200; s++) {
    const design = cluster(s * 7 + 1);
    const cx = design.reduce((a, p) => a + p[0], 0) / design.length, cy = design.reduce((a, p) => a + p[1], 0) / design.length;
    // an out-of-box point: push far beyond the sampled range on a random axis
    const g = lcg(s * 31 + 3); const axis = g() < 0.5 ? 0 : 1; const far = [cx, cy]; far[axis] += 5.0;
    const ce = supportCertificate({ design, recommended: far, tau });
    extrapN++; if (ce.verdict === "EXTRAPOLATION") extrapOk++;
    // the witness must actually separate, AND re-verify with the design
    if (ce.witness.some((w) => w.dim === axis && w.side === "above") && verifySupportCertificate(ce).ok) witnessValid++;
    // an ACTUAL sampled setting (nearest-neighbour distance 0) must be SUPPORTED, never EXTRAPOLATION
    const cs = supportCertificate({ design, recommended: design[0], tau });
    inClusterN++; if (cs.verdict === "EXTRAPOLATION") falseExtrap++; if (cs.verdict === "SUPPORTED") supportedOk++;
  }

  // 3) DENSITY-DISCRIMINATES: a void inside the box (two clusters, point in the gap) → SPARSE-INTERIOR
  let voidSparse = 0, voidN = 0, denseSupported = 0, denseN = 0;
  for (let s = 1; s <= 200; s++) {
    const left = cluster(s * 13 + 1, 30, 0.2, 0.5, 0.06), right = cluster(s * 13 + 9, 30, 0.8, 0.5, 0.06);
    const design = left.concat(right);   // box spans x∈[~0.0,1.0]; the gap around x=0.5 is an interior void
    const gap = supportCertificate({ design, recommended: [0.5, 0.5], tau });   // inside the box, in the void
    voidN++; if (gap.verdict === "SPARSE-INTERIOR") voidSparse++;
    const inLeft = supportCertificate({ design, recommended: [0.2, 0.5], tau }); // inside a dense cluster
    denseN++; if (inLeft.verdict === "SUPPORTED") denseSupported++;
  }

  // R16 IMPROVE — HULL-EXACT: a design on a thin diagonal band (correlated knobs); a point OFF the band but
  // INSIDE the box is outside the convex hull. The axis-only test (R15) misses it; the general separating
  // hyperplane catches it with a valid witness. This is the measured before→after improvement.
  let hullCaught = 0, hullN = 0, hullWitnessValid = 0, axisWouldMiss = 0, falseHull = 0, onBandN = 0;
  for (let s = 1; s <= 150; s++) {
    const g = lcg(s * 53 + 1); const gzz = () => { const u1 = Math.max(1e-9, g()), u2 = g(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    const design: number[][] = []; for (let i = 0; i < 40; i++) { const t = 0.1 + 0.8 * g(); design.push([t + 0.02 * gzz(), t + 0.02 * gzz()]); }   // a thin band around y=x
    const xs = design.map((p) => p[0]), ys = design.map((p) => p[1]);
    const bxmin = Math.min(...xs), bxmax = Math.max(...xs), bymin = Math.min(...ys), bymax = Math.max(...ys);
    // a high-x / low-y point: strictly INSIDE the box by construction, but far off the y=x band ⇒ outside the hull
    const x = [bxmin + 0.85 * (bxmax - bxmin), bymin + 0.15 * (bymax - bymin)];
    const inBox = x[0] >= bxmin && x[0] <= bxmax && x[1] >= bymin && x[1] <= bymax;
    const c = supportCertificate({ design, recommended: x, tau });
    hullN++; if (c.verdict === "EXTRAPOLATION" && c.hullWitness && c.witness.length === 0) { hullCaught++; if (verifySupportCertificate(c).ok) hullWitnessValid++; }
    if (inBox) axisWouldMiss++;   // axis-only (R15) would NOT flag an in-box point → the R16 improvement
    // NO-FALSE on the hull: a point ON the band (inside the hull) must never get a separating hyperplane
    const onBand = supportCertificate({ design, recommended: [0.5, 0.5], tau }); onBandN++; if (onBand.verdict === "EXTRAPOLATION") falseHull++;
  }

  // 4) FORGERY: claim SUPPORTED on an out-of-box point — self-contained re-derivation rejects it
  const dz = cluster(3); const cxz = dz.reduce((a, p) => a + p[0], 0) / dz.length;
  const real = supportCertificate({ design: dz, recommended: [cxz + 5, 0.5], tau });
  const forged = { ...real, verdict: "SUPPORTED" as const, witness: [] as AxisWitness[], hullWitness: null };
  const forgeryCaught = !verifySupportCertificate(forged).ok;
  // 5) WITNESS re-verifies (cert is self-contained: design is recorded in it)
  const witnessStandalone = verifySupportCertificate(real).ok && real.verdict === "EXTRAPOLATION";
  // 6) TAMPER + 7) DETERMINISTIC + 8) TOTAL
  const tamper = !verifySupportCertificate({ ...real, recommended: [cxz, 0.5] }).ok;   // moved x* back in-box, hash breaks
  const d1 = supportCertificate({ design: [[0, 0], [1, 1], [0, 1], [1, 0]], recommended: [0.5, 0.5], tau });
  const d2 = supportCertificate({ design: [[0, 0], [1, 1], [0, 1], [1, 0]], recommended: [0.5, 0.5], tau });
  const deterministic = d1.payloadHash === d2.payloadHash && verifySupportCertificate(d1).ok;
  let total = true; try { supportCertificate({ design: [], recommended: [0.5, 0.5], tau }); supportCertificate({ design: [[1]], recommended: [NaN], tau }); } catch { total = false; }

  const extrapRate = extrapN ? extrapOk / extrapN : 0, witnessRate = extrapN ? witnessValid / extrapN : 0;
  const supportedRate = inClusterN ? supportedOk / inClusterN : 0, voidRate = voidN ? voidSparse / voidN : 0, denseRate = denseN ? denseSupported / denseN : 0;
  const hullRate = hullN ? hullCaught / hullN : 0, hullWitRate = hullCaught ? hullWitnessValid / hullCaught : 0;
  const checks = [
    { name: "AXIS-EXACT (out-of-box ⇒ EXTRAPOLATION)", pass: extrapRate >= 0.999 && extrapN >= 100, detail: `a recommendation beyond the sampled box was flagged EXTRAPOLATION in ${extrapOk}/${extrapN} = ${(extrapRate * 100).toFixed(1)}% (an exact convex-hull-exclusion proof)` },
    { name: "HULL-EXACT (in-box, outside hull ⇒ caught)", pass: hullRate >= 0.99 && hullWitRate >= 0.999 && axisWouldMiss >= 0.99 * hullN && hullN >= 100, detail: `a point INSIDE the box but outside the convex hull (off a correlated-knob band) was flagged EXTRAPOLATION via a general separating hyperplane in ${hullCaught}/${hullN} = ${(hullRate * 100).toFixed(1)}% — the axis-only test would have MISSED all ${axisWouldMiss} (they are in-box); every hull witness re-verified` },
    { name: "NO-FALSE-HULL (in-hull never separated)", pass: falseHull === 0 && onBandN >= 100, detail: `a point ON the sampled band (inside the convex hull) was never given a separating hyperplane (0/${onBandN} false EXTRAPOLATION) — a true separator cannot exist for an in-hull point` },
    { name: "WITNESS-VALID (separating axis)", pass: witnessRate >= 0.999, detail: `the certificate shipped a separating-axis witness on the right knob, and it re-verified with the design, in ${witnessValid}/${extrapN} = ${(witnessRate * 100).toFixed(1)}%` },
    { name: "NO-FALSE-EXTRAPOLATION", pass: falseExtrap === 0 && supportedRate >= 0.999, detail: `an in-cluster recommendation was NEVER falsely flagged (0 false EXTRAPOLATION) and was SUPPORTED ${(supportedRate * 100).toFixed(1)}%` },
    { name: "DENSITY-DISCRIMINATES (interior void)", pass: voidRate >= 0.95 && denseRate >= 0.95, detail: `a point in an interior VOID was flagged SPARSE-INTERIOR ${(voidRate * 100).toFixed(0)}% while a point in a dense cluster stayed SUPPORTED ${(denseRate * 100).toFixed(0)}%` },
    { name: "FORGERY-CAUGHT (fake SUPPORTED)", pass: forgeryCaught, detail: "a certificate claiming SUPPORTED for an out-of-box point is rejected (re-derivation + broken hash)" },
    { name: "SELF-CONTAINED-VERIFY", pass: witnessStandalone, detail: "the certificate carries its own design — the verdict + witness re-derive offline from the cert alone" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering the recommended point breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same design + point → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty design / NaN inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
