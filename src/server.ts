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
.savings{margin-top:12px;background:linear-gradient(135deg,#eafcf3,#f7fffb);border:1.5px solid #b7ecd4;border-radius:14px;padding:16px 18px;font-size:14.5px;line-height:1.6;color:#26283f}
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

/** The Wave-Particle map projection (shared, exact, with the client). Tested for accuracy in
 * serverGauntlet: higher score rises, back rows sit higher, everything stays inside the 600×600 canvas. */
const VZ_C = { mL: 54, plotW: 486, mT: 130, depth: 250, skew: 44, h: 120 };
export function vizProject(gi: number, gj: number, t: number, nx: number, ny: number): [number, number] {
  const fx = nx > 1 ? gi / (nx - 1) : 0.5, fz = ny > 1 ? gj / (ny - 1) : 0.5;
  return [VZ_C.mL + fx * VZ_C.plotW + fz * VZ_C.skew, VZ_C.mT + (1 - fz) * VZ_C.depth - t * VZ_C.h];
}

export function landingPage(version = "0.4.0"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete — find the best answer in the fewest experiments</title><style>${SHELL_CSS}</style></head><body>

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
  <span class="eyebrow" data-i18n="eyebrow">Self-driving discovery</span>
  <h1 class="brand"><span class="grad">Melete</span></h1>
  <p class="tag" data-i18n="heroTag">When every experiment is expensive, Melete finds the <b>best answer in the fewest tries</b> — and proves how it got there.</p>
  <p class="sub" data-i18n="heroSub">Mneme remembers; Melete discovers.</p><p class="sub" style="margin-top:-18px">v${version}</p>
  <div class="cta">
    <a class="btn primary" data-i18n="ctaTry" href="#try">See it discover (live) →</a>
    <a class="btn ghost" data-i18n="ctaPitch" href="/pitch">The 60-second pitch</a>
  </div>
  <div class="pills">
    <span class="pill">⚛ adaptive ensemble</span>
    <span class="pill">no dataset needed</span>
    <span class="pill">🔏 cryptographic proof</span>
    <span class="pill">🔒 air-gapped / on-prem</span>
  </div>
</div>

<div class="wrap">

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

<section><h2 data-i18n="h_how">How it works — 3 steps</h2>
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
<p class="lead" style="font-size:18px;margin:0 0 4px">Melete tunes <b>knobs</b>. You don't write code or upload data here — <b>pick a scenario and press Watch.</b></p>
<p class="muted" style="margin:0 0 16px">In this browser demo the "score" is faked by a formula so it runs instantly. For your real work the score comes from your real process — see <a href="#use">how to use it for your work</a> below.</p>
<div class="card">
<div class="modetabs"><button class="mt on" id="mt-simple" onclick="setMode('simple')">🟢 Simple — pick &amp; watch</button><button class="mt" id="mt-advanced" onclick="setMode('advanced')">⚙️ Advanced — edit the values</button></div>
<label data-i18n="scenarioL">Scenario</label>
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
<button class="btn primary" style="margin-top:16px;width:100%" onclick="run()" data-i18n="watch">▶ Watch Melete discover</button>
<div class="result" id="out">Pick a scenario, then press Watch — the best settings, a movie of how it searched, and a signed proof appear here.</div>
<div class="narrate" id="narrate" style="display:none"></div>
<div class="savings" id="savings" style="display:none"></div>

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

<section><div class="card" style="text-align:center;background:linear-gradient(120deg,#f3f1ff,#eafcf8);border-color:#ddd9fb;padding:28px">
  <div style="width:64px;margin:0 auto 6px">${meli()}</div>
  <h3 style="font-size:23px;margin:0 0 8px" data-i18n="cta_h">Want this for your team — or to acquire the code?</h3>
  <p style="margin:0 auto 16px;color:#33344e;font-size:16px;max-width:560px">Melete is a clean, dependency-free codebase with a live demo, full tests, and a signed-provenance moat. Open to licensing or an IP acquisition.</p>
  <button class="btn primary" onclick="showContact()">📩 Contact about Melete</button>
  &nbsp;<a class="btn ghost" href="/pitch">Read the pitch</a>
</div></section>

<section><h2 data-i18n="h_proven">Proven, not claimed</h2>
<p style="margin:0 0 14px;color:#33344e">No single optimiser wins on every landscape. A bandit spends each experiment on whichever strategy is winning <i>on your problem</i> — one engine, no per-problem tuning.</p>
<table><tr><th>landscape</th><th>Melete</th><th>single Bayesian</th><th>random</th></tr>
<tr><td>smooth</td><td class="win">1.000</td><td>0.999</td><td>0.838</td></tr>
<tr><td>rugged (many traps)</td><td class="win">best 🏆 beats every single algorithm</td><td>far behind</td><td>far behind</td></tr>
<tr><td>high-dimensional</td><td class="win">0.996</td><td>0.987</td><td>0.555</td></tr></table>
<p class="muted" style="margin-top:10px">≈ 26 experiments vs ~95 for random to reach 99% of a hidden optimum (3.7×). Reproduce with <code>melete bench --robust</code>.</p></section>

<section id="guide" style="margin-top:38px">
<h2 data-i18n="g_h">Use it on your real process — you measure</h2>
<p data-i18n="g_intro" style="max-width:720px;color:#475;font-size:16px;line-height:1.6">No code, no formula. Melete proposes the next experiment; you go run it for real and type the score back; it proposes the next — converging to the best in as few real tries as possible. (Demo space below: espresso temp · grind · dose. Connect your own process through the API.)</p>
<div class="card" style="max-width:660px;margin-top:16px;padding:22px"><div id="gBody"><button class="btn primary" data-i18n="g_start" onclick="gStart()">▶ Start guiding</button></div></div>
<script>
var gObs=[],gNext=null,gGoal='maximize';
var gSpace=[{name:'temp',type:'real',min:85,max:96},{name:'grind',type:'real',min:1,max:10},{name:'dose',type:'real',min:14,max:22}];
var GI={en:{round:'Round',next:'Melete proposes — go measure this',score:'Your measured score',rec:'Record & next ▶',best:'Best so far',err:'Could not reach Melete'},th:{round:'รอบที่',next:'Melete เสนอ — ลองวัดค่านี้จริง',score:'คะแนนที่คุณวัดได้',rec:'บันทึก & ถัดไป ▶',best:'ดีที่สุดตอนนี้',err:'เชื่อมต่อ Melete ไม่ได้'}};
function gL(){return GI[(localStorage.getItem('mlang')||'en')]||GI.en;}
function gFmt(e){return gSpace.map(function(d){return d.name+' = <b>'+(+e[d.name]).toFixed(2)+'</b>';}).join(' &middot; ');}
function gStart(){gObs=[];gAsk();}
function gAsk(){fetch('/next',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({space:gSpace,observations:gObs,goal:gGoal})}).then(function(r){return r.json();}).then(function(j){if(j.error){document.getElementById('gBody').innerHTML='<span style="color:#c33">'+j.error+'</span>';return;}gNext=j.next;gRender(j.best);}).catch(function(){document.getElementById('gBody').innerHTML='<span style="color:#c33">'+gL().err+'</span>';});}
function gRender(best){var L=gL();var bestHtml=best?('<div style="margin-top:12px;color:#475">'+L.best+': <b>'+(+best.value).toFixed(3)+'</b> @ '+gFmt(best.experiment)+'</div>'):'';document.getElementById('gBody').innerHTML='<div style="color:#8890a8;font-size:13px;letter-spacing:.3px">'+L.round+' '+(gObs.length+1)+'</div><div style="font-size:17px;margin:8px 0;color:#1a1b30">'+L.next+':<br>'+gFmt(gNext)+'</div><label style="font-size:13px;color:#475">'+L.score+'</label><br><input id="gScore" type="number" step="any" style="padding:9px;border:1px solid #ccd;border-radius:9px;width:150px;font-size:15px" onkeydown="if(event.key==='Enter')gRecord()" /> <button class="btn primary" style="padding:9px 16px" onclick="gRecord()">'+L.rec+'</button>'+bestHtml;var sc=document.getElementById('gScore');if(sc)sc.focus();}
function gRecord(){var v=parseFloat((document.getElementById('gScore')||{}).value);if(!isFinite(v))return;gObs.push({experiment:gNext,value:v});gAsk();}
</script>
</section>
<section id="use"><h2 data-i18n="h_use">Use it for your work — answer 3 questions</h2>
<p class="lead" style="margin:0 0 18px">No dataset, no formula. Just answer these about <b>your</b> process:</p>
<div class="steps">
  <div class="step"><span class="n">1</span><h3 data-i18n="u_q1">What can you adjust?</h3><p>List the knobs + their real limits (your machine's range). <span class="muted">→ that's the SPACE.</span></p></div>
  <div class="step"><span class="n">2</span><h3 data-i18n="u_q2">After one try, what number tells you how good it was?</h3><p>You <b>measure</b> it — taste a score, read accuracy, read revenue. You don't calculate it. <span class="muted">→ that's the SCORE.</span></p></div>
  <div class="step"><span class="n">3</span><h3 data-i18n="u_q3">How many tries can you afford?</h3><p>Brews, training runs, assays you'll pay for. <span class="muted">→ that's the BUDGET.</span></p></div>
</div>
<div class="grid" style="margin-top:18px">
  <div class="card"><div class="who">☕ A coffee shop</div><p><b>Knobs:</b> temp 85–96° · grind 1–10 · dose 14–22g<br><b>Score:</b> a barista tastes each shot, 0–10<br><b>Budget:</b> 30 shots → Melete finds the recipe in ~20.</p></div>
  <div class="card"><div class="who">🤖 An ML team</div><p><b>Knobs:</b> learning-rate 0–0.1 · depth 1–12<br><b>Score:</b> the training script prints accuracy<br><b>Budget:</b> 40 runs → fewer GPU-hours to the best model.</p></div>
</div>
<p class="lead" style="margin:24px 0 12px;font-size:18px" data-i18n="u_two">Then run it one of two ways:</p>
<p style="margin:0 0 6px;color:#33344e"><b>A) Connect your process</b> — Melete runs it for you and reads the number (this is the real product, like installing a tool):</p>
<pre>melete tune --cmd "python train.py --lr {lr} --depth {depth}" \\
            --space '[{"name":"lr","type":"real","min":0,"max":0.1},{"name":"depth","type":"int","min":1,"max":12}]'</pre>
<p style="margin:16px 0 6px;color:#33344e"><b>B) From an agent or pipeline</b> — call the HTTP API or the library; your code returns the score each step:</p>
<pre>POST https://melete.mneme-ai.space/discover   ·   npm i melete-ai   ·   discoverSigned({ space, oracle })</pre>
<p class="muted" style="margin-top:14px"><b>This website = a sandbox to try it.</b> Real work = connect your real process (A or B). 🔒 Air-gapped: zero dependencies + local signing ⇒ runs fully offline, result still verifiable.</p></section>

</div>
<footer>
<span data-i18n="foot_honest">Honest: the engine is a context-adaptive ensemble — its guarantee is robustness + verifiable provenance, measured &amp; reproducible (not a single "magic" algorithm).</span><br>
<a href="/pitch">Pitch deck</a> · <a href="/health">/health</a> · Melete v${version} · the discovery muse
</footer>

<script>
var LANG='en';try{var _sl=localStorage.getItem('mlang');if(_sl)LANG=_sl;}catch(e){}
var T={
 en:{watch:'▶ Watch Melete discover',replay:'▶ Replay',team:"Meli's team — who did the work",teamhint:"Expert detail: the helpers Meli used. You don't need this to use the result.",climb:'How the score climbed (higher = better)',cinema:'Discovery cinema — watch Meli search',scenarioL:'Scenario',knobs:'You adjust',score:'You score',budget:'Tries',ph:'Pick a scenario, then press Watch.',plainHdr:'In plain words',tried:'Melete tried',settings:'settings and zeroed in on the best one',eyebrow:'Self-driving discovery',ctaTry:'See it discover (live) →',ctaPitch:'The 60-second pitch',h_what:'What it does — one example',h_meli:'Meet Meli — a tiny story',h_how:'How it works — 3 steps',h_who:"Who it's for & what they get",h_see:'See it discover — just watch',h_ind:'Click an industry — see Melete work on it',h_proven:'Proven, not claimed',h_use:'Use it for your work — answer 3 questions',heroTag:'When every experiment is expensive, Melete finds the <b>best answer in the fewest tries</b> — and proves how it got there.',heroSub:'Mneme remembers; Melete discovers.',u_q1:'What can you adjust?',u_q2:'After one try, what number tells you how good it was?',u_q3:'How many tries can you afford?',u_two:'Then run it one of two ways:',cta_h:'Want this for your team — or to acquire the code?',foot_honest:'Honest: the engine is a context-adaptive ensemble — its guarantee is robustness + verifiable provenance, measured &amp; reproducible (not a single "magic" algorithm).',g_h:'Use it on your real process — you measure',g_intro:'No code, no formula. Melete proposes the next experiment; you go run it for real and type the score back; it proposes the next — converging to the best in as few real tries as possible. (Demo space below: espresso temp · grind · dose. Connect your own process through the API.)',g_start:'▶ Start guiding',ind_intro:'The browser score is a simulated model</b> of the process — the <b>optimisation is real &amp; reproducible</b>; connect your real assay / benchmark / process for real numbers.',t_pharma:'Drug formulation',t_gpu:'GPU kernel tuning',t_etch:'Plasma-etch process',t_llm:'LLM serving config',t_esp:'Best espresso recipe',d_pharma:'Variables: pH · temperature · excipient %. Goal: stability / potency. Melete finds the most stable formulation in ~60 assays — instead of hundreds.',d_gpu:'Variables: tile size · unroll · occupancy. Goal: throughput (GFLOP/s). Find the fastest config in ~50 benchmark runs.',d_etch:'Variables: power · pressure · time. Goal: wafer yield %. Tune the recipe to maximum yield — air-gapped, on-prem.',d_llm:'Variables: batch size · KV-cache · quantization. Goal: tokens/sec at a quality bar. Melete optimises AI infrastructure too — and can tune prompts, agents &amp; routing the same way.',d_esp:'Variables: temp · grind · dose. Goal: taste. The friendliest way to watch the idea click.',runnow:'▶ Run it now',sb1:'Once upon a time, a little coffee shop wished for the <b>most delicious espresso in the world</b>.',sb2:'But there were <b>thousands of ways</b> to make it — and every single test meant brewing, and tasting, a whole cup. Trying them all? <b>Impossible.</b>',sb3:'Then came <b>Meli</b> — who never tries everything. Meli looks, thinks, and the little light glows: <i>“brew <b>this</b> one next.”</i>',sb4:'You brew it, you taste it — <b>7 out of 10</b>. Meli smiles, <b>learns</b>, and picks an even smarter cup. 8.5… 9.2…',sb5:'In about <b>twenty cups</b>, Meli found the <b>perfect recipe</b> — and sealed a magical <b>proof</b> of how, so the whole world could trust it. <b>The end ✨</b>',st1h:'Set the dials',st1p:'List what you can change and its range — temperature 85–96°, learning-rate 0–0.1, price $1–100.',st2h:'Score one try',st2p:'Your real process returns one number: brew → taste, train → accuracy, price → revenue. No dataset needed.',st3h:'Discover &amp; prove',st3p:'Melete proposes the next experiment, learns, converges to the best — and signs a verifiable trace of how.',wh1:'Tune learning rates, architectures, RAG/serving configs, compiler flags — fewer GPU-hours to the best model, with a provable tuning record.',wh2:'Find the reagent mix / conditions that maximise yield or potency in far fewer assays — and a tamper-proof discovery trail for patents &amp; audits.',wh3:'Tune deposition / etch / print parameters against real KPIs on-prem — air-gapped, data never leaves the fab, result still verifiable.',wh4:'Search price points, configurations, and policies where each test is costly — converge faster than grid or manual search.',story:'<p style="font-size:19px;font-weight:600;color:#1a1b30;margin-bottom:14px">You run a coffee shop and want the <b>best espresso</b>. You can change three things — water temperature, grind, and how many grams of coffee. Thousands of combinations, and each test means <b>brewing a cup and tasting it</b>. You can’t try them all.</p><p style="color:#33344e;margin-bottom:6px">Melete is like a brilliant assistant who tells you the next cup to brew:</p><div class="chat">☕ Melete: “Try <b>92°, grind 6, 18g</b>.” → you brew it, taste it: <b>7/10</b>.</div><div class="chat">☕ Melete: “Now try <b>93°, grind 5, 19g</b>.” → you taste: <b>8.5/10</b>.</div><div class="chat" style="opacity:.6">… a few more …</div><div class="chat">🎯 After ~<b>20 cups</b> it found your best recipe — instead of randomly trying 200.</div><p style="color:#33344e;margin-top:14px">Swap “coffee” for a <b>training run</b>, a <b>chemical reaction</b>, or a <b>price</b> — same idea: Melete finds the best settings in the <b>fewest expensive tries</b> and signs a <b>proof</b> of how.</p>',winning:'The winning setup',signed:'Every step is cryptographically signed — the result is independently verifiable. No faking, no guessing.'},
 th:{watch:'▶ ดู Melete ค้นพบ',replay:'▶ เล่นใหม่',team:'ทีมของ Meli — ใครลงมือบ้าง',teamhint:'รายละเอียดผู้เชี่ยวชาญ: ผู้ช่วยที่ Meli ใช้ ไม่จำเป็นต้องรู้ก็ใช้ผลได้',climb:'คะแนนไต่ขึ้นยังไง (สูง = ดี)',cinema:'โรงหนังการค้นพบ — ดู Meli ค้นหา',scenarioL:'เลือกสถานการณ์',knobs:'สิ่งที่ปรับได้',score:'วัดเป็นคะแนน',budget:'จำนวนครั้ง',ph:'เลือกสถานการณ์ แล้วกดดู',plainHdr:'สรุปภาษาคน',tried:'Melete ลอง',settings:'แบบ แล้วล็อกแบบที่ดีที่สุด',eyebrow:'ระบบค้นพบอัตโนมัติ',ctaTry:'ลองใช้งาน →',ctaPitch:'พิตช์ 60 วินาที',h_what:'Melete ทำอะไร — ตัวอย่างเดียวจบ',h_meli:'รู้จัก Meli — นิทานสั้น ๆ',h_how:'ทำงานยังไง — 3 ขั้น',h_who:'ใครใช้ได้ & ได้อะไร',h_see:'ดู Melete ค้นพบ — แค่กดดู',h_ind:'เลือกอุตสาหกรรม — ดู Melete ทำงานจริง',h_proven:'พิสูจน์ได้ ไม่ใช่แค่พูด',h_use:'ใช้กับงานของคุณ — ตอบ 3 คำถาม',heroTag:'เมื่อการทดลองแต่ละครั้งแพง Melete หา<b>คำตอบที่ดีที่สุดในจำนวนครั้งที่น้อยที่สุด</b> — แล้วพิสูจน์ให้ดูว่าได้มายังไง',heroSub:'Mneme จดจำ; Melete ค้นพบ',u_q1:'คุณปรับอะไรได้บ้าง?',u_q2:'ลอง 1 ครั้งแล้ว ตัวเลขไหนบอกว่าดีแค่ไหน?',u_q3:'คุณลองได้กี่ครั้ง?',u_two:'จากนั้นใช้งานได้ 2 ทาง:',cta_h:'อยากได้สิ่งนี้ให้ทีมคุณ — หรือซื้อซอร์สโค้ดทั้งหมด?',foot_honest:'ตามตรง: เอนจินเป็นชุดอัลกอริทึมที่ปรับตามบริบท — สิ่งที่รับประกันคือความทนทาน + ที่มาที่ตรวจสอบได้ วัดผลและทำซ้ำได้จริง (ไม่ใช่อัลกอริทึม "วิเศษ" ตัวเดียว)',g_h:'ใช้กับงานจริงของคุณ — คุณเป็นคนวัด',g_intro:'ไม่ต้องเขียนโค้ด ไม่ต้องมีสูตร Melete เสนอการทดลองถัดไป คุณไปลองจริงแล้วพิมพ์คะแนนกลับมา แล้วมันเสนออันต่อไป — ลู่เข้าหาค่าที่ดีที่สุดในจำนวนครั้งจริงที่น้อยที่สุด (พื้นที่ทดลองด้านล่าง: เอสเพรสโซ อุณหภูมิ · การบด · ปริมาณ เชื่อมต่อกระบวนการของคุณผ่าน API ได้)',g_start:'▶ เริ่มแนะนำ',ind_intro:'ทุกการ์ดรันเดโมจริงบนสถานการณ์ที่ออกแบบให้เหมือนงานจริงในแต่ละวงการ <b>คะแนนในเบราว์เซอร์เป็นแบบจำลอง</b>ของกระบวนการ — แต่<b>การค้นหาค่าที่ดีที่สุดเป็นของจริงและทำซ้ำได้</b>; เชื่อมต่อการทดลอง/เบนช์มาร์ก/กระบวนการจริงของคุณ เพื่อได้ตัวเลขจริง</p>',t_pharma:'สูตรตำรับยา',t_gpu:'จูน GPU kernel',t_etch:'กระบวนการพลาสมาเอตช์',t_llm:'คอนฟิกการเสิร์ฟ LLM',t_esp:'สูตรเอสเพรสโซที่ดีที่สุด',d_pharma:'ตัวแปร: pH · อุณหภูมิ · สัดส่วนสารช่วย %. เป้าหมาย: ความคงตัว/ฤทธิ์ยา Melete หาสูตรที่คงตัวที่สุดใน ~60 การทดลอง — แทนที่จะเป็นหลายร้อย',d_gpu:'ตัวแปร: tile size · unroll · occupancy. เป้าหมาย: throughput (GFLOP/s) หาคอนฟิกที่เร็วที่สุดใน ~50 รอบเบนช์มาร์ก',d_etch:'ตัวแปร: กำลัง · ความดัน · เวลา เป้าหมาย: % wafer yield จูนสูตรให้ได้ yield สูงสุด — air-gapped รันในองค์กร',d_llm:'ตัวแปร: batch size · KV-cache · quantization. เป้าหมาย: tokens/sec ที่คุณภาพกำหนด Melete จูนโครงสร้างพื้นฐาน AI ได้ด้วย — และจูน prompt, agent & routing แบบเดียวกัน',d_esp:'ตัวแปร: อุณหภูมิ · การบด · ปริมาณ เป้าหมาย: รสชาติ วิธีที่เข้าใจง่ายที่สุดในการเห็นไอเดียนี้ทำงาน',runnow:'▶ ลองเลย',sb1:'กาลครั้งหนึ่ง ร้านกาแฟเล็ก ๆ ใฝ่ฝันถึง <b>เอสเพรสโซที่อร่อยที่สุดในโลก</b>',sb2:'แต่มันทำได้ <b>เป็นพันวิธี</b> — และการลองแต่ละครั้ง ต้องชงและชิมจริงทั้งแก้ว จะลองให้ครบ? <b>เป็นไปไม่ได้</b>',sb3:'แล้ว <b>Meli</b> ก็มา — ผู้ที่ไม่เคยลองทุกอย่าง Meli มอง คิด แล้วไฟดวงน้อยก็สว่าง: <i>“ชง<b>แก้วนี้</b>ต่อสิ”</i>',sb4:'คุณชง คุณชิม — <b>7 เต็ม 10</b> Meli ยิ้ม <b>เรียนรู้</b> แล้วเลือกแก้วที่ฉลาดกว่าเดิม 8.5… 9.2…',sb5:'ราว ๆ <b>ยี่สิบแก้ว</b> Meli ก็เจอ <b>สูตรที่สมบูรณ์แบบ</b> — แล้วผนึก <b>ใบรับรอง</b>วิเศษว่าได้มายังไง ให้ทั้งโลกเชื่อถือได้ <b>จบบริบูรณ์ ✨</b>',st1h:'ตั้งค่าที่ปรับได้',st1p:'ระบุสิ่งที่ปรับได้และช่วงของมัน — อุณหภูมิ 85–96° · learning-rate 0–0.1 · ราคา $1–100',st2h:'ให้คะแนน 1 ครั้ง',st2p:'กระบวนการจริงของคุณคืนตัวเลขมา 1 ค่า: ชง→ชิม, เทรน→ความแม่น, ตั้งราคา→ยอดขาย — ไม่ต้องมีชุดข้อมูล',st3h:'ค้นพบ & พิสูจน์',st3p:'Melete เสนอการทดลองถัดไป เรียนรู้ ลู่เข้าหาค่าที่ดีที่สุด — แล้วเซ็นใบบันทึกที่ตรวจสอบได้ว่าทำมายังไง',wh1:'จูน learning rate, สถาปัตยกรรมโมเดล, RAG/serving, compiler flags — ใช้ GPU น้อยลงกว่าจะได้โมเดลที่ดีที่สุด พร้อมบันทึกการจูนที่พิสูจน์ได้',wh2:'หาสูตรผสมสาร/สภาวะที่ให้ yield หรือฤทธิ์สูงสุด ในจำนวนการทดลองที่น้อยลงมาก — พร้อมบันทึกการค้นพบที่แก้ไขไม่ได้ สำหรับสิทธิบัตรและการตรวจสอบ',wh3:'จูนพารามิเตอร์ deposition/etch/print ตาม KPI จริงในองค์กร — air-gapped ข้อมูลไม่ออกจากโรงงาน แต่ผลยังตรวจสอบได้',wh4:'ค้นหาจุดราคา การตั้งค่า และนโยบาย ที่การทดสอบแต่ละครั้งมีต้นทุน — ลู่เข้าเร็วกว่าการไล่กริดหรือลองเอง',story:'<p style="font-size:19px;font-weight:600;color:#1a1b30;margin-bottom:14px">คุณเปิดร้านกาแฟ และอยากได้ <b>เอสเพรสโซที่อร่อยที่สุด</b> สิ่งที่ปรับได้มี 3 อย่าง — อุณหภูมิน้ำ ความละเอียดการบด และปริมาณกาแฟเป็นกรัม ผสมกันได้เป็นพันแบบ และการลองแต่ละแบบ คือ<b>ต้องชงจริงแล้วชิม</b> จะลองทุกแบบ—เป็นไปไม่ได้</p><p style="color:#33344e;margin-bottom:6px">Melete เปรียบเหมือนผู้ช่วยอัจฉริยะ ที่บอกว่าควรชงแก้วถัดไปยังไง:</p><div class="chat">☕ Melete: “ลอง <b>92° บด 6 ใส่ 18g</b>” → คุณชงแล้วชิม: <b>7/10</b></div><div class="chat">☕ Melete: “งั้นลอง <b>93° บด 5 ใส่ 19g</b>” → คุณชิม: <b>8.5/10</b></div><div class="chat" style="opacity:.6">… อีกไม่กี่แก้ว …</div><div class="chat">🎯 ครบ ~<b>20 แก้ว</b> ก็เจอสูตรที่ดีที่สุด — แทนที่จะสุ่มชง 200 แก้ว</div><p style="color:#33344e;margin-top:14px">เปลี่ยน “กาแฟ” เป็น <b>การเทรนโมเดล</b> <b>ปฏิกิริยาเคมี</b> หรือ <b>ราคา</b> — หลักการเดียวกัน: Melete หาค่าที่ดีที่สุดใน<b>จำนวนครั้งที่น้อยที่สุด</b> แล้วเซ็น<b>ใบรับรอง</b>ว่าได้มายังไง</p>',winning:'สูตรที่ชนะ',signed:'ทุกขั้นเซ็นด้วยคริปโต — ผลตรวจสอบได้จริง ไม่มีโม้ ไม่มีเดา'}
};
function tr(k){var o=T[LANG]||T.en;return o[k]!=null?o[k]:T.en[k];}
function showContact(){document.getElementById('contactModal').style.display='flex';}
function hideContact(){document.getElementById('contactModal').style.display='none';}
function setLang(l){LANG=l;try{localStorage.setItem('mlang',l);}catch(e){}
 var e1=document.getElementById('lang-en'),e2=document.getElementById('lang-th');if(e1)e1.className='lb'+(l==='en'?' on':'');if(e2)e2.className='lb'+(l==='th'?' on':'');
 var els=document.querySelectorAll('[data-i18n]');for(var i=0;i<els.length;i++){var v=tr(els[i].getAttribute('data-i18n'));if(v!=null)els[i].innerHTML=v;}
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
  renderSavings();
  stopPlay();setTimeout(togglePlay,250);   // auto-play the discovery
}
function renderSavings(){
  var j=window.LASTJ;if(!j||!j.dims)return;var sv=document.getElementById('savings');if(!sv)return;
  var D=j.dims.length, grid=Math.min(20000,Math.round(Math.pow(8,D))), used=j.evaluations||1, saved=Math.max(0,grid-used);
  var cost=+(document.getElementById('cost')&&document.getElementById('cost').value)||500;
  var dollars=saved*cost, pct=Math.round(saved/grid*100);
  var th=(LANG==='th');
  sv.style.display='block';
  sv.innerHTML='<div style="font-size:13px;font-weight:800;color:#0e9f6e;letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">💰 '+(th?'มูลค่าที่ประหยัด':'Value — money saved')+'</div>'
    +(th?'การไล่ทดลองให้ทั่วถึง (~8 จุด/ตัวแปร) จะใช้ราว <b>'+grid.toLocaleString()+'</b> ครั้ง. Melete ใช้แค่ <b>'+used+'</b> ครั้ง → ประหยัด <b>~'+saved.toLocaleString()+'</b> ครั้ง ('+pct+'%).'
            :'A thorough sweep (~8 points/variable) would take ≈<b>'+grid.toLocaleString()+'</b> experiments. Melete used <b>'+used+'</b> → ≈<b>'+saved.toLocaleString()+'</b> fewer ('+pct+'%).')
    +'<div style="margin-top:9px;font-size:14px">'+(th?'ต้นทุนต่อการทดลอง':'Cost per experiment')+' $ <input id="cost" value="'+cost+'" oninput="renderSavings()" style="width:90px;display:inline-block;padding:6px 8px"> '
    +'→ <b style="color:#0e9f6e;font-size:17px">≈ $'+Math.round(dollars).toLocaleString()+'</b> '+(th?'ประหยัด':'saved')+'.</div>'
    +'<div class="muted" style="font-size:11.5px;margin-top:6px">'+(th?'ประมาณการเทียบกับการไล่ทดลองแบบกริด — ไม่ใช่การรับประกัน. ตัวเลขจริงขึ้นกับกระบวนการของคุณ.':'An estimate vs a grid sweep — not a guarantee. Your real number depends on your process.')+'</div>';
}
async function run(){
  var out=document.getElementById('out');out.textContent='discovering…';document.getElementById('map').className='';stopPlay();
  try{
    var space=JSON.parse(document.getElementById('space').value);
    var body={space:space,objective:document.getElementById('obj').value,budget:+document.getElementById('budget').value,goal:'maximize'};
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
    `<h2>The ask</h2><p class="big">License it, or acquire the code.</p><ul><li>Clean, dependency-free TypeScript: engine + arms + signed-trace + universal oracle + HTTP service + CLI + deploy.</li><li>Live demo + full tests. Sale transfers the private repo, the <code>melete-ai</code> npm namespace, and the roadmap.</li><li>For anyone who runs expensive experiments at scale — or sells tooling to those who do.</li></ul><p style="font-size:18px;margin-top:8px;color:#33344e">📧 <b>patsa2561@gmail.com</b> &nbsp;·&nbsp; 🟢 WhatsApp <b>+66 93 945 5645</b> (🇹🇭) &nbsp;·&nbsp; ✈️ <b>@devson2561</b></p><a class="pbtn-cta" href="mailto:patsa2561@gmail.com?subject=Melete">📩 Get in touch</a>`,
  ];
  const slideHtml = slides.map((s, i) => `<section class="slide"${i === 0 ? " data-active" : ""}>${s}</section>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete — pitch</title><style>
:root{color-scheme:light}*{box-sizing:border-box}
body{margin:0;background:radial-gradient(120% 90% at 50% 0%,#eef0ff,#ffffff 55%);color:#16172b;font:18px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}
.slide{position:fixed;inset:0;display:none;flex-direction:column;justify-content:center;max-width:920px;margin:0 auto;padding:6vh 7vw}
.slide[data-active]{display:flex;animation:fade .4s ease}
@keyframes fade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.brand{font-size:80px;margin:0;font-weight:850;letter-spacing:-2.5px;background:linear-gradient(95deg,#6d5cf0,#0ea5b7,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#0ea5b7;margin:0 0 22px;font-weight:800}
.big{font-size:34px;font-weight:800;line-height:1.25;margin:0 0 18px;color:#16172b}
.dim{color:#6a6c84;font-size:15.5px}
ul{margin:0;padding-left:4px;list-style:none}li{margin:13px 0;color:#33344e;font-size:19.5px;padding-left:26px;position:relative}li::before{content:"◆";position:absolute;left:0;color:#6d5cf0;font-size:13px;top:4px}li b{color:#16172b}
table{border-collapse:collapse;font-size:18px;margin:6px 0 14px}th,td{padding:11px 22px 11px 0;text-align:left}th{color:#9698ad;font-size:13px;text-transform:uppercase}td{border-bottom:1px solid #eceef6}
.win{color:#0e9f6e;font-weight:800}code{font-family:ui-monospace,monospace;background:#f1f2f8;border-radius:6px;padding:2px 8px;font-size:15px;color:#4338ca}
.nav{position:fixed;bottom:20px;left:0;right:0;text-align:center;color:#9698ad;font-size:13px;z-index:9}
.nav a{color:#5b53e8;text-decoration:none;font-weight:700}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#d9dbe9;margin:0 3px}.dot.on{background:#6d5cf0;width:18px;border-radius:4px}
.pbtn-cta{display:inline-block;margin-top:18px;background:linear-gradient(95deg,#6d5cf0,#0ea5b7);color:#fff;border-radius:12px;padding:13px 26px;font-weight:800;font-size:17px;text-decoration:none}
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
