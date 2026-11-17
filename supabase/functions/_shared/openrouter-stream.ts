// supabase/functions/_shared/openrouter-stream.ts
// Fallback for the AI coach (ai-coach/index.ts) when every Gemini model is busy: OpenRouter's free models through its
// OpenAI-compatible chat API (POST https://openrouter.ai/api/v1/chat/completions, stream: true).
//   - A chain entry "openrouter:<model id>" (e.g. openrouter:nvidia/nemotron-3-ultra-550b-a55b:free) goes to OpenRouter;
//     everything else is a Gemini model.
//   - Stream: SSE "data: {choices:[{delta:{content}, finish_reason}], usage?}" chunks, ": OPENROUTER PROCESSING" comment
//     lines while waiting, a chunk with { error: {code, message} } when the upstream fails mid-stream, then "data: [DONE]".
//   - Reasoning effort "low", excluded from the stream: ~11 s before the first word on the coach prompt (off: ~2 s, but
//     Nemotron then misread small samples and wrote data field names). Only delta.content reaches the member.
//   - Text only: a message with a chart screenshot never goes here (the caller leaves these models out of the chain).
// Pure (Node tests): no fetch here.

export const OPENROUTER_PREFIX = 'openrouter:';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const isOpenRouter = (model: string) => model.startsWith(OPENROUTER_PREFIX);

// "nvidia/x:free, openrouter:google/y" -> ["openrouter:nvidia/x:free", "openrouter:google/y"]
export function openRouterChain(env: string | undefined | null): string[] {
  return String(env || '').split(',').map((m) => m.trim()).filter(Boolean)
    .map((m) => (isOpenRouter(m) ? m : OPENROUTER_PREFIX + m));
}

const IMAGE_NOTE = '\n[The trader attached a chart screenshot to this message; it is no longer available.]';

// system prompt + earlier turns as plain text (Gemini steps are not sent: another provider cannot use them) + this message
export function chatMessages(system: string, msgs: { role: string; content: string; had_image?: boolean }[], message: string) {
  const h: { role: string; content: string }[] = [];
  for (const m of msgs) {
    if (m.role === 'user') h.push({ role: 'user', content: m.content + (m.had_image ? IMAGE_NOTE : '') });
    else if (m.content) h.push({ role: 'assistant', content: m.content });
  }
  while (h.length && h[0].role !== 'user') h.shift();      // the cut may start inside a model turn
  return [{ role: 'system', content: system }, ...h, { role: 'user', content: message }];
}

export function chatRequest(model: string, messages: unknown[]) {
  return { model: model.slice(isOpenRouter(model) ? OPENROUTER_PREFIX.length : 0), messages, stream: true, max_tokens: 4096, reasoning: { effort: 'low', exclude: true } };
}

export interface ChatResult { text: string; finish: string; error: { code: string; message: string } | null }

// collects the answer from parsed SSE events; push() returns the new answer text of one event ('' when none)
export function createChatBuilder() {
  let text = '', finish = '', error: ChatResult['error'] = null;
  return {
    push(ev: any): string {
      if (ev?.error) { error = { code: String(ev.error.code ?? ''), message: String(ev.error.message ?? '').slice(0, 200) }; return ''; }
      const c = ev?.choices?.[0];
      if (!c) return '';
      if (c.finish_reason) finish = String(c.finish_reason);
      const d = typeof c.delta?.content === 'string' ? c.delta.content : '';
      text += d;
      return d;
    },
    result(): ChatResult { return { text, finish, error }; },
  };
}

// HTTP-like status of a finished stream: 200 = a usable answer; 429/503 = busy, the next model may answer; 400 = request
// error. "length" (cut at max_tokens) is still an answer, like Gemini's.
export function chatOutcome(r: ChatResult): number {
  if (r.error) {
    const n = Number(r.error.code);
    if (n === 429) return 429;
    if (n >= 400 && n < 500 && n !== 408) return 400;
    return 503;
  }
  if (!r.text.trim()) return 503;
  if (r.finish === 'stop' || r.finish === 'length') return 200;
  return 503;                                           // cut off ('' = no finish_reason) or 'error'
}
