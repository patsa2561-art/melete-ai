/**
 * 🧬 THE MODEL SUPPLY-CHAIN CERTIFICATE (AI Bill of Materials) — multi-party, signed provenance for an AI model.
 *
 * A deployed model is rarely one party's work: a BASE-MODEL vendor trains it, a FINE-TUNER adapts it, an OPTIMIZER
 * quantizes/distills it, a DEPLOYER ships it — and a REGULATOR or end user has to trust the result. Today none of
 * that is verifiable: there is no signed record of who did what, in what order, from what inputs. This makes the
 * lineage a hash-chained AIBOM where EACH step is signed by the key of the party responsible for it (different keys
 * = genuinely multi-party), every step declares the prior artifacts it consumed (provenance edges), and any
 * downstream consumer verifies the WHOLE chain offline — confirming every signature, the chain order, and that no
 * step derives from an artifact missing from the chain. It binds each step to a specific signer fingerprint, so the
 * responsibility map (who is accountable for which step) is tamper-evident. Because it carries a payload hash it is
 * a first-class certificate — it can ride inside a Trust Passport and be counter-signed by a Verification Receipt.
 *
 * WHO BENEFITS (≥3 parties — usually 4+): ① the BASE-MODEL vendor gets attribution + liability scoped to only their
 * layer; ② the FINE-TUNER proves exactly what they changed and on top of what; ③ the DEPLOYER proves they shipped a
 * known, unbroken lineage (not a swapped artifact); ④ the REGULATOR / end user verifies the entire provenance and
 * knows who to hold accountable for each step. Each link is independently signed, so no party can rewrite another's.
 *
 * (DIAKRISIS — MEASURED: a 4-party chain with 4 distinct signers verifies + the responsibility map names each
 * signer; tampering, inserting, removing or reordering any link is caught; a link whose declared input artifact is
 * not present earlier in the chain is flagged (broken provenance); a link's recorded party name cannot be changed
 * without breaking its signature; deterministic + total. HONEST: this proves WHO signed WHAT step + the chain's
 * integrity + provenance closure — it does NOT verify the artifacts are good models, and it binds a party NAME to a
 * KEY fingerprint, not to a real-world identity [that needs an external key registry, out of scope].)
 */
import { createHash, generateKeyPairSync, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";

function canonical(o: unknown): string { if (o === null || typeof o !== "object") return JSON.stringify(o); if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]"; const k = Object.keys(o as Record<string, unknown>).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonical((o as Record<string, unknown>)[x])).join(",") + "}"; }
function fingerprint(pem: string): string { return createHash("sha256").update((pem || "").trim()).digest("hex").slice(0, 16); }

export interface LineageLink {
  seq: number; party: string; role: string; action: string;
  artifactHash: string;            // hash/id of the artifact this step produced
  inputs: string[];                // artifactHashes this step consumed (provenance edges)
  prevHash: string;                // previous link's linkHash (chain)
  linkHash: string;                // hash of this link's body
  signerFingerprint: string;
  signature: string; publicKeyPem: string;   // signed by THIS party's key
}
export interface AibomCertificate {
  standard: "melete-aibom/v1";
  model: string; n: number;
  links: LineageLink[];
  parties: string[];               // distinct signer fingerprints, in order of first appearance
  headHash: string;
  payloadHash: string;             // hash over the link hashes (so it can ride inside a Trust Passport)
  algo: "ed25519+sha256";
}

function linkBody(l: { seq: number; party: string; role: string; action: string; artifactHash: string; inputs: string[]; prevHash: string }) {
  return { seq: l.seq, party: String(l.party), role: String(l.role), action: String(l.action), artifactHash: String(l.artifactHash), inputs: (l.inputs ?? []).map(String), prevHash: String(l.prevHash) };
}

export function buildAibom(opts: { model?: string; steps: Array<{ party: string; role?: string; action?: string; artifactHash: string; inputs?: string[]; keys: { publicKey: KeyObject; privateKey: KeyObject } }> }): AibomCertificate {
  const steps = Array.isArray(opts.steps) ? opts.steps : [];
  const links: LineageLink[] = []; let prevHash = "genesis";
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const body = linkBody({ seq: i, party: s.party, role: s.role ?? "", action: s.action ?? "", artifactHash: s.artifactHash, inputs: s.inputs ?? [], prevHash });
    const linkHash = createHash("sha256").update(canonical(body)).digest("hex");
    const pem = s.keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const signature = edSign(null, Buffer.from(linkHash), s.keys.privateKey).toString("base64");
    links.push({ ...body, linkHash, signerFingerprint: fingerprint(pem), signature, publicKeyPem: pem });
    prevHash = linkHash;
  }
  const parties: string[] = []; for (const l of links) if (!parties.includes(l.signerFingerprint)) parties.push(l.signerFingerprint);
  const headHash = links.length ? links[links.length - 1].linkHash : "genesis";
  const payloadHash = createHash("sha256").update(canonical(links.map((l) => l.linkHash))).digest("hex");
  return { standard: "melete-aibom/v1", model: String(opts.model ?? "model"), n: links.length, links, parties, headHash, payloadHash, algo: "ed25519+sha256" };
}

export function verifyAibom(c: AibomCertificate): { ok: boolean; reason: string } {
  try {
    if (c.standard !== "melete-aibom/v1") return { ok: false, reason: "unknown standard" };
    if (!Array.isArray(c.links) || c.links.length !== c.n) return { ok: false, reason: "link count mismatch" };
    let prevHash = "genesis"; const seenArtifacts = new Set<string>();
    for (let i = 0; i < c.links.length; i++) {
      const l = c.links[i];
      if (l.seq !== i) return { ok: false, reason: `link ${i} out of order (seq ${l.seq})` };
      if (l.prevHash !== prevHash) return { ok: false, reason: `chain broken at step ${i} — a step was inserted/removed/reordered` };
      const linkHash = createHash("sha256").update(canonical(linkBody(l))).digest("hex");
      if (linkHash !== l.linkHash) return { ok: false, reason: `step ${i} (${l.party}) was altered — link hash mismatch` };
      if (fingerprint(l.publicKeyPem) !== l.signerFingerprint) return { ok: false, reason: `step ${i} signer fingerprint inconsistent` };
      if (!edVerify(null, Buffer.from(l.linkHash), createPublicKey(l.publicKeyPem), Buffer.from(l.signature, "base64"))) return { ok: false, reason: `step ${i} (${l.party}) signature invalid — not signed by the recorded party key` };
      for (const inp of l.inputs) if (!seenArtifacts.has(inp)) return { ok: false, reason: `step ${i} (${l.party}) declares input ${inp.slice(0, 10)}… that no earlier step produced — broken provenance` };
      seenArtifacts.add(l.artifactHash);
      prevHash = l.linkHash;
    }
    const parties: string[] = []; for (const l of c.links) if (!parties.includes(l.signerFingerprint)) parties.push(l.signerFingerprint);
    if (canonical(parties) !== canonical(c.parties)) return { ok: false, reason: "party set inconsistent" };
    const headHash = c.links.length ? c.links[c.links.length - 1].linkHash : "genesis";
    if (headHash !== c.headHash) return { ok: false, reason: "head hash mismatch" };
    const payloadHash = createHash("sha256").update(canonical(c.links.map((l) => l.linkHash))).digest("hex");
    if (payloadHash !== c.payloadHash) return { ok: false, reason: "payload hash mismatch" };
    return { ok: true, reason: `${c.n}-step lineage of '${c.model}', ${c.parties.length} distinct parties [${c.links.map((l) => l.party + ":" + l.role).join(" → ")}]` };
  } catch (e) { return { ok: false, reason: "exception: " + (e as Error).message.slice(0, 80) }; }
}

export function aibomReport(c: AibomCertificate): { model: string; steps: Array<{ seq: number; party: string; role: string; action: string; signer: string }>; distinctParties: number } {
  return { model: c.model, steps: c.links.map((l) => ({ seq: l.seq, party: l.party, role: l.role, action: l.action, signer: l.signerFingerprint })), distinctParties: c.parties.length };
}

export function aibomGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const ah = (s: string) => createHash("sha256").update(s).digest("hex");
  const kBase = generateKeyPairSync("ed25519"), kFt = generateKeyPairSync("ed25519"), kOpt = generateKeyPairSync("ed25519"), kDep = generateKeyPairSync("ed25519");
  const aBase = ah("base-weights"), aFt = ah("finetuned"), aOpt = ah("quantized"), aDep = ah("deployed");
  const steps = [
    { party: "OpenWeights Inc", role: "base-model", action: "pretrain", artifactHash: aBase, inputs: [], keys: kBase },
    { party: "FinTuneCo", role: "fine-tuner", action: "fine-tune on domain data", artifactHash: aFt, inputs: [aBase], keys: kFt },
    { party: "EdgeOpt", role: "optimizer", action: "int8 quantize", artifactHash: aOpt, inputs: [aFt], keys: kOpt },
    { party: "BankCo", role: "deployer", action: "deploy to prod", artifactHash: aDep, inputs: [aOpt], keys: kDep },
  ];
  const lineage = buildAibom({ model: "credit-model-v3", steps });
  const multiParty = verifyAibom(lineage).ok && lineage.parties.length === 4;
  const rep = aibomReport(lineage);
  const attribution = rep.distinctParties === 4 && rep.steps[1].party === "FinTuneCo" && rep.steps[1].role === "fine-tuner" && rep.steps[3].role === "deployer";

  // TAMPER: alter a step's artifact hash ⇒ caught
  const tampered = JSON.parse(JSON.stringify(lineage)); tampered.links[1].artifactHash = ah("evil");
  const tamperCaught = !verifyAibom(tampered).ok;
  // REORDER: swap two steps ⇒ chain breaks
  const reordered = JSON.parse(JSON.stringify(lineage)); const t = reordered.links[1]; reordered.links[1] = reordered.links[2]; reordered.links[2] = t;
  const reorderCaught = !verifyAibom(reordered).ok;
  // REMOVE a step ⇒ chain breaks
  const removed = JSON.parse(JSON.stringify(lineage)); removed.links.splice(2, 1); removed.n = removed.links.length;
  const removeCaught = !verifyAibom(removed).ok;
  // IMPERSONATION: change a step's party NAME without re-signing ⇒ link hash / sig breaks
  const renamed = JSON.parse(JSON.stringify(lineage)); renamed.links[0].party = "Imposter Corp";
  const impersonationCaught = !verifyAibom(renamed).ok;
  // FORGED-SIGNER: replace a link's key with a different one (sig no longer matches) ⇒ caught
  const forged = JSON.parse(JSON.stringify(lineage)); forged.links[2].publicKeyPem = lineage.links[0].publicKeyPem; forged.links[2].signerFingerprint = lineage.links[0].signerFingerprint;
  const forgedSignerCaught = !verifyAibom(forged).ok;
  // BROKEN-PROVENANCE: a step declares an input artifact that no earlier step produced
  const dangling = buildAibom({ model: "x", steps: [{ party: "A", role: "r", action: "a", artifactHash: ah("a1"), inputs: [ah("ghost")], keys: kBase }] });
  const brokenProvenanceCaught = !verifyAibom(dangling).ok;
  // genuine single-step with no inputs is fine
  const genesisOk = verifyAibom(buildAibom({ model: "x", steps: [{ party: "A", role: "base", action: "pretrain", artifactHash: ah("a1"), inputs: [], keys: kBase }] })).ok;

  const d1 = buildAibom({ model: "m", steps }), d2 = buildAibom({ model: "m", steps });
  const deterministic = d1.payloadHash === d2.payloadHash && verifyAibom(d1).ok;
  let total = true; try { buildAibom({ steps: [] }); verifyAibom({} as AibomCertificate); } catch { total = false; }

  const checks = [
    { name: "MULTI-PARTY-CHAIN (≥3 signers)", pass: multiParty, detail: `a 4-step lineage (base-model → fine-tune → quantize → deploy) signed by 4 DIFFERENT party keys verifies — ${lineage.parties.length} distinct signers` },
    { name: "RESPONSIBILITY-MAP (attribution)", pass: attribution, detail: "each step is attributed to the right party + role + signer fingerprint — who is accountable for which step" },
    { name: "TAMPER-CAUGHT", pass: tamperCaught, detail: "altering any step's artifact hash breaks that link's hash and signature" },
    { name: "REORDER-CAUGHT", pass: reorderCaught, detail: "swapping two steps breaks the prev-hash chain" },
    { name: "REMOVE-CAUGHT", pass: removeCaught, detail: "deleting a step (to hide a transformation) breaks the chain" },
    { name: "IMPERSONATION-CAUGHT", pass: impersonationCaught, detail: "renaming a step's party without re-signing breaks the link — a name is bound to its signer's key" },
    { name: "FORGED-SIGNER-CAUGHT", pass: forgedSignerCaught, detail: "swapping a link's recorded key (to fake who signed) fails signature verification" },
    { name: "BROKEN-PROVENANCE-CAUGHT", pass: brokenProvenanceCaught && genesisOk, detail: "a step deriving from an artifact no earlier step produced is flagged; a genuine no-input base step is fine" },
    { name: "DETERMINISTIC", pass: deterministic, detail: "same steps + keys → byte-identical lineage" },
    { name: "TOTAL", pass: total, detail: "empty / malformed lineage never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
