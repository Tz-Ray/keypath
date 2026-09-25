// Ports of keypath/surfaces/base.py: regex_tokens, tokens_to_items and
// assemble_words (the docs/07 §3 joiner rule).

/** Words are the regex's matches (a global, `u`-flag RegExp); the text between them is sep runs. */
export function regexTokens(text, wordRe) {
  const tokens = [];
  let pos = 0;
  wordRe.lastIndex = 0;
  for (const m of text.matchAll(wordRe)) {
    if (m.index > pos) tokens.push(["sep", text.slice(pos, m.index)]);
    tokens.push(["word", m[0]]);
    pos = m.index + m[0].length;
  }
  if (pos < text.length) tokens.push(["sep", text.slice(pos)]);
  return tokens;
}

/** Encode every word token (in order), keep seps: [kind, text, encoded|null]. */
export const tokensToItems = (tokens, encode) =>
  tokens.map(([kind, value]) => [kind, value, kind === "word" ? encode(value) : null]);

/**
 * items: [kind, text, encoded] where encoded is [entry, keys] or null (a
 * tier-3 literal; consecutive literal texts merge).  In a spaced source
 * language a single " " separator between two encoded words is implicit.
 * Returns {words, parts}.
 */
export function assembleWords(items, spaced) {
  const isEncodedWord = i => i >= 0 && i < items.length && items[i][0] === "word" && items[i][2] !== null;
  const words = [], parts = [];
  let literal = [];
  const flush = () => {
    if (literal.length) {
      words.push({ literal: { tier: 3, text: literal.join("") } });
      literal = [];
    }
  };
  items.forEach(([kind, value, encoded], i) => {
    if (kind === "sep" || encoded === null) {
      if (spaced && kind === "sep" && value === " " && isEncodedWord(i - 1) && isEncodedWord(i + 1)) return;
      literal.push(value);
    } else {
      flush();
      words.push(encoded[0]);
      parts.push(encoded[1]);
    }
  });
  flush();
  return { words, parts };
}
