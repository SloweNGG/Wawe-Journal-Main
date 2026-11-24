// ============================================================
// AI coach personas (supabase/functions/_shared/coach-personas.ts): the coach picked by the member's main problem,
// its tone, the "pick for me" suggestion, and that the panel (public/components/ai-coach/ai-coach.js) and the locales
// know every coach.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COACH_IDS, TONES, COACHES, resolveCoach, coachIntro, suggestCoach, INSIGHT_COACH } from '../supabase/functions/_shared/coach-personas.ts';

describe('coach choice', () => {
  it('nothing chosen: Kai, balanced', () => {
    assert.deepEqual(resolveCoach(null, null), { id: 'kai', tone: 'balanced' });
    assert.deepEqual(resolveCoach({}, {}), { id: 'kai', tone: 'balanced' });
  });
  it('a coach without a tone gets its own default tone', () => {
    assert.deepEqual(resolveCoach({ coach: 'mira' }, null), { id: 'mira', tone: 'soft' });
    assert.deepEqual(resolveCoach({ coach: 'atlas' }, null), { id: 'atlas', tone: 'strict' });
    assert.deepEqual(resolveCoach({ coach: 'rex' }, null), { id: 'rex', tone: 'strict' });
  });
  it('the request wins over the stored choice; the stored tone only counts for the same coach', () => {
    assert.deepEqual(resolveCoach({ coach: 'nova', tone: 'strict' }, { id: 'mira', tone: 'soft' }), { id: 'nova', tone: 'strict' });
    assert.deepEqual(resolveCoach({}, { id: 'rex', tone: 'soft' }), { id: 'rex', tone: 'soft' });
    assert.deepEqual(resolveCoach({ coach: 'nova' }, { id: 'mira', tone: 'strict' }), { id: 'nova', tone: 'balanced' });
  });
  it('unknown values fall back instead of reaching the prompt', () => {
    for (const bad of ['anna', '', 'KAI', 1, { toString: () => 'rex' }, '<script>']) {
      assert.equal(resolveCoach({ coach: bad, tone: bad }, null).id, 'kai');
      assert.equal(resolveCoach({ coach: 'rex', tone: bad }, null).tone, 'strict');
    }
    assert.deepEqual(resolveCoach(null, 'rex'), { id: 'kai', tone: 'balanced' });
  });
});

describe('system instruction opening', () => {
  it('every coach says its name, keeps the AI honesty line and gets a tone rule', () => {
    for (const id of COACH_IDS) for (const tone of TONES) {
      const t = coachIntro({ id, tone }).join('\n');
      assert.match(t, new RegExp('^You are ' + COACHES[id].name + ','));
      assert.match(t, /You are an AI, not a human/);
      assert.match(t, new RegExp('the trader chose ' + tone.toUpperCase()));
    }
  });
  it('overtrading: a side note for every coach, the main topic for Rex', () => {
    for (const id of COACH_IDS) {
      const t = coachIntro({ id, tone: 'balanced' }).join('\n');
      if (id === 'rex') { assert.match(t, /GREED AND OVERTRADING/); assert.doesNotMatch(t, /Whatever your focus/); }
      else assert.match(t, /Whatever your focus: when the data shows overtrading/);
    }
  });
  it('strict never means insults', () => {
    assert.match(coachIntro({ id: 'atlas', tone: 'strict' }).join('\n'), /never the person: no insults, no mockery, no swearing/);
  });
  it('the edge function builds the opening from the persona module, not a fixed name', () => {
    const src = fs.readFileSync('supabase/functions/ai-coach/index.ts', 'utf8');
    assert.match(src, /\.\.\.coachIntro\(coach\)/);
    assert.match(src, /resolveCoach\(body, loaded\.coach\)/);
    assert.doesNotMatch(src, /You are (Kai|Anna)/);
  });
  it('every coach says "sen" in Turkish and "du" in German, like the panel; the panel copy itself never says "siz"', () => {
    const src = fs.readFileSync('supabase/functions/ai-coach/index.ts', 'utf8');
    const fn = src.slice(src.indexOf('export function systemInstruction'), src.indexOf('export function buildHistory'));
    assert.match(fn, /const lng = LANGS\[lang\] \? lang : 'tr';/);              // unknown language -> Turkish rules
    assert.match(fn, /\.\.\.\(ADDRESS\[lng\] \? \[ADDRESS\[lng\]\] : \[\]\),/);
    assert.match(src, /tr: '- Address the trader informally, in the second person singular \("sen"[^\n]*never the formal or plural "siz"/);
    assert.match(src, /de: '- Address the trader informally with "du"[^\n]*never the formal "Sie"/);
    const tr = fs.readFileSync('public/i18n/locales/tr.js', 'utf8').split('\n').filter((l) => /^\s*"(aiCoach|coach)\./.test(l));
    assert.ok(tr.length > 20);
    assert.deepEqual(tr.filter((l) => /\b(siz|sizin|size|sizi)\b|[ıiuü]n[ıiuü]z\b/.test(l)), []);
  });
});

describe('"pick for me" suggestion', () => {
  it('the strongest finding with a coach decides; weak or unrelated findings do not', () => {
    assert.deepEqual(suggestCoach([{ id: 'weak_strategy', severity: 75, params: {} }, { id: 'revenge', severity: 95, params: { win_rate: 20 } }]).coach, 'mira');
    assert.equal(suggestCoach([{ id: 'overtrading', severity: 80, params: {} }]).coach, 'rex');
    assert.equal(suggestCoach([{ id: 'no_stop', severity: 85, params: {} }]).coach, 'atlas');
    assert.equal(suggestCoach([{ id: 'stop_overrun', severity: 84, params: {} }]).coach, 'nova');
    assert.equal(suggestCoach([{ id: 'weak_strategy', severity: 75, params: {} }]), null);
    assert.equal(suggestCoach([{ id: 'holding_losers', severity: 40, params: {} }]), null);
    assert.equal(suggestCoach([]), null);
  });
  it('every mapped finding is one the insights engine really sends, and maps to a real coach', () => {
    const src = fs.readFileSync('supabase/functions/_shared/insights.ts', 'utf8');
    const ids = new Set([...src.matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1]));
    for (const [ins, c] of Object.entries(INSIGHT_COACH)) {
      assert.ok(ids.has(ins), 'unknown finding ' + ins);
      assert.ok(COACH_IDS.includes(c) && c !== 'kai', ins + ' -> ' + c);
    }
  });
});

describe('panel and locales', () => {
  const panel = fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8');
  it('the panel lists the same coaches with the same names and default tones', () => {
    for (const id of COACH_IDS) {
      const c = COACHES[id];
      assert.match(panel, new RegExp("\\{ id: '" + id + "', name: '" + c.name + "', icon: '[a-z]+', tone: '" + c.tone + "'"), id);
    }
    assert.match(panel, /coach: cc\.id, tone: cc\.tone/);              // sent with every message
  });
  it('the onboarding wizard offers the same coaches and hands the choice to the panel', () => {
    const onb = fs.readFileSync('public/interface/dashboard/js/onboarding.js', 'utf8');
    for (const id of COACH_IDS) {
      const c = COACHES[id];
      assert.match(onb, new RegExp("\\['" + id + "', '" + c.name + "', '[a-z-]+', '" + c.tone + "'"), id);
    }
    assert.match(onb, /window\.WwAiCoach\.setCoach\(def\[0\]\)/);
    assert.match(onb, /localStorage\.setItem\('ww_ai_coach_asked', '1'\)/);        // the panel must not ask again
    assert.match(panel, /ASKED_KEY = 'ww_ai_coach_asked'/);
    assert.match(panel, /setCoach: function \(id\) \{ setCoach\(id\); \}/);
  });
  it('every coach has an avatar (orb with eyes, CSS only) and a colour in both stylesheets', () => {
    const onb = fs.readFileSync('public/interface/dashboard/js/onboarding.js', 'utf8');
    for (const src of [panel, onb]) assert.doesNotMatch(src, /images\/coaches|<img[^>]*coach/);
    const panelCss = fs.readFileSync('public/components/ai-coach/ai-coach.css', 'utf8');
    const onbCss = fs.readFileSync('public/interface/dashboard/css/onboarding.css', 'utf8');
    for (const id of COACH_IDS) {
      assert.match(panelCss, new RegExp('\\.wwc-av-' + id + ' \\{ --av-delay: [0-9.]+s; --av-grad: radial-gradient'), 'avatar ' + id);
      assert.match(panelCss, new RegExp('\\.wwai-c-' + id + ' \\{ --wwai-cc: '), 'panel ' + id);
      assert.match(onbCss, new RegExp('\\.wj-coach-' + id + ' \\{ --wj-cc: '), 'onboarding ' + id);
    }
    assert.match(panelCss, /@keyframes wwc-blink/);
    assert.match(panel, /function coachAv\(d, px\)/);
    assert.match(onb, /'<span class="wwc-av wwc-av-' \+ c\[0\] \+ '"/);
  });
  it('onboarding: one coach per slide, the slide in view is the choice and names the finish button', () => {
    const onb = fs.readFileSync('public/interface/dashboard/js/onboarding.js', 'utf8');
    assert.match(onb, /class="wj-coach-track" id="wj-coach-track"/);
    assert.match(onb, /setCoachSlide\(Math\.round\(coachTrack\.scrollLeft \/ coachTrack\.clientWidth\), false\)/);
    assert.match(onb, /state\.selectedCoach = c\[0\];/);
    assert.match(onb, /label\.textContent = t\('aiCoach\.coach\.done', '\{coach\} ile başla'\)\.replace\('\{coach\}', c\[1\]\)/);
    const onbCss = fs.readFileSync('public/interface/dashboard/css/onboarding.css', 'utf8');
    assert.match(onbCss, /scroll-snap-type: x mandatory/);
  });
  it('every coach text exists in all locales; no locale still names a fixed coach in titles', async () => {
    const parts = ['problem', 'desc'];
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const id of COACH_IDS) {
        for (const p of parts) assert.ok(loc['aiCoach.coach.' + id + '.' + p], l + ' ' + id + ' ' + p);
        if (id !== 'kai') for (const p of ['intro', 'chip', 'chip_q']) assert.ok(loc['aiCoach.coach.' + id + '.' + p], l + ' ' + id + ' ' + p);
      }
      for (const k of ['title', 'question', 'hint', 'suggest', 'take', 'done', 'change', 'yours', 'tone', 'tone_soft', 'tone_balanced', 'tone_strict', 'tone_soft_hint', 'tone_balanced_hint', 'tone_strict_hint'])
        assert.ok(loc['aiCoach.coach.' + k], l + ' aiCoach.coach.' + k);
      const titles = Object.keys(loc).filter((k) => /^coach\.(alert\.[a-z_]+|weekly|commit)\.title$/.test(k));
      assert.ok(titles.length >= 15, l + ' titles');
      for (const k of titles) assert.match(loc[k], /^\{coach\}: /, l + ' ' + k);
      for (const k of ['aiCoach.open', 'aiCoach.err.off', 'aiCoach.set.desktop_test']) assert.match(loc[k], /\{coach\}/, l + ' ' + k);
      for (const k of Object.keys(loc)) if (k !== 'aiCoach.intro_short') assert.doesNotMatch(String(loc[k]), /\b(Kai|Anna)\b/, l + ' ' + k);
    }
  });
});

describe('voice orb (dictation)', () => {
  const panel = fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8');
  const orb = fs.readFileSync('public/components/ai-coach/voice-orb.js', 'utf8');
  it('loads on the first dictation, with the build id, has a colour for every coach and the coach in the middle', () => {
    assert.match(panel, /'\/components\/ai-coach\/voice-orb\.js\?v=__WW_BUILD_ID__'/);
    const hues = orb.match(/var HUES = \{([^}]*)\}/)[1];
    for (const id of COACH_IDS) assert.ok(new RegExp('(^|[ ,{])' + id + ': -?[0-9]+').test(hues), id);
    assert.match(panel, /R\.orb\.querySelector\('\.wwai-orb-face'\)\.innerHTML = coachAv\(cd, 52\);/);
    assert.match(orb, /loseContext\(\)/);
  });
  it('hides when dictation stops and releases the microphone', () => {
    assert.match(panel, /R\.orb\.hidden = true;\s*\n\s*if \(O\.orb\) O\.orb\.stop\(\);/);
    assert.match(orb, /stop: function \(\) \{[\s\S]*?stopMic\(\);/);
    assert.match(orb, /S\.stream\.getTracks\(\)\.forEach\(function \(tr\) \{ tr\.stop\(\); \}\)/);
  });
  it('no WebGL: create() returns null and the panel keeps dictation without the orb', () => {
    assert.match(orb, /if \(!gl\) return null;/);
    assert.match(panel, /O\.state = O\.orb \? 'ready' : 'off';/);
  });
});

describe('answers are typed out word by word', () => {
  const panel = fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8');
  it('what arrives goes to a buffer and is revealed by a typer, the final text waits for it', () => {
    assert.match(panel, /reply\.full \+= t; schedule\(\);/);
    assert.match(panel, /var TYPE_WPS = \d+, TYPE_CATCH_UP = [\d.]+;/);
    assert.match(panel, /return drained\(\)\.then\(function \(\) \{\s*reply\.content = j\.reply;/);
    assert.match(panel, /if \(document\.hidden\) shown = full\.length;/);          // background tab: no typing
    assert.match(panel, /reply\.content = reply\.full; reply\.streaming = false; reply\.note = msg;/);   // error: show what arrived
  });
  it('words: spaces then the word; a chart line comes in one piece', () => {
    const src = panel.match(/function nextWordEnd\(text, i\) \{[\s\S]*?\n  \}/)[0];
    const nextWordEnd = new Function(src + '; return nextWordEnd;')();
    assert.equal(nextWordEnd('Merhaba dünya', 0), 7);
    assert.equal(nextWordEnd('Merhaba dünya', 7), 13);
    const t = 'Bak:\n[[viz:bar:by_weekday:net]]\nSonra';
    assert.equal(t.slice(0, nextWordEnd(t, 4)), 'Bak:\n[[viz:bar:by_weekday:net]]');
  });
});

describe('the coach writes money in the currency the app shows', async () => {
  const { currencySymbol, currencyRule, CURRENCIES } = await import('../supabase/functions/_shared/coach-knowledge.ts');
  it('symbols and codes from the app are accepted, anything else is not', () => {
    for (const s of ['$', '€', '£', '₺', '₿']) assert.equal(currencySymbol(s), s);
    assert.equal(currencySymbol('USD'), '$'); assert.equal(currencySymbol('try'), '₺'); assert.equal(currencySymbol(' € '), '€');
    for (const bad of [undefined, null, '', 'TL', 'dollar', 1, { toString: () => '$' }, '<b>$</b>']) assert.equal(currencySymbol(bad), null);
  });
  it('the rule names the currency, shows the format and forbids others', () => {
    const usd = currencyRule('$');
    assert.match(usd, /US dollars \(USD\)/);
    assert.match(usd, /−\$1\.958/);
    assert.match(usd, /no TL, ₺/);
    assert.match(usd, /never convert/);
    assert.match(currencyRule('₺'), /Turkish lira \(TRY\)/);
    assert.match(currencyRule('nope'), /US dollars/);
    assert.equal(Object.keys(CURRENCIES).length, 5);
  });
  it('the panel sends its symbol; the function falls back to the profile, then $', () => {
    const panel = fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8');
    assert.match(panel, /tone: cc\.tone, currency: currency\(\) \};/);
    const src = fs.readFileSync('supabase/functions/ai-coach/index.ts', 'utf8');
    assert.match(src, /const bodyCurrency = currencySymbol\(body\?\.currency\);/);
    assert.match(src, /currency = currencySymbol\(prof\?\.preferred_currency\) \|\| '\$';/);
    assert.match(src, /currencyRule\(currency\),/);
    assert.doesNotMatch(src, /account currency of the journal/);
  });
});
