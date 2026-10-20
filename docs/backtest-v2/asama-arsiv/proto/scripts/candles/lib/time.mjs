// UTC calendar helpers. All times are integer epoch SECONDS (bar open time) unless named *Ms.
export const MIN = 60;
export const DAY = 86400;

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isYm(s) { return typeof s === 'string' && YM_RE.test(s); }
export function isDay(s) { return typeof s === 'string' && DAY_RE.test(s) && dayStr(dayStart(s)) === s; }

export function parseYm(ym) {
  const m = YM_RE.exec(ym);
  if (!m) throw new Error(`invalid month "${ym}" (expected YYYY-MM)`);
  return { y: +m[1], m: +m[2] };
}
export function ymOf(sec) { const d = new Date(sec * 1000); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1); }
export function ymAdd(ym, n) { const { y, m } = parseYm(ym); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1); }
export function ymCmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }   // lexical order == chronological for YYYY-MM
export function ymRange(from, to) {
  const out = [];
  for (let ym = from; ymCmp(ym, to) <= 0; ym = ymAdd(ym, 1)) { out.push(ym); if (out.length > 2400) throw new Error('month range too long'); }
  return out;
}
export function monthStart(ym) { const { y, m } = parseYm(ym); return Date.UTC(y, m - 1, 1) / 1000; }
export function monthEnd(ym) { const { y, m } = parseYm(ym); return Date.UTC(y, m, 1) / 1000; }   // exclusive
export function daysInMonth(ym) { return (monthEnd(ym) - monthStart(ym)) / DAY; }

export function dayStart(day) { const m = DAY_RE.exec(day); if (!m) throw new Error(`invalid day "${day}" (expected YYYY-MM-DD)`); return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000; }
export function dayStr(sec) { const d = new Date(sec * 1000); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
export function dayAdd(day, n) { return dayStr(dayStart(day) + n * DAY); }
export function daysOfMonth(ym) { const s = monthStart(ym), n = daysInMonth(ym), out = []; for (let i = 0; i < n; i++) out.push(dayStr(s + i * DAY)); return out; }
export function dayDiff(a, b) { return Math.round((dayStart(b) - dayStart(a)) / DAY); }   // b - a in days

export function nowSec(clock = Date.now) { return Math.floor(clock() / 1000); }
export function todayUtc(clock = Date.now) { return dayStr(Math.floor(nowSec(clock) / DAY) * DAY); }
export function currentYm(clock = Date.now) { return ymOf(nowSec(clock)); }
export function isoUtc(sec) { return new Date(sec * 1000).toISOString().replace('.000Z', 'Z'); }

export function pad2(n) { return n < 10 ? '0' + n : '' + n; }
