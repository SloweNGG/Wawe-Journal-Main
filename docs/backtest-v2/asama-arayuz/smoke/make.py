import re, sys
html = open('dist/backtest.html', encoding='utf-8').read()
body = html[html.index('<body'):]
body = re.sub(r'<script\b[^>]*>.*?</script>', '', body, flags=re.S)
body = body.replace('</body>', '').replace('</html>', '')
body = re.sub(r'<body[^>]*>', '<body class="backtest-page">', body, count=1)
page = '''<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/interface/shared/chart-theme.css">
<link rel="stylesheet" href="/interface/backtest/css/backtest.css"></head>
''' + body + '''
<script>
(function(){var cur={alive:true,_c:[],onLeave:function(f){this._c.push(f)},on:function(t,e,f,o){t.addEventListener(e,f,o)},onI18nChange:function(){},expose:function(){}};
window.wwPage={current:function(){return cur}};
var qp=new URLSearchParams(location.search);var role=qp.get('role')||'admin';
if(qp.get('backend')!=='supabase')window.WW_BT_BACKEND='local';
window.__warns=[];console.warn=function(){window.__warns.push([].slice.call(arguments).map(function(x){return x&&x.stack||String(x)}).join(' '))};
window.__cacheInv=[];window.wwCache={invalidate:function(p){window.__cacheInv.push(p)}};
window.__events=[];window.addEventListener('trade-saved',function(e){window.__events.push(e.detail)});
if(qp.get('backend')!=='supabase')window.sb={};window.wwLog=console;
window.requireAuth=async function(){return {id:'u-'+role,app_metadata:{role:role}}};
window.__journals=[{id:'11111111-1111-4111-8111-111111111111',user_id:'u-'+role,name:'Ana Hesap',is_default:true},{id:'22222222-2222-4222-8222-222222222222',user_id:'u-'+role,name:'Ikinci Hesap',is_default:false}];
window.journal={ensureActiveJournal:async function(){},listJournals:async function(){return window.__journals}};
window.getUserPlanSilent=async function(){return {plan:'premium'}};
window.__toasts=[];window.showToast=function(m,t){window.__toasts.push([t,m])};
window.openUpgradeModal=function(){window.__upgrade=true};
})();
</script>
<script src="https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
<script src="/interface/shared/time-settings.js"></script>
<script src="/interface/shared/trade-metrics.js"></script>
<script src="/interface/shared/chart-theme.js"></script>
<script src="/interface/backtest/js/bt-symbols.js"></script>
<script src="/interface/backtest/js/bt-candles.js"></script>
<script src="/interface/backtest/js/bt-engine.js"></script>
<script src="/interface/backtest/js/bt-synthetic.js"></script>
<script src="/interface/backtest/js/bt-data.js"></script>
<script src="/interface/shared/trades-source.js"></script>
<script src="/interface/backtest/js/bt-store.js"></script>
<script src="/interface/backtest/js/bt-sync.js"></script>
<script src="/interface/backtest/js/backtest.js"></script>
<pre id="bt-smoke-result" style="display:none"></pre>
<script type="module">
var qp=new URLSearchParams(location.search);
if(qp.get('backend')==='supabase'){var m=await import('/__fakedb.mjs');window.__db=new m.FakeDb({userId:'u-'+(qp.get('role')||'admin'),journals:window.__journals});window.sb=window.__db.client;}
var d=document.createElement('script');d.src=qp.get('driver')||'/__driver.js';document.body.appendChild(d);
</script>
</body></html>'''
# rAF is not driven in headless --dump-dom runs, so the harness replaces it with a timer (loop logic is still the real one)
page = page.replace("window.__toasts=[];", "window.requestAnimationFrame=function(f){return setTimeout(function(){f(performance.now())},16)};window.cancelAnimationFrame=function(i){clearTimeout(i)};\nwindow.__toasts=[];", 1)
open('dist/__bt.html','w',encoding='utf-8').write(page)
