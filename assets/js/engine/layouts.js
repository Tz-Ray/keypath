// Ports of keypath/layouts/*.py (KeyPath 2.2.0), both directions, built
// from data/layouts.json.  The keys -> text readers are adapted from
// cipher-project scripts/build_demo.py (v2.0), MIT.
//
// Every function throws LayoutError on a malformed unit, like Python.  The
// keys -> text readers throw Python's own messages, values quoted by
// pyrepr: the workbench prints them as lookup's violated rules
// (tests/workbench.test.js compares them with the Python fixtures).
import { pyrepr as R } from "./pyrepr.js";

export class LayoutError extends Error {}
const fail = msg => { throw new LayoutError(msg); };
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

export function makeLayouts(L) {
  // ------------------------------------------------------------ zh_daqian
  const dq = L.zh_daqian;
  const dqKeyToSymbol = new Map(Object.entries(dq.symbolToKey).map(([s, k]) => [k, s]));
  const dqKeyToTone = new Map(Object.entries(dq.toneToKey).map(([s, k]) => [k, s]));

  /** ㄋㄧˇ -> "su3".  The tone mark (if any) must be final. */
  function daqianKeys(reading) {
    const chars = Array.from(reading);
    let keys = "";
    chars.forEach((ch, i) => {
      if (has(dq.symbolToKey, ch)) keys += dq.symbolToKey[ch];
      else if (has(dq.toneToKey, ch)) {
        if (i !== chars.length - 1) fail(`tone mark not final in reading ${reading}`);
        keys += dq.toneToKey[ch];
      } else fail(`unknown bopomofo symbol ${ch} in reading ${reading}`);
    });
    if (!keys || has(dq.toneToKey, chars[0])) fail(`reading ${reading} has no phonetic symbols`);
    return keys;
  }

  /** "su3" -> ㄋㄧˇ: symbols, then at most one final tone key (shape only). */
  function daqianReading(chunk) {
    if (!chunk) fail("empty keystroke unit");
    let out = "";
    for (let i = 0; i < chunk.length; i++) {
      const k = chunk[i];
      if (dqKeyToSymbol.has(k)) {
        if (i > 0 && dqKeyToTone.has(chunk[i - 1])) fail(`symbol after tone mark in unit ${R(chunk)}`);
        out += dqKeyToSymbol.get(k);
      } else if (dqKeyToTone.has(k)) {
        if (i !== chunk.length - 1) fail(`tone key not final in unit ${R(chunk)}`);
        if (i === 0) fail(`unit ${R(chunk)} is a bare tone key`);
        out += dqKeyToTone.get(k);
      } else fail(`key ${R(k)} is not on layout zh_daqian`);
    }
    return out;
  }

  // ------------------------------------------------------------ zh_pinyin
  const py = L.zh_pinyin;
  const digitByMark = new Map(py.toneDigits);
  const markByDigit = new Map(py.toneDigits.map(([m, d]) => [d, m]));
  const baseBySpelling = new Map();
  for (const [base, spelling] of Object.entries(py.spellingByBase)) {
    if (baseBySpelling.has(spelling)) fail(`zh_pinyin.tsv is not injective: ${spelling}`);
    baseBySpelling.set(spelling, base);
  }
  const toneMarks = new Set(py.toneDigits.map(([m]) => m).filter(Boolean));

  /** ㄋㄧˇ -> "ni3" (also the numbered pinyin shown under a Bopomofo reading). */
  function pinyinKeys(reading) {
    const chars = Array.from(reading);
    const last = chars.length ? chars[chars.length - 1] : "";
    const mark = toneMarks.has(last) ? last : "";
    const base = mark ? chars.slice(0, -1).join("") : reading;
    if (!base) fail(`reading ${reading} has no phonetic symbols`);
    for (const ch of base) if (toneMarks.has(ch)) fail(`tone mark not final in reading ${reading}`);
    if (!has(py.spellingByBase, base)) fail(`${base} (reading ${reading}) has no pinyin spelling in zh_pinyin.tsv`);
    return py.spellingByBase[base] + digitByMark.get(mark);
  }

  /** "ni3" -> ㄋㄧˇ: an a-z spelling, then one tone digit 1-5. */
  function pinyinReading(chunk) {
    if (!chunk) fail("empty keystroke unit");
    const cps = Array.from(chunk);
    const digit = cps[cps.length - 1], spelling = cps.slice(0, -1).join("");
    if (!markByDigit.has(digit)) fail(`unit ${R(chunk)} does not end in a tone digit 1-5`);
    if (!spelling) fail(`unit ${R(chunk)} is a bare tone digit`);
    for (const ch of spelling)
      if (!(ch >= "a" && ch <= "z")) fail(`key ${R(ch)} in unit ${R(chunk)}: a spelling is a-z and one tone digit ends the unit`);
    if (!baseBySpelling.has(spelling)) fail(`${R(spelling)} is not a pinyin spelling on layout zh_pinyin`);
    return baseBySpelling.get(spelling) + markByDigit.get(digit);
  }

  // --------------------------------------------------------- ko_dubeolsik
  const ko = L.ko_dubeolsik;
  const koInitials = Array.from(ko.initials), koVowels = Array.from(ko.vowels), koFinals = ko.finals;
  const T = koFinals.length, V = koVowels.length;
  let koForward = null, koInverse = null;
  function koEnumeration() {
    if (koForward) return;
    const fwd = new Map(), inv = new Map();
    const keysOf = jamo => (has(ko.keysByJamo, jamo) && ko.keysByJamo[jamo]) || fail(`ko_dubeolsik.tsv does not map the jamo ${jamo}`);
    const add = (unit, keys) => {
      if (inv.has(keys)) fail(`ko_dubeolsik.tsv is not injective: '${keys}' types both ${inv.get(keys)} and ${unit}`);
      fwd.set(unit, keys);
      inv.set(keys, unit);
    };
    for (let cp = ko.jamoFirst; cp <= ko.jamoLast; cp++) add(String.fromCharCode(cp), keysOf(String.fromCharCode(cp)));
    for (let cp = ko.syllableFirst; cp <= ko.syllableLast; cp++) {
      const index = cp - ko.syllableFirst, t = index % T, lv = (index - t) / T, v = lv % V, l = (lv - v) / V;
      add(String.fromCharCode(cp), keysOf(koInitials[l]) + keysOf(koVowels[v]) + (t ? keysOf(koFinals[t]) : ""));
    }
    koForward = fwd;
    koInverse = inv;
  }
  const isKoUnit = u => typeof u === "string" && u.length === 1 && (
    (u.charCodeAt(0) >= ko.syllableFirst && u.charCodeAt(0) <= ko.syllableLast) ||
    (u.charCodeAt(0) >= ko.jamoFirst && u.charCodeAt(0) <= ko.jamoLast));

  /** 한 -> "gks", ㅋ -> "z". */
  function koKeys(unit) {
    if (!isKoUnit(unit)) fail(`${unit} is not a ko unit`);
    koEnumeration();
    return koForward.get(unit);
  }
  /** "gks" -> 한. */
  function koUnit(chunk) {
    if (!chunk) fail("empty keystroke unit");
    koEnumeration();
    if (!koInverse.has(chunk)) fail(`${R(chunk)} types no single syllable or jamo on layout ko_dubeolsik`);
    return koInverse.get(chunk);
  }
  /** 가 -> ["ㄱ", "ㅏ", ""] (Unicode §3.12). */
  function koDecompose(syllable) {
    const cp = syllable.codePointAt(0);
    if (syllable.length !== 1 || cp < ko.syllableFirst || cp > ko.syllableLast) fail(`${syllable} is not a precomposed Hangul syllable`);
    const index = cp - ko.syllableFirst, t = index % T, lv = (index - t) / T;
    return [koInitials[(lv - lv % V) / V], koVowels[lv % V], koFinals[t]];
  }

  // ------------------------------------------------------------ ru_jcuken
  const ruKeys = new Map(Object.entries(L.ru_jcuken.keysByLetter));
  const ruLetters = new Map();
  for (const [letter, key] of ruKeys) {
    if (ruLetters.has(key)) fail(`ru_jcuken.tsv is not injective: '${key}'`);
    ruLetters.set(key, letter);
  }
  function ruKeysForWord(word) {
    if (!word) fail("empty word");
    let out = "";
    for (const ch of word) {
      if (!ruKeys.has(ch)) fail(`${ch} is not a letter а-я or ё, so it is not typable on ru_jcuken`);
      out += ruKeys.get(ch);
    }
    return out;
  }
  function ruWord(chunk) {
    if (!chunk) fail("empty unit for ru_jcuken");
    let out = "";
    for (const ch of chunk) {
      if (!ruLetters.has(ch)) fail(`key ${R(ch)} types no letter on layout ru_jcuken`);
      out += ruLetters.get(ch);
    }
    return out;
  }

  // ------------------------------------------------------------ es_accent
  const esVariant = new Map(), esKeysByVariant = new Map();
  for (const [base, digit, variant] of L.es_accent.rows) {
    esVariant.set(base + digit, variant);
    esKeysByVariant.set(variant, base + digit);
  }
  const isPlain = ch => ch.length === 1 && ch >= "a" && ch <= "z";
  const isDigit = ch => ch.length === 1 && ch >= "0" && ch <= "9";
  function esKeysForWord(word) {
    let out = "";
    for (const ch of word) {
      if (isPlain(ch)) out += ch;
      else if (esKeysByVariant.has(ch)) out += esKeysByVariant.get(ch);
      else fail(`${ch} is not typable on es_accent`);
    }
    if (!out) fail("empty word");
    return out;
  }
  function esWord(chunk) {
    if (!chunk) fail("empty unit for es_accent");
    const out = [];
    let prevDigit = false;
    const cps = Array.from(chunk);
    for (let i = 0; i < cps.length; i++) {
      const ch = cps[i];
      if (isPlain(ch)) { out.push(ch); prevDigit = false; }
      else if (isDigit(ch)) {
        if (i === 0 || prevDigit) fail(`digit ${R(ch)} has no base letter in unit ${R(chunk)}`);
        if (!esVariant.has(cps[i - 1] + ch)) fail(`no variant ${R(ch)} for base ${R(cps[i - 1])} in unit ${R(chunk)}`);
        out[out.length - 1] = esVariant.get(cps[i - 1] + ch);
        prevDigit = true;
      } else fail(`key ${R(ch)} is not on layout es_accent`);
    }
    return out.join("");
  }
  /** a-z plus the variant letters, sorted by code point (keypath es.tokenize). */
  const esWordChars = [..."abcdefghijklmnopqrstuvwxyz", ...esKeysByVariant.keys()]
    .sort((a, b) => a.codePointAt(0) - b.codePointAt(0));

  // ---------------------------------------------------------- en_identity
  const EN_WORD = /^[a-z]+$/;
  function enKeysForWord(word) {
    if (!word || !EN_WORD.test(word)) fail(`${word} is not a lowercase a-z word`);
    return word;
  }
  function enWord(chunk) {
    if (!chunk || !EN_WORD.test(chunk)) fail(`unit ${R(chunk)} is not well-formed for en_identity`);
    return chunk;
  }

  // ------------------------------------------------------------ ja_romaji
  const kanaToRomajiMap = new Map(L.ja_romaji.pairs);
  const romajiToKanaMap = new Map(L.ja_romaji.pairs.map(([k, r]) => [r, k])); // last wins, as in Python
  const maxKana = Math.max(...L.ja_romaji.pairs.map(([k]) => k.length));
  const maxRomaji = Math.max(...[...romajiToKanaMap.keys()].map(r => r.length));
  const JA_VOWELS = new Set("aiueo");
  const kanaToken = (reading, i) => {
    for (let n = Math.min(maxKana, reading.length - i); n > 0; n--) {
      const chunk = reading.slice(i, i + n);
      if (kanaToRomajiMap.has(chunk)) return [n, kanaToRomajiMap.get(chunk)];
    }
    return null;
  };
  /** とうきょう -> "toukyou"; きって -> "kitte". */
  function kanaToRomaji(reading) {
    const out = [];
    let i = 0;
    while (i < reading.length) {
      if (reading[i] === "っ") {
        const rest = kanaToken(reading, i + 1);
        if (rest === null) fail(`っ with no following syllable in reading ${reading}`);
        const romaji = rest[1];
        if (JA_VOWELS.has(romaji[0]) || romaji[0] === "n") fail(`っ before ${romaji} is not representable in reading ${reading}`);
        out.push(romaji[0]);
        i += 1;
        continue;
      }
      const token = kanaToken(reading, i);
      if (token === null) fail(`unsupported kana ${reading[i]} in reading ${reading}`);
      out.push(token[1]);
      i += token[0];
    }
    if (!out.length) fail("empty reading");
    return out.join("");
  }
  /** "toukyou" -> とうきょう. */
  function romajiToKana(keys) {
    if (!keys || !EN_WORD.test(keys)) fail(`unit ${keys} is not a lowercase romaji run`);
    const out = [];
    let i = 0;
    while (i < keys.length) {
      const c = keys[i];
      if (!JA_VOWELS.has(c) && i + 1 < keys.length && keys[i + 1] === c && keys.slice(i, i + 2) !== "nn") {
        out.push("っ");
        i += 1;
        continue;
      }
      let matched = null;
      for (let n = Math.min(maxRomaji, keys.length - i); n > 0; n--) {
        const chunk = keys.slice(i, i + n);
        if (romajiToKanaMap.has(chunk)) { matched = [n, romajiToKanaMap.get(chunk)]; break; }
      }
      if (matched === null) fail(`unparseable romaji at ${keys.slice(i)} in unit ${keys}`);
      out.push(matched[1]);
      i += matched[0];
    }
    return out.join("");
  }

  // ---------------------------------------------- zh_cangjie, zh_quick
  // A unit is one character's code, typed as written: 1-5 letters a-y on
  // Cangjie, 1-2 on Quick (z is unused).  Whether a well-shaped unit is a
  // code of the table is the candidate lists' business.
  const radicals = L.zh_cangjie.radicals;
  function shapeCode(chunk, layout) {
    if (!chunk) fail("empty keystroke unit");
    for (const ch of chunk)
      if (!has(radicals, ch)) fail(`key ${R(ch)} in unit ${R(chunk)} is not a shape key on layout ${layout} (a-y; z is unused)`);
    const max = L[layout].maxLetters, n = Array.from(chunk).length;
    if (n > max) fail(`unit ${R(chunk)} has ${n} letters; a code on layout ${layout} has 1-${max}`);
    return chunk;
  }
  /** A Cangjie code's Quick code: the code itself up to 2 letters, else its first and last. */
  const quickOf = code => (code.length <= 2 ? code : code[0] + code[code.length - 1]);
  /** "ab" -> 日月 (display only). */
  const radicalsOf = code => Array.from(code, ch => (has(radicals, ch) ? radicals[ch] : "?")).join("");

  return {
    data: L,
    daqianKeys, daqianReading, pinyinKeys, pinyinReading,
    shapeCode, quickOf, radicalsOf, radicals,
    koKeys, koUnit, koDecompose, isKoUnit,
    koUnits: () => { koEnumeration(); return koForward; },
    ruKeysForWord, ruWord, esKeysForWord, esWord, esWordChars,
    enKeysForWord, enWord, kanaToRomaji, romajiToKana,
    /** ㄏㄨㄢ -> "huan1", or null when the reading has no spelling. */
    numberedPinyin(reading) {
      try { return pinyinKeys(reading); } catch (e) { if (e instanceof LayoutError) return null; throw e; }
    },
  };
}
