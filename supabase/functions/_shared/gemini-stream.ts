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

// Reasoning written into the answer. Sometimes a model writes its thinking ("Thinking Process: Analyze the User's
// Input ... Constraint Checklist ... Drafting ...") as ordinary output text instead of a thought step, and the member
// saw all of it. The guard holds back the start of the answer until it can tell, and stops the stream when such text
// appears; the caller then treats the attempt as failed and asks the next model.
const LEAK_START = /^[\s*#_>`-]*(thinking process|thought process|thoughts?\s*[:\n]|my reasoning|reasoning( process)?\s*:|internal (reasoning|monologue)|analy[sz](e|ing) the (user'?s?|trader'?s?) (input|request|message|question))/i;
const LEAK_ANY = /(constraint checklist|drafting the (response|answer)|refining (the )?(length|tone|response|draft)|evaluate against (the )?(coach )?persona|word count:\s*~?\d|\bthe user (says|said|asks|asked|is asking|wants|just)\b)/i;
export const LEAK_HOLD_CHARS = 80;
export function leakedReasoning(text: string): boolean { return LEAK_START.test(text) || LEAK_ANY.test(text); }

// forward(text) gets the text the member may see. push() returns false once reasoning was found (stop the stream).
export function createLeakGuard(forward: (t: string) => void, hold = LEAK_HOLD_CHARS) {
  let all = '', sent = 0, leaked = false;
  const check = () => {
    // the start pattern only on the opening; the other phrases anywhere (a window around the new text is enough)
    if (sent === 0 && LEAK_START.test(all)) leaked = true;
    else if (LEAK_ANY.test(all.slice(Math.max(0, sent - 60)))) leaked = true;
    return !leaked;
  };
  const release = () => { if (all.length > sent) { forward(all.slice(sent)); sent = all.length; } };
  return {
    push(d: string): boolean {
      if (leaked) return false;
      all += d;
      if (!check()) return false;
      if (sent > 0 || all.trim().length >= hold) release();
      return true;
    },
    // end of the answer: a short answer that never reached the hold length is checked and sent now
    end(): boolean { if (leaked || !check()) return false; release(); return true; },
    get leaked() { return leaked; },
    get forwarded() { return sent > 0; },
  };
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
