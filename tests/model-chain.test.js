// ============================================================
// AI coach: which Gemini model answers and how long the member waits for the first word
// (supabase/functions/_shared/model-chain.ts). A fake clock replays the free-tier situations seen in production
// (mid-November 2026: the two better models are almost always busy, flash-lite answers), two messages
// in a row on the same function instance, with the old settings (20 s per model, no memory) and the new ones.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runChain, modelHealth, FIRST_WORD_MS, LAST_FIRST_WORD_MS, COOLDOWN_MS } from '../supabase/functions/_shared/model-chain.ts';

const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];

// behaviour per model: { busy: ms } = 503 after ms; { silent: true } = never a word (cut at the wait);
// { word: ms } = first word after ms (cut when the wait is shorter)
export function simulate(behaviour, { useNew, messages = 2 }) {
  let t = 0;
  const now = () => t;
  const sleep = (ms) => { t += ms; return Promise.resolve(); };
  const health = useNew ? modelHealth(now) : undefined;
  const opts = useNew ? { health, now, sleep } : { firstWordMs: 20_000, lastFirstWordMs: 20_000, now, sleep };
  const out = [];
  return (async () => {
    for (let m = 0; m < messages; m++) {
      const start = t;
      let firstWord = null;
      const call = async (model, wait) => {
        const b = behaviour[model];
        if (b.busy != null) { t += b.busy; return { ok: false, status: 503, forwarded: false }; }
        if (b.silent || b.word > wait) { t += wait; return { ok: false, status: 503, forwarded: false }; }
        t += b.word; firstWord = t; t += 3000;                        // the rest of the answer streams in
        return { ok: true, status: 200, forwarded: true };
      };
      const r = await runChain(MODELS, call, opts);
      out.push({ firstWordS: firstWord == null ? null : (firstWord - start) / 1000, model: r.used || null, tries: r.attempts.length });
      t += 60_000;                                                    // next message a minute later
    }
    return out;
  })();
}

const SCENARIOS = {
  'busy, fast 503': { [MODELS[0]]: { busy: 600 }, [MODELS[1]]: { busy: 600 }, [MODELS[2]]: { word: 2500 } },
  'busy, silent': { [MODELS[0]]: { silent: true }, [MODELS[1]]: { silent: true }, [MODELS[2]]: { word: 2500 } },
  'mixed': { [MODELS[0]]: { silent: true }, [MODELS[1]]: { busy: 600 }, [MODELS[2]]: { word: 2500 } },
  'healthy': { [MODELS[0]]: { word: 3000 }, [MODELS[1]]: { word: 3000 }, [MODELS[2]]: { word: 2500 } },
  'silent + slow lite': { [MODELS[0]]: { silent: true }, [MODELS[1]]: { silent: true }, [MODELS[2]]: { word: 11_000 } },
};

describe('model chain: time to the first word (simulated free tier)', () => {
  it('settings', () => {
    assert.equal(FIRST_WORD_MS, 8000);
    assert.equal(LAST_FIRST_WORD_MS, 20_000);
    assert.equal(COOLDOWN_MS, 600_000);
  });
  it('the new settings are never slower, and much faster when the better models are silent', async () => {
    for (const [name, b] of Object.entries(SCENARIOS)) {
      const before = await simulate(b, { useNew: false }), after = await simulate(b, { useNew: true });
      for (let i = 0; i < 2; i++) {
        assert.ok(after[i].firstWordS != null, name + ' answers');
        assert.ok(after[i].firstWordS <= before[i].firstWordS, name + ' message ' + (i + 1));
        assert.equal(after[i].model, before[i].model, name + ' same model answers');
      }
    }
    const s = await simulate(SCENARIOS['busy, silent'], { useNew: true }), o = await simulate(SCENARIOS['busy, silent'], { useNew: false });
    assert.equal(o[0].firstWordS, 42.5);                 // before: 20 s + 20 s of silence, then flash-lite
    assert.equal(s[0].firstWordS, 18.5);                 // now: 8 s + 8 s on the first message
    assert.equal(s[1].firstWordS, 2.5);                  // and straight to flash-lite on the next ones
  });
  it('a slow but healthy last model is not cut off', async () => {
    const r = await simulate(SCENARIOS['silent + slow lite'], { useNew: true });
    assert.equal(r[0].model, 'gemini-3.5-flash-lite');
    assert.equal(r[1].firstWordS, 11);
  });
  it('a busy model is retried after the cooldown, and models that all cool down are still tried', () => {
    let t = 0;
    const h = modelHealth(() => t);
    h.failed(MODELS[0], 503); h.failed(MODELS[1], 429);
    assert.deepEqual(h.order(MODELS), [MODELS[2], MODELS[0], MODELS[1]]);
    h.failed(MODELS[2], 503);
    assert.deepEqual(h.order(MODELS), MODELS);           // all cooling: configured order
    t += COOLDOWN_MS + 1;
    assert.deepEqual(h.order(MODELS), MODELS);
    h.failed(MODELS[0], 400);                            // a request error is not "busy"
    assert.deepEqual(h.cooling(), []);
    h.failed(MODELS[0], 503); h.worked(MODELS[0]);
    assert.deepEqual(h.cooling(), []);
  });
  it('a request error stops the chain; a broken partial answer resets the panel', async () => {
    let resets = 0;
    const calls = [];
    const r = await runChain(MODELS, async (m) => { calls.push(m); return m === MODELS[0] ? { ok: false, status: 503, forwarded: true } : { ok: false, status: 400, forwarded: false }; },
      { sleep: async () => {}, onReset: () => { resets++; } });
    assert.deepEqual(calls, MODELS.slice(0, 2));
    assert.equal(r.got, null); assert.equal(r.lastStatus, 400); assert.equal(resets, 1);
  });
  it('the edge function uses the chain and logs only timings', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('supabase/functions/ai-coach/index.ts', 'utf8');
    assert.match(src, /await runChain\(models,/);
    // OpenRouter comes after every Gemini model; a message with a screenshot gets the models that can read images
    assert.match(src, /const models = \[\.\.\.GEMINI_MODELS, \.\.\.\(image \? OPENROUTER_VISION_MODELS : OPENROUTER_MODELS\)\];/);
    assert.match(src, /chatMessages\(system, msgs, turn, image\)/);     // turn = the [App context] line + the message
    assert.match(src, /const HEALTH = modelHealth\(\);/);
    const log = src.match(/console\.log\('ai-coach timing ' \+ JSON\.stringify\(\{([\s\S]*?)\}\)\);/);
    assert.ok(log, 'timing log');
    assert.doesNotMatch(log[1], /message|reply|user|email|content/);
    assert.doesNotMatch(src, /FIRST_WORD_MS = 20_000/);
  });
});
