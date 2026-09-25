// Code-point helpers and the Unicode-14 guard.
//
// KeyPath 2.0.0 runs on Python 3.11, whose Unicode database is 14.0.0; a
// browser may be newer.  By the Unicode normalization stability policy, NFC
// of text made only of code points assigned in Unicode 14 is the same in
// every later version, so the engine refuses anything else (and lone
// surrogates, which Python's encoder refuses too).

/** The code points of `s` as an array of strings (never UTF-16 units). */
export const codePoints = s => Array.from(s);

/** Length in code points. */
export function cpLength(s) {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Compare two strings by code point (Python's str order), not UTF-16 order. */
export function cpCompare(a, b) {
  const x = a[Symbol.iterator](), y = b[Symbol.iterator]();
  for (;;) {
    const p = x.next(), q = y.next();
    if (p.done || q.done) return p.done && q.done ? 0 : p.done ? -1 : 1;
    const d = p.value.codePointAt(0) - q.value.codePointAt(0);
    if (d) return d < 0 ? -1 : 1;
  }
}

/** "U+XXXX" (at least four uppercase hex digits). */
export const formatCodePoint = cp => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");

/**
 * Build the guard from data/unicode14.json ([[first, last], ...], sorted).
 * The returned function gives the first code point of `text` that is a lone
 * surrogate or unassigned in Unicode 14, or null when there is none.
 */
export function makeUnicodeGuard(ranges) {
  const firsts = ranges.map(r => r[0]);
  const assigned = cp => {
    let lo = 0, hi = firsts.length - 1, at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (firsts[mid] <= cp) { at = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return at >= 0 && cp <= ranges[at][1];
  };
  return function firstNewer(text) {
    for (let i = 0; i < text.length;) {
      const cp = text.codePointAt(i);
      if ((cp >= 0xd800 && cp <= 0xdfff) || !assigned(cp)) return cp;
      i += cp > 0xffff ? 2 : 1;
    }
    return null;
  };
}
