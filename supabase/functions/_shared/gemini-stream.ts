// supabase/functions/_shared/gemini-stream.ts
// Gemini Interactions API streaming (POST /v1beta/interactions?alt=sse, stream: true). Server-sent events:
//   interaction.created, interaction.status_update, step.start {index, step:{type}}, step.delta {index, delta},
//   step.stop {index}, interaction.completed {interaction:{status, usage}} (no steps), error {error:{code,message}}, then [DONE].
// The final interaction carries no steps, so they are rebuilt here from the deltas: text deltas append to the step's text,
// thought_signature deltas set the thought step's signature (needed when the turn is sent back later). Pure (Node tests).

// status is '' when the stream ended without interaction.completed: the answer may be cut off (seen on the free tier)
export interface StreamResult { steps: any[]; text: string; status: string; error: { code: string; message: string } | null }

// splits a growing SSE text buffer into complete events; returns the rest (an incomplete event) to keep for the next chunk
export function takeSseEvents(buffer: string): { events: any[]; rest: string } {
  const events: any[] = [];
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  for (const block of parts) {
    const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data || data === '[DONE]') continue;
    try { events.push(JSON.parse(data)); } catch (_) { /* a broken event is skipped */ }
  }
  return { events, rest };
}

export function createStepBuilder() {
  const steps: any[] = [];
  let text = '', status = '', error: StreamResult['error'] = null;
  function step(i: number) { return steps[i] || (steps[i] = { type: 'model_output' }); }
  return {
    // returns the text delta of this event ('' when none)
    push(ev: any): string {
      const t = ev?.event_type;
      if (t === 'step.start' && Number.isInteger(ev.index)) {
        steps[ev.index] = { ...(ev.step || {}), type: ev.step?.type || 'model_output' };
        return '';
      }
      if (t === 'step.delta' && Number.isInteger(ev.index) && ev.delta) {
        const s = step(ev.index), d = ev.delta;
        if (d.type === 'text' && typeof d.text === 'string') {
          if (s.type === 'model_output') {
            const c = (s.content ||= []);
            if (!c.length || c[c.length - 1].type !== 'text') c.push({ type: 'text', text: '' });
            c[c.length - 1].text += d.text;
            text += d.text;
            return d.text;
          }
          s.text = (s.text || '') + d.text;                            // e.g. a thought summary
          return '';
        }
        if (d.type === 'thought_signature' && typeof d.signature === 'string') { s.signature = d.signature; return ''; }
        return '';
      }
      if (t === 'interaction.completed') { status = ev.interaction?.status || 'completed'; return ''; }
      if (t === 'error') { error = { code: String(ev.error?.code || 'error'), message: String(ev.error?.message || '') }; return ''; }
      return '';
    },
    result(): StreamResult { return { steps: steps.filter(Boolean), text: text.trim(), status, error }; },
  };
}
