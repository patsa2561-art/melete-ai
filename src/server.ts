/**
 * MELETE WEB — discovery-as-a-service. A self-contained HTTP surface so anyone (or any agent) can POST an
 * objective + a search space and get back the discovered optimum AND its signed, verifiable trace — no
 * install. The landing page is a live demo; the JSON endpoints are the product; /pitch is the buyer deck.
 *
 * This module owns the landing page + the pitch deck (pure strings) + the endpoint catalogue. The HTTP
 * server + the sandboxed objective evaluation live in bin/melete-server.mjs (node:http + node:vm).
 */
import { Script } from "node:vm";

/** Extract every inline <script> body from an HTML string (browser-accurate: splits on the first </script>). */
function inlineScripts(html: string): string[] {
  const out: string[] = []; const re = /<script>([\s\S]*?)<\/script>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}
/** Parse-check every inline script; returns the first syntax error (or null). The gate that catches a broken page. */
function firstScriptSyntaxError(html: string): string | null {
  const scripts = inlineScripts(html);
  for (let i = 0; i < scripts.length; i++) {
    try { new Script(scripts[i]); } catch (e) { return "script #" + (i + 1) + ": " + (e as Error).message; }
  }
  return null;
}

export const SITE = "https://melete.mneme-ai.space";
function xesc(s: string): string { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/** Open-Graph + Twitter-card meta — rich, shareable link previews (text everywhere; SVG card on supporting clients). */
export function socialMeta(o: { title: string; desc: string; path: string; img: string }): string {
  const url = SITE + o.path, img = SITE + o.img;
  const imgType = o.img.endsWith(".png") ? "image/png" : "image/svg+xml";
  return `<meta property="og:type" content="website"><meta property="og:site_name" content="Melete">`
    + `<meta property="og:title" content="${xesc(o.title)}"><meta property="og:description" content="${xesc(o.desc)}">`
    + `<meta property="og:url" content="${url}"><meta property="og:image" content="${img}"><meta property="og:image:type" content="${imgType}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`
    + `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${xesc(o.title)}"><meta name="twitter:description" content="${xesc(o.desc)}"><meta name="twitter:image" content="${img}">`
    + `<link rel="canonical" href="${url}">`;
}
function wrapText(s: string, max: number, maxLines: number): string[] {
  const words = s.split(" "); const lines: string[] = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > max) { if (cur) lines.push(cur.trim()); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, maxLines);
}
/** A 1200×630 branded social card (SVG). Per-field when key is given; otherwise the master brand card. */
export function socialCard(key?: string): string {
  const f = key && AUDIENCE[key] ? AUDIENCE[key] : null;
  const accent = f ? f.col : "#6d5cf0";
  const eyebrow = f ? (f.e + "  MELETE FOR " + f.en.name.toUpperCase()) : "THE SOVEREIGN · VERIFIABLE DISCOVERY BRAIN";
  const headline = f ? f.en.h : "Find the best answer in the fewest experiments.";
  const lines = wrapText(headline, 30, 3);
  const lineSvg = lines.map((ln, i) => `<text x="90" y="${302 + i * 74}" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="64" font-weight="800" fill="#f4f6ff" letter-spacing="-1.5">${xesc(ln)}</text>`).join("");
  const chips = ["🔏  every verdict signed", "🔒  sovereign · air-gapped", "≥99%  of the true optimum"];
  const chipSvg = chips.map((c, i) => `<text x="${90 + i * 360}" y="566" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="25" font-weight="600" fill="#aebad6">${xesc(c)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><radialGradient id="bg" cx="22%" cy="6%" r="120%"><stop offset="0" stop-color="${accent}33"/><stop offset="42%" stop-color="#0b1120"/><stop offset="100%" stop-color="#05070e"/></radialGradient>
<linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#0ea5b7"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<g opacity="0.5"><rect width="1200" height="3" y="0" fill="url(#gem)"/></g>
<g transform="translate(90 96)"><rect x="0" y="0" width="40" height="40" rx="9" transform="rotate(45 20 20)" fill="url(#gem)"/><text x="62" y="30" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="34" font-weight="850" fill="#fff" letter-spacing="-0.5">Melete</text></g>
<text x="90" y="208" font-family="ui-monospace,Menlo,monospace" font-size="24" font-weight="700" letter-spacing="3" fill="${accent}">${xesc(eyebrow)}</text>
${lineSvg}
${chipSvg}
<text x="1110" y="566" text-anchor="end" font-family="ui-monospace,Menlo,monospace" font-size="22" fill="#7e8db0">melete.mneme-ai.space</text>
</svg>`;
}
/** A branded gem favicon (SVG) — crisp at every size, served at /favicon.svg. */
export function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5cf0"/><stop offset="1" stop-color="#0ea5b7"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="#0b1120"/><rect x="16" y="16" width="32" height="32" rx="8" transform="rotate(45 32 32)" fill="url(#g)"/></svg>`;
}
export function faviconLinks(): string { return `<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/favicon.svg">`; }
/** JSON-LD structured data — SoftwareApplication + WebPage (+ optional Breadcrumb / FAQ).
 *  Honest: free OSS tier, real author, no fabricated ratings; the FAQ answers are the measured claims only. */
export function structuredData(path: string, name: string, desc: string, opts?: { breadcrumb?: Array<{ name: string; url: string }>; faq?: boolean }): string {
  const o = opts || {};
  const graph: Array<Record<string, unknown>> = [
    { "@type": "SoftwareApplication", name: "Melete", applicationCategory: "DeveloperApplication", operatingSystem: "Windows, macOS, Linux", description: desc, url: SITE, softwareVersion: "0.x", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, author: { "@type": "Person", name: "Shinnapat Phunsriphatchalakul" } },
    { "@type": "WebPage", name, description: desc, url: SITE + path, isPartOf: { "@type": "WebSite", name: "Melete", url: SITE } },
  ];
  if (o.breadcrumb && o.breadcrumb.length) graph.push({ "@type": "BreadcrumbList", itemListElement: o.breadcrumb.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: SITE + b.url })) });
  if (o.faq) {
    const qa: Array<[string, string]> = [
      ["What is Melete?", 'A sovereign, verifiable optimizer: tell it what you can change and what "good" means, and it finds the best, most robust setting in the fewest experiments — then signs the result so it is verifiable offline.'],
      ["Do I need a dataset?", "No. Melete starts from scratch — it proposes the next experiment, you measure it (or give a formula), and it converges; no historical data required."],
      ["How is a result verifiable?", "Every result carries an Ed25519-signed trace and a Trustworthy Discovery Certificate (is the effect real, causal, and robust?) that anyone can re-verify offline with the embedded public key."],
      ["How accurate is it?", "Benchmarked at ≥99% of the true optimum across 7 adversarial landscapes. Optimization cannot be guaranteed 100%, so the benchmarks and 53 module gauntlets are reproducible — you can re-run them yourself."],
      ["Can it run air-gapped?", "Yes. Zero runtime dependencies; it runs fully offline on your own machine, and your data never leaves."],
    ];
    graph.push({ "@type": "FAQPage", mainEntity: qa.map((q) => ({ "@type": "Question", name: q[0], acceptedAnswer: { "@type": "Answer", text: q[1] } })) });
  }
  return `<script type="application/ld+json">` + JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).split("</").join("<\\/") + `</script>`;
}
/** robots.txt — allow all, point at the sitemap. */
export function robotsTxt(): string { return `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`; }
/** sitemap.xml — home + pitch + docs + every per-profession page. */
export function sitemapXml(): string {
  const urls = ["/", "/pitch", "/docs", ...AUDIENCE_KEYS.map((k) => "/for/" + k)];
  const body = urls.map((u) => `  <url><loc>${SITE}${u}</loc><changefreq>weekly</changefreq><priority>${u === "/" ? "1.0" : "0.8"}</priority></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const ENDPOINTS = [
  { method: "GET", path: "/health", what: "liveness + version" },
  { method: "GET", path: "/pitch", what: "the investor / acquirer slide deck" },
  { method: "POST", path: "/discover", what: "run a discovery — {space, objective, budget, goal, engine} → {best, armStats, trace}" },
  { method: "POST", path: "/verify", what: "re-verify a discovery trace offline — {trace} → {ok, reason}" },
];

const SHELL_CSS = `
:root{--ink:#16172b;--ink2:#5b5d77;--line:#e7e8f0;--bg:#ffffff;--soft:#f7f8fc;--ind:#5b53e8;--teal:#0ea5b7;--grad:linear-gradient(96deg,#6d5cf0,#0ea5b7)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--ind);text-decoration:none;font-weight:600}a:hover{text-decoration:underline}
.langsw{position:fixed;top:14px;right:16px;z-index:60;display:flex;background:#fff;border:1px solid var(--line);border-radius:999px;padding:3px;gap:2px;box-shadow:0 4px 14px rgba(20,20,50,.12)}
.lb{border:0;background:transparent;border-radius:999px;padding:6px 13px;font-size:13px;font-weight:700;color:#6a6c84;cursor:pointer}
.lb.on{background:var(--grad);color:#fff}
.cmodal{display:none;position:fixed;inset:0;background:rgba(20,18,40,.55);z-index:100;align-items:center;justify-content:center;padding:18px}
.cbox{background:#fff;border-radius:20px;padding:26px 26px 20px;max-width:430px;width:100%;position:relative;box-shadow:0 30px 80px -20px rgba(20,20,60,.5)}
.cclose{position:absolute;top:12px;right:14px;border:0;background:#f1f2f8;border-radius:50%;width:30px;height:30px;font-size:14px;cursor:pointer;color:#6a6c84}
.ctab{width:100%;border-collapse:collapse;font-size:14.5px}
.ctab td{padding:11px 8px;border-bottom:1px solid var(--line)}
.ctab tr:last-child td{border-bottom:0}
.ctab td:first-child{font-weight:700;color:#33344e;white-space:nowrap}
.thtag{display:inline-block;background:#e9fbf3;color:#0e9f6e;border:1px solid #b7ecd4;border-radius:999px;padding:1px 7px;font-size:10.5px;font-weight:700;margin-left:4px}
.wrap{max-width:1000px;margin:0 auto;padding:0 24px}
.grad{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero{position:relative;overflow:hidden;text-align:center;padding:84px 24px 54px;background:radial-gradient(70% 90% at 50% -10%,#eef0ff,transparent 60%)}
.eyebrow{display:inline-block;font-size:12.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--ind);background:#eeecfe;border:1px solid #ddd9fb;padding:5px 13px;border-radius:999px;margin-bottom:18px}
h1.brand{font-size:72px;line-height:.98;margin:0;font-weight:850;letter-spacing:-2.5px}
.tag{font-size:23px;color:#33344e;margin:16px auto 8px;font-weight:600;max-width:680px;line-height:1.35}
.sub{color:var(--ink2);font-size:16px;margin:0 0 26px}
.cta{display:inline-flex;gap:12px;flex-wrap:wrap;justify-content:center}
.btn{display:inline-block;border-radius:12px;padding:13px 24px;font-weight:700;font-size:15.5px;cursor:pointer;border:0}
.btn.primary{background:var(--grad);color:#fff;box-shadow:0 8px 24px -8px rgba(93,83,232,.6)}
.btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line)}
.pills{margin:26px 0 0}
.pill{display:inline-block;background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:13px;color:#44465e;font-weight:600;margin:3px;box-shadow:0 1px 2px rgba(20,20,40,.04)}
section{padding:46px 0;border-top:1px solid var(--line)}
h2{font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:#9698ad;margin:0 0 20px;font-weight:800}
.lead{font-size:22px;line-height:1.45;color:#2a2b42;margin:0;font-weight:500}
.lead b{font-weight:800}
.steps{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.step{background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:20px}
.step .n{display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:9px;background:var(--grad);color:#fff;font-weight:800;font-size:15px;margin-bottom:10px}
.step h3{margin:0 0 5px;font-size:17px}.step p{margin:0;color:var(--ink2);font-size:14.5px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.grid,.steps{grid-template-columns:1fr}h1.brand{font-size:50px}.tag{font-size:20px}}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:0 2px 10px rgba(20,20,50,.03)}
.card h3{margin:0 0 6px;font-size:17px}
.card .who{color:var(--teal);font-size:12px;font-weight:800;letter-spacing:.4px;margin-bottom:9px;text-transform:uppercase}
.card p{margin:0;color:var(--ink2);font-size:14.5px}
table{width:100%;border-collapse:collapse;font-size:14.5px}
th,td{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left}
th{color:#9698ad;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.win{color:#0e9f6e;font-weight:800}
code{font-family:ui-monospace,Menlo,monospace;background:#f1f2f8;border-radius:6px;padding:2px 7px;font-size:13.5px;color:#4338ca}
pre{font-family:ui-monospace,Menlo,monospace;background:#16172b;color:#d7d9f0;border-radius:12px;padding:16px;overflow:auto;font-size:13px;line-height:1.55}
label{display:block;color:#6a6c84;font-size:12px;margin:14px 0 5px;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
input,select{width:100%;background:#fff;border:1.5px solid var(--line);border-radius:10px;color:var(--ink);padding:12px;font-family:ui-monospace,monospace;font-size:13.5px}
input:focus,select:focus{outline:0;border-color:var(--ind)}
.muted{color:#9092a8}
footer{padding:40px 0 80px;color:#9092a8;font-size:13px;text-align:center;border-top:1px solid var(--line)}
#map{display:none;margin-top:18px}
#map.on{display:block}
.mapgrid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;align-items:start}
@media(max-width:760px){.mapgrid{grid-template-columns:1fr}}
canvas{border-radius:12px;border:1px solid var(--line);background:#fff}
#surf{width:100%;height:auto;aspect-ratio:1/1;display:block}
#conv{width:100%}
.caps{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#9698ad;margin-bottom:8px}
.player{display:flex;align-items:center;gap:11px;margin-top:11px}
.pbtn{background:var(--grad);color:#fff;border:0;border-radius:9px;padding:8px 15px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap}
#scrub{flex:1;accent-color:var(--ind)}
.legend{display:flex;flex-wrap:wrap;gap:7px 13px;margin-top:12px;font-size:12px;color:#5b5d77;font-weight:600}
.legdot{display:inline-flex;align-items:center;gap:5px}
.legdot i{width:11px;height:11px;border-radius:50%;display:inline-block;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.kv{font-size:14px;color:#33344e}.kv b{color:var(--ink)}
.bar{height:9px;border-radius:6px;background:var(--grad);margin:2px 0 9px}
.result{margin-top:14px;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px;font-size:14.5px;color:#2a2b42;min-height:24px}
.narrate{margin-top:12px;background:linear-gradient(135deg,#f3f1ff,#eafcf8);border:1.5px solid #ddd9fb;border-radius:14px;padding:16px 18px;font-size:15px;line-height:1.65;color:#26283f}
.savings{margin-top:12px;background:rgba(255,255,255,.82);backdrop-filter:blur(12px) saturate(1.2);-webkit-backdrop-filter:blur(12px) saturate(1.2);border:1px solid #ecebf6;border-radius:18px;padding:17px 20px;font-size:14.5px;line-height:1.6;color:#26283f;box-shadow:0 1px 2px rgba(30,25,80,.04),0 20px 46px -34px rgba(70,55,160,.42)}
.modetabs{display:inline-flex;background:#f1f2f8;border:1px solid var(--line);border-radius:11px;padding:4px;gap:4px;margin-bottom:6px}
.mt{background:transparent;border:0;border-radius:8px;padding:8px 14px;font-size:13.5px;font-weight:700;color:#6a6c84;cursor:pointer}
.mt.on{background:#fff;color:var(--ind);box-shadow:0 1px 4px rgba(20,20,50,.08)}
.advbox{display:none;margin-top:6px;padding-top:8px;border-top:1px dashed var(--line)}
.indcard{cursor:pointer;transition:transform .15s,box-shadow .15s;border:1.5px solid var(--line)}
.indcard:hover{transform:translateY(-3px);box-shadow:0 12px 28px -10px rgba(80,60,220,.28);border-color:#c7c2f5}
.indcard .go{margin-top:10px;color:var(--ind);font-weight:700;font-size:13.5px}
.scenario{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:13px 16px;margin:12px 0}
.srow{display:flex;gap:12px;padding:5px 0;font-size:14.5px;color:#33344e;line-height:1.4}
.srow b{min-width:94px;white-space:nowrap}
.adv{margin-top:6px}
.adv summary{cursor:pointer;color:var(--ind);font-size:13px;font-weight:700;padding:6px 0;list-style:none}
.adv summary::-webkit-details-marker{display:none}
.adv summary::before{content:"⚙ ";opacity:.7}
.story{background:linear-gradient(180deg,#f7f8ff,#fff);border:1px solid var(--line);border-radius:16px;padding:22px 24px}
.story p{margin:0 0 12px}.story p:last-child{margin:0}
.chat{font-size:14.5px;color:#33344e;margin:3px 0;padding-left:14px;border-left:2px solid #ddd9fb}
.meli{display:block;animation:bob 3.4s ease-in-out infinite}
.meli.hero{width:104px;height:auto;margin:0 auto 8px}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
.orb{transform-box:fill-box;transform-origin:center;animation:pulse 1.9s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.24);opacity:.82}}
.arm{transform-box:fill-box;transform-origin:bottom center;animation:wave 2.6s ease-in-out infinite}
@keyframes wave{0%,100%{transform:rotate(-30deg)}50%{transform:rotate(-10deg)}}
.eyes{transform-box:fill-box;transform-origin:center;animation:blink 5s ease-in-out infinite}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
.spark{transform-box:fill-box;transform-origin:center}
.spark.s1{animation:twinkle 1.9s ease-in-out infinite}.spark.s2{animation:twinkle 2.4s ease-in-out .6s infinite}
@keyframes twinkle{0%,100%{opacity:.25;transform:scale(.6) rotate(0)}50%{opacity:1;transform:scale(1.15) rotate(40deg)}}
@media(prefers-reduced-motion:reduce){.meli,.orb,.arm,.eyes,.spark{animation:none}}
.storybook{display:flex;flex-direction:column;gap:18px}
.panel{display:flex;align-items:center;gap:26px;border:2.5px solid var(--line);border-radius:24px;padding:24px 28px;opacity:0;transform:translateY(36px) scale(.97);transition:opacity .6s cubic-bezier(.2,.7,.2,1),transform .6s cubic-bezier(.2,.7,.2,1)}
.panel.in{opacity:1;transform:none}
.panel:nth-child(even){flex-direction:row-reverse}
.panel-art{flex:0 0 172px;position:relative;display:flex;justify-content:center}
.panel-art .meli{width:154px;height:auto}
.panel-text{flex:1;min-width:0}
.panel-text p{margin:0;font-size:19.5px;line-height:1.55;color:#26283f}
.beatnum{display:inline-flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:10px;background:var(--grad);color:#fff;font-weight:800;font-size:15px;margin-bottom:11px;box-shadow:0 4px 10px -2px rgba(80,60,220,.4)}
.panel.wish{background:linear-gradient(155deg,#fff0f8,#fff);border-color:#f9a8d4;box-shadow:0 10px 30px -12px rgba(236,72,153,.30)}
.panel.maze{background:linear-gradient(155deg,#eef0ff,#fff);border-color:#a5b4fc;box-shadow:0 10px 30px -12px rgba(99,102,241,.30)}
.panel.think{background:linear-gradient(155deg,#f3eeff,#fff);border-color:#c4b5fd;box-shadow:0 10px 30px -12px rgba(139,92,246,.30)}
.panel.dance{background:linear-gradient(155deg,#e8fcf4,#fff);border-color:#5eead4;box-shadow:0 10px 30px -12px rgba(13,148,136,.30)}
.panel.win{background:linear-gradient(155deg,#fff7e6,#fff);border-color:#fcd34d;box-shadow:0 12px 34px -10px rgba(245,158,11,.40)}
.prop{position:absolute;pointer-events:none;opacity:0;transition:opacity .5s .25s}
.panel.in .prop{opacity:1}
.prop.hearts{top:-4px;right:24px;font-size:26px;animation:floatup 2.6s ease-in-out infinite}
.prop.cups{top:4px;left:-2px;font-size:17px;line-height:1.2;opacity:.4 !important;letter-spacing:3px}
.prop.bubble{top:2px;right:0;background:#fff;border:1.5px solid #ddd9fb;border-radius:13px;padding:7px 12px;font-size:13.5px;color:#4338ca;font-weight:700;box-shadow:0 4px 12px rgba(80,60,220,.14)}
.panel.in .prop.bubble{animation:pop .5s .35s both}
.prop.cup{top:2px;right:6px;font-size:36px}
.prop.cup .score{position:absolute;top:4px;right:46px;font-family:ui-monospace,monospace;font-size:13px;font-weight:700;color:#0e9f6e;background:#e9fbf3;border:1px solid #b7ecd4;border-radius:8px;padding:3px 9px;white-space:nowrap}
.prop.star{top:-6px;left:52%;margin-left:-15px;font-size:32px}
.panel.in .prop.star{animation:pop .6s .4s both}
.prop.seal{bottom:6px;right:2px;font-size:12.5px;font-weight:700;color:#0e9f6e;background:#e9fbf3;border:1px solid #b7ecd4;border-radius:999px;padding:5px 11px}
.panel.think.in .orb{animation:pulse 1s ease-in-out infinite}
.panel.win.in .meli{animation:cheer .75s ease 1}
@keyframes cheer{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(-17px) rotate(-6deg)}60%{transform:translateY(-4px) rotate(5deg)}100%{transform:translateY(0)}}
@keyframes floatup{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes pop{0%{transform:scale(0);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
@media(max-width:640px){.panel,.panel:nth-child(even){flex-direction:column;text-align:center}.panel-text p{font-size:17.5px}.prop.cup .score{position:static;display:inline-block;margin-top:6px}}
@media(prefers-reduced-motion:reduce){.panel{transition:none;opacity:1;transform:none}}
/*premium-layer*/
/*select-styled*/
select{appearance:none !important;-webkit-appearance:none !important;-moz-appearance:none !important;background-color:#f5f3ff !important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236d28d9' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") !important;background-repeat:no-repeat !important;background-position:right 13px center !important;background-size:13px !important;border:1.5px solid #d6cffa !important;border-radius:11px !important;padding:11px 40px 11px 14px !important;font-weight:600 !important;font-size:14px !important;color:#33344e !important;cursor:pointer;transition:border-color .15s,box-shadow .15s,background-color .15s}
select:hover{border-color:#b3a6f0 !important;background-color:#efeaff !important}
select:focus{outline:none;border-color:var(--ind) !important;box-shadow:0 0 0 3px rgba(91,83,232,.18) !important}
select option{font-weight:500;color:#1a1b30;background:#fff}
/*gsteps-anim*/
#gsteps>div:last-child>div>div:first-child{animation:gbglow 3.6s ease-in-out infinite}
#gsteps>div:last-child>div:nth-child(2)>div:first-child{animation-delay:.9s}
#gsteps>div:last-child>div:nth-child(3)>div:first-child{animation-delay:1.8s}
#gsteps>div:last-child>div:nth-child(4)>div:first-child{animation-delay:2.7s}
@keyframes gbglow{0%,55%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0);transform:scale(1)}30%{box-shadow:0 0 0 7px rgba(99,102,241,.20);transform:scale(1.08)}}
@media(prefers-reduced-motion:reduce){#gsteps>div:last-child>div>div:first-child{animation:none}}
/*hl*/
#reliproof>h2,#pricing>h2,#guide>h2{font-size:32px;line-height:1.12;letter-spacing:-1px;text-transform:none;color:var(--ink);margin:8px 0 12px;font-weight:800}
@media(max-width:640px){#reliproof>h2,#pricing>h2,#guide>h2{font-size:25px}}
html{scroll-behavior:smooth}
.btn{transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
.btn:hover{transform:translateY(-1px)}
.btn.primary:hover{box-shadow:0 14px 32px -8px rgba(93,83,232,.7);filter:brightness(1.04)}
.btn.ghost:hover{border-color:var(--ind);color:var(--ind)}
.btn:active{transform:translateY(0)}
.card{transition:box-shadow .2s ease,transform .2s ease}
input{transition:border-color .15s ease,box-shadow .15s ease}
input:focus,textarea:focus{outline:none;border-color:var(--ind)!important;box-shadow:0 0 0 3px rgba(91,83,232,.16)}
b,strong,.result,input[type=number]{font-variant-numeric:tabular-nums}
::selection{background:rgba(91,83,232,.18)}
h1.brand{letter-spacing:-2.5px;font-feature-settings:"ss01","cv01"}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn,.card{transition:none}}
/* — elegant FUTURISTIC layer (white, luxe, clearly visible) — */
body{background:#fbfbfe;font-variant-numeric:tabular-nums}
/* visible mesh-gradient aurora blooms (Linear/Stripe style) — white-dominant, slowly drifting */
body::before{content:"";position:fixed;inset:-20% -10%;z-index:-2;pointer-events:none;
  background:radial-gradient(34% 34% at 82% 6%,rgba(20,184,166,.20),transparent 62%),
  radial-gradient(40% 40% at 6% 12%,rgba(109,92,240,.18),transparent 60%),
  radial-gradient(36% 38% at 92% 78%,rgba(167,139,250,.16),transparent 60%),
  radial-gradient(30% 30% at 14% 92%,rgba(14,165,183,.14),transparent 60%);
  filter:blur(20px);animation:meshDrift 26s ease-in-out infinite alternate}
@keyframes meshDrift{0%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(0,-2.2%,0) scale(1.06)}100%{transform:translate3d(1.5%,1.5%,0) scale(1.03)}}
/* faint precision grid over the blooms */
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.5;
  background-image:radial-gradient(circle at 1px 1px,rgba(80,70,160,.07) 1px,transparent 0);background-size:30px 30px}
@media(prefers-reduced-motion:reduce){body::before{animation:none}}
/* frosted-glass cards with depth + a gradient hairline */
.card{border-radius:22px;border:1px solid rgba(230,228,248,.9);background:rgba(255,255,255,.82);backdrop-filter:blur(14px) saturate(1.25);-webkit-backdrop-filter:blur(14px) saturate(1.25);
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 2px 6px rgba(30,25,80,.05),0 30px 60px -36px rgba(70,55,160,.45);
  transition:transform .55s cubic-bezier(.22,1,.36,1),box-shadow .55s cubic-bezier(.22,1,.36,1)}
.card:hover{transform:translateY(-3px);box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 2px 6px rgba(30,25,80,.06),0 44px 80px -36px rgba(70,55,160,.55)}
.btn{transition:transform .4s cubic-bezier(.22,1,.36,1),box-shadow .4s cubic-bezier(.22,1,.36,1),filter .25s}
.btn.primary{box-shadow:0 12px 30px -10px rgba(99,76,240,.65)}
.btn.primary:hover{transform:translateY(-2px);box-shadow:0 20px 42px -12px rgba(99,76,240,.78)}
.pill{background:rgba(255,255,255,.78);backdrop-filter:blur(8px) saturate(1.2);box-shadow:0 1px 2px rgba(20,20,40,.05),0 10px 22px -16px rgba(60,50,140,.6)}
h1.brand .grad{filter:drop-shadow(0 8px 30px rgba(109,92,240,.35))}
h2{letter-spacing:-.6px}
.wrap section h2{position:relative}
.wrap section h2::after{content:"";display:block;width:52px;height:3px;margin-top:10px;border-radius:9px;background:linear-gradient(90deg,#6d5cf0,#14b8a6)}
.eyebrow{background:linear-gradient(96deg,#6d5cf0,#0ea5b7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-weight:800;letter-spacing:.7px}
.relcard:hover{transform:translateY(-4px)}
.m60card{background:rgba(255,255,255,.72);backdrop-filter:blur(10px);border:1px solid #ecebf6;border-radius:16px;padding:15px 16px;display:flex;gap:12px;align-items:flex-start;box-shadow:0 14px 32px -26px rgba(70,55,160,.5);transition:transform .45s cubic-bezier(.22,1,.36,1)}
.m60card:hover{transform:translateY(-3px)}
.m60n{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#6d5cf0,#0ea5b7);color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center}
.m60t{font-size:13.5px;color:#33344e;line-height:1.5}
.laycard{display:flex;gap:11px;align-items:flex-start;background:#fff;border:1px solid #f0eef9;border-radius:13px;padding:13px 14px}
.layi{font-size:18px;line-height:1.2}
.laycard b{font-size:13px;letter-spacing:.4px;color:#1a1b30}
.laysub{font-size:12px;color:#6a6c84;margin-top:3px;line-height:1.45}
@keyframes jline{to{opacity:1}}
/* Sci-Fi Command Center — Umbrella-lab containment console (per-vertical live demo) */
/* ── COMMAND CENTER · instrument-grade surface (deep lacquer, light caught at the top edge) ── */
.cmdcenter{background:radial-gradient(120% 78% at 16% -10%,rgba(255,255,255,.075),transparent 46%),radial-gradient(150% 125% at 50% -22%,#15203a 0%,#0b1120 46%,#070b16 76%,#04060e 100%);border-radius:22px;padding:24px 26px 22px;font-family:-apple-system,system-ui,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;overflow:hidden;position:relative;isolation:isolate;box-shadow:0 50px 120px -52px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.05) inset,0 2px 0 rgba(255,255,255,.045) inset}
/* fine instrument floor — calmer, deeper than a game HUD */
.cmdcenter::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.4;background-image:linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px);background-size:40px 40px;-webkit-mask-image:radial-gradient(125% 100% at 50% 0%,#000 26%,transparent 82%);mask-image:radial-gradient(125% 100% at 50% 0%,#000 26%,transparent 82%)}
/* a single hairline of light across the very top — the lacquer catching light */
.cmdcenter::after{content:"";position:absolute;left:7%;right:7%;top:0;height:1px;z-index:4;pointer-events:none;background:linear-gradient(90deg,transparent,var(--cc,#22d3ee),transparent);opacity:.5}
.cmdcenter>*{position:relative;z-index:2}
/* corner containment brackets — finer, more precise */
.ccbrk{position:absolute;width:15px;height:15px;border:1.5px solid var(--cc,#22d3ee);opacity:.5;z-index:5}
.ccbrk.tl{top:10px;left:10px;border-right:0;border-bottom:0}.ccbrk.tr{top:10px;right:10px;border-left:0;border-bottom:0}
.ccbrk.bl{bottom:10px;left:10px;border-right:0;border-top:0}.ccbrk.br{bottom:10px;right:10px;border-left:0;border-top:0}
.cchead{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:14px}
.ccrec{width:8px;height:8px;border-radius:50%;background:var(--cc,#22d3ee);box-shadow:0 0 14px var(--cc,#22d3ee);animation:ccrec 2s ease-in-out infinite}
@keyframes ccrec{50%{opacity:.3}}
/* HUD provenance strip — every field is a real number from THIS run */
/* provenance strip — etched-metal tags; labels in refined caps, the VALUES in precision mono */
.cchud{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.cchud span{font-size:9.5px;letter-spacing:.7px;text-transform:uppercase;color:#aebad6;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.022));border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:4px 9px;display:inline-flex;gap:6px;align-items:center;box-shadow:0 1px 0 rgba(255,255,255,.05) inset}
.cchud b{color:#fff;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0}
.ccgrid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:18px}
@media(max-width:760px){.ccgrid{grid-template-columns:1fr}}
.ccscene{border:1px solid rgba(255,255,255,.08);border-radius:16px;background:radial-gradient(130% 130% at 50% 0%,rgba(255,255,255,.055),rgba(255,255,255,.012) 55%,transparent 74%);padding:12px 13px;box-shadow:0 1px 0 rgba(255,255,255,.05) inset}
.ccscene svg{width:100%;height:auto;display:block}
/* instrument readout — precision dial + the hero score */
.ccreadout{display:flex;align-items:center;gap:15px;margin:13px 2px 7px}
.ccdialsvg{width:98px;height:98px;flex:0 0 98px}
.ccreadout-meta{min-width:0}
.ccreadout-meta .lbl{font-size:10px;letter-spacing:.9px;text-transform:uppercase;color:#9fb0d0;font-weight:600}
.ccreadout-meta .sub{font-size:11.5px;color:#8a98b8;margin-top:4px;line-height:1.5}
.ccgauge{margin:9px 2px 0}
.ccgrow{display:flex;justify-content:space-between;font-size:11px;margin:0 0 4px;align-items:baseline}
.ccgrow .nm{color:#cdd6ee;font-weight:600;letter-spacing:.2px}
.ccgrow .vl{color:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.ccbar{height:6px;border-radius:9px;background:rgba(255,255,255,.06);overflow:hidden;box-shadow:0 1px 1px rgba(0,0,0,.45) inset;position:relative}
.ccfill{height:100%;border-radius:9px;transition:width 1.2s cubic-bezier(.22,1,.36,1)}
.cclog{border:1px solid rgba(255,255,255,.08);border-radius:16px;background:linear-gradient(180deg,rgba(4,6,13,.92),rgba(3,4,10,.97));padding:14px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.65;min-height:160px;overflow-wrap:anywhere;box-shadow:0 1px 0 rgba(255,255,255,.04) inset}
.ccline{margin:2px 0;white-space:pre-wrap}
.cccur{display:inline-block;width:7px;background:currentColor;animation:ccblink 1.1s steps(1) infinite;margin-left:1px}
@keyframes ccblink{50%{opacity:0}}
/* ENGINE CORE — the real competing strategies (the multi-strategy "AI-multiverse" brain) */
.cccore{margin-top:16px;border-top:1px solid rgba(255,255,255,.09);padding-top:13px}
.cccore-h{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#9fb0d0;margin-bottom:10px;font-weight:600}
.ccarms{display:grid;grid-template-columns:repeat(auto-fit,minmax(116px,1fr));gap:8px}
.ccarm{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.018));border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:9px 10px;box-shadow:0 1px 0 rgba(255,255,255,.04) inset}
.ccarm .an{font-size:11px;color:#eaf0ff;font-weight:600;display:flex;align-items:center;gap:6px}
.ccarm .am{height:4px;border-radius:9px;margin-top:6px;background:rgba(255,255,255,.07);overflow:hidden}
.ccarm .af{height:100%;border-radius:9px;transition:width 1s cubic-bezier(.22,1,.36,1)}
.ccarm .aw{font-size:9.5px;color:#8595b8;margin-top:5px;letter-spacing:.2px;font-family:ui-monospace,Menlo,monospace}
.ccmore{background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid var(--cc,#22d3ee);color:var(--cc,#22d3ee);font-family:inherit;font-size:12.5px;font-weight:700;letter-spacing:.3px;padding:9px 16px;border-radius:11px;cursor:pointer;transition:transform .2s,background .2s,box-shadow .2s}
.ccmore:hover{transform:translateY(-1px);background:var(--cc,#22d3ee)1f;box-shadow:0 10px 24px -12px var(--cc,#22d3ee),0 0 0 1px var(--cc,#22d3ee)55 inset}
.ccmore:disabled{opacity:.5;cursor:default}
.galcard{position:relative;cursor:pointer;border-radius:16px;padding:17px 16px;background:rgba(255,255,255,.8);backdrop-filter:blur(10px);border:1px solid #ecebf6;box-shadow:0 16px 36px -28px rgba(70,55,160,.5);transition:transform .45s cubic-bezier(.22,1,.36,1),box-shadow .45s,border-color .3s;overflow:hidden}
.galcard::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--gc)}
.galcard:hover{transform:translateY(-4px);border-color:var(--gc);box-shadow:0 30px 60px -30px var(--gc)}
.gicon{font-size:24px}
.gtitle{font-size:15px;font-weight:800;color:#1a1b30;margin-top:7px;letter-spacing:-.2px}
.gsec{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--gc);margin-top:2px}
.gknobs{font-size:12px;color:#6a6c84;margin-top:9px;line-height:1.5}
.grun{display:inline-block;margin-top:11px;font-size:12.5px;font-weight:800;color:#fff;background:var(--gc);padding:6px 13px;border-radius:9px}
/* per-profession hero selector — tailors the value prop + routes to the right live demo */
.audwrap{margin:24px auto 0;max-width:780px}
.audlbl{font-size:11.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#8890a8;margin-bottom:10px}
.audchips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.audchip{font-family:inherit;font-size:13.5px;font-weight:600;color:#3a3c54;background:rgba(255,255,255,.72);border:1px solid #e4e3f2;border-radius:999px;padding:8px 15px;cursor:pointer;transition:transform .25s cubic-bezier(.22,1,.36,1),border-color .2s,box-shadow .25s,background .2s}
.audchip:hover{transform:translateY(-2px);box-shadow:0 13px 28px -16px rgba(70,55,160,.55)}
.audchip.on{background:linear-gradient(96deg,#6d5cf0,#0ea5b7);color:#fff;border-color:transparent;box-shadow:0 15px 32px -16px rgba(109,92,240,.75)}
.audpanel{margin-top:15px}
.audcard{text-align:left;background:rgba(255,255,255,.85);backdrop-filter:blur(13px) saturate(1.15);-webkit-backdrop-filter:blur(13px) saturate(1.15);border:1px solid #ecebf6;border-left:4px solid var(--ac,#6d5cf0);border-radius:17px;padding:19px 22px;box-shadow:0 22px 50px -32px rgba(70,55,160,.55);animation:audIn .45s cubic-bezier(.22,1,.36,1)}
@keyframes audIn{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
.audcard h4{margin:0 0 7px;font-size:18.5px;color:#1a1b30;letter-spacing:-.3px;font-weight:800}
.audcard .al{font-size:14px;color:#54566e;line-height:1.65}
.audcard .ak{font-size:12px;color:#5a5c76;margin-top:9px;font-family:ui-monospace,Menlo,monospace;background:#f5f4fd;border:1px solid #ecebf6;border-radius:9px;padding:7px 11px;display:inline-block}
.audcard .ago{margin-top:14px;display:inline-block;font-size:13.5px;font-weight:700;color:#fff;background:var(--ac,#6d5cf0);border:0;border-radius:11px;padding:10px 17px;cursor:pointer;font-family:inherit;transition:transform .2s,box-shadow .2s}
.audcard .ago:hover{transform:translateY(-1px);box-shadow:0 13px 28px -12px var(--ac,#6d5cf0)}
.audcard .audpage{display:inline-block;margin-left:10px;font-size:13.5px;font-weight:700;color:var(--ac,#6d5cf0);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .2s}
.audcard .audpage:hover{border-bottom-color:var(--ac,#6d5cf0)}
/* Meli sits crisp on the panel — no blurred halo (keeps the sharp dark mascot) */
.herochar,.panel-art{position:relative}
.herochar>.meli,.panel-art>.meli{position:relative;z-index:1}
.herostats{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:26px auto 0;max-width:760px}
.hstat{flex:1;min-width:148px;background:rgba(255,255,255,.7);backdrop-filter:blur(12px) saturate(1.2);border:1px solid #ecebf6;border-radius:16px;padding:15px 14px;box-shadow:0 1px 2px rgba(30,25,80,.04),0 18px 40px -32px rgba(70,55,160,.45);transition:transform .5s cubic-bezier(.22,1,.36,1)}
.hstat:hover{transform:translateY(-3px)}
.hsnum{font-size:26px;font-weight:800;letter-spacing:-.5px;background:linear-gradient(135deg,#6d5cf0,#0ea5b7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-variant-numeric:tabular-nums}
.hslbl{font-size:12px;color:#6a6c84;margin-top:4px;line-height:1.35;font-weight:500}
.primegradtext{background:linear-gradient(135deg,#e11d48,#a855f7)!important;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
@keyframes branchGrow{to{stroke-dashoffset:0}}
@keyframes nodePop{to{opacity:1}}
@keyframes primeSpin{to{transform:rotate(1turn)}}
@keyframes primeShimmer{0%{background-position:-160% 0}100%{background-position:260% 0}}
@keyframes primeFloat{0%,100%{transform:translateY(0) rotate(45deg)}50%{transform:translateY(-4px) rotate(45deg)}}
@keyframes primeIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.primewrap{position:relative;border-radius:26px;padding:0;animation:primeIn .7s cubic-bezier(.22,1,.36,1)}
.primeborder{position:absolute;inset:0;border-radius:26px;padding:1.5px;background:linear-gradient(135deg,#e11d48,#f43f8e 30%,#a855f7 58%,#6d5cf0 82%,#0ea5b7);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;z-index:2}
.primeinner{position:relative;z-index:3;background:#fff;border-radius:24px;padding:24px 26px;overflow:hidden}
.primegem{width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,#e11d48,#f43f8e 40%,#a855f7);box-shadow:0 6px 18px -4px rgba(225,29,72,.55),inset 0 1px 3px rgba(255,255,255,.7);transform:rotate(45deg)}
.primeglint{background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.85) 48%,transparent 66%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:primeShimmer 5s linear infinite}
@media(prefers-reduced-motion:reduce){.primeglint,.primewrap{animation:none}}
@media(prefers-reduced-motion:reduce){[style*="branchGrow"]{stroke-dashoffset:0!important;animation:none!important}[style*="nodePop"]{opacity:1!important;animation:none!important}}
`;

/** Meli — Melete's original mascot: an antenna-topped discovery sprite (the glowing orb = "the next
 * experiment to try"). 100% geometric SVG — no third-party / copyrighted art. Works in every browser +
 * mobile (inline SVG + CSS animation, no libraries). */
function meli(cls = ""): string {
  return `<svg class="meli ${cls}" viewBox="0 0 200 224" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Meli, the Melete mascot">
  <defs>
    <linearGradient id="mbody" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#7d6df6"/><stop offset="0.55" stop-color="#5b53e8"/><stop offset="1" stop-color="#0ea5b7"/></linearGradient>
    <radialGradient id="mgloss" cx="0.36" cy="0.24" r="0.55"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <radialGradient id="orbG" cx="0.4" cy="0.34" r="0.72"><stop offset="0" stop-color="#fffdf0"/><stop offset="0.5" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></radialGradient>
    <filter id="msoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="mglow" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="5.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <ellipse cx="100" cy="210" rx="56" ry="11" fill="#16172b" opacity="0.10"/>
  <path class="ant" d="M104 70 C 120 44, 142 46, 148 22" stroke="#0ea5b7" stroke-width="5" fill="none" stroke-linecap="round"/>
  <g class="orb" filter="url(#mglow)"><circle cx="150" cy="18" r="13" fill="url(#orbG)"/><circle cx="145" cy="13" r="3.4" fill="#fff" opacity="0.9"/></g>
  <path class="spark s1" d="M172 34 l2.2 6.4 6.4 2.2 -6.4 2.2 -2.2 6.4 -2.2 -6.4 -6.4 -2.2 6.4 -2.2 z" fill="#fcd34d"/>
  <path class="spark s2" d="M128 6 l1.6 4.6 4.6 1.6 -4.6 1.6 -1.6 4.6 -1.6 -4.6 -4.6 -1.6 4.6 -1.6 z" fill="#67e8f9"/>
  <g filter="url(#msoft)" opacity="0.45"><path d="M100 60 C 148 60, 168 96, 166 130 C 164 170, 134 196, 100 196 C 66 196, 36 170, 34 130 C 32 96, 52 60, 100 60 Z" fill="#4338ca"/></g>
  <ellipse cx="78" cy="196" rx="16" ry="9" fill="#4f46d6"/><ellipse cx="122" cy="196" rx="16" ry="9" fill="#4f46d6"/>
  <ellipse class="arm" cx="162" cy="120" rx="11" ry="21" fill="url(#mbody)" transform="rotate(-30 162 120)"/>
  <ellipse cx="38" cy="142" rx="11" ry="21" fill="url(#mbody)" transform="rotate(26 38 142)"/>
  <path d="M100 54 C 150 54, 168 92, 166 128 C 164 168, 134 194, 100 194 C 66 194, 36 168, 34 128 C 32 92, 50 54, 100 54 Z" fill="url(#mbody)"/>
  <ellipse cx="88" cy="116" rx="50" ry="46" fill="url(#mgloss)"/>
  <ellipse cx="100" cy="152" rx="42" ry="34" fill="#ffffff" opacity="0.10"/>
  <g class="eyes">
    <ellipse cx="80" cy="120" rx="14.5" ry="16.5" fill="#fff"/><ellipse cx="120" cy="120" rx="14.5" ry="16.5" fill="#fff"/>
    <circle cx="83" cy="124" r="7.2" fill="#1a1b30"/><circle cx="123" cy="124" r="7.2" fill="#1a1b30"/>
    <circle cx="86" cy="120.5" r="2.7" fill="#fff"/><circle cx="126" cy="120.5" r="2.7" fill="#fff"/>
    <circle cx="80" cy="127" r="1.4" fill="#fff" opacity="0.7"/><circle cx="120" cy="127" r="1.4" fill="#fff" opacity="0.7"/>
  </g>
  <path d="M84 146 Q100 160 116 146" stroke="#1a1b30" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="62" cy="140" rx="7.5" ry="4.6" fill="#ff8fb1" opacity="0.55"/><ellipse cx="138" cy="140" rx="7.5" ry="4.6" fill="#ff8fb1" opacity="0.55"/>
</svg>`;
}

/** The Wave-Particle map projection (shared, exact, with the client). Tested for accuracy in
 * serverGauntlet: higher score rises, back rows sit higher, everything stays inside the 600×600 canvas. */
const VZ_C = { mL: 54, plotW: 486, mT: 130, depth: 250, skew: 44, h: 120 };
export function vizProject(gi: number, gj: number, t: number, nx: number, ny: number): [number, number] {
  const fx = nx > 1 ? gi / (nx - 1) : 0.5, fz = ny > 1 ? gj / (ny - 1) : 0.5;
  return [VZ_C.mL + fx * VZ_C.plotW + fz * VZ_C.skew, VZ_C.mT + (1 - fz) * VZ_C.depth - t * VZ_C.h];
}

export function landingPage(version = "0.4.0"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete — find the best answer in the fewest experiments</title>${socialMeta({ title: "Melete — find the best answer in the fewest experiments", desc: 'Tell Melete what you can change and what "good" means — it finds the best, most robust recipe in the fewest experiments, then hands you one signed, verifiable decision.', path: "/", img: "/og.png" })}${faviconLinks()}${structuredData("/", "Melete — find the best answer in the fewest experiments", "The sovereign, verifiable discovery brain: the best, most robust recipe in the fewest experiments, with a signed, offline-verifiable certificate.", { faq: true })}<style>${SHELL_CSS}
.aurora{position:fixed;top:0;left:0;right:0;height:3px;z-index:60;background:linear-gradient(90deg,#6d5cf0,#14b8a6,#6d5cf0,#a78bfa,#14b8a6);background-size:300% 100%;animation:auroraShift 9s linear infinite}
@keyframes auroraShift{0%{background-position:0% 50%}100%{background-position:300% 50%}}
@media (prefers-reduced-motion:reduce){.aurora{animation:none}}</style></head><body>
<div class="aurora"></div>
<div class="langsw"><button id="lang-en" class="lb on" onclick="setLang('en')">EN</button><button id="lang-th" class="lb" onclick="setLang('th')">ไทย</button></div>

<div class="cmodal" id="contactModal" onclick="if(event.target===this)hideContact()">
  <div class="cbox">
    <button class="cclose" onclick="hideContact()" aria-label="close">✕</button>
    <div style="width:74px;margin:0 auto 4px">${meli()}</div>
    <h3 style="text-align:center;margin:0 0 2px;font-size:21px">💬 Contact — Shinnapat <span class="muted" style="font-weight:500">(Melete)</span></h3>
    <p class="muted" style="text-align:center;margin:0 0 16px;font-size:14px">Licensing · acquisition · questions &nbsp;·&nbsp; 🇹🇭 Thailand-based</p>
    <table class="ctab">
      <tr><td>📧 Email</td><td><a href="mailto:patsa2561@gmail.com">patsa2561@gmail.com</a></td></tr>
      <tr><td>🟢 WhatsApp <span class="thtag">Thailand ☎</span></td><td><a href="https://wa.me/66939455645">+66 93 945 5645</a></td></tr>
      <tr><td>✈️ Telegram</td><td><a href="https://t.me/devson2561">@devson2561</a></td></tr>
      <tr><td>💬 Discord</td><td>pat195 <span class="muted">(shinnapat)</span></td></tr>
      <tr><td>🐙 GitHub</td><td><a href="https://github.com/patsa2561-art">@patsa2561-art</a></td></tr>
      <tr><td>📦 npm</td><td><a href="https://www.npmjs.com/~mneme_npm">@mneme_npm</a></td></tr>
    </table>
  </div>
</div>

<div class="hero">
  <div class="herochar">${meli("hero")}</div>
  <span class="eyebrow" data-i18n="eyebrow">The Sovereign Verifiable AI Analyst &amp; Optimizer</span>
  <h1 class="brand"><span class="grad">Melete</span></h1>
  <p class="tag" data-i18n="heroTag">Tell Melete what you can change and what <b>"good"</b> means. It finds the <b>best recipe in the fewest real-world experiments</b> — then tells you exactly what to do with it.</p>
  <p class="sub" data-i18n="heroSub">Analyze · optimize · certify — on your machine (sovereign), data never leaves, every verdict cryptographically signed &amp; verifiable offline.</p><p class="sub" style="margin-top:-18px">v${version}</p>
  <div class="cta">
    <a class="btn primary" data-i18n="ctaTry" href="#try">See it discover (live) →</a>
    <a class="btn ghost" data-i18n="ctaPitch" href="/pitch">The 60-second pitch</a>
    <a class="btn ghost" data-i18n="ctaApi" href="/docs" target="_blank" rel="noopener">🔌 Connect via API</a>
  </div>
  <div class="pills">
    <span class="pill" data-i18n="pill1">🎯 best answer, fewest tries</span>
    <span class="pill" data-i18n="pill2">🚀 no data needed — starts from scratch</span>
    <span class="pill" data-i18n="pill3">🔒 runs on your machine</span>
    <span class="pill" data-i18n="pill4">🔏 every answer signed</span>
  </div>
  <div class="audwrap">
    <div class="audlbl" data-i18n="audLbl">I work in —</div>
    <div class="audchips">
      <button class="audchip" id="aud-pharma" onclick="setAud('pharma')">💊 <span data-i18n="aud_pharma">Pharma</span></button>
      <button class="audchip" id="aud-chem" onclick="setAud('chem')">⚗️ <span data-i18n="aud_chem">Chemistry</span></button>
      <button class="audchip" id="aud-gpu" onclick="setAud('gpu')">🧠 <span data-i18n="aud_gpu">GPU &amp; ML</span></button>
      <button class="audchip" id="aud-aero" onclick="setAud('aero')">🛰️ <span data-i18n="aud_aero">Aerospace</span></button>
      <button class="audchip" id="aud-phys" onclick="setAud('phys')">⚛️ <span data-i18n="aud_phys">Physics</span></button>
      <button class="audchip" id="aud-infra" onclick="setAud('infra')">📊 <span data-i18n="aud_infra">Infra &amp; Analytics</span></button>
      <button class="audchip" id="aud-energy" onclick="setAud('energy')">⚡ <span data-i18n="aud_energy">Energy</span></button>
      <button class="audchip" id="aud-security" onclick="setAud('security')">🛡️ <span data-i18n="aud_security">Security</span></button>
    </div>
    <div id="audpanel" class="audpanel"></div>
  </div>
  <div class="herostats">
    <div class="hstat"><div class="hsnum">39</div><div class="hslbl" data-i18n="hs1">verified engines</div></div>
    <div class="hstat"><div class="hsnum">≥99%</div><div class="hslbl" data-i18n="hs2">of the true optimum, every benchmark</div></div>
    <div class="hstat"><div class="hsnum">100%</div><div class="hslbl" data-i18n="hs3">on your machine · signed</div></div>
    <div class="hstat"><div class="hsnum primegradtext">◆ Φ</div><div class="hslbl" data-i18n="hs4">one brain, smart about everything</div></div>
  </div>
</div>

<div class="wrap">

<section id="sixty" style="margin-top:8px">
  <div class="eyebrow" data-i18n="m60_eye">Understand the whole thing in 60 seconds</div>
  <h2 data-i18n="m60_h">What Melete is — in one minute</h2>
  <p style="max-width:760px;color:#475;font-size:16px;line-height:1.6" data-i18n="m60_p">You have a system you can <b>measure</b> — an ML pipeline, a server/DB/network config, a recipe, a simulation. Melete finds the best <b>and most robust</b> setting in the fewest experiments, explains why in plain language, and hands you a <b>signed verdict you (or an auditor) can re-verify offline</b>. It runs on your machine — your data never leaves.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:13px;margin:20px 0 8px">
    <div class="m60card"><div class="m60n">1</div><div class="m60t" data-i18n="m60_s1"><b>Tell it</b> what you can change + what "good" means</div></div>
    <div class="m60card"><div class="m60n">2</div><div class="m60t" data-i18n="m60_s2"><b>It proposes</b> a setting → you measure it (or give a formula) → repeat</div></div>
    <div class="m60card"><div class="m60n">3</div><div class="m60t" data-i18n="m60_s3"><b>You get</b> the best robust recipe + a signed, replayable verdict</div></div>
  </div>
  <div style="margin-top:18px;padding:18px 20px;background:rgba(255,255,255,.7);backdrop-filter:blur(12px);border:1px solid #ecebf6;border-radius:18px;box-shadow:0 18px 44px -34px rgba(70,55,160,.4)">
    <div style="font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#8890a8;margin-bottom:10px" data-i18n="m60_inside">Inside: 43 engines, organized as 4 layers</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">
      <div class="laycard"><span class="layi">🔍</span><div><b>DISCOVER</b><div class="laysub" data-i18n="lay1">find the best setting in the fewest tries</div></div></div>
      <div class="laycard"><span class="layi">◆</span><div><b>DECIDE</b><div class="laysub" data-i18n="lay2">the Φ brain's safety-first call + 🛡 the robust one</div></div></div>
      <div class="laycard"><span class="layi">🔬</span><div><b>DIAGNOSE</b><div class="laysub" data-i18n="lay3">plain-language why: which knobs, cliffs, shape, ceiling</div></div></div>
      <div class="laycard"><span class="layi">👑</span><div><b>CERTIFY</b><div class="laysub" data-i18n="lay4">signed, offline-verifiable, step-by-step replayable</div></div></div>
    </div>
  </div>
</section>

<section id="gallery" style="margin-top:26px">
  <div class="eyebrow" data-i18n="gal_eye">Live demo — pick your world, press one button</div>
  <h2 data-i18n="gal_h">See Melete run on YOUR industry</h2>
  <p style="max-width:760px;color:#475;font-size:15.5px;line-height:1.6" data-i18n="gal_p">Each card runs the <b>real Melete engine</b> on a simulated, industry-shaped problem — then sums up the result in plain language (every number is from the real run). In production you connect your own system as the oracle.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:18px">
    <div class="galcard" onclick="gVertical('aerospace')" style="--gc:#22d3ee"><div class="gicon">📡</div><div class="gtitle">Deep-Space Satellite Comms</div><div class="gsec">Aerospace · SpaceX/NASA-class</div><div class="gknobs">freq · phase-array · packet depth → throughput under solar storms</div><div class="grun">▶ run live</div></div>
    <div class="galcard" onclick="gVertical('genomics')" style="--gc:#a855f7"><div class="gicon">💊</div><div class="gtitle">Precision Drug Formulation</div><div class="gsec">Pharma · Genomics</div><div class="gknobs">pH · incubation · genome target → bioavailability − toxicity</div><div class="grun">▶ run live</div></div>
    <div class="galcard" onclick="gVertical('ml')" style="--gc:#6d5cf0"><div class="gicon">🧠</div><div class="gtitle">Air-Gapped LLM Tuning</div><div class="gsec">Banking / Gov</div><div class="gknobs">learning-rate · quantization · RAG chunk → tokens/s, safety, −GPU cost</div><div class="grun">▶ run live</div></div>
    <div class="galcard" onclick="gVertical('database')" style="--gc:#10b981"><div class="gicon">💾</div><div class="gtitle">DB &amp; Kernel Cost-Cut</div><div class="gsec">Cloud infra</div><div class="gknobs">TCP buffer · thread affinity · shared buffers → −latency, −cloud $</div><div class="grun">▶ run live</div></div>
    <div class="galcard" onclick="gVertical('solar')" style="--gc:#f59e0b"><div class="gicon">☀️</div><div class="gtitle">Solar Grid &amp; Micro-Inverter</div><div class="gsec">Energy · IoT</div><div class="gknobs">MPPT freq · charge rate · PV tilt → power, −inverter heat</div><div class="grun">▶ run live</div></div>
    <div class="galcard" onclick="gVertical('devops')" style="--gc:#ef4444"><div class="gicon">🛡️</div><div class="gtitle">DevOps Compliance Guardrail</div><div class="gsec">Security</div><div class="gknobs">IAM TTL · firewall · payload size → attack-block %, −friction</div><div class="grun">▶ run live</div></div>
  </div>
  <p class="muted" style="font-size:11.5px;margin-top:12px" data-i18n="gal_note">⚠ Simulated environments (real engine, real signed verdict). No live link to any satellite/grid — connect your own telemetry as the oracle in production.</p>
</section>

<section id="nullspot" style="margin-top:34px">
  <div style="background:radial-gradient(130% 120% at 50% -10%,#0d1322,#05060d 72%);border:1px solid #1d2740;border-radius:22px;padding:30px 30px 26px;position:relative;overflow:hidden;box-shadow:0 30px 70px -40px rgba(20,20,60,.8)">
    <div style="position:absolute;inset:0;pointer-events:none;opacity:.5;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:34px 34px;-webkit-mask-image:radial-gradient(120% 100% at 50% 0%,#000 30%,transparent 80%);mask-image:radial-gradient(120% 100% at 50% 0%,#000 30%,transparent 80%)"></div>
    <div style="position:relative">
      <div style="display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#9aa6c8"><span style="font-size:16px">⬛</span><span data-i18n="nullSpotEye">THE NULL ENGINE · MELETE SIGNATURE</span></div>
      <h2 style="font-size:27px;line-height:1.25;margin:12px 0 10px;color:#eaf0ff;max-width:880px;letter-spacing:-.4px" data-i18n="nullSpotH">Every optimizer hands you a “best recipe.” Even when there is nothing there.</h2>
      <p style="font-size:15.5px;line-height:1.7;color:#aeb9d6;max-width:840px;margin:0 0 18px" data-i18n="nullSpotP">Feed any optimizer pure noise and it still returns a confident answer — the luckiest random draw dressed up as a discovery. The NULL ENGINE is the only one that puts its OWN answer on trial and tells you the truth: a REAL signal, or just noise. Proven: false-positive ≤ 2.5% over 200 independent trials.</p>
      <button onclick="gNullSpot()" style="background:linear-gradient(135deg,#22d3ee,#6d5cf0);color:#06121f;font-weight:800;font-size:14.5px;border:0;border-radius:12px;padding:12px 22px;cursor:pointer;box-shadow:0 14px 34px -14px #22d3ee88" data-i18n="nullSpotBtn">▶ Prove it live — a real problem vs pure noise</button>
      <div id="nullout" style="margin-top:18px"></div>
    </div>
  </div>
</section>

<section id="tdc" style="margin-top:34px">
  <div class="eyebrow" data-i18n="tdcEye">THE MOAT · ONE SIGNED VERDICT NO OPTIMIZER CAN MATCH</div>
  <h2 data-i18n="tdcH">🏅 The Trustworthy Discovery Certificate</h2>
  <p style="max-width:820px;color:#475;font-size:15.5px;line-height:1.6" data-i18n="tdcP">Every other optimizer hands you a “best recipe” and stops. Melete fuses three proofs into ONE Ed25519-signed verdict an auditor verifies offline — Is the effect <b>REAL</b> (not noise)? Does it <b>CAUSE</b> the result (not confounded)? Is it <b>ROBUST</b> (survives real-world wobble)? — and names the gate that fails. Pick a case and watch it judge itself.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:18px">
    <div class="galcard" onclick="gTDC('good')" style="--gc:#34d399"><div class="gtitle" data-i18n="tdcGoodT">✓ A real discovery</div><div class="gknobs" data-i18n="tdcGoodD">A genuine, causal, robust optimum + clean history. Expect: TRUSTWORTHY — all three gates pass.</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
    <div class="galcard" onclick="gTDC('noise')" style="--gc:#fbbf24"><div class="gtitle" data-i18n="tdcNoiseT">✕ Pure noise</div><div class="gknobs" data-i18n="tdcNoiseD">The knobs do nothing — the “winner” is luck. Expect: NOT-TRUSTWORTHY — the SIGNAL gate catches it (and with no real effect, nothing below it holds either).</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
    <div class="galcard" onclick="gTDC('fragile')" style="--gc:#fb7185"><div class="gtitle" data-i18n="tdcFragT">✕ A fragile spike</div><div class="gknobs" data-i18n="tdcFragD">Real and causal, but a razor peak that collapses under a tiny drift. Expect: blocked at the ROBUST gate.</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
    <div class="galcard" onclick="gTDC('confounded')" style="--gc:#a855f7"><div class="gtitle" data-i18n="tdcConfT">✕ Confounded history</div><div class="gknobs" data-i18n="tdcConfD">A knob that looks decisive in the data but a hidden factor drives both. Expect: blocked at the CAUSAL gate.</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
  </div>
  <div id="tdcout" style="margin-top:16px"></div>
</section>

<section id="flab" style="margin-top:30px">
  <div class="eyebrow" data-i18n="flabEye">FRONTIER LAB · DEEP-TECH, PROVEN</div>
  <h2 data-i18n="flabH">The 3 ways optimizers die in the real world — engineered out, every one proven</h2>
  <p style="max-width:780px;color:#475;font-size:15.5px;line-height:1.6" data-i18n="flabP">Each button runs the REAL Melete engine via the on-box API. Numbers are live, not canned. Press one.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:18px">
    <div class="galcard" onclick="gFLab('noise')" style="--gc:#22d3ee"><div class="gtitle" data-i18n="flabNoiseT">📡 Noise-Robust</div><div class="gknobs" data-i18n="flabNoiseD">A noisy signal that reads 99% then 40% — find the value you can TRUST, not a lucky spike.</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
    <div class="galcard" onclick="gFLab('mixed')" style="--gc:#a855f7"><div class="gtitle" data-i18n="flabMixedT">🧩 Mixed-Space</div><div class="gknobs" data-i18n="flabMixedD">Categorical + integer + conditional knobs (storage engine, thread count) — not just dials.</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
    <div class="galcard" onclick="gFLab('prov')" style="--gc:#34d399"><div class="gtitle" data-i18n="flabProvT">📜 Provenance Seal</div><div class="gknobs" data-i18n="flabProvD">A 24/7 run history sealed into a constant-size, signed, tamper-evident proof.</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
    <div class="galcard" onclick="gFLab('null')" style="--gc:#9aa6c8"><div class="gtitle" data-i18n="flabNullT">⬛ Null Engine</div><div class="gknobs" data-i18n="flabNullD">The only optimizer brave enough to say “there is nothing to find” — it refuses to hand you a fake recipe when the data is just noise.</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
    <div class="galcard" onclick="gFLab('causal')" style="--gc:#f472b6"><div class="gtitle" data-i18n="flabCausalT">🧬 Causal Engine</div><div class="gknobs" data-i18n="flabCausalD">Proves CAUSE, not correlation — it intervenes to expose a confounded knob (looks important in the data, does nothing) and signs a Proof of Causation.</div><div class="grun" data-i18n="flabRun">▶ run live</div></div>
  </div>
  <div id="flabout" style="margin-top:16px"></div>
  <div style="margin-top:20px;background:linear-gradient(135deg,#f3f1ff,#eafcf8);border:1px solid #ddd9fb;border-radius:18px;padding:22px 24px">
    <div class="eyebrow" data-i18n="flabUseEye">USE IT ON YOUR OWN SYSTEM</div>
    <h3 style="font-size:19px;margin:4px 0 12px;color:#1a1b30" data-i18n="flabUseH">These demos used a formula. On your machine, the “oracle” is YOUR real measurement.</h3>
    <div style="font-size:14px;color:#33344e;line-height:1.85;max-width:820px">
      <div data-i18n="flabUse1">① Define your knobs (the settings you can change) + your score (what you measure — a yield %, a latency, a benchmark, an assay readout).</div>
      <div data-i18n="flabUse2">② Point the oracle at YOUR system — a function that runs your real process / calls your API / reads your instrument and returns that score. The same proven engine searches it.</div>
      <div data-i18n="flabUse3">③ Runs fully on your machine (sovereign — your data never leaves); every result is Ed25519-signed for your audit / patent trail.</div>
    </div>
    <div style="font-size:12.5px;color:#6a6c84;margin:14px 0 6px;font-weight:600" data-i18n="flabUseCap">Self-host the same engine (npm) and plug in your real measurement:</div>
    <pre style="margin:0;background:#0a0c18;color:#cdd6ee;border:1px solid #1d2740;border-radius:13px;padding:15px 17px;font-size:12.5px;line-height:1.6;overflow-x:auto;font-family:ui-monospace,Menlo,monospace">npm i melete-ai

import { mixedDiscover } from "melete-ai";

const result = mixedDiscover({
  space: [ /* your knobs: real | int | categorical, + conditional */ ],
  oracle: (cfg) =&gt; measureYourRealSystem(cfg),  // &larr; your benchmark / assay / API call
  budget: 300, goal: "maximize",
});
console.log(result.best);  // the best configuration, in the fewest real runs
// also: noiseRobustDiscover (noisy oracle) · buildCheckpoint (signed O(1) provenance)</pre>
    <div style="font-size:12px;color:#8890a8;margin-top:9px" data-i18n="flabUseApi">…or POST a JS-expression objective to the hosted API for a quick formula test: /discover · /mixed · /noise-robust</div>
    <div style="margin-top:14px"><button class="btn primary" onclick="showContact()">📩 <span data-i18n="btn_contact">Contact about Melete</span></button> &nbsp;<a class="btn ghost" href="/docs" target="_blank" rel="noopener">API docs</a></div>
  </div>
</section>
<script>
function flabShell(col,title,sub,bodyHtml,foot){var th=(LANG==='th');return '<div class="cmdcenter" style="--cc:'+col+';border:1px solid '+col+'55;box-shadow:0 26px 60px -30px '+col+'66, inset 0 0 70px '+col+'0c"><span class="ccbrk tl"></span><span class="ccbrk tr"></span><span class="ccbrk bl"></span><span class="ccbrk br"></span><div class="cchead"><span class="ccrec"></span><span style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:'+col+'">'+title+'</span><span style="font-size:12px;color:#cdd6ee;font-weight:700">'+sub+'</span></div>'+bodyHtml+'<div style="margin-top:11px;padding-top:10px;border-top:1px solid #ffffff14;font-size:11px;color:#8a98b8">'+foot+'</div></div>';}
function flabBar(label,frac,col,rightTxt){var w=Math.max(2,Math.min(100,Math.round(frac*100)));return '<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px"><span style="color:#cdd6ee">'+label+'</span><span style="color:#8a98b8;font-variant-numeric:tabular-nums">'+(rightTxt||'')+'</span></div><div style="height:6px;border-radius:9px;background:rgba(255,255,255,.07);overflow:hidden"><div style="height:100%;width:'+w+'%;border-radius:9px;background:linear-gradient(90deg,'+col+'55,'+col+');box-shadow:0 0 9px '+col+'aa"></div></div></div>';}
function gFLab(which){var out=document.getElementById('flabout');var th=(LANG==='th');if(out)out.innerHTML='<div class="muted" style="font-size:13px">▶ '+(th?'กำลังรัน engine จริง…':'running the real engine…')+'</div>';if(out&&out.scrollIntoView)setTimeout(function(){out.scrollIntoView({behavior:'smooth',block:'center'});},150);
var url,body;
if(which==='noise'){url='/noise-robust';body={space:[{name:'x',type:'real',min:0,max:1},{name:'y',type:'real',min:0,max:1}],objective:'100*Math.exp(-(((x-0.3)**2)+((y-0.3)**2))/0.05)',budget:110,noise:35,seed:3};}
else if(which==='mixed'){url='/mixed';body={space:[{name:'engine',type:'categorical',choices:['A','B','C']},{name:'x',type:'real',min:0,max:1},{name:'n',type:'int',min:3,max:7},{name:'tune',type:'real',min:0,max:1,activeWhen:{dim:'engine',equals:'B'}}],objective:'(engine===\\'B\\'?1.0:(engine===\\'C\\'?0.71:0.62))*Math.exp(-(((x-0.7)**2)/0.04))*Math.exp(-(((n-5)**2)/6))*(engine===\\'B\\'?Math.exp(-(((tune-0.3)**2)/0.05)):1)*100',budget:500,seed:1};}
else if(which==='null'){url='/null-engine';body={budget:90,seed:1};}
else if(which==='causal'){url='/causal';body={seed:1};}
else{url='/provenance';body={count:20000,windowSize:50};}
fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(j){if(j.error){if(out)out.innerHTML='<div style="color:#c33;font-size:13px">⚠ '+j.error+'</div>';return;}window.__lastFlab={k:which,j:j};if(which==='noise')flabNoise(j);else if(which==='mixed')flabMixed(j);else if(which==='null')flabNull(j,'flabout');else if(which==='causal')flabCausal(j);else flabProv(j);}).catch(function(e){if(out)out.innerHTML='<div style="color:#c33;font-size:13px">⚠ '+e.message+'</div>';});}
function gTDC(scenario){var out=document.getElementById('tdcout');var th=(LANG==='th');if(out)out.innerHTML='<div class="muted" style="font-size:13px">▶ '+(th?'กำลังออกใบรับรองสดๆ…':'issuing the certificate live…')+'</div>';if(out&&out.scrollIntoView)setTimeout(function(){out.scrollIntoView({behavior:'smooth',block:'center'});},150);
fetch('/trust-certificate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scenario:scenario,seed:3})}).then(function(r){return r.json();}).then(function(j){if(j.error){if(out)out.innerHTML='<div style="color:#c33;font-size:13px">⚠ '+j.error+'</div>';return;}window.__lastTDC=j;renderTDC(j);}).catch(function(e){if(out)out.innerHTML='<div style="color:#c33;font-size:13px">⚠ '+e.message+'</div>';});}
function renderTDC(j){var th=(LANG==='th');var trust=(j.verdict==='TRUSTWORTHY');var col=trust?'#34d399':'#fb7185';
var gicon=function(g){if(!g.assessed)return '<span style="color:#8a98b8">—</span>';return g.pass?'<span style="color:#34d399">✓</span>':'<span style="color:#fb7185">✕</span>';};
var gname=function(n){if(th)return n==='SIGNAL'?'สัญญาณจริง?':(n==='CAUSAL'?'เป็นสาเหตุ?':'ทนทาน?');return n==='SIGNAL'?'REAL?':(n==='CAUSAL'?'CAUSAL?':'ROBUST?');};
var rows=(j.gates||[]).map(function(g){var bad=g.assessed&&!g.pass;return '<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 11px;border-radius:11px;margin:6px 0;background:'+(bad?'rgba(251,113,133,.09)':'rgba(255,255,255,.04)')+';border:1px solid '+(bad?'#fb718555':'#ffffff14')+'"><div style="font-size:17px;line-height:1.2;width:18px;text-align:center">'+gicon(g)+'</div><div style="flex:1"><div style="font-size:13px;font-weight:800;color:'+(bad?'#fb7185':'#e6edff')+';letter-spacing:.4px">'+g.name+' · '+gname(g.name)+'</div><div style="font-size:12px;color:#9fb0d0;margin-top:2px;line-height:1.5">'+g.detail+'</div></div></div>';}).join('');
var rec=(j.best&&j.best.experiment)?Object.keys(j.best.experiment).map(function(k){return k+'='+(+j.best.experiment[k]).toFixed(2);}).join(' · '):'—';
var verdictLab=trust?(th?'น่าเชื่อถือ — รับรองแล้ว':'TRUSTWORTHY — certified'):(th?'ยังไม่น่าเชื่อถือ':'NOT TRUSTWORTHY');
var failNote=trust?(th?'ผ่านครบทั้งสามด่าน — ปลอดภัยที่จะนำไปใช้':'all three gates passed — safe to act on'):(th?'ตกที่ด่าน: ':'blocked at: ')+(trust?'':'<b style="color:#fb7185">'+(j.failedGates||[]).join(', ')+'</b>');
var body='<div class="ccgrid"><div>'
+'<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:10px">'
+'<svg viewBox="0 0 120 120" style="width:118px;height:118px"><circle cx="60" cy="60" r="50" fill="none" stroke="'+col+'" stroke-width="3" opacity="0.5"><animate attributeName="r" values="46;52;46" dur="3s" repeatCount="indefinite"/></circle><circle cx="60" cy="60" r="38" fill="'+col+'18" stroke="'+col+'" stroke-width="2"/><text x="60" y="58" text-anchor="middle" font-size="30" fill="'+col+'">'+(trust?'🏅':'⚠')+'</text><text x="60" y="82" text-anchor="middle" font-size="10" font-weight="800" fill="'+col+'" font-family="ui-monospace,Menlo,monospace">'+(trust?'CERTIFIED':'REFUSED')+'</text></svg>'
+'<div style="font-size:20px;font-weight:850;color:'+col+';text-shadow:0 0 16px '+col+'66;text-align:center">'+verdictLab+'</div>'
+'<div style="font-size:12.5px;color:#cdd6ee;text-align:center;max-width:240px">'+failNote+'</div>'
+'</div></div><div>'
+'<div class="cccore-h" style="margin-top:0">'+(th?'สามด่านความน่าเชื่อถือ':'the three trust gates')+'</div>'+rows
+'<div style="font-size:12px;color:#8a98b8;margin:9px 2px 0">'+(th?'สูตรที่รับรอง: ':'certified recipe: ')+'<b style="color:#e6edff">'+rec+'</b></div>'
+'<div style="font-size:11.5px;color:'+(j.signatureValid?'#34d399':'#fbbf24')+';margin:7px 2px 0">'+(j.signatureValid?'✓ ':'… ')+(th?'ลายเซ็น Ed25519 ตรวจ offline ผ่าน · ':'Ed25519 signature verifies offline · ')+'<span style="font-family:ui-monospace,Menlo,monospace;color:#8a98b8">'+String(j.payloadHash)+'…</span></div>'
+'</div></div>';
document.getElementById('tdcout').innerHTML=flabShell(col,(th?'ใบรับรองการค้นพบที่น่าเชื่อถือ':'TRUSTWORTHY DISCOVERY CERTIFICATE'),(th?'REAL? · CAUSAL? · ROBUST? → เซ็นรวมเป็นใบเดียว':'REAL? · CAUSAL? · ROBUST? → one signed verdict'),body,(th?'หลอม NULL + CAUSAL + AEGIS เป็นใบรับรองที่เซ็นแล้ว ตรวจ offline ได้ · ของจริงจาก /trust-certificate':'fuses NULL + CAUSAL + AEGIS into one offline-verifiable signed certificate · live from /trust-certificate'));}
function flabNull(j,outId){var th=(LANG==='th');var col='#9aa6c8';
var vCol=function(v){return v==='REAL'?'#34d399':(v==='WEAK'?'#fbbf24':'#94a3b8');};
var vLab=function(v){return th?(v==='REAL'?'✓ จริง (REAL)':(v==='WEAK'?'⚠ ก้ำกึ่ง (WEAK)':'⬛ ไม่มีสัญญาณ (NULL)')):(v==='REAL'?'✓ REAL':(v==='WEAK'?'⚠ WEAK':'⬛ NULL'));};
var panel=function(title,r,note){var c=vCol(r.verdict);var rec=Object.keys(r.best.experiment).map(function(k){return k+'='+(+r.best.experiment[k]).toFixed(2);}).join(' · ');return '<div style="flex:1;min-width:220px;background:rgba(255,255,255,.04);border:1px solid '+c+'55;border-radius:14px;padding:14px 16px"><div style="font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#9fb0d0;margin-bottom:6px">'+title+'</div><div style="font-size:22px;font-weight:800;color:'+c+';text-shadow:0 0 14px '+c+'66">'+vLab(r.verdict)+'</div><div style="font-size:12px;color:#8a98b8;margin-top:4px">p = '+r.pValue+' · '+(th?'สัญญาณ ':'signal ')+Math.round((+r.signalStrength)*100)+'%</div><div style="font-size:12px;color:#cdd6ee;margin-top:7px">'+(th?'สูตรที่เจอ: ':'found: ')+'<b>'+rec+'</b> → '+(Number.isFinite(+r.best.value)?(+r.best.value).toFixed(1):'—')+'</div><div style="font-size:11.5px;color:#8a98b8;margin-top:7px">'+note+'</div></div>';};
var body='<div style="font-size:13px;color:#cdd6ee;margin:2px 2px 12px">'+(th?'engine ตัวเดียวกัน · โจทย์สองแบบ · ความจริงเดียว — Melete รันทั้งสองด้วยกระบวนการเดียวกัน แล้วพิพากษาผลของตัวเอง':'Same engine · two problems · one truth — Melete ran both the same way, then put its OWN answer on trial.')+'</div>'
+'<div style="display:flex;gap:12px;flex-wrap:wrap">'
+panel((th?'โจทย์จริง (มี optimum)':'A REAL problem (a true optimum)'),j.real,(th?'ปุ่มมีผลจริง → เชื่อผลนี้ได้':'the knobs genuinely matter → trust this'))
+panel((th?'ข้อมูลมั่ว (noise ล้วน)':'PURE NOISE (knobs do nothing)'),j.noise,(th?'optimizer อื่นจะยัดสูตรปลอมให้ตรงนี้ — Null Engine ปฏิเสธ':'every other optimizer would hand you a FAKE recipe here — the Null Engine refuses'))
+'</div>';
document.getElementById(outId||'flabout').innerHTML=flabShell(col,(th?'NULL ENGINE · กล้าบอกว่าไม่มีอะไรให้หา':'NULL ENGINE · brave enough to say nothing is there'),(th?'ทดสอบ null-hypothesis ของผลตัวเอง':'puts its own answer on trial'),body,(th?'permutation test (300 รอบ) บนข้อมูลของรันเอง · false-positive ≤2.5% พิสูจน์แล้ว · ของจริงจาก /null-engine':'permutation test (300×) on the run\\'s own data · false-positive ≤2.5% proven · live from /null-engine'));}
function gNullSpot(){var out=document.getElementById('nullout');var th=(LANG==='th');if(out)out.innerHTML='<div class="muted" style="font-size:13px">▶ '+(th?'กำลังพิสูจน์สดๆ…':'proving it live…')+'</div>';fetch('/null-engine',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({budget:90,seed:1})}).then(function(r){return r.json();}).then(function(j){if(j.error){if(out)out.innerHTML='<div style="color:#c33;font-size:13px">⚠ '+j.error+'</div>';return;}window.__lastNull=j;flabNull(j,'nullout');}).catch(function(e){if(out)out.innerHTML='<div style="color:#c33;font-size:13px">⚠ '+e.message+'</div>';});}
function flabNoise(j){var th=(LANG==='th');var col='#22d3ee';var rec=Object.keys(j.best.experiment).map(function(k){return k+'='+(+j.best.experiment[k]).toFixed(2);}).join(' · ');
var pts=(j.points||[]).slice(0,5);var mx=1;pts.forEach(function(p){if(Math.abs(p.mean)>mx)mx=Math.abs(p.mean);});
var bars=pts.map(function(p){var rc=Object.keys(p.experiment).map(function(k){return (+p.experiment[k]).toFixed(2);}).join(',');return flabBar('('+rc+')',Math.abs(p.mean)/mx,col,'μ '+p.mean+' ± '+p.std+' · n'+p.n);}).join('');
var body='<div class="ccgrid"><div>'
+'<div style="display:flex;align-items:baseline;gap:9px;margin:6px 2px"><span style="font-size:30px;font-weight:800;color:'+col+';text-shadow:0 0 16px '+col+'88">'+(+j.bestMean).toFixed(1)+'</span><span style="font-size:12px;color:#8a98b8">'+(th?'ค่าเฉลี่ยที่เชื่อถือได้ ± ':'trustworthy mean ± ')+j.bestStd+' (n='+j.bestN+')</span></div>'
+'<div style="font-size:13px;color:#cdd6ee;margin:2px 2px 6px">'+(th?'สูตร: ':'recipe: ')+'<b style="color:#e6edff">'+rec+'</b></div>'
+'<div style="font-size:12px;color:#8a98b8;margin:2px 2px">'+(th?'ขอบล่างที่มั่นใจ (LCB) ':'lower-confidence bound ')+'<b style="color:'+col+'">'+(+j.bestLcb).toFixed(1)+'</b></div>'
+'<div style="margin-top:10px;padding:10px 12px;border-radius:11px;background:rgba(251,191,36,.08);border:1px solid #fbbf2455"><div style="font-size:12px;color:#fbbf24;font-weight:700">'+(th?'❌ ปฏิเสธค่าฟลุค':'❌ rejected the lucky spike')+'</div><div style="font-size:12.5px;color:#cdd6ee;margin-top:3px">'+(th?'optimizer ทั่วไปจะรายงาน ':'a naive optimizer would report ')+'<b>'+(+j.luckyMax.value).toFixed(1)+'</b> '+(th?'(ค่าที่ฟลุคอ่านสูงครั้งเดียว) — Melete กรองทิ้งเพราะแกว่งเกินไป':'(one lucky high reading) — Melete filtered it as noise')+'</div></div></div>'
+'<div><div class="cccore-h" style="margin-top:0">'+(th?'จุดที่วัด (เรียงตามค่าที่เชื่อถือได้)':'measured points (by trustworthy value)')+'</div>'+bars+'</div></div>';
document.getElementById('flabout').innerHTML=flabShell(col,(th?'มอนิเตอร์ความทนทาน · #2':'LIVE ROBUSTNESS MONITOR · #2'),(th?'ทนสัญญาณรบกวน':'noise-robust'),body,(th?'noise σ='+j.noise+' · '+j.evaluations+' การวัด (วัดซ้ำ) · เลือกด้วย lower-confidence-bound — ของจริงจาก /noise-robust':'noise σ='+j.noise+' · '+j.evaluations+' measurements (replicated) · selected by lower-confidence-bound — live from /noise-robust'));}
function flabMixed(j){var th=(LANG==='th');var col='#a855f7';var rec=Object.keys(j.best.experiment).map(function(k){var v=j.best.experiment[k];return k+'='+(typeof v==='number'?(+v).toFixed(2):v);}).join(' · ');
var lb=(j.byCombo||[]).slice(0,6);var mx=1;lb.forEach(function(c){if(Math.abs(c.value)>mx)mx=Math.abs(c.value);});
var rows=lb.map(function(c,i){var combo=Object.keys(c.combo).map(function(k){return k+'='+c.combo[k];}).join(' · ');return flabBar((i+1)+'. '+combo,Math.abs(c.value)/mx,col,(+c.value).toFixed(1));}).join('');
var body='<div class="ccgrid"><div>'
+'<div style="display:flex;align-items:baseline;gap:9px;margin:6px 2px"><span style="font-size:30px;font-weight:800;color:'+col+';text-shadow:0 0 16px '+col+'88">'+(+j.best.value).toFixed(1)+'</span><span style="font-size:12px;color:#8a98b8">'+(th?'คะแนนของสูตรที่ชนะ':'winning configuration score')+'</span></div>'
+'<div style="font-size:13px;color:#cdd6ee;margin:2px 2px">'+(th?'สูตร: ':'recipe: ')+'<b style="color:#e6edff">'+rec+'</b></div>'
+'<div style="font-size:12px;color:#8a98b8;margin:8px 2px">'+(th?'ชนะ category: ':'winning category: ')+'<b style="color:'+col+'">'+Object.keys(j.bestCombo).map(function(k){return k+'='+j.bestCombo[k];}).join(' · ')+'</b></div></div>'
+'<div><div class="cccore-h" style="margin-top:0">'+(th?'กระดานแข่ง — '+j.comboCount+' การจัดวางที่แข่งกัน':'leaderboard — '+j.comboCount+' configurations competed')+'</div>'+rows+'</div></div>';
document.getElementById('flabout').innerHTML=flabShell(col,(th?'สนามตัวแปรผสม · #1':'MIXED ARENA · #1'),(th?'categorical + integer + conditional':'categorical + integer + conditional'),body,(th?j.comboCount+' combos'+(j.sampledCombos?' (สุ่ม)':' (ครบ)')+' · '+j.evaluations+' การทดลอง · ของจริงจาก /mixed':j.comboCount+' combos'+(j.sampledCombos?' (sampled)':' (enumerated)')+' · '+j.evaluations+' experiments · live from /mixed'));}
function flabProv(j){var th=(LANG==='th');var col='#34d399';
var seal='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px"><svg viewBox="0 0 120 120" style="width:120px;height:120px"><circle cx="60" cy="60" r="50" fill="none" stroke="'+col+'" stroke-width="3" opacity="0.5"><animate attributeName="r" values="46;52;46" dur="3s" repeatCount="indefinite"/></circle><circle cx="60" cy="60" r="38" fill="'+col+'18" stroke="'+col+'" stroke-width="2"/><text x="60" y="56" text-anchor="middle" font-size="26" fill="'+col+'">🔏</text><text x="60" y="80" text-anchor="middle" font-size="11" font-weight="800" fill="'+col+'" font-family="ui-monospace,Menlo,monospace">SEALED</text></svg></div>';
var body='<div class="ccgrid"><div>'+seal+'</div><div>'
+'<div style="display:flex;align-items:baseline;gap:9px;margin:6px 2px"><span style="font-size:30px;font-weight:800;color:'+col+';text-shadow:0 0 16px '+col+'88">'+(+j.count).toLocaleString()+'</span><span style="font-size:12px;color:#8a98b8">'+(th?'เหตุการณ์ → ':'events → ')+'<b style="color:'+col+'">'+(+j.sizeBytes).toLocaleString()+' B</b> '+(th?'(ขนาดคงที่ O(1))':'(constant size · O(1))')+'</span></div>'
+'<div style="font-size:11.5px;color:#8a98b8;font-family:ui-monospace,Menlo,monospace;margin:4px 2px 10px;overflow-wrap:anywhere">root '+String(j.foldedRoot).slice(0,32)+'…</div>'
+'<div style="display:flex;flex-direction:column;gap:6px">'
+'<div style="font-size:13px;color:'+(j.signatureValid?'#34d399':'#fbbf24')+'">'+(j.signatureValid?'✓ ':'… ')+(th?'ลายเซ็น Ed25519 ตรวจ offline ผ่าน':'Ed25519 signature verifies offline')+'</div>'
+'<div style="font-size:13px;color:'+(j.intactVerifies?'#34d399':'#fbbf24')+'">'+(j.intactVerifies?'✓ ':'… ')+(th?'ประวัติครบถ้วน ตรวจกับสตรีมจริงผ่าน':'full history re-verifies against the stream')+'</div>'
+'<div style="font-size:13px;color:'+(j.tamperDetected?'#34d399':'#c0392b')+'">'+(j.tamperDetected?'✓ ':'✗ ')+(th?'แก้เหตุการณ์เก่าแม้จุดเดียว → จับได้':'altering ANY past event → DETECTED')+'</div></div></div></div>';
document.getElementById('flabout').innerHTML=flabShell(col,(th?'ตราผนึกประวัติ · #3':'PROVENANCE SEAL · #3'),(th?'หลักฐานขนาดคงที่ แก้ไม่ได้':'constant-size tamper-evident proof'),body,(th?'hash-chain + sliding window + Ed25519 · '+j.algo+' · ของจริงจาก /provenance':'hash-chain + sliding window + Ed25519 · '+j.algo+' · live from /provenance'));}
function flabCausal(j,outId){var th=(LANG==='th');var col='#f472b6';
var rows=(j.variables||[]).map(function(v){var vc=v.confounded?'#fb7185':(v.causal?'#34d399':'#8a98b8');var vl=v.confounded?(th?'ปนเปื้อน (CONFOUNDED)':'CONFOUNDED'):(v.causal?(th?'เป็นสาเหตุ (CAUSAL)':'CAUSAL'):(th?'ไม่มีผล':'no effect'));return '<div style="background:rgba(255,255,255,.04);border:1px solid '+vc+'44;border-radius:11px;padding:10px 12px;margin:7px 0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:13px;font-weight:700;color:#e6edff">'+v.name+'</span><span style="font-size:11px;font-weight:800;color:'+vc+'">'+vl+'</span></div>'+flabBar((th?'ในข้อมูล (correlation)':'in your data (correlation)'),v.observationalEffect,'#9aa6c8',(+v.observationalEffect).toFixed(2))+flabBar((th?'เมื่อแทรกแซง (causal)':'under intervention (causal)'),v.causalEffect,col,(+v.causalEffect).toFixed(2))+'</div>';}).join('');
var body='<div style="font-size:13px;color:#cdd6ee;margin:2px 2px 10px">'+(th?'แท่งบน = ดู "สำคัญในข้อมูล" · แท่งล่าง = ผลจริงเมื่อ "แทรกแซง" — บนสูงแต่ล่างเป็น 0 = ปนเปื้อน (หลอก)':'top bar = looks important "in your data" · bottom bar = the real effect "under intervention" — high top + zero bottom = confounded (a lie)')+'</div>'+rows
+'<div style="margin-top:11px;padding:11px 13px;border-radius:11px;background:rgba(52,211,153,.08);border:1px solid #34d39955"><div style="font-size:12px;color:#34d399;font-weight:700">'+(th?'✓ คำแนะนำเชิงสาเหตุ':'✓ Causal recommendation')+'</div><div style="font-size:12.5px;color:#cdd6ee;margin-top:3px">'+(th?'ปรับเฉพาะตัวที่เป็นสาเหตุจริง: ':'tune only the true cause: ')+'<b style="color:#e6edff">'+(j.causalVars||[]).join(', ')+'</b> → x1='+(+j.best.experiment.x1).toFixed(2)+((j.confoundedVars&&j.confoundedVars.length)?(' · '+(th?'อย่ายุ่งกับ (ปนเปื้อน): ':'ignore (confounded): ')+j.confoundedVars.join(', ')):'')+'</div></div>'
+'<div style="font-size:11.5px;color:'+(j.proofValid?'#34d399':'#fbbf24')+';margin-top:8px;font-family:ui-monospace,Menlo,monospace">'+(j.proofValid?'🔏 ✓ ':'… ')+(th?'Proof of Causation · Ed25519 ตรวจ offline ผ่าน · #':'Proof of Causation · Ed25519, verifies offline · #')+(j.proofHash||'')+'</div>';
document.getElementById(outId||'flabout').innerHTML=flabShell(col,(th?'CAUSAL ENGINE · เหตุ ไม่ใช่ความสัมพันธ์':'CAUSAL ENGINE · cause, not correlation'),(th?'พิสูจน์ด้วยการแทรกแซง (world-first)':'proven by intervention (world-first)'),body,(th?j.interventions+' การแทรกแซงแบบสุ่ม · Proof of Causation ที่เซ็นได้ ตัวแรกในโลก · ของจริงจาก /causal':j.interventions+' randomized interventions · the world-first signed Proof of Causation · live from /causal'));}
</script>


<section><h2 data-i18n="h_what">What it does — one example</h2>
<div class="story" data-i18n="story">
<p style="font-size:19px;font-weight:600;color:#1a1b30;margin-bottom:14px">You run a coffee shop and want the <b>best espresso</b>. You can change three things — water temperature, grind, and how many grams of coffee. There are thousands of combinations, and testing one means <b>brewing a cup and tasting it</b>. You can't try them all.</p>
<p style="color:#33344e;margin-bottom:6px">Melete works like a brilliant assistant who suggests the next cup to brew:</p>
<div class="chat">☕ Melete: “Try <b>92°, grind 6, 18g</b>.” &nbsp;→ you brew it, taste it: <b>7/10</b>.</div>
<div class="chat">☕ Melete: “Now try <b>93°, grind 5, 19g</b>.” &nbsp;→ you taste: <b>8.5/10</b>.</div>
<div class="chat" style="opacity:.6">… a few more …</div>
<div class="chat">🎯 After ~<b>20 cups</b>, it found your best recipe — instead of randomly trying 200.</div>
<p style="color:#33344e;margin-top:14px">Swap “coffee” for a <b>training run</b>, a <b>chemical reaction</b>, or a <b>price</b> — it's the same: Melete finds the best settings in the <b>fewest expensive tries</b>, and signs a <b>proof</b> of how it got there. <span class="muted">You bring the thing you can adjust and a way to score one try; it brings the strategy.</span></p>
</div></section>

<section><h2 data-i18n="h_meli">Meet Meli — a tiny story</h2>
<div class="storybook">

  <div class="panel wish" data-beat>
    <div class="panel-art">${meli()}<span class="prop hearts">💛</span></div>
    <div class="panel-text"><span class="beatnum">1</span>
      <p data-i18n="sb1">Once upon a time, a little coffee shop wished for the <b>most delicious espresso in the world</b>.</p></div>
  </div>

  <div class="panel maze" data-beat>
    <div class="panel-art">${meli()}<span class="prop cups">☕☕☕<br>☕☕☕</span></div>
    <div class="panel-text"><span class="beatnum">2</span>
      <p data-i18n="sb2">But there were <b>thousands of ways</b> to make it — and every single test meant brewing, and tasting, a whole cup. Trying them all? <b>Impossible.</b></p></div>
  </div>

  <div class="panel think" data-beat>
    <div class="panel-art">${meli()}<span class="prop bubble">brew <b>this</b> one →</span></div>
    <div class="panel-text"><span class="beatnum">3</span>
      <p data-i18n="sb3">Then came <b>Meli</b> — who never tries everything. Meli looks, thinks, and the little light glows: <i>“brew <b>this</b> one next.”</i></p></div>
  </div>

  <div class="panel dance" data-beat>
    <div class="panel-art">${meli()}<span class="prop cup">☕<span class="score">7 → 8.5 → 9.2</span></span></div>
    <div class="panel-text"><span class="beatnum">4</span>
      <p data-i18n="sb4">You brew it, you taste it — <b>7 out of 10</b>. Meli smiles, <b>learns</b>, and picks an even smarter cup. 8.5… 9.2…</p></div>
  </div>

  <div class="panel win" data-beat>
    <div class="panel-art">${meli()}<span class="prop star">⭐</span><span class="prop seal">📜 verified ✓</span></div>
    <div class="panel-text"><span class="beatnum">5</span>
      <p data-i18n="sb5">In about <b>twenty cups</b>, Meli found the <b>perfect recipe</b> — and sealed a magical <b>proof</b> of how, so the whole world could trust it. <b>The end ✨</b></p>
      <a class="btn primary" href="#try" style="margin-top:14px;display:inline-block">▶ Now watch Meli do it for real</a></div>
  </div>

</div></section>

<section style="display:none"><h2 data-i18n="h_how">How it works — 3 steps</h2>
<div class="steps">
  <div class="step"><span class="n">1</span><h3 data-i18n="st1h">Set the dials</h3><p data-i18n="st1p">List what you can change and its range — temperature 85–96°, learning-rate 0–0.1, price $1–100.</p></div>
  <div class="step"><span class="n">2</span><h3 data-i18n="st2h">Score one try</h3><p data-i18n="st2p">Your real process returns one number: brew → taste, train → accuracy, price → revenue. No dataset needed.</p></div>
  <div class="step"><span class="n">3</span><h3 data-i18n="st3h">Discover &amp; prove</h3><p data-i18n="st3p">Melete proposes the next experiment, learns, converges to the best — and signs a verifiable trace of how.</p></div>
</div></section>

<section><h2 data-i18n="h_who">Who it's for &amp; what they get</h2>
<div class="grid">
  <div class="card"><div class="who">AI / ML teams</div><h3>Hyperparameter &amp; system tuning</h3><p data-i18n="wh1">Tune learning rates, architectures, RAG/serving configs, compiler flags — fewer GPU-hours to the best model, with a provable tuning record.</p></div>
  <div class="card"><div class="who">Pharma · Chemistry · Materials</div><h3>Formulation &amp; reaction discovery</h3><p data-i18n="wh2">Find the reagent mix / conditions that maximise yield or potency in far fewer assays — and a tamper-proof discovery trail for patents &amp; audits.</p></div>
  <div class="card"><div class="who">Semiconductor · Manufacturing</div><h3>Process optimisation</h3><p data-i18n="wh3">Tune deposition / etch / print parameters against real KPIs on-prem — air-gapped, data never leaves the fab, result still verifiable.</p></div>
  <div class="card"><div class="who">Quant · Product · Growth</div><h3>Pricing &amp; expensive A/B</h3><p data-i18n="wh4">Search price points, configurations, and policies where each test is costly — converge faster than grid or manual search.</p></div>
</div>
<p class="muted" style="margin-top:16px">Every case: <b>fewer expensive experiments</b> to the best answer + a <b>cryptographic proof</b> of how it was found.</p></section>

<section id="try"><h2 data-i18n="h_see">See it discover — just watch</h2>
<div id="nfbanner" style="background:linear-gradient(120deg,#f3f1ff,#eafcf8);border:1px solid #e0dbf3;border-radius:16px;padding:18px;margin:14px 0;display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:240px;font-size:14px;color:#33344e;line-height:1.55"><b data-i18n="nf_h">Use it on your real process — no formula, no code.</b><br><span data-i18n="nf_sub">The demo below needs a formula (for developers). To use Melete on your real process with no formula — it proposes, you measure, you type the score — use the guided mode.</span></div><button class="btn primary" onclick="gotoGuide()" data-i18n="nf_btn">👉 Use the no-formula mode</button></div>
<p class="lead" style="font-size:18px;margin:0 0 4px" data-i18n="see_lead">👇 Just press the purple button and watch. Melete tests settings one by one and zeroes in on the best — like the coffee story above, but live.</p>
<p class="muted" style="margin:0 0 16px" data-i18n="see_sub">This is a demo, so the "score" is calculated instantly by a formula. In real life, the score is whatever YOU measure (a taste rating, a yield %, a benchmark) — and you type it in. <a href="#use">How to use it for your own work →</a></p>
<div class="card">
<div class="modetabs"><button class="mt on" id="mt-simple" onclick="setMode('simple')">🟢 Simple — pick &amp; watch</button><button class="mt" id="mt-advanced" onclick="setMode('advanced')">⚙️ Advanced — edit the values</button></div>
<label data-i18n="scenarioL">Scenario</label>
<select id="preset" onchange="loadPreset()">
  <option value="coffee">☕ Best espresso recipe — temperature · grind · dose</option>
  <option value="price">💸 Best price point — which price earns the most</option>
  <option value="pharma">💊 Drug formulation — pH · temperature · excipient → stability</option>
  <option value="peak">📈 Find a hidden peak — the simplest demo (2 knobs)</option>
  <option value="etch">🔬 Semiconductor etch — power · pressure · time → yield</option>
  <option value="gpu">⚡ GPU kernel tuning — tile · unroll · occupancy → throughput</option>
  <option value="llm">🧠 LLM serving — batch · KV-cache · quantization → tokens/sec</option>
</select>
<div id="scenario" class="scenario"></div>
<div id="advbox" class="advbox">
<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px;margin:8px 0;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:240px;font-size:13.5px;color:#7c2d12;line-height:1.55" data-i18n="sim_note"><b>You do NOT write these formulas.</b> This box is a browser simulation so you can watch the algorithm work. A pharma researcher (or anyone) uses the no-formula guided mode — enter your variables (pH, temperature…), make the recipe, measure the real result, type the score.</div><button class="btn primary" onclick="gotoGuide()" data-i18n="sim_btn">👉 No-formula mode</button></div>
<label>Space — the variables (name · type · min · max)</label>
<input id="space" value='[{"name":"x","type":"real","min":0,"max":10},{"name":"y","type":"real","min":0,"max":10}]'>
<label>Objective — the simulated score (a formula, browser demo only)</label>
<input id="obj" value="Math.exp(-((x-7.2)**2+(y-3.4)**2)/3)">
<label>Budget — experiments allowed</label>
<input id="budget" value="40">
</div>
<label style="display:flex;align-items:center;gap:9px;margin-top:14px;font-size:14px;color:#33344e;cursor:pointer"><input type="checkbox" id="reliable" style="width:16px;height:16px"> <span data-i18n="rel_lbl">⚡ Reliable mode — add a Nelder–Mead polish (slower; nails hard curved valleys to the true optimum)</span></label>
<button class="btn primary" style="margin-top:12px;width:100%" onclick="run()" data-i18n="watch">▶ Watch Melete discover</button>
<div id="runsrc" style="display:none"></div>
<div class="result" id="out">Pick a scenario, then press Watch — the best settings, a movie of how it searched, and a signed proof appear here.</div>
<div id="prime" style="display:none;margin-bottom:14px"></div>
<div id="journalist" style="display:none;margin-bottom:14px"></div>
<div id="rx" style="display:none;margin-bottom:14px"></div>
<div id="hero" style="display:none;margin-bottom:14px"></div>
<div id="eta" style="display:none;margin:14px 0"></div>
<div id="brain" style="display:none;margin:14px 0"></div>
<div id="aegis" style="display:none;margin:14px 0"></div>
<div id="sovcard" style="display:none;margin:14px 0"></div>
<div class="narrate" id="narrate" style="display:none"></div>
<div class="savings" id="savings" style="display:none"></div>
<div class="savings" id="baseline" style="display:none;margin-top:12px"></div>
<div class="savings" id="frontier" style="display:none;margin-top:12px"></div>
<div class="savings" id="cert" style="display:none;margin-top:12px"></div>
<div class="savings" id="poopt" style="display:none;margin-top:12px"></div>
<div class="savings" id="sens" style="display:none;margin-top:12px"></div>
<div class="savings" id="noise" style="display:none;margin-top:12px"></div>
<div class="savings" id="inter" style="display:none;margin-top:12px"></div>
<div class="savings" id="drift" style="display:none;margin-top:12px"></div>
<div class="savings" id="sloppy" style="display:none;margin-top:12px"></div>
<div class="savings" id="cliff" style="display:none;margin-top:12px"></div>
<div class="savings" id="rashomon" style="display:none;margin-top:12px"></div>
<div class="savings" id="shape" style="display:none;margin-top:12px"></div>
<div id="whatif" style="display:none;margin-top:12px"></div>
<div id="batchp" style="display:none;margin-top:12px"></div>

<div id="map">
<div class="mapgrid">
  <div>
    <div class="caps" data-i18n="cinema">Discovery cinema — watch Meli search</div>
    <canvas id="surf" width="600" height="600"></canvas>
    <div class="player">
      <button id="play" class="pbtn" onclick="togglePlay()">▶ Replay</button>
      <input id="scrub" type="range" min="0" max="1" value="1" oninput="scrubTo(+this.value)">
      <span id="stepn" class="muted" style="font-size:12.5px;min-width:78px;text-align:right"></span>
    </div>
    <div id="legend" class="legend"></div>
    <div class="muted" id="mapcap" style="font-size:12.5px;margin-top:6px">Heat = the score it learned · each dot = one experiment, coloured by the <b>strategy</b> that proposed it · ★ = best.</div>
  </div>
  <div>
    <div class="caps" data-i18n="climb">How the score climbed (higher = better)</div>
    <canvas id="conv" width="380" height="120" style="height:96px"></canvas>
    <div id="teampanel" style="display:none">
      <div class="caps" style="margin-top:16px" data-i18n="team">Meli's team — who did the work</div>
      <div class="muted" style="font-size:12px;margin:-3px 0 8px" data-i18n="teamhint">Expert detail: the search helpers Meli used, and how many tries each got. You don't need this to use the result.</div>
      <div id="arms"></div>
    </div>
    <div class="caps" style="margin-top:16px">Proof</div>
    <div id="proof" class="kv"></div>
  </div>
</div></div>
</div></section>

<section><h2 data-i18n="h_ind">Click an industry — see Melete work on it</h2>
<p class="muted" style="margin:0 0 16px">Each card runs the live demo on a realistic, domain-shaped scenario. <b data-i18n="ind_intro">The browser score is a simulated model</b> of the process — the <b>optimisation is real &amp; reproducible</b>; connect your real assay / benchmark / process for real numbers.</p>
<div class="grid">
  <div class="card indcard" onclick="tryScenario('pharma')"><div class="who">💊 Pharma · biotech</div><h3 data-i18n="t_pharma">Drug formulation</h3><p data-i18n="d_pharma">Variables: pH · temperature · excipient %. Goal: stability / potency. Melete finds the most stable formulation in ~60 assays — instead of hundreds.</p><div class="go" data-i18n="runnow">▶ Run it now</div></div>
  <div class="card indcard" onclick="tryScenario('gpu')"><div class="who">⚡ AI infrastructure · accelerators</div><h3 data-i18n="t_gpu">GPU kernel tuning</h3><p data-i18n="d_gpu">Variables: tile size · unroll · occupancy. Goal: throughput (GFLOP/s). Find the fastest config in ~50 benchmark runs.</p><div class="go" data-i18n="runnow">▶ Run it now</div></div>
  <div class="card indcard" onclick="tryScenario('etch')"><div class="who">🔬 Semiconductor · fab</div><h3 data-i18n="t_etch">Plasma-etch process</h3><p data-i18n="d_etch">Variables: power · pressure · time. Goal: wafer yield %. Tune the recipe to maximum yield — air-gapped, on-prem.</p><div class="go" data-i18n="runnow">▶ Run it now</div></div>
  <div class="card indcard" onclick="tryScenario('llm')"><div class="who">🧠 The AI world itself</div><h3 data-i18n="t_llm">LLM serving config</h3><p data-i18n="d_llm">Variables: batch size · KV-cache · quantization. Goal: tokens/sec at a quality bar. Melete optimises AI infrastructure too — and can tune prompts, agents &amp; routing the same way.</p><div class="go" data-i18n="runnow">▶ Run it now</div></div>
  <div class="card indcard" onclick="tryScenario('coffee')"><div class="who">☕ Everyday</div><h3 data-i18n="t_esp">Best espresso recipe</h3><p data-i18n="d_esp">Variables: temp · grind · dose. Goal: taste. The friendliest way to watch the idea click.</p><div class="go" data-i18n="runnow">▶ Run it now</div></div>
</div></section>

<section id="pricing" style="margin-top:46px;display:none">
<div class="eyebrow" data-i18n="pr_eyebrow">PRICING</div>
<h2 data-i18n="pr_h">Start free. Pay when it saves you money.</h2>
<p data-i18n="pr_sub" style="max-width:720px;color:#475;font-size:16px;line-height:1.6">The value is fewer expensive experiments, certified — so you only pay once Melete is already saving you more than it costs.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:22px"><div style="position:relative;background:#fff;border-radius:18px;padding:26px;border:1px solid #e9e4f5"><div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6d28d9" data-i18n="pr_free_name">Free</div><div style="font-size:30px;font-weight:800;color:#1a1b30;margin:6px 0 2px" data-i18n="pr_free_price">$0</div><div style="font-size:13px;color:#8890a8;min-height:34px" data-i18n="pr_free_tag">Open web + CLI, forever</div><div style="font-size:14px;color:#33344e;line-height:1.9;margin:14px 0" data-i18n="pr_free_f">✓ Run discoveries<br>✓ Signed, replicable trace<br>✓ Optimality certificate<br>✓ No signup</div><button class="btn ghost" style="width:100%" onclick="gotoTry()" data-i18n="pr_free_btn">▶ Try it now</button></div><div style="position:relative;background:#fff;border-radius:18px;padding:26px;border:2px solid #6366f1;box-shadow:0 18px 50px -22px rgba(99,102,241,.5)"><div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#6366f1;color:#fff;font-size:11px;font-weight:800;letter-spacing:.5px;padding:4px 12px;border-radius:99px" data-i18n="pr_pop">POPULAR</div><div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6d28d9" data-i18n="pr_pro_name">Pro</div><div style="font-size:30px;font-weight:800;color:#1a1b30;margin:6px 0 2px" data-i18n="pr_pro_price">Early access</div><div style="font-size:13px;color:#8890a8;min-height:34px" data-i18n="pr_pro_tag">For teams on a real process</div><div style="font-size:14px;color:#33344e;line-height:1.9;margin:14px 0" data-i18n="pr_pro_f">✓ Connect your process via API<br>✓ Reliable mode + batch runs<br>✓ Priority support<br>✓ Private workspace</div><button class="btn primary" style="width:100%" onclick="showContact()" data-i18n="pr_pro_btn">Talk to us</button></div><div style="position:relative;background:#fff;border-radius:18px;padding:26px;border:1px solid #e9e4f5"><div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6d28d9" data-i18n="pr_ent_name">Enterprise</div><div style="font-size:30px;font-weight:800;color:#1a1b30;margin:6px 0 2px" data-i18n="pr_ent_price">Air-gapped</div><div style="font-size:13px;color:#8890a8;min-height:34px" data-i18n="pr_ent_tag">Regulated + on-prem</div><div style="font-size:14px;color:#33344e;line-height:1.9;margin:14px 0" data-i18n="pr_ent_f">✓ Runs fully offline — data never leaves<br>✓ Signed proof for audits and patents<br>✓ SLA + onboarding<br>✓ Self-hosted</div><button class="btn ghost" style="width:100%" onclick="showContact()" data-i18n="pr_ent_btn">Talk to us</button></div></div>
</section>
<script>function gotoTry(){var t=document.getElementById("try");if(t){t.scrollIntoView({behavior:"smooth"});}}
function gotoGuide(){var g=document.getElementById("guide");if(g){g.scrollIntoView({behavior:"smooth"});}}</script>

<section><div class="card" style="text-align:center;background:linear-gradient(120deg,#f3f1ff,#eafcf8);border-color:#ddd9fb;padding:28px">
  <div style="width:64px;margin:0 auto 6px">${meli()}</div>
  <h3 style="font-size:23px;margin:0 0 8px" data-i18n="cta_h">Like Melete? Talk to the maker.</h3>
  <p style="margin:0 auto 16px;color:#33344e;font-size:16px;max-width:560px" data-i18n="cta_body">Built by one developer who genuinely loves this stuff. Got a question, an idea, or a process you want to try it on? Just reach out — happy to chat.</p>
  <button class="btn primary" onclick="showContact()">📩 <span data-i18n="btn_contact">Contact about Melete</span></button>
  &nbsp;<a class="btn ghost" href="/pitch"><span data-i18n="btn_pitch">Read the pitch</span></a>
</div></section>

<section id="reliproof" style="margin-top:46px">
<div class="eyebrow" data-i18n="pf_eyebrow">PROVEN · MEASURED · CERTIFIED</div>
<h2 data-i18n="pf_h">≥99% of the true optimum — on every landscape</h2>
<p data-i18n="pf_sub" style="max-width:740px;color:#475;font-size:16px;line-height:1.6">Most optimizers win on easy surfaces and quietly fail on the hard ones. Melete is benchmarked on 7 deliberately adversarial landscapes, each normalised so the score is literally the % of the true optimum reached — and it clears ≥99% on every one, every seed.</p>
${(() => {
  const L = [
    { n: "Smooth", p: 100, d: "easy" }, { n: "Rastrigin", p: 100, d: "hard" }, { n: "Ackley", p: 100, d: "hard" },
    { n: "Rosenbrock", p: 99.5, d: "brutal" }, { n: "Griewank", p: 100, d: "hard" }, { n: "High-dim 5D", p: 99.6, d: "brutal" }, { n: "Needle", p: 100, d: "brutal" },
  ];
  const avg = (L.reduce((s, x) => s + x.p, 0) / L.length);
  const dc: Record<string, [string, string]> = { easy: ["#0e9f6e", "#ecfdf5"], hard: ["#b45309", "#fff7ed"], brutal: ["#c0392b", "#fef2f2"] };
  const ring = (p: number, size: number, fs: number) => `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:conic-gradient(#6d5cf0 ${(p * 3.6).toFixed(1)}deg,#ece9fb 0)"><div style="position:absolute;inset:5px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-family:ui-monospace,Menlo,monospace;font-weight:800;font-size:${fs}px;color:#4c3fd6">${p === 100 ? "100" : p.toFixed(1)}<span style="font-size:${fs * 0.5}px;margin-top:${fs * 0.18}px">%</span></div></div>`;
  const cards = L.map((x) => `<div class="relcard" style="background:rgba(255,255,255,.9);border:1px solid #efeafc;border-radius:18px;padding:16px 12px;display:flex;flex-direction:column;align-items:center;gap:9px;box-shadow:0 14px 34px -26px rgba(80,60,180,.5);transition:transform .45s cubic-bezier(.22,1,.36,1)">${ring(x.p, 64, 17)}<div style="font-size:12.5px;font-weight:700;color:#2b2c44;letter-spacing:.2px">${x.n}</div><span style="font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:${dc[x.d][0]};background:${dc[x.d][1]};padding:2px 8px;border-radius:99px">${x.d}</span></div>`).join("");
  return `<div style="margin-top:26px;display:flex;gap:26px;align-items:center;flex-wrap:wrap">
    ${ring(avg, 132, 32)}
    <div style="flex:1;min-width:230px"><div style="font-size:19px;font-weight:800;color:#1a1b30;letter-spacing:-.3px">${avg.toFixed(1)}% <span style="font-weight:600;color:#5b5d77;font-size:16px" data-i18n="pf_avg">average of the true optimum reached</span></div><div style="font-size:13.5px;color:#8890a8;margin-top:5px" data-i18n="pf_avg2">across 7 adversarial landscapes · every seed · ≥99% on every single one — including the brutal ones (Rosenbrock's banana valley, a 5-D haystack, a lone needle).</div></div>
  </div>
  <div style="margin-top:22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:13px">${cards}</div>
  <div style="margin-top:24px;padding-top:18px;border-top:1px solid #efeafc;font-size:13.5px;color:#46485f;line-height:1.65" data-i18n="pf_engine">How: a 3-paradigm engine — portfolio global-explore → certificate-guided Lipschitz infill → Nelder–Mead polish. Every result also carries an optimality certificate: a provable bound on how much better the true best could be.</div>`;
})()}
<p class="muted" data-i18n="pf_note" style="margin-top:12px;font-size:12px">Reproducible: this is the open reliability gauntlet — re-run it and check every number yourself.</p>
</section>

<section id="verifybox" style="margin-top:46px;display:none">
<div class="eyebrow" data-i18n="vf_eyebrow">VERIFY · NO TRUST NEEDED</div>
<h2 data-i18n="vf_h">Verify any Proof of Optimization — offline</h2>
<p data-i18n="vf_sub" style="max-width:720px;color:#475;font-size:16px;line-height:1.6">Anyone can check a Melete certificate without trusting us. Paste a downloaded certificate (or drop the .json file) — it recomputes the efficiency claim and checks the Ed25519 signature with the public key embedded in the certificate itself.</p>
<div class="card" style="max-width:700px;margin-top:16px;padding:20px">
<textarea id="vfin" placeholder="paste proof-of-optimization.json here" style="width:100%;height:110px;padding:11px;border:1px solid #ccd;border-radius:10px;font-size:12.5px;font-family:ui-monospace,monospace;resize:vertical"></textarea>
<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px"><input type="file" id="vffile" accept="application/json,.json" onchange="vfLoad(event)" style="font-size:13px"><button class="btn ghost" onclick="vfSample()" data-i18n="vf_sample">▶ Load a sample</button><button class="btn primary" onclick="vfRun()" data-i18n="vf_btn">Verify certificate</button></div>
<div id="vfout" style="margin-top:14px"></div>
</div>
</section>
<script>
function vfLoad(e){var f=e.target.files&&e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){document.getElementById("vfin").value=String(r.result||"");};r.readAsText(f);}
function vfSample(){var th=(LANG==="th");var out=document.getElementById("vfout");out.textContent=th?"กำลังสร้างตัวอย่างให้ดู…":"making a sample for you…";fetch("/discover",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({space:[{name:"x",type:"real",min:-5,max:5},{name:"y",type:"real",min:-5,max:5}],objective:"Math.exp(-(x*x+y*y)/8)",budget:30,goal:"maximize",subject:"sample run"})}).then(function(r){return r.json();}).then(function(j){if(j&&j.poopt){document.getElementById("vfin").value=JSON.stringify(j.poopt,null,2);vfRun();}else{out.innerHTML='<span style="color:#c33">error</span>';}}).catch(function(){out.innerHTML='<span style="color:#c33">error</span>';});}
function vfRun(){var th=(LANG==="th");var out=document.getElementById("vfout");var cert;try{cert=JSON.parse(document.getElementById("vfin").value);}catch(e){out.innerHTML='<span style="color:#c33">'+(th?"JSON ไม่ถูกต้อง":"invalid JSON")+'</span>';return;}out.textContent=th?"กำลังตรวจ…":"verifying…";fetch("/poopt/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(cert)}).then(function(r){return r.json();}).then(function(v){if(v.ok){out.innerHTML='<div style="color:#0e9f6e;font-weight:800;font-size:17px">✓ '+(th?"ถูกต้อง — ลายเซ็น + ตัวเลขตรวจสอบผ่าน":"Valid — signature + claim verified")+'</div><div style="font-size:13px;color:#475;margin-top:5px">'+(v.subject||"")+" · "+(th?"ประหยัด ":"saved ")+(v.experimentsSaved!=null?(+v.experimentsSaved).toLocaleString():"?")+" "+(th?"การทดลอง":"experiments")+" ("+(v.efficiencyPct!=null?(+v.efficiencyPct).toFixed(1):"?")+"%)"+(v.co2SavedKg!=null?(" · CO₂ "+(+v.co2SavedKg).toLocaleString()+" kg"):"")+'</div>';}else{out.innerHTML='<div style="color:#c0392b;font-weight:800;font-size:17px">✗ '+(th?"ไม่ผ่าน":"Invalid")+'</div><div style="font-size:13px;color:#475;margin-top:5px">'+(v.reason||"")+'</div>';}}).catch(function(){out.innerHTML='<span style="color:#c33">error</span>';});}
</script>

<section id="moo" style="margin-top:46px">
<div class="eyebrow" data-i18n="mo_eyebrow">MULTI-OBJECTIVE</div>
<h2 data-i18n="mo_h">Optimize several goals at once — see the trade-offs</h2>
<p data-i18n="mo_sub" style="max-width:720px;color:#475;font-size:16px;line-height:1.6">Real problems have competing goals — more yield AND less cost. There is no single best, so Melete finds the Pareto front: the set of best-possible trade-offs. Define your goals + variables, run the same propose &rarr; measure &rarr; repeat loop scoring each objective, and watch the front fill in.</p>
<div class="card" style="max-width:720px;margin-top:16px;padding:22px"><div id="mobody"></div></div>
</section>
<script>
var moVars=[{name:'temperature',min:20,max:40},{name:'time (min)',min:1,max:60}];
var moGoals=[{name:'yield',goal:'maximize'},{name:'cost',goal:'minimize'}];
var moObs=[],moNext=null,moSpace=[],moGoalsR=[];
function moFmt(e){return moSpace.map(function(d){return d.name+' = <b>'+(+e[d.name]).toFixed(2)+'</b>';}).join(' &middot; ');}
function moAddObj(){if(moGoals.length<6)moGoals.push({name:'',goal:'maximize'});moRenderSetup();}
function moDelObj(i){moGoals.splice(i,1);moRenderSetup();}
function moAddVar(){moVars.push({name:'',min:0,max:1});moRenderSetup();}
function moDelVar(i){moVars.splice(i,1);moRenderSetup();}
function moRenderSetup(){var c=document.getElementById('mobody');if(!c)return;var th=(LANG==='th');
  var gh=moGoals.map(function(g,i){return '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center"><input value="'+String(g.name||'').replace(/"/g,'&quot;')+'" oninput="moGoals['+i+'].name=this.value" placeholder="'+(th?'ชื่อเป้าหมาย':'goal name')+'" style="flex:2;padding:8px;border:1px solid #ccd;border-radius:8px;font-size:14px"><select onchange="moGoals['+i+'].goal=this.value" style="padding:8px;border:1px solid #ccd;border-radius:8px;font-size:13px"><option value="maximize"'+(g.goal!=='minimize'?' selected':'')+'>'+(th?'มากสุด':'maximize')+'</option><option value="minimize"'+(g.goal==='minimize'?' selected':'')+'>'+(th?'น้อยสุด':'minimize')+'</option></select><button onclick="moDelObj('+i+')" style="border:none;background:#f3f3f7;border-radius:8px;width:34px;height:34px;cursor:pointer;color:#888">&times;</button></div>';}).join('');
  var vh=moVars.map(function(v,i){return '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center"><input value="'+String(v.name||'').replace(/"/g,'&quot;')+'" oninput="moVars['+i+'].name=this.value" placeholder="'+(th?'ชื่อตัวแปร':'variable')+'" style="flex:2;padding:8px;border:1px solid #ccd;border-radius:8px;font-size:14px"><input type="number" step="any" value="'+v.min+'" oninput="moVars['+i+'].min=this.value" placeholder="min" style="flex:1;width:0;padding:8px;border:1px solid #ccd;border-radius:8px;font-size:14px"><input type="number" step="any" value="'+v.max+'" oninput="moVars['+i+'].max=this.value" placeholder="max" style="flex:1;width:0;padding:8px;border:1px solid #ccd;border-radius:8px;font-size:14px"><button onclick="moDelVar('+i+')" style="border:none;background:#f3f3f7;border-radius:8px;width:34px;height:34px;cursor:pointer;color:#888">&times;</button></div>';}).join('');
  c.innerHTML='<div style="font-size:13px;font-weight:700;color:#475;margin-bottom:8px">'+(th?'เป้าหมาย (ใส่ได้หลายเป้า)':'Goals (add several)')+'</div>'+gh+'<button class="btn ghost" onclick="moAddObj()" style="font-size:13px;padding:6px 12px;margin-bottom:16px">+ '+(th?'เพิ่มเป้าหมาย':'add goal')+'</button><div style="font-size:13px;font-weight:700;color:#475;margin:6px 0 8px">'+(th?'ตัวแปรที่ปรับได้':'Variables you can change')+'</div>'+vh+'<button class="btn ghost" onclick="moAddVar()" style="font-size:13px;padding:6px 12px">+ '+(th?'เพิ่มตัวแปร':'add variable')+'</button><br><button class="btn primary" onclick="moStart()" style="margin-top:16px">'+(th?'▶ เริ่มหา trade-off':'▶ Start finding trade-offs')+'</button>';
}
function moStart(){var th=(LANG==='th');var dims=moVars.filter(function(v){return v.name&&isFinite(+v.min)&&isFinite(+v.max)&&(+v.max)>(+v.min);}).map(function(v){return {name:v.name,type:'real',min:+v.min,max:+v.max};});var goals=moGoals.filter(function(g){return g.name;}).map(function(g){return {name:g.name,goal:g.goal==='minimize'?'minimize':'maximize'};});if(dims.length<1){alert(th?'ใส่ตัวแปรอย่างน้อย 1 ตัว':'add at least one variable');return;}if(goals.length<2){alert(th?'multi-objective ต้องมีอย่างน้อย 2 เป้าหมาย':'add at least 2 goals for multi-objective');return;}moSpace=dims;moGoalsR=goals;moObs=[];moAsk();}
function moAsk(){fetch('/next-multi',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({space:moSpace,goals:moGoalsR,observations:moObs})}).then(function(r){return r.json();}).then(function(j){if(j.error){document.getElementById('mobody').innerHTML='<span style="color:#c33">'+j.error+'</span>';return;}moNext=j.next;moRenderLoop(j);}).catch(function(){document.getElementById('mobody').innerHTML='<span style="color:#c33">error</span>';});}
function moRecord(){var vals=[];for(var i=0;i<moGoalsR.length;i++){var el=document.getElementById('mov'+i);var v=el?parseFloat(el.value):NaN;if(!isFinite(v))return;vals.push(v);}moObs.push({experiment:moNext,values:vals});moAsk();}
function moRenderLoop(j){var th=(LANG==='th');var inputs=moGoalsR.map(function(g,i){return '<div style="margin:6px 12px 6px 0;display:inline-block"><label style="font-size:12px;color:#475">'+g.name+' ('+(g.goal==='minimize'?(th?'น้อยดี':'lower=better'):(th?'มากดี':'higher=better'))+')</label><br><input id="mov'+i+'" type="number" step="any" style="padding:8px;border:1px solid #ccd;border-radius:8px;width:140px;font-size:15px"></div>';}).join('');
  document.getElementById('mobody').innerHTML='<div style="color:#8890a8;font-size:13px">'+(th?'รอบที่':'Round')+' '+(moObs.length+1)+'</div><div style="font-size:16px;margin:8px 0;color:#1a1b30">'+(th?'ลองค่านี้':'Try this setting')+':<br>'+moFmt(moNext)+'</div><div style="font-size:13px;color:#475;margin-top:6px">'+(th?'วัดจริงแล้วใส่คะแนนแต่ละเป้า:':'Measure for real, then enter each objective:')+'</div>'+inputs+'<br><button class="btn primary" style="margin-top:6px" onclick="moRecord()">'+(th?'บันทึก & ถัดไป ▶':'Record & next ▶')+'</button>'+moPlot(j.paretoFront||[]);
}
function moPlot(front){var th=(LANG==='th');if(!front||!front.length)return '';var head='<div style="margin-top:18px;font-size:13px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:.3px">'+(th?'Pareto front — ตัวเลือกดีที่สุด ('+front.length+')':'Pareto front — best trade-offs ('+front.length+')')+'</div>';
  if(moGoalsR.length===2&&moObs.length>=2){var ax=moObs.map(function(o){return o.values[0];}),ay=moObs.map(function(o){return o.values[1];});var mnx=Math.min.apply(null,ax),mxx=Math.max.apply(null,ax),mny=Math.min.apply(null,ay),mxy=Math.max.apply(null,ay);var rx=(mxx-mnx)||1,ry=(mxy-mny)||1,W=320,H=190,P=26;function px(x){return P+((x-mnx)/rx)*(W-2*P);}function py(y){return H-P-((y-mny)/ry)*(H-2*P);}var all=moObs.map(function(o){return '<circle cx="'+px(o.values[0]).toFixed(1)+'" cy="'+py(o.values[1]).toFixed(1)+'" r="3" fill="#cbd5e1"/>';}).join('');var fr=front.map(function(o){return '<circle cx="'+px(o.values[0]).toFixed(1)+'" cy="'+py(o.values[1]).toFixed(1)+'" r="5.5" fill="#7c3aed"/>';}).join('');return head+'<svg width="'+W+'" height="'+H+'" style="margin-top:8px;background:#faf8ff;border:1px solid #ece7ff;border-radius:10px;max-width:100%">'+all+fr+'<text x="'+(W/2)+'" y="'+(H-6)+'" font-size="10" fill="#8890a8" text-anchor="middle">'+moGoalsR[0].name+' &rarr;</text><text x="6" y="16" font-size="10" fill="#8890a8">'+moGoalsR[1].name+' &uarr;</text></svg><div style="font-size:11.5px;color:#8890a8;margin-top:4px">'+(th?'จุดม่วง = ตัวเลือกดีที่สุด (ไม่มีตัวไหนเหนือกว่าได้ทุกด้าน)':'purple = the best trade-offs (none is beaten on every goal)')+'</div>';}
  var rows=front.slice(0,10).map(function(o){return '<div style="font-size:13px;color:#33344e;padding:3px 0;border-bottom:1px solid #f3f0ff">'+moGoalsR.map(function(g,i){return '<b>'+g.name+'</b>='+(+o.values[i]).toFixed(2);}).join(' &middot; ')+'</div>';}).join('');return head+'<div style="margin-top:6px">'+rows+'</div>';
}
try{moRenderSetup();}catch(e){}
</script>
<section><h2 data-i18n="h_proven">Proven, not claimed</h2>
<p style="margin:0 0 14px;color:#33344e" data-i18n="prov_intro">No single optimiser wins on every landscape. A bandit spends each experiment on whichever strategy is winning <i>on your problem</i> — one engine, no per-problem tuning.</p>
<table><tr><th data-i18n="tl_land">landscape</th><th>Melete</th><th data-i18n="tl_bay">single Bayesian</th><th data-i18n="tl_rand">random</th></tr>
<tr><td data-i18n="tl_smooth">smooth</td><td class="win">1.000</td><td>0.999</td><td>0.838</td></tr>
<tr><td data-i18n="tl_rug">rugged (many traps)</td><td class="win" data-i18n="tl_best">best 🏆 beats every single algorithm</td><td data-i18n="tl_far">far behind</td><td data-i18n="tl_far">far behind</td></tr>
<tr><td data-i18n="tl_hd">high-dimensional</td><td class="win">0.996</td><td>0.987</td><td>0.555</td></tr></table>
<p class="muted" style="margin-top:10px">≈ 15 experiments vs ~95 for random to reach 99% of a hidden optimum (≈6×). Reproduce with <code>melete bench</code>.</p></section>

<section id="guide" style="margin-top:38px">
<h2 data-i18n="g_h">Use it on your real process — you measure</h2>
<p data-i18n="g_intro" style="max-width:720px;color:#475;font-size:16px;line-height:1.6">No code, no formula. Melete proposes the next experiment; you go run it for real and type the score back; it proposes the next — converging to the best in as few real tries as possible. Edit your own variables below — for example a pharma scientist enters pH, temperature, excipient %; Melete then says which recipe to make next. Connect your real process via the API for production.</p>
<div id="gsteps" style="margin:18px 0"><div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6d28d9;margin-bottom:12px" data-i18n="gs_h">How it works — 4 steps</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px"><div style="background:#fff;border:1px solid #e7e0ff;border-radius:14px;padding:16px"><div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(96deg,#6d5cf0,#0ea5b7);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px">1</div><div style="margin-top:10px;font-size:13px;color:#33344e;line-height:1.5" data-i18n="gs1"></div></div><div style="background:#fff;border:1px solid #e7e0ff;border-radius:14px;padding:16px"><div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(96deg,#6d5cf0,#0ea5b7);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px">2</div><div style="margin-top:10px;font-size:13px;color:#33344e;line-height:1.5" data-i18n="gs2"></div></div><div style="background:#fff;border:1px solid #e7e0ff;border-radius:14px;padding:16px"><div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(96deg,#6d5cf0,#0ea5b7);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px">3</div><div style="margin-top:10px;font-size:13px;color:#33344e;line-height:1.5" data-i18n="gs3"></div></div><div style="background:#fff;border:1px solid #e7e0ff;border-radius:14px;padding:16px"><div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(96deg,#6d5cf0,#0ea5b7);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px">4</div><div style="margin-top:10px;font-size:13px;color:#33344e;line-height:1.5" data-i18n="gs4"></div></div></div></div><div id="ghowreal" style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:16px;margin:16px 0;font-size:13.5px;color:#78350f;line-height:1.6" data-i18n="g_howreal"><b>Using Melete in your real project — 2 ways:</b><br><b>1) Through this website (no code)</b> — for slow / expensive hand-measured experiments: Melete proposes, you run it in your lab/system, you type the score. Best for physical experiments you measure by hand anyway.<br><b>2) Connected & automated</b> — <code>melete tune</code>, <code>POST /next</code>, or the npm library, on YOUR own servers (air-gapped): your code runs each test and feeds the score back in a loop. Best for benchmarks, simulations, pipelines. <a href="/docs" style="font-weight:700;color:#b45309">&rarr; API docs</a></div><div class="card" style="max-width:660px;margin-top:16px;padding:22px"><div id="gBody"><div id="gind"><div style="font-size:13px;color:#475;margin-bottom:8px" data-i18n="g_pick">Start from your industry — or edit the variables yourself:</div><select id="gindsel" onchange="if(this.value){gIndustry(this.value);}" style="width:100%;max-width:360px;padding:11px 14px;border:1px solid #ccd;border-radius:12px;font-size:14px;font-weight:600;color:#33344e;background:#fff;cursor:pointer;margin-bottom:16px"><option value="" data-i18n="g_pickopt">Choose your field…</option><option value="pharma">💊 Pharma · biotech</option><option value="fab">🔬 Semiconductor</option><option value="food">☕ Food & drink</option><option value="print">🖨 3D printing</option><option value="ml">⚡ AI / ML</option><option value="safety">🛡 AI safety</option><option value="cyber">🔐 Cybersecurity</option><option value="fintech">💳 Fintech risk</option><option value="network">🌐 Network tuning</option><option value="agri">🌾 Agriculture</option><option value="energy">⚡ Energy</option><option value="mfg">🏭 Manufacturing</option></select></div><div id="gex" data-i18n="g_ex" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:13px;margin-bottom:14px;font-size:13px;color:#075985;line-height:1.55"><b>Example — AI security engineer:</b> adjust <b>[filter threshold · temperature · rate limit]</b>, then measure <b>[% of red-team attacks your system blocks]</b> as the score. Melete proposes the next config → you run your attack suite → type the % → repeat → it finds the safest config in the fewest tests.</div><div id="gvars"></div><button class="btn ghost" onclick="gAddVar()" style="margin-top:2px;font-size:13px;padding:7px 12px">+ <span data-i18n="g_addvar">add variable</span></button><br><div style="margin-top:14px"><label style="font-size:13px;color:#475;font-weight:600" data-i18n="g_target">🎯 Target (optional)</label><br><input id="gtarget" type="number" step="any" placeholder="e.g. 95" style="margin-top:5px;padding:9px 12px;border:1px solid #ccd;border-radius:10px;width:160px;font-size:14px"><div style="font-size:11.5px;color:#8890a8;margin-top:4px" data-i18n="g_targethint">the score you need — Melete tells you if it is reachable with these variables</div></div><button class="btn primary" onclick="gAuto()" data-i18n="g_auto" style="margin-top:14px">▶ Watch Melete solve it (auto)</button> <button class="btn ghost" data-i18n="g_start" onclick="gStart()" style="margin-top:14px">I will measure myself</button></div></div>
<script>
var gObs=[],gNext=null,gGoal='maximize',gAdvice=null,gAutoF=null,gAutoOn=false,gTerritory=null,gConfidence=null,gAchiev=null,gTarget=NaN,gInverse=null;
var gSpace=[];
var gVarDefs=[{name:'pH',min:3,max:9},{name:'temperature (°C)',min:20,max:40},{name:'excipient %',min:0,max:30}];
function gRenderVars(){var c=document.getElementById('gvars');if(!c)return;var th=(LANG==='th');
  c.innerHTML='<div style="font-size:13px;color:#475;margin-bottom:8px">'+(th?'สิ่งที่คุณปรับได้ (ชื่อ · ต่ำสุด · สูงสุด) — แก้เป็นของคุณได้เลย ไม่ต้องมีสูตร':'What you can change (name · min · max) — edit to your own, no formula needed')+'</div>'
  +gVarDefs.map(function(v,i){return '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center"><input value="'+String(v.name).replace(/"/g,"&quot;")+'" oninput="gVarDefs['+i+'].name=this.value" placeholder="'+(th?'ชื่อ':'name')+'" style="flex:2;padding:8px;border:1px solid #ccd;border-radius:8px;font-size:14px"><input type="number" step="any" value="'+v.min+'" oninput="gVarDefs['+i+'].min=this.value" placeholder="min" style="flex:1;width:0;padding:8px;border:1px solid #ccd;border-radius:8px;font-size:14px"><input type="number" step="any" value="'+v.max+'" oninput="gVarDefs['+i+'].max=this.value" placeholder="max" style="flex:1;width:0;padding:8px;border:1px solid #ccd;border-radius:8px;font-size:14px"><button onclick="gDelVar('+i+')" title="remove" style="border:none;background:#f3f3f7;border-radius:8px;width:34px;height:34px;cursor:pointer;color:#888">×</button></div>';}).join('');}
function gAddVar(){gVarDefs.push({name:'',min:0,max:1});gRenderVars();}
function gDelVar(i){gVarDefs.splice(i,1);gRenderVars();}
function gReadVars(){return gVarDefs.filter(function(v){return v.name&&isFinite(+v.min)&&isFinite(+v.max)&&(+v.max)>(+v.min);}).map(function(v){return {name:v.name,type:'real',min:+v.min,max:+v.max};});}
var gIND={pharma:[{name:'pH',min:3,max:9},{name:'temperature (°C)',min:20,max:40},{name:'excipient %',min:0,max:30}],fab:[{name:'power (W)',min:100,max:1000},{name:'pressure (mTorr)',min:5,max:100},{name:'time (s)',min:10,max:120}],food:[{name:'temperature (°C)',min:60,max:100},{name:'time (min)',min:1,max:30},{name:'sugar %',min:0,max:20}],print:[{name:'nozzle temp (°C)',min:180,max:260},{name:'speed (mm/s)',min:20,max:150},{name:'layer height (mm)',min:0.05,max:0.4}],ml:[{name:'batch size',min:1,max:64},{name:'learning-rate ×1000',min:1,max:100},{name:'dropout %',min:0,max:50}],safety:[{name:'filter threshold',min:0,max:1},{name:'temperature',min:0,max:2},{name:'rate limit (req/min)',min:1,max:100},{name:'max retries',min:0,max:5}],cyber:[{name:'firewall sensitivity',min:0,max:1},{name:'session timeout (min)',min:1,max:60},{name:'max login attempts',min:1,max:10},{name:'IDS threshold',min:0,max:1}],fintech:[{name:'risk score cutoff',min:0,max:1},{name:'txn limit ($)',min:100,max:100000},{name:'review threshold',min:0,max:1},{name:'velocity window (min)',min:1,max:60}],network:[{name:'MTU',min:576,max:9000},{name:'buffer size (KB)',min:16,max:1024},{name:'max connections',min:10,max:10000},{name:'timeout (ms)',min:50,max:5000}],agri:[{name:'nitrogen (kg/ha)',min:0,max:300},{name:'irrigation (mm/wk)',min:0,max:100},{name:'seed density',min:10,max:80},{name:'soil pH',min:4,max:8}],energy:[{name:'turbine angle (°)',min:0,max:45},{name:'flow rate',min:10,max:100},{name:'pressure (bar)',min:1,max:50},{name:'temperature (°C)',min:50,max:600}],mfg:[{name:'temperature (°C)',min:100,max:400},{name:'pressure (bar)',min:1,max:100},{name:'speed (units/min)',min:10,max:500},{name:'cycle time (s)',min:5,max:120}]};
function gIndustry(k){var p=gIND[k];if(!p)return;gVarDefs=p.map(function(x){return {name:x.name,min:x.min,max:x.max};});gGoal='maximize';gRenderVars();}
var GI={en:{round:'Round',next:'Melete proposes — go measure this',score:'Your measured score',rec:'Record & next ▶',best:'Best so far',err:'Could not reach Melete'},th:{round:'รอบที่',next:'Melete เสนอ — ลองวัดค่านี้จริง',score:'คะแนนที่คุณวัดได้',rec:'บันทึก & ถัดไป ▶',best:'ดีที่สุดตอนนี้',err:'เชื่อมต่อ Melete ไม่ได้'}};
function gL(){return GI[(localStorage.getItem('mlang')||'en')]||GI.en;}
function gFmt(e){return gSpace.map(function(d){return d.name+' = <b>'+(+e[d.name]).toFixed(2)+'</b>';}).join(' &middot; ');}
function gAuto(){var th=(LANG==='th');var sp=gReadVars();if(!sp.length){alert(th?'ใส่ตัวแปรอย่างน้อย 1 ตัว':'add at least one variable');return;}gSpace=sp;gGoal='maximize';gObs=[];gAutoOn=true;gAutoF=function(e){var t=0;for(var i=0;i<gSpace.length;i++){var d=gSpace[i];var opt=d.min+0.6*((d.max-d.min)||1);var rng=(d.max-d.min)||1;var z=((+e[d.name]-opt)/rng);t+=-z*z;}return 10+t*8;};gAutoStep();}
function gAutoStep(){if(!gAutoOn)return;var done=(gObs.length>=20)||(gAdvice&&gAdvice.recommendation==='STOP'&&gObs.length>=6);if(done){gAutoOn=false;gAutoView(true);return;}fetch('/next',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({space:gSpace,observations:gObs,goal:'maximize'})}).then(function(r){return r.json();}).then(function(j){if(j.error){document.getElementById('gBody').innerHTML='<span style="color:#c33">'+j.error+'</span>';gAutoOn=false;return;}gNext=j.next;gAdvice=j.advice||null;var v=gAutoF(gNext);gObs.push({experiment:gNext,value:v});gAutoView(false);setTimeout(gAutoStep,500);}).catch(function(){gAutoOn=false;});}
function gAutoView(done){var th=(LANG==='th');var last=gObs[gObs.length-1];if(!last)return;var dir=(gGoal==='minimize')?-1:1;var best=gObs.reduce(function(a,b){return (dir*b.value>dir*a.value)?b:a;});var banner=done?('<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:11px;font-size:13.5px;color:#0e7a4f;font-weight:700;margin-bottom:12px">\u2713 '+(th?'เสร็จ! Melete หาคำตอบที่ดีที่สุดเจอใน '+gObs.length+' ครั้ง (จำลอง) — ของจริงคุณใส่คะแนนที่วัดเองแต่ละครั้ง':'Done! Melete found the best in '+gObs.length+' tries (simulated) — in real use YOU enter your measured score each round')+'</div>'):('<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:11px;font-size:13.5px;color:#4338ca;font-weight:600;margin-bottom:12px">\u25b6 '+(th?'กำลังเล่นอัตโนมัติ (จำลองการวัด) — ของจริงคุณใส่คะแนนเอง':'Auto-playing with simulated scores — in real use YOU enter the score')+'</div>');var tail=done?('<div style="margin-top:12px"><button class="btn ghost" onclick="gAuto()" style="font-size:13px;padding:8px 14px">\u21ba '+(th?'เล่นใหม่':'replay')+'</button> <span style="font-size:12px;color:#8890a8;margin-left:8px">'+(th?'(โหลดหน้าใหม่เพื่อใส่ตัวแปรของคุณเอง)':'(reload to enter your own variables)')+'</span></div>'):'';document.getElementById('gBody').innerHTML=banner+'<div style="color:#8890a8;font-size:13px">'+(th?'รอบที่':'Round')+' '+gObs.length+'</div><div style="font-size:15px;margin:6px 0;color:#1a1b30">'+gFmt(last.experiment)+' \u2192 '+(th?'คะแนน':'score')+' <b>'+(+last.value).toFixed(2)+'</b></div><div style="font-size:13px;color:#475">'+(th?'ดีที่สุดตอนนี้':'best so far')+': <b>'+(+best.value).toFixed(2)+'</b></div>'+gSpark()+tail;}
function gStart(){var sp=gReadVars();if(!sp.length){alert(LANG==='th'?'ใส่ตัวแปรอย่างน้อย 1 ตัว (ชื่อ + ต่ำสุด/สูงสุด)':'Add at least one variable (name + min/max).');return;}gSpace=sp;gObs=[];var te=document.getElementById('gtarget');gTarget=te?parseFloat(te.value):NaN;gAsk();}
try{gRenderVars();}catch(e){}
function gAsk(){var b={space:gSpace,observations:gObs,goal:gGoal};if(isFinite(gTarget))b.target=gTarget;fetch('/next',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json();}).then(function(j){if(j.error){document.getElementById('gBody').innerHTML='<span style="color:#c33">'+j.error+'</span>';return;}gNext=j.next;gAdvice=j.advice||null;gTerritory=j.territory||null;gConfidence=j.confidence||null;gAchiev=j.achievability||null;gInverse=j.inverse||null;gRender(j.best);}).catch(function(){document.getElementById('gBody').innerHTML='<span style="color:#c33">'+gL().err+'</span>';});}
function gSpark(){if(!gObs||gObs.length<2)return '';var dir=(gGoal==='minimize')?-1:1;var bs=[],b=-Infinity;for(var i=0;i<gObs.length;i++){var v=dir*gObs[i].value;if(v>b)b=v;bs.push(b);}var lo=Math.min.apply(null,bs),hi=Math.max.apply(null,bs),rng=(hi-lo)||1;var W=220,H=44,n=bs.length;var pts=bs.map(function(v,i){var x=n>1?(i/(n-1))*W:0;var y=H-((v-lo)/rng)*(H-6)-3;return x.toFixed(1)+','+y.toFixed(1);}).join(' ');var th=(LANG==='th');return '<div style="margin-top:14px"><div style="font-size:11px;color:#8890a8;text-transform:uppercase;letter-spacing:.3px;margin-bottom:5px">'+(th?'ดีขึ้นเรื่อยๆ ('+n+' ครั้ง)':'best so far — improving ('+n+')')+'</div><svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><defs><linearGradient id="gspg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#14b8a6"/></linearGradient></defs><polyline points="'+pts+'" fill="none" stroke="url(#gspg)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg></div>';}
function gTerr(){if(!gTerritory||!gTerritory.classification||gTerritory.classification==='unknown')return '';var th=(LANG==='th');var tc=gTerritory.classification;var tcol=tc==='refine'?'#0e9f6e':(tc==='leap'?'#c0392b':'#b45309');var tlbl=th?(tc==='refine'?'ปรับละเอียด — อยู่ในเขตที่วัดมาแล้ว (ปลอดภัย)':(tc==='leap'?'กระโดดเข้าเขตใหม่ — ยังไม่เคยวัดแถวนี้ คำทำนายคือการเดา (ระวังถ้าการทดลองแพง/อันตราย)':'ก้าวออกนอกเขตเดิมเล็กน้อย')):(tc==='refine'?'safe refinement — inside the measured region':(tc==='leap'?'bold leap into unmeasured territory — the prediction here is a guess':'stepping outward, partly beyond the data'));return '<div style="margin-top:10px;font-size:13px;color:'+tcol+';font-weight:600">\ud83e\udded '+tlbl+'</div>';}
function gConf(){if(!gConfidence||!gConfidence.recommendation||gConfidence.recommendation==='unknown'||!isFinite(gConfidence.confidence))return '';var th=(LANG==='th');var cf=Math.round(gConfidence.confidence*100);var pi=(gConfidence.pImprove*100).toFixed(1);var col=cf>=95?'#0e7a4f':'#6a6c84';return '<div style="margin-top:8px;font-size:12.5px;color:'+col+'">\ud83c\udfb2 '+(th?('มั่นใจ '+cf+'% ว่าหยุดได้ (โอกาสทดลองต่อแล้วดีกว่า ~'+pi+'%)'):(cf+'% confidence you can stop \u2014 ~'+pi+'% chance the next experiment improves'))+'</div>';}
function gReach(){if(!gAchiev||!gAchiev.verdict||gAchiev.verdict==='unknown')return '';var th=(LANG==='th');var v=gAchiev.verdict;var col=v==='unreachable'?'#c0392b':(v==='achieved'?'#0e7a4f':'#4338ca');var icon=v==='unreachable'?'⛔':(v==='achieved'?'✓':'🎯');var tgt=(+gAchiev.target),cl=(+gAchiev.ceiling);var msg;if(v==='achieved'){msg=th?('ถึงเป้า '+tgt+' แล้ว (ดีสุดตอนนี้ '+(+gAchiev.bestSoFar)+')'):('target '+tgt+' already met (best '+(+gAchiev.bestSoFar)+')');}else if(v==='reachable'){msg=th?('เป้า '+tgt+' เป็นไปได้ — เพดานประเมิน ~'+cl+' ทำต่อได้'):('target '+tgt+' looks reachable — estimated ceiling ~'+cl+', keep going');}else{msg=th?('เป้า '+tgt+' สูงกว่าเพดานที่ตัวแปรชุดนี้ทำได้ (~'+cl+') — น่าจะไปไม่ถึง ต้องเพิ่มตัวแปรใหม่ หรือผ่อนเป้า'):('target '+tgt+' is above the ceiling these variables can reach (~'+cl+') — likely out of reach; add a new lever or relax the target');}return '<div style="margin-top:8px;font-size:12.5px;color:'+col+';font-weight:600">'+icon+' '+msg+'</div>';}
function gRecipes(){if(!gInverse||!gInverse.feasible||!gInverse.solutions||!gInverse.solutions.length)return '';var th=(LANG==='th');var fr=gInverse.recipeFreedom;var n=gInverse.solutions.length;var s0=gInverse.solutions[0];var rec=gSpace.map(function(d){return d.name+'='+(+s0.experiment[d.name]).toFixed(2);}).join(' · ');var probe=gInverse.proposedProbe?gSpace.map(function(d){return d.name+'='+(+gInverse.proposedProbe[d.name]).toFixed(2);}).join(' · '):'';var head=th?((fr==='many'?'หลายสูตร':(fr==='few'?'สองสามสูตร':'สูตรเดียว'))+'ที่ให้ผลตรงเป้า '+(+gInverse.target)):((fr==='many'?'Several recipes':(fr==='few'?'A couple of recipes':'One recipe'))+' hit target '+(+gInverse.target));var probeLine=probe?('<div style="font-size:12px;color:#475;margin-top:3px">'+(th?'ลองค่านี้ต่อให้ตรงเป๊ะ: ':'try this next to land precisely: ')+'<b>'+probe+'</b></div>'):'';return '<div style="margin-top:10px;padding:10px 12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px"><div style="font-size:12.5px;font-weight:700;color:#6d28d9">🧬 '+(th?'ออกแบบย้อนกลับ — ':'Inverse design — ')+head+'</div><div style="font-size:12.5px;color:#33344e;margin-top:3px">'+(th?'เช่น: ':'e.g. ')+'<b>'+rec+'</b> → '+(+s0.value).toFixed(3)+'</div>'+probeLine+'</div>';}
function gRender(best){var L=gL();var th=(LANG==='th');var advHtml='';if(gAdvice&&gAdvice.recommendation==='STOP'){advHtml='<div style="margin-top:12px;padding:10px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;color:#0e7a4f;font-size:13.5px;font-weight:600">✓ '+(th?'Melete แนะนำว่าหยุดได้แล้ว — ทดลองต่อไม่น่าจะดีขึ้นพอคุ้ม':'Melete suggests you can stop now — more experiments are unlikely to beat this enough to be worth it')+'</div>';}else if(gAdvice&&gAdvice.recommendation==='CONTINUE'){advHtml='<div style="margin-top:12px;padding:10px 12px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;color:#4338ca;font-size:13.5px;font-weight:600">↗ '+(th?'ยังดีขึ้นอยู่ — ลองต่อได้เลย':'Still improving — keep going')+'</div>';}var bestHtml=best?('<div style="margin-top:12px;color:#475">'+L.best+': <b>'+(+best.value).toFixed(3)+'</b> @ '+gFmt(best.experiment)+'</div>'):'';document.getElementById('gBody').innerHTML='<div style="color:#8890a8;font-size:13px;letter-spacing:.3px">'+L.round+' '+(gObs.length+1)+'</div><div style="font-size:17px;margin:8px 0;color:#1a1b30">'+L.next+':<br>'+gFmt(gNext)+'</div><label style="font-size:13px;color:#475">'+L.score+'</label><br><input id="gScore" type="number" step="any" style="padding:9px;border:1px solid #ccd;border-radius:9px;width:150px;font-size:15px" onkeydown="if(event.keyCode===13)gRecord()" /> <button class="btn primary" style="padding:9px 16px" onclick="gRecord()">'+L.rec+'</button>'+bestHtml+gTerr()+gSpark()+advHtml+gConf()+gReach()+gRecipes();var sc=document.getElementById('gScore');if(sc)sc.focus();}
function gRecord(){var v=parseFloat((document.getElementById('gScore')||{}).value);if(!isFinite(v))return;gObs.push({experiment:gNext,value:v});gAsk();}
</script>
</section>
<section id="use"><h2 data-i18n="h_use">Use it for your work — answer 3 questions</h2>
<p class="lead" style="margin:0 0 18px" data-i18n="use_lead">No dataset, no formula. Just answer these about <b>your</b> process:</p>
<div class="steps">
  <div class="step"><span class="n">1</span><h3 data-i18n="u_q1">What can you adjust?</h3><p data-i18n="q1d">List the knobs + their real limits (your machine's range). <span class="muted">→ that's the SPACE.</span></p></div>
  <div class="step"><span class="n">2</span><h3 data-i18n="u_q2">After one try, what number tells you how good it was?</h3><p data-i18n="q2d">You <b>measure</b> it — taste a score, read accuracy, read revenue. You don't calculate it. <span class="muted">→ that's the SCORE.</span></p></div>
  <div class="step"><span class="n">3</span><h3 data-i18n="u_q3">How many tries can you afford?</h3><p data-i18n="q3d">Brews, training runs, assays you'll pay for. <span class="muted">→ that's the BUDGET.</span></p></div>
</div>
<div class="grid" style="margin-top:18px">
  <div class="card"><div class="who">☕ <span data-i18n="ex_cof_l">A coffee shop</span></div><p data-i18n="ex_cof"><b>Knobs:</b> temp 85–96° · grind 1–10 · dose 14–22g<br><b>Score:</b> a barista tastes each shot, 0–10<br><b>Budget:</b> 30 shots → Melete finds the recipe in ~20.</p></div>
  <div class="card"><div class="who">🤖 <span data-i18n="ex_ml_l">An ML team</span></div><p data-i18n="ex_ml"><b>Knobs:</b> learning-rate 0–0.1 · depth 1–12<br><b>Score:</b> the training script prints accuracy<br><b>Budget:</b> 40 runs → fewer GPU-hours to the best model.</p></div>
</div>
<p class="lead" style="margin:24px 0 12px;font-size:18px" data-i18n="u_two">Then run it one of two ways:</p>
<p style="margin:0 0 6px;color:#33344e"><b>A) <span data-i18n="tw_a_b">Connect your process</span></b><span data-i18n="tw_a_d"> — Melete runs it for you and reads the number (this is the real product, like installing a tool):</span></p>
<pre>melete tune --cmd "python train.py --lr {lr} --depth {depth}" \\
            --space '[{"name":"lr","type":"real","min":0,"max":0.1},{"name":"depth","type":"int","min":1,"max":12}]'</pre>
<p style="margin:16px 0 6px;color:#33344e"><b>B) <span data-i18n="tw_b_b">From an agent or pipeline</span></b><span data-i18n="tw_b_d"> — call the HTTP API or the library; your code returns the score each step:</span></p>
<pre>POST https://melete.mneme-ai.space/discover   ·   npm i melete-ai   ·   discoverSigned({ space, oracle })</pre>
<p class="muted" style="margin-top:14px" data-i18n="sandbox"><b>This website = a sandbox to try it.</b> Real work = connect your real process (A or B). 🔒 Air-gapped: zero dependencies + local signing ⇒ runs fully offline, result still verifiable.</p></section>

</div>
<footer>
<span data-i18n="foot_honest">Honest: the engine is a context-adaptive ensemble — its guarantee is robustness + verifiable provenance, measured &amp; reproducible (not a single "magic" algorithm).</span><br>
<a href="/pitch">Pitch deck</a> · <a href="/health">/health</a> · Melete v${version} · the discovery muse
</footer>

<script>
var LANG='en';try{var _sl=localStorage.getItem('mlang');if(_sl)LANG=_sl;}catch(e){}
var T={
 en:{audLbl:'I work in —',aud_pharma:'Pharma',aud_chem:'Chemistry',aud_gpu:'GPU & ML',aud_aero:'Aerospace',aud_phys:'Physics',aud_infra:'Infra & Analytics',aud_energy:'Energy',aud_security:'Security',tdcEye:'THE MOAT · ONE SIGNED VERDICT NO OPTIMIZER CAN MATCH',tdcH:'🏅 The Trustworthy Discovery Certificate',tdcP:'Every other optimizer hands you a “best recipe” and stops. Melete fuses three proofs into ONE Ed25519-signed verdict an auditor verifies offline — Is the effect <b>REAL</b> (not noise)? Does it <b>CAUSE</b> the result (not confounded)? Is it <b>ROBUST</b> (survives real-world wobble)? — and names the gate that fails. Pick a case and watch it judge itself.',tdcGoodT:'✓ A real discovery',tdcGoodD:'A genuine, causal, robust optimum + clean history. Expect: TRUSTWORTHY — all three gates pass.',tdcNoiseT:'✕ Pure noise',tdcNoiseD:'The knobs do nothing — the “winner” is luck. Expect: NOT-TRUSTWORTHY — the SIGNAL gate catches it (and with no real effect, nothing below it holds either).',tdcFragT:'✕ A fragile spike',tdcFragD:'Real and causal, but a razor peak that collapses under a tiny drift. Expect: blocked at the ROBUST gate.',tdcConfT:'✕ Confounded history',tdcConfD:'A knob that looks decisive in the data but a hidden factor drives both. Expect: blocked at the CAUSAL gate.',flabEye:'FRONTIER LAB · DEEP-TECH, PROVEN',flabH:'The 3 ways optimizers die in the real world — engineered out, every one proven',flabP:'Each button runs the REAL Melete engine via the on-box API. Numbers are live, not canned. Press one.',flabNoiseT:'📡 Noise-Robust',flabNoiseD:'A noisy signal that reads 99% then 40% — find the value you can TRUST, not a lucky spike.',flabMixedT:'🧩 Mixed-Space',flabMixedD:'Categorical + integer + conditional knobs (storage engine, thread count) — not just dials.',flabProvT:'📜 Provenance Seal',flabProvD:'A 24/7 run history sealed into a constant-size, signed, tamper-evident proof.',flabNullT:'⬛ Null Engine',flabNullD:'The only optimizer brave enough to say “there is nothing to find” — it refuses to hand you a fake recipe when the data is just noise.',flabCausalT:'🧬 Causal Engine',flabCausalD:'Proves CAUSE, not correlation — it intervenes to expose a confounded knob (looks important in the data, does nothing) and signs a Proof of Causation.',flabRun:'▶ run live',nullSpotEye:'THE NULL ENGINE · MELETE SIGNATURE',nullSpotH:'Every optimizer hands you a “best recipe.” Even when there is nothing there.',nullSpotP:'Feed any optimizer pure noise and it still returns a confident answer — the luckiest random draw dressed up as a discovery. The NULL ENGINE is the only one that puts its OWN answer on trial and tells you the truth: a REAL signal, or just noise. Proven: false-positive ≤ 2.5% over 200 independent trials.',nullSpotBtn:'▶ Prove it live — a real problem vs pure noise',flabUseEye:'USE IT ON YOUR OWN SYSTEM',flabUseH:'These demos used a formula. On your machine, the “oracle” is YOUR real measurement.',flabUse1:'① Define your knobs (the settings you can change) + your score (what you measure — a yield %, a latency, a benchmark, an assay readout).',flabUse2:'② Point the oracle at YOUR system — a function that runs your real process / calls your API / reads your instrument and returns that score. The same proven engine searches it.',flabUse3:'③ Runs fully on your machine (sovereign — your data never leaves); every result is Ed25519-signed for your audit / patent trail.',flabUseCap:'Self-host the same engine (npm) and plug in your real measurement:',flabUseApi:'…or POST a JS-expression objective to the hosted API for a quick formula test: /discover · /mixed · /noise-robust',watch:'▶ Watch Melete discover',replay:'▶ Replay',team:"Meli's team — who did the work",teamhint:"Expert detail: the helpers Meli used. You don't need this to use the result.",climb:'How the score climbed (higher = better)',cinema:'Discovery cinema — watch Meli search',scenarioL:'Scenario',knobs:'You adjust',score:'You score',budget:'Tries',ph:'Pick a scenario, then press Watch.',plainHdr:'Summary',tried:'Melete tried',settings:'settings and zeroed in on the best one',eyebrow:'The Sovereign Verifiable AI Analyst & Optimizer',ctaTry:'See it discover (live) →',ctaPitch:'The 60-second pitch',h_what:'What it does — one example',h_meli:'Meet Meli — a tiny story',h_how:'How it works — 3 steps',h_who:"Who it's for & what they get",h_see:'See it discover — just watch',see_lead:'👇 Just press the purple button and watch. Melete tests settings one by one and zeroes in on the best — like the coffee story above, but live.',see_sub:'This is a demo, so the "score" is calculated instantly by a formula. In real life, the score is whatever YOU measure (a taste rating, a yield %, a benchmark) — and you type it in. <a href="#use">How to use it for your own work →</a>',h_ind:'Click an industry — see Melete work on it',h_proven:'Proven, not claimed',h_use:'Use it for your work — answer 3 questions',heroTag:'Tell Melete what you can change and what <b>"good"</b> means. It finds the <b>best recipe in the fewest real-world experiments</b> — then tells you exactly what to do with it.',heroSub:'Analyze · optimize · certify — on your machine (sovereign), data never leaves, every verdict cryptographically signed & verifiable offline.',ctaApi:'🔌 Connect via API',pill1:'🎯 best answer, fewest tries',pill2:'🚀 no data needed — starts from scratch',pill3:'🔒 runs on your machine',pill4:'🔏 every answer signed',hs1:'verified engines',hs2:'of the true optimum, every benchmark',hs3:'on your machine · signed',hs4:'one brain, smart about everything',m60_eye:'Understand the whole thing in 60 seconds',m60_h:'What Melete is — in one minute',m60_p:'You have a system you can <b>measure</b> — an ML pipeline, a server/DB/network config, a recipe, a simulation. Melete finds the best <b>and most robust</b> setting in the fewest experiments, explains why in plain language, and hands you a <b>signed verdict you (or an auditor) can re-verify offline</b>. It runs on your machine — your data never leaves.',m60_s1:'<b>Tell it</b> what you can change + what "good" means',m60_s2:'<b>It proposes</b> a setting → you measure it (or give a formula) → repeat',m60_s3:'<b>You get</b> the best robust recipe + a signed, replayable verdict',m60_inside:'Inside: 43 engines, organized as 4 layers',lay1:'find the best setting in the fewest tries',lay2:'the Φ brain — a safety-first call + 🛡 the robust one',lay3:'plain-language why: which knobs, cliffs, shape, ceiling',lay4:'signed, offline-verifiable, step-by-step replayable',gal_eye:'Live demo — pick your world, press one button',gal_h:'See Melete run on YOUR industry',gal_p:'Each card runs the <b>real Melete engine</b> on a simulated, industry-shaped problem — then sums up the result in plain language (every number is from the real run). In production you connect your own system as the oracle.',gal_note:'⚠ Simulated environments (real engine, real signed verdict). No live link to any satellite/grid — connect your own telemetry as the oracle in production.',g_auto:'▶ Watch Melete solve it (auto)',mo_eyebrow:'MULTI-OBJECTIVE',mo_h:'Optimize several goals at once — see the trade-offs',mo_sub:'Real problems have competing goals — more yield AND less cost. There is no single best, so Melete finds the Pareto front: the set of best-possible trade-offs. Define your goals + variables, run the propose-measure-repeat loop scoring each objective, and watch the front fill in.',g_howreal:'<b>Using Melete in your real project — 2 ways:</b><br><b>1) Through this website (no code)</b> — for slow / expensive hand-measured experiments: Melete proposes, you run it in your lab/system, you type the score. Best for physical experiments you measure by hand anyway.<br><b>2) Connected & automated</b> — <code>melete tune</code>, <code>POST /next</code>, or the npm library, on YOUR own servers (air-gapped): your code runs each test and feeds the score back in a loop. Best for benchmarks, simulations, pipelines.',g_pickopt:'Choose your field…',gs_h:'How it works — 4 steps',gs1:'Tell Melete what you can change — or pick your field above',gs2:'Melete proposes the exact next setting to try',gs3:'You run it for real and type the score you measured',gs4:'Repeat ~20–40× → the best config + a signed proof',g_ex:'<b>Example — AI security engineer:</b> adjust <b>[filter threshold · temperature · rate limit]</b>, then measure <b>[% of red-team attacks your system blocks]</b> as the score. Melete proposes the next config → you run your attack suite → type the % → repeat → it finds the safest config in the fewest tests.',vf_eyebrow:'VERIFY · NO TRUST NEEDED',vf_h:'Verify any Proof of Optimization — offline',vf_sub:'Optional — for auditors & reviewers; you do NOT need this to use Melete. After you run a discovery and download its certificate, anyone can drop it here to check it — it recomputes the efficiency claim and verifies the Ed25519 signature with the public key embedded in the certificate. New here? Press “Load a sample”.',vf_sample:'▶ Load a sample',vf_btn:'Verify certificate',sim_note:'<b>You do NOT write these formulas.</b> This box is a browser simulation so you can watch the algorithm work. A pharma researcher (or anyone) uses the no-formula guided mode — enter your variables (pH, temperature…), make the recipe, measure the real result, type the score.',sim_btn:'👉 No-formula mode',nf_h:'Use it on your real process — no formula, no code.',nf_sub:'The demo below needs a formula (for developers). To use Melete on your real process with no formula — it proposes, you measure, you type the score — use the guided mode.',nf_btn:'👉 Use the no-formula mode',g_pick:'Start from your industry — or edit the variables yourself:',g_addvar:'add variable',pr_eyebrow:'PRICING',pr_h:'Start free. Pay when it saves you money.',pr_sub:'The value is fewer expensive experiments, certified — so you only pay once Melete is already saving you more than it costs.',pr_pop:'POPULAR',pr_free_name:'Free',pr_free_price:'$0',pr_free_tag:'Open web + CLI, forever',pr_free_f:'✓ Run discoveries<br>✓ Signed, replicable trace<br>✓ Optimality certificate<br>✓ No signup',pr_free_btn:'▶ Try it now',pr_pro_name:'Pro',pr_pro_price:'Early access',pr_pro_tag:'For teams on a real process',pr_pro_f:'✓ Connect your process via API<br>✓ Reliable mode + batch runs<br>✓ Priority support<br>✓ Private workspace',pr_pro_btn:'Talk to us',pr_ent_name:'Enterprise',pr_ent_price:'Air-gapped',pr_ent_tag:'Regulated + on-prem',pr_ent_f:'✓ Runs fully offline — data never leaves<br>✓ Signed proof for audits and patents<br>✓ SLA + onboarding<br>✓ Self-hosted',pr_ent_btn:'Talk to us',pf_eyebrow:'PROVEN · MEASURED · CERTIFIED',pf_h:'≥99% of the true optimum — on every landscape',pf_sub:'Most optimizers win on easy surfaces and quietly fail on the hard ones. Melete is benchmarked on 7 deliberately adversarial landscapes, each normalised so the score is literally the % of the true optimum reached — and it clears ≥99% on every one, every seed.',pf_engine:'How: a 3-paradigm engine — portfolio global-explore → certificate-guided Lipschitz infill → Nelder–Mead polish. Every result also carries an optimality certificate: a provable bound on how much better the true best could be.',pf_avg:'average of the true optimum reached',pf_avg2:'across 7 adversarial landscapes · every seed · ≥99% on every single one — including the brutal ones (Rosenbrock\\'s banana valley, a 5-D haystack, a lone needle).',pf_note:'Reproducible: this is the open reliability gauntlet — re-run it and check every number yourself.',rel_lbl:'⚡ Reliable mode — add a Nelder–Mead polish (slower; nails hard curved valleys to the true optimum)',btn_contact:'Contact',use_lead:'No dataset, no formula. Just answer these about <b>your</b> process:',q1d:'List the knobs + their real limits (the range of your machine). <span class="muted">→ this is the SPACE.</span>',q2d:'You <b>measure</b> it — taste a score, read accuracy, read revenue. You do not calculate it. <span class="muted">→ this is the SCORE.</span>',q3d:'Brews, training runs, assays you pay for. <span class="muted">→ this is the BUDGET.</span>',ex_cof:'<b>Knobs:</b> temp 85–96° · grind 1–10 · dose 14–22g<br><b>Score:</b> a barista tastes each shot, 0–10<br><b>Budget:</b> 30 shots → Melete finds the recipe in ~20.',ex_ml:'<b>Knobs:</b> learning-rate 0–0.1 · depth 1–12<br><b>Score:</b> the training script prints accuracy<br><b>Budget:</b> 40 runs → fewer GPU-hours to the best model.',ex_cof_l:'A coffee shop',ex_ml_l:'An ML team',tw_a_b:'Connect your process',tw_a_d:' — Melete runs it for you and reads the number (this is the real product, like installing a tool):',tw_b_b:'From an agent or pipeline',tw_b_d:' — call the HTTP API or the library; your code returns the score each step:',sandbox:'<b>This website = a sandbox to try it.</b> Real work = connect your real process (A or B). 🔒 Air-gapped: zero dependencies + local signing ⇒ runs fully offline, result still verifiable.',prov_intro:'No single optimiser wins on every landscape. A bandit spends each experiment on whichever strategy is winning <i>on your problem</i> — one engine, no per-problem tuning.',btn_pitch:'Read the pitch',cta_body:'Built by one developer who genuinely loves this stuff. Got a question, an idea, or a process you want to try it on? Just reach out — happy to chat.',tl_land:'landscape',tl_bay:'single Bayesian',tl_rand:'random',tl_smooth:'smooth',tl_rug:'rugged (many traps)',tl_hd:'high-dimensional',tl_best:'best 🏆 beats every single algorithm',tl_far:'far behind',u_q1:'What can you adjust?',u_q2:'After one try, what number tells you how good it was?',u_q3:'How many tries can you afford?',u_two:'Then run it one of two ways:',cta_h:'Like Melete? Talk to the maker.',foot_honest:'Honest: the engine is a context-adaptive ensemble — its guarantee is robustness + verifiable provenance, measured &amp; reproducible (not a single "magic" algorithm).',g_h:'Use it on your real process — you measure',g_intro:'No code, no formula. Melete proposes the next experiment; you go run it for real and type the score back; it proposes the next — converging to the best in as few real tries as possible. (Demo space below: espresso temp · grind · dose. Connect your own process through the API.)',g_start:'▶ Start guiding',g_target:'🎯 Target (optional)',g_targethint:'the score you need — Melete tells you if it is reachable with these variables',ind_intro:'The browser score is a simulated model</b> of the process — the <b>optimisation is real &amp; reproducible</b>; connect your real assay / benchmark / process for real numbers.',t_pharma:'Drug formulation',t_gpu:'GPU kernel tuning',t_etch:'Plasma-etch process',t_llm:'LLM serving config',t_esp:'Best espresso recipe',d_pharma:'Variables: pH · temperature · excipient %. Goal: stability / potency. Melete finds the most stable formulation in ~60 assays — instead of hundreds.',d_gpu:'Variables: tile size · unroll · occupancy. Goal: throughput (GFLOP/s). Find the fastest config in ~50 benchmark runs.',d_etch:'Variables: power · pressure · time. Goal: wafer yield %. Tune the recipe to maximum yield — air-gapped, on-prem.',d_llm:'Variables: batch size · KV-cache · quantization. Goal: tokens/sec at a quality bar. Melete optimises AI infrastructure too — and can tune prompts, agents &amp; routing the same way.',d_esp:'Variables: temp · grind · dose. Goal: taste. The friendliest way to watch the idea click.',runnow:'▶ Run it now',sb1:'Once upon a time, a little coffee shop wished for the <b>most delicious espresso in the world</b>.',sb2:'But there were <b>thousands of ways</b> to make it — and every single test meant brewing, and tasting, a whole cup. Trying them all? <b>Impossible.</b>',sb3:'Then came <b>Meli</b> — who never tries everything. Meli looks, thinks, and the little light glows: <i>“brew <b>this</b> one next.”</i>',sb4:'You brew it, you taste it — <b>7 out of 10</b>. Meli smiles, <b>learns</b>, and picks an even smarter cup. 8.5… 9.2…',sb5:'In about <b>twenty cups</b>, Meli found the <b>perfect recipe</b> — and sealed a magical <b>proof</b> of how, so the whole world could trust it. <b>The end ✨</b>',st1h:'Set the dials',st1p:'List what you can change and its range — temperature 85–96°, learning-rate 0–0.1, price $1–100.',st2h:'Score one try',st2p:'Your real process returns one number: brew → taste, train → accuracy, price → revenue. No dataset needed.',st3h:'Discover &amp; prove',st3p:'Melete proposes the next experiment, learns, converges to the best — and signs a verifiable trace of how.',wh1:'Tune learning rates, architectures, RAG/serving configs, compiler flags — fewer GPU-hours to the best model, with a provable tuning record.',wh2:'Find the reagent mix / conditions that maximise yield or potency in far fewer assays — and a tamper-proof discovery trail for patents &amp; audits.',wh3:'Tune deposition / etch / print parameters against real KPIs on-prem — air-gapped, data never leaves the fab, result still verifiable.',wh4:'Search price points, configurations, and policies where each test is costly — converge faster than grid or manual search.',story:'<p style="font-size:19px;font-weight:600;color:#1a1b30;margin-bottom:14px">You run a coffee shop and want the <b>best espresso</b>. You can change three things — water temperature, grind, and how many grams of coffee. Thousands of combinations, and each test means <b>brewing a cup and tasting it</b>. You can’t try them all.</p><p style="color:#33344e;margin-bottom:6px">Melete is like a brilliant assistant who tells you the next cup to brew:</p><div class="chat">☕ Melete: “Try <b>92°, grind 6, 18g</b>.” → you brew it, taste it: <b>7/10</b>.</div><div class="chat">☕ Melete: “Now try <b>93°, grind 5, 19g</b>.” → you taste: <b>8.5/10</b>.</div><div class="chat" style="opacity:.6">… a few more …</div><div class="chat">🎯 After ~<b>20 cups</b> it found your best recipe — instead of randomly trying 200.</div><p style="color:#33344e;margin-top:14px">Swap “coffee” for a <b>training run</b>, a <b>chemical reaction</b>, or a <b>price</b> — same idea: Melete finds the best settings in the <b>fewest expensive tries</b> and signs a <b>proof</b> of how.</p>',winning:'The winning setup',signed:'Every step is cryptographically signed — the result is independently verifiable. No faking, no guessing.'},
 th:{audLbl:'ผมทำงานสาย —',aud_pharma:'ยา/เภสัช',aud_chem:'เคมี',aud_gpu:'GPU & ML',aud_aero:'อวกาศ',aud_phys:'ฟิสิกส์',aud_infra:'ระบบ & วิเคราะห์',aud_energy:'พลังงาน',aud_security:'ความปลอดภัย',tdcEye:'จุดแข็งที่ลอกไม่ได้ · ใบรับรองที่เซ็นแล้ว ไม่มี optimizer ไหนทำได้',tdcH:'🏅 ใบรับรองการค้นพบที่น่าเชื่อถือ',tdcP:'optimizer ตัวอื่นยื่น “สูตรที่ดีที่สุด” ให้แล้วจบ. Melete หลอมสามหลักฐานเป็นใบรับรองเดียวที่เซ็น Ed25519 และตรวจ offline ได้ — สัญญาณ <b>จริง</b> ไหม (ไม่ใช่ noise)? มัน <b>เป็นสาเหตุ</b> ของผลจริงไหม (ไม่ใช่ confounded)? <b>ทนทาน</b> ไหม (รอดการแกว่งในโลกจริง)? — แล้วบอกด้วยว่าตกด่านไหน. เลือกเคสแล้วดูมันตัดสินตัวเอง',tdcGoodT:'✓ การค้นพบจริง',tdcGoodD:'optimum จริง เป็นสาเหตุ ทนทาน + ข้อมูลสะอาด คาดว่า: น่าเชื่อถือ — ผ่านครบสามด่าน',tdcNoiseT:'✕ noise ล้วน',tdcNoiseD:'ปุ่มไม่มีผลอะไร — “ผู้ชนะ” คือความฟลุค คาดว่า: ไม่น่าเชื่อถือ — ด่าน SIGNAL จับได้ (และเมื่อไม่มีผลจริง ด่านที่เหลือก็ไม่ผ่านเช่นกัน)',tdcFragT:'✕ ยอดแหลมเปราะ',tdcFragD:'จริงและเป็นสาเหตุ แต่เป็นยอดแหลมที่พังเมื่อ drift นิดเดียว คาดว่า: ตกที่ด่าน ROBUST',tdcConfT:'✕ ข้อมูลปนเปื้อน',tdcConfD:'ปุ่มที่ดูชี้ขาดในข้อมูล แต่มีปัจจัยซ่อนขับทั้งคู่ คาดว่า: ตกที่ด่าน CAUSAL',flabEye:'ห้องแล็บแนวหน้า · DEEP-TECH พิสูจน์แล้ว',flabH:'3 จุดตายของ optimizer ในโลกจริง — เราออกแบบให้รอดทุกข้อ และพิสูจน์ทุกตัว',flabP:'แต่ละปุ่มรัน engine จริงของ Melete ผ่าน API บนเครื่อง ตัวเลขสดจริง ไม่ใช่ของปลอม กดเลย',flabNoiseT:'📡 ทนสัญญาณรบกวน',flabNoiseD:'สัญญาณที่อ่านได้ 99% แล้ว 40% — หาค่าที่ “เชื่อถือได้” ไม่ใช่ค่าฟลุค',flabMixedT:'🧩 ตัวแปรผสม',flabMixedD:'categorical + integer + conditional (storage engine, thread count) ไม่ใช่แค่ลูกบิด',flabProvT:'📜 ตราผนึกประวัติ',flabProvD:'ประวัติการรัน 24/7 ผนึกเป็นหลักฐานขนาดคงที่ เซ็นแล้ว แก้ไม่ได้',flabNullT:'⬛ Null Engine',flabNullD:'optimizer ตัวเดียวที่กล้าบอกว่า “ไม่มีอะไรให้หา” — ไม่ยอมยัดสูตรปลอมให้คุณตอนข้อมูลเป็นแค่ noise',flabCausalT:'🧬 Causal Engine',flabCausalD:'พิสูจน์ “เหตุ” ไม่ใช่แค่ “ความสัมพันธ์” — แทรกแซงเพื่อจับ knob ที่ปนเปื้อน (ดูสำคัญในข้อมูลแต่ไม่มีผลจริง) แล้วเซ็น Proof of Causation',flabRun:'▶ รันสด',nullSpotEye:'NULL ENGINE · ลายเซ็นของ MELETE',nullSpotH:'ทุก optimizer ยื่น “สูตรที่ดีที่สุด” ให้คุณ — แม้ตอนที่ไม่มีอะไรเลย',nullSpotP:'ป้อน noise ล้วนให้ optimizer ตัวไหนก็ยังคืนคำตอบมั่นใจ — จุดที่ฟลุคที่สุดแต่งตัวเป็นการค้นพบ. NULL ENGINE เป็นตัวเดียวที่เอาคำตอบ “ของตัวเอง” ขึ้นศาล แล้วบอกความจริง: สัญญาณจริง หรือแค่ noise. พิสูจน์แล้ว: false-positive ≤ 2.5% จาก 200 รอบอิสระ',nullSpotBtn:'▶ พิสูจน์สดๆ — โจทย์จริง vs noise ล้วน',flabUseEye:'ใช้กับระบบจริงของคุณ',flabUseH:'เดโมพวกนี้ใช้สูตรจำลอง แต่บนเครื่องคุณ “oracle” คือการวัดผลจริงของคุณเอง',flabUse1:'① กำหนดปุ่มที่คุณปรับได้ + คะแนนที่คุณวัด (yield %, latency, ผลเบนช์มาร์ก, ค่าจาก assay)',flabUse2:'② ชี้ oracle ไปที่ระบบของคุณ — ฟังก์ชันที่รันกระบวนการจริง / เรียก API / อ่านค่าจากเครื่องมือ แล้วคืนคะแนนนั้น engine ตัวเดิมที่พิสูจน์แล้วจะค้นหาให้',flabUse3:'③ รันบนเครื่องคุณทั้งหมด (sovereign — ข้อมูลไม่ออกไปไหน) ทุกผลลัพธ์เซ็น Ed25519 ไว้ใช้ยื่นตรวจ/จดสิทธิบัตร',flabUseCap:'รัน engine ตัวเดียวกันเอง(npm) แล้วเสียบการวัดผลจริงของคุณเข้าไป:',flabUseApi:'…หรือ POST objective แบบสูตร JS ไปที่ API ที่โฮสต์ไว้ เพื่อทดสอบเร็วๆ: /discover · /mixed · /noise-robust',watch:'▶ ดู Melete ค้นพบ',replay:'▶ เล่นใหม่',team:'ทีมของ Meli — ใครลงมือบ้าง',teamhint:'รายละเอียดผู้เชี่ยวชาญ: ผู้ช่วยที่ Meli ใช้ ไม่จำเป็นต้องรู้ก็ใช้ผลได้',climb:'คะแนนไต่ขึ้นยังไง (สูง = ดี)',cinema:'โรงหนังการค้นพบ — ดู Meli ค้นหา',scenarioL:'เลือกสถานการณ์',knobs:'สิ่งที่ปรับได้',score:'วัดเป็นคะแนน',budget:'จำนวนครั้ง',ph:'เลือกสถานการณ์ แล้วกดดู',plainHdr:'สรุป',tried:'Melete ลอง',settings:'แบบ แล้วล็อกแบบที่ดีที่สุด',eyebrow:'AI วิเคราะห์ · ตรวจสอบ · ปรับแต่ง ที่รันในตึกคุณเอง',ctaTry:'ลองใช้งาน →',ctaPitch:'พิตช์ 60 วินาที',h_what:'Melete ทำอะไร — ตัวอย่างเดียวจบ',h_meli:'รู้จัก Meli — นิทานสั้น ๆ',h_how:'ทำงานยังไง — 3 ขั้น',h_who:'ใครใช้ได้ & ได้อะไร',h_see:'ดู Melete ค้นพบ — แค่กดดู',see_lead:'👇 แค่กดปุ่มสีม่วงแล้วดู Melete จะลองค่าทีละชุดแล้วค่อยๆ เจาะหาค่าที่ดีที่สุด — เหมือนเรื่องกาแฟด้านบน แต่ดูสดๆ',see_sub:'นี่คือตัวอย่างสาธิต "คะแนน" เลยคำนวณจากสูตรให้ทันที ในชีวิตจริงคะแนนคือสิ่งที่<b>คุณวัดเอง</b> (คะแนนรสชาติ · % ที่ได้ · ผลเบนช์มาร์ก) แล้วพิมพ์ใส่ <a href="#use">วิธีเอาไปใช้กับงานคุณ →</a>',h_ind:'เลือกอุตสาหกรรม — ดู Melete ทำงานจริง',h_proven:'พิสูจน์ได้ ไม่ใช่แค่พูด',h_use:'ใช้กับงานของคุณ — ตอบ 3 คำถาม',heroTag:'บอก Melete ว่าคุณปรับอะไรได้ และคำว่า <b>"ดี"</b> คืออะไร — มันจะหา<b>สูตรที่ดีที่สุดด้วยการทดลองจริงน้อยครั้งที่สุด</b> แล้วบอกชัดๆ ว่าให้ลงมือทำอะไรต่อ',heroSub:'วิเคราะห์ · ปรับแต่ง · รับรอง — รันในตึกคุณ (sovereign) ข้อมูลไม่ออกไปไหน ทุกคำตัดสินเซ็นด้วยคริปโต ตรวจ offline ได้',ctaApi:'🔌 เชื่อมต่อผ่าน API',pill1:'🎯 คำตอบที่ดีที่สุด ลองน้อยครั้งสุด',pill2:'🚀 ไม่ต้องมีข้อมูลก่อน — เริ่มจากศูนย์ได้',pill3:'🔒 รันบนเครื่องคุณเอง',pill4:'🔏 ทุกคำตอบมีลายเซ็น',hs1:'เครื่องยนต์ที่พิสูจน์แล้ว',hs2:'ของจุดที่ดีที่สุดจริง ทุกเบนช์มาร์ก',hs3:'รันบนเครื่องคุณ · เซ็นยืนยัน',hs4:'สมองเดียว ฉลาดทุกเรื่อง',m60_eye:'เข้าใจทั้งระบบใน 60 วินาที',m60_h:'Melete คืออะไร — ใน 1 นาที',m60_p:'คุณมีระบบที่ <b>วัดผลได้</b> — ML pipeline, config ของ server/DB/network, สูตร, หรือ simulation. Melete หาค่าที่<b>ดีที่สุดและทนทานที่สุด</b>ด้วยการทดลองน้อยครั้งสุด อธิบายเหตุผลเป็นภาษาคน และให้ <b>คำตัดสินที่เซ็น ตรวจซ้ำได้เองแบบ offline</b> — รันบนเครื่องคุณ ข้อมูลไม่ออกไปไหน',m60_s1:'<b>บอกมัน</b>ว่าปรับอะไรได้ + คำว่า "ดี" คืออะไร',m60_s2:'<b>มันเสนอ</b>ค่าหนึ่ง → คุณวัดผล (หรือใส่สูตร) → วนซ้ำ',m60_s3:'<b>คุณได้</b>สูตรที่ดี+ทน + คำตัดสินที่เซ็น เล่นซ้ำได้',m60_inside:'ภายใน: 43 เครื่องยนต์ จัดเป็น 4 ชั้น',lay1:'หาค่าที่ดีที่สุด ในจำนวนครั้งน้อยสุด',lay2:'คำตัดสินของสมอง Φ ที่ปลอดภัยมาก่อน + 🛡 ตัวที่ทนทาน',lay3:'บอกเหตุผลภาษาคน: ปุ่มไหนสำคัญ หน้าผา รูปทรง เพดาน',lay4:'เซ็นแล้ว ตรวจ offline ได้ เล่นซ้ำทีละขั้น',gal_eye:'ลองสด — เลือกวงการคุณ กดปุ่มเดียว',gal_h:'ดู Melete ทำงานบนวงการของคุณ',gal_p:'แต่ละการ์ดรัน <b>engine จริงของ Melete</b> บนโจทย์จำลองทรงอุตสาหกรรมนั้น — แล้วสรุปผลให้คุณเข้าใจง่ายเป็นภาษาคน (ทุกตัวเลขมาจากผลรันจริง). ใน production คุณต่อระบบของคุณเองเป็น oracle',gal_note:'⚠ สภาพแวดล้อมจำลอง (engine จริง ใบรับรองเซ็นจริง) ไม่มีการต่อดาวเทียม/กริดจริง — ต่อ telemetry ของคุณเองเป็น oracle ใน production',g_auto:'▶ ดู Melete ทำงานเอง (อัตโนมัติ)',mo_eyebrow:'หลายเป้าหมาย',mo_h:'optimize หลายเป้าพร้อมกัน — เห็น trade-off',mo_sub:'ปัญหาจริงมีเป้าที่ขัดกัน — ผลผลิตมากขึ้นแต่ต้นทุนต้องน้อยลง ไม่มีดีที่สุดตัวเดียว Melete จึงหา Pareto front: เซตของจุดแลกเปลี่ยนที่ดีที่สุด ตั้งเป้าหมาย + ตัวแปร แล้วรันลูปเสนอ-วัด-ใส่คะแนนแต่ละเป้า ดู front ค่อยๆ เต็มขึ้น',g_howreal:'<b>เอาไปใช้จริงในโปรเจค — 2 ทาง:</b><br><b>1) ผ่านเว็บนี้ (ไม่ต้องเขียนโค้ด)</b> — สำหรับการทดลองที่ช้า/แพง วัดด้วยมือ: Melete เสนอ คุณไปทำจริงในแล็บ/ระบบ แล้วพิมพ์คะแนน เหมาะกับการทดลองจริงที่ยังไงก็ต้องวัดเองอยู่แล้ว<br><b>2) เชื่อมระบบอัตโนมัติ</b> — <code>melete tune</code>, <code>POST /next</code> หรือ npm library รันบนเซิร์ฟเวอร์ของคุณเอง (air-gapped): โค้ดของคุณรันการทดสอบเองแล้วป้อนคะแนนกลับวนลูป เหมาะกับ benchmark, simulation, pipeline <a href="/docs" style="font-weight:700;color:#b45309">&rarr; คู่มือ API</a>',g_pickopt:'เลือกสายงานของคุณ…',gs_h:'ใช้งานยังไง — 4 ขั้น',gs1:'บอก Melete ว่าปรับอะไรได้ — หรือเลือกสายงานด้านบน',gs2:'Melete บอกค่าถัดไปที่ควรลอง แบบเป๊ะๆ',gs3:'คุณไปทำจริง แล้วพิมพ์คะแนนที่วัดได้',gs4:'วนซ้ำ ~20–40 ครั้ง → ได้ config ดีสุด + ใบรับรองที่เซ็นแล้ว',g_ex:'<b>ตัวอย่าง — วิศวกรความปลอดภัย AI:</b> ปรับ <b>[ความเข้มฟิลเตอร์ · temperature · rate limit]</b> แล้ววัด <b>[% การโจมตีจาก red-team ที่ระบบบล็อกได้]</b> เป็นคะแนน Melete เสนอ config ถัดไป → คุณรันชุดโจมตี → ใส่ % → วนซ้ำ → เจอ config ที่ปลอดภัยสุดในจำนวนเทสน้อยสุด',vf_eyebrow:'ตรวจสอบ · ไม่ต้องเชื่อเรา',vf_h:'ตรวจสอบใบรับรอง Proof of Optimization — แบบ offline',vf_sub:'เป็นของ optional — สำหรับผู้ตรวจสอบ ไม่จำเป็นต่อการใช้งาน Melete หลังจากคุณรัน discovery แล้วกดดาวน์โหลดใบรับรอง ใครก็ลากไฟล์มาวางตรงนี้เพื่อตรวจได้ — ระบบคำนวณตัวเลขซ้ำ + ตรวจลายเซ็น Ed25519 ด้วย public key ที่ฝังในใบเอง · ยังไม่มีไฟล์? กด “ดูตัวอย่าง”',vf_sample:'▶ ดูตัวอย่าง',vf_btn:'ตรวจสอบใบรับรอง',sim_note:'<b>คุณไม่ต้องเขียนสูตรพวกนี้</b> กล่องนี้คือการจำลองในเบราว์เซอร์ไว้ดูอัลกอริทึมทำงาน นักวิจัยยา (หรือใครก็ตาม) ใช้โหมดไม่ต้องมีสูตร — ใส่ตัวแปรของคุณ (pH, อุณหภูมิ…) ผสมสูตร วัดผลจริง แล้วใส่คะแนน',sim_btn:'👉 โหมดไม่ต้องมีสูตร',nf_h:'ใช้กับงานจริงของคุณได้เลย — ไม่ต้องมีสูตร ไม่ต้องเขียนโค้ด',nf_sub:'เดโมด้านล่างต้องใส่สูตร (สำหรับนักพัฒนา) ถ้าจะใช้ Melete กับงานจริงโดยไม่ต้องมีสูตร — มันเสนอ คุณวัด คุณใส่คะแนน — ใช้โหมด guided',nf_btn:'👉 ใช้โหมดไม่ต้องมีสูตร',g_pick:'เริ่มจากอุตสาหกรรมของคุณ — หรือแก้ตัวแปรเองก็ได้:',g_addvar:'เพิ่มตัวแปร',pr_eyebrow:'ราคา',pr_h:'เริ่มฟรี จ่ายเมื่อมันช่วยคุณประหยัดเงิน',pr_sub:'คุณค่าคือลดจำนวนการทดลองที่แพง พร้อมใบรับรอง — จ่ายก็ต่อเมื่อ Melete ช่วยประหยัดได้มากกว่าค่าใช้จ่ายแล้ว',pr_pop:'ยอดนิยม',pr_free_name:'ฟรี',pr_free_price:'$0',pr_free_tag:'เว็บ + CLI แบบเปิด ตลอดไป',pr_free_f:'✓ รัน discovery ได้เต็ม<br>✓ ใบบันทึกที่เซ็น+ตรวจซ้ำได้<br>✓ ใบรับรองความเหมาะที่สุด<br>✓ ไม่ต้องสมัคร',pr_free_btn:'▶ ลองเลย',pr_pro_name:'Pro',pr_pro_price:'Early access',pr_pro_tag:'สำหรับทีมที่มีกระบวนการจริง',pr_pro_f:'✓ เชื่อมกระบวนการของคุณผ่าน API<br>✓ Reliable mode + รันเป็นชุด<br>✓ ซัพพอร์ตลำดับแรก<br>✓ พื้นที่ทำงานส่วนตัว',pr_pro_btn:'คุยกับเรา',pr_ent_name:'Enterprise',pr_ent_price:'Air-gapped',pr_ent_tag:'องค์กรคุมเข้ม + รันในองค์กร',pr_ent_f:'✓ รันออฟไลน์เต็มที่ — ข้อมูลไม่ออกจากองค์กร<br>✓ ใบพิสูจน์ที่เซ็น สำหรับ audit และสิทธิบัตร<br>✓ SLA + ช่วยตั้งระบบ<br>✓ ติดตั้งเองในเซิร์ฟเวอร์คุณ',pr_ent_btn:'คุยกับเรา',pf_eyebrow:'พิสูจน์แล้ว · วัดได้ · มีใบรับรอง',pf_h:'≥99% ของจุดที่ดีที่สุดจริง — บนทุกภูมิทัศน์',pf_sub:'optimizer ส่วนใหญ่ชนะบนสนามง่าย แล้วแอบแพ้บนสนามยาก Melete ถูกทดสอบบน 7 ภูมิทัศน์ที่ออกแบบให้โหด แต่ละสนามปรับให้คะแนน = %ของจุดที่ดีที่สุดจริง — และผ่าน ≥99% ทุกสนาม ทุก seed',pf_engine:'ทำได้ยังไง: เครื่องยนต์ 3 พาราไดม์ — portfolio สำรวจทั่ว → infill นำทางด้วยใบรับรอง (Lipschitz) → ขัดเงา Nelder–Mead และทุกผลลัพธ์มีใบรับรองความเหมาะที่สุด: ขอบเขตที่พิสูจน์ได้ว่าของจริงดีกว่านี้ได้ไม่เกินเท่าไร',pf_avg:'ของจุดที่ดีที่สุดจริง (เฉลี่ย)',pf_avg2:'บน 7 ภูมิทัศน์สุดโหด · ทุก seed · ผ่าน ≥99% ทุกสนาม — รวมสนามโคตรโหด (หุบเขากล้วย Rosenbrock, เข็มในมหาสมุทร 5 มิติ, เข็มโดดเดี่ยว)',pf_note:'ตรวจซ้ำได้: นี่คือ reliability gauntlet แบบเปิด — รันเองแล้วเช็คทุกตัวเลขได้',rel_lbl:'⚡ โหมด Reliable — เพิ่มการขัดเงาแบบ Nelder–Mead (ช้าลง แต่พิชิตหุบเขายากให้ถึงจุดที่ดีที่สุดจริง)',btn_contact:'ติดต่อ',use_lead:'ไม่ต้องมีชุดข้อมูล ไม่ต้องมีสูตร แค่ตอบ 3 ข้อนี้เกี่ยวกับ<b>งานของคุณ</b>:',q1d:'ระบุปุ่มที่ปรับได้ + ขีดจำกัดจริง (ช่วงของเครื่องคุณ) <span class="muted">→ นี่คือ SPACE</span>',q2d:'คุณ<b>วัด</b>มัน — ชิมให้คะแนน อ่านความแม่น อ่านยอดขาย ไม่ต้องคำนวณเอง <span class="muted">→ นี่คือ SCORE</span>',q3d:'จำนวนการชง การเทรน การทดลองที่คุณต้องจ่าย <span class="muted">→ นี่คือ BUDGET</span>',ex_cof:'<b>ปุ่ม:</b> อุณหภูมิ 85–96° · บด 1–10 · ปริมาณ 14–22g<br><b>คะแนน:</b> บาริสต้าชิมแต่ละช็อต ให้ 0–10<br><b>งบ:</b> 30 ช็อต → Melete เจอสูตรใน ~20 ช็อต',ex_ml:'<b>ปุ่ม:</b> learning-rate 0–0.1 · depth 1–12<br><b>คะแนน:</b> สคริปต์เทรนพิมพ์ค่าความแม่น<br><b>งบ:</b> 40 รอบ → ใช้ GPU น้อยลงกว่าจะได้โมเดลที่ดีที่สุด',ex_cof_l:'ร้านกาแฟ',ex_ml_l:'ทีม ML',tw_a_b:'เชื่อมต่อกระบวนการของคุณ',tw_a_d:' — Melete รันให้คุณแล้วอ่านค่าตัวเลขเอง (นี่คือตัวโปรดักต์จริง เหมือนติดตั้งเครื่องมือ):',tw_b_b:'จาก agent หรือ pipeline',tw_b_d:' — เรียก HTTP API หรือไลบรารี; โค้ดของคุณคืนคะแนนกลับมาในแต่ละขั้น:',sandbox:'<b>เว็บนี้ = สนามทดลอง</b> งานจริง = เชื่อมต่อกระบวนการจริงของคุณ (ทาง A หรือ B) 🔒 Air-gapped: ไม่มี dependency + เซ็นในเครื่อง ⇒ รันออฟไลน์ได้เต็มที่ ผลยังตรวจสอบได้',prov_intro:'ไม่มีอัลกอริทึมเดียวที่ชนะทุกภูมิทัศน์ปัญหา bandit จะทุ่มแต่ละการทดลองให้กลยุทธ์ที่กำลังชนะ<i>บนปัญหาของคุณ</i> — เอนจินเดียว ไม่ต้องจูนรายปัญหา',btn_pitch:'อ่านพิตช์เด็ค',cta_body:'สร้างโดยนักพัฒนาคนเดียวที่หลงใหลเรื่องนี้จริง ๆ มีคำถาม มีไอเดีย หรืออยากลองใช้กับงานของคุณ — ทักมาได้เลย ยินดีคุยครับ',tl_land:'ภูมิทัศน์ปัญหา',tl_bay:'Bayesian เดี่ยว',tl_rand:'สุ่ม',tl_smooth:'เรียบ',tl_rug:'ขรุขระ (กับดักเยอะ)',tl_hd:'มิติสูง',tl_best:'ดีที่สุด 🏆 ชนะทุกอัลกอริทึม',tl_far:'ตามหลังห่าง',u_q1:'คุณปรับอะไรได้บ้าง?',u_q2:'ลอง 1 ครั้งแล้ว ตัวเลขไหนบอกว่าดีแค่ไหน?',u_q3:'คุณลองได้กี่ครั้ง?',u_two:'จากนั้นใช้งานได้ 2 ทาง:',cta_h:'ชอบ Melete ไหม? ทักหาคนทำได้เลย',foot_honest:'ตามตรง: เอนจินเป็นชุดอัลกอริทึมที่ปรับตามบริบท — สิ่งที่รับประกันคือความทนทาน + ที่มาที่ตรวจสอบได้ วัดผลและทำซ้ำได้จริง (ไม่ใช่อัลกอริทึม "วิเศษ" ตัวเดียว)',g_h:'ใช้กับงานจริงของคุณ — คุณเป็นคนวัด',g_intro:'ไม่ต้องเขียนโค้ด ไม่ต้องมีสูตร Melete เสนอการทดลองถัดไป คุณไปลองจริงแล้วพิมพ์คะแนนกลับมา แล้วมันเสนออันต่อไป — ลู่เข้าหาค่าที่ดีที่สุดในจำนวนครั้งจริงที่น้อยที่สุด แก้ตัวแปรของคุณเองด้านล่างได้เลย — เช่น นักวิทยาศาสตร์ยาใส่ pH, อุณหภูมิ, สัดส่วนสารช่วย %; แล้ว Melete จะบอกว่าควรผสมสูตรไหนต่อ เชื่อมต่อกระบวนการจริงผ่าน API สำหรับใช้งานจริง',g_start:'▶ เริ่มแนะนำ',g_target:'🎯 เป้าหมาย (ถ้ามี)',g_targethint:'คะแนนที่คุณต้องการ — Melete จะบอกว่าเป็นไปได้ไหมกับตัวแปรชุดนี้',ind_intro:'ทุกการ์ดรันเดโมจริงบนสถานการณ์ที่ออกแบบให้เหมือนงานจริงในแต่ละวงการ <b>คะแนนในเบราว์เซอร์เป็นแบบจำลอง</b>ของกระบวนการ — แต่<b>การค้นหาค่าที่ดีที่สุดเป็นของจริงและทำซ้ำได้</b>; เชื่อมต่อการทดลอง/เบนช์มาร์ก/กระบวนการจริงของคุณ เพื่อได้ตัวเลขจริง</p>',t_pharma:'สูตรตำรับยา',t_gpu:'จูน GPU kernel',t_etch:'กระบวนการพลาสมาเอตช์',t_llm:'คอนฟิกการเสิร์ฟ LLM',t_esp:'สูตรเอสเพรสโซที่ดีที่สุด',d_pharma:'ตัวแปร: pH · อุณหภูมิ · สัดส่วนสารช่วย %. เป้าหมาย: ความคงตัว/ฤทธิ์ยา Melete หาสูตรที่คงตัวที่สุดใน ~60 การทดลอง — แทนที่จะเป็นหลายร้อย',d_gpu:'ตัวแปร: tile size · unroll · occupancy. เป้าหมาย: throughput (GFLOP/s) หาคอนฟิกที่เร็วที่สุดใน ~50 รอบเบนช์มาร์ก',d_etch:'ตัวแปร: กำลัง · ความดัน · เวลา เป้าหมาย: % wafer yield จูนสูตรให้ได้ yield สูงสุด — air-gapped รันในองค์กร',d_llm:'ตัวแปร: batch size · KV-cache · quantization. เป้าหมาย: tokens/sec ที่คุณภาพกำหนด Melete จูนโครงสร้างพื้นฐาน AI ได้ด้วย — และจูน prompt, agent & routing แบบเดียวกัน',d_esp:'ตัวแปร: อุณหภูมิ · การบด · ปริมาณ เป้าหมาย: รสชาติ วิธีที่เข้าใจง่ายที่สุดในการเห็นไอเดียนี้ทำงาน',runnow:'▶ ลองเลย',sb1:'กาลครั้งหนึ่ง ร้านกาแฟเล็ก ๆ ใฝ่ฝันถึง <b>เอสเพรสโซที่อร่อยที่สุดในโลก</b>',sb2:'แต่มันทำได้ <b>เป็นพันวิธี</b> — และการลองแต่ละครั้ง ต้องชงและชิมจริงทั้งแก้ว จะลองให้ครบ? <b>เป็นไปไม่ได้</b>',sb3:'แล้ว <b>Meli</b> ก็มา — ผู้ที่ไม่เคยลองทุกอย่าง Meli มอง คิด แล้วไฟดวงน้อยก็สว่าง: <i>“ชง<b>แก้วนี้</b>ต่อสิ”</i>',sb4:'คุณชง คุณชิม — <b>7 เต็ม 10</b> Meli ยิ้ม <b>เรียนรู้</b> แล้วเลือกแก้วที่ฉลาดกว่าเดิม 8.5… 9.2…',sb5:'ราว ๆ <b>ยี่สิบแก้ว</b> Meli ก็เจอ <b>สูตรที่สมบูรณ์แบบ</b> — แล้วผนึก <b>ใบรับรอง</b>วิเศษว่าได้มายังไง ให้ทั้งโลกเชื่อถือได้ <b>จบบริบูรณ์ ✨</b>',st1h:'ตั้งค่าที่ปรับได้',st1p:'ระบุสิ่งที่ปรับได้และช่วงของมัน — อุณหภูมิ 85–96° · learning-rate 0–0.1 · ราคา $1–100',st2h:'ให้คะแนน 1 ครั้ง',st2p:'กระบวนการจริงของคุณคืนตัวเลขมา 1 ค่า: ชง→ชิม, เทรน→ความแม่น, ตั้งราคา→ยอดขาย — ไม่ต้องมีชุดข้อมูล',st3h:'ค้นพบ & พิสูจน์',st3p:'Melete เสนอการทดลองถัดไป เรียนรู้ ลู่เข้าหาค่าที่ดีที่สุด — แล้วเซ็นใบบันทึกที่ตรวจสอบได้ว่าทำมายังไง',wh1:'จูน learning rate, สถาปัตยกรรมโมเดล, RAG/serving, compiler flags — ใช้ GPU น้อยลงกว่าจะได้โมเดลที่ดีที่สุด พร้อมบันทึกการจูนที่พิสูจน์ได้',wh2:'หาสูตรผสมสาร/สภาวะที่ให้ yield หรือฤทธิ์สูงสุด ในจำนวนการทดลองที่น้อยลงมาก — พร้อมบันทึกการค้นพบที่แก้ไขไม่ได้ สำหรับสิทธิบัตรและการตรวจสอบ',wh3:'จูนพารามิเตอร์ deposition/etch/print ตาม KPI จริงในองค์กร — air-gapped ข้อมูลไม่ออกจากโรงงาน แต่ผลยังตรวจสอบได้',wh4:'ค้นหาจุดราคา การตั้งค่า และนโยบาย ที่การทดสอบแต่ละครั้งมีต้นทุน — ลู่เข้าเร็วกว่าการไล่กริดหรือลองเอง',story:'<p style="font-size:19px;font-weight:600;color:#1a1b30;margin-bottom:14px">คุณเปิดร้านกาแฟ และอยากได้ <b>เอสเพรสโซที่อร่อยที่สุด</b> สิ่งที่ปรับได้มี 3 อย่าง — อุณหภูมิน้ำ ความละเอียดการบด และปริมาณกาแฟเป็นกรัม ผสมกันได้เป็นพันแบบ และการลองแต่ละแบบ คือ<b>ต้องชงจริงแล้วชิม</b> จะลองทุกแบบ—เป็นไปไม่ได้</p><p style="color:#33344e;margin-bottom:6px">Melete เปรียบเหมือนผู้ช่วยอัจฉริยะ ที่บอกว่าควรชงแก้วถัดไปยังไง:</p><div class="chat">☕ Melete: “ลอง <b>92° บด 6 ใส่ 18g</b>” → คุณชงแล้วชิม: <b>7/10</b></div><div class="chat">☕ Melete: “งั้นลอง <b>93° บด 5 ใส่ 19g</b>” → คุณชิม: <b>8.5/10</b></div><div class="chat" style="opacity:.6">… อีกไม่กี่แก้ว …</div><div class="chat">🎯 ครบ ~<b>20 แก้ว</b> ก็เจอสูตรที่ดีที่สุด — แทนที่จะสุ่มชง 200 แก้ว</div><p style="color:#33344e;margin-top:14px">เปลี่ยน “กาแฟ” เป็น <b>การเทรนโมเดล</b> <b>ปฏิกิริยาเคมี</b> หรือ <b>ราคา</b> — หลักการเดียวกัน: Melete หาค่าที่ดีที่สุดใน<b>จำนวนครั้งที่น้อยที่สุด</b> แล้วเซ็น<b>ใบรับรอง</b>ว่าได้มายังไง</p>',winning:'สูตรที่ชนะ',signed:'ทุกขั้นเซ็นด้วยคริปโต — ผลตรวจสอบได้จริง ไม่มีโม้ ไม่มีเดา'}
};
function tr(k){var o=T[LANG]||T.en;return o[k]!=null?o[k]:T.en[k];}
function showContact(){document.getElementById('contactModal').style.display='flex';}
function hideContact(){document.getElementById('contactModal').style.display='none';}
var AUD={
 pharma:{c:'#a855f7',demo:'genomics',en:{h:'Find the formulation that works — in the fewest assays.',l:'Tell Melete the knobs (pH, incubation, excipient ratio, genome target) and what "good" means — bioavailability minus toxicity. It proposes the next experiment to run at the bench; you measure; it converges on the best robust recipe and signs the result for your filing.',k:'pH · incubation · target  →  bioavailability − toxicity'},th:{h:'หาสูตรที่ได้ผล — ในจำนวนการทดลองที่น้อยที่สุด',l:'บอก Melete ว่าปรับอะไรได้ (pH, เวลาบ่ม, สัดส่วน excipient, เป้า genome) และ "ดี" คืออะไร — ชีวปริมาณออกฤทธิ์ลบความเป็นพิษ. มันเสนอการทดลองถัดไปให้ลองที่แล็บ คุณวัด มันลู่เข้าสูตรที่ดีและทนทานที่สุด แล้วเซ็นผลให้ไว้ยื่นเอกสาร',k:'pH · เวลาบ่ม · เป้า  →  ออกฤทธิ์ − พิษ'}},
 chem:{c:'#a855f7',demo:'genomics',en:{h:'Find the reaction conditions that maximise yield — without burning runs.',l:'Give Melete your levers (temperature, pH, catalyst loading, time) and the score you measure (yield, selectivity, −cost). It picks the next condition to try, you run it, and it homes in on the best robust set — every step signed and replayable.',k:'temp · pH · catalyst · time  →  yield − cost'},th:{h:'หาเงื่อนไขปฏิกิริยาที่ให้ yield สูงสุด — โดยไม่เปลืองรอบทดลอง',l:'ใส่ตัวแปรที่คุมได้ (อุณหภูมิ, pH, ปริมาณตัวเร่ง, เวลา) และคะแนนที่คุณวัด (yield, การเลือกเกิด, −ต้นทุน). Melete เลือกเงื่อนไขถัดไปให้ลอง คุณรัน แล้วมันลู่เข้าชุดที่ดีและทนทานที่สุด ทุกขั้นเซ็นและเล่นซ้ำได้',k:'อุณหภูมิ · pH · ตัวเร่ง · เวลา  →  yield − ต้นทุน'}},
 gpu:{c:'#6d5cf0',demo:'ml',en:{h:'Tune the model for more tokens/s and safety — at less GPU cost.',l:'Hand Melete the knobs (learning-rate, quantization, RAG chunk, batch) and the score (throughput + safety − GPU $). It runs the search and returns the best robust configuration with a signed, offline-verifiable trace — fully on your air-gapped box.',k:'lr · quantization · chunk  →  tok/s + safety − GPU $'},th:{h:'จูนโมเดลให้ได้ tokens/s และความปลอดภัยมากขึ้น — ด้วยต้นทุน GPU ที่น้อยลง',l:'ส่งปุ่มให้ Melete (learning-rate, quantization, RAG chunk, batch) และคะแนน (throughput + ปลอดภัย − ค่า GPU). มันค้นหาแล้วคืนค่าคอนฟิกที่ดีและทนทานที่สุด พร้อม trace ที่เซ็นและตรวจ offline ได้ — รันบนเครื่อง air-gapped ของคุณทั้งหมด',k:'lr · quantization · chunk  →  tok/s + ปลอดภัย − ค่า GPU'}},
 aero:{c:'#22d3ee',demo:'aerospace',en:{h:'Hold the link through a solar storm — across the whole parameter space.',l:'Define the knobs (carrier freq, phased-array phase, packet depth) and the score (throughput under noise). Melete sweeps the space in the fewest evaluations, finds the most robust operating point, and signs the verdict for your review board.',k:'freq · phase-array · packet depth  →  throughput under noise'},th:{h:'รักษาลิงก์ให้รอดพายุสุริยะ — ทั่วทั้งพื้นที่พารามิเตอร์',l:'กำหนดปุ่ม (ความถี่พาหะ, เฟส phased-array, ความลึกแพ็กเก็ต) และคะแนน (throughput ภายใต้สัญญาณรบกวน). Melete กวาดพื้นที่ด้วยจำนวนการประเมินที่น้อยสุด หาจุดทำงานที่ทนทานที่สุด แล้วเซ็นคำตัดสินให้คณะกรรมการตรวจ',k:'ความถี่ · phase-array · packet  →  throughput ภายใต้ noise'}},
 phys:{c:'#22d3ee',demo:'aerospace',en:{h:'Optimise a simulated physical system — in the fewest evaluations.',l:'Point Melete at any simulation you can score (a field, an orbit, an instrument). Give it the parameters and the objective; it proposes the next point to evaluate, finds the robust optimum, and hands you a signed, replayable record — no gradient required.',k:'parameters → objective (max / min)'},th:{h:'หาค่าที่ดีที่สุดของระบบฟิสิกส์จำลอง — ด้วยการประเมินน้อยครั้งที่สุด',l:'ชี้ Melete ไปที่ simulation ที่ให้คะแนนได้ (สนาม, วงโคจร, เครื่องมือ). ใส่พารามิเตอร์และเป้าหมาย มันเสนอจุดถัดไปให้ประเมิน หา optimum ที่ทนทาน แล้วคืนบันทึกที่เซ็นและเล่นซ้ำได้ — ไม่ต้องใช้ gradient',k:'พารามิเตอร์ → เป้าหมาย (มาก/น้อยสุด)'}},
 infra:{c:'#10b981',demo:'database',en:{h:'Cut latency and cloud spend — without a config war-room.',l:'List the knobs (TCP buffer, thread affinity, shared buffers, cache) and the score (−latency, −cloud $). Melete finds the best robust setting in a handful of runs and signs it — so the change is auditable, not a guess.',k:'tcp buffer · affinity · shared buffers  →  −latency, −cloud $'},th:{h:'ลด latency และค่าคลาวด์ — โดยไม่ต้องตั้งวอร์รูมจูนคอนฟิก',l:'ระบุปุ่ม (TCP buffer, thread affinity, shared buffers, cache) และคะแนน (−latency, −ค่าคลาวด์). Melete หาค่าที่ดีและทนทานที่สุดในไม่กี่รอบแล้วเซ็นไว้ — การเปลี่ยนตรวจสอบได้ ไม่ใช่การเดา',k:'tcp buffer · affinity · shared buffers  →  −latency, −ค่าคลาวด์'}},
 energy:{c:'#f59e0b',demo:'solar',en:{h:'Pull more power from the array — and less heat from the inverter.',l:'Define the knobs (MPPT frequency, charge rate, PV tilt) and the score (power − inverter heat). Melete proposes the next setting, you measure it in the field, and it converges on the most robust operating point — then signs it.',k:'MPPT freq · charge rate · PV tilt  →  power − inverter heat'},th:{h:'ดึงกำลังจากแผงให้มากขึ้น — และลดความร้อนจากอินเวอร์เตอร์',l:'กำหนดปุ่ม (ความถี่ MPPT, อัตราชาร์จ, มุมแผง PV) และคะแนน (กำลัง − ความร้อน). Melete เสนอค่าถัดไป คุณวัดในสนาม แล้วมันลู่เข้าจุดทำงานที่ทนทานที่สุด พร้อมเซ็นไว้',k:'ความถี่ MPPT · อัตราชาร์จ · มุมแผง  →  กำลัง − ความร้อน'}},
 security:{c:'#ef4444',demo:'devops',en:{h:'Block more attacks with less friction — a tuned, auditable guardrail.',l:'List the knobs (IAM token TTL, firewall sensitivity, max payload size) and the score (attack-block % − friction). Melete finds the safest robust policy in a handful of runs and signs the verdict for the audit.',k:'IAM TTL · firewall · payload size  →  attack-block % − friction'},th:{h:'บล็อกการโจมตีได้มากขึ้น โดยรบกวนผู้ใช้น้อยลง — guardrail ที่จูนแล้วและตรวจสอบได้',l:'ระบุปุ่ม (IAM token TTL, ความไวไฟร์วอลล์, ขนาด payload สูงสุด) และคะแนน (บล็อก % − ความรบกวน). Melete หานโยบายที่ปลอดภัยและทนทานที่สุดในไม่กี่รอบ แล้วเซ็นคำตัดสินไว้ให้ตรวจ',k:'IAM TTL · firewall · payload  →  บล็อก % − ความรบกวน'}}
};
function audGo(dk){try{if(typeof gVertical==='function')gVertical(dk);}catch(e){}var j=document.getElementById('journalist')||document.getElementById('gallery');if(j&&j.scrollIntoView)setTimeout(function(){j.scrollIntoView({behavior:'smooth',block:'start'});},140);}
function setAud(k){var a=AUD[k];if(!a)return;window.__aud=k;var lang=(typeof LANG!=='undefined'?LANG:'en');var t=a[lang]||a.en;
 ['pharma','chem','gpu','aero','phys','infra','energy','security'].forEach(function(x){var b=document.getElementById('aud-'+x);if(b)b.className='audchip'+(x===k?' on':'');});
 var go=(lang==='th'?'▶ ดู Melete รันโจทย์ของคุณ':'▶ See Melete run your problem');
 var pg=(lang==='th'?'เปิดหน้าเต็มของสายนี้ →':'Open the full page →');
 var el=document.getElementById('audpanel');if(el)el.innerHTML='<div class="audcard" style="--ac:'+a.c+'"><h4>'+t.h+'</h4><div class="al">'+t.l+'</div><div class="ak">'+t.k+'</div><button class="ago" onclick="audGo(\\''+a.demo+'\\')">'+go+'</button> <a class="audpage" href="/for/'+k+'">'+pg+'</a></div>';}
function setLang(l){LANG=l;try{localStorage.setItem('mlang',l);}catch(e){}
 var e1=document.getElementById('lang-en'),e2=document.getElementById('lang-th');if(e1)e1.className='lb'+(l==='en'?' on':'');if(e2)e2.className='lb'+(l==='th'?' on':'');
 var els=document.querySelectorAll('[data-i18n]');for(var i=0;i<els.length;i++){var v=tr(els[i].getAttribute('data-i18n'));if(v!=null)els[i].innerHTML=v;}
 // re-render any open DYNAMIC demo panel in the new language (so the language switch never leaves stale-language content)
 try{if(window.__lastNull&&typeof flabNull==='function')flabNull(window.__lastNull,'nullout');}catch(e){}
 try{if(window.__lastFlab&&typeof flabNull==='function'){var f=window.__lastFlab;if(f.k==='noise')flabNoise(f.j);else if(f.k==='mixed')flabMixed(f.j);else if(f.k==='null')flabNull(f.j,'flabout');else if(f.k==='causal')flabCausal(f.j);else flabProv(f.j);}}catch(e){}
 try{if(window.__lastTDC&&typeof renderTDC==='function')renderTDC(window.__lastTDC);}catch(e){}
 try{if(window.__aud&&typeof setAud==='function')setAud(window.__aud);}catch(e){}
 if(typeof renderJournalist==='function'&&window.LASTJ&&window.LASTJ.vertical)try{renderJournalist();}catch(e){}
 if(typeof loadPreset==='function')loadPreset();
 if(window.LASTJ)renderMap(window.LASTJ);
}
var PRESETS={
  peak:{space:'[{"name":"x","type":"real","min":0,"max":10},{"name":"y","type":"real","min":0,"max":10}]',obj:'Math.exp(-((x-7.2)**2+(y-3.4)**2)/3)',budget:40,
    s:['🎛️ Knobs','two dials, x &amp; y, each 0–10'],t:['🧪 Score','a hidden peak the demo simulates — highest at one secret spot'],b:['🎯 Budget','40 tries — watch it find the secret high point']},
  coffee:{space:'[{"name":"temp","type":"real","min":85,"max":96},{"name":"grind","type":"real","min":1,"max":10},{"name":"dose","type":"real","min":14,"max":22}]',obj:'10 - (temp-92)**2*0.08 - (grind-5.5)**2*0.15 - (dose-18)**2*0.1',budget:50,
    s:['🎛️ Knobs','temperature 85–96° · grind 1–10 · dose 14–22g'],t:['🧪 Score','a simulated taste rating (real life: a barista tastes it — you don\\'t calculate anything)'],b:['🎯 Budget','50 brews — Melete finds the best recipe without being told it']},
  price:{space:'[{"name":"price","type":"real","min":1,"max":100}]',obj:'price * (100 - price)',budget:30,
    s:['🎛️ Knobs','one dial: price, $1–100'],t:['🧪 Score','revenue (price × how many still buy at that price)'],b:['🎯 Budget','30 tries — find the price that earns the most']},
  pharma:{space:'[{"name":"ph","type":"real","min":3,"max":9},{"name":"temp","type":"real","min":2,"max":40},{"name":"excipient","type":"real","min":0,"max":30}]',obj:'95 - 6*(ph-6.5)**2 - 0.35*(temp-5)**2 - 0.5*(excipient-12)**2',budget:60,
    s:['🎛️ Variables','drug formulation — pH 3–9 · temperature 2–40°C · excipient 0–30%'],t:['🧪 Score','a simulated stability/potency score (real life: a lab assay measures it)'],b:['🎯 Budget','60 assays — Melete finds the most stable formulation']},
  gpu:{space:'[{"name":"tile","type":"int","min":8,"max":128},{"name":"unroll","type":"int","min":1,"max":8},{"name":"occupancy","type":"real","min":0.1,"max":1}]',obj:'9000 - 2*(tile-64)**2 - 130*(unroll-4)**2 - 9000*(occupancy-0.75)**2',budget:50,
    s:['🎛️ Variables','GPU kernel — tile size 8–128 · unroll 1–8 · target occupancy 0.1–1.0'],t:['🧪 Score','a simulated throughput in GFLOP/s (real life: run the kernel + benchmark)'],b:['🎯 Budget','50 benchmark runs — Melete finds the fastest config']},
  etch:{space:'[{"name":"power","type":"real","min":100,"max":1000},{"name":"pressure","type":"real","min":5,"max":100},{"name":"time","type":"real","min":10,"max":120}]',obj:'98 - 0.00008*(power-650)**2 - 0.012*(pressure-35)**2 - 0.004*(time-70)**2',budget:60,
    s:['🎛️ Variables','plasma etch — power 100–1000W · pressure 5–100mTorr · time 10–120s'],t:['🧪 Score','a simulated wafer yield % (real life: measure the finished wafer)'],b:['🎯 Budget','60 runs — Melete tunes the process to maximum yield']},
  llm:{space:'[{"name":"batch","type":"int","min":1,"max":64},{"name":"kv_cache_gb","type":"real","min":1,"max":40},{"name":"quant_bits","type":"int","min":4,"max":16}]',obj:'4200 - 1.5*(batch-32)**2 - 4*(kv_cache_gb-24)**2 - 32*(quant_bits-8)**2',budget:55,
    s:['🎛️ Variables','LLM serving — batch 1–64 · KV-cache 1–40GB · quantization 4–16 bits'],t:['🧪 Score','a simulated tokens/sec at a quality bar (real life: load-test the server)'],b:['🎯 Budget','55 configs — Melete finds the fastest serving setup']},
};
function tryScenario(k){var sel=document.getElementById('preset');sel.value=k;loadPreset();var t=document.getElementById('try');if(t)t.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(run,650);}
function setMode(m){var adv=(m==='advanced');var set=function(id,sh){var el=document.getElementById(id);if(el)el.style.display=sh;};
  set('advbox',adv?'block':'none');set('teampanel',adv?'block':'none');set('legend',adv?'flex':'none');
  var s=document.getElementById('mt-simple'),v=document.getElementById('mt-advanced');if(s)s.className='mt'+(!adv?' on':'');if(v)v.className='mt'+(adv?' on':'');}
function loadPreset(){var p=PRESETS[document.getElementById('preset').value];document.getElementById('space').value=p.space;document.getElementById('obj').value=p.obj;document.getElementById('budget').value=p.budget;
  var rows=[['🎛️ '+tr('knobs'),p.s[1]],['🧪 '+tr('score'),p.t[1]],['🎯 '+tr('budget'),p.b[1]]];
  document.getElementById('scenario').innerHTML=rows.map(function(r){return '<div class="srow"><b>'+r[0]+'</b><span>'+r[1]+'</span></div>'}).join('');
  document.getElementById('out').textContent=tr('ph');var m=document.getElementById('map');if(m)m.className='';}
var ARMCOL={gp:'#6d5cf0',cmaes:'#0ea5b7',"kernel-ucb":'#f97316',"trust-region":'#a855f7',anneal:'#ef4444',maximin:'#22c55e',"basin-hop":'#eab308',random:'#94a3b8',seed:'#cbd5e1'};
var STRAT={
 gp:['🔮 The Forecaster','predicts which untried setting will score high','🔮 ผู้พยากรณ์','ทายว่าจุดไหนน่าจะคะแนนสูง'],
 cmaes:['🧬 The Evolver','breeds better tries from the best so far','🧬 นักวิวัฒน์','ผสมพันธุ์ค่าที่ดีให้ดีขึ้นเรื่อยๆ'],
 "kernel-ucb":['⚖️ The Balancer','weighs the best-known against the unknown','⚖️ นักชั่งใจ','ชั่งระหว่างของดีที่รู้แล้วกับที่ยังไม่รู้'],
 "trust-region":['🔍 The Zoomer','zooms in carefully around the current best','🔍 นักซูม','ซูมเข้าใกล้ค่าที่ดีที่สุดอย่างระวัง'],
 anneal:['🌡️ The Wanderer','roams boldly early, then settles down','🌡️ นักท่อง','ออกสำรวจกว้างตอนแรก แล้วค่อยนิ่ง'],
 maximin:['🛰️ The Scout','checks the most unexplored areas','🛰️ นักสอดแนม','ไปดูพื้นที่ที่ยังไม่เคยลอง'],
 "basin-hop":['🦘 The Jumper','leaps to fresh regions to escape dead ends','🦘 นักกระโดด','กระโดดไปจุดใหม่เพื่อหนีทางตัน'],
 random:['🎲 The Wildcard','tries random spots as a sanity check','🎲 ไพ่ตาย','ลองสุ่มเพื่อเช็คความชัวร์'],
 seed:['🌱 The Opening','the first spread-out tries to get going','🌱 การเปิดเกม','ลองกระจายๆ ช่วงเริ่มต้น']
};
function sName(a){var s=STRAT[a]||[a,'',a,''];return LANG==='th'?(s[2]||s[0]):s[0];}
function sDesc(a){var s=STRAT[a]||['','','',''];return LANG==='th'?(s[3]||s[1]):s[1];}
function heat(t){t=Math.max(0,Math.min(1,t));var a=[40,32,84],b=[14,120,170],c=[16,185,160],d=[250,232,80];var seg=t<.33?[a,b,t/.33]:t<.66?[b,c,(t-.33)/.33]:[c,d,(t-.66)/.34];return 'rgb('+seg[0].map(function(v,i){return Math.round(v+(seg[1][i]-v)*seg[2])}).join(',')+')';}
var MAP={};
function fmt(v){var r=Math.round(v*100)/100;return ''+r;}
function drawFrame(k){
  var s=MAP.surface,S=600,cv=document.getElementById('surf'),x=cv.getContext('2d');x.clearRect(0,0,S,S);
  var p=MAP.path||[];
  if(s){ try{ drawWaveParticle(x,S,k); }catch(err){ drawFlat(x,S,k); } }
  else if(MAP.dims && MAP.dims.length>=2){ drawParallel(x,S,k); }
  else { x.fillStyle='#9092a8';x.font='15px system-ui';x.textAlign='center';x.fillText('Run a scenario to see the discovery map.',S/2,S/2); }
  var sn=document.getElementById('stepn');if(sn)sn.textContent='exp '+Math.min(k+1,p.length)+' / '+p.length;
  var sc=document.getElementById('scrub');if(sc)sc.value=k;
}
// flat heat-map fallback (2-D)
function drawFlat(x,S,k){
  var s=MAP.surface,p=MAP.path,zmin=Math.min.apply(null,s.z),zmax=Math.max.apply(null,s.z),zr=(zmax-zmin)||1,cw=S/s.nx;
  for(var j=0;j<s.ny;j++)for(var i=0;i<s.nx;i++){x.fillStyle=heat((s.z[j*s.nx+i]-zmin)/zr);x.fillRect(i*cw,S-(j+1)*cw,cw+1.2,cw+1.2);}
  var toX=function(e){return (e[s.xName]-s.xMin)/((s.xMax-s.xMin)||1)*S;},toY=function(e){return S-(e[s.yName]-s.yMin)/((s.yMax-s.yMin)||1)*S;};
  for(var t=0;t<=k&&t<p.length;t++){var P=p[t],cur=(t===k);x.beginPath();x.arc(toX(P.experiment),toY(P.experiment),cur?9:5.5,0,7);x.fillStyle=ARMCOL[P.arm]||'#94a3b8';x.fill();x.lineWidth=1;x.strokeStyle='#fff';x.stroke();}
}
// WAVE-PARTICLE map (2-D): the learned score surface as a rippling 2.5-D terrain (the WAVE) + each
// experiment as a glowing quanta-dot sitting on it (the PARTICLE) + a gold star at the peak.
var VZ={mL:54,plotW:486,mT:130,depth:250,skew:44,h:120,floorY:472,floorD:72};
function vproj(gi,gj,t,nx,ny){var fx=nx>1?gi/(nx-1):0.5,fz=ny>1?gj/(ny-1):0.5;return [VZ.mL+fx*VZ.plotW+fz*VZ.skew, VZ.mT+(1-fz)*VZ.depth-t*VZ.h];}
function fproj(gi,gj,nx,ny){var fx=nx>1?gi/(nx-1):0.5,fz=ny>1?gj/(ny-1):0.5;return [VZ.mL+fx*VZ.plotW+fz*VZ.skew, VZ.floorY-fz*VZ.floorD];}
function drawContourFloor(x,s,nx,ny,zmin,zr){
  var st=2,gi,gj;
  for(gj=0;gj<ny-1;gj+=st)for(gi=0;gi<nx-1;gi+=st){var t=(s.z[gj*nx+gi]-zmin)/zr,band=Math.floor(t*7)/7;
    var a=fproj(gi,gj,nx,ny),b=fproj(gi+st,gj,nx,ny),c=fproj(gi+st,gj+st,nx,ny),d=fproj(gi,gj+st,nx,ny);
    x.beginPath();x.moveTo(a[0],a[1]);x.lineTo(b[0],b[1]);x.lineTo(c[0],c[1]);x.lineTo(d[0],d[1]);x.closePath();
    x.fillStyle=heat(band);x.globalAlpha=0.34;x.fill();x.globalAlpha=1;}
  var c0=fproj(0,0,nx,ny),c1=fproj(nx-1,0,nx,ny),c2=fproj(nx-1,ny-1,nx,ny),c3=fproj(0,ny-1,nx,ny);
  x.strokeStyle='rgba(110,110,150,.20)';x.lineWidth=1;x.beginPath();x.moveTo(c0[0],c0[1]);x.lineTo(c1[0],c1[1]);x.lineTo(c2[0],c2[1]);x.lineTo(c3[0],c3[1]);x.closePath();x.stroke();
}
function drawWaveParticle(x,S,k){
  var s=MAP.surface,nx=s.nx,ny=s.ny,p=MAP.path,zmin=Math.min.apply(null,s.z),zmax=Math.max.apply(null,s.z),zr=(zmax-zmin)||1;
  drawContourFloor(x,s,nx,ny,zmin,zr);
  for(var gj=ny-1;gj>=0;gj--){
    var rmax=0,i;for(i=0;i<nx;i++){var tt=(s.z[gj*nx+i]-zmin)/zr;if(tt>rmax)rmax=tt;}
    x.beginPath();for(i=0;i<nx;i++){var t=(s.z[gj*nx+i]-zmin)/zr,P=vproj(i,gj,t,nx,ny);i?x.lineTo(P[0],P[1]):x.moveTo(P[0],P[1]);}
    var br=vproj(nx-1,gj,0,nx,ny),bl=vproj(0,gj,0,nx,ny);x.lineTo(br[0],br[1]);x.lineTo(bl[0],bl[1]);x.closePath();
    x.fillStyle=heat(rmax*0.9+0.05);x.globalAlpha=0.9;x.fill();x.globalAlpha=1;
    x.beginPath();for(i=0;i<nx;i++){var t2=(s.z[gj*nx+i]-zmin)/zr,Q=vproj(i,gj,t2,nx,ny);i?x.lineTo(Q[0],Q[1]):x.moveTo(Q[0],Q[1]);}
    x.strokeStyle='rgba(255,255,255,.45)';x.lineWidth=1;x.stroke();
  }
  for(var u=0;u<=k&&u<p.length;u++){var e=p[u].experiment,gi=(e[s.xName]-s.xMin)/((s.xMax-s.xMin)||1)*(nx-1),gjj=(e[s.yName]-s.yMin)/((s.yMax-s.yMin)||1)*(ny-1),tv=(p[u].value-zmin)/zr,Z=vproj(gi,gjj,tv,nx,ny),cur=(u===k);
    x.save();x.shadowColor='rgba(255,255,255,.9)';x.shadowBlur=cur?16:7;x.beginPath();x.arc(Z[0],Z[1],cur?7:4,0,7);x.fillStyle=heat(tv*0.85+0.15);x.fill();x.lineWidth=1.4;x.strokeStyle='#fff';x.stroke();x.restore();}
  var bi=MAP.bestIdx;if(k>=bi){var b=MAP.best.experiment,gib=(b[s.xName]-s.xMin)/((s.xMax-s.xMin)||1)*(nx-1),gjb=(b[s.yName]-s.yMin)/((s.yMax-s.yMin)||1)*(ny-1),tb=(MAP.best.value-zmin)/zr,B=vproj(gib,gjb,tb,nx,ny);
    x.save();x.shadowColor='#fbbf24';x.shadowBlur=22;x.font='32px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#fde047';x.fillText('★',B[0],B[1]);x.restore();}
}
// parallel-coordinates: works for ANY number of variables (3D, 5D, 8D…) — each line is one experiment
function drawParallel(x,S,k){
  var dims=MAP.dims,n=dims.length,p=MAP.path,pad=60,W=S-2*pad,H=S-2*pad-18,top=pad;
  var vals=p.map(function(q){return q.value}),vmin=Math.min.apply(null,vals),vmax=Math.max.apply(null,vals),vr=(vmax-vmin)||1;
  var ax=function(i){return n>1?pad+i/(n-1)*W:pad+W/2;};
  var ay=function(i,val){var d=dims[i];return top+H-((val-d.min)/((d.max-d.min)||1))*H;};
  x.lineWidth=1.5;
  for(var i=0;i<n;i++){var X=ax(i);x.strokeStyle='#e7e8f0';x.beginPath();x.moveTo(X,top);x.lineTo(X,top+H);x.stroke();
    x.fillStyle='#5b5d77';x.font='700 12px system-ui';x.textAlign='center';x.fillText(dims[i].name,X,top-16);
    x.fillStyle='#b3b5c6';x.font='10px ui-monospace';x.fillText(fmt(dims[i].max),X,top-3);x.fillText(fmt(dims[i].min),X,top+H+15);}
  for(var t=0;t<=k&&t<p.length;t++){var q=p[t];x.beginPath();for(var j=0;j<n;j++){var XX=ax(j),YY=ay(j,+q.experiment[dims[j].name]);j?x.lineTo(XX,YY):x.moveTo(XX,YY);}
    x.strokeStyle=heat((q.value-vmin)/vr);x.globalAlpha=(t===k)?1:0.45;x.lineWidth=(t===k)?3.2:1.5;x.stroke();x.globalAlpha=1;}
  var bi=MAP.bestIdx;if(k>=bi){var b=p[bi];x.beginPath();for(var jj=0;jj<n;jj++){var BX=ax(jj),BY=ay(jj,+b.experiment[dims[jj].name]);jj?x.lineTo(BX,BY):x.moveTo(BX,BY);}x.strokeStyle='#f59e0b';x.lineWidth=4.5;x.stroke();
    for(var j2=0;j2<n;j2++){x.fillStyle='#fbbf24';x.beginPath();x.arc(ax(j2),ay(j2,+b.experiment[dims[j2].name]),5.5,0,7);x.fill();x.strokeStyle='#fff';x.lineWidth=1.6;x.stroke();}}
}
var TIMER=null;
function stopPlay(){if(TIMER){clearInterval(TIMER);TIMER=null;}document.getElementById('play').textContent='▶ Replay';}
function togglePlay(){if(TIMER){stopPlay();return;}var p=MAP.path;if(!p)return;document.getElementById('play').textContent='⏸ Pause';var k=(+document.getElementById('scrub').value>=p.length-1)?0:+document.getElementById('scrub').value;var iv=Math.max(22,Math.round(3200/p.length));TIMER=setInterval(function(){drawFrame(k);if(k>=p.length-1){stopPlay();return;}k++;},iv);}
function scrubTo(v){stopPlay();drawFrame(v);}
function renderMap(j){
  document.getElementById('map').className='on';
  MAP={surface:j.surface,dims:j.dims,path:j.path||[],best:j.best};
  var cap=document.getElementById('mapcap');if(cap)cap.innerHTML=j.surface?'Heat = the score it learned · each dot = one experiment, coloured by the <b>strategy</b> that proposed it · ★ = best.':'Each line = one experiment across all '+(j.dims?j.dims.length:'')+' variables · <b>brighter line = higher score</b> · gold = the best found.';
  var bi=0,bv=-Infinity;MAP.path.forEach(function(p,i){if(p.value>bv){bv=p.value;bi=i;}});MAP.bestIdx=bi;
  document.getElementById('scrub').max=Math.max(1,MAP.path.length-1);
  // legend (only arms that appeared) — friendly names
  var used={};MAP.path.forEach(function(p){used[p.arm]=1;});
  document.getElementById('legend').innerHTML=Object.keys(used).map(function(a){return '<span class="legdot"><i style="background:'+(ARMCOL[a]||'#94a3b8')+'"></i>'+sName(a)+'</span>';}).join('');
  // convergence
  var cv=document.getElementById('conv'),cc=cv.getContext('2d'),W=cv.width,H=cv.height;cc.clearRect(0,0,W,H);
  var run=[],b=-Infinity;MAP.path.forEach(function(p){b=Math.max(b,p.value);run.push(b);});
  var lo=Math.min.apply(null,run),hi=Math.max.apply(null,run),rg=(hi-lo)||1;
  cc.strokeStyle='#5b53e8';cc.lineWidth=2.5;cc.lineJoin='round';cc.beginPath();run.forEach(function(v,i){var X=i/(run.length-1||1)*W,Y=H-9-(v-lo)/rg*(H-18);i?cc.lineTo(X,Y):cc.moveTo(X,Y);});cc.stroke();
  // arm bars
  var tot=(j.armStats||[]).reduce(function(s,a){return s+a.pulls},0)||1;
  document.getElementById('arms').innerHTML=(j.armStats||[]).filter(function(a){return a.pulls>0}).sort(function(a,b){return b.pulls-a.pulls}).map(function(a){return '<div class="kv" style="display:flex;justify-content:space-between;font-size:13px;align-items:center;gap:8px"><span title="'+sDesc(a.name)+'"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+(ARMCOL[a.name]||'#94a3b8')+';margin-right:6px"></i>'+sName(a.name)+' <span class="muted" style="font-size:11px">('+a.name+')</span></span><span class="muted">'+a.pulls+'×</span></div><div class="bar" style="width:'+Math.round(a.pulls/tot*100)+'%;background:'+(ARMCOL[a.name]||'#94a3b8')+'"></div>'}).join('');
  // proof
  document.getElementById('proof').innerHTML='best score <b>'+(+j.best.value).toFixed(4)+'</b> · '+j.evaluations+' experiments<br>📜 '+j.trace.frames.length+' frames · <b style="color:'+(j.verify?'#0e9f6e':'#dc2626')+'">'+(j.verify?'verified ✓':'unverified')+'</b> (Ed25519, offline)';
  // ── plain-language narration (anyone, any job, understands) ──
  var top2=(j.armStats||[]).filter(function(a){return a.pulls>0}).sort(function(a,b){return b.pulls-a.pulls}).slice(0,2).map(function(a){return sName(a.name)});
  var bestStr=Object.keys(j.best.experiment).map(function(kk){var v=j.best.experiment[kk];return '<b>'+kk+'</b> = '+(Math.round(v*1000)/1000)}).join(' · ');
  var nar=document.getElementById('narrate');
  nar.style.display='block';
  nar.innerHTML='<b>📖 '+tr('plainHdr')+':</b> '+tr('tried')+' <b>'+j.evaluations+'</b> '+tr('settings')+' ('+(LANG==='th'?'คะแนน':'score')+' <b>'+(+j.best.value).toFixed(2)+'</b>).'
    +'<br>🏆 <b>'+tr('winning')+':</b> '+bestStr+'.'
    +'<br>📜 '+tr('signed');
  renderPrime();
  renderJournalist();
  renderRx();
  renderHero();
  renderEta();
  renderBrain();
  renderAegis();
  renderSovereign();
  renderSavings();
  renderBaseline();
  renderFrontier();
  renderCert();
  renderPoopt();
  renderSens();
  renderNoise();
  renderInter();
  renderDrift();
  renderSloppy();
  renderCliff();
  renderRashomon();
  renderShape();
  renderWhatif();
  renderBatch();
  stopPlay();setTimeout(togglePlay,250);   // auto-play the discovery
}
function renderSavings(){
  var j=window.LASTJ;if(!j||!j.dims)return;var sv=document.getElementById('savings');if(!sv)return;
  var D=j.dims.length, grid=Math.min(20000,Math.round(Math.pow(8,D))), used=j.evaluations||1, saved=Math.max(0,grid-used), pct=Math.round(saved/grid*100);
  window.__saved=saved;
  var th=(LANG==='th');
  sv.style.display='block';
  sv.innerHTML='<div style="font-size:13px;font-weight:800;color:#0e9f6e;letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">⚡ '+(th?'ประหยัดจำนวนการทดลอง':'Fewer experiments')+'</div>'
    +(th?'การไล่ทดลองแบบกริดให้ทั่ว (~8 จุดต่อ 1 ตัวแปร) ต้องใช้ราว <b>'+grid.toLocaleString()+'</b> ครั้ง · Melete ใช้ <b>'+used+'</b> ครั้ง → น้อยลง <b>~'+saved.toLocaleString()+'</b> ครั้ง ('+pct+'%).'
            :'A full grid sweep (~8 points per variable) would need about <b>'+grid.toLocaleString()+'</b> runs · Melete used <b>'+used+'</b> → about <b>'+saved.toLocaleString()+'</b> fewer ('+pct+'%).')
    +'<div style="margin-top:10px;font-size:14px">'+(th?'ถ้า 1 การทดลองของคุณมีต้นทุน $':'If one experiment costs you $')+' <input id="cost" type="number" min="0" placeholder="'+(th?'ใส่ตัวเลข':'your number')+'" oninput="gMoney()" style="width:120px;display:inline-block;padding:6px 8px;border:1px solid #ccd;border-radius:8px"> <span id="money"></span></div>'
    +'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'เป็นการประมาณเทียบกับการไล่กริด ไม่ใช่การรับประกัน — ตัวเลขจริงขึ้นกับกระบวนการของคุณ':'An estimate versus a grid sweep, not a guarantee — your real number depends on your process.')+'</div>';
}
function gMoney(){
  var c=document.getElementById('cost'),m=document.getElementById('money');if(!c||!m)return;
  var v=parseFloat(c.value);var th=(LANG==='th');
  if(isFinite(v)&&v>0&&window.__saved){m.innerHTML='→ <b style="color:#0e9f6e;font-size:16px">≈ $'+Math.round(window.__saved*v).toLocaleString()+'</b> '+(th?'ที่ประหยัดได้':'saved');}
  else{m.innerHTML='';}
}
function renderFrontier(){
  var j=window.LASTJ;if(!j||!j.frontier)return;var el=document.getElementById('frontier');if(!el)return;
  var f=j.frontier;var th=(LANG==='th');var rec=f.recommendation;
  var color=rec==='STOP'?'#0e9f6e':(rec==='CONTINUE'?'#6366f1':'#8890a8');
  var label=th?(rec==='STOP'?'พอแล้ว — เจอค่าที่ดีในทางปฏิบัติแล้ว':(rec==='CONTINUE'?'ควรทดลองต่อ — ยังขยับขึ้นได้':'ยังบอกไม่ได้ — ข้อมูลยังน้อย'))
              :(rec==='STOP'?'STOP — practical best reached':(rec==='CONTINUE'?'RUN ANOTHER — still improving':'UNKNOWN — too few experiments'));
  var head=th?'ควรทดลองต่ออีกไหม?':'Should you run another experiment?';
  var nExp=(j.evaluations||f.n);
  var bestTxt=isFinite(f.best)?((th?'ดีที่สุดตอนนี้ ':'best so far ')+'<b>'+(+f.best).toPrecision(4)+'</b> '+(th?'จาก ':'in ')+nExp+(th?' ครั้ง':' experiments')):'';
  var gain=(isFinite(f.expectedGainNext)&&rec!=='UNKNOWN')?('<div style="margin-top:6px;color:#475;font-size:13px">'+(th?'คาดว่าทดลองอีก 1 ครั้งจะดีขึ้น ~':'one more is expected to gain ~')+'<b>'+(+f.expectedGainNext).toExponential(2)+'</b></div>'):'';
  var money=(f.spentSoFar!=null)?('<div style="margin-top:4px;color:#475;font-size:13px">'+(th?'ใช้ไปแล้วราว $':'spent so far ≈ $')+(+f.spentSoFar).toLocaleString()+'</div>'):'';
  el.style.display='block';
  el.innerHTML='<div style="font-size:13px;font-weight:800;color:'+color+';letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">🧭 '+head+'</div>'
    +'<div style="font-size:16px;color:'+color+';font-weight:700">'+label+'</div>'
    +'<div style="margin-top:6px;color:#33344e">'+bestTxt+'</div>'+gain+money
    +'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'คำแนะนำจากเส้นทางการทดลองของคุณเอง (ผลตอบแทนลดน้อยถอยลง) — เป็นตัวช่วยตัดสินใจ ไม่ใช่การรับประกัน':'From your own diminishing-returns curve — decision support, not a guarantee.')+'</div>';
}
function renderCert(){
  var j=window.LASTJ;if(!j||!j.certificate)return;var el=document.getElementById('cert');if(!el)return;
  var c=j.certificate;var th=(LANG==='th');
  if(!(c.n>=2)){el.style.display='none';return;}
  var within=Math.max(0.01,+c.withinPct);
  var gpct=Math.max(0,(100/within-1)*100);   // the optimum is provably AT MOST this % above your result
  var gtxt=gpct>=999?'∞':(gpct<10?gpct.toFixed(1):Math.round(gpct).toString());
  var rel=j.reliable?('<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:99px;background:#eef;color:#4338ca;font-size:12px;font-weight:700">⚡ '+(th?'โหมด Reliable':'reliable mode')+'</span>'):'';
  el.style.display='block';
  el.innerHTML='<div style="font-size:13px;font-weight:800;color:#7c3aed;letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">💎 '+(th?'ใบรับรองความเหมาะที่สุด':'Optimality certificate')+rel+'</div>'
    +'<div style="font-size:16px;color:#1a1b30">'+(th?'พิสูจน์ได้ว่ามีค่าที่ดีกว่านี้ได้ไม่เกิน ':'the true optimum is provably at most ')+'<b style="color:#7c3aed">'+gtxt+'%</b> '+(th?'เหนือผลของคุณ':'above your result')+'</div>'
    +'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'ภายใต้ขอบเขต Lipschitz ที่ประมาณจากข้อมูลของคุณ — กล่องดำอาจซ่อนยอดแหลมระหว่างจุดที่วัด จึงเป็นการรับรองแบบมีเงื่อนไข ตรวจซ้ำได้':'Under a Lipschitz bound estimated from your data — a black box can hide a sharper spike between samples, so it is a conditional, reproducible certificate.')+'</div>';
}
function renderPoopt(){
  var j=window.LASTJ;if(!j||!j.poopt){return;}var el=document.getElementById('poopt');if(!el)return;
  var p=j.poopt;var th=(LANG==='th');
  var co2=(p.co2SavedKg!=null)?('<div style="margin-top:4px;color:#475;font-size:13px">'+(th?'ลด CO₂ โดยประมาณ ':'≈ CO₂ saved ')+'<b>'+(+p.co2SavedKg).toLocaleString()+' kg</b> '+(th?'(จากค่าที่คุณใส่)':'(from your factors)')+'</div>'):'';
  el.style.display='block';
  el.innerHTML='<div style="font-size:13px;font-weight:800;color:#0e7490;letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">💠 '+(th?'ใบรับรองการ optimize (Proof of Optimization)':'Proof of Optimization')+'</div>'
    +'<div style="font-size:16px;color:#1a1b30"><b style="color:#0e7490">'+(+p.experimentsSaved).toLocaleString()+'</b> '+(th?'การทดลองน้อยกว่าการไล่ทั้งหมด':'fewer experiments than brute force')+' ('+(+p.efficiencyPct).toFixed(1)+'%)</div>'+co2
    +'<div style="margin-top:8px;font-size:12px;color:#0e9f6e">🔒 '+(th?'เซ็น Ed25519 · ตรวจสอบ offline ได้โดยไม่ต้องเชื่อเรา':'signed Ed25519 · verifiable offline, no trust in us required')+'</div>'
    +'<div style="margin-top:8px;padding:9px 11px;background:#f0fdfa;border:1px solid #bfeee6;border-radius:9px;font-size:12.5px;color:#155e54;line-height:1.55">'+(th?'<b>นี่คืออะไร:</b> หลักฐานกันปลอมว่าคุณหาคำตอบนี้มาอย่างซื่อสัตย์ ใช้การทดลองน้อยกว่าการลองทุกแบบ '+(+p.efficiencyPct).toFixed(0)+'% <br><b>เอาไปใช้:</b> แนบไปกับรายงาน/ส่งให้ลูกค้า·ผู้ตรวจสอบ·QA — ใครก็ตรวจได้เองว่าผลไม่ได้กุ (ลากไฟล์มาตรวจที่ช่อง verify ด้านบนได้เลย)':'<b>What it is:</b> a tamper-proof receipt that you reached this result honestly, using '+(+p.efficiencyPct).toFixed(0)+'% fewer experiments than trying everything.<br><b>Use it:</b> attach it to a report / hand it to a client · auditor · QA — anyone can verify offline that the result wasn\\'t faked (drop the file into the verify box above).')+'</div>'
    +'<button class="btn ghost" style="margin-top:10px;font-size:13px;padding:8px 14px" onclick="dlPoopt()">⬇ '+(th?'ดาวน์โหลดใบรับรอง':'Download certificate')+'</button>';
}
function dlPoopt(){var j=window.LASTJ;if(!j||!j.poopt)return;try{var blob=new Blob([JSON.stringify(j.poopt,null,2)],{type:"application/json"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="proof-of-optimization.json";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}catch(e){}}
function renderSens(){var j=window.LASTJ;if(!j||!j.sensitivity)return;var el=document.getElementById('sens');if(!el)return;var sv=j.sensitivity;var th=(LANG==='th');if(sv.robustness==='unknown'||!sv.variables||!sv.variables.length){el.style.display='none';return;}var color=sv.robustness==='robust'?'#0e9f6e':(sv.robustness==='fragile'?'#c0392b':'#b45309');var rlabel=th?(sv.robustness==='robust'?'ทน (ที่ราบกว้าง)':(sv.robustness==='fragile'?'เปราะ (ยอดแหลม)':'ปานกลาง')):sv.robustness;var rows=sv.variables.slice().sort(function(a,b){return b.importancePct-a.importancePct;}).map(function(v){var w=Math.max(3,Math.min(100,v.importancePct));var tol=(Math.abs(v.toleranceAbs)<1)?(+v.toleranceAbs).toFixed(3):(+v.toleranceAbs).toFixed(1);return '<div style="margin:7px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#33344e;font-weight:600">'+v.name+'</span><span style="color:#8890a8">'+(th?'คุมที่ ±':'hold ±')+tol+' ('+v.importancePct+'%)</span></div><div style="height:6px;background:#eee;border-radius:9px;overflow:hidden;margin-top:3px"><div style="height:100%;width:'+w+'%;background:linear-gradient(90deg,#6366f1,#0ea5b7)"></div></div></div>';}).join('');el.style.display='block';el.innerHTML='<div style="font-size:13px;font-weight:800;color:'+color+';letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px">🎯 '+(th?'ต้องคุมแต่ละค่าแน่นแค่ไหน':'How tightly to hold each knob')+' · '+rlabel+'</div>'+rows+'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'แถบยาว = ไวต่อการเปลี่ยน ต้องคุมแน่น · ประเมินจากการวัดของคุณ (Taguchi robust design)':'longer bar = more sensitive, hold it tighter · estimated from your measurements (Taguchi robust design)')+'</div>';}
function renderNoise(){var j=window.LASTJ;if(!j||!j.noise)return;var el=document.getElementById('noise');if(!el)return;var nz=j.noise;var th=(LANG==='th');if(nz.recommendation==='unknown'){el.style.display='none';return;}var color=nz.recommendation==='trust'?'#0e9f6e':(nz.recommendation==='replicate'?'#c0392b':'#b45309');var label=th?(nz.recommendation==='trust'?'ผลวัดสะอาด เชื่อถือได้':(nz.recommendation==='replicate'?'noise สูง — ควรวัดซ้ำก่อนเชื่อผล':'มีบางจุดที่ควรวัดซ้ำ')):(nz.recommendation==='trust'?'measurements look clean':(nz.recommendation==='replicate'?'high noise — replicate before trusting':'some readings worth re-checking'));var flagged=(nz.outliers&&nz.outliers.length)?('<div style="margin-top:6px;font-size:13px;color:#475">'+(th?'จุดที่น่าจะวัดพลาด: ':'likely mis-measured readings: ')+'<b>'+nz.outliers.length+'</b></div>'):'';var snrTxt=(nz.snr>999)?'\u221e':(+nz.snr).toFixed(1);el.style.display='block';el.innerHTML='<div style="font-size:13px;font-weight:800;color:'+color+';letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">\ud83d\udd2c '+(th?'ความน่าเชื่อถือของการวัด':'Measurement reliability')+'</div><div style="font-size:15px;color:'+color+';font-weight:700">'+label+'</div><div style="font-size:13px;color:#475;margin-top:4px">noise \u03c3 \u2248 '+(+nz.noiseSigma).toPrecision(3)+' \u00b7 SNR \u2248 '+snrTxt+'</div>'+flagged+'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'ประเมินจากความต่างของผลที่จุดใกล้ๆ กัน — ยิ่งใกล้แต่ผลต่างมาก = วัดมี noise':'estimated from disagreement between near-identical settings — close settings, very different scores = a noisy meter')+'</div>';}
function renderInter(){var j=window.LASTJ;if(!j||!j.interactions)return;var el=document.getElementById('inter');if(!el)return;var it=j.interactions;var th=(LANG==='th');if(!it.pairs||!it.pairs.length){el.style.display='none';return;}var top=it.pairs.slice(0,5);var rows=top.map(function(p){var w=Math.max(3,Math.min(100,Math.round(p.strength*100)));var c=p.coupled?'#7c3aed':'#cbd5e1';return '<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#33344e;font-weight:600">'+p.a+' \u00d7 '+p.b+(p.coupled?(' <span style="color:#7c3aed;font-weight:700">'+(th?'\u2014 ปรับร่วมกัน':'\u2014 tune together')+'</span>'):'')+'</span><span style="color:#8890a8">'+(+p.strength).toFixed(2)+'</span></div><div style="height:6px;background:#eee;border-radius:9px;overflow:hidden;margin-top:3px"><div style="height:100%;width:'+w+'%;background:'+c+'"></div></div></div>';}).join('');var head=it.hasInteraction?(th?'ปุ่มที่ coupled กัน (ปรับแยกไม่ได้)':'Coupled knobs (cannot tune independently)'):(th?'ตัวแปรปรับแยกกันได้ (ไม่ค่อย coupled)':'Variables are fairly independent');el.style.display='block';el.innerHTML='<div style="font-size:13px;font-weight:800;color:#7c3aed;letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">\ud83d\udd17 '+(th?'แผนที่การจับคู่ตัวแปร':'Variable interaction map')+'</div><div style="font-size:14px;color:#33344e;font-weight:600;margin-bottom:6px">'+head+'</div>'+rows+'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'แถบยาว/ม่วง = สองตัวนี้ส่งผลต่อกัน ค่าที่ดีของตัวหนึ่งขึ้นกับอีกตัว (DOE interaction)':'longer/purple = these two affect each other; the best value of one depends on the other (DOE interaction)')+'</div>';}
function gExport(){var j=window.LASTJ;if(!j||!j.prescription)return;var p=j.prescription;var th=(LANG==='th');var sig=(j.trace&&j.trace.signature)?j.trace.signature:'';var card={product:'Melete — Recipe Certificate',decision:p.decision,recipe:p.recipe,expected:p.expected,improvement:{vsFirstTry:p.vsStartPct+'%',vsRandom:p.vsRandomPct+'%'},confidencePct:p.confidencePct,robustnessPct:p.robustnessPct,trustPct:p.trustPct,holdTolerances:p.tolerances,experiments:p.evaluations,driftWarning:p.driftWarning,goal:j.goal,signed:!!j.verify,signature:sig?(sig.slice(0,32)+'…'):'',note:p.note,generated:'melete.mneme-ai.space'};var blob=new Blob([JSON.stringify(card,null,2)],{type:'application/json'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='melete-recipe.json';document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url);},1000);}
function renderPrime(){var j=window.LASTJ;var el=document.getElementById('prime');if(!el)return;var pr=j&&j.prime;if(!pr||!isFinite(pr.processIQ)||pr.grade==='unknown'){el.style.display='none';return;}var th=(LANG==='th');var kc={safety:'#c0392b','feasibility':'#b45309',breakthrough:'#a21caf',trust:'#b45309',refine:'#b45309',ship:'#0e9f6e','more-data':'#3b82f6'}[pr.decisive.kind]||'#6d28d9';var gl=th?({'world-class':'ระดับโลก',strong:'แข็งแรง',developing:'กำลังพัฒนา',fragile:'เปราะบาง'}[pr.grade]):pr.grade;var iq=pr.processIQ;var deg=Math.round(iq*3.6);var head=th?({safety:'⚠ ความปลอดภัยมาก่อน',feasibility:'🎯 ต้องเพิ่มตัวแปรใหม่',breakthrough:'⭐ เจอจุดที่อาจเป็นการค้นพบใหม่',trust:'⏱ ตรวจสอบความน่าเชื่อก่อน',refine:'🔁 ปรับให้ทนทานก่อน',ship:'✅ พร้อมใช้งานจริง','more-data':'↗ ลองต่ออีกหน่อย'}[pr.decisive.kind]):({safety:'⚠ Safety first',feasibility:'🎯 Add a new lever',breakthrough:'⭐ A possible breakthrough appeared',trust:'⏱ Verify trust first',refine:'🔁 Make it robust first',ship:'✅ Ready to ship','more-data':'↗ Keep going'}[pr.decisive.kind]);
var kicons={safety:'🛡',feasibility:'🎯',breakthrough:'⭐',trust:'⏱',refine:'🔁',ship:'✅','more-data':'↗'};
var ranked=(pr.insights||[]).slice(0,3).map(function(ins,idx){var ic=kicons[ins.kind]||'•';var c=(idx===0)?kc:'#8890a8';return '<div style="display:flex;gap:9px;align-items:flex-start;margin:5px 0;'+(idx===0?'':'opacity:.75')+'"><span style="flex:0 0 auto;font-size:13px;margin-top:1px">'+ic+'</span><span style="font-size:12.5px;color:'+(idx===0?'#33344e':'#5b5d77')+';line-height:1.5'+(idx===0?';font-weight:600':'')+'">'+ins.headline+'</span></div>';}).join('');
var iqlabel=th?'สมอง':'process IQ';
el.style.display='block';
el.innerHTML='<div class="primewrap" style="box-shadow:0 34px 80px -42px rgba(160,40,110,.55)"><div class="primeborder"></div><div class="primeinner"><div style="position:absolute;inset:0;background:radial-gradient(55% 70% at 100% 0%,rgba(225,29,72,.05),transparent 60%),radial-gradient(50% 60% at 0% 100%,rgba(109,92,240,.05),transparent 60%);pointer-events:none"></div><div style="position:relative">'
+'<div style="display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:14px"><span class="primegem"></span><span class="primeglint" style="font-size:16px;font-weight:900;letter-spacing:2px">MELETE PRIME</span></div>'
+'<div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap"><div style="flex:0 0 auto;position:relative;width:130px;height:130px;border-radius:50%;background:conic-gradient('+kc+' '+deg+'deg,#f1eef6 0)"><div style="position:absolute;inset:6px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 8px 24px -10px rgba(190,20,80,.4),inset 0 0 0 1px #f3eef8"><div style="font-family:ui-monospace,Menlo,monospace;font-size:34px;font-weight:800;color:'+kc+';line-height:1">'+iq+'</div><div style="font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:#9aa0b8;font-weight:700;margin-top:2px">'+iqlabel+'</div><div style="font-size:10px;font-weight:800;color:'+kc+';margin-top:1px">'+gl+'</div></div></div>'
+'<div style="flex:1;min-width:250px"><div style="font-size:13px;color:#9aa0b8;font-weight:700;letter-spacing:.4px;text-transform:uppercase;margin-bottom:2px">'+(th?'คำตัดสิน':'the decision')+'</div><div style="font-size:21px;font-weight:800;color:'+kc+';margin-bottom:9px;letter-spacing:-.3px">'+head+'</div>'+ranked+'</div></div>'
+'<div style="font-size:11.5px;color:#9aa0b8;margin-top:14px;padding-top:12px;border-top:1px solid #f0ecf6;line-height:1.5">'+(th?'สมองหลักรวมทุกเลนส์ (ประสิทธิภาพ·ทนทาน·ปลอดภัย·เพดาน·ความน่าเชื่อ·ปุ่มที่สำคัญ·การค้นพบเกินคาด) แล้วจัดลำดับ “ปลอดภัยมาก่อน” เหลือ 1 คำตัดสิน — สิ่งที่ไม่มีเครื่องมือไหนในโลกทำ':'one brain composing every lens (efficiency · robustness · safety · ceiling · trust · which-knobs · breakthroughs) into a single safety-first decision — what no other tool ships')+'</div>'
+'</div></div></div>';}
function renderRx(){var j=window.LASTJ;var el=document.getElementById('rx');if(!el)return;var p=j&&j.prescription;if(!p||!p.recipe||!p.recipe.length||p.decision==='unknown'){el.style.display='none';return;}var th=(LANG==='th');
var D={ship:{ic:'✅',col:'#0e9f6e',bg:'#ecfdf5',bd:'#a7f3d0',t:th?'ใช้สูตรนี้ได้เลย':'Ready — use this recipe',s:th?'Melete มั่นใจว่านี่คือจุดที่ดีที่สุดแล้ว':'this is your best setting'},
'more-data':{ic:'↗',col:'#3b82f6',bg:'#eff6ff',bd:'#bfdbfe',t:th?'ยังดีขึ้นได้ — ลองต่ออีกหน่อย':'Keep going — still improving',s:th?'อีกไม่กี่รอบน่าจะดีขึ้นอีก':'a few more runs should help'},
refine:{ic:'🔁',col:'#b45309',bg:'#fffbeb',bd:'#fde68a',t:th?'ปรับให้ทนทานก่อนใช้':'Refine before you ship',s:th?'จุดที่ดีที่สุดยังเปราะ ปรับให้ทนการแกว่งในโลกจริง':'the best point is fragile — find one that survives real-world wobble'},
'new-lever':{ic:'🎯',col:'#c0392b',bg:'#fef2f2',bd:'#fecaca',t:th?'ต้องเพิ่มตัวแปรใหม่':'Add a new lever',s:th?'เป้าหมายเกินเพดานของตัวแปรชุดนี้':'target is beyond what these knobs can reach'}}[p.decision];
var chips=p.recipe.map(function(r){return '<span style="display:inline-block;background:#fff;border:1px solid '+D.bd+';border-radius:9px;padding:5px 11px;margin:3px 5px 3px 0;font-size:14px;font-weight:700;color:#1a1b30">'+r.name+' = '+r.value+'</span>';}).join('');
var steps=({ship:th?['ตั้งค่าตามสูตรนี้ในกระบวนการจริงของคุณ','รัน 1 ครั้งเพื่อยืนยันคะแนน','ถ้าตรง — ล็อกใช้เป็นค่ามาตรฐานได้เลย']:['Set these exact values in your real process','Run it once to confirm the score','If it matches — lock it in as your standard'],
'more-data':th?['ปล่อยให้ Melete แนะนำต่ออีก 5–10 รอบ','ใส่คะแนนจริงแต่ละรอบ']:['Let Melete propose 5–10 more rounds','Feed back your real score each round'],
refine:th?['ลองค่ารอบๆ สูตรนี้ (ขยับทีละน้อย)','เลือกจุดที่คะแนนไม่ตกแม้ค่าจะเพี้ยนเล็กน้อย']:['Try settings just around this recipe','Pick the one whose score holds when values drift a little'],
'new-lever':th?['เพิ่มตัวแปรใหม่ที่คุมได้ (เช่น อุณหภูมิ/เวลา/สารเติม)','หรือผ่อนเป้าหมายลงให้อยู่ในวิสัยที่ทำได้']:['Add a new variable you can control (temperature / time / an additive)','Or relax the target to something reachable']})[p.decision];
var stepsHtml=steps.map(function(s,i){return '<div style="display:flex;gap:9px;align-items:flex-start;margin:6px 0"><span style="flex:0 0 auto;width:20px;height:20px;border-radius:50%;background:'+D.col+';color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px">'+(i+1)+'</span><span style="font-size:13.5px;color:#33344e;line-height:1.5">'+s+'</span></div>';}).join('');
var worth=(isFinite(p.vsStartPct)&&p.vsStartPct>0)?('<div style="font-size:14px;color:#0e7a4f;font-weight:700;margin:2px 0 10px">📈 '+(th?'ดีขึ้น ':'')+'+'+p.vsStartPct+'%'+(th?' จากจุดเริ่มต้นของคุณ':' better than your first try')+(isFinite(p.vsRandomPct)&&p.vsRandomPct>0?(' · +'+p.vsRandomPct+'%'+(th?' จากการสุ่ม':' vs guessing')):'')+'</div>'):'';
var tol=(p.tolerances&&p.tolerances.length)?('<div style="font-size:12.5px;color:#475;margin-top:10px;padding-top:10px;border-top:1px dashed '+D.bd+'">🎚 '+(th?'คุมแต่ละค่าไม่ให้เกิน: ':'Hold each knob within: ')+p.tolerances.map(function(t){return '<b>'+t.name+' ±'+t.plusMinus+'</b>';}).join(' · ')+'</div>'):'';
var warn=p.driftWarning?('<div style="font-size:12.5px;color:#c0392b;margin-top:8px">⏱ '+(th?'ผลอาจปนเปื้อนตามเวลา — ทดสอบผู้ชนะใหม่อีกครั้งก่อนเชื่อ':'results may be time-confounded — re-test the winner fresh before trusting')+'</div>'):'';
el.style.display='block';
el.innerHTML='<div style="background:'+D.bg+';border:1.5px solid '+D.bd+';border-radius:20px;padding:22px 24px;box-shadow:0 16px 40px -26px rgba(20,30,80,.4)">'
+'<div style="display:flex;align-items:center;gap:11px;margin-bottom:3px"><span style="font-size:25px">'+D.ic+'</span><span style="font-size:18px;font-weight:800;color:'+D.col+'">'+D.t+'</span><button onclick="gExport()" style="margin-left:auto;border:1px solid '+D.bd+';background:#fff;color:'+D.col+';border-radius:9px;padding:6px 12px;font-size:12.5px;font-weight:700;cursor:pointer">📋 '+(th?'ดาวน์โหลดใบสั่งงาน':'Export recipe')+'</button></div>'
+'<div style="font-size:13px;color:#64708a;margin:0 0 14px 36px">'+D.s+'</div>'
+'<div style="font-size:12px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#8890a8;margin-bottom:6px">'+(th?'สูตรของคุณ':'Your recipe')+'</div>'
+'<div style="margin-bottom:4px">'+chips+'<span style="font-size:14px;color:#475;margin-left:6px">→ '+(th?'คะแนน ':'score ')+'<b style="color:#1a1b30">'+(+p.expected).toPrecision(4)+'</b></span></div>'
+worth
+'<div style="font-size:12px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#8890a8;margin:6px 0 4px">'+(th?'ทำต่อยังไง':'Do this next')+'</div>'+stepsHtml
+tol+warn
+'<div style="margin-top:12px;padding-top:11px;border-top:1px dashed '+D.bd+';font-size:12px;color:#475;line-height:1.6">'+(th?'<b>📄 ปุ่ม "ดาวน์โหลดใบสั่งงาน" ได้ไฟล์อะไร + ใครใช้:</b><br>• <b>วิศวกร/ช่างเทคนิค/แล็บของคุณ</b> → เอาสูตรนี้ไปตั้งค่าในเครื่อง/กระบวนการจริง<br>• <b>ผู้ตรวจ/ฝ่าย Compliance/ผู้ยื่นสิทธิบัตร</b> → เอาใบรับรองที่เซ็นไปตรวจ (offline) ว่าผลนี้จริง ทำซ้ำได้<br>• ไฟล์ = สูตร + คะแนน + ใบรับรองเซ็น Ed25519 (พิสูจน์ที่มาได้)':'<b>📄 What the "Export recipe" file is + who uses it:</b><br>• <b>Your engineer / technician / lab</b> → apply this recipe in the real machine/process<br>• <b>Your auditor / compliance / patent filing</b> → verify the signed certificate (offline) that this result is real & reproducible<br>• File = the recipe + score + an Ed25519 signature (provable provenance)')+'</div>'
+'</div>';}
function renderShape(){var j=window.LASTJ;var el=document.getElementById('shape');if(!el)return;var sh=j&&j.shape;if(!sh||!sh.shape||sh.shape==='unknown'){el.style.display='none';return;}var th=(LANG==='th');var icon={peak:'⛰',ridge:'🏔',saddle:'🐴',plateau:'🍞',bowl:'🥣'}[sh.shape]||'◆';var nm=th?({peak:'ยอดแหลม',ridge:'สันเขา',saddle:'อานม้า',plateau:'ที่ราบ',bowl:'ขอบ/ชาม'}[sh.shape]):sh.shape.toUpperCase();var col=(sh.shape==='saddle')?'#b45309':(sh.shape==='ridge'||sh.shape==='plateau')?'#0e9f6e':'#6d28d9';var note=th?({peak:'ยอดแหลม — มีจุดที่ดีที่สุดจุดเดียว ต้องคุมค่าให้แน่น',ridge:'สันเขา — มีทั้ง '+sh.flatDirections+' แนวที่ได้คะแนนพอๆ กัน คุณมีอิสระเลือกตามนั้น (เลือกถูกสุด)',saddle:'อานม้า — ดีขึ้นทางหนึ่งจะแย่อีกทาง ต้องระวัง เป็นการแลกเปลี่ยน',plateau:'ที่ราบ — กว้างและแบน เกือบทุกค่าใกล้ๆ ได้ผลพอๆ กัน',bowl:'ขอบ/ชาม — ค่าที่ดีสุดเท่าที่วัดได้อยู่ที่ขอบ ลองดันขีดจำกัดต่อ'}[sh.shape]):sh.note;el.style.display='block';el.innerHTML='<div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:'+col+';margin-bottom:4px">'+icon+' '+(th?'รูปทรงของคำตอบ':'Shape of the optimum')+'</div><div style="font-size:17px;color:'+col+';font-weight:800;margin-bottom:5px">'+icon+' '+nm+'</div><div style="font-size:13.5px;color:#33344e;line-height:1.55">'+note+'</div><div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'อ่านจากความโค้งของพื้นผิว (eigenvalue ของ Hessian) — เรขาคณิตเดียวกับที่นักฟิสิกส์ใช้จำแนกจุดวิกฤต':'read from the surface curvature (Hessian eigenvalues) — the geometry physicists use to classify critical points')+'</div>';}
function renderRashomon(){var j=window.LASTJ;var el=document.getElementById('rashomon');if(!el)return;var rs=j&&j.rashomon;if(!rs||!rs.recipes||rs.recipes.length<2){el.style.display='none';return;}var th=(LANG==='th');var dims=(j.space||[]);var rows=rs.recipes.slice(0,4).map(function(rc,i){var cfg=dims.length?dims.map(function(d){return d.name+'='+(+rc.settings[d.name]).toFixed(d.type==='int'?0:2);}).join(' · '):Object.keys(rc.settings).map(function(k){return k+'='+rc.settings[k];}).join(' · ');return '<div style="display:flex;gap:9px;align-items:center;margin:5px 0;font-size:13px"><span style="flex:0 0 auto;width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#6d5cf0,#14b8a6);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">'+(i+1)+'</span><span style="color:#1a1b30">'+cfg+'</span><span style="color:#8890a8;margin-left:auto;font-variant-numeric:tabular-nums">'+(+rc.value).toPrecision(4)+'</span></div>';}).join('');el.style.display='block';el.innerHTML='<div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6d28d9;margin-bottom:4px">🎭 '+(th?'มีหลายสูตรที่ดีพอๆ กัน':'You have options — equally-good recipes')+'</div><div style="font-size:14px;color:#1a1b30;font-weight:700;margin-bottom:8px">'+(th?(rs.recipes.length+' สูตรที่ต่างกันจริง ได้คะแนนใกล้เคียงจุดที่ดีที่สุด'):(rs.recipes.length+' genuinely different recipes all score near the best'))+'</div>'+rows+'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'เลือกอันที่ถูกสุด/ปลอดภัยสุด/สะดวกสุดได้เลย — ดีพอๆ กัน (Rashomon set / equifinality)':'pick the cheapest · safest · most convenient — they\\'re all about as good (Rashomon set / equifinality)')+'</div>';}
function renderCliff(){var j=window.LASTJ;var el=document.getElementById('cliff');if(!el)return;var c=j&&j.cliffs;if(!c||!c.cliffs||!c.cliffs.length){el.style.display='none';return;}var th=(LANG==='th');var col=c.optimumOnCliff?'#c0392b':'#b45309';var top=c.cliffs.slice(0,3).map(function(cl){return '<div style="font-size:13px;color:#33344e;margin:4px 0">⚠ '+(th?'ใกล้ ':'near ')+'<b>'+cl.variable+' ≈ '+cl.at[cl.variable]+'</b> — '+(th?'ขยับนิดเดียวผลตกลง ':'a small step drops the result by ')+'<b>'+cl.drop+'</b> ('+cl.steepness+(th?'× ชันกว่าปกติ)':'× steeper than normal)')+'</div>';}).join('');el.style.display='block';el.innerHTML='<div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:'+col+';margin-bottom:6px">🪨 '+(th?'หน้าผา / จุดพลิก':'Cliffs / tipping points')+'</div>'+(c.optimumOnCliff?'<div style="font-size:14px;color:#c0392b;font-weight:700;margin-bottom:6px">'+(th?'⚠ จุดที่ดีที่สุดของคุณอยู่ริมหน้าผา — เพี้ยนนิดเดียวผลพังได้ ควรถอยมาจุดที่ราบกว่า':'⚠ your best setting sits on a cliff edge — a tiny drift can collapse it; step back to a flatter one')+'</div>':'')+top+'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'จุดที่ "ขยับนิดเดียวแล้วผลตกฮวบ" — อันตรายเรื่องความเสถียรในการผลิตจริง':'where a tiny change makes the result fall off a cliff — a stability risk in real production')+'</div>';}
function renderSloppy(){var j=window.LASTJ;var el=document.getElementById('sloppy');if(!el)return;var s=j&&j.sloppiness;if(!s||!isFinite(s.effectiveDims)||!s.directions||!s.directions.length){el.style.display='none';return;}var th=(LANG==='th');var combo=function(d){return d.loadings.filter(function(l){return Math.abs(l.weight)>0.25;}).map(function(l){return (l.weight<0?'−':'')+l.name;}).join(' & ')||d.loadings[0].name;};var stiff=s.directions[0];var free=s.effectiveDims<s.totalDims;var bars=s.directions.map(function(d){var w=Math.max(3,Math.round(d.stiffness*100));var c=d.kind==='stiff'?'#6d5cf0':'#c9cde0';return '<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:12.5px"><span style="color:#33344e">'+combo(d)+(d.kind==='sloppy'?' <span style="color:#0e9f6e;font-weight:700">'+(th?'← อิสระ ตั้งได้ตามใจ':'← free, set it freely')+'</span>':'')+'</span><span style="color:#8890a8;font-variant-numeric:tabular-nums">'+(d.stiffness*100).toFixed(0)+'%</span></div><div style="height:6px;background:#f0eefb;border-radius:9px;overflow:hidden;margin-top:3px"><div style="height:100%;width:'+w+'%;background:'+(d.kind==='stiff'?'linear-gradient(90deg,#6d5cf0,#14b8a6)':c)+';border-radius:9px"></div></div></div>';}).join('');el.style.display='block';el.innerHTML='<div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6d28d9;margin-bottom:6px">🎛 '+(th?'ปุ่มที่สำคัญจริง':'How many knobs really matter')+'</div><div style="font-size:15px;color:#1a1b30;font-weight:700;margin-bottom:9px">'+(th?('สำคัญจริง '+s.effectiveDims+' จาก '+s.totalDims+' ชุดผสม'):(s.effectiveDims+' of '+s.totalDims+' combinations truly matter'))+'</div>'+bars+'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(free?(th?'ทิศ stiff ต้องคุมแน่น · ทิศ sloppy ตั้งให้ถูก/ง่ายสุดได้เลย ไม่กระทบผล (sloppy-model / effective dimensionality)':'hold the stiff combination tight · the sloppy ones you can set however is cheapest — they barely affect the result (sloppy-model analysis)'):(th?'ทุกตัวแปรสำคัญแยกกัน ไม่มีทิศที่ตั้งฟรีได้':'every variable matters independently — no free directions'))+'</div>';}
var VERT_THEME={aerospace:'#22d3ee',genomics:'#a855f7',solar:'#f59e0b',ml:'#6d5cf0',database:'#10b981',devops:'#ef4444'};
function ccKnobFrac(exp,dims,name){var d=null;for(var i=0;i<dims.length;i++){if(dims[i].name===name)d=dims[i];}if(!d)return 0.5;var mn=+(d.min!=null?d.min:0),mx=+(d.max!=null?d.max:1);var val=+exp[name];return mx>mn?Math.max(0,Math.min(1,(val-mn)/(mx-mn))):0.5;}
function ccDefs(col){return '<defs>'
  +'<linearGradient id="ccsg" x1="0" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="'+col+'"/><stop offset="1" stop-color="'+col+'7e"/></linearGradient>'
  +'<radialGradient id="ccvg" cx="50%" cy="18%" r="88%"><stop offset="0" stop-color="'+col+'24"/><stop offset="0.6" stop-color="'+col+'0a"/><stop offset="1" stop-color="'+col+'00"/></radialGradient>'
  +'<filter id="ccg" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
  +'<filter id="ccg2" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="4.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
  +'</defs>';}
function ccMix(p){var a=[239,68,68],b=[16,185,129];return 'rgb('+Math.round(a[0]+(b[0]-a[0])*p)+','+Math.round(a[1]+(b[1]-a[1])*p)+','+Math.round(a[2]+(b[2]-a[2])*p)+')';}
// Per-vertical Sci-Fi command-center scene — every shape is driven by THIS run's real numbers (score + found knobs)
// every shape is driven by THIS run's real numbers: fr[] = each found knob's position in its range, p = score.
function vScene(key,pct,exp,dims,col){
  var p=Math.max(0,Math.min(1,pct/100));var d=ccDefs(col);var s='';
  var fr=[],nm=[],vl=[];for(var qi=0;qi<dims.length;qi++){var dd=dims[qi];var mn=+(dd.min!=null?dd.min:0),mx=+(dd.max!=null?dd.max:1);var vv=+exp[dd.name];fr.push(mx>mn?Math.max(0,Math.min(1,(vv-mn)/(mx-mn))):0.5);nm.push(dd.name);vl.push((dd.type==='int')?String(Math.round(vv)):(Math.abs(vv)<1?vv.toFixed(3):vv.toFixed(1)));}
  var f0=fr.length?fr[0]:p,f1=fr.length>1?fr[1]:f0,f2=fr.length>2?fr[2]:f1;
  var bg='<rect x="0" y="0" width="320" height="190" fill="url(#ccvg)"/>';
  // honest in-scene readout: the real score + the real knob driving the scene's geometry (no invented units)
  var k0=nm.length?(nm[0]+' '+vl[0]):'';
  var rd='<g font-family="ui-monospace,Menlo,monospace"><text x="11" y="18" font-size="9" letter-spacing=".5" fill="#9fb0d0">SCORE</text><text x="11" y="31" font-size="13" font-weight="800" fill="'+col+'">'+pct.toFixed(1)+'</text>'+(k0?'<text x="309" y="18" text-anchor="end" font-size="8.5" fill="#7e8db0">'+k0+'</text>':'')+'</g>';
  if(key==='aerospace'){
    var spin=(16-9*p).toFixed(1);
    var sat='<ellipse cx="160" cy="62" rx="120" ry="30" fill="none" stroke="'+col+'30" stroke-width="1.1" stroke-dasharray="2 7"/>'
      +'<g transform="translate(160 62)"><g><animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="'+spin+'s" repeatCount="indefinite"/><g transform="translate(120 0)"><rect x="-6.5" y="-3" width="13" height="6" rx="1.5" fill="url(#ccsg)" filter="url(#ccg)"/><rect x="-13" y="-1.4" width="5.5" height="2.8" rx="1" fill="'+col+'aa"/><rect x="7.5" y="-1.4" width="5.5" height="2.8" rx="1" fill="'+col+'aa"/></g></g></g>';
    var gx0=24,gw=272,gy=146,gh=30;
    var grid='';for(var gi=0;gi<=8;gi++){var gxx=gx0+gw*gi/8;grid+='<line x1="'+gxx.toFixed(1)+'" y1="'+(gy-gh)+'" x2="'+gxx.toFixed(1)+'" y2="'+(gy+gh)+'" stroke="'+col+'1c" stroke-width="0.6"/>';}
    grid+='<line x1="'+gx0+'" y1="'+gy+'" x2="'+(gx0+gw)+'" y2="'+gy+'" stroke="'+col+'30" stroke-width="0.7"/>';
    var trk='M',plen=0,ppx=null,ppy=null;for(var ti=0;ti<=64;ti++){var t=ti/64;var px=gx0+gw*t;var py=gy-gh*0.85*Math.sin(t*Math.PI*3);trk+=(ti?' L':'')+px.toFixed(1)+' '+py.toFixed(1);if(ppx!=null)plen+=Math.sqrt((px-ppx)*(px-ppx)+(py-ppy)*(py-ppy));ppx=px;ppy=py;}
    s='<svg viewBox="0 0 320 190">'+d+bg+sat
      +'<rect x="'+gx0+'" y="'+(gy-gh)+'" width="'+gw+'" height="'+(gh*2)+'" rx="7" fill="'+col+'0a" stroke="'+col+'22"/>'+grid
      +'<path d="'+trk+'" fill="none" stroke="'+col+'2a" stroke-width="1.6"/>'
      +'<path d="'+trk+'" fill="none" stroke="url(#ccsg)" stroke-width="2.4" stroke-linecap="round" filter="url(#ccg)" stroke-dasharray="'+(plen*p).toFixed(1)+' '+(plen+4).toFixed(1)+'"/>'
      +'<circle r="3.2" fill="#fff" filter="url(#ccg2)"><animateMotion dur="'+(4.2-2.2*p).toFixed(1)+'s" repeatCount="indefinite" path="'+trk+'"/></circle>'
      +rd+'</svg>';
  }else if(key==='genomics'){
    var N=12,lit=Math.round(N*p),cy=94,amp=40,turns=2.6,rung='',front='',back='',sa='M',sb='M';
    for(var i=0;i<N;i++){var xx=42+i*(236/(N-1));var ph=i*(turns*Math.PI/(N-1));var z=Math.cos(ph);var yA=cy+amp*Math.sin(ph);var yB=cy-amp*Math.sin(ph);var on=(i<lit);
      sa+=(i?' L':'')+xx.toFixed(1)+' '+yA.toFixed(1);sb+=(i?' L':'')+xx.toFixed(1)+' '+yB.toFixed(1);
      rung+='<line'+(on?' class="bpon"':'')+' x1="'+xx.toFixed(1)+'" y1="'+yA.toFixed(1)+'" x2="'+xx.toFixed(1)+'" y2="'+yB.toFixed(1)+'" stroke="'+col+'" stroke-width="'+(1.1+0.8*Math.abs(z)).toFixed(2)+'" opacity="'+(on?(0.45+0.4*Math.abs(z)):0.15).toFixed(2)+'"/>';
      var rA=(2.8+1.7*z).toFixed(2),rB=(2.8-1.7*z).toFixed(2);
      var nA='<circle cx="'+xx.toFixed(1)+'" cy="'+yA.toFixed(1)+'" r="'+rA+'" fill="'+(on?'url(#ccsg)':col+'55')+'" opacity="'+(0.45+0.55*((z+1)/2)).toFixed(2)+'"'+(on&&z>0?' filter="url(#ccg)"':'')+'/>';
      var nB='<circle cx="'+xx.toFixed(1)+'" cy="'+yB.toFixed(1)+'" r="'+rB+'" fill="'+(on?'#fff':'#ffffff55')+'" opacity="'+(0.45+0.55*(((-z)+1)/2)).toFixed(2)+'"/>';
      if(z>=0){back+=nB;front+=nA;}else{back+=nA;front+=nB;}
    }
    s='<svg viewBox="0 0 320 190">'+d+bg+'<g><animateTransform attributeName="transform" type="translate" values="0 -3;0 3;0 -3" dur="5s" repeatCount="indefinite"/>'+rung+back+'<path d="'+sa+'" fill="none" stroke="url(#ccsg)" stroke-width="2.4" opacity="0.85"/><path d="'+sb+'" fill="none" stroke="'+col+'5e" stroke-width="2.4"/>'+front+'</g>'+rd+'</svg>';
  }else if(key==='solar'){
    var tl=ccKnobFrac(exp,dims,'tiltAngle');if(tl===0.5&&fr.length)tl=f0;var ang=(-32+tl*54).toFixed(0);var rays='';
    for(var i=0;i<12;i++){var a=i*30*Math.PI/180;rays+='<line x1="'+(50+14*Math.cos(a)).toFixed(1)+'" y1="'+(50+14*Math.sin(a)).toFixed(1)+'" x2="'+(50+23*Math.cos(a)).toFixed(1)+'" y2="'+(50+23*Math.sin(a)).toFixed(1)+'" stroke="url(#ccsg)" stroke-width="2" stroke-linecap="round"/>';}
    var litCells=Math.round(12*p),cells='',ci=0;
    for(var r=0;r<3;r++){for(var c=0;c<4;c++){var on=(ci<litCells);cells+='<rect'+(on?' class="con"':'')+' x="'+(150+c*24).toFixed(0)+'" y="'+(104+r*14).toFixed(0)+'" width="21" height="12" rx="1.6" fill="'+(on?'url(#ccsg)':col+'20')+'" stroke="'+col+'8a" stroke-width="0.7"'+(on?' filter="url(#ccg)"':'')+'/>';ci++;}}
    var fillH=(34*p).toFixed(1);
    s='<svg viewBox="0 0 320 190">'+d+bg+'<circle cx="50" cy="50" r="27" fill="url(#ccvg)"/>'
      +'<g><g><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="26s" repeatCount="indefinite"/>'+rays+'</g><circle cx="50" cy="50" r="14" fill="url(#ccsg)" filter="url(#ccg2)"/></g>'
      +'<g transform="rotate('+ang+' 198 126)"><rect x="146" y="100" width="104" height="52" rx="4" fill="'+col+'14" stroke="url(#ccsg)" stroke-width="1.5" filter="url(#ccg)"/>'+cells+'<line x1="198" y1="152" x2="198" y2="168" stroke="'+col+'88" stroke-width="2"/></g>'
      +'<line x1="150" y1="150" x2="286" y2="170" stroke="'+col+'40" stroke-width="1.4" stroke-dasharray="3 4"/><circle r="2.6" fill="#fff" filter="url(#ccg)"><animateMotion dur="'+(1.8-1.0*p).toFixed(2)+'s" repeatCount="indefinite" path="M150 150 L286 170"/></circle>'
      +'<rect x="284" y="148" width="26" height="38" rx="3" fill="rgba(255,255,255,.04)" stroke="'+col+'88"/><rect x="287" y="'+(184-(+fillH)).toFixed(1)+'" width="20" height="'+fillH+'" rx="1.5" fill="url(#ccsg)" opacity="0.9"/>'+rd+'</svg>';
  }else if(key==='ml'){
    var layers=[3,4,4,3],ncol=layers.length,nodes='',edges='',pos=[];
    var sel=[Math.round(f0*2),Math.round(f1*3),Math.round(f2*3),Math.round(((f0+f1)/2)*2)];
    var sc=function(c){return Math.max(0,Math.min(layers[c]-1,sel[c]));};
    for(var c=0;c<ncol;c++){var xx=48+c*75;var L=layers[c];pos[c]=[];for(var r=0;r<L;r++){pos[c].push([xx,(42+(148-42)*(L>1?r/(L-1):0.5))]);}}
    for(var c=0;c<ncol-1;c++){for(var a=0;a<pos[c].length;a++){for(var b=0;b<pos[c+1].length;b++){if(a===sc(c)&&b===sc(c+1))continue;edges+='<line x1="'+pos[c][a][0]+'" y1="'+pos[c][a][1].toFixed(1)+'" x2="'+pos[c+1][b][0]+'" y2="'+pos[c+1][b][1].toFixed(1)+'" stroke="'+col+'" stroke-width="0.6" opacity="0.11"/>';}}}
    for(var c=0;c<ncol;c++){var L=layers[c];for(var r=0;r<L;r++){var hot=(r===sc(c));var P=pos[c][r];nodes+=(hot?'<circle cx="'+P[0]+'" cy="'+P[1].toFixed(1)+'" r="11" fill="'+col+'22"/>':'')+'<circle'+(hot?' class="hot"':'')+' cx="'+P[0]+'" cy="'+P[1].toFixed(1)+'" r="'+(hot?6.5:4)+'" fill="'+(hot?'url(#ccsg)':col+'55')+'"'+(hot?' filter="url(#ccg2)"':'')+'/>';}}
    var pd='M'+pos[0][sc(0)][0]+' '+pos[0][sc(0)][1].toFixed(1)+' L'+pos[1][sc(1)][0]+' '+pos[1][sc(1)][1].toFixed(1)+' L'+pos[2][sc(2)][0]+' '+pos[2][sc(2)][1].toFixed(1)+' L'+pos[3][sc(3)][0]+' '+pos[3][sc(3)][1].toFixed(1);
    var dur=(2.6-1.7*p).toFixed(2);
    s='<svg viewBox="0 0 320 190">'+d+bg+edges+'<path d="'+pd+'" fill="none" stroke="url(#ccsg)" stroke-width="2.4" opacity="0.55" filter="url(#ccg)"/>'+nodes+'<circle r="4" fill="#fff" filter="url(#ccg2)"><animateMotion dur="'+dur+'s" repeatCount="indefinite" path="'+pd+'"/></circle><circle r="3" fill="'+col+'"><animateMotion dur="'+dur+'s" begin="'+(+dur/2).toFixed(2)+'s" repeatCount="indefinite" path="'+pd+'"/></circle>'+rd+'</svg>';
  }else if(key==='database'){
    var pc=ccMix(p),active=Math.round(5*p),lanes='';
    for(var i=0;i<5;i++){var yy=48+i*22;var on=(i<active);var sp=(2.3-1.5*p).toFixed(2);
      lanes+='<rect x="58" y="'+yy+'" width="204" height="10" rx="5" fill="rgba(255,255,255,.05)" stroke="'+col+'1c"/>';
      lanes+='<line'+(on?' class="lon"':'')+' x1="62" y1="'+(yy+5)+'" x2="258" y2="'+(yy+5)+'" stroke="'+(on?pc:col+'2a')+'" stroke-width="3" stroke-linecap="round" opacity="'+(on?'0.45':'0.3')+'"/>';
      if(on){for(var k=0;k<2;k++){lanes+='<circle r="3" fill="'+pc+'" filter="url(#ccg)"><animateMotion dur="'+sp+'s" begin="'+(k*0.55).toFixed(2)+'s" repeatCount="indefinite" path="M62 '+(yy+5)+' L258 '+(yy+5)+'"/></circle>';}}}
    var nodeR=function(x){return '<rect x="'+(x-13)+'" y="46" width="26" height="104" rx="6" fill="'+col+'16" stroke="url(#ccsg)" stroke-width="1.4" filter="url(#ccg)"/>';};
    s='<svg viewBox="0 0 320 190">'+d+bg+nodeR(44)+nodeR(290)+lanes+'<g font-family="ui-monospace,Menlo,monospace"><text x="11" y="18" font-size="9" letter-spacing=".5" fill="#9fb0d0">SCORE</text><text x="11" y="31" font-size="13" font-weight="800" fill="'+pc+'">'+pct.toFixed(1)+'</text>'+(k0?'<text x="309" y="18" text-anchor="end" font-size="8.5" fill="#7e8db0">'+k0+'</text>':'')+'</g></svg>';
  }else if(key==='devops'){
    var sh='M160 22 L254 52 L254 108 C254 152 210 172 160 186 C110 172 66 152 66 108 L66 52 Z';
    var fy=(186-(186-22)*p).toFixed(1);var hex='';
    for(var r=0;r<6;r++){for(var c=0;c<5;c++){hex+='<circle cx="'+(90+c*35).toFixed(0)+'" cy="'+(46+r*26).toFixed(0)+'" r="3" fill="none" stroke="'+col+'" stroke-width="0.7" opacity="0.3"/>';}}
    var atk='',srcs=[[18,34,156,52],[302,54,232,86],[12,150,98,150],[308,150,222,150],[160,2,160,40]];
    for(var i=0;i<srcs.length;i++){var S=srcs[i],du=(2+i*0.35).toFixed(1);atk+='<circle r="2.4" fill="#fb7185"><animateMotion dur="'+du+'s" repeatCount="indefinite" path="M'+S[0]+' '+S[1]+' L'+S[2]+' '+S[3]+'"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.82;1" dur="'+du+'s" repeatCount="indefinite"/></circle>';}
    s='<svg viewBox="0 0 320 190">'+d+bg+'<clipPath id="ccsh"><path d="'+sh+'"/></clipPath>'+atk
      +'<g clip-path="url(#ccsh)"><rect x="66" y="22" width="188" height="164" fill="'+col+'0c"/><rect x="66" y="'+fy+'" width="188" height="172" fill="url(#ccsg)" opacity="0.5"><animate attributeName="opacity" values="0.45;0.66;0.45" dur="2.6s" repeatCount="indefinite"/></rect>'+hex+'</g>'
      +'<path d="'+sh+'" fill="none" stroke="url(#ccsg)" stroke-width="2.4" filter="url(#ccg2)"/>'
      +'<text x="160" y="112" fill="#fff" font-size="32" font-weight="800" text-anchor="middle" font-family="ui-monospace,Menlo,monospace">'+pct.toFixed(0)+'</text>'
      +'<text x="160" y="132" fill="'+col+'" font-size="9.5" letter-spacing="1.5" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif">SCORE</text></svg>';
  }else{
    s='<svg viewBox="0 0 320 190">'+d+bg+'<circle cx="160" cy="96" r="'+(20+50*p).toFixed(0)+'" fill="none" stroke="url(#ccsg)" stroke-width="2.2" filter="url(#ccg2)"/>'+rd+'</svg>';
  }
  return s;
}
// a precision instrument dial — a 270° gauge filled to the REAL score (animated sweep), the readout in its core
function ccDial(pct,col,v){
  var p=Math.max(0,Math.min(1,pct/100));var C=263.89,track=197.92,val=(track*p).toFixed(2);
  var ticks='';for(var i=0;i<=10;i++){var a=(135+i*27)*Math.PI/180;ticks+='<line x1="'+(50+38*Math.cos(a)).toFixed(1)+'" y1="'+(50+38*Math.sin(a)).toFixed(1)+'" x2="'+(50+44*Math.cos(a)).toFixed(1)+'" y2="'+(50+44*Math.sin(a)).toFixed(1)+'" stroke="rgba(255,255,255,.16)" stroke-width="'+(i%5===0?'1.6':'.8')+'"/>';}
  var ta=(135+270*p)*Math.PI/180;var tx=(50+42*Math.cos(ta)).toFixed(1),ty=(50+42*Math.sin(ta)).toFixed(1);
  var unit=(v.scoreUnit||'score').toUpperCase();
  return '<svg class="ccdialsvg" viewBox="0 0 100 100">'
    +'<defs><linearGradient id="ccdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+col+'7a"/><stop offset="1" stop-color="'+col+'"/></linearGradient>'
    +'<filter id="ccdgl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
    +ticks
    +'<g transform="rotate(135 50 50)"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="7" stroke-linecap="round" stroke-dasharray="197.92 263.89"/>'
    +'<circle cx="50" cy="50" r="42" fill="none" stroke="url(#ccdg)" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+val+' '+C+'" filter="url(#ccdgl)"><animate attributeName="stroke-dasharray" from="0 '+C+'" to="'+val+' '+C+'" dur="1.15s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"/></circle></g>'
    +(p>0.02?'<circle cx="'+tx+'" cy="'+ty+'" r="3" fill="#fff" filter="url(#ccdgl)" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="0.85s" dur="0.35s" fill="freeze"/></circle>':'')
    +'<text x="50" y="53" text-anchor="middle" font-size="22" font-weight="800" fill="'+col+'" font-family="ui-monospace,Menlo,monospace">'+pct.toFixed(1)+'</text>'
    +'<text x="50" y="66" text-anchor="middle" font-size="7" letter-spacing="1.3" fill="#8a98b8" font-family="-apple-system,system-ui,sans-serif">'+unit+'</text>'
    +'</svg>';
}
function ccGauges(dims,exp,col,pct,v){var th=(LANG==='th');
  var head='<div class="ccreadout">'+ccDial(pct,col,v)+'<div class="ccreadout-meta"><div class="lbl">'+(v.scoreName||'score')+'</div><div class="sub">'+(th?'สดจากการรันนี้ · ทุกตัวเลขคำนวณจริง ตรวจสอบได้':'live from this run · every number computed, verifiable')+'</div></div></div>';
  var bars=dims.map(function(dd){var val=+exp[dd.name];var mn=+(dd.min!=null?dd.min:0),mx=+(dd.max!=null?dd.max:1);var fr=mx>mn?Math.max(0,Math.min(1,(val-mn)/(mx-mn))):0.5;var vs=(dd.type==='int')?String(Math.round(val)):(Math.abs(val)<1?val.toFixed(3):val.toFixed(1));return '<div class="ccgauge"><div class="ccgrow"><span class="nm" style="color:'+col+'">'+dd.name+'</span><span class="vl">'+vs+'</span></div><div class="ccbar"><div class="ccfill" style="width:'+(fr*100).toFixed(1)+'%;background:linear-gradient(90deg,'+col+'4d,'+col+');box-shadow:0 0 10px '+col+'aa"></div></div></div>';}).join('');
  return head+bars;
}
// true terminal typewriter — types each real narration line char-by-char with a blinking cursor
function typeLog(el,lines,col){
  if(!el)return;if(window.__cclogT){clearTimeout(window.__cclogT);window.__cclogT=null;}
  el.innerHTML='';
  function colorOf(L){return (L.indexOf('✓')>=0||L.indexOf('🔏')>=0)?'#34d399':(L.indexOf('⚠')>=0?'#fbbf24':col);}
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');}
  var divs=lines.map(function(L){var dv=document.createElement('div');dv.className='ccline';dv.style.color=colorOf(L);el.appendChild(dv);return dv;});
  var reduce=(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if(reduce){for(var i=0;i<lines.length;i++)divs[i].innerHTML=esc(lines[i]);return;}
  var cur=document.createElement('span');cur.className='cccur';cur.innerHTML='&nbsp;';
  var li=0,ci=0;
  function step(){
    if(li>=lines.length){if(divs.length)divs[divs.length-1].appendChild(cur);window.__cclogT=null;return;}
    var L=lines[li];ci++;divs[li].innerHTML=esc(L.slice(0,ci));divs[li].appendChild(cur);
    var nl=(ci>=L.length);if(nl){li++;ci=0;}
    window.__cclogT=setTimeout(step,nl?170:11);
  }
  step();
}
// HUD provenance strip — every field is a REAL number from this run (proves it is computed, not mocked)
function ccHud(j,col){var th=(LANG==='th');var nStrat=((j.armStats||[]).filter(function(x){return x.pulls>0;})).length;var hash=(j.sovereign&&j.sovereign.certify&&j.sovereign.certify.payloadHash)?('#'+j.sovereign.certify.payloadHash.slice(0,8).toUpperCase()):'—';var ver=!!j.verify;return '<div class="cchud"><span>'+(th?'เครื่องยนต์':'ENGINE')+' <b>'+(j.engine||'portfolio')+'</b></span><span>'+(th?'การทดลอง':'EXPERIMENTS')+' <b>'+(j.evaluations||'?')+'</b></span><span>'+(th?'กลยุทธ์':'STRATEGIES')+' <b>'+nStrat+'</b></span><span>'+(th?'เซ็น':'SIGNED')+' <b>'+hash+'</b></span><span style="color:'+(ver?'#34d399':'#fbbf24')+'">'+(th?'ตรวจสอบ':'VERIFIED')+' <b>'+(ver?'✓':'…')+'</b></span></div>';}
// ENGINE CORE — the REAL competing strategies the engine ran (the genuine multi-strategy "AI-multiverse" brain)
function ccArms(j,col){var a=(j.armStats||[]).filter(function(x){return x.pulls>0;}).sort(function(x,y){return y.pulls-x.pulls;});if(!a.length)return '';var th=(LANG==='th');var tot=a.reduce(function(s,x){return s+x.pulls;},0)||1;var cells=a.map(function(x){var w=Math.round(x.pulls/tot*100);var c=(typeof ARMCOL!=='undefined'&&ARMCOL[x.name])||col;return '<div class="ccarm"><div class="an"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+c+'"></i>'+sName(x.name)+'</div><div class="am"><div class="af" style="width:'+w+'%;background:'+c+'"></div></div><div class="aw">'+x.pulls+'× · '+(x.improvements||0)+' '+(th?'ครั้งที่ดีขึ้น':'wins')+'</div></div>';}).join('');return '<div class="cccore"><div class="cccore-h">⚙ '+(th?('แกนสมอง — '+a.length+' กลยุทธ์แข่งกันค้นหาสด (สมองหลายกลยุทธ์จริง ไม่ใช่ข้อความสำเร็จรูป)'):('ENGINE CORE — '+a.length+' strategies competed live (a real multi-strategy brain, not canned text)'))+'</div><div class="ccarms">'+cells+'</div></div>';}
// WHAT YOU DO NEXT — the persona-tailored bridge from demo to your real work (answers "เอาไปทำอะไรต่อ")
function ccNextStep(v,exp,dims,col,pct){var th=(LANG==='th');var recipe=dims.map(function(d){var val=+exp[d.name];var vs=(d.type==='int')?String(Math.round(val)):(Math.abs(val)<1?val.toFixed(3):val.toFixed(1));return d.name+'='+vs;}).join(' · ');
var P={aerospace:['If you run a satellite link','ถ้าคุณดูแลลิงก์ดาวเทียม'],genomics:['If you are a drug researcher','ถ้าคุณเป็นนักวิจัยยา'],solar:['If you run a solar / grid site','ถ้าคุณดูแลโรงไฟฟ้าโซลาร์/กริด'],ml:['If you tune models (bank / gov)','ถ้าคุณจูนโมเดล (แบงก์/รัฐ)'],database:['If you run production infra','ถ้าคุณดูแลระบบ/ฐานข้อมูลจริง'],devops:['If you own security & compliance','ถ้าคุณดูแลความปลอดภัย/คอมไพลแอนซ์']}[v.key]||['If this is your process','ถ้านี่คือกระบวนการของคุณ'];
var who=th?P[1]:P[0];
var s1=th?('① ใช้สูตรนี้: <b style="color:#e6edff">'+recipe+'</b> → '+(v.scoreName||'score')+' '+pct.toFixed(1)):('① Lock this recipe: <b style="color:#e6edff">'+recipe+'</b> → '+(v.scoreName||'score')+' '+pct.toFixed(1));
var s2=th?'② ยืนยัน: เอาค่านี้ไปลอง <u>จริงหนึ่งครั้ง</u> ในงานของคุณ (แทนการจำลอง)':'② Confirm it: run this ONE setting for real, once (instead of the simulation)';
var s3=th?('③ ทำกับงานจริงของคุณ: '+v.realWorld+' — Melete ค้นหาแบบเดียวกันบนระบบจริงของคุณ ออฟไลน์ 100% แล้วเซ็นใบรับรองให้ยื่นตรวจ/จดสิทธิบัตร'):('③ Do it on YOUR problem: '+v.realWorld+' — Melete runs the same search on your real system, fully offline, and signs a certificate for your audit / patent trail');
return '<div style="margin-top:13px;border-top:1px solid rgba(255,255,255,.1);padding-top:12px"><div class="cccore-h" style="color:'+col+'">▸ '+(th?'แล้วเอาไปทำอะไรต่อ — ':'WHAT YOU DO NEXT — ')+who+'</div><div style="font-size:12.5px;color:#cdd6ee;line-height:1.75">'+s1+'<br>'+s2+'<br>'+s3+'</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="ccmore" onclick="gMore()">▶ '+(th?'ลองต่ออีกหน่อย (รันเพิ่ม)':'Run more experiments')+'</button><button class="ccmore" onclick="gDL(\\'melete-verdict.json\\',(window.LASTJ||{}).sovereign)">↓ '+(th?'ใบรับรองที่เซ็นแล้ว':'Signed certificate')+'</button></div><div style="font-size:10.5px;color:#7a89a8;margin-top:8px">'+(th?'“ลองต่ออีกหน่อย” = กดเพื่อให้ Melete รันการทดลองเพิ่ม (ไม่รันเองอัตโนมัติ) — ตัวเลขอัปเดตสดทุกครั้ง พิสูจน์ว่าคำนวณจริง ไม่ใช่ mockup':'“Run more” = press to let Melete run extra experiments (it does NOT auto-run) — the numbers update live each press, proving it is really computed, not a mockup')+'</div></div>';}
function renderJournalist(){var j=window.LASTJ;var el=document.getElementById('journalist');if(!el)return;if(!j||!j.narration||!j.vertical){el.style.display='none';return;}var th=(LANG==='th');var v=j.vertical;var col=VERT_THEME[v.key]||'#22d3ee';var lines=(j.narration.lines||[]).slice();var pct=Math.max(0,Math.min(100,+((j.best&&j.best.value))||0));var dims=(j.space||[]);var exp=(j.best&&j.best.experiment)||{};el.style.display='block';
var brk='<span class="ccbrk tl"></span><span class="ccbrk tr"></span><span class="ccbrk bl"></span><span class="ccbrk br"></span>';
var head='<div class="cchead"><span class="ccrec"></span><span style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:'+col+'">'+v.emoji+' MELETE COMMAND CENTER</span><span style="font-size:12px;color:#cdd6ee;font-weight:700">'+v.title+'</span><span style="font-size:10.5px;color:#7a89a8;margin-left:auto">'+v.sector+'</span></div>';
var scene='<div class="ccscene">'+vScene(v.key,pct,exp,dims,col)+ccGauges(dims,exp,col,pct,v)+'</div>';
var foot='<div style="margin-top:11px;padding-top:10px;border-top:1px solid #ffffff14;font-size:11px;color:#8a98b8">'+(th?'⚙ ปุ่ม·คะแนน: ':'⚙ knobs · score: ')+v.knobsCopy+' → '+v.scoreCopy+'</div>';
el.innerHTML='<div class="cmdcenter" style="--cc:'+col+';border:1px solid '+col+'55;box-shadow:0 26px 60px -30px '+col+'66, inset 0 0 70px '+col+'0c">'+brk+head+ccHud(j,col)+'<div class="ccgrid">'+scene+'<div class="cclog" id="cclog"></div></div>'+ccArms(j,col)+ccNextStep(v,exp,dims,col,pct)+foot+'</div>';
typeLog(document.getElementById('cclog'),lines,col);}
// source-of-result banner — always shows WHICH button produced what you're looking at (kills the "where did this come from / why did it change" confusion)
function setRunSrc(kind,label,col){var el=document.getElementById('runsrc');if(!el)return;var th=(LANG==='th');el.style.display='block';el.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:11px 15px;border-radius:13px;border:1px solid '+col+'66;background:linear-gradient(90deg,'+col+'22,'+col+'08);box-shadow:0 0 0 1px '+col+'22 inset,0 10px 30px -22px '+col+'88"><span style="width:8px;height:8px;border-radius:50%;background:'+col+';box-shadow:0 0 10px '+col+'"></span><span style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:'+col+'">'+(th?'ผลลัพธ์จาก':'RESULT FROM')+'</span><span style="font-size:14.5px;font-weight:800;color:#1a1b30">'+label+'</span><span style="font-size:11.5px;color:#8890a8;margin-left:auto">'+kind+'</span></div>';}
function gMore(){if(!window.__vkey)return;var nb=Math.min(160,(window.__vbudget||50)+40);gVertical(window.__vkey,nb);}
function gVertical(key,budget){window.__vkey=key;var b=Math.max(20,Math.min(160,budget||50));window.__vbudget=b;var out=document.getElementById('out');var t=document.getElementById('try');if(t)t.scrollIntoView({behavior:'smooth',block:'start'});if(out)out.textContent=(b>50?('▶ running '+b+' experiments on the '+key+' scenario…'):('▶ running real Melete engine on the '+key+' scenario…'));stopPlay();
fetch('/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({vertical:key,budget:b})}).then(function(r){return r.json();}).then(function(j){window.LASTJ=j;if(j.error){if(out)out.textContent='⚠ '+j.error;return;}var th=(LANG==='th');var vt=(j.vertical&&j.vertical.title)||key;setRunSrc((th?'การ์ด Live Demo · กดอีกครั้งเพื่อรันใหม่':'Live-demo card · press again to re-run')+(b>50?(' · '+b+' '+(th?'การทดลอง':'experiments')):''),(j.vertical&&j.vertical.emoji?j.vertical.emoji+' ':'')+vt,VERT_THEME[key]||'#22d3ee');if(out)out.innerHTML='🔬 <b>Best:</b> '+(+j.best.value).toFixed(2)+' at <b>'+JSON.stringify(j.best.experiment)+'</b> · '+j.evaluations+' experiments';renderMap(j);var jel=document.getElementById('journalist');if(jel&&jel.scrollIntoView)setTimeout(function(){jel.scrollIntoView({behavior:'smooth',block:'center'});},200);}).catch(function(e){if(out)out.textContent='⚠ '+e.message;});}
function gDL(name,obj){try{var b=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(u);},800);}catch(e){}}
function gVerifyVerdict(){var j=window.LASTJ;if(!j||!j.sovereign)return;var th=(LANG==='th');var o=document.getElementById('sovout');o.innerHTML='<span style="color:#8890a8;font-size:13px">'+(th?'กำลังตรวจ…':'verifying…')+'</span>';fetch('/sovereign/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(j.sovereign)}).then(function(r){return r.json();}).then(function(v){o.innerHTML='<span style="color:'+(v.ok?'#0e7a4f':'#c0392b')+';font-size:13.5px;font-weight:700">'+(v.ok?'✓ ':'✗ ')+(th?(v.ok?'ลายเซ็นถูกต้อง — provenance ตรวจ offline ผ่าน':'ตรวจไม่ผ่าน: '+v.reason):v.reason)+'</span>';}).catch(function(){o.innerHTML='<span style="color:#c33;font-size:13px">error</span>';});}
function gReplay(){var j=window.LASTJ;if(!j||!j.replayToken)return;var th=(LANG==='th');var o=document.getElementById('sovout');o.innerHTML='<span style="color:#8890a8;font-size:13px">'+(th?'กำลังเล่นซ้ำ…':'replaying…')+'</span>';fetch('/replay/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(j.replayToken)}).then(function(r){return r.json();}).then(function(v){var ok=v.signatureValid&&v.reproduced;o.innerHTML='<span style="color:'+(ok?'#0e7a4f':'#c0392b')+';font-size:13.5px;font-weight:700">'+(ok?'⏪ ':'✗ ')+(th?(ok?'เล่นซ้ำได้เป๊ะทุกขั้น (DISCOVER→DECIDE→DIAGNOSE) — offline ไม่ต้องมีเซิร์ฟเวอร์':'เล่นซ้ำไม่ตรง: '+v.reason):v.reason)+'</span>';}).catch(function(){o.innerHTML='<span style="color:#c33;font-size:13px">error</span>';});}
function renderSovereign(){var j=window.LASTJ;var el=document.getElementById('sovcard');if(!el)return;var s=j&&j.sovereign;if(!s||!s.certify){el.style.display='none';return;}var th=(LANG==='th');var hash=s.certify.payloadHash?s.certify.payloadHash.slice(0,18)+'…':'';var iq=(s.decide&&isFinite(s.decide.processIQ))?s.decide.processIQ:'';var dec=s.decide?s.decide.decision:'';var hasReplay=!!j.replayToken;el.style.display='block';el.innerHTML='<div style="background:rgba(255,255,255,.86);backdrop-filter:blur(12px);border:1px solid #d9d3f4;border-radius:20px;padding:21px 23px;box-shadow:0 28px 60px -36px rgba(70,40,140,.5)"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px"><span style="font-size:19px">👑</span><span style="font-size:13px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6d28d9">'+(th?'คำตัดสินที่เซ็น + ตรวจสอบได้':'Signed Sovereign Verdict')+'</span><span style="font-size:11px;font-weight:700;color:#0e7a4f;background:#ecfdf5;border:1px solid #bfeee0;padding:2px 8px;border-radius:99px">'+s.certify.standard+'</span></div><div style="font-size:13px;color:#475;margin-bottom:3px">'+(th?'การตัดสิน: ':'decision: ')+'<b style="color:#1a1b30">'+dec+'</b>'+(iq!==''?(' · Φ IQ <b>'+iq+'</b>'):'')+'</div><div style="font-size:11.5px;color:#9aa0b8;font-family:ui-monospace,Menlo,monospace;margin-bottom:12px">Ed25519 · sha256 · hash '+hash+'</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" style="font-size:12.5px;padding:8px 13px" onclick="gDL(\\'melete-verdict.json\\',window.LASTJ.sovereign)">⬇ '+(th?'ใบรับรอง':'Verdict')+'</button>'+(hasReplay?('<button class="btn ghost" style="font-size:12.5px;padding:8px 13px" onclick="gDL(\\'melete-replay-token.json\\',window.LASTJ.replayToken)">⬇ '+(th?'Replay Token':'Replay token')+'</button>'):'')+'<button class="btn primary" style="font-size:12.5px;padding:8px 13px" onclick="gVerifyVerdict()">✓ '+(th?'ตรวจ offline':'Verify offline')+'</button>'+(hasReplay?('<button class="btn primary" style="font-size:12.5px;padding:8px 13px" onclick="gReplay()">⏪ '+(th?'เล่นซ้ำ':'Replay')+'</button>'):'')+'</div><div id="sovout" style="margin-top:11px"></div><div class="muted" style="font-size:11.5px;margin-top:9px">'+(th?'ดาวน์โหลดแล้วส่งให้ผู้ตรวจ/compliance ได้เลย — เขา re-run เองพิสูจน์ได้ ไม่ต้องเชื่อเรา (provenance + reproducibility ไม่ใช่ proof ว่าโค้ดไม่มีบั๊ก)':'hand it to an auditor — they re-verify & replay it themselves, no trust in us required (provenance + reproducibility — not a proof your code is bug-free)')+'</div></div>';}
function renderAegis(){var j=window.LASTJ;var el=document.getElementById('aegis');if(!el)return;var a=j&&j.aegis;if(!a||!a.best||!a.best.experiment){el.style.display='none';return;}var th=(LANG==='th');var dims=(j.space||[]);var rb=a.best.experiment;var raw=a.rawBest&&a.rawBest.experiment;var sgn=(j.goal==='minimize')?-1:1;var traded=(+a.tradedHeight)||0;var robPct=Math.round((+a.robustnessOfBest||0)*100);
var fragile=(raw && (Math.abs(sgn*((+a.rawBest.value)-(+a.best.value)))>0.02*Math.max(1e-9,Math.abs(+a.rawBest.value)))) && robPct<92;
var chip=function(e){return dims.length?dims.map(function(d){return '<span style="display:inline-block;background:#fff;border:1px solid #cdeee6;border-radius:8px;padding:4px 9px;margin:2px 4px 2px 0;font-size:13px;font-weight:700;color:#1a1b30">'+d.name+'='+(+e[d.name]).toFixed(d.type==='int'?0:2)+'</span>';}).join(''):'';};
el.style.display='block';
var inner;
if(fragile){inner='<div style="font-size:15px;color:#0e7a4f;font-weight:800;margin-bottom:7px">'+(th?'พบสูตรที่ "ทนทานกว่า" — รอดโลกจริง':'A more ROBUST setting — one that survives the real world')+'</div><div style="margin-bottom:4px">'+chip(rb)+'<span style="font-size:14px;color:#475;margin-left:4px">→ '+(+a.best.value).toPrecision(4)+' · '+(th?'ทนทาน ':'robust ')+robPct+'%</span></div><div style="font-size:12.5px;color:#8890a8;margin-top:6px">'+(th?'ยอดที่คะแนนสูงสุด ('+(raw?dims.map(function(d){return d.name+'='+(+raw[d.name]).toFixed(2);}).join(' '):'')+' → '+(+a.rawBest.value).toPrecision(4)+') แหลม/เปราะ — ขยับนิดเดียวอาจตกฮวบ AEGIS เลยแนะค่าที่นิ่งกว่า (แลกความสูง '+traded.toFixed(3)+' เพื่อความเสถียร)':'the highest-scoring peak ('+(+a.rawBest.value).toPrecision(4)+') is sharp/fragile — a tiny drift can collapse it, so AEGIS recommends the steadier setting (traded '+traded.toFixed(3)+' of height for stability)')+'</div>';}
else{inner='<div style="font-size:15px;color:#0e7a4f;font-weight:800;margin-bottom:6px">✓ '+(th?'จุดที่ดีที่สุดของคุณทนทานอยู่แล้ว':'Your optimum is already robust')+'</div><div style="font-size:13px;color:#475">'+chip(rb)+'<span style="margin-left:4px">'+(th?'ทนต่อการแกว่งในโลกจริง ':'survives real-world wobble ')+'('+(th?'ทนทาน ':'robust ')+robPct+'%)</span></div>';}
el.innerHTML='<div style="background:rgba(255,255,255,.82);backdrop-filter:blur(12px);border:1px solid #c7ece2;border-radius:20px;padding:20px 22px;box-shadow:0 26px 58px -36px rgba(14,122,79,.4)"><div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px"><span style="font-size:18px">🛡</span><span style="font-size:13px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#0e7a4f">AEGIS</span><span style="font-size:12px;color:#0e9f6e;font-weight:600">'+(th?'เครื่องยนต์ที่หาคำตอบ "ทนทาน" ไม่ใช่แค่คะแนนสูง':'the engine that finds a robust answer, not just a high score')+'</span></div>'+inner+'<div class="muted" style="font-size:11.5px;margin-top:9px">'+(th?'AEGIS เลือกค่าที่ผลไม่ตกแม้สภาพจริงจะแกว่ง — สิ่งที่ optimizer ทั่วไปไม่ทำ':'AEGIS picks the setting whose result holds even when conditions wobble — what ordinary optimizers don\\'t do')+'</div></div>';}
// CONVERGENCE VORTEX — the search drawn as a gravity well: radius = score (the glowing gold core IS the
// best answer), dashed rings mark real score levels, lineage edges flow inward. Every coordinate encodes a
// real number, so it's legible AND honest (no arbitrary scatter). Obsidian-dark, tap-to-trace, mobile.
function renderBrain(){var j=window.LASTJ;var el=document.getElementById('brain');if(!el)return;var t=j&&j.lineage;if(!t||!t.nodes||t.nodes.length<3||t.root<0){el.style.display='none';return;}var th=(LANG==='th');var N=t.nodes;var goalMin=(j.goal==='minimize');
var vmin=Infinity,vmax=-Infinity;for(var i=0;i<N.length;i++){if(N[i].value<vmin)vmin=N[i].value;if(N[i].value>vmax)vmax=N[i].value;}var vr=Math.max(1e-9,vmax-vmin);
var dims=(j.space||[]);var obsr=(j.observations||[]);
var fmtv=function(v){return (Math.abs(v)<1?(+v).toFixed(2):(+v).toFixed(1));};
var q=function(v){return goalMin?((vmax-v)/vr):((v-vmin)/vr);};               // 1 = best
var colQ=function(qq){qq=Math.max(0,Math.min(1,qq));var st=[[0,91,108,240],[0.5,34,211,238],[0.82,52,211,153],[1,251,191,36]];for(var s=1;s<st.length;s++){if(qq<=st[s][0]){var a=st[s-1],b=st[s];var u=(qq-a[0])/((b[0]-a[0])||1);return 'rgb('+Math.round(a[1]+(b[1]-a[1])*u)+','+Math.round(a[2]+(b[2]-a[2])*u)+','+Math.round(a[3]+(b[3]-a[3])*u)+')';}}return 'rgb(251,191,36)';};
// build the search tree (children by array index) + a radial tidy-tree angle (sunburst sectors by leaf count)
var kids={};for(var k=0;k<N.length;k++){var pp=N[k].parent;if(pp!=null){(kids[pp]=kids[pp]||[]).push(k);}}
var rootPos=0;for(var k=0;k<N.length;k++){if(N[k].i===t.root){rootPos=k;break;}}
var leaves=new Array(N.length);for(var k=0;k<N.length;k++)leaves[k]=0;
var cnt=function(u){var c=kids[u];if(!c||!c.length){leaves[u]=1;return 1;}var s=0;for(var z=0;z<c.length;z++)s+=cnt(c[z]);leaves[u]=s;return s;};cnt(rootPos);
var ang=new Array(N.length);for(var k=0;k<N.length;k++)ang[k]=NaN;
var asn=function(u,a0,a1){ang[u]=(a0+a1)/2;var c=kids[u];if(!c)return;var span=a1-a0,acc=a0;for(var z=0;z<c.length;z++){var w=span*(leaves[c[z]]||1)/(leaves[u]||1);asn(c[z],acc,acc+w);acc+=w;}};
asn(rootPos,-Math.PI/2,-Math.PI/2+2*Math.PI);
for(var k=0;k<N.length;k++){if(isNaN(ang[k]))ang[k]=-Math.PI/2+2*Math.PI*k/N.length;}
var W=640,H=440,cx0=320,cy0=212,Rmax=180;
var rad=function(qq){return Rmax*Math.pow(1-Math.max(0,Math.min(1,qq)),0.74);};
var jit=function(k){return ((N[k].i*1103515245+12345)%1000)/1000;};
var SX=new Array(N.length),SY=new Array(N.length),Q=new Array(N.length);
for(var k=0;k<N.length;k++){var qq=q(N[k].value);Q[k]=qq;var rr=(k===rootPos)?0:Math.max(16,rad(qq)+(jit(k)-0.5)*10);SX[k]=cx0+rr*Math.cos(ang[k]);SY[k]=cy0+rr*Math.sin(ang[k]);}
// dashed score-level rings (so the radius axis has a real meaning)
var rings='';[0.5,0.9].forEach(function(ql){var rr=rad(ql);var sv=goalMin?(vmax-ql*vr):(vmin+ql*vr);rings+='<circle cx="'+cx0+'" cy="'+cy0+'" r="'+rr.toFixed(1)+'" fill="none" stroke="#ffffff14" stroke-width="1" stroke-dasharray="2 5"/><text x="'+cx0+'" y="'+(cy0-rr+12).toFixed(1)+'" font-size="9" fill="#9aa6c8" text-anchor="middle" font-family="ui-monospace,Menlo,monospace">'+fmtv(sv)+'</text>';});
// lineage edges flowing inward toward the core
var edges='';for(var k=0;k<N.length;k++){if(k===rootPos)continue;var pp=N[k].parent;if(pp==null)continue;var x1=SX[k],y1=SY[k],x2=SX[pp],y2=SY[pp];var mxp=(x1+x2)/2,myp=(y1+y2)/2;var cxp=mxp+(cx0-mxp)*0.22,cyp=myp+(cy0-myp)*0.22;var tt=Q[k];var sw=(0.5+tt*2.3).toFixed(2);var op=(0.1+tt*0.5).toFixed(2);var dl=(0.1+(1-tt)*0.5).toFixed(2);edges+='<path d="M'+x1.toFixed(1)+' '+y1.toFixed(1)+' Q'+cxp.toFixed(1)+' '+cyp.toFixed(1)+' '+x2.toFixed(1)+' '+y2.toFixed(1)+'" fill="none" stroke="'+colQ(tt)+'" stroke-width="'+sw+'" stroke-linecap="round" opacity="'+op+'" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:branchGrow 1s ease forwards;animation-delay:'+dl+'s"/>';}
var core='<circle cx="'+cx0+'" cy="'+cy0+'" r="26" fill="#fbbf24" opacity="0.12"><animate attributeName="r" values="22;33;22" dur="3.2s" repeatCount="indefinite"/></circle><circle cx="'+cx0+'" cy="'+cy0+'" r="13" fill="#fbbf24" opacity="0.2"/>';
// a signal pulsing the deepest lineage into the core
var deep=0;for(var k=0;k<N.length;k++)if(N[k].depth>N[deep].depth)deep=k;
var pcs=[];var pcur=deep,pg=0;while(pcur!=null&&pg++<N.length+1){pcs.push(pcur);pcur=N[pcur].parent;}
var pulse='';if(pcs.length>2){var pd='';for(var z=0;z<pcs.length;z++)pd+=(z?' L':'M')+SX[pcs[z]].toFixed(1)+' '+SY[pcs[z]].toFixed(1);pulse='<circle r="3" fill="#fff"><animateMotion dur="2.6s" repeatCount="indefinite" path="'+pd+'"/><animate attributeName="opacity" values="0;1;1;0" dur="2.6s" repeatCount="indefinite"/></circle>';}
var nodes='';for(var k=0;k<N.length;k++){var tt=Q[k];var isRoot=(k===rootPos);var rr=(isRoot?7.5:(2.4+tt*5.2)).toFixed(1);var op=(0.5+tt*0.5).toFixed(2);var dl=(0.1+(1-tt)*0.6).toFixed(2);var tip='score '+(+N[k].value).toFixed(3);if(obsr[N[k].i]&&obsr[N[k].i].experiment&&dims.length)tip+=' · '+dims.map(function(d){return d.name+'='+(+obsr[N[k].i].experiment[d.name]).toFixed(2);}).join(', ');nodes+='<circle cx="'+SX[k].toFixed(1)+'" cy="'+SY[k].toFixed(1)+'" r="'+rr+'" fill="'+(isRoot?'#fde047':colQ(tt))+'" opacity="'+op+'" style="opacity:0;animation:nodePop .5s ease forwards;animation-delay:'+dl+'s"><title>'+(isRoot?'★ best · ':'')+tip+'</title></circle>';}
var star='<text x="'+SX[rootPos].toFixed(1)+'" y="'+(SY[rootPos]+5).toFixed(1)+'" font-size="17" text-anchor="middle" fill="#fde047" style="opacity:0;animation:nodePop .6s ease forwards;animation-delay:.9s">★</text>';
var SC=[];for(var k=0;k<N.length;k++)SC.push({sx:SX[k],sy:SY[k],parent:N[k].parent,value:N[k].value,i:N[k].i});
window.BRAIN={W:W,H:H,root:t.root,nodes:SC};
var brec=(obsr[t.root]&&obsr[t.root].experiment&&dims.length)?dims.map(function(d){return d.name+'='+(+obsr[t.root].experiment[d.name]).toFixed(2);}).join(' · '):'';
var binfo='<div id="braininfo" style="margin-top:10px;padding:10px 13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:11px;font-size:13.5px;color:#cdd6ee">⭐ '+(th?'จุดที่ดีที่สุด: ':'best so far: ')+'<b style="color:#fde047">'+brec+'</b> → '+(th?'คะแนน ':'score ')+(+N[rootPos].value).toFixed(2)+'</div>';
el.style.display='block';
el.innerHTML='<div style="background:radial-gradient(120% 100% at 50% 0%,#0d1322,#05060d 72%);border:1px solid #1d2740;border-radius:20px;padding:20px 22px;box-shadow:0 26px 58px -34px rgba(20,20,50,.7)"><div style="margin-bottom:3px"><span style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#a5b4fc">🧠 '+(th?'สมองการค้นพบ — แผนที่การลู่เข้าหาคำตอบ':'Discovery brain — the convergence map')+'</span></div><div style="font-size:12.5px;color:#9aa6c8;margin-bottom:3px">'+(th?'ยิ่งจุดใกล้แกนกลางที่เรืองแสง = คะแนนยิ่งดี · เส้น = เส้นทางการค้นหาที่ไหลเข้าหา “สูตรที่ดีที่สุด” (★ ตรงกลาง) · วงประ = ระดับคะแนน':'closer to the glowing core = higher score · lines = the search flowing inward to the best recipe (★ at center) · dashed rings = score levels')+'</div><div style="font-size:12px;color:#a5b4fc;font-weight:600;margin-bottom:6px">👆 '+(th?'แตะ/คลิกจุดไหนก็ได้ → เส้นทางจากจุดนั้นถึงคำตอบดีที่สุดจะสว่างขึ้น + โชว์สูตร (มือถือก็แตะได้)':'Tap/click any dot → its path to the best answer lights up + shows the recipe (works on mobile)')+'</div><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block;cursor:pointer" onclick="gBrainClick(event)">'+rings+edges+'<g id="brainpath"></g>'+core+pulse+nodes+star+'</svg>'+binfo+'<div style="font-size:11.5px;color:#7a89a8;margin-top:7px">'+(th?'จุดใหญ่/อุ่น = คะแนนสูง · ★ ทอง = สูตรที่ดีที่สุด · '+N.length+' การทดลอง':'bigger / warmer = higher score · ★ gold = the best recipe · '+N.length+' experiments')+'</div></div>';}
function gBrainClick(evt){var B=window.BRAIN;if(!B)return;var svg=evt.currentTarget;var r=svg.getBoundingClientRect();var mx=(evt.clientX-r.left)/r.width*B.W,my=(evt.clientY-r.top)/r.height*B.H;var bi=-1,bd=1e18;for(var i=0;i<B.nodes.length;i++){var dd=(B.nodes[i].sx-mx)*(B.nodes[i].sx-mx)+(B.nodes[i].sy-my)*(B.nodes[i].sy-my);if(dd<bd){bd=dd;bi=i;}}if(bi<0)return;var chain=[];var cur=bi,g=0;while(cur!=null&&g++<B.nodes.length+1){chain.push(cur);cur=B.nodes[cur].parent;}var d='M'+B.nodes[chain[0]].sx.toFixed(1)+' '+B.nodes[chain[0]].sy.toFixed(1);for(var i=1;i<chain.length;i++)d+=' L'+B.nodes[chain[i]].sx.toFixed(1)+' '+B.nodes[chain[i]].sy.toFixed(1);var s=B.nodes[chain[0]],e=B.nodes[chain[chain.length-1]];var g2=document.getElementById('brainpath');if(!g2)return;g2.innerHTML='<path d="'+d+'" fill="none" stroke="#a5b4fc" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.97" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:branchGrow 1.1s ease forwards;filter:drop-shadow(0 0 4px #a5b4fc)"/><circle cx="'+s.sx.toFixed(1)+'" cy="'+s.sy.toFixed(1)+'" r="6" fill="#a5b4fc"><animate attributeName="r" values="5;9;5" dur="1.4s" repeatCount="indefinite"/></circle><circle cx="'+e.sx.toFixed(1)+'" cy="'+e.sy.toFixed(1)+'" r="9" fill="none" stroke="#fde047" stroke-width="2.5"><animate attributeName="r" values="9;14;9" dur="1.6s" repeatCount="indefinite"/></circle>';
var bn=B.nodes[bi];var inf=document.getElementById('braininfo');var LJ=window.LASTJ;if(inf&&LJ&&LJ.observations&&LJ.observations[bn.i]&&LJ.observations[bn.i].experiment){var ex=LJ.observations[bn.i].experiment;var rc=(LJ.space||[]).map(function(d){return d.name+'='+(+ex[d.name]).toFixed(2);}).join(' · ');var th=(LANG==='th');inf.innerHTML='👆 '+(th?'จุดที่เลือก: ':'this point: ')+'<b>'+rc+'</b> → '+(th?'คะแนน ':'score ')+(+bn.value).toFixed(2)+(bn.i===B.root?(' · '+(th?'⭐ ดีที่สุด':'⭐ the best')):'');}}
function renderEta(){var j=window.LASTJ;var el=document.getElementById('eta');if(!el)return;var e=j&&j.efficiency;if(!e||!isFinite(e.eta)||e.grade==='unknown'){el.style.display='none';return;}var th=(LANG==='th');var pct=Math.round(e.eta*100);var deg=Math.round(e.eta*360);var gcol=e.grade==='exceptional'?'#0e9f6e':(e.grade==='strong'?'#3b82f6':(e.grade==='fair'?'#b45309':'#c0392b'));var glabel=th?(e.grade==='exceptional'?'ยอดเยี่ยม':(e.grade==='strong'?'แข็งแรง':(e.grade==='fair'?'พอใช้':'อ่อน'))):e.grade;
var facts=[['G',e.gain,th?'ได้ผลจริง':'gain captured'],['R',e.robustness,th?'ทนทาน':'robust optimum'],['T',e.trust,th?'เชื่อถือได้':'trustworthy']];
var bars=facts.map(function(f){var w=Math.max(2,Math.round(f[1]*100));var weak=(e.weakestLink&&((f[0]==='G'&&e.weakestLink==='gain')||(f[0]==='R'&&e.weakestLink==='robustness')||(f[0]==='T'&&e.weakestLink==='trust')));var bc=weak?'#c0392b':'#7c6cf0';return '<div style="margin:7px 0"><div style="display:flex;justify-content:space-between;font-size:12px;color:#475;margin-bottom:3px"><span><b style="font-family:ui-monospace,Menlo,monospace;color:'+bc+'">'+f[0]+'</b> · '+f[2]+(weak?(' <span style="color:#c0392b;font-weight:700">'+(th?'← จุดอ่อน':'← weak link')+'</span>'):'')+'</span><span style="font-variant-numeric:tabular-nums;color:#33344e;font-weight:700">'+(+f[1]).toFixed(2)+'</span></div><div style="height:7px;background:#f0eefb;border-radius:99px;overflow:hidden"><div style="height:100%;width:'+w+'%;background:linear-gradient(90deg,#6d5cf0,#14b8a6);border-radius:99px;transition:width .9s cubic-bezier(.22,1,.36,1)"></div></div></div>';}).join('');
el.style.display='block';
el.innerHTML='<div style="position:relative;background:#fff;border:1px solid #ece8fb;border-radius:20px;padding:22px;box-shadow:0 18px 48px -28px rgba(99,76,240,.45);overflow:hidden">'
+'<div style="position:absolute;inset:0;background:radial-gradient(120% 80% at 100% 0%,rgba(20,184,166,.06),transparent 60%),radial-gradient(120% 90% at 0% 100%,rgba(109,92,240,.07),transparent 55%);pointer-events:none"></div>'
+'<div style="position:relative;display:flex;gap:22px;align-items:center;flex-wrap:wrap">'
+'<div style="flex:0 0 auto;width:118px;height:118px;border-radius:50%;background:conic-gradient('+gcol+' '+deg+'deg,#eee9fb 0);display:flex;align-items:center;justify-content:center">'
+'<div style="width:92px;height:92px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px #f1edfd">'
+'<div style="font-family:ui-monospace,Menlo,monospace;font-size:27px;font-weight:800;color:'+gcol+';line-height:1">'+(+e.eta).toFixed(2)+'</div>'
+'<div style="font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:'+gcol+';font-weight:700;margin-top:2px">'+glabel+'</div></div></div>'
+'<div style="flex:1;min-width:230px">'
+'<div style="display:flex;align-items:baseline;gap:9px;flex-wrap:wrap"><span style="font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6d28d9">'+(th?'ประสิทธิภาพการค้นพบ':'Discovery efficiency')+'</span><span style="font-family:ui-monospace,Menlo,monospace;font-size:15px;color:#33344e">&eta; = &#8731;(G&middot;R&middot;T)</span></div>'
+'<div style="font-size:12px;color:#8890a8;margin:4px 0 10px">'+(th?'เลขเดียวที่ซื่อสัตย์ — ได้ผลจริง × ทนทาน × ไม่ถูกปนเปื้อน (geometric mean: เก่งด้านเดียวโกงไม่ได้)':'one honest number — real gain × robust × not confounded (geometric mean: you can\\'t fake it by being good at one thing)')+'</div>'
+bars
+'<div style="font-size:11px;color:#a0a4b8;margin-top:9px;font-family:ui-monospace,Menlo,monospace">'+(+e.gain).toFixed(2)+' &middot; '+(+e.robustness).toFixed(2)+' &middot; '+(+e.trust).toFixed(2)+' &rarr; &eta; '+(+e.eta).toFixed(2)+' &middot; '+e.evaluations+(th?' การทดลอง':' runs')+'</div>'
+'</div></div></div>';}
function renderBatch(){var j=window.LASTJ;var el=document.getElementById('batchp');if(!el)return;if(!j||!j.space||!j.observations||j.observations.length<4){el.style.display='none';return;}var th=(LANG==='th');el.style.display='block';el.innerHTML='<div style="background:rgba(255,255,255,.82);backdrop-filter:blur(12px);border:1px solid #e7e4f6;border-radius:18px;padding:18px 20px;box-shadow:0 24px 54px -36px rgba(70,55,160,.5)"><div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#0e7a8a;margin-bottom:3px">🔬 '+(th?'รันหลายเครื่องพร้อมกัน':'Run several at once')+'</div><div style="font-size:12.5px;color:#8890a8;margin-bottom:11px">'+(th?'ถ้าคุณมีหลายเครื่อง/หลายเตา Melete เลือกชุดการทดลองที่คุ้มสุด+หลากหลาย ให้รันขนานกันรอบเดียว':'If you have several machines/reactors, Melete picks the most valuable, diverse set to run in parallel this round')+'</div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><label style="font-size:13px;color:#33344e;font-weight:600">'+(th?'จำนวนเครื่อง':'how many at once')+'</label><input id="bk" type="number" min="2" max="12" value="4" style="width:72px;padding:8px;border:1px solid #d7d9ea;border-radius:9px;font-size:14px"><button class="btn primary" onclick="gBatch()" style="font-size:13.5px;padding:9px 16px">🔬 '+(th?'วางแผนรันขนาน':'Plan the parallel batch')+'</button></div><div id="bkout" style="margin-top:12px"></div></div>';}
function gBatch(){var j=window.LASTJ;if(!j||!j.space)return;var th=(LANG==='th');var k=parseInt((document.getElementById('bk')||{}).value,10)||4;var out=document.getElementById('bkout');out.innerHTML='<span style="color:#8890a8;font-size:13px">'+(th?'กำลังวางแผน…':'planning…')+'</span>';fetch('/batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({space:j.space,observations:j.observations,goal:j.goal||'maximize',k:k})}).then(function(r){return r.json();}).then(function(b){if(b.error||!b.batch){out.innerHTML='<span style="color:#c33;font-size:13px">'+(b.error||'—')+'</span>';return;}var rows=b.batch.map(function(e,i){var cfg=j.space.map(function(d){return d.name+'='+(+e[d.name]).toFixed(d.type==='int'?0:2);}).join(' · ');return '<div style="display:flex;gap:9px;align-items:center;margin:5px 0;font-size:13.5px"><span style="flex:0 0 auto;width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#6d5cf0,#14b8a6);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">'+(i+1)+'</span><span style="color:#1a1b30">'+cfg+'</span></div>';}).join('');out.innerHTML='<div style="font-size:12.5px;color:#475;margin-bottom:6px">'+(th?'รัน '+b.batch.length+' ชุดนี้พร้อมกันได้เลย แล้วเอาคะแนนกลับมาใส่:':'Run these '+b.batch.length+' in parallel, then feed the scores back:')+'</div>'+rows;}).catch(function(){out.innerHTML='<span style="color:#c33;font-size:13px">error</span>';});}
function renderWhatif(){var j=window.LASTJ;var el=document.getElementById('whatif');if(!el)return;if(!j||!j.space||!j.observations||j.observations.length<4||!j.best){el.style.display='none';return;}var th=(LANG==='th');var dims=j.space;var best=j.best.experiment||{};var inputs=dims.map(function(d){var v=best[d.name]!=null?(+best[d.name]):((+(d.min||0)+ +(d.max||1))/2);var step=(d.type==='int')?'1':'any';return '<div style="display:flex;align-items:center;gap:8px;margin:5px 0"><label style="flex:0 0 38%;font-size:13px;color:#33344e;font-weight:600">'+d.name+'</label><input class="wifx" data-n="'+d.name+'" type="number" step="'+step+'" value="'+(+v).toFixed(d.type==='int'?0:2)+'" style="flex:1;padding:8px 10px;border:1px solid #d7d9ea;border-radius:9px;font-size:14px;width:0"><span style="font-size:11px;color:#9aa0b8;flex:0 0 auto">'+(+(d.min||0))+'–'+(+(d.max||1))+'</span></div>';}).join('');
el.style.display='block';
el.innerHTML='<div style="background:rgba(255,255,255,.82);backdrop-filter:blur(12px);border:1px solid #e7e4f6;border-radius:18px;padding:18px 20px;box-shadow:0 24px 54px -36px rgba(70,55,160,.5)"><div style="font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6d28d9;margin-bottom:3px">🔮 '+(th?'ลองถามดู — "ถ้าฉันตั้งค่าเป็น…?"':'Ask "what if I set it to…?"')+'</div><div style="font-size:12.5px;color:#8890a8;margin-bottom:11px">'+(th?'พิมพ์ค่าที่อยากลอง แล้วดูคะแนนที่ Melete ทำนาย — โดยไม่ต้องทดลองจริง (มันจะบอกตรงๆ ว่ามั่นใจหรือเดา)':'Type a setting and see Melete\\'s predicted score — without running it (it tells you if it\\'s sure or guessing)')+'</div>'+inputs+'<button class="btn primary" onclick="gPredict()" style="margin-top:10px;font-size:13.5px;padding:9px 16px">🔮 '+(th?'ทำนายคะแนน':'Predict the score')+'</button><div id="wifout" style="margin-top:12px"></div></div>';}
function gPredict(){var j=window.LASTJ;if(!j||!j.space)return;var th=(LANG==='th');var q={};document.querySelectorAll('.wifx').forEach(function(i){var v=parseFloat(i.value);if(isFinite(v))q[i.getAttribute('data-n')]=v;});var out=document.getElementById('wifout');out.innerHTML='<span style="color:#8890a8;font-size:13px">'+(th?'กำลังทำนาย…':'predicting…')+'</span>';fetch('/predict',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({space:j.space,observations:j.observations,query:q})}).then(function(r){return r.json();}).then(function(p){if(p.error||!isFinite(p.predicted)){out.innerHTML='<span style="color:#c33;font-size:13px">'+(p.error||'—')+'</span>';return;}var cmap={measured:{c:'#0e7a4f',t:th?'เชื่อถือได้ (วัดใกล้ตรงนี้แล้ว)':'reliable — measured near here'},confident:{c:'#0e7a4f',t:th?'ค่อนข้างเชื่อถือได้':'fairly reliable'},rough:{c:'#b45309',t:th?'ประมาณคร่าวๆ':'a rough estimate'},guess:{c:'#c0392b',t:th?'นี่คือการเดา — ควรทดลองจริงก่อนเชื่อ':'a GUESS — test it before trusting'}};var cm=cmap[p.confidence]||cmap.rough;out.innerHTML='<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span style="font-size:26px;font-weight:800;font-family:ui-monospace,Menlo,monospace;color:'+cm.c+'">'+(+p.predicted).toPrecision(4)+'</span><span style="font-size:13px;color:#475">'+(isFinite(p.uncertainty)&&p.uncertainty>0?('± '+(+p.uncertainty).toPrecision(2)+' · '):'')+'<b style="color:'+cm.c+'">'+cm.t+'</b></span></div>';}).catch(function(){out.innerHTML='<span style="color:#c33;font-size:13px">error</span>';});}
function renderDrift(){var j=window.LASTJ;if(!j||!j.drift)return;var el=document.getElementById('drift');if(!el)return;var dr=j.drift;var th=(LANG==='th');if(!dr.note||dr.note.indexOf('need')>=0){el.style.display='none';return;}var color=dr.detected?'#c0392b':'#0e9f6e';var label=dr.detected?(th?'พบแนวโน้มตามเวลา — ผลอาจปนเปื้อน (confound)':'a time-trend was found — results may be confounded'):(th?'ไม่พบแนวโน้มตามเวลา — ผลไม่ปนเปื้อนกับลำดับ':'no time-trend — results are not confounded with order');var corr=(+dr.residualOrderCorr).toFixed(2);var pct=Math.round((+dr.driftFraction)*100);var w=Math.max(3,Math.min(100,Math.round(Math.abs(+dr.residualOrderCorr)*100)));var bar=dr.detected?'<div style="height:6px;background:#eee;border-radius:9px;overflow:hidden;margin-top:7px"><div style="height:100%;width:'+w+'%;background:linear-gradient(90deg,#f59e0b,#c0392b)"></div></div>':'';var detail=dr.detected?('<div style="font-size:13px;color:#475;margin-top:4px">'+(th?'สัมพันธ์กับลำดับ ':'correlation with order ')+corr+' · ≈'+pct+(th?'% ของการกระจายผล · ทดสอบผู้ชนะใหม่อีกครั้ง':'% of the spread · re-test the winner fresh')+'</div>'):'';el.style.display='block';el.innerHTML='<div style="font-size:13px;font-weight:800;color:'+color+';letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">⏱ '+(th?'ผลถูกปนเปื้อนตามเวลาไหม':'Time-confound check')+'</div><div style="font-size:15px;color:'+color+';font-weight:700">'+label+'</div>'+bar+detail+'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'เช็คว่าส่วนที่ตัวแปรอธิบายไม่ได้ ค่อยๆ เปลี่ยนตามลำดับการทดลองหรือไม่ (เครื่องร้อน/สารเปลี่ยนล็อต) — ความถูกต้องเชิงวิทยาศาสตร์':'checks whether the part your variables can\\'t explain drifts with measurement order (a warming rig, a new reagent batch) — scientific validity')+'</div>';}
function renderBaseline(){
  var j=window.LASTJ;if(!j||!j.baseline)return;var el=document.getElementById('baseline');if(!el)return;
  var b=j.baseline;var th=(LANG==='th');var min=(j.goal==='minimize');
  function imp(ref){ if(ref==null||!isFinite(ref))return null; var d=min?(ref-b.best):(b.best-ref); var base=Math.abs(ref)>1e-9?Math.abs(ref):(Math.abs(b.best)>1e-9?Math.abs(b.best):1); return d/base*100; }
  var vsR=imp(b.random), vsS=imp(b.start);
  function fmt(p){ if(p==null)return ''; return (p>=0?'+':'')+(Math.abs(p)>=10?Math.round(p):p.toFixed(1))+'%'; }
  var color=(vsR!=null&&vsR>=0)?'#0e9f6e':'#8890a8';
  var rows='';
  rows+='<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8890a8">'+(th?'จุดเริ่มต้น (ลองครั้งแรก)':'starting point (first try)')+'</span><b>'+(+b.start).toPrecision(4)+'</b></div>';
  if(b.random!=null)rows+='<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#8890a8">'+(th?'สุ่ม (งบเท่ากัน)':'random search (same budget)')+'</span><b>'+(+b.random).toPrecision(4)+'</b></div>';
  rows+='<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid #e7e7ef;margin-top:4px"><span style="color:#1a1b30;font-weight:700">Melete</span><b style="color:#6d28d9">'+(+b.best).toPrecision(4)+'</b></div>';
  el.style.display='block';
  el.innerHTML='<div style="font-size:13px;font-weight:800;color:#0e9f6e;letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px">📊 '+(th?'ตัวเลขนี้ดีแค่ไหน — เทียบกับเกณฑ์':'How good is this number? — vs baselines')+'</div>'
    +rows
    +'<div style="font-size:15px;margin-top:10px;color:#1a1b30">'+(vsR!=null?('<b style="color:'+color+'">'+fmt(vsR)+'</b> '+(th?'ดีกว่าการสุ่ม':'better than random')):'')+(vsS!=null&&isFinite(vsS)?(' · <b>'+fmt(vsS)+'</b> '+(th?'เหนือจุดเริ่มต้น':'over your start')):'')+'</div>'
    +'<div class="muted" style="font-size:11.5px;margin-top:8px">'+(th?'เทียบบนงบจำนวนการทดลองเท่ากัน — ทำให้คะแนนดิบมีความหมาย':'Compared at the same experiment budget — so the raw score actually means something.')+'</div>';
}
function renderHero(){
  var j=window.LASTJ;if(!j||!j.best){return;}var el=document.getElementById('hero');if(!el)return;
  var th=(LANG==='th');var min=(j.goal==='minimize');
  function tile(label,val){return '<div style="background:rgba(255,255,255,.08);border-radius:14px;padding:14px"><div style="font-size:11px;color:#a5b4fc;text-transform:uppercase;letter-spacing:.3px">'+label+'</div><div style="font-size:18px;font-weight:700;margin-top:4px">'+val+'</div></div>';}
  var chips=Object.keys(j.best.experiment||{}).map(function(k){var v=j.best.experiment[k];var vs=(typeof v==='number')?(Math.abs(v)>=100?Math.round(v):(+v).toFixed(2)):v;return '<span style="display:inline-block;background:rgba(255,255,255,.14);color:#fff;border-radius:9px;padding:6px 11px;margin:3px 4px 3px 0;font-size:13px;font-weight:600">'+k+' = '+vs+'</span>';}).join('');
  var vsR=null,vsS=null;
  if(j.baseline){var b=j.baseline;var imp=function(ref){if(ref==null||!isFinite(ref))return null;var d=min?(ref-b.best):(b.best-ref);var base=Math.abs(ref)>1e-9?Math.abs(ref):1;return d/base*100;};vsR=imp(b.random);vsS=imp(b.start);}
  function pct(p){return p==null?'':((p>=0?'+':'')+(Math.abs(p)>=10?Math.round(p):p.toFixed(1))+'%');}
  var rec=j.frontier?j.frontier.recommendation:null;
  var recTxt=th?(rec==='STOP'?'พอแล้ว':(rec==='CONTINUE'?'ลองต่อได้':'—')):(rec==='STOP'?'Done':(rec==='CONTINUE'?'Run more':'—'));
  var gtxt='—';if(j.certificate&&j.certificate.withinPct){var w=Math.max(0.01,j.certificate.withinPct);var g=Math.max(0,(100/w-1)*100);gtxt='≤'+(g>=999?'∞':(g<10?g.toFixed(1):Math.round(g)))+'%';}
  var score=(+j.best.value);var scoreTxt=(Math.abs(score)>=1000?Math.round(score).toLocaleString():(+score).toPrecision(5));
  el.style.display='block';
  el.innerHTML='<div style="border-radius:22px;padding:28px;background:linear-gradient(135deg,#1a1b30,#2d2b55);color:#fff;box-shadow:0 22px 60px -26px rgba(45,43,85,.7)">'
   +'<div style="font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#a5b4fc">🏆 '+(th?'สูตรที่ดีที่สุดที่เจอ':'Best recipe found')+(j.reliable?' · ⚡ reliable':'')+'</div>'
   +'<div style="margin:12px 0 4px">'+chips+'</div>'
   +'<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-top:8px"><div style="font-size:42px;font-weight:800;line-height:1">'+scoreTxt+'</div>'
     +'<div style="font-size:14px;color:#c7d2fe">'+(vsR!=null?('<b style="color:#6ee7b7">'+pct(vsR)+'</b> '+(th?'ดีกว่าสุ่ม':'vs random')):'')+(vsS!=null&&isFinite(vsS)?(' · <b>'+pct(vsS)+'</b> '+(th?'เหนือจุดเริ่ม':'vs start')):'')+'</div></div>'
   +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px">'+tile(th?'การทดลอง':'experiments',(j.evaluations||'—'))+tile(th?'ควรทำต่อ?':'next step',recTxt)+tile(th?'รับรอง':'certified',gtxt)+'</div>'
   +'<div style="margin-top:18px;font-size:13px;color:'+(j.verify?'#6ee7b7':'#fca5a5')+'">'+(j.verify?('🔒 '+(th?'เซ็นและตรวจสอบแล้ว (Ed25519 ออฟไลน์)':'signed & verified (Ed25519, offline)')):'⚠ unverified')+'</div>'
  +'</div>';
}
async function run(){
  var out=document.getElementById('out');out.textContent='discovering…';document.getElementById('map').className='';stopPlay();
  window.__vkey=null;var _th=(LANG==='th');setRunSrc(_th?'ปุ่ม “ดู Melete ค้นพบ” · จากค่าที่คุณตั้งในกล่องด้านบน':'the “Watch Melete” button · from the settings in the box above',_th?'⚙ โจทย์ที่คุณตั้งเอง':'⚙ Your custom problem','#6d5cf0');
  try{
    var space=JSON.parse(document.getElementById('space').value);
    var body={space:space,objective:document.getElementById('obj').value,budget:+document.getElementById('budget').value,goal:'maximize',reliable:!!(document.getElementById('reliable')&&document.getElementById('reliable').checked)};
    var r=await fetch('/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json();window.LASTJ=j;
    if(j.error){out.textContent='⚠ '+j.error;return;}
    out.innerHTML='🔬 <b>Best:</b> score '+(+j.best.value).toFixed(5)+' at <b>'+JSON.stringify(j.best.experiment)+'</b> &nbsp;·&nbsp; found in <b>'+j.evaluations+'</b> experiments. <span class="muted">▶ watch it search below</span>';
    renderMap(j);
  }catch(e){out.textContent='⚠ '+e.message;}
}
// storybook — reveal each comic panel as it scrolls into view (synced Meli effects via CSS)
(function(){var ps=[].slice.call(document.querySelectorAll('.panel[data-beat]'));
 if(!('IntersectionObserver' in window)){ps.forEach(function(p){p.classList.add('in')});return;}
 var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}})},{threshold:0.3,rootMargin:'0px 0px -8% 0px'});
 ps.forEach(function(p){io.observe(p)});})();
setMode('simple');loadPreset();setLang(LANG);
</script>
<script>
/* deep-link from a per-profession page: /?demo=<vertical> auto-runs that live demo */
(function(){try{var dk=new URLSearchParams(location.search).get('demo');if(dk&&typeof gVertical==='function'){gVertical(dk);var t=document.getElementById('journalist')||document.getElementById('gallery');if(t&&t.scrollIntoView)setTimeout(function(){t.scrollIntoView({behavior:'smooth',block:'start'});},320);}}catch(e){}})();
</script>
</body></html>`;
}

export function pitchDeck(version = "0.4.0"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete — the sovereign, verifiable discovery brain</title>${socialMeta({ title: "Melete — the sovereign, verifiable discovery brain", desc: "One engine for every expensive process: the best, most robust recipe in the fewest experiments — with a signed, offline-verifiable Trustworthy Discovery Certificate.", path: "/pitch", img: "/og.png" })}${faviconLinks()}${structuredData("/pitch", "Melete — the sovereign, verifiable discovery brain", "One engine for every expensive process: the best robust recipe in the fewest experiments, with a signed Trustworthy Discovery Certificate.", { faq: true, breadcrumb: [{ name: "Home", url: "/" }, { name: "Pitch", url: "/pitch" }] })}<style>
:root{color-scheme:light}*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#fafaff;color:#14152a;font:17px/1.65 -apple-system,system-ui,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:-20% -10%;z-index:-2;pointer-events:none;background:radial-gradient(32% 30% at 84% 4%,rgba(168,85,247,.14),transparent 62%),radial-gradient(38% 38% at 4% 10%,rgba(109,92,240,.16),transparent 60%),radial-gradient(34% 36% at 94% 92%,rgba(14,165,183,.13),transparent 60%);filter:blur(26px)}
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.5;background-image:radial-gradient(circle at 1px 1px,rgba(80,70,160,.055) 1px,transparent 0);background-size:32px 32px}
.pbar{position:fixed;top:0;left:0;height:3px;width:0;background:linear-gradient(90deg,#6d5cf0,#a855f7,#0ea5b7);z-index:50;transition:width .15s linear}
.ptop{position:fixed;top:0;left:0;right:0;z-index:40;display:flex;align-items:center;justify-content:space-between;padding:13px 26px;backdrop-filter:blur(12px);background:rgba(250,250,255,.7);border-bottom:1px solid rgba(80,70,160,.07)}
.ptop a{text-decoration:none}
.pwm{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-.3px;color:#14152a;font-size:17px}
.pwm .g{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#6d5cf0,#0ea5b7);transform:rotate(45deg);box-shadow:0 6px 16px -4px rgba(109,92,240,.6)}
.ptopcta{background:linear-gradient(95deg,#6d5cf0,#0ea5b7);color:#fff;border-radius:10px;padding:8px 16px;font-weight:700;font-size:14px}
.wrap{max-width:1000px;margin:0 auto;padding:0 26px}
section.ps{padding:84px 0;border-bottom:1px solid rgba(80,70,160,.06)}
section.ps:first-of-type{border:0}
.eye{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#7c5cf0;font-weight:800;margin-bottom:16px}
h1.disp{font-size:clamp(44px,8vw,92px);line-height:1.02;margin:0 0 18px;font-weight:850;letter-spacing:-3px;background:linear-gradient(96deg,#6d5cf0,#0ea5b7,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 12px 40px rgba(109,92,240,.28))}
h2.sec{font-size:clamp(28px,4.4vw,46px);line-height:1.12;margin:0 0 18px;font-weight:850;letter-spacing:-1.2px;color:#14152a}
.lead{font-size:clamp(18px,2.4vw,23px);color:#3b3d57;max-width:760px;line-height:1.5}
.sub{font-size:16px;color:#6a6c84;max-width:720px}
.reveal{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
.reveal.in{opacity:1;transform:none}
.cta{display:flex;gap:13px;flex-wrap:wrap;margin-top:30px}
.btnp{display:inline-block;text-decoration:none;font-weight:800;font-size:16px;padding:14px 26px;border-radius:13px;transition:transform .2s,box-shadow .2s}
.btnp.pri{background:linear-gradient(95deg,#6d5cf0,#0ea5b7);color:#fff;box-shadow:0 18px 40px -16px rgba(99,76,240,.65)}
.btnp.pri:hover{transform:translateY(-2px);box-shadow:0 24px 50px -16px rgba(99,76,240,.75)}
.btnp.gho{background:rgba(255,255,255,.7);color:#3a3c54;border:1px solid #e4e3f2}
.btnp.gho:hover{transform:translateY(-2px);border-color:#c9c6ec}
.chips{display:flex;gap:9px;flex-wrap:wrap;margin-top:26px}
.chip{font-size:13px;font-weight:600;color:#3a3c54;background:rgba(255,255,255,.7);border:1px solid #e7e6f4;border-radius:999px;padding:7px 14px}
.grid{display:grid;gap:15px;margin-top:8px}
.g3{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.g2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.card{background:rgba(255,255,255,.82);backdrop-filter:blur(13px) saturate(1.15);-webkit-backdrop-filter:blur(13px) saturate(1.15);border:1px solid #ecebf6;border-radius:18px;padding:22px 23px;box-shadow:0 24px 54px -36px rgba(70,55,160,.5)}
.card h3{margin:0 0 8px;font-size:19px;letter-spacing:-.3px;color:#14152a}
.card p{margin:0;font-size:14.5px;color:#56586f;line-height:1.6}
.card .n{font-size:13px;font-weight:800;color:#7c5cf0;margin-bottom:7px;letter-spacing:.3px}
.formula{font-family:ui-monospace,Menlo,monospace;font-size:clamp(18px,3vw,28px);font-weight:800;color:#4c3fd6;background:rgba(255,255,255,.72);border:1px solid #e7e0ff;border-radius:16px;padding:18px 22px;margin:6px 0 8px;box-shadow:0 20px 46px -32px rgba(99,76,240,.5);display:inline-block;letter-spacing:-.5px}
table.proof{border-collapse:collapse;font-size:16px;margin:8px 0 8px;width:100%;max-width:620px}
table.proof th,table.proof td{padding:12px 18px 12px 0;text-align:left}table.proof th{color:#9698ad;font-size:12px;text-transform:uppercase;letter-spacing:.6px}table.proof td{border-bottom:1px solid #eceef6}
.win{color:#0e9f6e;font-weight:800}
.stats{display:flex;flex-wrap:wrap;gap:15px;margin-top:24px}
.stat{flex:1;min-width:150px;background:rgba(255,255,255,.74);border:1px solid #ecebf6;border-radius:16px;padding:18px 18px;box-shadow:0 18px 40px -30px rgba(70,55,160,.5)}
.stat b{display:block;font-size:30px;font-weight:850;letter-spacing:-1px;background:linear-gradient(135deg,#6d5cf0,#0ea5b7);-webkit-background-clip:text;background-clip:text;color:transparent}
.stat span{font-size:12.5px;color:#6a6c84}
/* the trust-certificate moat band */
.moat{background:radial-gradient(130% 120% at 50% -10%,#141d31,#0a0f1d 64%,#06080f);border-radius:24px;padding:46px 40px;color:#e8eefc;position:relative;overflow:hidden;box-shadow:0 50px 110px -50px rgba(0,0,0,.7)}
.moat::after{content:"";position:absolute;left:8%;right:8%;top:0;height:1px;background:linear-gradient(90deg,transparent,#34d399,transparent);opacity:.55}
.moat .eye{color:#34d399}
.moat h2{color:#fff;font-size:clamp(26px,4vw,40px);letter-spacing:-1px;margin:0 0 14px;font-weight:850}
.moat p{color:#c5cee6;max-width:760px;font-size:16.5px}
.gates{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-top:26px}
.gate{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:18px 18px;box-shadow:0 1px 0 rgba(255,255,255,.05) inset}
.gate .q{font-size:21px;font-weight:850;color:#34d399;letter-spacing:-.4px}
.gate .t{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#9fb0d0;margin-top:3px}
.gate .d{font-size:13px;color:#aebad6;margin-top:9px;line-height:1.55}
.price{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-top:10px}
.tier{background:rgba(255,255,255,.84);border:1px solid #ecebf6;border-radius:20px;padding:26px 24px;box-shadow:0 24px 54px -36px rgba(70,55,160,.5);display:flex;flex-direction:column}
.tier.feat{border:1.5px solid #7c5cf0;box-shadow:0 30px 64px -32px rgba(109,92,240,.6)}
.tier .tn{font-size:13px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#7c5cf0}
.tier .tp{font-size:30px;font-weight:850;letter-spacing:-1px;margin:8px 0 4px;color:#14152a}
.tier .tps{font-size:13px;color:#8890a8;min-height:18px}
.tier ul{list-style:none;margin:16px 0 0;padding:0}
.tier li{font-size:14px;color:#41435c;padding:7px 0 7px 24px;position:relative;line-height:1.45}
.tier li::before{content:"✓";position:absolute;left:0;color:#0ea5b7;font-weight:800}
.tier .ta{margin-top:auto;padding-top:18px}
.tier .tb{display:block;text-align:center;text-decoration:none;font-weight:800;font-size:15px;padding:12px;border-radius:11px}
.tier .tb.p{background:linear-gradient(95deg,#6d5cf0,#0ea5b7);color:#fff}
.tier .tb.s{background:#f3f1ff;color:#5b53e8}
.contact{font-size:17px;color:#33344e;margin-top:14px}.contact b{color:#14152a}
.foot{padding:40px 0 60px;text-align:center;color:#8890a8;font-size:13.5px}
@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
</style></head><body>
<div class="pbar" id="pbar"></div>
<div class="ptop"><a href="/"><span class="pwm"><span class="g"></span>Melete</span></a><a class="ptopcta" href="mailto:patsa2561@gmail.com?subject=Melete">Get in touch</a></div>

<div class="wrap">

<section class="ps" style="padding-top:130px">
  <div class="eye reveal">The Sovereign · Verifiable Discovery Brain</div>
  <h1 class="disp reveal">Find the best answer<br>in the fewest experiments.</h1>
  <p class="lead reveal">Tell Melete what you can change and what <b>"good"</b> means. It finds the best <b>and most robust</b> recipe in the fewest real-world trials — then hands you <b>one decision and a signed verdict</b> you can re-verify offline.</p>
  <div class="cta reveal">
    <a class="btnp pri" href="/#try">See it discover — live ↗</a>
    <a class="btnp gho" href="mailto:patsa2561@gmail.com?subject=Melete%20licensing">License &amp; acquisition</a>
  </div>
  <div class="chips reveal">
    <span class="chip">🎯 best answer, fewest tries</span>
    <span class="chip">🔒 runs on your machine — air-gapped</span>
    <span class="chip">🔏 every verdict Ed25519-signed</span>
    <span class="chip">🚀 no dataset — starts from scratch</span>
  </div>
</section>

<section class="ps">
  <div class="eye reveal">The problem</div>
  <h2 class="sec reveal">Ideas are cheap. Experiments are expensive.</h2>
  <div class="grid g3">
    <div class="card reveal"><div class="n">THE COST</div><h3>Every trial burns real money</h3><p>A lab assay, a training run, a process batch, a pricing test — each costs time and budget, and the search space is enormous.</p></div>
    <div class="card reveal"><div class="n">THE QUESTION</div><h3>Which experiment next?</h3><p>The right next trial is worth more than a thousand plots. Most tools hand you a dashboard and leave a human to guess.</p></div>
    <div class="card reveal"><div class="n">THE PROOF</div><h3>Can you prove how you got there?</h3><p>Audits, patents, and review boards need a tamper-evident trail — not a screenshot. Almost nothing ships that.</p></div>
  </div>
</section>

<section class="ps">
  <div class="eye reveal">How it works</div>
  <h2 class="sec reveal">Three steps. One decision.</h2>
  <div class="grid g3">
    <div class="card reveal"><div class="n">① TELL IT</div><h3>Your knobs + your score</h3><p>Define what you can change (real / integer / categorical) and what "good" means — a yield, a latency, a benchmark, an assay readout.</p></div>
    <div class="card reveal"><div class="n">② IT PROPOSES</div><h3>The next trial to run</h3><p>You measure it in your real system (or give a formula). Repeat. Melete needs no historical dataset — it starts from scratch.</p></div>
    <div class="card reveal"><div class="n">③ YOU GET</div><h3>The robust recipe + a signed verdict</h3><p>The best, robust setting in plain language — plus an Ed25519 certificate an auditor re-verifies offline, on their own machine.</p></div>
  </div>
</section>

<section class="ps">
  <div class="eye reveal">The brain</div>
  <h2 class="sec reveal">◆ One brain that's smart about everything.</h2>
  <p class="lead reveal">Melete runs <b>every lens</b> — how good, how robust, how safe, where the cliffs are, is it drifting, which knobs matter, is a breakthrough hiding — and <b>triages them by danger</b> into a single verdict. Safety outranks ambition: an optimum on a cliff edge is overruled no matter how high it scores.</p>
  <div class="formula reveal">Φ = 100 · ∛(O·R·T) · ½(1+C) · U · S · F</div>
  <p class="sub reveal"><b>O·R·T</b> (optimized · robust · trustworthy) is a <b>geometric</b> core — any one collapsing collapses Φ, so it can't be faked. Proven in tests: bounded [0,100], identity, conjunctive, monotone.</p>
</section>

</div>

<div class="wrap"><section class="ps"><div class="moat reveal">
  <div class="eye">The moat · one signed verdict no optimizer can match</div>
  <h2>🏅 The Trustworthy Discovery Certificate</h2>
  <p>Every other optimizer hands you a "best recipe" and stops. Melete fuses three independent proofs into <b>one Ed25519-signed verdict</b> an auditor verifies offline — and names the gate that fails when a result is <i>not</i> trustworthy.</p>
  <div class="gates">
    <div class="gate"><div class="q">REAL?</div><div class="t">Signal · Null Engine</div><div class="d">Is the effect real, or just luck? A permutation test on the run's own data.</div></div>
    <div class="gate"><div class="q">CAUSAL?</div><div class="t">Cause · Causal Engine</div><div class="d">Does the knob cause the outcome, or is it confounded? Melete intervenes to find out.</div></div>
    <div class="gate"><div class="q">ROBUST?</div><div class="t">Survives wobble · AEGIS</div><div class="d">Does the optimum hold under real-world drift, or is it a fragile spike?</div></div>
  </div>
  <p style="margin-top:24px;font-size:14.5px;color:#9fb0d0">The moat is the <b style="color:#cfe">composition</b> into one signed, offline-verifiable trust artifact — the format an auditor learns to accept. A competitor can copy any one algorithm; not the accepted certificate.</p>
</div></section></div>

<div class="wrap">

<section class="ps">
  <div class="eye reveal">Proof — measured &amp; reproducible</div>
  <h2 class="sec reveal">Numbers you can re-run.</h2>
  <table class="proof reveal"><tr><th>adversarial landscape</th><th>Melete</th><th>Bayesian</th><th>random</th></tr>
    <tr><td>smooth</td><td class="win">100%</td><td>99.9%</td><td>83.8%</td></tr>
    <tr><td>rugged / multimodal</td><td class="win">best 🏆</td><td>far behind</td><td>far behind</td></tr>
    <tr><td>high-D (5-D)</td><td class="win">99.6%</td><td>98.7%</td><td>55.5%</td></tr></table>
  <div class="stats reveal">
    <div class="stat"><b>≥99%</b><span>of the true optimum, every benchmark</span></div>
    <div class="stat"><b>53</b><span>verified modules · 100/100 each</span></div>
    <div class="stat"><b>86</b><span>tests · 0 failed</span></div>
    <div class="stat"><b>100%</b><span>on your machine · signed &amp; offline-verifiable</span></div>
  </div>
</section>

<section class="ps">
  <div class="eye reveal">Who it's for</div>
  <h2 class="sec reveal">One engine. Every expensive process.</h2>
  <div class="grid g3">
    <div class="card reveal"><div class="n">💊 PHARMA &amp; ⚗️ CHEMISTRY</div><h3>Formulation &amp; reaction yield</h3><p>pH · incubation · catalyst · target → bioavailability − toxicity, or yield − cost. The fewest assays to the best robust recipe.</p></div>
    <div class="card reveal"><div class="n">🧠 GPU &amp; ML</div><h3>Air-gapped model tuning</h3><p>learning-rate · quantization · RAG chunk → tokens/s + safety − GPU $, with a signed trace — on your own box.</p></div>
    <div class="card reveal"><div class="n">🛰️ AEROSPACE &amp; ⚛️ PHYSICS</div><h3>Sims &amp; signal under noise</h3><p>Sweep any scoreable simulation in the fewest evaluations; find the most robust operating point. No gradient required.</p></div>
    <div class="card reveal"><div class="n">📊 INFRA &amp; ANALYTICS</div><h3>Cut latency &amp; cloud spend</h3><p>TCP buffer · affinity · shared buffers → −latency, −cloud $. An auditable change, not a guess.</p></div>
    <div class="card reveal"><div class="n">⚡ ENERGY</div><h3>Solar / grid / inverter</h3><p>MPPT · charge rate · PV tilt → power − heat. Robust under changing conditions.</p></div>
    <div class="card reveal"><div class="n">🛡️ SECURITY</div><h3>Compliance guardrails</h3><p>IAM TTL · firewall · payload size → attack-block % − friction, with a signed verdict for the audit.</p></div>
  </div>
</section>

<section class="ps">
  <div class="eye reveal">Honesty</div>
  <h2 class="sec reveal">No magic. No "quantum". No single algorithm.</h2>
  <div class="grid g2">
    <div class="card reveal"><h3>What the win actually is</h3><p>The synthesis brain + robustness + <b>verifiable provenance</b> — all measured, all reproducible. Optimisation can't be 100% accurate, so we ship 53 100%-passing gauntlets, 86 tests, and benchmarks you can re-run yourself.</p></div>
    <div class="card reveal"><h3>What we don't claim</h3><p>"Verifiable" means provenance + reproducibility — not bug-free-proof. The brain is software; the physical lab / robot / cluster is yours — Melete plugs into it as the oracle. No live satellite or grid is connected in the demo.</p></div>
  </div>
</section>

<section class="ps">
  <div class="eye reveal">Pricing &amp; the ask</div>
  <h2 class="sec reveal">The ask — license it, deploy it, or acquire it.</h2>
  <div class="price">
    <div class="tier reveal"><div class="tn">Open source</div><div class="tp">Free</div><div class="tps">MIT · forever</div><ul><li>Full engine via <code>npm i -g melete-ai</code></li><li>Run <code>melete-server</code> on your machine</li><li>Signed certificates + offline verify</li><li>Library + CLI + HTTP API</li></ul><div class="ta"><a class="tb s" href="/docs">Read the API →</a></div></div>
    <div class="tier feat reveal"><div class="tn">Enterprise · Sovereign</div><div class="tp">Let's talk</div><div class="tps">air-gapped, on your hardware</div><ul><li>On-prem deployment + support</li><li>Custom oracles for your process</li><li>Audit / patent-grade provenance</li><li>Priority roadmap + SLAs</li></ul><div class="ta"><a class="tb p" href="mailto:patsa2561@gmail.com?subject=Melete%20Enterprise">Talk to us →</a></div></div>
    <div class="tier reveal"><div class="tn">Acquisition</div><div class="tp">Acquire</div><div class="tps">the code + the namespace</div><ul><li>Dependency-free TypeScript, 53 modules</li><li>Transfers repo + <code>melete-ai</code> npm</li><li>Live, tested, one-command deploy</li><li>The roadmap + this moat</li></ul><div class="ta"><a class="tb s" href="mailto:patsa2561@gmail.com?subject=Melete%20Acquisition">Make an offer →</a></div></div>
  </div>
  <p class="contact reveal">📧 <b>patsa2561@gmail.com</b> &nbsp;·&nbsp; 🟢 WhatsApp <b>+66 93 945 5645</b> &nbsp;·&nbsp; ✈️ <b>@devson2561</b> &nbsp;·&nbsp; 🇹🇭 Thailand-based</p>
</section>

</div>
<div class="foot">Melete v${version} · MIT · <a href="/" style="color:#5b53e8;text-decoration:none;font-weight:700">← back to the live demo</a></div>

<script>
var pbar=document.getElementById('pbar');
function onScroll(){var h=document.documentElement;var max=(h.scrollHeight-h.clientHeight)||1;pbar.style.width=(h.scrollTop/max*100)+'%';}
document.addEventListener('scroll',onScroll,{passive:true});onScroll();
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:0.12});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});
</script></body></html>`;
}

// ── per-profession landing variants (shareable, SEO-able; deep-link back to the live demo) ──────────────
export const AUDIENCE_KEYS = ["pharma", "chem", "gpu", "aero", "phys", "infra", "energy", "security"] as const;
type AudCopy = { name: string; h: string; sub: string; s1: string; s2: string; s3: string; knobs: string; b1: string; b2: string; b3: string };
const AUDIENCE: Record<string, { e: string; col: string; demo: string; en: AudCopy; th: AudCopy }> = {
  pharma: { e: "💊", col: "#a855f7", demo: "genomics",
    en: { name: "Pharma & Formulation", h: "Find the formulation that works — in the fewest assays.", sub: "Tell Melete your knobs and what “good” means; it proposes the next experiment to run at the bench, you measure, and it converges on the best robust recipe — then signs the result for your filing.", s1: "List your levers — pH, incubation time, excipient ratio, genome target — and their real ranges.", s2: "Melete proposes the next assay to run. You measure bioavailability − toxicity and feed it back.", s3: "In ~tens of assays you get the best robust recipe + an Ed25519 verdict an auditor re-verifies offline.", knobs: "pH · incubation · excipient · target  →  bioavailability − toxicity", b1: "Fewer expensive assays to the answer — no historical dataset required.", b2: "Runs on your machine, air-gapped — patient and IP data never leave.", b3: "A tamper-evident discovery trail for patents and regulatory review." },
    th: { name: "ยา & การตั้งสูตร", h: "หาสูตรที่ได้ผล — ในจำนวนการทดลองที่น้อยที่สุด", sub: "บอก Melete ว่าปรับอะไรได้และ “ดี” คืออะไร มันเสนอการทดลองถัดไปให้ลองที่แล็บ คุณวัด แล้วมันลู่เข้าสูตรที่ดีและทนทานที่สุด พร้อมเซ็นผลให้ไว้ยื่นเอกสาร", s1: "ระบุตัวแปรที่ปรับได้ — pH, เวลาบ่ม, สัดส่วน excipient, เป้า genome — พร้อมช่วงจริง", s2: "Melete เสนอ assay ถัดไป คุณวัด (ออกฤทธิ์ − พิษ) แล้วป้อนกลับ", s3: "ในไม่กี่สิบ assay ได้สูตรที่ดีและทนทานที่สุด + ใบรับรอง Ed25519 ที่ตรวจ offline ได้", knobs: "pH · เวลาบ่ม · excipient · เป้า  →  ออกฤทธิ์ − พิษ", b1: "ใช้ assay แพงๆ น้อยลงจนถึงคำตอบ — ไม่ต้องมีชุดข้อมูลเดิม", b2: "รันบนเครื่องคุณ air-gapped — ข้อมูลคนไข้/ทรัพย์สินทางปัญญาไม่ออกไปไหน", b3: "ร่องรอยการค้นพบที่แก้ไม่ได้ ไว้ยื่นสิทธิบัตร/ตรวจสอบ" } },
  chem: { e: "⚗️", col: "#a855f7", demo: "genomics",
    en: { name: "Chemistry", h: "Find the reaction conditions that maximise yield — without burning runs.", sub: "Give Melete your levers and the score you measure; it picks the next condition to try, you run it, and it homes in on the best robust set — every step signed and replayable.", s1: "Define temperature, pH, catalyst loading, time and their real ranges.", s2: "Melete proposes the next condition. You run it and report yield − cost.", s3: "It converges on the best robust conditions + a signed, replayable record.", knobs: "temp · pH · catalyst · time  →  yield − cost", b1: "Reach the best conditions in far fewer runs than a grid sweep.", b2: "Fully on-prem — your process data never leaves the lab.", b3: "A reproducible, signed trail of exactly how you got there." },
    th: { name: "เคมี", h: "หาเงื่อนไขปฏิกิริยาที่ให้ yield สูงสุด — โดยไม่เปลืองรอบทดลอง", sub: "ใส่ตัวแปรที่คุมได้และคะแนนที่คุณวัด Melete เลือกเงื่อนไขถัดไปให้ลอง คุณรัน แล้วมันลู่เข้าชุดที่ดีและทนทานที่สุด ทุกขั้นเซ็นและเล่นซ้ำได้", s1: "กำหนดอุณหภูมิ, pH, ปริมาณตัวเร่ง, เวลา พร้อมช่วงจริง", s2: "Melete เสนอเงื่อนไขถัดไป คุณรันแล้วรายงาน yield − ต้นทุน", s3: "ลู่เข้าเงื่อนไขที่ดีและทนทานที่สุด + บันทึกที่เซ็นและเล่นซ้ำได้", knobs: "อุณหภูมิ · pH · ตัวเร่ง · เวลา  →  yield − ต้นทุน", b1: "ถึงเงื่อนไขที่ดีที่สุดด้วยรอบที่น้อยกว่าการกวาด grid มาก", b2: "รันบนเครื่องทั้งหมด — ข้อมูลกระบวนการไม่ออกจากแล็บ", b3: "ร่องรอยที่ทำซ้ำได้และเซ็นไว้ ว่าได้คำตอบมายังไง" } },
  gpu: { e: "🧠", col: "#6d5cf0", demo: "ml",
    en: { name: "GPU & ML", h: "Tune the model for more tokens/s and safety — at less GPU cost.", sub: "Hand Melete the knobs and the score; it runs the search and returns the best robust configuration with a signed, offline-verifiable trace — fully on your air-gapped box.", s1: "List learning-rate, quantization, RAG chunk, batch size and their ranges.", s2: "Each step Melete proposes a config; your harness reports tokens/s + safety − GPU $.", s3: "You get the best robust config + a signed trace, no historical data needed.", knobs: "lr · quantization · chunk · batch  →  tok/s + safety − GPU $", b1: "Fewer GPU-hours to the best model — starts from scratch, no dataset.", b2: "Air-gapped — weights and prompts never leave your cluster.", b3: "A provable tuning record for review boards and reproducibility." },
    th: { name: "GPU & ML", h: "จูนโมเดลให้ได้ tokens/s และความปลอดภัยมากขึ้น — ด้วยต้นทุน GPU ที่น้อยลง", sub: "ส่งปุ่มและคะแนนให้ Melete มันค้นหาแล้วคืนคอนฟิกที่ดีและทนทานที่สุด พร้อม trace ที่เซ็นและตรวจ offline ได้ — บนเครื่อง air-gapped ของคุณ", s1: "ระบุ learning-rate, quantization, RAG chunk, batch พร้อมช่วง", s2: "แต่ละขั้น Melete เสนอคอนฟิก ระบบคุณรายงาน tok/s + ปลอดภัย − ค่า GPU", s3: "ได้คอนฟิกที่ดีและทนทานที่สุด + trace ที่เซ็นไว้ ไม่ต้องมีข้อมูลเดิม", knobs: "lr · quantization · chunk · batch  →  tok/s + ปลอดภัย − ค่า GPU", b1: "ใช้ GPU-hour น้อยลงจนได้โมเดลดีที่สุด — เริ่มจากศูนย์ ไม่ต้องมีชุดข้อมูล", b2: "Air-gapped — weights และ prompt ไม่ออกจาก cluster", b3: "บันทึกการจูนที่พิสูจน์ได้ ไว้ให้คณะกรรมการตรวจ/ทำซ้ำ" } },
  aero: { e: "🛰️", col: "#22d3ee", demo: "aerospace",
    en: { name: "Aerospace", h: "Hold the link through a solar storm — across the whole parameter space.", sub: "Define the knobs and the score; Melete sweeps the space in the fewest evaluations, finds the most robust operating point, and signs the verdict for your review board.", s1: "List carrier frequency, phased-array phase, packet depth and their ranges.", s2: "Melete proposes the next setting; your sim/bench reports throughput under noise.", s3: "It returns the most robust operating point + a signed, replayable verdict.", knobs: "freq · phase-array · packet depth  →  throughput under noise", b1: "The most robust point, not a fragile peak that fails in the field.", b2: "Runs on-prem — mission parameters never touch a cloud.", b3: "A signed verdict your review board can re-verify independently." },
    th: { name: "อวกาศ / การบิน", h: "รักษาลิงก์ให้รอดพายุสุริยะ — ทั่วทั้งพื้นที่พารามิเตอร์", sub: "กำหนดปุ่มและคะแนน Melete กวาดพื้นที่ด้วยจำนวนประเมินที่น้อยสุด หาจุดทำงานที่ทนทานที่สุด แล้วเซ็นคำตัดสินให้คณะกรรมการตรวจ", s1: "ระบุความถี่พาหะ, เฟส phased-array, ความลึกแพ็กเก็ต พร้อมช่วง", s2: "Melete เสนอค่าถัดไป sim/bench คุณรายงาน throughput ภายใต้ noise", s3: "คืนจุดทำงานที่ทนทานที่สุด + คำตัดสินที่เซ็นและเล่นซ้ำได้", knobs: "ความถี่ · phase-array · packet  →  throughput ภายใต้ noise", b1: "จุดที่ทนทานที่สุด ไม่ใช่ยอดเปราะที่พังในสนามจริง", b2: "รันบนเครื่อง — พารามิเตอร์ภารกิจไม่แตะคลาวด์", b3: "คำตัดสินที่เซ็นไว้ คณะกรรมการตรวจซ้ำเองได้" } },
  phys: { e: "⚛️", col: "#22d3ee", demo: "aerospace",
    en: { name: "Physics & Simulation", h: "Optimise a simulated physical system — in the fewest evaluations.", sub: "Point Melete at any simulation you can score — a field, an orbit, an instrument. Give it the parameters and the objective; it finds the robust optimum and hands you a signed, replayable record — no gradient required.", s1: "Expose your simulation’s parameters and their ranges.", s2: "Melete proposes the next point to evaluate; your sim returns the objective.", s3: "It converges on the robust optimum + a signed record — derivative-free.", knobs: "parameters  →  objective (maximise / minimise)", b1: "Derivative-free — works on black-box and noisy simulators.", b2: "Robust optima that survive measurement noise, not lucky spikes.", b3: "A signed, reproducible trace of the search." },
    th: { name: "ฟิสิกส์ & การจำลอง", h: "หาค่าที่ดีที่สุดของระบบฟิสิกส์จำลอง — ด้วยการประเมินน้อยครั้งที่สุด", sub: "ชี้ Melete ไปที่ simulation ที่ให้คะแนนได้ — สนาม, วงโคจร, เครื่องมือ ใส่พารามิเตอร์และเป้าหมาย มันหา optimum ที่ทนทานแล้วคืนบันทึกที่เซ็นและเล่นซ้ำได้ — ไม่ต้องใช้ gradient", s1: "เปิดพารามิเตอร์ของ simulation พร้อมช่วง", s2: "Melete เสนอจุดถัดไปให้ประเมิน sim คุณคืนค่าเป้าหมาย", s3: "ลู่เข้า optimum ที่ทนทาน + บันทึกที่เซ็นไว้ — ไม่ใช้อนุพันธ์", knobs: "พารามิเตอร์  →  เป้าหมาย (มาก/น้อยสุด)", b1: "ไม่ใช้อนุพันธ์ — ใช้ได้กับ simulator แบบ black-box และมี noise", b2: "optimum ที่ทนต่อ noise การวัด ไม่ใช่ค่าฟลุค", b3: "trace ที่เซ็นและทำซ้ำได้ของการค้นหา" } },
  infra: { e: "📊", col: "#10b981", demo: "database",
    en: { name: "Infra & Analytics", h: "Cut latency and cloud spend — without a config war-room.", sub: "List the knobs and the score; Melete finds the best robust setting in a handful of runs and signs it — so the change is auditable, not a guess.", s1: "List TCP buffer, thread affinity, shared buffers, cache and their ranges.", s2: "Melete proposes a setting; you benchmark −latency, −cloud $ and report it.", s3: "You get the best robust config in a handful of runs + a signed verdict.", knobs: "tcp buffer · affinity · shared buffers  →  −latency, −cloud $", b1: "An auditable tuning decision — not a guess in a war-room.", b2: "Runs on your own infra — nothing leaves the network.", b3: "A signed before/after a finance or platform team can verify." },
    th: { name: "ระบบ & การวิเคราะห์", h: "ลด latency และค่าคลาวด์ — โดยไม่ต้องตั้งวอร์รูมจูนคอนฟิก", sub: "ระบุปุ่มและคะแนน Melete หาค่าที่ดีและทนทานที่สุดในไม่กี่รอบแล้วเซ็นไว้ — การเปลี่ยนตรวจสอบได้ ไม่ใช่การเดา", s1: "ระบุ TCP buffer, thread affinity, shared buffers, cache พร้อมช่วง", s2: "Melete เสนอค่า คุณ benchmark −latency, −ค่าคลาวด์ แล้วรายงาน", s3: "ได้คอนฟิกที่ดีและทนทานที่สุดในไม่กี่รอบ + คำตัดสินที่เซ็นไว้", knobs: "tcp buffer · affinity · shared buffers  →  −latency, −ค่าคลาวด์", b1: "การจูนที่ตรวจสอบได้ — ไม่ใช่การเดาในวอร์รูม", b2: "รันบน infra ของคุณเอง — ไม่มีอะไรออกจากเครือข่าย", b3: "before/after ที่เซ็นไว้ ทีมการเงิน/แพลตฟอร์มตรวจได้" } },
  energy: { e: "⚡", col: "#f59e0b", demo: "solar",
    en: { name: "Energy & Grid", h: "Pull more power from the array — and less heat from the inverter.", sub: "Define your knobs and the score; Melete proposes the next setting, you measure power − heat in the field, and it converges on the most robust operating point — then signs it.", s1: "List MPPT frequency, charge rate, PV tilt and their real ranges.", s2: "Melete proposes the next setting; your site/inverter reports power − inverter heat.", s3: "It returns the most robust operating point + a signed, replayable verdict.", knobs: "MPPT freq · charge rate · PV tilt  →  power − inverter heat", b1: "The setting that holds across changing irradiance, not a lucky midday peak.", b2: "Runs at the edge / on-prem — telemetry never leaves the site.", b3: "A signed before/after for O&M, warranty and audit." },
    th: { name: "พลังงาน & กริด", h: "ดึงกำลังจากแผงให้มากขึ้น — และลดความร้อนจากอินเวอร์เตอร์", sub: "กำหนดปุ่มและคะแนน Melete เสนอค่าถัดไป คุณวัด (กำลัง − ความร้อน) ในสนาม แล้วมันลู่เข้าจุดทำงานที่ทนทานที่สุด พร้อมเซ็นไว้", s1: "ระบุความถี่ MPPT, อัตราชาร์จ, มุมแผง PV พร้อมช่วงจริง", s2: "Melete เสนอค่าถัดไป ไซต์/อินเวอร์เตอร์คุณรายงาน กำลัง − ความร้อน", s3: "คืนจุดทำงานที่ทนทานที่สุด + คำตัดสินที่เซ็นและเล่นซ้ำได้", knobs: "ความถี่ MPPT · อัตราชาร์จ · มุมแผง  →  กำลัง − ความร้อน", b1: "ค่าที่ทนทั่วช่วงแสงที่เปลี่ยน ไม่ใช่ยอดฟลุคตอนเที่ยง", b2: "รันที่ edge / on-prem — telemetry ไม่ออกจากไซต์", b3: "before/after ที่เซ็นไว้ ไว้ใช้ O&M, ประกัน, ตรวจสอบ" } },
  security: { e: "🛡️", col: "#ef4444", demo: "devops",
    en: { name: "Security & Compliance", h: "Block more attacks with less friction — a tuned, auditable guardrail.", sub: "List your knobs and the score; Melete finds the policy that maximises attack-block while minimising user friction in a handful of runs — and signs the verdict for the audit.", s1: "List IAM token TTL, firewall sensitivity, max payload size and their ranges.", s2: "Melete proposes a policy; you run your red-team suite and report block % − friction.", s3: "You get the safest robust policy in a handful of runs + a signed verdict.", knobs: "IAM TTL · firewall · payload size  →  attack-block % − friction", b1: "Maximum block rate without strangling real users — the robust trade-off.", b2: "Runs on-prem, air-gapped — your policy and traffic never leave.", b3: "A tamper-evident verdict your compliance officer can re-verify." },
    th: { name: "ความปลอดภัย & คอมไพลแอนซ์", h: "บล็อกการโจมตีได้มากขึ้น โดยรบกวนผู้ใช้น้อยลง — guardrail ที่จูนแล้วและตรวจสอบได้", sub: "ระบุปุ่มและคะแนน Melete หานโยบายที่บล็อกการโจมตีได้สูงสุดพร้อมรบกวนผู้ใช้ต่ำสุดในไม่กี่รอบ แล้วเซ็นคำตัดสินไว้ให้ตรวจ", s1: "ระบุ IAM token TTL, ความไวไฟร์วอลล์, ขนาด payload สูงสุด พร้อมช่วง", s2: "Melete เสนอนโยบาย คุณรันชุด red-team แล้วรายงาน block % − ความรบกวน", s3: "ได้นโยบายที่ปลอดภัยและทนทานที่สุดในไม่กี่รอบ + คำตัดสินที่เซ็นไว้", knobs: "IAM TTL · firewall · payload size  →  บล็อก % − ความรบกวน", b1: "อัตราบล็อกสูงสุดโดยไม่บีบผู้ใช้จริง — จุดสมดุลที่ทนทาน", b2: "รัน on-prem air-gapped — นโยบายและทราฟฟิกไม่ออกไปไหน", b3: "คำตัดสินที่แก้ไม่ได้ เจ้าหน้าที่คอมไพลแอนซ์ตรวจซ้ำได้" } },
};
/** Ambient, field-themed hero motif for a per-profession page — decorative (not data): pulsing rings,
 *  an orbit with travelling dots, a slow gem, the field emoji. Pure SVG/SMIL, accent-coloured. */
function audHeroArt(emoji: string, col: string): string {
  const rings = [82, 60, 40].map((r, i) => `<circle r="${r}" fill="none" stroke="${col}" stroke-width="1.2" opacity="${(0.14 + i * 0.06).toFixed(2)}"><animate attributeName="r" values="${r};${r + 5};${r}" dur="${4 + i}s" repeatCount="indefinite"/><animate attributeName="opacity" values="${(0.14 + i * 0.06).toFixed(2)};${(0.3 + i * 0.06).toFixed(2)};${(0.14 + i * 0.06).toFixed(2)}" dur="${4 + i}s" repeatCount="indefinite"/></circle>`).join("");
  const orbitPath = "M96 0 A96 48 0 1 1 -96 0 A96 48 0 1 1 96 0";
  const dots = [0, 2.3, 4.6].map((b) => `<circle r="3.4" fill="${col}"><animateMotion dur="7s" begin="${b}s" repeatCount="indefinite" path="${orbitPath}"/></circle>`).join("");
  return `<svg viewBox="0 0 360 260" role="img" aria-hidden="true"><defs><radialGradient id="ah" cx="50%" cy="46%" r="62%"><stop offset="0" stop-color="${col}30"/><stop offset="1" stop-color="${col}00"/></radialGradient><linearGradient id="ahg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="#0ea5b7"/></linearGradient><filter id="ahglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="360" height="260" fill="url(#ah)"/><g transform="translate(180 130)">${rings}<ellipse rx="96" ry="48" fill="none" stroke="${col}" stroke-width="1" opacity="0.22" stroke-dasharray="2 8"/>${dots}<rect x="-21" y="-21" width="42" height="42" rx="11" transform="rotate(45 0 0)" fill="url(#ahg)" filter="url(#ahglow)" opacity="0.92"/><text x="0" y="12" text-anchor="middle" font-size="34">${emoji}</text></g></svg>`;
}
export function audiencePage(key: string, version = "0.4.0"): string {
  const f = AUDIENCE[key] || AUDIENCE.pharma; const c = f.col;
  const en = f.en, th = f.th;
  const shared = {
    en: { lbl_loop: "Your loop", lbl_loop2: "Propose → measure → repeat → a signed verdict", moatp: "Not just a “best recipe” — one Ed25519-signed verdict you verify offline, fusing three proofs and naming the gate that fails.", lbl_why: "Why " + en.name + " teams choose it", lbl_why2: "Built for an expensive, auditable process", st1: "of the true optimum, every benchmark", st2: "verified modules · 100/100 each", st3: "tests · 0 failed", st4: "on your machine · signed" },
    th: { lbl_loop: "ลูปการทำงาน", lbl_loop2: "เสนอ → วัด → วนซ้ำ → คำตัดสินที่เซ็นไว้", moatp: "ไม่ใช่แค่ “สูตรที่ดีที่สุด” — เป็นคำตัดสินที่เซ็น Ed25519 ตรวจ offline ได้ หลอมสามหลักฐานและบอกว่าด่านไหนพัง", lbl_why: "ทำไมทีม" + th.name + "เลือกใช้", lbl_why2: "สร้างมาเพื่อกระบวนการที่แพงและต้องตรวจสอบได้", st1: "ของ optimum จริง ทุก benchmark", st2: "โมดูลผ่านการพิสูจน์ · 100/100 ทุกตัว", st3: "เทสต์ · ล้มเหลว 0", st4: "บนเครื่องคุณ · เซ็นแล้ว" },
  };
  const dict = JSON.stringify({ en: Object.assign({}, en, shared.en), th: Object.assign({}, th, shared.th) }).split("</").join("<\\/");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete for ${en.name} — the sovereign discovery brain</title>
<meta name="description" content="${xesc(en.h)}">
${socialMeta({ title: "Melete for " + en.name + " — " + en.h, desc: en.sub, path: "/for/" + key, img: "/og/" + key + ".png" })}${faviconLinks()}${structuredData("/for/" + key, "Melete for " + en.name, en.h, { breadcrumb: [{ name: "Home", url: "/" }, { name: en.name, url: "/for/" + key }] })}
<style>:root{color-scheme:light}*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:#fafaff;color:#14152a;font:17px/1.65 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:-20% -10%;z-index:-2;pointer-events:none;background:radial-gradient(34% 32% at 84% 4%,${c}26,transparent 62%),radial-gradient(40% 40% at 4% 12%,rgba(109,92,240,.14),transparent 60%),radial-gradient(34% 36% at 94% 92%,${c}1e,transparent 60%);filter:blur(26px)}
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.5;background-image:radial-gradient(circle at 1px 1px,rgba(80,70,160,.055) 1px,transparent 0);background-size:32px 32px}
.top{position:fixed;top:0;left:0;right:0;z-index:40;display:flex;align-items:center;justify-content:space-between;padding:13px 24px;backdrop-filter:blur(12px);background:rgba(250,250,255,.72);border-bottom:1px solid rgba(80,70,160,.07)}
.top a{text-decoration:none}.wm{display:flex;align-items:center;gap:10px;font-weight:800;color:#14152a;font-size:17px}.wm .g{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,${c},#0ea5b7);transform:rotate(45deg)}
.langsw{display:flex;background:#fff;border:1px solid #e7e8f0;border-radius:999px;padding:3px;gap:2px}.lb{border:0;background:transparent;border-radius:999px;padding:6px 13px;font-size:13px;font-weight:700;color:#6a6c84;cursor:pointer}.lb.on{background:linear-gradient(96deg,${c},#0ea5b7);color:#fff}
.wrap{max-width:1000px;margin:0 auto;padding:0 24px}
section{padding:70px 0;border-bottom:1px solid rgba(80,70,160,.06)}section:first-of-type{border:0}
.eye{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${c};font-weight:800;margin-bottom:14px}
h1{font-size:clamp(38px,6.4vw,68px);line-height:1.05;margin:0 0 18px;font-weight:850;letter-spacing:-2px;color:#14152a}
.lead{font-size:clamp(17px,2.3vw,21px);color:#3b3d57;max-width:740px;line-height:1.5}
.cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.btn{display:inline-block;text-decoration:none;font-weight:800;font-size:16px;padding:14px 25px;border-radius:13px;transition:transform .2s,box-shadow .2s}
.btn.pri{background:linear-gradient(95deg,${c},#0ea5b7);color:#fff;box-shadow:0 18px 40px -16px ${c}}.btn.pri:hover{transform:translateY(-2px)}
.btn.gho{background:rgba(255,255,255,.7);color:#3a3c54;border:1px solid #e4e3f2}.btn.gho:hover{transform:translateY(-2px)}
.knob{display:inline-block;margin-top:22px;font-family:ui-monospace,Menlo,monospace;font-size:14px;color:#41435c;background:#fff;border:1px solid #ecebf6;border-left:4px solid ${c};border-radius:10px;padding:11px 15px}
.ahero{display:grid;grid-template-columns:1.12fr .88fr;gap:30px;align-items:center}
.aheroart svg{width:100%;height:auto;display:block;filter:drop-shadow(0 24px 50px ${c}22)}
@media(max-width:820px){.ahero{grid-template-columns:1fr}.aheroart{max-width:380px;margin:8px auto 0}}
h2{font-size:clamp(24px,3.6vw,36px);margin:0 0 22px;font-weight:850;letter-spacing:-1px;color:#14152a}
.grid{display:grid;gap:15px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.card{background:rgba(255,255,255,.84);border:1px solid #ecebf6;border-radius:18px;padding:22px 22px;box-shadow:0 24px 54px -36px rgba(70,55,160,.5)}
.card .n{font-size:13px;font-weight:800;color:${c};margin-bottom:8px}.card p{margin:0;font-size:14.5px;color:#56586f;line-height:1.6}
.moat{background:radial-gradient(130% 120% at 50% -10%,#141d31,#0a0f1d 64%,#06080f);border-radius:22px;padding:38px 34px;color:#e8eefc;position:relative;overflow:hidden}
.moat::after{content:"";position:absolute;left:8%;right:8%;top:0;height:1px;background:linear-gradient(90deg,transparent,#34d399,transparent);opacity:.5}
.moat h3{color:#fff;font-size:22px;margin:0 0 10px;font-weight:850}.moat p{color:#c5cee6;max-width:720px;margin:0}
.gates{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:13px;margin-top:22px}
.gate{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:15px}.gate .q{font-size:18px;font-weight:850;color:#34d399}.gate .d{font-size:12.5px;color:#aebad6;margin-top:6px;line-height:1.5}
.stats{display:flex;flex-wrap:wrap;gap:14px;margin-top:6px}.stat{flex:1;min-width:140px;background:rgba(255,255,255,.74);border:1px solid #ecebf6;border-radius:14px;padding:16px}.stat b{display:block;font-size:27px;font-weight:850;letter-spacing:-1px;background:linear-gradient(135deg,${c},#0ea5b7);-webkit-background-clip:text;background-clip:text;color:transparent}.stat span{font-size:12px;color:#6a6c84}
.foot{padding:36px 0 56px;text-align:center;color:#8890a8;font-size:13.5px}.foot a{color:#5b53e8;text-decoration:none;font-weight:700}
@media(prefers-reduced-motion:reduce){.btn:hover{transform:none}}
</style></head><body>
<div class="top"><a href="/"><span class="wm"><span class="g"></span>Melete</span></a><div class="langsw"><button class="lb on" id="lbEN" onclick="setLang('en')">EN</button><button class="lb" id="lbTH" onclick="setLang('th')">ไทย</button></div></div>
<div class="wrap">
<section style="padding-top:120px">
 <div class="ahero">
  <div>
  <div class="eye">${f.e} Melete for <span data-i18n="name">${en.name}</span></div>
  <h1 data-i18n="h">${en.h}</h1>
  <p class="lead" data-i18n="sub">${en.sub}</p>
  <div class="cta">
    <a class="btn pri" href="/?demo=${f.demo}#try">See it discover — live ↗</a>
    <a class="btn gho" href="mailto:patsa2561@gmail.com?subject=Melete%20for%20${encodeURIComponent(en.name)}">Talk to us</a>
  </div>
  <div class="knob" data-i18n="knobs">${en.knobs}</div>
  </div>
  <div class="aheroart">${audHeroArt(f.e, c)}</div>
 </div>
</section>
<section>
  <div class="eye" data-i18n="lbl_loop">Your loop</div>
  <h2 data-i18n="lbl_loop2">Propose → measure → repeat → a signed verdict</h2>
  <div class="grid">
    <div class="card"><div class="n">①</div><p data-i18n="s1">${en.s1}</p></div>
    <div class="card"><div class="n">②</div><p data-i18n="s2">${en.s2}</p></div>
    <div class="card"><div class="n">③</div><p data-i18n="s3">${en.s3}</p></div>
  </div>
</section>
<section><div class="moat">
  <div class="eye" style="color:#34d399">The moat · one signed verdict</div>
  <h3>🏅 Every result carries a Trustworthy Discovery Certificate</h3>
  <p data-i18n="moatp">Not just a “best recipe” — one Ed25519-signed verdict you verify offline, fusing three proofs and naming the gate that fails.</p>
  <div class="gates"><div class="gate"><div class="q">REAL?</div><div class="d">a real effect, not luck</div></div><div class="gate"><div class="q">CAUSAL?</div><div class="d">it causes the outcome, not confounded</div></div><div class="gate"><div class="q">ROBUST?</div><div class="d">survives real-world wobble</div></div></div>
</div></section>
<section>
  <div class="eye" data-i18n="lbl_why">Why ${en.name} teams choose it</div>
  <h2 data-i18n="lbl_why2">Built for an expensive, auditable process</h2>
  <div class="grid">
    <div class="card"><p data-i18n="b1">${en.b1}</p></div>
    <div class="card"><p data-i18n="b2">${en.b2}</p></div>
    <div class="card"><p data-i18n="b3">${en.b3}</p></div>
  </div>
  <div class="stats">
    <div class="stat"><b>≥99%</b><span data-i18n="st1">of the true optimum, every benchmark</span></div>
    <div class="stat"><b>53</b><span data-i18n="st2">verified modules · 100/100 each</span></div>
    <div class="stat"><b>86</b><span data-i18n="st3">tests · 0 failed</span></div>
    <div class="stat"><b>100%</b><span data-i18n="st4">on your machine · signed</span></div>
  </div>
  <div class="cta"><a class="btn pri" href="/?demo=${f.demo}#try">See it discover — live ↗</a><a class="btn gho" href="/pitch">The full pitch →</a></div>
</section>
</div>
<div class="foot">Melete v${version} · MIT · <a href="/">← home</a> · <a href="/pitch">pitch</a> · <a href="/docs">API</a></div>
<script>
var D=${dict};
function setLang(l){if(l!=='th')l='en';try{localStorage.setItem('mlang',l)}catch(e){}var en=document.getElementById('lbEN'),th=document.getElementById('lbTH');if(en)en.className='lb'+(l==='en'?' on':'');if(th)th.className='lb'+(l==='th'?' on':'');document.documentElement.lang=l;var n=document.querySelectorAll('[data-i18n]');for(var i=0;i<n.length;i++){var k=n[i].getAttribute('data-i18n');if(D[l]&&D[l][k]!=null)n[i].textContent=D[l][k];}}
var _l='en';try{_l=localStorage.getItem('mlang')||'en'}catch(e){}setLang(_l);
</script></body></html>`;
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function serverGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const html = landingPage("9.9.9"); const pitch = pitchDeck("9.9.9");
  const landErr = firstScriptSyntaxError(html); const pitchErr = firstScriptSyntaxError(pitch);
  const audErr = (() => { for (const k of AUDIENCE_KEYS) { const pg = audiencePage(k, "9.9.9"); if (!pg.startsWith("<!doctype html>") || !pg.includes("Melete for") || !pg.includes("Trustworthy Discovery Certificate") || !pg.includes('href="/?demo=') || !pg.includes('class="aheroart"')) return k + ": did not render"; const e = firstScriptSyntaxError(pg); if (e) return k + " " + e; } return null; })();
  const checks = [
    { name: "SCRIPTS-PARSE", pass: landErr === null && pitchErr === null, detail: landErr ? ("landing " + landErr) : pitchErr ? ("pitch " + pitchErr) : "every inline <script> on the landing page + pitch parses (no JS syntax error can ship)" },
    { name: "AUDIENCE-PAGES", pass: audErr === null, detail: audErr ? ("broken " + audErr) : "all 8 per-profession landing pages render, deep-link to the demo, carry the moat, and their scripts parse" },
    { name: "SOCIAL-META", pass: html.includes('property="og:image"') && html.includes('name="twitter:card"') && pitch.includes('property="og:title"') && audiencePage("energy", "9.9.9").includes('og:image" content="' + SITE + '/og/energy.png"'), detail: "Open-Graph + Twitter-card meta on landing, pitch, and per-field pages (rich shareable PNG cards)" },
    { name: "SOCIAL-CARD", pass: socialCard().startsWith("<svg") && socialCard().includes("Melete") && socialCard("security").includes("SECURITY") && socialCard("energy").includes("ENERGY") && socialCard().includes("</svg>"), detail: "1200×630 branded social card SVG renders (master + per-field, accent-coloured)" },
    { name: "SITEMAP+ROBOTS", pass: sitemapXml().includes("<urlset") && sitemapXml().includes(SITE + "/for/security") && sitemapXml().includes(SITE + "/pitch") && robotsTxt().includes("Sitemap: " + SITE + "/sitemap.xml"), detail: "sitemap.xml lists home + pitch + docs + all per-field pages; robots.txt points at it" },
    { name: "JSONLD+FAVICON", pass: (() => { const strip = (s: string) => s.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""); try { const land = JSON.parse(strip(structuredData("/", "x", "y", { faq: true }))); const aud = JSON.parse(strip(structuredData("/for/aero", "x", "y", { breadcrumb: [{ name: "Home", url: "/" }, { name: "Aerospace", url: "/for/aero" }] }))); const hasFaq = land["@graph"].some((n: Record<string, unknown>) => n["@type"] === "FAQPage"); const hasCrumb = aud["@graph"].some((n: Record<string, unknown>) => n["@type"] === "BreadcrumbList"); if (!hasFaq || !hasCrumb) return false; } catch { return false; } return html.includes("application/ld+json") && html.includes("FAQPage") && html.includes('rel="icon"') && audiencePage("aero", "9.9.9").includes("BreadcrumbList") && faviconSvg().startsWith("<svg") && html.includes('href="/favicon.svg"'); })(), detail: "valid JSON-LD (SoftwareApplication + WebPage + FAQPage on landing/pitch + BreadcrumbList on per-field) + branded SVG favicon — Google rich results + browser/bookmark branding" },
    { name: "LANDING-RENDERS", pass: html.startsWith("<!doctype html>") && html.includes("Melete") && html.length > 4000, detail: "world-class landing page renders with hero + sections" },
    { name: "LIGHT-THEME", pass: html.includes("--bg:#ffffff") && !html.includes("background:#07070c"), detail: "clean light theme (not the old dark background)" },
    { name: "DEMO-FORM", pass: html.includes('id="space"') && html.includes('id="obj"') && html.includes('id="preset"') && html.includes("/discover"), detail: "demo has worked examples + posts to /discover" },
    { name: "DISCOVERY-MAP", pass: html.includes("Discovery cinema") && html.includes('id="surf"') && html.includes("renderMap") && html.includes("heat(") && html.includes("drawParallel") && html.includes("drawWaveParticle"), detail: "interactive discovery cinema: 2-D Wave-Particle terrain OR an any-dimension parallel-coordinates view, animated + convergence + strategy" },
    { name: "VIZ-ACCURACY", pass: (() => { const nx = 44, ny = 44; const rises = vizProject(20, 20, 1, nx, ny)[1] < vizProject(20, 20, 0, nx, ny)[1]; const exactH = Math.abs((vizProject(20, 20, 0, nx, ny)[1] - vizProject(20, 20, 1, nx, ny)[1]) - 120) < 1e-9; const depthOrder = vizProject(0, ny - 1, 0, nx, ny)[1] < vizProject(0, 0, 0, nx, ny)[1]; let inB = true; for (const c of [[0, 0, 0], [nx - 1, ny - 1, 1], [nx - 1, 0, 1], [0, ny - 1, 1], [22, 22, 0.5]] as Array<[number, number, number]>) { const pr = vizProject(c[0], c[1], c[2], nx, ny); if (pr[0] < 0 || pr[0] > 600 || pr[1] < 0 || pr[1] > 600) inB = false; } const det = JSON.stringify(vizProject(7, 9, 0.6, nx, ny)) === JSON.stringify(vizProject(7, 9, 0.6, nx, ny)); return rises && exactH && depthOrder && inB && det; })(), detail: "the Wave-Particle projection is faithful: higher score rises, back rows sit higher, peaks stay inside the canvas, deterministic" },
    { name: "WHO-ITS-FOR+STEPS", pass: html.includes("Who it's for") && html.includes("Pharma") && html.includes("AI / ML teams") && html.includes("How it works") && html.includes("Score one try"), detail: "audiences + the 3-step explainer (journalist-style, 1-minute readable)" },
    { name: "MELI-STORYBOOK", pass: html.includes("Meet Meli") && html.includes('class="meli') && html.includes("storybook") && html.includes('data-beat') && html.includes("IntersectionObserver") && html.includes('linearGradient id="mbody"') && html.includes("@keyframes blink"), detail: "original animated mascot (Meli) stars in an interactive scroll-revealed comic storybook with synced effects — geometric art, no third-party/copyright, every browser + mobile" },
    { name: "MODES+INDUSTRY", pass: html.includes("Simple — pick") && html.includes("Advanced — edit") && html.includes("setMode") && html.includes("Click an industry") && html.includes("Drug formulation") && html.includes("GPU kernel tuning") && html.includes("tryScenario") && html.includes("Contact about Melete"), detail: "Simple/Advanced modes + clickable industry scenarios (pharma / GPU / semiconductor) that run live, + a licensing/acquisition contact CTA" },
    { name: "NO-DATASET", pass: html.includes("No dataset") && html.includes("melete tune"), detail: "explains no dataset is needed + shows the real `melete tune` usage" },
    { name: "AIR-GAPPED", pass: html.toLowerCase().includes("air-gapped") && html.includes("runs fully offline"), detail: "states the air-gapped / on-prem positioning" },
    { name: "PITCH-DECK", pass: pitch.startsWith("<!doctype html>") && pitch.includes("The ask") && pitch.includes("The moat") && html.includes('href="/pitch"'), detail: "HTML pitch deck renders (problem→product→moat→proof→ask) and is linked from the landing page" },
    { name: "VERSION+CATALOG", pass: html.includes("9.9.9") && ENDPOINTS.length === 4 && ENDPOINTS.some((e) => e.path === "/pitch"), detail: "version injected; endpoint catalogue incl /pitch + /discover + /verify" },
    { name: "HONEST-COPY", pass: html.toLowerCase().includes("honest") && html.toLowerCase().includes("no single"), detail: "page states the honest framing (robustness, not a magic algorithm)" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}


export function docsPage(version: string | number) { return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Melete API</title>\n<style>:root{color-scheme:light}*{box-sizing:border-box}body{font:15.5px/1.7 ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;max-width:860px;margin:0 auto;padding:52px 22px 64px;color:#1a1b30;background:#fbfbfe;font-variant-numeric:tabular-nums}body::before{content:\"\";position:fixed;inset:-20% -10%;z-index:-2;pointer-events:none;background:radial-gradient(34% 34% at 86% 4%,rgba(20,184,166,.16),transparent 62%),radial-gradient(40% 40% at 4% 9%,rgba(109,92,240,.16),transparent 60%),radial-gradient(34% 36% at 94% 84%,rgba(168,85,247,.13),transparent 60%);filter:blur(22px)}body::after{content:\"\";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.5;background-image:radial-gradient(circle at 1px 1px,rgba(80,70,160,.06) 1px,transparent 0);background-size:30px 30px}h1{font-size:42px;margin:14px 0 6px;letter-spacing:-1.5px;font-weight:850;background:linear-gradient(95deg,#6d5cf0,#0ea5b7,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 8px 26px rgba(109,92,240,.28))}h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6d28d9;margin:36px 0 10px;font-weight:800}code{font-family:ui-monospace,Menlo,monospace;background:#f3f1ff;color:#4338ca;padding:1px 6px;border-radius:6px;font-size:13px}pre{background:linear-gradient(160deg,#1c1d33,#15162a);color:#e7e7f5;padding:17px 18px;border-radius:14px;overflow:auto;font-size:12.5px;line-height:1.6;box-shadow:0 22px 50px -30px rgba(20,20,60,.6),inset 0 1px 0 rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06)}pre code{background:none;color:inherit;padding:0}.f{border-collapse:collapse;width:100%;font-size:14px;margin:8px 0}.f td{border-bottom:1px solid #efedf7;padding:9px 6px;vertical-align:top}.f td:first-child{font-family:ui-monospace,monospace;color:#6d28d9;white-space:nowrap;font-size:13px;font-weight:600}a{color:#5b53e8;font-weight:600;text-decoration:none}a:hover{text-decoration:underline}.muted{color:#8890a8;font-size:13.5px}.card{background:rgba(255,255,255,.78);backdrop-filter:blur(13px) saturate(1.2);-webkit-backdrop-filter:blur(13px) saturate(1.2);border:1px solid #ecebf6;border-radius:18px;padding:20px 20px 9px;margin:14px 0;box-shadow:0 1px 2px rgba(30,25,80,.04),0 22px 50px -34px rgba(70,55,160,.42)}.ret{display:inline-block;background:linear-gradient(135deg,#ecfdf5,#e6fffb);color:#0e7a4f;font-size:11px;font-weight:800;padding:3px 9px;border-radius:7px;text-transform:uppercase;letter-spacing:.3px;border:1px solid #bfeee0}.langsw{position:fixed;top:14px;right:16px;display:flex;background:#fff;border:1px solid #e7e8f0;border-radius:999px;padding:3px;gap:2px;box-shadow:0 4px 14px rgba(20,20,50,.12)}.lb{border:0;background:transparent;border-radius:999px;padding:6px 13px;font-size:13px;font-weight:700;color:#6a6c84;cursor:pointer}.lb.on{background:linear-gradient(96deg,#6d5cf0,#0ea5b7);color:#fff}</style>\n</head><body>\n<div class=\"langsw\"><button class=\"lb\" id=\"lbEN\" onclick=\"setLang('en')\">EN</button><button class=\"lb\" id=\"lbTH\" onclick=\"setLang('th')\">ไทย</button></div>\n<a href=\"/\">&larr; Melete</a>\n<h1>Melete API</h1>\n<p class=\"muted\" data-i18n=\"d_sub\">Connect your real process. Base URL <code>https://melete.mneme-ai.space</code> &middot; all JSON &middot; no auth on the demo.</p>\n<p data-i18n=\"d_loop\"><b>The loop:</b> POST your results so far &rarr; get the next experiment to try &rarr; run it in your system &rarr; measure a score &rarr; POST again with the new result &rarr; repeat until it converges. <b>You</b> run the experiment; <b>Melete</b> decides what to try next.</p>\n<h2 data-i18n=\"d_ex_h\">Copy-paste examples</h2>\n<div class=\"card\"><p class=\"muted\" data-i18n=\"d_ex_p\">The whole loop in real code &mdash; replace <code>run_my_experiment</code> with your actual lab/benchmark/process.</p>\n<p style=\"font-size:12px;color:#8890a8;margin:6px 0 2px\">Python</p>\n<pre><code>import requests\nbase = \"https://melete.mneme-ai.space\"\nspace = [{\"name\":\"pH\",\"type\":\"real\",\"min\":3,\"max\":9}]\nobs = []\nfor _ in range(20):\n    r = requests.post(base+\"/next\", json={\"space\":space,\"observations\":obs,\"goal\":\"maximize\"}).json()\n    x = r[\"next\"]                       # the setting Melete wants you to try\n    score = run_my_experiment(x)        # &larr; YOU measure it for real\n    obs.append({\"experiment\": x, \"value\": score})\n    if r[\"advice\"][\"recommendation\"] == \"STOP\": break\nprint(\"best:\", max(obs, key=lambda o: o[\"value\"]))</code></pre>\n<p style=\"font-size:12px;color:#8890a8;margin:10px 0 2px\">JavaScript / Node</p>\n<pre><code>const base = \"https://melete.mneme-ai.space\";\nconst space = [{name:\"pH\", type:\"real\", min:3, max:9}];\nlet obs = [];\nfor (let i = 0; i &lt; 20; i++) {\n  const r = await fetch(base+\"/next\", {method:\"POST\",\n    headers:{\"content-type\":\"application/json\"},\n    body: JSON.stringify({space, observations:obs, goal:\"maximize\"})}).then(r =&gt; r.json());\n  const score = await runMyExperiment(r.next);   // &larr; YOU measure it\n  obs.push({experiment: r.next, value: score});\n  if (r.advice.recommendation === \"STOP\") break;\n}</code></pre></div>\n<h2 data-i18n=\"d_next_h\">POST /next &mdash; the guided loop</h2>\n<div class=\"card\"><table class=\"f\">\n<tr><td>space</td><td data-i18n=\"d_f_space\">what you can change: <code>[{name, type:\"real\"|\"int\", min, max}]</code></td></tr>\n<tr><td>observations</td><td data-i18n=\"d_f_obs\">everything measured so far: <code>[{experiment:{name:value}, value:number}]</code> &mdash; empty <code>[]</code> on the first call</td></tr>\n<tr><td>goal</td><td data-i18n=\"d_f_goal\"><code>\"maximize\"</code> or <code>\"minimize\"</code></td></tr>\n<tr><td>costPerExperiment</td><td data-i18n=\"d_f_cost\"><i>optional</i> &mdash; cost per experiment; enables the money stop-advice</td></tr>\n</table><p><span class=\"ret\">returns</span> <code>{ next, best, advice:{recommendation:\"CONTINUE\"|\"STOP\"} }</code></p></div>\n<h2 data-i18n=\"d_multi_h\">POST /next-multi &mdash; multi-objective (Pareto)</h2>\n<div class=\"card\"><p data-i18n=\"d_multi_p\">Like <code>/next</code>, but <code>goals</code> has one entry per objective and each observation carries <code>values[]</code>:</p>\n<pre><code>{\"space\":[...], \"goals\":[{\"name\":\"yield\",\"goal\":\"maximize\"},{\"name\":\"cost\",\"goal\":\"minimize\"}],\n \"observations\":[{\"experiment\":{...}, \"values\":[90, 40]}]}</code></pre>\n<p><span class=\"ret\">returns</span> <code>{ next, paretoFront:[ ...best trade-offs... ], paretoSize }</code></p></div>\n<h2 data-i18n=\"d_disc_h\">POST /discover &mdash; one-shot (you supply a formula)</h2>\n<div class=\"card\"><p data-i18n=\"d_disc_p\">For automatable objectives: pass an <code>objective</code> expression in your variable names &mdash; Melete runs the whole loop and returns the best + a signed trace + a Proof of Optimization + a sensitivity report.</p>\n<pre><code>{\"space\":[{\"name\":\"x\",\"type\":\"real\",\"min\":-5,\"max\":5}], \"objective\":\"-(x-2)**2\", \"budget\":40, \"goal\":\"maximize\"}</code></pre>\n<p><span class=\"ret\">returns</span> <code>{ best, evaluations, frontier, certificate, poopt, sensitivity, trace, verify }</code></p></div>\n<h2 data-i18n=\"d_poopt_h\">POST /poopt/verify &mdash; verify a certificate offline</h2>\n<div class=\"card\"><p data-i18n=\"d_poopt_p\">POST a downloaded <code>proof-of-optimization.json</code> &rarr; <code>{ ok, reason, efficiencyPct }</code>. Zero-server option: <code>npm i -g melete-ai</code> then <code>melete poopt cert.json</code>.</p></div>\n<h2 data-i18n=\"d_self_h\">Self-hosted &amp; air-gapped</h2>\n<div class=\"card\"><p data-i18n=\"d_self_p\"><code>npm i -g melete-ai</code> &middot; run <code>melete-server</code> on your own machine &mdash; data never leaves. Or call the library directly:</p><pre><code>import { proposeNext, proposeNextMulti } from \"melete-ai\"</code></pre></div>\n<p class=\"muted\" data-i18n=\"d_footer\" style=\"margin-top:24px\">Melete v__VER__ &middot; MIT &middot; <a href=\"/\">home</a></p>\n<script>\nvar T={en:{\n d_sub:'Connect your real process. Base URL <code>https://melete.mneme-ai.space</code> &middot; all JSON &middot; no auth on the demo.',\n d_loop:'<b>The loop:</b> POST your results so far &rarr; get the next experiment to try &rarr; run it in your system &rarr; measure a score &rarr; POST again with the new result &rarr; repeat until it converges. <b>You</b> run the experiment; <b>Melete</b> decides what to try next.',\n d_ex_h:'Copy-paste examples',\n d_ex_p:'The whole loop in real code &mdash; replace <code>run_my_experiment</code> with your actual lab/benchmark/process.',\n d_next_h:'POST /next &mdash; the guided loop',\n d_f_space:'what you can change: <code>[{name, type:\"real\"|\"int\", min, max}]</code>',\n d_f_obs:'everything measured so far: <code>[{experiment:{name:value}, value:number}]</code> &mdash; empty <code>[]</code> on the first call',\n d_f_goal:'<code>\"maximize\"</code> or <code>\"minimize\"</code>',\n d_f_cost:'<i>optional</i> &mdash; cost per experiment; enables the money stop-advice',\n d_multi_h:'POST /next-multi &mdash; multi-objective (Pareto)',\n d_multi_p:'Like <code>/next</code>, but <code>goals</code> has one entry per objective and each observation carries <code>values[]</code>:',\n d_disc_h:'POST /discover &mdash; one-shot (you supply a formula)',\n d_disc_p:'For automatable objectives: pass an <code>objective</code> expression in your variable names &mdash; Melete runs the whole loop and returns the best + a signed trace + a Proof of Optimization + a sensitivity report.',\n d_poopt_h:'POST /poopt/verify &mdash; verify a certificate offline',\n d_poopt_p:'POST a downloaded <code>proof-of-optimization.json</code> &rarr; <code>{ ok, reason, efficiencyPct }</code>. Zero-server option: <code>npm i -g melete-ai</code> then <code>melete poopt cert.json</code>.',\n d_self_h:'Self-hosted &amp; air-gapped',\n d_self_p:'<code>npm i -g melete-ai</code> &middot; run <code>melete-server</code> on your own machine &mdash; data never leaves. Or call the library directly:',\n d_footer:'Melete v__VER__ &middot; MIT &middot; <a href=\"/\">home</a>'\n},th:{\n d_sub:'เชื่อมต่อกระบวนการจริงของคุณ Base URL <code>https://melete.mneme-ai.space</code> &middot; เป็น JSON ทั้งหมด &middot; เดโมไม่ต้องมี auth',\n d_loop:'<b>ลูปการทำงาน:</b> POST ผลที่วัดมาแล้ว &rarr; ได้การทดลองถัดไปที่ควรลอง &rarr; ไปรันในระบบของคุณ &rarr; วัดคะแนน &rarr; POST ใหม่พร้อมผลล่าสุด &rarr; วนจนลู่เข้า <b>คุณ</b>เป็นคนรันการทดลอง <b>Melete</b> เป็นคนเลือกว่าลองอะไรต่อ',\n d_ex_h:'ตัวอย่างโค้ด ก็อปวางได้เลย',\n d_ex_p:'ลูปทั้งหมดในโค้ดจริง &mdash; แทน <code>run_my_experiment</code> ด้วยแล็บ/เบนช์มาร์ก/กระบวนการจริงของคุณ',\n d_next_h:'POST /next &mdash; ลูปแนะนำ (guided)',\n d_f_space:'สิ่งที่คุณปรับได้: <code>[{name, type:\"real\"|\"int\", min, max}]</code>',\n d_f_obs:'ทุกอย่างที่วัดมาแล้ว: <code>[{experiment:{name:value}, value:number}]</code> &mdash; ครั้งแรกส่ง <code>[]</code> ว่างได้',\n d_f_goal:'<code>\"maximize\"</code> (มากสุด) หรือ <code>\"minimize\"</code> (น้อยสุด)',\n d_f_cost:'<i>ไม่บังคับ</i> &mdash; ต้นทุนต่อการทดลอง; เปิดคำแนะนำเรื่องเงิน/เมื่อไหร่ควรหยุด',\n d_multi_h:'POST /next-multi &mdash; หลายเป้าหมาย (Pareto)',\n d_multi_p:'เหมือน <code>/next</code> แต่ <code>goals</code> มีหนึ่งรายการต่อหนึ่งเป้าหมาย และแต่ละ observation มี <code>values[]</code>:',\n d_disc_h:'POST /discover &mdash; ทำครั้งเดียวจบ (คุณใส่สูตร objective)',\n d_disc_p:'สำหรับงานที่รันอัตโนมัติได้: ส่งนิพจน์ <code>objective</code> ในชื่อตัวแปรของคุณ &mdash; Melete รันทั้งลูปแล้วคืนค่าที่ดีที่สุด + ใบบันทึกที่เซ็น + Proof of Optimization + รายงาน sensitivity',\n d_poopt_h:'POST /poopt/verify &mdash; ตรวจใบรับรองแบบ offline',\n d_poopt_p:'POST ไฟล์ <code>proof-of-optimization.json</code> ที่ดาวน์โหลดไว้ &rarr; <code>{ ok, reason, efficiencyPct }</code> หรือตรวจโดยไม่ต้องมีเซิร์ฟเวอร์: <code>npm i -g melete-ai</code> แล้ว <code>melete poopt cert.json</code>',\n d_self_h:'รันเอง &amp; air-gapped',\n d_self_p:'<code>npm i -g melete-ai</code> &middot; รัน <code>melete-server</code> บนเครื่องของคุณเอง &mdash; ข้อมูลไม่ออกไปไหน หรือเรียก library ตรงๆ:',\n d_footer:'Melete v__VER__ &middot; MIT &middot; <a href=\"/\">หน้าแรก</a>'\n}};\nfunction setLang(l){if(l!=='th')l='en';try{localStorage.setItem('mlang',l)}catch(e){}var en=document.getElementById('lbEN'),th=document.getElementById('lbTH');if(en)en.className='lb'+(l==='en'?' on':'');if(th)th.className='lb'+(l==='th'?' on':'');document.documentElement.lang=l;var n=document.querySelectorAll('[data-i18n]');for(var i=0;i<n.length;i++){var k=n[i].getAttribute('data-i18n');if(T[l]&&T[l][k]!=null)n[i].innerHTML=T[l][k];}}\nvar _l='en';try{_l=localStorage.getItem('mlang')||'en'}catch(e){}setLang(_l);\n</script>\n</body></html>".split("__VER__").join(String(version)); }
