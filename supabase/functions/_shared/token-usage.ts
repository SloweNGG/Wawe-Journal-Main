// supabase/functions/_shared/token-usage.ts
// Token counts of one AI coach answer, for the "ai-coach tokens" log line (ai-coach/index.ts). Step 0 of the token
// reduction plan: measure what is sent, read from the cache and generated.
// Each provider names the fields differently:
//   - Gemini Interactions API (interaction.completed -> interaction.usage): total_input_tokens, total_cached_tokens,
//     total_output_tokens, total_thought_tokens, total_tokens
//   - Gemini generateContent (usageMetadata): promptTokenCount, cachedContentTokenCount, candidatesTokenCount, thoughtsTokenCount
//   - OpenRouter / OpenAI chat (last chunk -> usage): prompt_tokens, prompt_tokens_details.cached_tokens, completion_tokens,
//     completion_tokens_details.reasoning_tokens
// Pure (Node tests).

export interface TokenUsage { input: number | null; cached: number | null; output: number | null; thoughts: number | null; total: number | null }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const first = (...v: unknown[]) => { for (const x of v) { const n = num(x); if (n != null) return n; } return null; };

// null when the provider sent no usage at all
export function normalizeUsage(u: any): TokenUsage | null {
  if (!u || typeof u !== 'object') return null;
  const r: TokenUsage = {
    input: first(u.total_input_tokens, u.promptTokenCount, u.prompt_tokens, u.input_tokens),
    cached: first(u.total_cached_tokens, u.cachedContentTokenCount, u.prompt_tokens_details?.cached_tokens, u.cached_tokens),
    output: first(u.total_output_tokens, u.candidatesTokenCount, u.completion_tokens, u.output_tokens),
    thoughts: first(u.total_thought_tokens, u.thoughtsTokenCount, u.completion_tokens_details?.reasoning_tokens, u.reasoning_tokens),
    total: first(u.total_tokens, u.totalTokenCount),
  };
  return Object.values(r).some((v) => v != null) ? r : null;
}

// characters of each part of the prompt (the APIs only give one input total): where the input tokens go
export function promptParts(parts: Record<string, string | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parts)) out[k] = typeof v === 'string' ? v.length : 0;
  return out;
}
