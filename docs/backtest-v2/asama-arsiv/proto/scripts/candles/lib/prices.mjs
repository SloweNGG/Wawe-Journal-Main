// Exact price handling: every price is an integer number of POINTS (point = 10^-digits).
// Source strings are converted with string arithmetic (never parseFloat * 10^d, which turns 1.005 into 1.00).

const DEC_RE = /^(\d{1,15})(?:\.(\d{1,20}))?$/;

/**
 * "81615.91000000" -> { pts: 8161591, rounded: false } for digits 2.
 * Extra non-zero decimals are rounded half-up (prices are positive) and reported with rounded:true.
 * Returns null for anything that is not a plain non-negative decimal (sign, exponent, NaN, empty).
 */
export function decimalToPoints(str, digits) {
  const m = DEC_RE.exec(str);
  if (!m) return null;
  const frac = m[2] || '';
  const head = (frac + '0'.repeat(digits)).slice(0, digits);
  const tail = frac.slice(digits);
  let pts = Number(m[1] + head);
  let rounded = false;
  if (/[1-9]/.test(tail)) { rounded = true; if (tail.charCodeAt(0) >= 53 /* '5' */) pts += 1; }
  if (!Number.isSafeInteger(pts)) return null;
  return { pts, rounded };
}

const POW10 = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];

/** Integer points -> JS number with at most `digits` decimals (JSON.stringify prints the shortest exact form). */
export function pointsToNumber(pts, digits) { return pts / POW10[digits]; }

/** JS number from a decoded month file -> integer points (inverse of pointsToNumber; exact for |pts| < 2^53 / 10). */
export function numberToPoints(x, digits) { return Math.round(x * POW10[digits]); }

/** True when a JS number has no more than `digits` decimals after JSON serialization. */
export function hasAtMostDigits(x, digits) {
  const s = String(x);
  if (/e/i.test(s)) return false;
  const i = s.indexOf('.');
  return i < 0 || s.length - i - 1 <= digits;
}
