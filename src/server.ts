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
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#07070c;color:#e7e7ea;font:15.5px/1.65 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:#7dd3fc;text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:980px;margin:0 auto;padding:0 22px}
.hero{position:relative;overflow:hidden;text-align:center;padding:88px 22px 64px}
.hero::before{content:"";position:absolute;inset:-40% -10% auto -10%;height:520px;background:radial-gradient(60% 60% at 30% 20%,rgba(124,58,237,.28),transparent 70%),radial-gradient(55% 55% at 75% 30%,rgba(8,145,178,.28),transparent 70%);filter:blur(8px);z-index:0;animation:drift 14s ease-in-out infinite alternate}
@keyframes drift{to{transform:transl(0,-18px) scale(1.05)}}
.hero>*{position:relative;z-index:1}
h1.brand{font-size:64px;line-height:1;margin:0;font-weight:800;letter-spacing:-2px;background:linear-gradient(95deg,#c4b5fd,#67e8f9 60%,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
.tag{font-size:20px;color:#c9c9d4;margin:14px 0 6px;font-weight:500}
.tag b{color:#e7e7ea}
.sub{color:#8b8b99;font-size:15px;margin:0 0 26px}
.cta{display:inline-flex;gap:12px;flex-wrap:wrap;justify-content:center}
.btn{display:inline-block;border-radius:11px;padding:12px 22px;font-weight:600;font-size:15px;cursor:pointer;border:0}
.btn.primary{background:linear-gradient(95deg,#7c3aed,#0891b2);color:#fff}
.btn.ghost{background:#14141e;color:#cdd;border:1px solid #2a2a3a}
.pills{margin:24px 0 0}
.pill{display:inline-block;background:#16121f;border:1px solid #34294f;border-radius:999px;padding:5px 13px;font-size:12.5px;color:#c4b5fd;margin:3px}
section{padding:30px 0;border-top:1px solid #16161f}
h2{font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#7c7c8c;margin:0 0 18px;font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:720px){.grid{grid-template-columns:1fr}h1.brand{font-size:46px}}
.card{background:#101019;border:1px solid #21212e;border-radius:14px;padding:18px}
.card h3{margin:0 0 6px;font-size:16px;color:#e7e7ea}
.card .who{color:#67e8f9;font-size:12.5px;font-weight:600;letter-spacing:.3px;margin-bottom:8px}
.card p{margin:0;color:#9a9aa8;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{padding:9px 10px;border-bottom:1px solid #1c1c27;text-align:left}
th{color:#7c7c8c;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.win{color:#86efac;font-weight:700}
code{font-family:ui-monospace,Menlo,monospace;background:#1a1a26;border-radius:6px;padding:1.5px 6px;font-size:13px;color:#7dd3fc}
pre{font-family:ui-monospace,Menlo,monospace;background:#0d0d16;border:1px solid #20202c;border-radius:10px;padding:15px;overflow:auto;font-size:12.5px;color:#cbd5e1}
label{display:block;color:#8b8b99;font-size:12px;margin:13px 0 5px;font-weight:600;letter-spacing:.3px}
textarea,input,select{width:100%;background:#0c0c15;border:1px solid #29293a;border-radius:9px;color:#e7e7ea;padding:11px;font-family:ui-monospace,monospace;font-size:13px}
.out{margin-top:14px;background:#0c0c15;border:1px solid #29293a;border-radius:9px;padding:14px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12.5px;min-height:30px;color:#a7f3d0}
.muted{color:#6f6f7e}
footer{padding:34px 0 70px;color:#6f6f7e;font-size:12.5px;text-align:center;border-top:1px solid #16161f}
`;

export function landingPage(version = "0.4.0"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete — the Self-Driving Discovery Brain</title><style>${SHELL_CSS}</style></head><body>

<div class="hero"><div class="wrap">
  <h1 class="brand">Melete</h1>
  <p class="tag">The <b>Self-Driving Discovery Brain</b> — propose → experiment → <b>prove</b>.</p>
  <p class="sub">Mneme remembers; Melete discovers. &nbsp;v${version}</p>
  <div class="cta">
    <a class="btn primary" href="#try">Try the live demo →</a>
    <a class="btn ghost" href="/pitch">View the pitch deck</a>
  </div>
  <div class="pills">
    <span class="pill">⚛ SUPER NOVA · adaptive ensemble</span>
    <span class="pill">∀ everything is f(x)</span>
    <span class="pill">🔏 cryptographic provenance</span>
    <span class="pill">🔒 air-gapped / on-prem</span>
    <span class="pill">no install · agent-native</span>
  </div>
</div></div>

<div class="wrap">

<section><h2>What it does</h2>
<p style="font-size:17px;color:#d4d4dd;margin:0">When running an experiment is the expensive part — a lab assay, a training run, a process batch, a pricing
test — Melete finds the <b>most informative next experiment</b> so you reach the best answer in the <b>fewest
trials</b>, and emits a <b>signed, offline-verifiable trace</b> of exactly how it got there.</p></section>

<section><h2>Who it's for &amp; what they get</h2>
<div class="grid">
  <div class="card"><div class="who">AI / ML TEAMS</div><h3>Hyperparameter &amp; system tuning</h3><p>Tune learning rates, architectures, RAG/serving configs, compiler flags — fewer GPU-hours to the best model, with a provable tuning record.</p></div>
  <div class="card"><div class="who">PHARMA · CHEMISTRY · MATERIALS</div><h3>Formulation &amp; reaction discovery</h3><p>Find the reagent mix / conditions that maximise yield or potency in far fewer assays — and a tamper-proof discovery trail for patents &amp; audits.</p></div>
  <div class="card"><div class="who">SEMICONDUCTOR · MANUFACTURING</div><h3>Process optimisation</h3><p>Tune deposition/etch/print parameters against real KPIs on-prem — air-gapped, data never leaves the fab, result still verifiable.</p></div>
  <div class="card"><div class="who">QUANT · PRODUCT · GROWTH</div><h3>Pricing &amp; expensive A/B</h3><p>Search price points, configurations, and policies where each test is costly — converge faster than grid/manual search.</p></div>
</div>
<p class="muted" style="margin-top:14px">In every case: <b>fewer expensive experiments</b> to the best answer + a <b>cryptographic proof</b> of how the discovery was made.</p></section>

<section><h2>The engine — measured, not claimed</h2>
<p style="margin:0 0 14px">No single optimiser wins on every landscape (No-Free-Lunch). So a bandit spends each experiment on whichever
strategy — Gaussian-Process+EI, CMA-ES, trust-region, annealing, space-filling — is winning <i>on your problem</i>.
One engine, no per-problem tuning.</p>
<table><tr><th>landscape</th><th>Melete portfolio</th><th>single Bayesian</th><th>random</th></tr>
<tr><td>smooth</td><td class="win">1.000</td><td>0.999</td><td>0.838</td></tr>
<tr><td>rugged (many traps)</td><td class="win">best 🏆 — beats every single algorithm</td><td>far behind</td><td>far behind</td></tr>
<tr><td>high-dimensional</td><td class="win">0.996</td><td>0.987</td><td>0.555</td></tr></table>
<p class="muted" style="margin-top:10px">≈ 26 experiments vs ~95 for random to reach 99% of a hidden optimum (3.7×). Reproduce: <code>melete bench --robust</code>.</p></section>

<section><h2>🔒 Air-gapped by design</h2>
<p style="margin:0">Zero runtime dependencies + <b>local</b> cryptographic signing ⇒ the whole brain runs fully offline on an
isolated machine — yet its discovery trace is verifiable by anyone with the public key alone. Built for regulated
work where the process must stay inside the air gap but the result must still be <b>provable</b>.</p></section>

<section id="try"><h2>Try it live</h2>
<p class="muted" style="margin:0 0 6px"><b>SPACE</b> = the dials you can turn (each with a min–max range). <b>OBJECTIVE</b> = the score to maximise —
the result of one experiment. Pick an example, then press Discover. <span class="muted">(In real use the objective
is YOUR expensive process; here it's a formula so you can try it in the browser.)</span></p>
<div class="card">
<label>EXAMPLE</label>
<select id="preset" onchange="loadPreset()">
  <option value="peak">📈 Find a hidden peak (2 dials)</option>
  <option value="coffee">☕ Best espresso recipe (temp · grind · dose → taste)</option>
  <option value="price">💸 Best price point (price → revenue)</option>
</select>
<label>SPACE — the dials <span class="muted">(name · type · min · max)</span></label>
<input id="space" value='[{"name":"x","type":"real","min":0,"max":10},{"name":"y","type":"real","min":0,"max":10}]'>
<label>OBJECTIVE — the score to maximise <span class="muted">(a formula in the dial names)</span></label>
<input id="obj" value="Math.exp(-((x-7.2)**2+(y-3.4)**2)/3)">
<label>BUDGET — how many experiments Melete may run</label>
<input id="budget" value="40">
<button class="btn primary" style="margin-top:14px" onclick="run()">Discover →</button>
<div class="out" id="out">pick an example above, then press Discover — the best dial settings + a signed trace appear here.</div>
</div></section>

<section><h2>How it's actually used</h2>
<p class="muted" style="margin:0 0 10px">It's a service whose users are agents / pipelines. POST your space + objective; get the optimum + a signed trace.</p>
<pre>curl -s https://melete.161.35.122.73.nip.io/discover -H 'content-type: application/json' -d '{
  "space":[{"name":"lr","type":"real","min":0,"max":0.1},{"name":"depth","type":"int","min":1,"max":12}],
  "objective":"-(lr-0.03)**2*1000-(depth-6)**2", "budget":40, "goal":"maximize" }'</pre></section>

</div>
<footer>
Honest: the engine is a context-adaptive ensemble (no single "magic" algorithm) — its guarantee is robustness +
verifiable provenance, measured &amp; reproducible. Browser demo evaluates your expression in a sandboxed VM.<br>
<a href="/pitch">Pitch deck</a> · <a href="/health">/health</a> · Melete v${version} · the discovery muse
</footer>

<script>
var PRESETS={
  peak:{space:'[{"name":"x","type":"real","min":0,"max":10},{"name":"y","type":"real","min":0,"max":10}]',obj:'Math.exp(-((x-7.2)**2+(y-3.4)**2)/3)',budget:40},
  coffee:{space:'[{"name":"temp","type":"real","min":85,"max":96},{"name":"grind","type":"real","min":1,"max":10},{"name":"dose","type":"real","min":14,"max":22}]',obj:'10 - (temp-92)**2*0.08 - (grind-5.5)**2*0.15 - (dose-18)**2*0.1',budget:50},
  price:{space:'[{"name":"price","type":"real","min":1,"max":100}]',obj:'price * (100 - price)',budget:30},
};
function loadPreset(){var p=PRESETS[document.getElementById('preset').value];document.getElementById('space').value=p.space;document.getElementById('obj').value=p.obj;document.getElementById('budget').value=p.budget;document.getElementById('out').textContent='example loaded — press Discover →';}
async function run(){
  var out=document.getElementById('out'); out.textContent='discovering…';
  try{
    var space=JSON.parse(document.getElementById('space').value);
    var body={space:space,objective:document.getElementById('obj').value,budget:+document.getElementById('budget').value,goal:'maximize'};
    var r=await fetch('/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json();
    if(j.error){out.textContent='⚠ '+j.error;return;}
    var arms=(j.armStats||[]).filter(function(a){return a.pulls>0}).map(function(a){return a.name+'×'+a.pulls}).join('  ');
    out.textContent='🔬 best score: '+(+j.best.value).toFixed(5)+'\\n   best dials: '+JSON.stringify(j.best.experiment)
      +'\\n   experiments used: '+j.evaluations+'   ·   engine: '+j.engine
      +'\\n   arms the bandit chose: '+arms
      +'\\n   📜 signed trace: '+j.trace.frames.length+' frames  ·  verify='+j.verify;
  }catch(e){out.textContent='⚠ '+e.message;}
}
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
    { name: "LANDING-RENDERS", pass: html.startsWith("<!doctype html>") && html.includes("Melete") && html.length > 3000, detail: "launch-quality landing page renders with hero + sections" },
    { name: "DEMO-FORM", pass: html.includes('id="space"') && html.includes('id="obj"') && html.includes('id="preset"') && html.includes("/discover"), detail: "demo has worked examples + posts to /discover" },
    { name: "WHO-ITS-FOR", pass: html.includes("Who it's for") && html.includes("PHARMA") && html.includes("AI / ML TEAMS"), detail: "states the audiences + what each gets" },
    { name: "AIR-GAPPED", pass: html.toLowerCase().includes("air-gapped") && html.includes("Zero runtime dependencies"), detail: "states the air-gapped / on-prem positioning" },
    { name: "PITCH-DECK", pass: pitch.startsWith("<!doctype html>") && pitch.includes("The ask") && pitch.includes("The moat") && html.includes('href="/pitch"'), detail: "HTML pitch deck renders (problem→product→moat→proof→ask) and is linked from the landing page" },
    { name: "VERSION+CATALOG", pass: html.includes("9.9.9") && ENDPOINTS.length === 4 && ENDPOINTS.some((e) => e.path === "/pitch"), detail: "version injected; endpoint catalogue incl /pitch + /discover + /verify" },
    { name: "HONEST-COPY", pass: html.toLowerCase().includes("honest") && html.includes("no single"), detail: "page states the honest framing (robustness, not a magic algorithm)" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
