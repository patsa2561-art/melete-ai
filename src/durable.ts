/**
 * 💾 THE DURABLE PUBLIC LOG — turn the AI Transparency Log (R50) + Witness Network (R51) from a per-request demo
 * into a REAL, persistent public good that survives restarts and that anyone can submit to and monitor.
 *
 * A transparency log only matters if it actually PERSISTS: claims must accumulate over time, the signing key must
 * survive restarts (so a Signed Tree Head issued yesterday still verifies today), and the whole history must be
 * reconstructible from durable storage with the SAME Merkle root. This wraps the R50 log with durable storage: the
 * raw claims are appended to an append-only store, the log's Ed25519 key is persisted once and reloaded, and on
 * restart the entire log rebuilds to a byte-identical root — so inclusion proofs and append-only consistency proofs
 * issued before the restart still verify after it. Storage is injected (an in-memory store for tests, a file store
 * on the server), so the durability guarantee itself is measured, not assumed.
 *
 * WHO BENEFITS (a whole ecosystem, ≥4): ① SUBMITTERS get a permanent public record that does not vanish on a deploy;
 * ② AUDITORS can re-pull a months-old tree head and it still checks out; ③ MONITORS watch a live, growing log;
 * ④ the OPERATOR can restart / migrate the service without breaking a single past proof.
 *
 * (DIAKRISIS — MEASURED: a log rebuilt from durable storage after a simulated restart has the identical Merkle root
 * and the identical signing key; inclusion proofs survive the restart; an append-only consistency proof verifies
 * across the restart; editing the stored history changes the root, so a pre-restart Signed Tree Head no longer
 * matches → tamper detected; deterministic + total. HONEST: durability here means the log's OWN state is persistent
 * and reconstructible — it does not replicate the log across machines [that is the Witness Network's job, R51]; a
 * single-operator durable log + independent witnesses together give the full guarantee.)
 */
import { createTransparencyLog, verifySTH, verifyInclusion, verifyConsistency, type SignedTreeHead, type TransparencyLog } from "./translog.js";
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";

// injected durable storage — file-backed on the server, in-memory in tests
export interface LogStore { readLines: () => string[]; appendLine: (s: string) => void; readKeyPem: () => string | null; writeKeyPem: (pem: string) => void; }

export function memoryStore(seedLines?: string[], seedKeyPem?: string): LogStore {
  const lines: string[] = seedLines ? seedLines.slice() : []; let key: string | null = seedKeyPem ?? null;
  return { readLines: () => lines.slice(), appendLine: (s) => { lines.push(s); }, readKeyPem: () => key, writeKeyPem: (pem) => { key = pem; } };
}

function loadOrCreateKeys(store: LogStore): { publicKey: KeyObject; privateKey: KeyObject } {
  const pem = store.readKeyPem();
  if (pem) { const privateKey = createPrivateKey(pem); return { privateKey, publicKey: createPublicKey(privateKey) }; }
  const kp = generateKeyPairSync("ed25519");
  store.writeKeyPem(kp.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  return kp;
}

export interface DurableLog {
  logId: string; publicKeyPem: string;
  submit: (entry: string) => { index: number; sth: SignedTreeHead };
  size: () => number;
  sth: () => SignedTreeHead;
  inclusionProof: (index: number) => ReturnType<TransparencyLog["inclusionProof"]>;
  consistencyProof: (firstSize: number) => ReturnType<TransparencyLog["consistencyProof"]>;
  recent: (k?: number) => Array<{ index: number; entry: string }>;
}

// open (or reopen) a durable log backed by `store`. Rebuilds the full Merkle log from persisted raw entries.
export function openDurableLog(opts: { logId?: string; store: LogStore; now?: () => number }): DurableLog {
  const logId = String(opts.logId ?? "melete-public-claims");
  const keys = loadOrCreateKeys(opts.store);
  const raw = opts.store.readLines();
  const log = createTransparencyLog({ logId, keys, now: opts.now ?? (() => Date.now()) });
  for (const line of raw) log.append(line);
  const entries = raw.slice();
  return {
    logId, publicKeyPem: log.publicKeyPem,
    submit: (entry) => { const e = String(entry); opts.store.appendLine(e); entries.push(e); const index = log.append(e); return { index, sth: log.sth() }; },
    size: () => log.size(),
    sth: () => log.sth(),
    inclusionProof: (index) => log.inclusionProof(index),
    consistencyProof: (firstSize) => log.consistencyProof(firstSize),
    recent: (k = 10) => { const n = entries.length, start = Math.max(0, n - k); const out = []; for (let i = n - 1; i >= start; i--) out.push({ index: i, entry: entries[i] }); return out; },
  };
}

export function durableGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  // one shared durable store; "restart" = open a fresh DurableLog over the same store
  const store = memoryStore();
  const log1 = openDurableLog({ logId: "melete-ai-claims", store, now: () => 1 });
  for (let i = 0; i < 50; i++) log1.submit("melete-cert:" + i);
  const sthBefore = log1.sth();

  // ① DURABLE-REBUILD: reopen over the same store → identical root + identical signing key
  const log2 = openDurableLog({ logId: "melete-ai-claims", store, now: () => 2 });
  const sameRoot = log2.sth().rootHash === sthBefore.rootHash && log2.size() === 50;
  const sameKey = log2.publicKeyPem === log1.publicKeyPem;

  // ② INCLUSION-SURVIVES-RESTART: a proof pulled after restart verifies against the restarted STH
  const inclSurvives = verifyInclusion(log2.inclusionProof(42), log2.sth()).ok;
  // and a pre-restart STH still verifies (same key) and matches the rebuilt root
  const preStillValid = verifySTH(sthBefore).ok && verifyInclusion(log2.inclusionProof(7), sthBefore).ok;

  // ③ CONSISTENCY-ACROSS-RESTART: append more after restart, prove append-only from the pre-restart head
  for (let i = 50; i < 80; i++) log2.submit("melete-cert:" + i);
  const newSTH = log2.sth();
  const consistentAcross = verifyConsistency(log2.consistencyProof(50), sthBefore, newSTH).ok && newSTH.size === 80;

  // ④ TAMPER-DETECT: editing the persisted history changes the root → the pre-restart STH no longer matches
  const lines = store.readLines(); lines[10] = "REWRITTEN-claim"; const tamperedStore = memoryStore(lines, store.readKeyPem()!);
  const log3 = openDurableLog({ logId: "melete-ai-claims", store: tamperedStore, now: () => 3 });
  const tamperDetected = log3.sth().rootHash !== sthBefore.rootHash && !verifyConsistency(log3.consistencyProof(50), sthBefore, log3.sth()).ok;

  // ⑤ APPEND-WRITES exactly one line; recent() returns newest-first
  const before = store.readLines().length; log2.submit("one-more"); const wroteOne = store.readLines().length === before + 1;
  const rec = log2.recent(3); const recentOk = rec.length === 3 && rec[0].entry === "one-more" && rec[0].index === log2.size() - 1;

  // ⑥ FRESH-LOG: empty store creates + persists a key, then a second open reuses it
  const fresh = memoryStore(); const a = openDurableLog({ store: fresh }); a.submit("x"); const b = openDurableLog({ store: fresh });
  const freshPersists = b.publicKeyPem === a.publicKeyPem && b.size() === 1;

  let total = true; try { const s = memoryStore(); const l = openDurableLog({ store: s }); l.sth(); l.recent(); l.inclusionProof(0); } catch { total = false; }

  const checks = [
    { name: "DURABLE-REBUILD (survives restart)", pass: sameRoot && sameKey, detail: "after a simulated restart the log rebuilds from storage to the IDENTICAL Merkle root and the IDENTICAL signing key" },
    { name: "INCLUSION-SURVIVES-RESTART", pass: inclSurvives && preStillValid, detail: "inclusion proofs verify after the restart, and a tree head signed BEFORE the restart still verifies + matches the rebuilt log" },
    { name: "CONSISTENCY-ACROSS-RESTART", pass: consistentAcross, detail: "appending after a restart still proves append-only from the pre-restart tree head (50 → 80)" },
    { name: "TAMPER-OF-HISTORY DETECTED", pass: tamperDetected, detail: "editing the persisted history changes the root, so a pre-restart Signed Tree Head no longer matches — caught" },
    { name: "APPEND-WRITES (durable)", pass: wroteOne && recentOk, detail: "each submission appends exactly one durable line; the monitor's recent() lists newest-first" },
    { name: "FRESH-LOG-KEY-PERSISTS", pass: freshPersists, detail: "an empty store mints + persists a signing key once; reopening reuses it (stable identity)" },
    { name: "TOTAL", pass: total, detail: "an empty durable log never throws" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
