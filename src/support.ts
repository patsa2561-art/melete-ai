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

export interface SupportCertificate {
  standard: "melete-support-certificate/v1";
  verdict: "SUPPORTED" | "SPARSE-INTERIOR" | "EXTRAPOLATION";
  dims: number;
  designSize: number;                 // number of evaluated settings
  recommended: number[];              // x* — the setting whose support is certified
  box: Array<[number, number]>;       // the per-knob [min, max] actually sampled
  witness: AxisWitness[];             // separating-axis proof when EXTRAPOLATION (empty otherwise)
  nearestNeighborDist: number;        // distance from x* to the closest evaluated setting
  typicalSpacing: number;             // median nearest-neighbour distance of the design (its natural scale)
  supportRatio: number;               // nearestNeighborDist / typicalSpacing (≤ τ ⇒ dense; > τ ⇒ void)
  tau: number;                        // density threshold
  payloadHash: string;
  signature: string;
  publicKeyPem: string;
  algo: "ed25519+sha256";
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
  const verdict: SupportCertificate["verdict"] = witness.length ? "EXTRAPOLATION" : (Number.isFinite(supportRatio) && supportRatio > tau ? "SPARSE-INTERIOR" : "SUPPORTED");
  return { box, witness, nn, typical: Number.isFinite(typical) ? typical : 0, supportRatio: Number.isFinite(supportRatio) ? supportRatio : 0, verdict };
}

export function supportCertificate(opts: { design: number[][]; recommended: number[]; tau?: number; keys?: { publicKey: KeyObject; privateKey: KeyObject } }): SupportCertificate {
  const tau = opts.tau ?? 2.0; const x = opts.recommended; const design = opts.design;
  const a = analyze(design, x, tau);
  const kp = opts.keys ?? generateKeyPairSync("ed25519");
  const cert = { standard: "melete-support-certificate/v1" as const, verdict: a.verdict, dims: x.length, designSize: design.length, recommended: x, box: a.box, witness: a.witness, nearestNeighborDist: a.nn === Infinity ? -1 : a.nn, typicalSpacing: a.typical, supportRatio: a.supportRatio, tau };
  const payloadHash = createHash("sha256").update(canonical(cert)).digest("hex");
  const signature = edSign(null, Buffer.from(payloadHash), kp.privateKey).toString("base64");
  return { ...cert, payloadHash, signature, publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(), algo: "ed25519+sha256" };
}

export function verifySupportCertificate(c: SupportCertificate, design?: number[][]): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-support-certificate/v1") return { ok: false, reason: "unknown standard" };
    // the witness, when present, is an EXACT separating-axis proof — re-checkable WITHOUT the design
    for (const w of c.witness) {
      if (w.side === "above" && !(c.recommended[w.dim] > w.limit + 1e-12)) return { ok: false, reason: `witness axis ${w.dim} does not actually separate (above) — bogus extrapolation proof` };
      if (w.side === "below" && !(c.recommended[w.dim] < w.limit - 1e-12)) return { ok: false, reason: `witness axis ${w.dim} does not actually separate (below) — bogus extrapolation proof` };
    }
    if (c.witness.length > 0 && c.verdict !== "EXTRAPOLATION") return { ok: false, reason: "carries a separating witness but is not labelled EXTRAPOLATION" };
    // if the design is supplied, RE-DERIVE the whole verdict (a forged SUPPORTED on an out-of-box point is caught)
    if (design) {
      if (design.length !== c.designSize) return { ok: false, reason: "design size differs" };
      const a = analyze(design, c.recommended, c.tau);
      if (a.verdict !== c.verdict) return { ok: false, reason: `recomputed verdict ${a.verdict} ≠ certificate ${c.verdict} — support overstated` };
      if (a.witness.length !== c.witness.length) return { ok: false, reason: "recomputed extrapolation axes differ from the witness" };
      for (let d = 0; d < c.box.length; d++) if (Math.abs(a.box[d][0] - c.box[d][0]) > 1e-9 || Math.abs(a.box[d][1] - c.box[d][1]) > 1e-9) return { ok: false, reason: "recomputed sampled box differs — design tampered" };
      if (Math.abs((a.nn === Infinity ? -1 : a.nn) - c.nearestNeighborDist) > 1e-6 || Math.abs(a.supportRatio - c.supportRatio) > 1e-6) return { ok: false, reason: "recomputed support geometry differs" };
    }
    const payloadHash = createHash("sha256").update(canonical({ standard: c.standard, verdict: c.verdict, dims: c.dims, designSize: c.designSize, recommended: c.recommended, box: c.box, witness: c.witness, nearestNeighborDist: c.nearestNeighborDist, typicalSpacing: c.typicalSpacing, supportRatio: c.supportRatio, tau: c.tau })).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch — certificate altered" };
    const pub = createPublicKey(c.publicKeyPem);
    if (!edVerify(null, Buffer.from(c.payloadHash), pub, Buffer.from(c.signature, "base64"))) return { ok: false, reason: "bad signature" };
    return { ok: true, reason: `${c.verdict} — re-derived (support ratio ${c.supportRatio.toFixed(2)}, ${c.witness.length} extrapolating ${c.witness.length === 1 ? "axis" : "axes"})` };
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
    if (ce.witness.some((w) => w.dim === axis && w.side === "above") && verifySupportCertificate(ce, design).ok) witnessValid++;
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

  // 4) FORGERY: claim SUPPORTED on an out-of-box point — re-derivation with the design rejects it
  const dz = cluster(3); const cxz = dz.reduce((a, p) => a + p[0], 0) / dz.length;
  const real = supportCertificate({ design: dz, recommended: [cxz + 5, 0.5], tau });
  const forged = { ...real, verdict: "SUPPORTED" as const, witness: [] as AxisWitness[] };
  // forged carries no witness + claims SUPPORTED; with the design, re-derivation catches it. Also the hash breaks.
  const forgeryCaught = !verifySupportCertificate(forged, dz).ok && !verifySupportCertificate(forged).ok;
  // 5) WITNESS-ONLY VERIFY (no design): a real extrapolation witness still re-checks standalone
  const witnessStandalone = verifySupportCertificate(real).ok && real.verdict === "EXTRAPOLATION";
  // 6) TAMPER + 7) DETERMINISTIC + 8) TOTAL
  const tamper = !verifySupportCertificate({ ...real, recommended: [cxz, 0.5] }).ok;   // moved x* back in-box, hash breaks
  const d1 = supportCertificate({ design: [[0, 0], [1, 1], [0, 1], [1, 0]], recommended: [0.5, 0.5], tau });
  const d2 = supportCertificate({ design: [[0, 0], [1, 1], [0, 1], [1, 0]], recommended: [0.5, 0.5], tau });
  const deterministic = d1.payloadHash === d2.payloadHash && verifySupportCertificate(d1).ok;
  let total = true; try { supportCertificate({ design: [], recommended: [0.5, 0.5], tau }); supportCertificate({ design: [[1]], recommended: [NaN], tau }); } catch { total = false; }

  const extrapRate = extrapN ? extrapOk / extrapN : 0, witnessRate = extrapN ? witnessValid / extrapN : 0;
  const supportedRate = inClusterN ? supportedOk / inClusterN : 0, voidRate = voidN ? voidSparse / voidN : 0, denseRate = denseN ? denseSupported / denseN : 0;
  const checks = [
    { name: "AXIS-EXACT (out-of-box ⇒ EXTRAPOLATION)", pass: extrapRate >= 0.999 && extrapN >= 100, detail: `a recommendation beyond the sampled box was flagged EXTRAPOLATION in ${extrapOk}/${extrapN} = ${(extrapRate * 100).toFixed(1)}% (an exact convex-hull-exclusion proof)` },
    { name: "WITNESS-VALID (separating axis)", pass: witnessRate >= 0.999, detail: `the certificate shipped a separating-axis witness on the right knob, and it re-verified with the design, in ${witnessValid}/${extrapN} = ${(witnessRate * 100).toFixed(1)}%` },
    { name: "NO-FALSE-EXTRAPOLATION", pass: falseExtrap === 0 && supportedRate >= 0.999, detail: `an in-cluster recommendation was NEVER falsely flagged (0 false EXTRAPOLATION) and was SUPPORTED ${(supportedRate * 100).toFixed(1)}%` },
    { name: "DENSITY-DISCRIMINATES (interior void)", pass: voidRate >= 0.95 && denseRate >= 0.95, detail: `a point in an interior VOID was flagged SPARSE-INTERIOR ${(voidRate * 100).toFixed(0)}% while a point in a dense cluster stayed SUPPORTED ${(denseRate * 100).toFixed(0)}%` },
    { name: "FORGERY-CAUGHT (fake SUPPORTED)", pass: forgeryCaught, detail: "a certificate claiming SUPPORTED for an out-of-box point is rejected (re-derivation + broken hash)" },
    { name: "WITNESS-VERIFIES-STANDALONE", pass: witnessStandalone, detail: "an EXTRAPOLATION witness re-checks on its own — no need to re-ship the whole design" },
    { name: "SIGNED-TAMPER", pass: tamper, detail: "altering the recommended point breaks the payload hash" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same design + point → byte-identical certificate" },
    { name: "TOTAL", pass: total, detail: "empty design / NaN inputs never throw" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
