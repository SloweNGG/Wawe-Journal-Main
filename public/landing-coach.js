// ============================================================
// WAWE LANDING: AI coach section (#coach in src/pages/index.astro)
// The chat on the right plays one coach's example (question, "typing", answer, bars, alert; the scene itself is CSS in
// landing-glass.css, replayed by toggling .is-on), then moves to the next coach when the progress bar under the active
// chip ends. Clicking a chip switches at once. The rotation waits while the pointer is over the section or the chat is
// off screen. Desktop also gets the app's WebGL orb (components/ai-coach/voice-orb.js) behind the coach's face, loaded
// only when the section comes near; its colour glides to the active coach's hue.
// prefers-reduced-motion: no rotation, no orb; the chips still switch the chat.
// ============================================================
(function () {
  'use strict';
  var sec = document.getElementById('coach');
  if (!sec) return;
  var box = sec.querySelector('.coach'), chat = sec.querySelector('.chat'), orbBox = sec.querySelector('.chat-orb');
  var chips = Array.prototype.slice.call(sec.querySelectorAll('.persona'));
  var convos = Array.prototype.slice.call(sec.querySelectorAll('.convo'));
  if (!box || !chat || !chips.length || chips.length !== convos.length) return;

  var ids = convos.map(function (c) { return c.getAttribute('data-coach'); });
  var mm = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  var still = mm('(prefers-reduced-motion: reduce)');
  var cur = 0, seen = false, inView = false;

  function show(i) {
    cur = (i + ids.length) % ids.length;
    var id = ids[cur];
    convos.forEach(function (c) { c.classList.remove('is-on'); });
    chips.forEach(function (b) { b.classList.remove('is-on'); });
    void box.offsetWidth;                                   // restart the CSS scene, also when the same coach is clicked again
    convos.forEach(function (c, k) {
      var on = k === cur;
      c.classList.toggle('is-on', on);
      if (on) c.removeAttribute('aria-hidden'); else c.setAttribute('aria-hidden', 'true');
    });
    chips.forEach(function (b) {
      var on = b.getAttribute('data-coach') === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    chat.setAttribute('data-coach', id);
    glideHue(id);
  }

  chips.forEach(function (b) {
    b.addEventListener('click', function () { show(ids.indexOf(b.getAttribute('data-coach'))); });
  });

  if (!still) {
    box.classList.add('is-live');
    box.addEventListener('animationend', function (e) {
      if (e.animationName === 'coachProgress' && e.target.classList.contains('persona-bar')) show(cur + 1);
    });
    // hold while the visitor reads (mouse over the section) or focuses a chip
    box.addEventListener('mouseenter', function () { box.classList.add('is-held'); });
    box.addEventListener('mouseleave', function () { box.classList.remove('is-held'); });
    box.addEventListener('focusin', function () { box.classList.add('is-held'); });
    box.addEventListener('focusout', function () { box.classList.remove('is-held'); });
  }

  // in view: the scene replays from the start the first time, the rotation and the orb run only while it is visible
  function setView(v) {
    inView = v;
    box.classList.toggle('in-view', v);
    if (v && !seen) { seen = true; show(cur); }
    if (orb) { if (v) orb.start(); else orb.stop(); }
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es.forEach(function (e) { setView(e.isIntersecting); }); }, { threshold: 0.35 }).observe(chat);
    if (!still && mm('(min-width: 901px) and (hover: hover)')) {
      var near = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { near.disconnect(); loadOrb(); }
      }, { rootMargin: '400px 0px' });
      near.observe(sec);
    }
  } else {
    setView(true);
  }

  // ---------------------------------------------------------------- WebGL orb (desktop)
  var orb = null, hue = 0, hueRaf = 0;
  function hueOf(id) { return (window.WwVoiceOrb && window.WwVoiceOrb.HUES && window.WwVoiceOrb.HUES[id]) || 0; }
  function loadOrb() {
    if (!orbBox) return;
    var s = document.createElement('script');
    s.src = '/components/ai-coach/voice-orb.js?v=__WW_BUILD_ID__';
    s.async = true;
    s.onload = function () {
      if (!window.WwVoiceOrb) return;
      hue = hueOf(ids[cur]);
      orb = window.WwVoiceOrb.create(orbBox, { hue: hue, mic: false, glow: 1.15 });   // null without WebGL: the CSS glow stays
      if (!orb) return;
      orbBox.classList.add('has-gl');
      if (inView) orb.start();
    };
    document.head.appendChild(s);
  }
  // the shortest way round the colour wheel, over ~0.7 s
  function glideHue(id) {
    if (!orb) return;
    var from = hue, to = hueOf(id), d = ((to - from + 540) % 360) - 180, t0 = 0;
    if (hueRaf) cancelAnimationFrame(hueRaf);
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / 700), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      hue = (from + d * e + 360) % 360;
      orb.setHue(hue);
      hueRaf = k < 1 ? requestAnimationFrame(step) : 0;
    }
    hueRaf = requestAnimationFrame(step);
  }
})();
