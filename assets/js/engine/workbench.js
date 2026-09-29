// The hunter's workbench (docs/10 §9.7): two questions about one layout the
// visitor names, answered as the text KeyPath's own tools print.
//
//   lookup({layout, chunks, top})  - what `keypath lookup --layout L --top N`
//                                    prints for the chunks (without --gloss)
//   type({layout, text})           - what `keypath type --layout L` prints
//                                    (greedy segmentation)
//
// Both answer for every surface typed on the layout (ko_dubeolsik: Korean,
// then hanja) and nothing else: they never guess a layout, try several, or
// split a stream of keys (docs/10 §8.1).  Without a workbench layout both
// return {ok: false, reason: "noLayout"}.  A unit's parse is the surface's
// candidates_for after its alphabet check, with the tool's violated-rule
// texts; tests/workbench.test.js compares every answer with fixtures the
// Python CLI printed.
import { LoadError } from "./data.js";
import { LayoutError } from "./layouts.js";
import { normalize } from "./normalize.js";
import { formatCodePoint } from "./unicode.js";
import { pyrepr as R } from "./pyrepr.js";

/** `keypath lookup`'s default --top. */
export const DEFAULT_TOP = 10;
/** A chunk is printable ASCII other than space (U+0021-U+007E). */
const CHUNK_CHAR = /[\x21-\x7e]/;
const IDENTITY_NOTE = " (identity: the unit is its reading; a key carries no homophone_index)";

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const fail = msg => { throw new LayoutError(msg); };

export function createWorkbench({ registry, layouts, native, siteId, firstNewer }) {
  /** layout -> [[language, layout], ...] in registration order */
  const surfacesOf = new Map(registry.workbench.map(w => [w.layout, w.surfaces]));
  const known = layout => typeof layout === "string" && surfacesOf.has(layout);
  const noLayout = () => ({ ok: false, reason: "noLayout" });
  const loadFailed = e => ({ ok: false, reason: "loadFailed", message: e.message });

  const identity = {
    ko_dubeolsik: layouts.koUnit, ru_jcuken: layouts.ruWord, es_accent: layouts.esWord, en_identity: layouts.enWord,
    vi_telex: chunk => layouts.viSyllable("vi_telex", chunk), vi_vni: chunk => layouts.viSyllable("vi_vni", chunk),
    // docs/10 §7.1: a word, read left to right (a dead key must be followed by a vowel it accents)
    el_greek: layouts.elWord,
  };

  /**
   * One chunk on one surface: {reading, romanized, candidates, identity}, or
   * a LayoutError whose message is the violated rule.  The lists it reads
   * must be loaded (`prepare`).
   */
  function parse(language, layout, chunk) {
    const { alphabet } = registry.surfaces[language][layout];
    for (const ch of chunk) {
      if (!alphabet.includes(ch)) fail(`unit ${R(chunk)} contains ${R(ch)}, which is outside the ${layout} alphabet`);
    }
    const sid = siteId(language, layout);
    if (sid === "zh_daqian" || sid === "zh_eten" || sid === "zh_pinyin") {
      const reading = sid === "zh_daqian" ? layouts.daqianReading(chunk)
        : sid === "zh_eten" ? layouts.etenReading(chunk) : layouts.pinyinReading(chunk);
      const candidates = native.zhState().lists.get(reading);
      if (!candidates) fail(`unit ${R(chunk)} maps to ${R(reading)}, which is not a syllable in the reading table`);
      return { reading, romanized: layouts.numberedPinyin(reading), candidates, identity: false };
    }
    if (sid === "zh_jyutping") {
      // docs/10 §4.4: the unit is the reading as written; the table decides whether it is one
      const reading = layouts.jyutpingReading(chunk);
      const candidates = native.jyutpingState().lists.get(reading);
      if (!candidates) fail(`unit ${R(chunk)} is not a Jyutping reading on layout ${layout}: no character of zh_jyutping.tsv reads ${R(reading)}`);
      return { reading, romanized: null, candidates, identity: false };
    }
    if (sid === "zh_cangjie" || sid === "zh_quick") {
      const code = layouts.shapeCode(chunk, layout);
      const candidates = (sid === "zh_quick" ? native.quickState() : native.cangjieState()).lists.get(code);
      if (!candidates) fail(`unit ${R(chunk)} is not a code on layout ${layout}: no character of zh_cangjie.tsv has it`);
      return { reading: code, romanized: layouts.radicalsOf(code), candidates, identity: false };
    }
    if (sid === "zh_hanja") {
      const syllable = layouts.koUnit(chunk);
      const candidates = native.hanjaState().lists.get(syllable);
      if (!candidates) fail(`unit ${R(chunk)}: reading ${R(syllable)} has no hanja candidates`);
      return { reading: syllable, romanized: null, candidates, identity: false };
    }
    const word = identity[sid](chunk);
    return { reading: word, romanized: null, candidates: [word], identity: true };
  }

  /** Load the candidate lists lookup reads for these chunks on these surfaces. */
  function prepare(surfaces, chunks) {
    return Promise.all(surfaces.map(([language, layout]) => {
      const sid = siteId(language, layout);
      if (sid === "zh_daqian" || sid === "zh_eten" || sid === "zh_pinyin") return native.loadZhCore();
      if (sid === "zh_jyutping") return native.loadJyutping();
      if (sid === "zh_quick") return native.loadQuick();
      if (sid === "zh_cangjie") return native.loadCangjieShards(chunks.map(c => c[0]).filter(Boolean));
      if (sid === "zh_hanja") return native.loadHanjaCore();
      return null;
    }));
  }

  /** keypath.lookup's rendering of one (chunk, surface) entry. */
  function entryLines(chunk, language, layout, top) {
    const head = `${chunk} · (${language}, ${layout}) · well-formed: `;
    let p;
    try { p = parse(language, layout, chunk); } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      return { ok: false, lines: [`${head}no`, `  violated rule: ${e.message}`] };
    }
    const size = p.candidates.length;
    const items = p.candidates.slice(0, top).map((c, rank) => `${rank}:${c}`).join(" ");
    const more = size > top ? `(+${size - top} more)` : "";
    const lines = [
      `${head}yes`,
      `  reading: ${p.reading}${p.romanized ? ` / ${p.romanized}` : ""}`,
      `  candidates: ${size}${p.identity ? IDENTITY_NOTE : ""}`,
    ];
    if (items || more) lines.push(`  ${[items, more].filter(Boolean).join("  ")}`);
    return { ok: true, lines };
  }

  /**
   * {ok: true, text, wellFormed, blocks} - wellFormed is `keypath lookup`'s
   * exit status 0: every chunk is a unit on at least one of the layout's
   * surfaces; blocks are text's parts, one per (chunk, surface), as
   * {language, layout, text}, joined by blank lines.
   * {ok: false, reason: "noLayout" | "badTop" | "noChunks" | "badChunk" (index, codePoint) | "loadFailed"}
   */
  async function lookup(args) {
    const { layout, chunks, top = DEFAULT_TOP } = args ?? {};
    if (!known(layout)) return noLayout();
    if (!Number.isSafeInteger(top) || top < 0) return { ok: false, reason: "badTop" };
    if (!Array.isArray(chunks) || !chunks.length) return { ok: false, reason: "noChunks" };
    for (const [index, chunk] of chunks.entries()) {
      if (typeof chunk !== "string") return { ok: false, reason: "badChunk", index, codePoint: null };
      for (const ch of chunk) {
        if (!CHUNK_CHAR.test(ch)) return { ok: false, reason: "badChunk", index, codePoint: formatCodePoint(ch.codePointAt(0)) };
      }
    }
    const surfaces = surfacesOf.get(layout);
    try { await prepare(surfaces, chunks); } catch (e) {
      if (e instanceof LoadError) return loadFailed(e);
      throw e;
    }
    const blocks = [];
    let wellFormed = true;
    for (const chunk of chunks) {
      let any = false;
      for (const [language, lay] of surfaces) {
        const entry = entryLines(chunk, language, lay, top);
        any = any || entry.ok;
        blocks.push({ language, layout: lay, text: entry.lines.join("\n") });
      }
      wellFormed = wellFormed && any;
    }
    return { ok: true, text: blocks.map(b => b.text).join("\n\n"), wellFormed, blocks };
  }

  /**
   * {ok: true, text, sections} - per surface a header `(language, layout)`,
   * then the surface's own encoder over the text normalized for its
   * language, one line per unit (`text keys index/size`, or `text keys -`
   * without an index) or tier-3 literal (`(literal: "…")`); sections are
   * text's parts, one per surface, as {language, layout, text}, joined by
   * line breaks.
   * {ok: false, reason: "noLayout" | "noText" | "newerUnicode" (codePoint) | "loadFailed"}
   */
  async function type(args) {
    const { layout, text } = args ?? {};
    if (!known(layout)) return noLayout();
    if (typeof text !== "string") return { ok: false, reason: "noText" };
    const newer = firstNewer(text);
    if (newer !== null) return { ok: false, reason: "newerUnicode", codePoint: formatCodePoint(newer) };
    const sections = [];
    try {
      for (const [language, lay] of surfacesOf.get(layout)) {
        const sid = siteId(language, lay);
        const norm = normalize(text, language);
        const { words, parts } = language === "zh" ? await native.encodeZh(norm, sid) : native.encodeBijective(norm, sid);
        const lines = [`(${language}, ${lay})`];
        let part = 0;
        for (const word of words) {
          if (has(word, "literal")) {
            lines.push(`(literal: ${JSON.stringify(word.literal.text)})`);
            continue;
          }
          const keys = parts[part++];
          let pos = 0;
          for (const unit of word.units) {
            const chunk = keys.slice(pos, pos + unit.len);
            pos += unit.len;
            const p = parse(language, lay, chunk);
            lines.push(has(unit, "homophone_index")
              ? `${p.candidates[unit.homophone_index]} ${chunk} ${unit.homophone_index}/${p.candidates.length}`
              : `${p.reading} ${chunk} -`);
          }
        }
        sections.push({ language, layout: lay, text: lines.join("\n") });
      }
    } catch (e) {
      if (e instanceof LoadError) return loadFailed(e);
      throw e;
    }
    return { ok: true, text: sections.map(x => x.text).join("\n"), sections };
  }

  return { lookup, type };
}
