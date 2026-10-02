// Plain-language help for "Walk one back".  A refusal itself is the
// engine's (exactly when and why the reference refuses); this only spots
// the common paste mistakes behind it and names keyboards and lists the way
// the page does (the engine's own message stays available as is).  And the
// decoded text, split into what was typed and what the key carried.
import { T, LANG_NAMES } from "./text.js";

/** The candidate lists, as an error message names them, in the page's words. */
const EDGE_NAMES = {
  "homophone:zh": "Chinese sound",
  "homophone:zh_jyutping": "Cantonese sound",
  "homophone:ko_hanja": "hanja",
  "homophone:ja": "Japanese reading",
  "shape:zh_cangjie": "Cangjie code",
  "shape:zh_quick": "Quick code",
};

/**
 * An engine message with its internal names replaced: layout ids by the
 * keyboard's name on the page (`surfaces`: the engine's site surfaces),
 * list ids by what they list, translate:a>b by its dictionary.
 */
export function plainMessage(message, surfaces) {
  const names = new Map(surfaces.filter(s => s.id === s.layout).map(s => [s.layout, `${s.label} keyboard`]));
  return String(message)
    .replace(/\btranslate:([a-z]{2})>([a-z]{2})\b/g, (m, a, b) =>
      (LANG_NAMES[a] && LANG_NAMES[b] ? `the ${LANG_NAMES[a]}-to-${LANG_NAMES[b]} dictionary` : m))
    .replace(/\b(?:homophone|shape):[a-z_]+\b/g, m => EDGE_NAMES[m] || m)
    .replace(/\b[a-z]{2}_[a-z]+\b/g, m => names.get(m) || m);
}

const QUOTES = [['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"], ["`", "`"]];
// ASCII whitespace, as the kp1 reader trims it
const trimmed = s => String(s).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
const isKp1 = s => /^kp1\./i.test(s);
const looksLikeKey = s => s.startsWith("{") || isKp1(s);
/** Printable ASCII and nothing else: what a ciphertext is made of. */
const looksLikeCiphertext = s => /^[\x21-\x7e]+$/.test(s) && !looksLikeKey(s);

/**
 * One advice line for a refused walk, when the boxes look like a common
 * paste mistake (else null): a key in quotation marks, the boxes swapped,
 * a short key or a ciphertext with spaces or line breaks inside.
 */
export function pasteAdvice(ciphertext, keyText) {
  const c = trimmed(ciphertext), k = trimmed(keyText);
  const q = QUOTES.find(([open, close]) => k.length >= 2 && k.startsWith(open) && k.endsWith(close));
  if (q && looksLikeKey(trimmed(k.slice(q[0].length, -q[1].length)))) return T.adviceQuoted;
  if (looksLikeCiphertext(k) && (!c || looksLikeKey(c))) return T.adviceSwapped;
  if (isKp1(k) && /\s/.test(k)) return T.adviceKp1Spaces;
  if (/\s/.test(c)) return T.adviceCipherSpaces;
  return null;
}

/**
 * The decoded text of a trace as runs, {text, literal}: literal runs are
 * text the key carried as plain text, not typed.  Joined, the runs are the
 * trace's text exactly (words joined as the decoder joins them: a space
 * between two words of a spaced language, within a segment); null if not.
 */
export function decodedRuns(trace, spacedLanguages) {
  const joiner = spacedLanguages.includes(trace.source) ? " " : "";
  const runs = [];
  const push = (text, literal) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.literal === literal) last.text += text;
    else runs.push({ text, literal });
  };
  for (const seg of trace.segments) {
    let prev = null;
    for (const word of seg.words) {
      const literal = Object.prototype.hasOwnProperty.call(word, "literal");
      if (!literal && joiner && prev === "word") push(joiner, false);
      push(literal ? word.literal : word.source, literal);
      prev = literal ? "literal" : "word";
    }
  }
  return runs.map(r => r.text).join("") === trace.text ? runs : null;
}
