// fetch with timeout, bounded retries and exponential backoff with jitter (Node global fetch, no npm).
export const USER_AGENT = 'wawe-journal-candles/1 (+https://wawejournal.com)';

export class HttpError extends Error {
  constructor(message, { status, url, body, retriable } = {}) {
    super(message); this.name = 'HttpError';
    this.status = status; this.url = url; this.body = body; this.retriable = !!retriable;
  }
}

const RETRIABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Retry-After (seconds or HTTP date) -> ms, capped. */
export function retryAfterMs(value, capMs = 60000, now = Date.now()) {
  if (!value) return null;
  const s = Number(value);
  if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, capMs);
  const d = Date.parse(value);
  return Number.isFinite(d) ? Math.min(Math.max(0, d - now), capMs) : null;
}

export function backoffMs(attempt, { baseMs = 1000, maxMs = 30000, random = Math.random } = {}) {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * exp / 2);          // "equal jitter": [exp/2, exp]
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ fetch?, retries?, timeoutMs?, sleep?, log?, accept404?: boolean, label?: string }} o
 * @returns {Promise<Response|null>} null only when accept404 and the server answered 404
 */
export async function fetchWithRetry(url, init = {}, o = {}) {
  const doFetch = o.fetch || globalThis.fetch;
  const retries = o.retries ?? 5;
  const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const label = o.label || url;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await doFetch(url, { ...init, signal: AbortSignal.timeout(o.timeoutMs ?? 120000), headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) } });
    } catch (e) {
      lastErr = new HttpError(`${label}: network error (${e.name === 'TimeoutError' ? 'timeout' : e.code || e.message})`, { url, retriable: true });
      if (attempt < retries) { await sleep(backoffMs(attempt)); continue; }
      throw lastErr;
    }
    if (res.ok) return res;
    if (res.status === 404 && o.accept404) { await res.body?.cancel?.(); return null; }
    const body = await res.text().catch(() => '');
    const retriable = RETRIABLE_STATUS.has(res.status);
    lastErr = new HttpError(`${label}: HTTP ${res.status}`, { status: res.status, url, body: body.slice(0, 300), retriable });
    if (!retriable || attempt === retries) throw lastErr;
    const wait = retryAfterMs(res.headers.get('retry-after')) ?? backoffMs(attempt);
    o.log?.warn?.(`${label}: HTTP ${res.status}, retry ${attempt + 1}/${retries} in ${Math.round(wait / 1000)} s`);
    await sleep(wait);
  }
  throw lastErr;
}

/** Tiny promise pool: run fn over items with at most `limit` in flight; results keep input order. */
export async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}

/** Serialize async critical sections (one manifest writer per dataset). */
export function createMutex() {
  let tail = Promise.resolve();
  return (fn) => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; };
}
