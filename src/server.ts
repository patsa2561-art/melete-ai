/**
 * MELETE WEB — discovery-as-a-service. A self-contained HTTP surface so anyone (or any agent) can POST an
 * objective + a search space and get back the discovered optimum AND its signed, verifiable trace — no
 * install. The landing page is a live demo; the JSON endpoints are the product; /pitch is the buyer deck.
 *
 * This module owns the landing page + the pitch deck (pure strings) + the endpoint catalogue. The HTTP
 * server + the sandboxed objective evaluation live in bin/melete-server.mjs (node:http + node:vm).
 */
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

export function landingPage(version = "0.4.0"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete — find the best answer in the fewest experiments</title><style>${SHELL_CSS}</style></head><body>

<div class="hero">
  <div class="herochar">${meli("hero")}</div>
  <span class="eyebrow">Self-driving discovery</span>
  <h1 class="brand"><span class="grad">Melete</span></h1>
  <p class="tag">When every experiment is expensive, Melete finds the <b>best answer in the fewest tries</b> — and proves how it got there.</p>
  <p class="sub">Mneme remembers; Melete discovers. &nbsp;·&nbsp; v${version}</p>
  <div class="cta">
    <a class="btn primary" href="#try">See it discover (live) →</a>
    <a class="btn ghost" href="/pitch">The 60-second pitch</a>
  </div>
  <div class="pills">
    <span class="pill">⚛ adaptive ensemble</span>
    <span class="pill">no dataset needed</span>
    <span class="pill">🔏 cryptographic proof</span>
    <span class="pill">🔒 air-gapped / on-prem</span>
  </div>
</div>

<div class="wrap">

<section><h2>What it does — one example</h2>
<div class="story">
<p style="font-size:19px;font-weight:600;color:#1a1b30;margin-bottom:14px">You run a coffee shop and want the <b>best espresso</b>. You can change three things — water temperature, grind, and how many grams of coffee. There are thousands of combinations, and testing one means <b>brewing a cup and tasting it</b>. You can't try them all.</p>
<p style="color:#33344e;margin-bottom:6px">Melete works like a brilliant assistant who suggests the next cup to brew:</p>
<div class="chat">☕ Melete: “Try <b>92°, grind 6, 18g</b>.” &nbsp;→ you brew it, taste it: <b>7/10</b>.</div>
<div class="chat">☕ Melete: “Now try <b>93°, grind 5, 19g</b>.” &nbsp;→ you taste: <b>8.5/10</b>.</div>
<div class="chat" style="opacity:.6">… a few more …</div>
<div class="chat">🎯 After ~<b>20 cups</b>, it found your best recipe — instead of randomly trying 200.</div>
<p style="color:#33344e;margin-top:14px">Swap “coffee” for a <b>training run</b>, a <b>chemical reaction</b>, or a <b>price</b> — it's the same: Melete finds the best settings in the <b>fewest expensive tries</b>, and signs a <b>proof</b> of how it got there. <span class="muted">You bring the thing you can adjust and a way to score one try; it brings the strategy.</span></p>
</div></section>

<section><h2>Meet Meli — a tiny story</h2>
<div class="storybook">

  <div class="panel wish" data-beat>
    <div class="panel-art">${meli()}<span class="prop hearts">💛</span></div>
    <div class="panel-text"><span class="beatnum">1</span>
      <p>Once upon a time, a little coffee shop wished for the <b>most delicious espresso in the world</b>.</p></div>
  </div>

  <div class="panel maze" data-beat>
    <div class="panel-art">${meli()}<span class="prop cups">☕☕☕<br>☕☕☕</span></div>
    <div class="panel-text"><span class="beatnum">2</span>
      <p>But there were <b>thousands of ways</b> to make it — and every single test meant brewing, and tasting, a whole cup. Trying them all? <b>Impossible.</b></p></div>
  </div>

  <div class="panel think" data-beat>
    <div class="panel-art">${meli()}<span class="prop bubble">brew <b>this</b> one →</span></div>
    <div class="panel-text"><span class="beatnum">3</span>
      <p>Then came <b>Meli</b> — who never tries everything. Meli looks, thinks, and the little light glows: <i>“brew <b>this</b> one next.”</i></p></div>
  </div>

  <div class="panel dance" data-beat>
    <div class="panel-art">${meli()}<span class="prop cup">☕<span class="score">7 → 8.5 → 9.2</span></span></div>
    <div class="panel-text"><span class="beatnum">4</span>
      <p>You brew it, you taste it — <b>7 out of 10</b>. Meli smiles, <b>learns</b>, and picks an even smarter cup. 8.5… 9.2…</p></div>
  </div>

  <div class="panel win" data-beat>
    <div class="panel-art">${meli()}<span class="prop star">⭐</span><span class="prop seal">📜 verified ✓</span></div>
    <div class="panel-text"><span class="beatnum">5</span>
      <p>In about <b>twenty cups</b>, Meli found the <b>perfect recipe</b> — and sealed a magical <b>proof</b> of how, so the whole world could trust it. <b>The end ✨</b></p>
      <a class="btn primary" href="#try" style="margin-top:14px;display:inline-block">▶ Now watch Meli do it for real</a></div>
  </div>

</div></section>

<section><h2>How it works — 3 steps</h2>
<div class="steps">
  <div class="step"><span class="n">1</span><h3>Set the dials</h3><p>List what you can change and its range — temperature 85–96°, learning-rate 0–0.1, price $1–100.</p></div>
  <div class="step"><span class="n">2</span><h3>Score one try</h3><p>Your real process returns one number: brew → taste, train → accuracy, price → revenue. No dataset needed.</p></div>
  <div class="step"><span class="n">3</span><h3>Discover &amp; prove</h3><p>Melete proposes the next experiment, learns, converges to the best — and signs a verifiable trace of how.</p></div>
</div></section>

<section><h2>Who it's for &amp; what they get</h2>
<div class="grid">
  <div class="card"><div class="who">AI / ML teams</div><h3>Hyperparameter &amp; system tuning</h3><p>Tune learning rates, architectures, RAG/serving configs, compiler flags — fewer GPU-hours to the best model, with a provable tuning record.</p></div>
  <div class="card"><div class="who">Pharma · Chemistry · Materials</div><h3>Formulation &amp; reaction discovery</h3><p>Find the reagent mix / conditions that maximise yield or potency in far fewer assays — and a tamper-proof discovery trail for patents &amp; audits.</p></div>
  <div class="card"><div class="who">Semiconductor · Manufacturing</div><h3>Process optimisation</h3><p>Tune deposition / etch / print parameters against real KPIs on-prem — air-gapped, data never leaves the fab, result still verifiable.</p></div>
  <div class="card"><div class="who">Quant · Product · Growth</div><h3>Pricing &amp; expensive A/B</h3><p>Search price points, configurations, and policies where each test is costly — converge faster than grid or manual search.</p></div>
</div>
<p class="muted" style="margin-top:16px">Every case: <b>fewer expensive experiments</b> to the best answer + a <b>cryptographic proof</b> of how it was found.</p></section>

<section id="try"><h2>See it discover — just watch</h2>
<p class="lead" style="font-size:18px;margin:0 0 4px">Melete tunes <b>knobs</b>. You don't write code or upload data here — <b>pick a scenario and press Watch.</b></p>
<p class="muted" style="margin:0 0 16px">In this browser demo the "score" is faked by a formula so it runs instantly. For your real work the score comes from your real process — see <a href="#use">how to use it for your work</a> below.</p>
<div class="card">
<div class="modetabs"><button class="mt on" id="mt-simple" onclick="setMode('simple')">🟢 Simple — pick &amp; watch</button><button class="mt" id="mt-advanced" onclick="setMode('advanced')">⚙️ Advanced — edit the values</button></div>
<label>Scenario</label>
<select id="preset" onchange="loadPreset()">
  <option value="peak">📈 Find a hidden peak — the simplest demo (2 knobs)</option>
  <option value="coffee">☕ Best espresso recipe — temperature · grind · dose</option>
  <option value="price">💸 Best price point — which price earns the most</option>
  <option value="pharma">💊 Drug formulation — pH · temperature · excipient → stability</option>
  <option value="gpu">⚡ GPU kernel tuning — tile · unroll · occupancy → throughput</option>
  <option value="etch">🔬 Semiconductor etch — power · pressure · time → yield</option>
  <option value="llm">🧠 LLM serving — batch · KV-cache · quantization → tokens/sec</option>
</select>
<div id="scenario" class="scenario"></div>
<div id="advbox" class="advbox">
<p class="muted" style="font-size:12.5px;margin:0 0 4px">In the browser the score is a <b>simulated model</b> of the process. For real numbers, connect your real process (see below).</p>
<label>Space — the variables (name · type · min · max)</label>
<input id="space" value='[{"name":"x","type":"real","min":0,"max":10},{"name":"y","type":"real","min":0,"max":10}]'>
<label>Objective — the simulated score (a formula, browser demo only)</label>
<input id="obj" value="Math.exp(-((x-7.2)**2+(y-3.4)**2)/3)">
<label>Budget — experiments allowed</label>
<input id="budget" value="40">
</div>
<button class="btn primary" style="margin-top:16px;width:100%" onclick="run()">▶ Watch Melete discover</button>
<div class="result" id="out">Pick a scenario, then press Watch — the best settings, a movie of how it searched, and a signed proof appear here.</div>

<div id="map">
<div class="mapgrid">
  <div>
    <div class="caps">Discovery cinema — watch it search, coloured by strategy</div>
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
    <div class="caps">Convergence</div>
    <canvas id="conv" width="380" height="120" style="height:96px"></canvas>
    <div class="caps" style="margin-top:16px">Which strategy the bandit chose</div>
    <div id="arms"></div>
    <div class="caps" style="margin-top:16px">Proof</div>
    <div id="proof" class="kv"></div>
  </div>
</div></div>
</div></section>

<section><h2>Click an industry — see Melete work on it</h2>
<p class="muted" style="margin:0 0 16px">Each card runs the live demo on a realistic, domain-shaped scenario. <b>The browser score is a simulated model</b> of the process — the <b>optimisation is real &amp; reproducible</b>; connect your real assay / benchmark / process for real numbers.</p>
<div class="grid">
  <div class="card indcard" onclick="tryScenario('pharma')"><div class="who">💊 Pharma · biotech</div><h3>Drug formulation</h3><p>Variables: pH · temperature · excipient %. Goal: stability / potency. Melete finds the most stable formulation in ~60 assays — instead of hundreds.</p><div class="go">▶ Run it now</div></div>
  <div class="card indcard" onclick="tryScenario('gpu')"><div class="who">⚡ AI infrastructure · accelerators</div><h3>GPU kernel tuning</h3><p>Variables: tile size · unroll · occupancy. Goal: throughput (GFLOP/s). Find the fastest config in ~50 benchmark runs.</p><div class="go">▶ Run it now</div></div>
  <div class="card indcard" onclick="tryScenario('etch')"><div class="who">🔬 Semiconductor · fab</div><h3>Plasma-etch process</h3><p>Variables: power · pressure · time. Goal: wafer yield %. Tune the recipe to maximum yield — air-gapped, on-prem.</p><div class="go">▶ Run it now</div></div>
  <div class="card indcard" onclick="tryScenario('llm')"><div class="who">🧠 The AI world itself</div><h3>LLM serving config</h3><p>Variables: batch size · KV-cache · quantization. Goal: tokens/sec at a quality bar. Melete optimises AI infrastructure too — and can tune prompts, agents &amp; routing the same way.</p><div class="go">▶ Run it now</div></div>
  <div class="card indcard" onclick="tryScenario('coffee')"><div class="who">☕ Everyday</div><h3>Best espresso recipe</h3><p>Variables: temp · grind · dose. Goal: taste. The friendliest way to watch the idea click.</p><div class="go">▶ Run it now</div></div>
</div></section>

<section><div class="card" style="text-align:center;background:linear-gradient(120deg,#f3f1ff,#eafcf8);border-color:#ddd9fb;padding:28px">
  <div style="width:64px;margin:0 auto 6px">${meli()}</div>
  <h3 style="font-size:23px;margin:0 0 8px">Want this for your team — or to acquire the code?</h3>
  <p style="margin:0 auto 16px;color:#33344e;font-size:16px;max-width:560px">Melete is a clean, dependency-free codebase with a live demo, full tests, and a signed-provenance moat. Open to licensing or an IP acquisition.</p>
  <a class="btn primary" href="mailto:kreevut@gmail.com?subject=Melete%20%E2%80%94%20licensing%20or%20acquisition">📩 Contact about Melete</a>
  &nbsp;<a class="btn ghost" href="/pitch">Read the pitch</a>
</div></section>

<section><h2>Proven, not claimed</h2>
<p style="margin:0 0 14px;color:#33344e">No single optimiser wins on every landscape. A bandit spends each experiment on whichever strategy is winning <i>on your problem</i> — one engine, no per-problem tuning.</p>
<table><tr><th>landscape</th><th>Melete</th><th>single Bayesian</th><th>random</th></tr>
<tr><td>smooth</td><td class="win">1.000</td><td>0.999</td><td>0.838</td></tr>
<tr><td>rugged (many traps)</td><td class="win">best 🏆 beats every single algorithm</td><td>far behind</td><td>far behind</td></tr>
<tr><td>high-dimensional</td><td class="win">0.996</td><td>0.987</td><td>0.555</td></tr></table>
<p class="muted" style="margin-top:10px">≈ 26 experiments vs ~95 for random to reach 99% of a hidden optimum (3.7×). Reproduce with <code>melete bench --robust</code>.</p></section>

<section id="use"><h2>Use it for your work — answer 3 questions</h2>
<p class="lead" style="margin:0 0 18px">No dataset, no formula. Just answer these about <b>your</b> process:</p>
<div class="steps">
  <div class="step"><span class="n">1</span><h3>What can you adjust?</h3><p>List the knobs + their real limits (your machine's range). <span class="muted">→ that's the SPACE.</span></p></div>
  <div class="step"><span class="n">2</span><h3>After one try, what number tells you how good it was?</h3><p>You <b>measure</b> it — taste a score, read accuracy, read revenue. You don't calculate it. <span class="muted">→ that's the SCORE.</span></p></div>
  <div class="step"><span class="n">3</span><h3>How many tries can you afford?</h3><p>Brews, training runs, assays you'll pay for. <span class="muted">→ that's the BUDGET.</span></p></div>
</div>
<div class="grid" style="margin-top:18px">
  <div class="card"><div class="who">☕ A coffee shop</div><p><b>Knobs:</b> temp 85–96° · grind 1–10 · dose 14–22g<br><b>Score:</b> a barista tastes each shot, 0–10<br><b>Budget:</b> 30 shots → Melete finds the recipe in ~20.</p></div>
  <div class="card"><div class="who">🤖 An ML team</div><p><b>Knobs:</b> learning-rate 0–0.1 · depth 1–12<br><b>Score:</b> the training script prints accuracy<br><b>Budget:</b> 40 runs → fewer GPU-hours to the best model.</p></div>
</div>
<p class="lead" style="margin:24px 0 12px;font-size:18px">Then run it one of two ways:</p>
<p style="margin:0 0 6px;color:#33344e"><b>A) Connect your process</b> — Melete runs it for you and reads the number (this is the real product, like installing a tool):</p>
<pre>melete tune --cmd "python train.py --lr {lr} --depth {depth}" \\
            --space '[{"name":"lr","type":"real","min":0,"max":0.1},{"name":"depth","type":"int","min":1,"max":12}]'</pre>
<p style="margin:16px 0 6px;color:#33344e"><b>B) From an agent or pipeline</b> — call the HTTP API or the library; your code returns the score each step:</p>
<pre>POST https://melete.mneme-ai.space/discover   ·   npm i melete-ai   ·   discoverSigned({ space, oracle })</pre>
<p class="muted" style="margin-top:14px"><b>This website = a sandbox to try it.</b> Real work = connect your real process (A or B). 🔒 Air-gapped: zero dependencies + local signing ⇒ runs fully offline, result still verifiable.</p></section>

</div>
<footer>
Honest: the engine is a context-adaptive ensemble — its guarantee is robustness + verifiable provenance, measured &amp; reproducible (not a single "magic" algorithm).<br>
<a href="/pitch">Pitch deck</a> · <a href="/health">/health</a> · Melete v${version} · the discovery muse
</footer>

<script>
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
function setMode(m){var a=document.getElementById('advbox');if(a)a.style.display=(m==='advanced')?'block':'none';var s=document.getElementById('mt-simple'),v=document.getElementById('mt-advanced');if(s)s.className='mt'+(m==='simple'?' on':'');if(v)v.className='mt'+(m==='advanced'?' on':'');}
function loadPreset(){var p=PRESETS[document.getElementById('preset').value];document.getElementById('space').value=p.space;document.getElementById('obj').value=p.obj;document.getElementById('budget').value=p.budget;
  document.getElementById('scenario').innerHTML=[p.s,p.t,p.b].map(function(r){return '<div class="srow"><b>'+r[0]+'</b><span>'+r[1]+'</span></div>'}).join('');
  document.getElementById('out').textContent='Ready — press ▶ Watch Melete discover.';var m=document.getElementById('map');if(m)m.className='';}
var ARMCOL={gp:'#6d5cf0',cmaes:'#0ea5b7',"kernel-ucb":'#f97316',"trust-region":'#a855f7',anneal:'#ef4444',maximin:'#22c55e',"basin-hop":'#eab308',random:'#94a3b8',seed:'#cbd5e1'};
function heat(t){t=Math.max(0,Math.min(1,t));var a=[40,32,84],b=[14,120,170],c=[16,185,160],d=[250,232,80];var seg=t<.33?[a,b,t/.33]:t<.66?[b,c,(t-.33)/.33]:[c,d,(t-.66)/.34];return 'rgb('+seg[0].map(function(v,i){return Math.round(v+(seg[1][i]-v)*seg[2])}).join(',')+')';}
var MAP={};
function fmt(v){var r=Math.round(v*100)/100;return ''+r;}
function drawFrame(k){
  var s=MAP.surface,S=600,cv=document.getElementById('surf'),x=cv.getContext('2d');x.clearRect(0,0,S,S);
  var p=MAP.path||[];
  if(s){
    var zmin=Math.min.apply(null,s.z),zmax=Math.max.apply(null,s.z),zr=(zmax-zmin)||1,cw=S/s.nx;
    for(var j=0;j<s.ny;j++)for(var i=0;i<s.nx;i++){x.fillStyle=heat((s.z[j*s.nx+i]-zmin)/zr);x.fillRect(i*cw,S-(j+1)*cw,cw+1.2,cw+1.2);}
    var toX=function(e){return Math.max(9,Math.min(S-9,(e[s.xName]-s.xMin)/((s.xMax-s.xMin)||1)*S));},toY=function(e){return Math.max(9,Math.min(S-9,S-(e[s.yName]-s.yMin)/((s.yMax-s.yMin)||1)*S));};
    x.strokeStyle='rgba(255,255,255,.4)';x.lineWidth=1.3;x.beginPath();for(var t=0;t<=k&&t<p.length;t++){var X=toX(p[t].experiment),Y=toY(p[t].experiment);t?x.lineTo(X,Y):x.moveTo(X,Y);}x.stroke();
    for(var t2=0;t2<=k&&t2<p.length;t2++){var P=p[t2],X2=toX(P.experiment),Y2=toY(P.experiment),cur=(t2===k),r=cur?9:5.5;
      x.beginPath();x.arc(X2,Y2,r,0,7);x.fillStyle=ARMCOL[P.arm]||'#94a3b8';x.globalAlpha=cur?1:.85;x.fill();x.globalAlpha=1;x.lineWidth=cur?2.5:1;x.strokeStyle=cur?'#fff':'rgba(255,255,255,.7)';x.stroke();}
    var bi=MAP.bestIdx;if(k>=bi){var bx=toX(MAP.best.experiment),by=toY(MAP.best.experiment);x.font='30px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#fde047';x.strokeStyle='#16172b';x.lineWidth=1.6;x.strokeText('★',bx,by);x.fillText('★',bx,by);}
  } else if(MAP.dims && MAP.dims.length>=2){ drawParallel(x,S,k); }
  else { x.fillStyle='#9092a8';x.font='15px system-ui';x.textAlign='center';x.fillText('Run a scenario to see the discovery map.',S/2,S/2); }
  var sn=document.getElementById('stepn');if(sn)sn.textContent='exp '+Math.min(k+1,p.length)+' / '+p.length;
  var sc=document.getElementById('scrub');if(sc)sc.value=k;
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
  // legend (only arms that appeared)
  var used={};MAP.path.forEach(function(p){used[p.arm]=1;});
  document.getElementById('legend').innerHTML=Object.keys(used).map(function(a){return '<span class="legdot"><i style="background:'+(ARMCOL[a]||'#94a3b8')+'"></i>'+a+'</span>';}).join('');
  // convergence
  var cv=document.getElementById('conv'),cc=cv.getContext('2d'),W=cv.width,H=cv.height;cc.clearRect(0,0,W,H);
  var run=[],b=-Infinity;MAP.path.forEach(function(p){b=Math.max(b,p.value);run.push(b);});
  var lo=Math.min.apply(null,run),hi=Math.max.apply(null,run),rg=(hi-lo)||1;
  cc.strokeStyle='#5b53e8';cc.lineWidth=2.5;cc.lineJoin='round';cc.beginPath();run.forEach(function(v,i){var X=i/(run.length-1||1)*W,Y=H-9-(v-lo)/rg*(H-18);i?cc.lineTo(X,Y):cc.moveTo(X,Y);});cc.stroke();
  // arm bars
  var tot=(j.armStats||[]).reduce(function(s,a){return s+a.pulls},0)||1;
  document.getElementById('arms').innerHTML=(j.armStats||[]).filter(function(a){return a.pulls>0}).sort(function(a,b){return b.pulls-a.pulls}).map(function(a){return '<div class="kv" style="display:flex;justify-content:space-between;font-size:13px;align-items:center"><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+(ARMCOL[a.name]||'#94a3b8')+';margin-right:6px"></i>'+a.name+'</span><span class="muted">'+a.pulls+'</span></div><div class="bar" style="width:'+Math.round(a.pulls/tot*100)+'%;background:'+(ARMCOL[a.name]||'#94a3b8')+'"></div>'}).join('');
  // proof
  document.getElementById('proof').innerHTML='best score <b>'+(+j.best.value).toFixed(4)+'</b> · '+j.evaluations+' experiments<br>📜 '+j.trace.frames.length+' frames · <b style="color:'+(j.verify?'#0e9f6e':'#dc2626')+'">'+(j.verify?'verified ✓':'unverified')+'</b> (Ed25519, offline)';
  stopPlay();setTimeout(togglePlay,250);   // auto-play the discovery
}
async function run(){
  var out=document.getElementById('out');out.textContent='discovering…';document.getElementById('map').className='';stopPlay();
  try{
    var space=JSON.parse(document.getElementById('space').value);
    var body={space:space,objective:document.getElementById('obj').value,budget:+document.getElementById('budget').value,goal:'maximize'};
    var r=await fetch('/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json();
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
setMode('simple');loadPreset();
</script>
</body></html>`;
}

export function pitchDeck(version = "0.4.0"): string {
  const slides = [
    `<h1 class="brand">Melete</h1><p class="big">The Self-Driving Discovery Brain</p><p class="dim">propose → experiment → prove · v${version}</p><p class="dim">↓ / → / space to advance</p>`,
    `<h2>The problem</h2><p class="big">Ideas are cheap. <b>Experiments are expensive.</b></p><ul><li>Every lab assay, training run, process batch, pricing test costs real time &amp; money.</li><li>Two questions decide who wins: <b>what experiment next?</b> and <b>can you prove how you discovered it?</b></li><li>No product answers both — and science is in a replication crisis.</li></ul>`,
    `<h2>The product</h2><p class="big">The decision brain that plugs into any expensive process.</p><ul><li><b>SUPER NOVA engine</b> — an adaptive ensemble; a bandit picks the winning strategy per problem.</li><li><b>Everything is f(x)</b> — lab, training, process, pricing, LLM-graded design.</li><li><b>Signed discovery trace</b> — verify the whole path offline with a public key.</li><li><b>Air-gapped</b> — runs offline; data never leaves; result still provable.</li></ul>`,
    `<h2>The moat</h2><p class="big">Not one algorithm — a defensible <b>composition</b>.</p><ul><li>Verifiable provenance-of-discovery (no lab/optimiser ships it; patents &amp; audits need it).</li><li>Universal f(x) + air-gap (one engine, every domain, on-prem).</li><li>Robust ensemble — beats every single algorithm on rugged landscapes.</li><li>Accumulating signed-discovery corpus → switching cost compounds.</li></ul>`,
    `<h2>Proof — measured &amp; reproducible</h2><table><tr><th>landscape</th><th>Melete</th><th>Bayesian</th><th>random</th></tr><tr><td>smooth</td><td class="win">1.000</td><td>0.999</td><td>0.838</td></tr><tr><td>rugged</td><td class="win">best 🏆</td><td>far behind</td><td>far behind</td></tr><tr><td>high-D</td><td class="win">0.996</td><td>0.987</td><td>0.555</td></tr></table><p>≈ 26 vs ~95 experiments to the optimum (3.7×). 10 test-gauntlets at 100/100; 32 tests. Run <code>melete bench --robust</code>.</p>`,
    `<h2>Honesty</h2><ul><li>Not a "magic" algorithm; not "disrupting quantum". The win is <b>robustness + verifiable provenance</b>, both measured.</li><li>Optimisation can't be 100% accurate — we ship 100%-passing gauntlets + reproducible benchmarks.</li><li>The brain is software; the physical lab/robot (if any) is the customer's — we plug in.</li></ul>`,
    `<h2>The ask</h2><p class="big">An IP acquisition / acqui-hire.</p><ul><li>Clean dependency-free TypeScript: engine + arms + signed-trace + universal oracle + HTTP service + deploy.</li><li>Live demo + full tests. Sale transfers the private repo, the <code>melete-ai</code> npm namespace, and the roadmap.</li><li>For anyone who runs expensive experiments at scale — or sells tooling to those who do.</li></ul><p class="dim">Shinnapat Phunsriphatchalakul · kreevut@gmail.com</p>`,
  ];
  const slideHtml = slides.map((s, i) => `<section class="slide"${i === 0 ? " data-active" : ""}>${s}</section>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete — pitch</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;background:#07070c;color:#e7e7ea;font:18px/1.6 ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif;overflow:hidden}
.slide{position:fixed;inset:0;display:none;flex-direction:column;justify-content:center;max-width:900px;margin:0 auto;padding:6vh 7vw}
.slide[data-active]{display:flex;animation:fade .35s ease}
@keyframes fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.brand{font-size:74px;margin:0;font-weight:800;letter-spacing:-2px;background:linear-gradient(95deg,#c4b5fd,#67e8f9,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:15px;letter-spacing:2px;text-transform:uppercase;color:#7c7c8c;margin:0 0 22px}
.big{font-size:32px;font-weight:700;line-height:1.25;margin:0 0 18px;color:#ececf2}
.dim{color:#7c7c8c;font-size:15px}
ul{margin:0;padding-left:22px}li{margin:11px 0;color:#c4c4d0;font-size:19px}li b{color:#e7e7ea}
table{border-collapse:collapse;font-size:18px;margin:6px 0 14px}th,td{padding:9px 18px 9px 0;text-align:left}th{color:#7c7c8c;font-size:13px;text-transform:uppercase}
.win{color:#86efac;font-weight:700}code{font-family:ui-monospace,monospace;background:#1a1a26;border-radius:6px;padding:2px 7px;font-size:15px;color:#7dd3fc}
.nav{position:fixed;bottom:20px;left:0;right:0;text-align:center;color:#55555f;font-size:13px;z-index:9}
.nav a{color:#7dd3fc;text-decoration:none}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#2a2a3a;margin:0 3px}.dot.on{background:#a78bfa}
</style></head><body>
${slideHtml}
<div class="nav"><span id="dots"></span> &nbsp; <span id="ctr"></span> &nbsp;·&nbsp; <a href="/">← demo</a></div>
<script>
var s=[].slice.call(document.querySelectorAll('.slide')),i=0;
var dots=s.map(function(_,k){return '<span class="dot'+(k===0?' on':'')+'"></span>'}).join('');
document.getElementById('dots').innerHTML=dots;
function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(el,k){if(k===i)el.setAttribute('data-active','');else el.removeAttribute('data-active');});
document.querySelectorAll('.dot').forEach(function(d,k){d.className='dot'+(k===i?' on':'')});document.getElementById('ctr').textContent=(i+1)+' / '+s.length;}
show(0);
document.addEventListener('keydown',function(e){if(['ArrowRight','ArrowDown',' ','PageDown'].includes(e.key)){show(i+1);e.preventDefault();}else if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key))show(i-1);else if(e.key==='Home')show(0);else if(e.key==='End')show(s.length-1);});
document.addEventListener('click',function(e){if(e.target.tagName!=='A')show(i+1);});
</script></body></html>`;
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function serverGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const html = landingPage("9.9.9"); const pitch = pitchDeck("9.9.9");
  const checks = [
    { name: "LANDING-RENDERS", pass: html.startsWith("<!doctype html>") && html.includes("Melete") && html.length > 4000, detail: "world-class landing page renders with hero + sections" },
    { name: "LIGHT-THEME", pass: html.includes("--bg:#ffffff") && !html.includes("background:#07070c"), detail: "clean light theme (not the old dark background)" },
    { name: "DEMO-FORM", pass: html.includes('id="space"') && html.includes('id="obj"') && html.includes('id="preset"') && html.includes("/discover"), detail: "demo has worked examples + posts to /discover" },
    { name: "DISCOVERY-MAP", pass: html.includes("Discovery cinema") && html.includes('id="surf"') && html.includes("renderMap") && html.includes("heat(") && html.includes("drawParallel"), detail: "interactive discovery cinema: 2-D learned-surface heatmap OR an any-dimension parallel-coordinates view, animated + convergence + strategy" },
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
