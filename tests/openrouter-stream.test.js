// ============================================================
// AI coach fallback: OpenRouter's OpenAI-compatible stream (supabase/functions/_shared/openrouter-stream.ts).
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOpenRouter, openRouterChain, chatMessages, chatRequest, createChatBuilder, chatOutcome } from '../supabase/functions/_shared/openrouter-stream.ts';
import { takeSseEvents } from '../supabase/functions/_shared/gemini-stream.ts';

describe('openrouter chain', () => {
  it('prefixes model ids once and skips blanks', () => {
    assert.deepEqual(openRouterChain(' nvidia/a:free , ,openrouter:google/b '), ['openrouter:nvidia/a:free', 'openrouter:google/b']);
    assert.deepEqual(openRouterChain(''), []);
    assert.deepEqual(openRouterChain(undefined), []);
    assert.equal(isOpenRouter('openrouter:x'), true);
    assert.equal(isOpenRouter('gemini-3.5-flash-lite'), false);
  });
  it('request: plain model id, streaming, low reasoning kept out of the stream', () => {
    const r = chatRequest('openrouter:nvidia/a:free', [{ role: 'user', content: 'x' }]);
    assert.equal(r.model, 'nvidia/a:free');
    assert.equal(r.stream, true);
    assert.deepEqual(r.reasoning, { effort: 'low', exclude: true });
  });
});

describe('openrouter messages', () => {
  it('system first, history as text, image note, this message last', () => {
    const m = chatMessages('SYS', [
      { role: 'model', content: 'cut-off start' },
      { role: 'user', content: 'q1', had_image: true },
      { role: 'model', content: 'a1', steps: [{ type: 'thought', signature: 's' }] },
      { role: 'user', content: 'q2' },
      { role: 'model', content: '' },
    ], 'q3');
    assert.deepEqual(m.map((x) => x.role), ['system', 'user', 'assistant', 'user', 'user']);
    assert.equal(m[0].content, 'SYS');
    assert.match(m[1].content, /^q1\n\[The trader attached a chart screenshot/);
    assert.equal(m[2].content, 'a1');
    assert.equal(m[4].content, 'q3');
  });

  it('this message carries its chart screenshot as a data URL, earlier ones only the note', () => {
    const m = chatMessages('SYS', [{ role: 'user', content: 'q1', had_image: true }, { role: 'model', content: 'a1' }],
      'q2', { mime_type: 'image/png', data: 'QUJD' });
    assert.match(m[1].content, /^q1\n\[The trader attached a chart screenshot/);
    assert.deepEqual(m[3].content, [
      { type: 'text', text: 'q2' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
    ]);
    assert.equal(chatMessages('SYS', [], 'q', null)[1].content, 'q');
  });
});

const sse = (...chunks) => chunks.map((c) => (typeof c === 'string' ? c : 'data: ' + JSON.stringify(c)) + '\n\n').join('');
const run = (text) => { const b = createChatBuilder(); const out = []; for (const ev of takeSseEvents(text).events) out.push(b.push(ev)); return { r: b.result(), out }; };

describe('openrouter stream', () => {
  it('collects content deltas, ignores reasoning and comments', () => {
    const { r, out } = run(sse(': OPENROUTER PROCESSING',
      { choices: [{ delta: { role: 'assistant', content: '' } }] },
      { choices: [{ delta: { reasoning: 'hmm' } }] },
      { choices: [{ delta: { content: 'Mer' } }] },
      { choices: [{ delta: { content: 'haba' }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 10 } }, 'data: [DONE]'));
    assert.equal(r.text, 'Merhaba');
    assert.deepEqual(out.filter(Boolean), ['Mer', 'haba']);
    assert.equal(chatOutcome(r), 200);
  });
  it('cut-off, empty, mid-stream error and length', () => {
    assert.equal(chatOutcome(run(sse({ choices: [{ delta: { content: 'yarım' } }] })).r), 503);
    assert.equal(chatOutcome(run(sse({ choices: [{ delta: { content: ' ' }, finish_reason: 'stop' }] })).r), 503);
    assert.equal(chatOutcome(run(sse({ choices: [{ delta: { content: 'x' }, finish_reason: 'error' }] })).r), 503);
    assert.equal(chatOutcome(run(sse({ choices: [{ delta: { content: 'x' }, finish_reason: 'length' }] })).r), 200);
    assert.equal(chatOutcome(run(sse({ error: { code: 429, message: 'rate-limited upstream' } })).r), 429);
    assert.equal(chatOutcome(run(sse({ error: { code: 502, message: 'bad gateway' } })).r), 503);
    assert.equal(chatOutcome(run(sse({ error: { code: 400, message: 'bad request' } })).r), 400);
    assert.equal(chatOutcome(run(sse({ error: { code: 'server_error', message: '?' } })).r), 503);
  });
});
