// ============================================================
// Emotions in trade notes (supabase/functions/_shared/emotions.ts): parsing tags and words in three languages, what each
// emotion costs, the coach's finding, and the note bar's tag words (public/components/note-tools) being recognised.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emotionsOf, emotionStats, EMOTIONS } from '../supabase/functions/_shared/emotions.ts';
import { summarizeTrades } from '../supabase/functions/_shared/trade-summary.ts';
import { pickInsights } from '../supabase/functions/_shared/insights.ts';

describe('emotions in notes', () => {
  it('tags and words in Turkish, English and German; negations and look-alikes do not count', () => {
    const cases = [
      ['Korkuyla girdim #fomo', ['fear', 'fomo']], ['#INTIKAM', ['revenge']], ['kaybı geri almak istedim', ['revenge']],
      ['Felt confident, calm', ['calm', 'confident']], ['Ich war müde und ungeduldig', ['impatient', 'tired']],
      ['Eminim bu sefer', ['confident']], ['Emin değildim', []], ['Eminönü haberleri', []], ['sakin değildim', []],
      ['not afraid at all', []], ['nicht nervös', []], ['', []], [null, []], ['#açgözlülük', ['greed']], ['#Rache!', ['revenge']],
    ];
    for (const [n, want] of cases) assert.deepEqual(emotionsOf(n), want, JSON.stringify(n));
  });
  it('every tag word the note bar writes is recognised as its emotion', () => {
    const src = fs.readFileSync('public/components/note-tools/note-tools.js', 'utf8');
    const block = src.slice(src.indexOf('var TAGS = {'), src.indexOf('};', src.indexOf('var TAGS = {')) + 2);
    const TAGS = Function('return ' + block.slice(block.indexOf('{')).replace(/;$/, ''))();
    for (const l of Object.keys(TAGS)) for (const e of EMOTIONS) assert.deepEqual(emotionsOf('#' + TAGS[l][e]), [e], l + ' ' + e + ' #' + TAGS[l][e]);
  });
  it('stats per emotion against trades without one; the coach names the costly emotion', () => {
    const rows = [];
    for (let i = 0; i < 30; i++) {
      const note = i < 8 ? 'girdim #fomo' : i < 14 ? '#sakin plan dahilinde' : null;
      const win = i < 8 ? i % 4 === 0 : i % 3 !== 0;
      rows.push({ symbol: 'EURUSD', direction: 'BUY', lot: 1, entry_price: 1.1, stop_loss: 1.09, exit_price: win ? 1.12 : 1.09, pnl: win ? 200 : -100,
        trade_date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(), notes: note, platform_source: null });
    }
    const s = summarizeTrades(rows, [], { tz: 'UTC' });
    const fomo = s.emotions.by_emotion.find((x) => x.key === 'fomo'), calm = s.emotions.by_emotion.find((x) => x.key === 'calm');
    assert.equal(s.emotions.trades_with_emotion, 14); assert.equal(s.emotions.share_pct, 46.7);
    assert.deepEqual([fomo.trades, fomo.wins, fomo.net, fomo.positive], [8, 2, -200, false]);
    assert.equal(calm.positive, true); assert.equal(s.emotions.without_emotion.trades, 16);
    assert.deepEqual(pickInsights(s, 10).find((x) => x.id === 'emotion_cost').params, { emotion: 'fomo', net: -200, trades: 8 });
    assert.equal(emotionStats(rows.slice(14)), null);                                         // no tagged trades
  });
  it('labels exist in all locales', async () => {
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const e of EMOTIONS) assert.ok(loc['notes.emotion.' + e], l + ' ' + e);
      for (const k of ['notes.emotion_label', 'notes.dictate', 'notes.dictate_stop', 'aiCoach.insight.emotion_cost', 'aiCoach.insight_q.emotion_cost']) assert.ok(loc[k], l + ' ' + k);
    }
  });
});
