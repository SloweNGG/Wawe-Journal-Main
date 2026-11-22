// ============================================================
// AI coach token log (supabase/functions/_shared/token-usage.ts) and the usage the stream builders keep.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsage, promptParts } from '../supabase/functions/_shared/token-usage.ts';
import { createStepBuilder } from '../supabase/functions/_shared/gemini-stream.ts';
import { createChatBuilder, chatRequest, chatOutcome } from '../supabase/functions/_shared/openrouter-stream.ts';

describe('normalizeUsage', () => {
  it('Gemini Interactions usage', () => {
    assert.deepEqual(normalizeUsage({ total_input_tokens: 12500, total_cached_tokens: 5000, total_output_tokens: 400, total_thought_tokens: 120, total_tokens: 13020 }),
      { input: 12500, cached: 5000, output: 400, thoughts: 120, total: 13020 });
  });
  it('Gemini generateContent usageMetadata', () => {
    assert.deepEqual(normalizeUsage({ promptTokenCount: 900, cachedContentTokenCount: 300, candidatesTokenCount: 50, totalTokenCount: 950 }),
      { input: 900, cached: 300, output: 50, thoughts: null, total: 950 });
  });
  it('OpenRouter / OpenAI usage', () => {
    assert.deepEqual(normalizeUsage({ prompt_tokens: 11000, completion_tokens: 600, total_tokens: 11600,
      prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 200 } }),
    { input: 11000, cached: 0, output: 600, thoughts: 200, total: 11600 });
  });
  it('nothing usable -> null', () => {
    assert.equal(normalizeUsage(null), null);
    assert.equal(normalizeUsage({}), null);
    assert.equal(normalizeUsage({ total_tokens: 'x', prompt_tokens: -1 }), null);
  });
});

describe('promptParts', () => {
  it('character counts, missing parts 0', () => {
    assert.deepEqual(promptParts({ system: 'abcd', history: '', image: null }), { system: 4, history: 0, image: 0 });
  });
});

describe('stream builders keep the usage', () => {
  it('Gemini: interaction.completed usage', () => {
    const b = createStepBuilder();
    b.push({ event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'hi' } });
    assert.equal(b.result().usage, null);
    b.push({ event_type: 'interaction.completed', interaction: { status: 'completed', usage: { total_input_tokens: 7 } } });
    assert.deepEqual(b.result().usage, { total_input_tokens: 7 });
  });
  it('OpenRouter: usage of the last chunk (one choice, empty delta, finish repeated); answer unchanged', () => {
    const b = createChatBuilder();
    b.push({ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] });
    assert.equal(b.push({ choices: [{ delta: { content: '' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } }), '');
    assert.deepEqual(b.result(), { text: 'x', finish: 'stop', error: null, usage: { prompt_tokens: 10, completion_tokens: 2 } });
    assert.equal(chatOutcome(b.result()), 200);
    assert.equal('usage' in chatRequest('openrouter:a', []), false);     // deprecated parameter not sent
  });
});
