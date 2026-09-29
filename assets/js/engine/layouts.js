// Ports of keypath/layouts/*.py (KeyPath 2.3.0), both directions, built
// from data/layouts.json.  The keys -> text readers are adapted from
// cipher-project scripts/build_demo.py (v2.0), MIT.  The Vietnamese
// layouts (Telex, VNI) are written from KeyPath's specification (docs/10
// §6): the syllable grammar, the canonical keystrokes and the decode pass.
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

  return {
    data: L,
    daqianKeys, daqianReading, pinyinKeys, pinyinReading,
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
