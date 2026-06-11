/**
 * MELETE WEB — discovery-as-a-service. A self-contained HTTP surface so anyone (or any agent) can POST an
 * objective + a search space and get back the discovered optimum AND its signed, verifiable trace — no
 * install. The landing page is a live demo; the JSON endpoints are the product.
 *
 * This module owns the landing page (pure string) + the endpoint catalogue. The HTTP server + the
 * sandboxed objective evaluation live in bin/melete-server.mjs (node:http + node:vm), keeping this module
 * dependency-free.
 */
export const ENDPOINTS = [
  { method: "GET", path: "/health", what: "liveness + version" },
  { method: "POST", path: "/discover", what: "run a discovery — {space, objective, budget, goal, engine} → {best, armStats, trace}" },
  { method: "POST", path: "/verify", what: "re-verify a discovery trace offline — {trace} → {ok, reason}" },
];

export function landingPage(version = "0.2.0"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melete — the Self-Driving Discovery Brain</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0a0a0f;color:#e7e7ea;font:15px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:34px;margin:0 0 4px;background:linear-gradient(90deg,#a78bfa,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#9aa;font-size:16px;margin:0 0 28px}
.card{background:#12121a;border:1px solid #23232f;border-radius:14px;padding:20px;margin:16px 0}
.card b{color:#c4b5fd}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:7px 8px;border-bottom:1px solid #20202b;text-align:left}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#1b1b26;border-radius:6px}
code{padding:1px 6px;font-size:13px;color:#7dd3fc}
pre{padding:14px;overflow:auto;font-size:12.5px;color:#cbd5e1}
label{display:block;color:#9aa;font-size:12px;margin:12px 0 4px}
textarea,input{width:100%;background:#0e0e16;border:1px solid #2a2a38;border-radius:8px;color:#e7e7ea;padding:10px;font-family:ui-monospace,monospace;font-size:13px}
button{margin-top:14px;background:linear-gradient(90deg,#7c3aed,#0891b2);color:#fff;border:0;border-radius:9px;padding:11px 18px;font-weight:600;cursor:pointer;font-size:14px}
.out{margin-top:14px;background:#0e0e16;border:1px solid #2a2a38;border-radius:8px;padding:12px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12.5px;min-height:28px;color:#a7f3d0}
.pill{display:inline-block;background:#1e1b2e;border:1px solid #3b3357;border-radius:999px;padding:3px 11px;font-size:12px;color:#c4b5fd;margin:2px 4px 2px 0}
.muted{color:#777}
a{color:#7dd3fc}
</style></head><body><div class="wrap">
<h1>Melete</h1>
<p class="sub">The Self-Driving Discovery Brain — propose → experiment → prove. <span class="muted">Mneme remembers; Melete discovers. v${version}</span></p>

<div class="card">
<b>What it does</b> — finds the most informative next experiment for any expensive, scorable process, in as
few trials as possible, and emits a <b>signed, offline-verifiable trace</b> of exactly how it got there.
<div style="margin-top:10px">
<span class="pill">SUPER NOVA · adaptive ensemble</span>
<span class="pill">everything is f(x)</span>
<span class="pill">cryptographic provenance</span>
<span class="pill">no install · HTTP / agent-native</span>
</div></div>

<div class="card"><b>Endpoints</b> <span class="muted">— POST JSON, get a result</span>
<table><tr><th>METHOD</th><th>PATH</th><th>WHAT</th></tr>
<tr><td>GET</td><td><code>/health</code></td><td>liveness + version</td></tr>
<tr><td>POST</td><td><code>/discover</code></td><td>{space, objective, budget, goal} → best + arm allocation + signed trace</td></tr>
<tr><td>POST</td><td><code>/verify</code></td><td>{trace} → re-verify the discovery provenance offline</td></tr>
</table></div>

<div class="card"><b>Try it live</b>
<p class="muted">Give a search space + an objective (a JS expression in your dimensions — the "experiment").
The brain discovers the optimum in a small budget and hands back a signed trace you can re-verify.</p>
<label>SPACE (dimensions)</label>
<input id="space" value='[{"name":"x","type":"real","min":0,"max":10},{"name":"y","type":"real","min":0,"max":10}]'>
<label>OBJECTIVE — maximise this f(x,y)</label>
<input id="obj" value="Math.exp(-((x-7.2)**2+(y-3.4)**2)/3)">
<label>BUDGET (experiments)</label>
<input id="budget" value="40">
<button onclick="run()">Discover →</button>
<div class="out" id="out">result will appear here…</div>
</div>

<div class="card"><b>How it's actually used</b> <span class="muted">— it's a service whose users are agents / pipelines</span>
<pre>curl -s https://this-host/discover -H 'content-type: application/json' -d '{
  "space":[{"name":"lr","type":"real","min":0,"max":0.1},{"name":"depth","type":"int","min":1,"max":12}],
  "objective":"-(lr-0.03)**2*1000-(depth-6)**2",
  "budget":40, "goal":"maximize"
}'</pre>
<p class="muted">In production the objective is your real expensive process (a training run, a build benchmark,
a lab assay, an LLM-graded design). The brain only needs the number back.</p></div>

<p class="muted" style="font-size:12px">Honest: the engine is a context-adaptive ensemble (no single "magic" algorithm) — its guarantee is
robustness + verifiable provenance, measured + reproducible. Browser demo evaluates your expression in a
sandboxed VM with a timeout.</p>

<script>
async function run(){
  const out=document.getElementById('out'); out.textContent='discovering…';
  try{
    const space=JSON.parse(document.getElementById('space').value);
    const body={space,objective:document.getElementById('obj').value,budget:+document.getElementById('budget').value,goal:'maximize'};
    const r=await fetch('/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();
    if(j.error){out.textContent='⚠ '+j.error;return;}
    const arms=(j.armStats||[]).filter(a=>a.pulls>0).map(a=>a.name+'×'+a.pulls).join('  ');
    out.textContent='🔬 best value: '+(+j.best.value).toFixed(6)+'\\n   at: '+JSON.stringify(j.best.experiment)
      +'\\n   experiments: '+j.evaluations+'   engine: '+j.engine
      +'\\n   arms used: '+arms
      +'\\n   📜 signed trace: '+j.trace.frames.length+' frames · verify='+j.verify;
  }catch(e){out.textContent='⚠ '+e.message;}
}
</script>
</div></body></html>`;
}

// ── gauntlet ──────────────────────────────────────────────────────────────────
export function serverGauntlet(): { score: 0 | 100; checks: Array<{ name: string; pass: boolean; detail: string }> } {
  const html = landingPage("9.9.9");
  const checks = [
    { name: "LANDING-RENDERS", pass: html.startsWith("<!doctype html>") && html.includes("Melete") && html.length > 1500, detail: "landing page renders with the brand + a live demo form" },
    { name: "DEMO-FORM", pass: html.includes('id="space"') && html.includes('id="obj"') && html.includes("/discover"), detail: "demo posts space + objective to /discover" },
    { name: "VERSION-EMBEDDED", pass: html.includes("9.9.9"), detail: "version is injected into the page" },
    { name: "ENDPOINT-CATALOG", pass: ENDPOINTS.length === 3 && ENDPOINTS.some((e) => e.path === "/discover") && ENDPOINTS.some((e) => e.path === "/verify"), detail: "endpoint catalogue lists /health, /discover, /verify" },
    { name: "HONEST-COPY", pass: html.toLowerCase().includes("honest") && html.includes("no single"), detail: "page states the honest framing (robustness, not a magic algorithm)" },
  ];
  return { score: checks.every((c) => c.pass) ? 100 : 0, checks };
}
