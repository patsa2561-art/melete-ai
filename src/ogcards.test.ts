import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { AUDIENCE_KEYS } from "./server.js";

// PNG signature + IHDR width/height (offsets 16/20, big-endian) — proves the committed OG cards are real,
// correctly-sized raster images (1200×630, the Open-Graph standard) that Twitter/Facebook/LinkedIn render.
function pngInfo(path: string): { ok: boolean; w: number; h: number } {
  const b = readFileSync(path);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const ok = sig.every((v, i) => b[i] === v);
  return { ok, w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("OG social cards (raster)", () => {
  const files = ["public/og.png", ...AUDIENCE_KEYS.map((k) => "public/og/" + k + ".png")];
  it("master + every per-field card exists, is a valid PNG, and is exactly 1200×630", () => {
    for (const f of files) {
      expect(existsSync(f), f + " must exist (run `npm run gen:og`)").toBe(true);
      const { ok, w, h } = pngInfo(f);
      expect(ok, f + " must be a valid PNG").toBe(true);
      expect(w).toBe(1200);
      expect(h).toBe(630);
    }
  });
  it("covers the master card + all 8 fields", () => { expect(files.length).toBe(9); });
});
