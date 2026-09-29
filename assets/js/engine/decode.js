// The decoder: a port of keypath.walk.decode that also builds the Trace
// (the walk the page draws).  Adapted from cipher-project
// scripts/build_demo.py (v2.0), MIT: decodeUnits / decodeKeypath and the
// layout readers, extended with ja_romaji (keyed and inline selectors),
// en_identity, the Cangjie and Quick shape codes, the Vietnamese
// syllables (Telex, VNI; docs/10 §6.5), ETen, Jyutping and JIS kana
// (docs/10 §4.3-§5), and reading every
// candidate list through the list store so the page refuses, never
// misreads, when it lacks a list.
import { cpLength } from "./unicode.js";
import { KeyError, has, splitRoute, HOP_PREFIX } from "./keycheck.js";
import { LayoutError } from "./layouts.js";

export class Tier2Error extends Error {}
const fail = msg => { throw new KeyError(msg); };

const records = word => (has(word, "translations") ? word.translations
  : has(word, "translation") ? [word.translation] : []);

function hasTier2(word) {
  const all = [];
  if (Array.isArray(word.translations)) all.push(...word.translations);
  if (has(word, "translation") && word.translation !== null) all.push(word.translation);
  return all.some(r => has(r, "tier") && r.tier === 2);
}

/** Parse one unit on its surface -> {reading, count, head, index, selected, out}. */
function makeUnitReader({ layouts, lists }) {
  const guard = (chunk, fn) => {
    try { return fn(); } catch (e) {
      if (e instanceof LayoutError) fail(`malformed unit ${chunk}: ${e.message}`);
      throw e;
    }
  };
  const homophone = (edge, reading, index, what = "homophone_index") => {
    const out = lists.pick(edge, reading, index, what);
    const d = lists.describe(edge, reading);
    return { reading, count: d.count, head: d.items.slice(0, Math.min(d.count, 4)), index, selected: null, out };
  };
  const bijective = out => ({ reading: out, count: 1, head: [out], index: null, selected: null, out });
  const unitIndex = unit => (has(unit, "homophone_index") ? unit.homophone_index : undefined);

  /** A ja unit with no index is its own kana (Python still reports that kana's SKK candidates when it has some). */
  const kanaIdentity = kana => {
    const d = lists.describe("homophone:ja", kana);
    return d ? { reading: kana, count: d.count, head: d.items.slice(0, Math.min(d.count, 4)), index: null, selected: null, out: kana }
      : { reading: kana, count: 1, head: [kana], index: null, selected: null, out: kana };
  };
  const readers = {
    "zh/zh_daqian": (chunk, unit) => homophone("homophone:zh", guard(chunk, () => layouts.daqianReading(chunk)), unitIndex(unit)),
    // Dàqiān's readings and candidate lists, on the ETen keys
    "zh/zh_eten": (chunk, unit) => homophone("homophone:zh", guard(chunk, () => layouts.etenReading(chunk)), unitIndex(unit)),
    // a Jyutping unit is its reading as written; a well-shaped chunk that is
    // no reading of the table is malformed (the lists are complete)
    "zh/zh_jyutping": (chunk, unit) => homophone("homophone:zh_jyutping", guard(chunk, () => layouts.jyutpingReading(chunk)), unitIndex(unit)),
    "zh/zh_pinyin": (chunk, unit) => homophone("homophone:zh", guard(chunk, () => layouts.pinyinReading(chunk)), unitIndex(unit)),
    "zh/ko_dubeolsik": (chunk, unit) => homophone("homophone:ko_hanja", guard(chunk, () => layouts.koUnit(chunk)), unitIndex(unit)),
    // a shape unit's reading is its code; a well-shaped chunk that is no code
    // of the table is malformed (the list store knows once its part is loaded)
    "zh/zh_cangjie": (chunk, unit) => homophone("shape:zh_cangjie", guard(chunk, () => layouts.shapeCode(chunk, "zh_cangjie")), unitIndex(unit)),
    "zh/zh_quick": (chunk, unit) => homophone("shape:zh_quick", guard(chunk, () => layouts.shapeCode(chunk, "zh_quick")), unitIndex(unit)),
    "ko/ko_dubeolsik": chunk => bijective(guard(chunk, () => layouts.koUnit(chunk))),
    "ru/ru_jcuken": chunk => bijective(guard(chunk, () => layouts.ruWord(chunk))),
    "es/es_accent": chunk => bijective(guard(chunk, () => layouts.esWord(chunk))),
    "en/en_identity": chunk => bijective(guard(chunk, () => layouts.enWord(chunk))),
    // one unit is one syllable of G: D(chunk), when E types it back as the chunk
    "vi/vi_telex": chunk => bijective(guard(chunk, () => layouts.viSyllable("vi_telex", chunk))),
    "vi/vi_vni": chunk => bijective(guard(chunk, () => layouts.viSyllable("vi_vni", chunk))),
    "ja/ja_romaji": (chunk, unit, mode) => {
      let romaji = chunk, index, selected = null;
      if (mode === "inline") {
        if (has(unit, "homophone_index") && unit.homophone_index !== null)
          fail("inline segment unit must not carry homophone_index");
        const last = chunk[chunk.length - 1];
        if (last >= "0" && last <= "9") {
          if (last === "0") fail(`invalid inline selector 0 in unit ${chunk}`);
          romaji = chunk.slice(0, -1);
          selected = Number(last) - 1;
        }
        index = selected;
      } else {
        index = has(unit, "homophone_index") ? unit.homophone_index : null;
      }
      const kana = guard(chunk, () => layouts.romajiToKana(romaji));
      if (index === null) return kanaIdentity(kana);
      const u = homophone("homophone:ja", kana, index, "candidate index");
      return mode === "inline" ? { ...u, index: null, selected } : u;
    },
    // keyed only (the key check refuses inline): a trailing digit is a kana
    // key, never a selector
    "ja/ja_kana": (chunk, unit) => {
      const kana = guard(chunk, () => layouts.keysToKana(chunk));
      const index = has(unit, "homophone_index") ? unit.homophone_index : null;
      return index === null ? kanaIdentity(kana) : homophone("homophone:ja", kana, index, "candidate index");
    },
  };
  return (seg, chunk, unit) => {
    const read = readers[`${seg.language}/${seg.layout}`];
    if (!read) fail(`layout ${seg.layout} is not supported`);
    return read(chunk, unit, seg.selector_mode);
  };
}

/**
 * Walk a checked key back over `cipher`.  -> {text, trace}.  Throws KeyError
 * (the key does not fit), NotCarried / PickError (from the list store) or
 * Tier2Error.
 */
export function walkKey(ctx, cipher, key) {
  const { registry: R, siteId, lists } = ctx;
  const readUnit = makeUnitReader(ctx);
  const joiner = R.spacedLanguages.includes(key.source_language) ? " " : "";
  let out = "", pos = 0, leak = 0;
  const segments = [];
  key.segments.forEach(seg => {
    const surface = R.surfaces[seg.language][seg.layout];
    const hops = splitRoute(seg.route)[0];
    const parts = [], words = [];
    for (const word of seg.words) {
      if (has(word, "literal")) {
        const text = word.literal.text;
        // walk._emit_literal_text: the text must be valid Unicode (no lone surrogate)
        if (/\p{Cs}/u.test(text)) fail("tier-3 literal in key is not valid Unicode (a lone surrogate)");
        parts.push(["verbatim", text]);
        words.push({ literal: text });
        leak += cpLength(text);
        continue;
      }
      if (!has(word, "units")) fail("word entry has neither literal nor units");
      if (hasTier2(word)) throw new Tier2Error("free-translation (tier-2) records are not supported in the browser");
      const recs = records(word);
      if (!Array.isArray(recs) || recs.length !== hops.length)
        fail(`word has ${Array.isArray(recs) ? recs.length : "no list of"} translation records for ${hops.length} hops`);
      const units = [];
      let current = "";
      for (const unit of word.units) {
        if (pos + unit.len > cipher.length) fail("ciphertext ends mid-unit");
        const chunk = cipher.slice(pos, pos + unit.len);
        for (const ch of chunk)
          if (!surface.alphabet.includes(ch)) fail(`unit ${chunk} contains '${ch}', which is outside the ${seg.layout} alphabet`);
        if (!surface.homophoneLayer && has(unit, "homophone_index"))
          fail(`unit ${chunk}: surface (${seg.language}, ${seg.layout}) has no homophone layer`);
        const u = readUnit(seg, chunk, unit);
        units.push({ keys: chunk, at: pos, reading: u.reading, count: u.count, head: u.head,
          index: u.index, selected: u.selected, out: u.out });
        current += u.out;
        pos += unit.len;
      }
      const chain = [];
      for (let h = hops.length - 1; h >= 0; h--) {
        const record = recs[h];
        if (!record || record.tier !== 1) fail(`unsupported translation tier ${record && record.tier} in chain`);
        const next = lists.pick(hops[h], current, record.index, "translation index");
        const lang = hops[h].slice(HOP_PREFIX.length).split(">")[1];
        chain.unshift({ lang, word: current, index: record.index, count: lists.describe(hops[h], current).count });
        current = next;
      }
      parts.push(["word", current]);
      words.push({ source: current, chain, units });
    }
    let prev = null;
    for (const [kind, text] of parts) {
      if (joiner && kind === "word" && prev === "word") out += joiner;
      out += text;
      prev = kind;
    }
    segments.push({
      surface: siteId(seg.language, seg.layout), language: seg.language, layout: seg.layout,
      selector: seg.selector_mode, hops: hops.map(h => h.slice(HOP_PREFIX.length)), words,
    });
  });
  if (pos !== cipher.length) fail(`${cipher.length - pos} unconsumed ciphertext characters`);
  return {
    text: out,
    trace: { source: key.source_language, text: out, ciphertext: cipher, leak: [leak, cpLength(out)], segments },
  };
}

/**
 * What a key needs loaded before walking over `cipher`: {zh, hanja, quick,
 * jyutping, cangjie: first letters of its Cangjie units, rows: [sid], challenges}.
 */
export function keyNeeds(key, cipher, { siteId, liveEnglishTargets }) {
  const needs = { zh: false, hanja: false, quick: false, jyutping: false, cangjie: new Set(), rows: new Set(), challenges: false };
  let pos = 0;
  for (const seg of key.segments) {
    const [hops, tail] = splitRoute(seg.route);
    if (tail[0] === "homophone:zh") needs.zh = true;
    if (tail[0] === "homophone:ko_hanja") needs.hanja = true;
    if (tail[0] === "shape:zh_quick") needs.quick = true;
    if (tail[0] === "homophone:zh_jyutping") needs.jyutping = true;
    for (const word of seg.words)
      for (const unit of has(word, "units") && Array.isArray(word.units) ? word.units : []) {
        if (tail[0] === "shape:zh_cangjie" && pos < cipher.length) needs.cangjie.add(cipher[pos]);
        if (has(unit, "len") && Number.isInteger(unit.len) && unit.len > 0) pos += unit.len;
      }
    const sid = siteId(seg.language, seg.layout);
    const viaRows = key.source_language === "en" && hops.length === 1 && liveEnglishTargets.includes(sid)
      && hops[0] === `${HOP_PREFIX}en>${seg.language}`;
    if (viaRows) needs.rows.add(sid);
    else if (hops.length || tail[0] === "homophone:ja") needs.challenges = true;
  }
  return needs;
}
