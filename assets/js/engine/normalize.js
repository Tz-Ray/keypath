// Port of keypath/normalize.py: NFC (never NFKC), then lowercase for en, es
// and ru, then runs of two or more U+0020 collapse to one.  Tabs and
// newlines are kept.  JS toLowerCase() agrees with Python's str.lower() on
// every Unicode-14 code point (tests/unicode.test.js checks all 1,433 that
// change); LOWER_OVERRIDES would hold any exception.

export const LOWERCASE_LANGUAGES = new Set(["en", "es", "ru"]);

const LOWER_OVERRIDES = new Map();

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
