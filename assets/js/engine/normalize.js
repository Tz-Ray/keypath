// Port of keypath/normalize.py (docs/10 §3.2, §9.7 "Text rules"): NFC
// (never NFKC), then lowercase for en, es, ru and vi, then runs of two or
// more U+0020 collapse to one.  Tabs and newlines are kept.  Lowercasing is
// toLowerCase() on the whole string, which applies Final_Sigma as Python's
// str.lower() does; it agrees with Python on every Unicode-14 code point
// (tests/unicode.test.js checks all 1,433 that change).  LOWER_OVERRIDES
// must stay empty: a per-code-point path would break Final_Sigma.

export const LOWERCASE_LANGUAGES = new Set(["en", "es", "ru", "vi"]);

export const LOWER_OVERRIDES = new Map();

export function pyLower(s) {
  const out = s.toLowerCase();
  if (!LOWER_OVERRIDES.size) return out;
  let r = "";
  for (const ch of s) r += LOWER_OVERRIDES.has(ch) ? LOWER_OVERRIDES.get(ch) : ch.toLowerCase();
  return r;
}

export function normalize(text, language) {
  let out = text.normalize("NFC");
  if (LOWERCASE_LANGUAGES.has(language)) out = pyLower(out);
  return out.replace(/ {2,}/g, " ");
}
