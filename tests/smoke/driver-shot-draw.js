// Screenshot of the drawing tools (real mouse): rectangle with its eight handles, fib, long position with pips and money, text,
// and the settings window. Used with --shots (shot-draw, shot-draw-light).
(async function () {
  var out = [];
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, pp = window.__pp;
  function P(fx, fy) { var e = $('bt-chart'), r = e.getBoundingClientRect(), ts = T().chart().timeScale(); return { x: Math.round(r.left + ts.width() * fx), y: Math.round(r.top + (e.clientHeight - ts.height()) * fy) }; }
  async function tool(id) { if (T().draw().tool() !== id) document.querySelector('#bt-draw-bar [data-tool="' + id + '"]').click(); await sleep(60); }
  async function drag(a, b) { await pp({ op: 'move', x: a.x, y: a.y }); await pp({ op: 'down' }); await pp({ op: 'move', x: b.x, y: b.y, steps: 6 }); await pp({ op: 'up' }); await sleep(120); }
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); });
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; });
    setv('bt-f-name', 'Shot'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000);
    await sleep(400);
    T().chart().timeScale().setVisibleLogicalRange({ from: T().bars().length - 90, to: T().bars().length + 5 }); await sleep(250);
    await tool('fib'); await drag(P(0.08, 0.8), P(0.3, 0.2));
    await tool('long'); await pp({ op: 'click', x: P(0.45, 0.5).x, y: P(0.45, 0.5).y }); await sleep(150);
    await tool('text'); await pp({ op: 'click', x: P(0.36, 0.1).x, y: P(0.36, 0.1).y }); await sleep(100); await pp({ op: 'type', text: 'Destek bölgesi' }); await pp({ op: 'key', key: 'Enter' }); await sleep(100);
    await tool('trend'); await drag(P(0.05, 0.3), P(0.32, 0.55));
    await tool('rect'); await drag(P(0.7, 0.3), P(0.88, 0.62));
    var c = P(0.79, 0.46);
    await pp({ op: 'click', x: c.x, y: c.y, count: 2 }); await sleep(300);
    var bar = $('bt-draw-bar'), br = bar.getBoundingClientRect();
    out.push('INFO bar ' + Math.round(br.width) + 'x' + Math.round(br.height) + ' rows ' + bar.style.gridTemplateRows + ' :: ' + [].map.call(bar.children, function (e) { var r = e.getBoundingClientRect(); return (e.getAttribute('data-tool') || e.getAttribute('data-act') || e.className) + '@' + Math.round(r.left - br.left) + ',' + Math.round(r.top - br.top) + (r.right > br.right + 1 || r.bottom > br.bottom + 1 ? '(CLIPPED)' : ''); }).join(' '));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nPASS shot\nDONE'; }
})();
