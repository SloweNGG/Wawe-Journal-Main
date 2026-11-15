// supabase/functions/_shared/model-chain.ts
// Which Gemini model answers, and how long the member waits for the first word (ai-coach/index.ts).
// On the free tier the better models are often busy (429/503) or accept the request and stay silent; trying them first
// on every message cost up to FIRST_WORD_MS each before the model that works got its turn.
//   - modelHealth(): a model that was busy or silent is put last for COOLDOWN_MS (memory of the function instance: a
//     warm instance serves many messages; a cold start simply tries the configured order again). Never dropped: when
//     every model is cooling down they are still tried, in the configured order.
//   - runChain(): tries the models in that order, one more round after a short pause when the last failure was "busy";
//     waits FIRST_WORD_MS for the first word, LAST_FIRST_WORD_MS for the last model of a round and for a model that
//     answered recently (a slow but healthy model must not be cut off). Returns the answer and a timing record.
// No I/O here: the caller passes call(model, firstWordMs) and, in tests, a fake clock.

export const FIRST_WORD_MS = 8_000;
export const LAST_FIRST_WORD_MS = 20_000;
export const COOLDOWN_MS = 10 * 60_000;
export const RETRY_PAUSE_MS = 2_000;

export interface CallResult { ok: boolean; status: number; forwarded: boolean; [k: string]: unknown }
export interface Attempt { model: string; status: number; ms: number }

const isBusy = (status: number) => status === 429 || status >= 500;

export function modelHealth(now: () => number = Date.now, cooldownMs = COOLDOWN_MS) {
  const until = new Map<string, number>(), okAt = new Map<string, number>();
  return {
    // healthy models first (configured order), then the cooling ones (configured order)
    order(models: string[]): string[] {
      const t = now();
      const cool = (m: string) => (until.get(m) || 0) > t;
      return [...models.filter((m) => !cool(m)), ...models.filter(cool)];
    },
    failed(model: string, status: number) { if (isBusy(status) && cooldownMs > 0) { until.set(model, now() + cooldownMs); okAt.delete(model); } },
    worked(model: string) { until.delete(model); okAt.set(model, now()); },
    // answered within the cooldown window: worth the long wait even when it is not the last one
    trusted(model: string) { const t = okAt.get(model); return t != null && now() - t < cooldownMs; },
    cooling(): string[] { const t = now(); return [...until].filter(([, u]) => u > t).map(([m]) => m); },
  };
}
export type ModelHealth = ReturnType<typeof modelHealth>;

export interface ChainOptions {
  health?: ModelHealth;
  firstWordMs?: number;
  lastFirstWordMs?: number;
  pauseMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onReset?: () => void;                 // a model failed after part of its answer was shown
}

export async function runChain<R extends CallResult>(models: string[], call: (model: string, firstWordMs: number) => Promise<R>, o: ChainOptions = {}) {
  const now = o.now || Date.now;
  const sleep = o.sleep || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const first = o.firstWordMs ?? FIRST_WORD_MS, lastFirst = o.lastFirstWordMs ?? LAST_FIRST_WORD_MS;
  const order = o.health ? o.health.order(models) : models.slice();
  const chain = [...order, ...order];
  const attempts: Attempt[] = [];
  let got: R | null = null, used = '', lastStatus = 0;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    if (i === order.length) {
      if (lastStatus !== 429 && lastStatus !== 503) break;   // only a busy service is worth a second round
      await sleep(o.pauseMs ?? RETRY_PAUSE_MS);
    }
    // the long wait: the last model of a round (nothing behind it but a pause and a retry) and a model that answered
    // recently (once the busy ones are put last, the model that works comes first and must not be cut off at 8 s)
    const lastCandidate = i % order.length === order.length - 1 || !!o.health?.trusted(model);
    const t0 = now();
    const r = await call(model, lastCandidate ? lastFirst : first);
    attempts.push({ model, status: r.ok ? 200 : r.status, ms: now() - t0 });
    if (r.ok) { got = r; used = model; o.health?.worked(model); break; }
    lastStatus = r.status;
    o.health?.failed(model, r.status);
    if (!isBusy(r.status)) break;                       // a request error does not get better on another model
    if (r.forwarded) o.onReset?.();
  }
  return { got, used, lastStatus, attempts };
}
