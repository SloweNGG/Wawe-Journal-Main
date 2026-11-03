// "N" kısayolu (perf 3c): kapalı pencereler (DOM'da duran yükseltme penceresi) kısayolu engellemez; görünen her
// modal pencere (yükseltme penceresi açıkken, Hızlı Ekle açıkken) engeller.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const nav = fs.readFileSync('public/components/navbar/navbar.js', 'utf8');
const fnSrc = nav.slice(nav.indexOf('function wwDialogVisible(el)'), nav.indexOf('function wwIsProCached()'));
const upgrade = fs.readFileSync('src/components/UpgradeModal.astro', 'utf8');

// rendered: kutusu var mı (display:none değil); style: hesaplanmış visibility / opacity
function el(rendered, { modern = true, visibility = 'visible', opacity = '1' } = {}) {
  const e = { getClientRects: () => (rendered ? [{}] : []), style: { visibility, opacity } };
  if (modern) {
    e.checkVisibility = (o = {}) => rendered && !(o.visibilityProperty && visibility === 'hidden') && !(o.opacityProperty && opacity === '0');
  }
  return e;
}

function openDialog(elements) {
  let seen = '';
  const ctx = { document: { querySelectorAll: (s) => { seen = s; return elements; } }, window: { getComputedStyle: (e) => e.style } };
  vm.runInNewContext(fnSrc + '\nthis.r = wwOpenModalDialog();', ctx);
  return { result: ctx.r, selector: seen };
}

describe('"N" shortcut: open dialog check', () => {
  it('the closed upgrade modal (in a display:none backdrop) does not count', () => {
    assert.equal(openDialog([el(false)]).result, null);
  });

  it('a closed dialog hidden with visibility/opacity does not count (quick add date picker #qa-date-picker)', () => {
    assert.equal(openDialog([el(true, { visibility: 'hidden', opacity: '0' })]).result, null);
    assert.equal(openDialog([el(true, { modern: false, visibility: 'hidden', opacity: '0' })]).result, null);
  });

  it('a visible dialog counts (upgrade modal open, quick add open, any aria-modal dialog)', () => {
    const open = el(true);
    assert.equal(openDialog([el(false), open]).result, open);
  });

  it('older browsers without checkVisibility use getClientRects + computed style', () => {
    assert.equal(openDialog([el(false, { modern: false })]).result, null);
    const open = el(true, { modern: false });
    assert.equal(openDialog([open]).result, open);
  });

  it('same candidates as before: active quick add overlay and aria-modal dialogs without [hidden]', () => {
    assert.equal(openDialog([]).selector, '.quick-add-overlay.active, [role="dialog"][aria-modal="true"]:not([hidden])');
  });

  it('the keydown handler uses the check; the upgrade modal markup and its Esc handling are unchanged', () => {
    assert.match(nav, /if \(t && \(t\.isContentEditable[^\n]+\n\s*if \(wwOpenModalDialog\(\)\) return;\n\s*if \(!wwQuickAddReady\(\)\) return;/);
    assert.match(upgrade, /<div id="ww-upgrade-modal-backdrop" class="ww-up-backdrop" aria-hidden="true" style="display:none;">\s*<div class="ww-up-modal" role="dialog" aria-modal="true"/);
    assert.match(upgrade, /e\.key === 'Escape' && backdrop && backdrop\.classList\.contains\('active'\)/);
  });
});
