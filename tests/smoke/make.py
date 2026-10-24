# Builds dist/__bt.html: the real built backtest page body with stubbed auth/plan/toast/i18n (see tests/smoke/README.md).
import re, sys
html = open('dist/backtest.html', encoding='utf-8').read()
head = html[:html.index('<body')]
# the page's own scripts in production order (the shared ones are loaded by BaseHead in production, listed here by hand)
own = re.findall(r'<script src="(/interface/backtest/js/[^"?]+)[^"]*"', head)
shared = ['https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
          '/interface/shared/time-settings.js', '/interface/shared/trade-metrics.js', '/interface/shared/chart-theme.js', '/interface/shared/trades-source.js']
css = [h for h in re.findall(r'<link rel="stylesheet" href="((?:/|https://fonts)[^"]+)"', head)]
links = '\n'.join('<link rel="stylesheet" href="%s">' % h for h in css)
shared.append('https://cdn.jsdelivr.net/npm/lucide@0.441.0/dist/umd/lucide.min.js')
scripts = '\n'.join('<script src="%s"></script>' % s for s in shared + own)
body = html[html.index('<body'):]
body = re.sub(r'<script\b[^>]*>.*?</script>', '', body, flags=re.S)
body = body.replace('</body>', '').replace('</html>', '')
body = re.sub(r'<body[^>]*>', '<body class="backtest-page">', body, count=1)
page = '''<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
''' + links + '''</head>
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
window.getUserPlanSilent=async function(){return {plan:qp.get('plan')||'premium'}};
window.SUPABASE_URL='https://stub.local';window.SUPABASE_ANON_KEY='anon-stub';
var ct=qp.get('ct')||'none';
window.__ctFixture={token_status:ct==='none'?'none':(ct==='reconnect'?'needs_reconnect':'active'),accounts:ct==='none'?[]:[{id:'ca1',ctid_trader_account_id:4455667,is_live:false,trader_login:900123,broker_name:'Spotware',journal_id:null}].concat(qp.get('ctn')==='2'?[{id:'ca2',ctid_trader_account_id:4455668,is_live:false,trader_login:900124,broker_name:'Spotware',journal_id:null}]:[])};
window.__ctCalls=[];window.__ctFail=false;
(function(){var _f=window.fetch.bind(window),gen=null;
function res(st,j){return {ok:st<300,status:st,json:async function(){return j}}}
window.fetch=async function(url,init){
  if(String(url).indexOf('/functions/v1/ctrader-candles')<0)return _f(url,init);
  var b=JSON.parse(init.body);window.__ctCalls.push(b);
  if(!/^Bearer /.test((init.headers||{}).Authorization||''))return res(401,{ok:false,code:'UNAUTHORIZED'});
  if(window.__ctFail&&(b.action==='month'||(window.__ctFail==='all'&&b.action==='coverage'&&b.backtestAccountId)))return res(401,{ok:false,code:'AUTH',error:'expired',needs_reconnect:true});
  if(qp.get('ctbad')&&String(b.ctidAccount)===qp.get('ctbad')&&(b.action==='symbols'||b.action==='coverage'))return res(401,{ok:false,code:'AUTH',error:'expired',needs_reconnect:true});   // one broker account fails (ctbad=<ctid>)
  if(b.action==='symbols')return res(200,{ok:true,symbols:[[41,'GOLD'],[7,'EURGBP'],[2,'EURUSD.r'],[1,'EURUSD'],[8,'GBPUSD'],[40,'XAUUSD']]});
  if(b.action==='symbolInfo')return res(200,{ok:true,symbolId:b.symbolId,digits:b.symbolId===40||b.symbolId===41?2:5,pipPosition:4,lotSize:10000000});
  if(b.action==='coverage')return res(200,{ok:true,firstMonth:'2024-02',firstT:Date.UTC(2024,1,5)/1000,probes:9});
  if(b.action==='month'){
    var acc=(window.__db.tables.backtest_accounts||[]).filter(function(a){return a.id===b.backtestAccountId})[0];
    if(!acc)return res(404,{ok:false,code:'NOT_FOUND'});
    var S=window.WwBtSymbols,Y=window.WwBtSynthetic;gen=gen||Y.createGenerator({S:S,seed:7});
    var sym=S.get(acc.symbol),rows=Y.generateMonth(gen,sym,b.month),base=Date.UTC(+b.month.slice(0,4),+b.month.slice(5,7)-1,1)/1000,end=Math.floor(Date.now()/86400000)*86400,k5=Math.pow(10,5-sym.digits);   // the generator rows are in points of the symbol digits; the server sends 1e-5 units
    var o={ok:true,month:b.month,scale:100000,n:0,tm:[],o:[],h:[],l:[],c:[]};
    rows.forEach(function(r){if(r[0]>=end||r[0]<Date.UTC(2024,1,5)/1000)return;o.tm.push((r[0]-base)/60);o.o.push(r[1]*k5);o.h.push(r[2]*k5);o.l.push(r[3]*k5);o.c.push(r[4]*k5)});
    o.n=o.tm.length;return res(200,o);
  }
  return res(400,{ok:false,code:'BAD_REQUEST'});
};})();
window.__toasts=[];window.showToast=function(m,t){window.__toasts.push([t,m])};
window.openUpgradeModal=function(){window.__upgrade=true};
})();
</script>
''' + scripts + '''
<pre id="bt-smoke-result" style="display:none"></pre>
<script type="module">
var qp=new URLSearchParams(location.search);
if(qp.get('backend')==='supabase'){var m=await import('/__fakedb.mjs');window.__db=new m.FakeDb({userId:'u-'+(qp.get('role')||'admin'),journals:window.__journals,migration08:qp.get('m08')!=='0',migration09:qp.get('m09')!=='0',ctrader:window.__ctFixture});window.sb=window.__db.client;window.sb.auth={getSession:async function(){return {data:{session:{access_token:'jwt-stub'}}}}};}
var d=document.createElement('script');d.src=qp.get('driver')||'/__driver.js';document.body.appendChild(d);
</script>
</body></html>'''
# rAF is not driven in headless --dump-dom runs, so the harness replaces it with a timer (loop logic is still the real one)
page = page.replace("window.__toasts=[];", "window.requestAnimationFrame=function(f){return setTimeout(function(){f(performance.now())},16)};window.cancelAnimationFrame=function(i){clearTimeout(i)};\nwindow.__toasts=[];", 1)
open('dist/__bt.html','w',encoding='utf-8').write(page)
print('dist/__bt.html:', len(own), 'page scripts')
