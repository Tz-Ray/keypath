// Hop-free encoders, ported from keypath 2.4.0:
//   zh on Dàqiān / ETen / Pinyin - zh.greedy_segment + make_surface.encode_native + word_units
//   zh on Cangjie / Quick / Jyutping - the same segmentation + zh_coded.make_surface's encode_word
//   zh on Dubeolsik (hanja) - zh_ko_hanja.encode_native / encode_word
//   ko, ru, es, en          - tokenized_native_encoder over each surface's encode_word
//   vi on Telex / VNI       - docs/10 §3.2 and §6.5: a word (a maximal run of
//                             the 93 Vietnamese letters) is one unit, typed by
//                             E, iff it is a syllable of G; else a literal
//
// The reading choices Python makes from tsi.csv (phrase readings, the
// sandhi fallback, one-character phrase readings) and from hanja.txt (word
// readings, the initial-sound law) are baked by tools/build_data.py into the
// phrase shards data/zh/p/XX.txt as per-character reading digits and final
// hangul readings, so this module applies them without re-deriving them.
//
// Cangjie and Quick give each character one code: data/quick.json holds the
// Quick lists and data/cangjie/{a..y}.json the Cangjie lists by first
// letter (a character's Quick code starts with the same letter, which is
// how a character's Cangjie shard is found).  Both keep the table's order.
// Jyutping gives each character one reading, typed as written:
// data/jyutping.json holds its lists, in the table's order.  ETen types
// Dàqiān's readings on other keys, so its words and indices are Dàqiān's.
import { assembleWords, regexTokens, tokensToItems } from "./assemble.js";
import { LayoutError } from "./layouts.js";

const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";
export const ZH_CORE = "data/zh/core.json";
export const HANJA_CORE = "data/hanja/core.json";
export const shardPath = cp => `data/zh/p/${(cp & 0xff).toString(16).padStart(2, "0")}.txt`;
export const QUICK = "data/quick.json";
export const SHAPE_LETTERS = "abcdefghijklmnopqrstuvwxy";
export const cangjiePath = letter => `data/cangjie/${letter}.json`;
export const SHAPE_EDGE = { zh_cangjie: "shape:zh_cangjie", zh_quick: "shape:zh_quick" };
export const JYUTPING = "data/jyutping.json";
export const JYUTPING_EDGE = "homophone:zh_jyutping";

export function createNative({ data, layouts, lists }) {
  // ------------------------------------------------------------- zh core
  let zh = null;       // {lists: Map(reading -> [chars]), readings: Map(char -> [readings]), maxWordLen}
  let zhLoading = null;
  function loadZhCore() {
    if (!zhLoading) {
      zhLoading = data.json(ZH_CORE).then(core => {
        const byReading = new Map(), byChar = new Map();
        for (const [reading, chars] of Object.entries(core.lists)) {
          const arr = Array.from(chars);
          byReading.set(reading, arr);
          lists.setFull("homophone:zh", reading, arr);
        }
        for (const [ch, rs] of Object.entries(core.readings)) byChar.set(ch, rs.split(" "));
        for (const [reading, arr] of byReading) for (const ch of arr) if (!byChar.has(ch)) byChar.set(ch, [reading]);
        lists.markComplete("homophone:zh");
        zh = { lists: byReading, readings: byChar, maxWordLen: core.maxWordLen };
        return zh;
      });
      zhLoading.catch(() => { zhLoading = null; });
    }
    return zhLoading;
  }

  // ---------------------------------------------------------- hanja core
  let hanja = null;    // {lists: Map(syllable -> [hanja]), primary: Map(char -> syllable)}
  let hanjaLoading = null;
  function loadHanjaCore() {
    if (!hanjaLoading) {
      hanjaLoading = data.json(HANJA_CORE).then(core => {
        const byS = new Map(), primary = new Map();
        for (const [syllable, chars] of core.lists) {
          const arr = Array.from(chars);
          byS.set(syllable, arr);
          lists.setFull("homophone:ko_hanja", syllable, arr);
          for (const ch of arr) if (!primary.has(ch)) primary.set(ch, syllable);
        }
        for (const [ch, syllable] of Object.entries(core.primary)) primary.set(ch, syllable);
        lists.markComplete("homophone:ko_hanja");
        hanja = { lists: byS, primary };
        return hanja;
      });
      hanjaLoading.catch(() => { hanjaLoading = null; });
    }
    return hanjaLoading;
  }

  // ------------------------------------------------ Cangjie and Quick lists
  let quick = null;    // {lists: Map(code -> [chars]), codeOf: Map(char -> code)}
  let quickLoading = null;
  function loadQuick() {
    if (!quickLoading) {
      quickLoading = data.json(QUICK).then(obj => {
        const byCode = new Map(), codeOf = new Map();
        for (const [code, chars] of Object.entries(obj)) {
          const arr = Array.from(chars);
          byCode.set(code, arr);
          lists.setFull(SHAPE_EDGE.zh_quick, code, arr);
          for (const ch of arr) codeOf.set(ch, code);
        }
        lists.markComplete(SHAPE_EDGE.zh_quick);
        quick = { lists: byCode, codeOf };
        return quick;
      });
      quickLoading.catch(() => { quickLoading = null; });
    }
    return quickLoading;
  }

  const cangjie = { lists: new Map(), codeOf: new Map(), letters: new Set() };
  const cangjieLoads = new Map();
  // a code is known for sure once the shard of its first letter is loaded
  lists.markCompleteWhen(SHAPE_EDGE.zh_cangjie, code => cangjie.letters.has(code[0]));
  function loadCangjieShard(letter) {
    let p = cangjieLoads.get(letter);
    if (!p) {
      p = data.json(cangjiePath(letter)).then(obj => {
        for (const [code, chars] of Object.entries(obj)) {
          const arr = Array.from(chars);
          cangjie.lists.set(code, arr);
          lists.setFull(SHAPE_EDGE.zh_cangjie, code, arr);
          for (const ch of arr) cangjie.codeOf.set(ch, code);
        }
        cangjie.letters.add(letter);
      });
      cangjieLoads.set(letter, p);
      p.catch(() => cangjieLoads.delete(letter));
    }
    return p;
  }
  const loadCangjieShards = letters => Promise.all([...new Set(letters)].filter(l => SHAPE_LETTERS.includes(l)).map(loadCangjieShard));
  const loadAllShapes = () => Promise.all([loadQuick(), loadCangjieShards([...SHAPE_LETTERS])]);
  /** The Cangjie shards the characters of `cps` need (found through their Quick codes). */
  async function loadCangjieFor(cps) {
    const q = await loadQuick();
    await loadCangjieShards(cps.map(ch => q.codeOf.get(ch)).filter(Boolean).map(code => code[0]));
  }

  // ----------------------------------------------------- Jyutping lists
  let jyutping = null;    // {lists: Map(reading -> [chars]), codeOf: Map(char -> reading)}
  let jyutpingLoading = null;
  function loadJyutping() {
    if (!jyutpingLoading) {
      jyutpingLoading = data.json(JYUTPING).then(obj => {
        const byReading = new Map(), codeOf = new Map();
        for (const [reading, chars] of Object.entries(obj)) {
          const arr = Array.from(chars);
          byReading.set(reading, arr);
          lists.setFull(JYUTPING_EDGE, reading, arr);
          for (const ch of arr) codeOf.set(ch, reading);
        }
        lists.markComplete(JYUTPING_EDGE);
        jyutping = { lists: byReading, codeOf };
        return jyutping;
      });
      jyutpingLoading.catch(() => { jyutpingLoading = null; });
    }
    return jyutpingLoading;
  }

  /** zh_coded encode_word: [units, keys], or null when some character has no code (or reading). */
  function shapeWordUnits(word, sid) {
    const table = sid === "zh_quick" ? quick : sid === "zh_jyutping" ? jyutping : cangjie;
    const units = [];
    let keys = "";
    for (const ch of Array.from(word)) {
      const code = table.codeOf.get(ch);
      if (code === undefined) return null;
      units.push({ len: code.length, homophone_index: table.lists.get(code).indexOf(ch) });
      keys += code;
    }
    return units.length ? [units, keys] : null;
  }

  // ------------------------------------------------------- phrase shards
  const phrases = new Map();   // word -> {digits, hangul}
  const shardLoads = new Map();
  function loadShard(path) {
    let p = shardLoads.get(path);
    if (!p) {
      p = data.text(path).then(text => {
        for (const line of text.split("\n")) {
          if (!line) continue;
          const [word, digits = "", hangul = ""] = line.split("|");
          phrases.set(word, { digits, hangul });
        }
      });
      shardLoads.set(path, p);
      p.catch(() => shardLoads.delete(path));
    }
    return p;
  }
  const loadShardsFor = cps => Promise.all([...new Set(cps.map(c => shardPath(c.codePointAt(0))))].map(loadShard));
  const loadAllShards = () => Promise.all(Array.from({ length: 256 }, (_, i) => loadShard(shardPath(i))));

  /** zh.greedy_segment over code points (shards for every char must be loaded). */
  function segment(cps) {
    const out = [];
    let i = 0;
    while (i < cps.length) {
      let matched = cps[i];
      for (let n = Math.min(zh.maxWordLen, cps.length - i); n > 1; n--) {
        const w = cps.slice(i, i + n).join("");
        if (phrases.has(w)) { matched = w; break; }
      }
      out.push(matched);
      i += Array.from(matched).length;
    }
    return out;
  }

  const inZh = ch => zh.readings.has(ch);

  /** The readings word_units uses for each char of `chars` (the shard digits; else primaries). */
  function zhReadings(word, chars) {
    const info = phrases.get(word);
    const digits = info && info.digits ? info.digits : "";
    return chars.map((ch, j) => zh.readings.get(ch)[digits ? B36.indexOf(digits[j]) : 0]);
  }

  /** word_units: [units, keys] for a word of zh chars, typed with keysFor(reading). */
  function zhWordUnits(word, keysFor) {
    const chars = Array.from(word);
    const readings = zhReadings(word, chars);
    const units = [];
    let keys = "";
    chars.forEach((ch, j) => {
      const reading = readings[j];
      const index = zh.lists.get(reading).indexOf(ch);
      if (index < 0) throw new Error(`${ch} is not listed under ${reading}`);
      const k = keysFor(reading);
      units.push({ len: k.length, homophone_index: index });
      keys += k;
    });
    return [units, keys];
  }

  /** zh_ko_hanja.encode_word: [units, keys] or null (a tier-3 literal). */
  function hanjaWordUnits(word) {
    const chars = Array.from(word);
    if (!chars.length || chars.some(ch => !inZh(ch) || !hanja.primary.has(ch))) return null;
    const info = chars.length > 1 ? phrases.get(word) : null;
    const syllables = info && info.hangul ? Array.from(info.hangul) : chars.map(ch => hanja.primary.get(ch));
    if (syllables.length !== chars.length) throw new Error(`no one-syllable-per-character reading for ${word}`);
    const units = [];
    let keys = "";
    chars.forEach((ch, j) => {
      const list = hanja.lists.get(syllables[j]);
      const index = list ? list.indexOf(ch) : -1;
      if (index < 0) throw new Error(`${ch} is not listed under ${syllables[j]}`);
      const k = layouts.koKeys(syllables[j]);
      units.push({ len: k.length, homophone_index: index });
      keys += k;
    });
    return [units, keys];
  }

  const zhKeysFor = sid => (sid === "zh_pinyin" ? layouts.pinyinKeys : sid === "zh_eten" ? layouts.etenKeys : layouts.daqianKeys);

  /** A zh word encoded on a zh surface: [units, keys] or null when some char is not in zh. */
  function encodeZhWord(word, sid) {
    if (sid === "zh_hanja") return hanjaWordUnits(word);
    if (Object.prototype.hasOwnProperty.call(SHAPE_EDGE, sid) || sid === "zh_jyutping") return shapeWordUnits(word, sid);
    if (!Array.from(word).every(inZh)) return null;
    return zhWordUnits(word, zhKeysFor(sid));
  }

  async function prepareZh(text, sid) {
    const cps = Array.from(text);
    await Promise.all([loadZhCore(), sid === "zh_hanja" ? loadHanjaCore() : null, loadShardsFor(cps),
      sid === "zh_quick" ? loadQuick() : sid === "zh_cangjie" ? loadCangjieFor(cps) : null,
      sid === "zh_jyutping" ? loadJyutping() : null]);
    return cps;
  }

  /** The hop-free zh segment on a zh surface: {words, parts}. */
  async function encodeZh(text, sid) {
    const cps = await prepareZh(text, sid);
    const items = segment(cps).map(word => {
      const encoded = encodeZhWord(word, sid);
      return encoded ? ["word", word, [{ units: encoded[0] }, encoded[1]]] : ["sep", word, null];
    });
    return assembleWords(items, false);
  }

  // ------------------------------------------------------ word-per-unit
  const esChars = layouts.esWordChars.join("");
  // vi: a-z and the 67 other letters E types (docs/10 §3.2)
  const viChars = layouts.viLetterSet("vi_telex").join("");
  const TOKENIZERS = {
    ko: /[가-힣ㄱ-ㅣ]+/gu,
    ru: /[а-яё]+/gu,
    es: new RegExp(`[${esChars}]+`, "gu"),
    en: /[a-z]+/gu,
    vi: new RegExp(`[${viChars}]+`, "gu"),
  };
  const WORD_KEYS = {
    ko_dubeolsik: word => Array.from(word).map(ch => layouts.koKeys(ch)),
    ru_jcuken: word => [layouts.ruKeysForWord(word)],
    es_accent: word => [layouts.esKeysForWord(word)],
    en_identity: word => [layouts.enKeysForWord(word)],
    vi_telex: word => [layouts.viKeys("vi_telex", word)],
    vi_vni: word => [layouts.viKeys("vi_vni", word)],
  };
  const SURFACE_LANGUAGE = {
    ko_dubeolsik: "ko", ru_jcuken: "ru", es_accent: "es", en_identity: "en", vi_telex: "vi", vi_vni: "vi",
  };

  /** encode_word of a bijective surface: [units, keys] or null. */
  function encodeBijectiveWord(word, sid) {
    let keys;
    try { keys = WORD_KEYS[sid](word); } catch (e) { if (e instanceof LayoutError) return null; throw e; }
    if (!keys.length) return null;
    return [keys.map(k => ({ len: k.length })), keys.join("")];
  }

  /** tokenized_native_encoder for ko / ru / es / en / vi (all spaced): {words, parts}. */
  function encodeBijective(text, sid) {
    const lang = SURFACE_LANGUAGE[sid];
    const items = tokensToItems(regexTokens(text, TOKENIZERS[lang]), word => {
      const encoded = encodeBijectiveWord(word, sid);
      return encoded ? [{ units: encoded[0] }, encoded[1]] : null;
    });
    return assembleWords(items, true);
  }

  return {
    loadZhCore, loadHanjaCore, loadShardsFor, loadAllShards,
    loadQuick, loadCangjieShard, loadCangjieShards, loadAllShapes, loadJyutping,
    encodeZh, encodeBijective, encodeZhWord, encodeBijectiveWord, segment,
    zhState: () => zh, hanjaState: () => hanja, quickState: () => quick, cangjieState: () => cangjie,
    jyutpingState: () => jyutping, phrases,
    TOKENIZERS,
  };
}
