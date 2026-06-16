#!/usr/bin/env node
// Render the social cards (SVG → PNG) once, offline, into public/. resvg is a devDependency only —
// the shipped library + the running server stay zero-runtime-dep. Re-run after editing socialCard():
//   npm run build && npm run gen:og
import { Resvg } from "@resvg/resvg-js";
import { socialCard, AUDIENCE_KEYS } from "../dist/server.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ogDir = join(root, "public", "og");
mkdirSync(ogDir, { recursive: true });

function render(svg, file) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, background: "#05070e" });
  const png = r.render().asPng();
  writeFileSync(file, png);
  console.log("wrote", file.replace(root, "."), "·", png.length, "bytes");
}

render(socialCard(), join(root, "public", "og.png"));
for (const k of AUDIENCE_KEYS) render(socialCard(k), join(ogDir, k + ".png"));
console.log("done — " + (AUDIENCE_KEYS.length + 1) + " cards");
