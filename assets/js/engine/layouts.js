// Ports of keypath/layouts/*.py (KeyPath 2.5.0), both directions, built
// from data/layouts.json.  The keys -> text readers are adapted from
// cipher-project scripts/build_demo.py (v2.0), MIT.  The Vietnamese
// layouts (Telex, VNI) are written from KeyPath's specification (docs/10
// §6): the syllable grammar, the canonical keystrokes and the decode pass;
// ETen, Jyutping and JIS kana from its §4.3-§5; Greek from its §7.1.
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
  // ---------------------------------------------------- zh_daqian, zh_eten
  // Two Bopomofo keyboards over the same 37 symbols and 4 tone marks: a
  // unit is symbols, then at most one final tone key (tone 1 types nothing).
  function bopomofo(table, layout) {
    const keyToSymbol = new Map(Object.entries(table.symbolToKey).map(([s, k]) => [k, s]));
    const keyToTone = new Map(Object.entries(table.toneToKey).map(([s, k]) => [k, s]));
    /** ㄋㄧˇ -> "su3" (Dàqiān), "ne3" (ETen).  The tone mark (if any) must be final. */
    function keys(reading) {
      const chars = Array.from(reading);
      let out = "";
      chars.forEach((ch, i) => {
        if (has(table.symbolToKey, ch)) out += table.symbolToKey[ch];
        else if (has(table.toneToKey, ch)) {
          if (i !== chars.length - 1) fail(`tone mark not final in reading ${R(reading)}`);
          out += table.toneToKey[ch];
        } else fail(`unknown bopomofo symbol ${R(ch)} in reading ${R(reading)}`);
      });
      if (!out || has(table.toneToKey, chars[0])) fail(`reading ${R(reading)} has no phonetic symbols`);
      return out;
    }
    /** "su3" -> ㄋㄧˇ: symbols, then at most one final tone key (shape only). */
    function reading(chunk) {
      if (!chunk) fail("empty keystroke unit");
      let out = "";
      for (let i = 0; i < chunk.length; i++) {
        const k = chunk[i];
        if (keyToSymbol.has(k)) {
          if (i > 0 && keyToTone.has(chunk[i - 1])) fail(`symbol after tone mark in unit ${R(chunk)}`);
          out += keyToSymbol.get(k);
        } else if (keyToTone.has(k)) {
          if (i !== chunk.length - 1) fail(`tone key not final in unit ${R(chunk)}`);
          if (i === 0) fail(`unit ${R(chunk)} is a bare tone key`);
          out += keyToTone.get(k);
        } else fail(`key ${R(k)} is not on layout ${layout}`);
      }
      return out;
    }
    return { keys, reading, keyToSymbol, keyToTone };
  }
  const dqBopomofo = bopomofo(L.zh_daqian, "zh_daqian");
  const etBopomofo = bopomofo(L.zh_eten, "zh_eten");
  const daqianKeys = dqBopomofo.keys, daqianReading = dqBopomofo.reading;
  const etenKeys = etBopomofo.keys, etenReading = etBopomofo.reading;
  // docs/10 §9.7: an ETen row is a Dàqiān row with each key remapped to the
  // ETen key of the same symbol or tone mark
  const etenOfDaqian = new Map();
  for (const [k, sym] of dqBopomofo.keyToSymbol) etenOfDaqian.set(k, L.zh_eten.symbolToKey[sym]);
  for (const [k, mark] of dqBopomofo.keyToTone) etenOfDaqian.set(k, L.zh_eten.toneToKey[mark]);
  if ([...etenOfDaqian.values()].some(k => typeof k !== "string") || new Set(etenOfDaqian.values()).size !== etenOfDaqian.size)
    fail("zh_eten.tsv does not type zh_daqian.tsv's symbols one to one");
  /** Dàqiān keys -> the ETen keys of the same symbols ("su3" -> "ne3"). */
  function etenFromDaqian(keys) {
    let out = "";
    for (const k of keys) {
      if (!etenOfDaqian.has(k)) fail(`key ${R(k)} is not on layout zh_daqian`);
      out += etenOfDaqian.get(k);
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

  // ---------------------------------------------------------- ja_kana
  // docs/10 §5: JIS kana at US key positions.  A one-key row is a key's own
  // kana (the shift layer included); a voiced kana is its base key + `[`, a
  // semi-voiced one its base key + `]`.  The layout types exactly the
  // readings ja_romaji types: forward(reading) is defined iff kanaToRomaji
  // is; backward parses left to right, a two-key entry before a one-key one.
  const SPACING_MARK = { "\u3099": "\u309b", "\u309a": "\u309c" };   // ゛ ゜
  const kanaKeys = new Map(), kanaByOneKey = new Map(), kanaByTwoKeys = new Map(), kanaMarkByKey = new Map();
  for (const [kana, keys] of L.ja_kana.keysByKana) {
    const n = Array.from(keys).length;
    if (n !== 1 && n !== 2) fail(`ja_kana.tsv: ${kana} has ${n} keys, not 1 or 2`);
    const target = n === 1 ? kanaByOneKey : kanaByTwoKeys;
    if (target.has(keys)) fail(`ja_kana.tsv: the keys ${R(keys)} are on more than one row`);
    target.set(keys, kana);
    kanaKeys.set(kana, keys);
  }
  for (const [keys, kana] of kanaByTwoKeys) {
    const decomposed = kana.normalize("NFD");
    const mark = SPACING_MARK[decomposed.slice(1)];
    if (!mark || kanaKeys.get(decomposed[0]) !== keys[0] || (kanaMarkByKey.has(keys[1]) && kanaMarkByKey.get(keys[1]) !== mark))
      fail(`ja_kana.tsv: ${kana} = ${R(keys)} is not its base kana's key plus one voicing key`);
    kanaMarkByKey.set(keys[1], mark);
  }
  if ([...kanaMarkByKey.keys()].some(k => kanaByOneKey.has(k))) fail("ja_kana.tsv: a voicing key is also a kana key");

  /** Why ja_romaji's rule cannot type `reading`, in kana: the first kana at which it fails. */
  function kanaUntypeable(reading) {
    const cps = Array.from(reading);
    const token = i => {
      for (const n of [2, 1]) {
        const piece = cps.slice(i, i + n);
        if (piece.length === n && kanaToRomajiMap.has(piece.join(""))) return piece;
      }
      return null;
    };
    let i = 0;
    while (i < cps.length) {
      if (cps[i] === "っ") {
        const following = token(i + 1);
        if (following === null)
          return i + 1 === cps.length ? "っ must come before the kana it doubles" : `っ cannot come before ${cps[i + 1]}`;
        if ("aiueon".includes(kanaToRomajiMap.get(following.join(""))[0]))
          return `っ cannot come before ${following.join("")} (no consonant to double)`;
        i += 1;
        continue;
      }
      const found = token(i);
      if (found === null) return `${cps[i]} cannot stand here (a small ゃ ゅ ょ follows a kana it combines with)`;
      i += found.length;
    }
    return "the reading cannot be typed";
  }
  const romajiTypeable = reading => {
    try { kanaToRomaji(reading); return true; } catch (e) { if (e instanceof LayoutError) return false; throw e; }
  };
  /** とうきょう -> "s4g(4"; defined iff kanaToRomaji(reading) is. */
  function kanaToKeys(reading) {
    if (!romajiTypeable(reading)) fail(`reading ${R(reading)} cannot be typed: ${kanaUntypeable(reading)}`);
    const chars = Array.from(reading);
    const missing = chars.find(ch => !kanaKeys.has(ch));
    if (missing !== undefined) fail(`kana ${R(missing)} in reading ${R(reading)} has no key on layout ja_kana`);
    return chars.map(ch => kanaKeys.get(ch)).join("");
  }
  /** "s4g(4" -> とうきょう: left to right, a two-key entry before a one-key entry. */
  function keysToKana(keys) {
    if (!keys) fail("empty keystroke unit");
    const cps = Array.from(keys);
    let out = "";
    for (let i = 0; i < cps.length;) {
      const pair = cps.length - i >= 2 ? cps[i] + cps[i + 1] : null;
      if (pair !== null && kanaByTwoKeys.has(pair)) { out += kanaByTwoKeys.get(pair); i += 2; continue; }
      const key = cps[i];
      if (kanaByOneKey.has(key)) { out += kanaByOneKey.get(key); i += 1; continue; }
      if (kanaMarkByKey.has(key)) {
        const before = i ? `after ${R(cps[i - 1])} ` : "at the start ";
        fail(`key ${R(key)} (${kanaMarkByKey.get(key)}) at position ${i} of unit ${R(keys)} voices no kana ${before}on layout ja_kana`);
      }
      fail(`key ${R(key)} is not on layout ja_kana`);
    }
    if (!romajiTypeable(out)) fail(`unit ${R(keys)} reads ${R(out)}, which cannot be typed: ${kanaUntypeable(out)}`);
    return out;
  }

  // ------------------------------------------------------ zh_jyutping
  // docs/10 §4.4: a unit is one character's Jyutping reading as written,
  // 1-6 letters a-z and one tone digit 1-6; whether a well-shaped unit is a
  // reading of the table is the candidate lists' business.
  const JY = L.zh_jyutping;
  function jyutpingReading(chunk) {
    if (!chunk) fail("empty keystroke unit");
    const cps = Array.from(chunk);
    const digit = cps[cps.length - 1], letters = cps.slice(0, -1);
    if (!JY.toneDigits.includes(digit)) fail(`unit ${R(chunk)} does not end in a tone digit 1-6`);
    if (!letters.length) fail(`unit ${R(chunk)} is a bare tone digit`);
    for (const ch of letters)
      if (!(ch >= "a" && ch <= "z" && ch.length === 1))
        fail(`key ${R(ch)} in unit ${R(chunk)}: a Jyutping syllable is letters a-z, and one tone digit 1-6 ends the unit`);
    if (letters.length > JY.maxLetters) fail(`unit ${R(chunk)} has ${letters.length} letters; a Jyutping syllable has 1-${JY.maxLetters}`);
    return chunk;
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

  // ------------------------------------------------- vi_telex, vi_vni
  // Written from docs/10 §6 over the tables in data/layouts.json: the
  // syllable grammar G (§6.2, the inventories of vi_syllables.tsv), the
  // canonical keystrokes E (§6.3) and the one left-to-right decode D (§6.4)
  // of each key table (§6.1).  A unit is one syllable: a chunk c is a unit
  // iff D(c) is defined, D(c) is in G and E(D(c)) = c (§6.5), and the
  // rejections are §8.2's fixed texts.
  const VI_LAYOUTS = ["vi_telex", "vi_vni"];
  const VI_NAMES = { vi_telex: "Telex", vi_vni: "VNI" };
  // §8.2 (a): the note that ends D's "undefined" message (on Telex every
  // key of the alphabet is a letter, so it cannot show there)
  const VI_UNDEFINED = { vi_telex: "Telex types only the letters a-z", vi_vni: "VNI: a digit must follow the letter it marks" };
  const VOWEL_BASES = new Set("aeiouy");        // §6.4 rule 2: a tone lands only on these
  const isLower = k => k.length === 1 && k >= "a" && k <= "z";
  const nfc = s => s.normalize("NFC");
  const vi = L.vi_syllables;
  const viMarks = new Map(vi.tones);             // tone name -> combining mark
  const viSchemes = new Map();
  /** One key table: {pairs: base+modifier -> letter, tones: key -> mark, letterKeys: letter -> E keys}. */
  function viScheme(layout) {
    if (!VI_LAYOUTS.includes(layout)) fail(`${layout} is not a Vietnamese layout`);
    let s = viSchemes.get(layout);
    if (s) return s;
    const pairs = new Map(), tones = new Map(), letterKeys = new Map();
    for (const ch of "abcdefghijklmnopqrstuvwxyz") letterKeys.set(ch, ch);
    // §6.1: a modified letter's first key is its base letter, its second the modifier key
    for (const [letter, keys] of L[layout].letters) {
      if (keys.length !== 2 || !isLower(keys[0]) || pairs.has(keys)) fail(`${layout}: ${letter} is not a base letter and one modifier key`);
      pairs.set(keys, letter);
      letterKeys.set(letter, keys);
    }
    for (const [name, key] of L[layout].tones) {
      if (key.length !== 1 || tones.has(key) || !viMarks.has(name)) fail(`${layout}: the tone ${name} is not one key of its own`);
      tones.set(key, viMarks.get(name));
    }
    // §6.3, letter by letter: a vowel carrying a tone is its keys, then the tone key
    for (const [letter, keys] of [...letterKeys]) {
      if (!VOWEL_BASES.has(keys[0])) continue;
      for (const [key, mark] of tones) letterKeys.set(nfc(letter + mark), keys + key);
    }
    s = { layout, pairs, tones, letterKeys };
    viSchemes.set(layout, s);
    return s;
  }

  let viG = null;
  /** G (§6.2): every NFC(o + n' + c); n' is n, or n with one letter carrying one tone; a stop coda takes sắc or nặng. */
  function viGrammar() {
    if (viG) return viG;
    const checked = new Set(vi.checkedTones.map(name => viMarks.get(name)));
    const stops = new Set(vi.stopCodas);
    const G = new Set();
    for (const nucleus of vi.nuclei) {
      const letters = Array.from(nucleus);
      const withChecked = [], withOther = [nucleus];
      letters.forEach((letter, i) => {
        for (const mark of viMarks.values()) {
          const toned = nfc(letters.slice(0, i).join("") + letter + mark + letters.slice(i + 1).join(""));
          (checked.has(mark) ? withChecked : withOther).push(toned);
        }
      });
      for (const coda of vi.codas) {
        const variants = stops.has(coda) ? withChecked : withChecked.concat(withOther);
        for (const onset of vi.onsets) for (const v of variants) G.add(nfc(onset + v + coda));
      }
    }
    viG = G;
    return G;
  }

  /** E (§6.3) letter by letter over any string of Vietnamese letters (LayoutError otherwise). */
  function viLettersKeys(layout, text) {
    const { letterKeys } = viScheme(layout);
    let out = "";
    for (const ch of text) {
      if (!letterKeys.has(ch)) fail(`${R(ch)} in ${R(text)} is not a Vietnamese letter`);
      out += letterKeys.get(ch);
    }
    return out;
  }
  /** E(t) for a syllable t of G: việt -> "vieejt" (Telex), "vie65t" (VNI). */
  function viKeys(layout, syllable) {
    if (!viGrammar().has(syllable)) fail(`${R(syllable)} is not a syllable of G (vi_syllables.tsv), so it is not typable on ${layout}`);
    return viLettersKeys(layout, syllable);
  }

  /**
   * D's pass (§6.4) over a chunk, keeping each key's part: -> [{base, mod, tone, keys: [[key, role]]}]
   * with role "letter", "modifier" or "tone"; LayoutError (§8.2 a) where D is undefined.
   */
  function viCells(layout, chunk) {
    const s = viScheme(layout);
    const cells = [];
    const keys = Array.from(chunk);
    keys.forEach((k, i) => {
      const last = cells.length ? cells[cells.length - 1] : null;
      if (last && !last.mod && !last.tone && s.pairs.has(last.base + k)) {          // rule 1
        last.mod = s.pairs.get(last.base + k);
        last.keys.push([k, "modifier"]);
      } else if (last && VOWEL_BASES.has(last.base) && s.tones.has(k) && !cells.some(c => c.tone)) {   // rule 2
        last.tone = s.tones.get(k);
        last.keys.push([k, "tone"]);
      } else if (isLower(k)) {                                                         // rule 3
        cells.push({ base: k, mod: "", tone: "", keys: [[k, "letter"]] });
      } else {                                                                         // rule 4
        fail(`key ${R(k)} at position ${i} cannot follow ${R(keys.slice(0, i).join(""))} (${VI_UNDEFINED[layout]})`);
      }
    });
    return cells;
  }
  const cellText = c => nfc((c.mod || c.base) + c.tone);
  /** D(chunk): the NFC concatenation of the cells. */
  const viDecode = (layout, chunk) => nfc(viCells(layout, chunk).map(cellText).join(""));

  /** The syllable a unit reads as (§6.5), or LayoutError with §8.2's text for the first condition that fails. */
  function viSyllable(layout, chunk) {
    if (!chunk) fail(`empty unit for ${layout}`);
    const text = viDecode(layout, chunk);                                             // (a)
    if (!viGrammar().has(text))                                                       // (b)
      fail(`D(${chunk}) = ${text} is not a syllable of G; canonical ${VI_NAMES[layout]} types a vowel's tone key `
        + `right after that vowel and its modifier key (e.g. việt = ${viKeys(layout, "việt")})`);
    const canonical = viKeys(layout, text);
    if (canonical !== chunk) fail(`D(${chunk}) = ${text}, whose canonical keys are ${canonical}`);   // (c)
    return text;
  }

  /**
   * A unit's letters over its keys, for the walk: [{letter, keys: [{key, role, shows}]}], where
   * `shows` is the letter as it stands after a modifier or tone key ("" for a letter key).
   */
  function viLetters(layout, chunk) {
    return viCells(layout, chunk).map(c => {
      const partial = { base: c.base, mod: "", tone: "" };
      return {
        letter: cellText(c),
        keys: c.keys.map(([key, role]) => {
          if (role === "modifier") partial.mod = c.mod;
          if (role === "tone") partial.tone = c.tone;
          return { key, role, shows: role === "letter" ? "" : cellText(partial) };
        }),
      };
    });
  }

  /** The keyboard legend of a Vietnamese layout: {modifiers: [[keys, letter]], tones: [[key, name, mark]]}, in table order. */
  function viLegend(layout) {
    return {
      modifiers: L[layout].letters.map(([letter, keys]) => [keys, letter]),
      tones: L[layout].tones.map(([name, key]) => [key, name, viMarks.get(name)]),
    };
  }

  // ------------------------------------------------------------ el_greek
  // Written from docs/10 §7.1 over el_greek.tsv (data/layouts.json, in the
  // table's order): each of the 25 unaccented letters is one key; each of the
  // 11 accented letters is a dead key and then its vowel's key (`;` the
  // tonos, `:` the dialytika, `W` the dialytika-tonos), so the accent is
  // typed before the letter.  A word is one unit, typed letter by letter.
  // Decode reads left to right: a dead key must be followed by a vowel key
  // it combines with, else the unit is malformed; any other key is its
  // letter.  The dead keys, their accents and their vowels are read from the
  // table's two-key rows (a letter's NFD marks give the accent), never listed
  // here.
  const EL_ACCENT = { "\u0301": "\u0384", "\u0308": "\u00a8", "\u0308\u0301": "\u0385" };   // ΄ ¨ ΅
  const elKeysByLetter = new Map(), elByKey = new Map(), elByPair = new Map(), elAccentByDeadKey = new Map();
  for (const [letter, keys] of L.el_greek.letters) {
    const n = Array.from(keys).length;
    if (n !== 1 && n !== 2) fail(`el_greek.tsv must give each letter one key, or a dead key and a vowel key; it gives ${letter} ${R(keys)}`);
    const target = n === 1 ? elByKey : elByPair;
    if (target.has(keys)) fail(`el_greek.tsv is not injective: ${R(keys)} types both ${R(target.get(keys))} and ${R(letter)}`);
    target.set(keys, letter);
    elKeysByLetter.set(letter, keys);
  }
  for (const [keys, letter] of elByPair) {
    const decomposed = Array.from(letter.normalize("NFD"));
    const base = decomposed[0], accent = EL_ACCENT[decomposed.slice(1).join("")];
    const [dead, vowel] = Array.from(keys);
    if (!accent || elByKey.has(dead) || elKeysByLetter.get(base) !== vowel
        || (elAccentByDeadKey.has(dead) && elAccentByDeadKey.get(dead) !== accent))
      fail(`el_greek.tsv: ${letter} = ${R(keys)} is not a dead key followed by the key of ${base}`);
    elAccentByDeadKey.set(dead, accent);
  }
  /** Each dead key -> the vowel keys it combines with, in table order. */
  const elVowelsByDeadKey = new Map([...elAccentByDeadKey.keys()].map(dead => [dead, []]));
  for (const pair of elByPair.keys()) {
    const [dead, vowel] = Array.from(pair);
    if (!elVowelsByDeadKey.get(dead).includes(vowel)) elVowelsByDeadKey.get(dead).push(vowel);
  }

  /** E: καλημέρα -> "kalhm;era".  Every character must be one of the 36 letters. */
  function elKeysForWord(word) {
    if (!word) fail("empty word");
    let out = "";
    for (const ch of word) {
      if (!elKeysByLetter.has(ch)) fail(`${R(ch)} is not one of the 36 Greek letters, so it is not typable on el_greek`);
      out += elKeysByLetter.get(ch);
    }
    return out;
  }
  /** D: "kalhm;era" -> καλημέρα, left to right (the dead-key rule). */
  function elWord(chunk) {
    if (!chunk) fail("empty unit for el_greek");
    const keys = Array.from(chunk);
    let out = "";
    for (let i = 0; i < keys.length;) {
      const key = keys[i];
      if (elAccentByDeadKey.has(key)) {
        const letter = i + 1 < keys.length ? elByPair.get(key + keys[i + 1]) : undefined;
        if (letter === undefined) {
          const after = i + 1 < keys.length ? `is followed by ${R(keys[i + 1])}` : "ends the unit";
          fail(`dead key ${R(key)} (${elAccentByDeadKey.get(key)}) at position ${i} of unit ${R(chunk)} ${after}; `
            + `on el_greek it must be followed by a vowel key it combines with (${elVowelsByDeadKey.get(key).join(" ")})`);
        }
        out += letter;
        i += 2;
        continue;
      }
      if (!elByKey.has(key)) fail(`key ${R(key)} types no letter on layout el_greek`);
      out += elByKey.get(key);
      i += 1;
    }
    return out;
  }
  /**
   * A unit's letters over its keys, for the walk: [{letter, keys: [{key, dead}]}],
   * `dead` the accent a dead key adds (null for a letter's own key).
   */
  function elLetters(chunk) {
    const keys = Array.from(chunk);
    const out = [];
    for (let i = 0; i < keys.length;) {
      if (elAccentByDeadKey.has(keys[i])) {
        out.push({ letter: elByPair.get(keys[i] + keys[i + 1]),
          keys: [{ key: keys[i], dead: elAccentByDeadKey.get(keys[i]) }, { key: keys[i + 1], dead: null }] });
        i += 2;
      } else {
        out.push({ letter: elByKey.get(keys[i]), keys: [{ key: keys[i], dead: null }] });
        i += 1;
      }
    }
    return out;
  }

  return {
    data: L,
    elKeysForWord, elWord, elLetters,
    /** The Greek legends: {oneKey: Map(key -> letter), dead: [[deadKey, accent, [[vowelKey, letter]]]]}, in table order. */
    elLegend: () => ({
      oneKey: new Map(elByKey),
      dead: [...elAccentByDeadKey].map(([dead, accent]) =>
        [dead, accent, elVowelsByDeadKey.get(dead).map(vowel => [vowel, elByPair.get(dead + vowel)])]),
    }),
    /** The 36 letters el_greek.tsv types, in its order. */
    elLetterSet: () => [...elKeysByLetter.keys()],
    daqianKeys, daqianReading, pinyinKeys, pinyinReading, etenKeys, etenReading, etenFromDaqian,
    jyutpingReading, jyutpingKeys: jyutpingReading,
    kanaToKeys, keysToKana,
    /** The JIS kana legends: {oneKey: Map(key -> kana), marks: Map(voicing key -> ゛ or ゜)}. */
    kanaLegend: () => ({ oneKey: new Map(kanaByOneKey), marks: new Map(kanaMarkByKey) }),
    shapeCode, quickOf, radicalsOf, radicals,
    viGrammar, viKeys, viLettersKeys, viDecode, viSyllable, viLetters, viLegend,
    /** The Vietnamese letters (a-z, then the 67 others, §3.2) that layout's E types. */
    viLetterSet: layout => [...viScheme(layout).letterKeys.keys()],
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
