// English -> X over a bounded vocabulary (port of walk._encode_chain +
// tokens_to_items + assemble_words for the source language en).
//
// data/en/vocab/{a..z}.json lists the 10,000-word vocabulary.  For each
// translated surface, data/en/{surface}/{a..z}.json maps every vocabulary
// word whose Python chain succeeds to its row:
//   [target, hopIndex, hopCount, keys, lens]                 bijective surfaces
//   [target, hopIndex, hopCount, keys, lens, idx]            zh surfaces
//   [target, hopIndex, hopCount, keys, lens, idx, count, head] ja_romaji
// A vocabulary word without a row is a tier-3 literal (exactly as Python
// makes it); a word outside the vocabulary is refused, never guessed.
// Loading a row file also registers the lists the decoder reads: the hop
// list of each target and, for ja_romaji, the SKK candidates it names.
import { assembleWords, regexTokens, tokensToItems } from "./assemble.js";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
export const EN_WORD = /[a-z]+/gu;
/** A word as the reader typed it: letters and marks, around any a-z runs. */
const TYPED_WORD = /[\p{L}\p{M}'’]*[a-z][\p{L}\p{M}'’]*/gu;
export const vocabPath = letter => `data/en/vocab/${letter}.json`;
export const rowsPath = (sid, letter) => `data/en/${sid}/${letter}.json`;

export function createEnglish({ data, layouts, lists, surfaceById }) {
  const vocab = new Map();       // letter -> Set
  const rows = new Map();        // sid/letter -> object
  const pending = new Map();

  const once = (key, make) => {
    let p = pending.get(key);
    if (!p) {
      p = make();
      pending.set(key, p);
      p.catch(() => pending.delete(key));
    }
    return p;
  };

  const loadVocab = letter => once(`v/${letter}`, () => data.json(vocabPath(letter)).then(words => {
    vocab.set(letter, new Set(words));
  }));

  function register(sid, table) {
    const { language } = surfaceById(sid);
    const edge = `translate:en>${language}`;
    for (const [word, row] of Object.entries(table)) {
      const [target, hopIndex, hopCount, keys] = row;
      lists.addEntry(edge, target, hopCount, hopIndex, word);
      if (language === "ja") {
        const reading = layouts.romajiToKana(keys);
        const [, , , , , idx, count, head] = row;
        lists.addEntry("homophone:ja", reading, count, idx[0], target);
        head.forEach((item, i) => lists.addEntry("homophone:ja", reading, count, i, item));
      }
    }
  }

  const loadRows = (sid, letter) => once(`r/${sid}/${letter}`, () => data.json(rowsPath(sid, letter)).then(table => {
    rows.set(`${sid}/${letter}`, table);
    register(sid, table);
  }));

  const loadAllRows = sid => Promise.all([...LETTERS].map(letter => loadRows(sid, letter)));

  /** The key entry and keystrokes of one row. */
  function entryOf(sid, row) {
    const homophone = surfaceById(sid).homophoneLayer;
    const [, hopIndex, , keys, lens, idx] = row;
    const units = lens.map((len, i) => (homophone ? { len, homophone_index: idx[i] } : { len }));
    return [{ units, translation: { tier: 1, index: hopIndex } }, keys];
  }

  /** The row of `word` on `sid` (its files must be loaded), or null. */
  function rowOf(sid, word) {
    const table = rows.get(`${sid}/${word[0]}`);
    return table && Object.prototype.hasOwnProperty.call(table, word) ? table[word] : null;
  }

  /**
   * Normalized en text -> {words, parts} on translated surface `sid`, or
   * {unknown: [words not in the vocabulary, first-seen order], typed: [the
   * typed words that contain them, for display]}.
   */
  async function encode(text, sid) {
    const tokens = regexTokens(text, EN_WORD);
    const letters = [...new Set(tokens.filter(t => t[0] === "word").map(t => t[1][0]))];
    await Promise.all(letters.flatMap(l => [loadVocab(l), loadRows(sid, l)]));
    const unknown = [];
    for (const [kind, w] of tokens)
      if (kind === "word" && !vocab.get(w[0]).has(w) && !unknown.includes(w)) unknown.push(w);
    if (unknown.length) {
      // for display, the whole typed word ("café"), not just its a-z run ("caf")
      const typed = [];
      for (const [word] of text.matchAll(TYPED_WORD))
        if ([...word.matchAll(EN_WORD)].some(([w]) => unknown.includes(w)) && !typed.includes(word)) typed.push(word);
      return { unknown, typed };
    }
    const items = tokensToItems(tokens, w => {
      const row = rowOf(sid, w);
      return row ? entryOf(sid, row) : null;
    });
    return assembleWords(items, true);
  }

  return { encode, loadAllRows, loadRows, loadVocab, rowOf, entryOf, vocab, rows };
}
