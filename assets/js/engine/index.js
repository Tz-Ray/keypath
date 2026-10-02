// The in-browser KeyPath engine: encodes the site's live routes exactly like
// keypath 3.0.1 and decodes keys, returning the Trace the page draws.
//
//   const engine = await createEngine({ fetchText });
//   await engine.encode({ text, source, surface })
//   await engine.decode({ ciphertext, keyText })
//   await engine.lookup({ layout, chunks, top })   // the workbench (workbench.js)
//   await engine.type({ layout, text })
//
// Every result that could differ from the Python tool is refused with a
// reason instead (the "exact or refuse" rule); tests/ checks the rest
// against fixtures generated from the Python implementation.
import { createData, browserFetchText, LoadError } from "./data.js";
import { makeUnicodeGuard, formatCodePoint, cpLength } from "./unicode.js";
import { normalize } from "./normalize.js";
import { makeLayouts } from "./layouts.js";
import { createLists, NotCarried, PickError } from "./lists.js";
import { createNative } from "./native.js";
import { createEnglish } from "./rows.js";
import { walkKey, keyNeeds, Tier2Error } from "./decode.js";
import { KeyError, JsonError, checkKey, parseKeyJson, has, splitRoute } from "./keycheck.js";
import { dumpsKeyWithSpans } from "./dumps.js";
import * as kp1 from "./kp1.js";
import { createWorkbench } from "./workbench.js";

export { normalize } from "./normalize.js";
export { cpCompare, cpLength, codePoints } from "./unicode.js";
export { answerNorm, answerFold, sha256Hex, checkAnswer } from "./hash.js";
export { dumpsKey, dumpsKeyWithSpans } from "./dumps.js";
export { trimAscii, KP1_PREFIX } from "./kp1.js";

// The challenges whose files carry list slices: 1-6, whose keys read hops
// the page ships no rows for.  Never more: each file holds its answer, so
// a walk over a pasted key must not fetch the files of challenges 7-12
// (their keys read only rows the page ships, and need no slices).
const SLICE_CHALLENGES = 6;
/** The SKK candidate lists of the Japanese example readings (a kana unit's Trace carries its list). */
const JA_LISTS = "data/ja/lists.json";

export async function createEngine({ fetchText } = {}) {
  if (!fetchText) fetchText = browserFetchText(new URL("../../../", import.meta.url));
  const data = createData(fetchText);
  const [registry, layoutsJson, unicode14] = await Promise.all([
    data.json("data/registry.json"), data.json("data/layouts.json"), data.json("data/unicode14.json"),
  ]);
  const layouts = makeLayouts(layoutsJson);
  const lists = createLists();
  const firstNewer = makeUnicodeGuard(unicode14);

  const surfaces = registry.siteSurfaces.map(s => ({ ...s }));
  const byId = new Map(surfaces.map(s => [s.id, s]));
  const idByPair = new Map(surfaces.map(s => [`${s.language}/${s.layout}`, s.id]));
  const siteId = (language, layout) => idByPair.get(`${language}/${layout}`);
  const surfaceById = sid => {
    const s = byId.get(sid);
    return { ...s, ...registry.surfaces[s.language][s.layout] };
  };
  const liveEnglishTargets = registry.allowed.en.filter(sid => byId.get(sid).language !== "en");

  const native = createNative({ data, layouts, lists });
  const english = createEnglish({ data, layouts, lists, surfaceById, derivedRows: registry.derivedRows, native });
  // the workbench: only ever for one layout the visitor names (docs/10 §8.1)
  const workbench = createWorkbench({ registry, layouts, native, siteId, firstNewer });

  let challengeLists = null;
  function loadChallengeLists() {
    if (!challengeLists) {
      challengeLists = Promise.all(Array.from({ length: SLICE_CHALLENGES }, (_, i) =>
        data.json(`data/challenges/${String(i + 1).padStart(2, "0")}.json`))).then(all => {
        for (const c of all) registerSlices(c.lists);
      });
      challengeLists.catch(() => { challengeLists = null; });
    }
    return challengeLists;
  }
  /** {edge: {value: [count, prefix]}} -> the list store (count 0: a value with no candidates). */
  function registerSlices(slices) {
    for (const [edge, values] of Object.entries(slices))
      for (const [value, [count, prefix]] of Object.entries(values)) {
        if (count === 0) lists.setFull(edge, value, []);
        prefix.forEach((item, i) => lists.addEntry(edge, value, count, i, item));
      }
  }
  // The SKK lists of the Japanese example readings (JA_LISTS): whole lists,
  // so a key over one of them walks back with Python's counts and heads.
  let jaLists = null;
  function loadJaLists() {
    if (!jaLists) {
      jaLists = data.json(JA_LISTS).then(slices => registerSlices(slices));
      jaLists.catch(() => { jaLists = null; });
    }
    return jaLists;
  }

  // ------------------------------------------------------------ detect
  // The language of the plaintext a visitor types (never of a ciphertext).
  // Greek: any Greek-script letter (polytonic ones included).  Vietnamese:
  // any of its 62 letters that Spanish does not share (the 67 non-ASCII
  // letters of docs/10 §3.2 but á é í ó ú), in either case.  Both come
  // before the Spanish test: "tôi có gì" is Vietnamese, "có" alone stays
  // Spanish (docs/10 §9.7).
  const VI_ONLY = new Set(layouts.viLetterSet("vi_telex").filter(ch => ch > "\x7f" && !"áéíóú".includes(ch)));
  function detect(text) {
    const t = text.normalize("NFC");
    // kana letters only: the katakana middle dot and the long-vowel mark
    // (U+30FB, U+30FC) are common punctuation, also used in Chinese
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t)) return "ja";
    if (/\p{Script=Han}/u.test(t)) return "zh";
    if (/\p{Script=Hangul}/u.test(t)) return "ko";
    if (/\p{Script=Cyrillic}/u.test(t)) return "ru";
    if (/(?=\p{L})\p{Script=Greek}/u.test(t)) return "el";
    for (const ch of t.toLowerCase()) if (VI_ONLY.has(ch)) return "vi";
    if (/[ñáéíóúü¿¡]/iu.test(t)) return "es";
    if (/\p{Script=Latin}/u.test(t)) return "en";
    return null;
  }

  const allowed = lang => (has(registry.allowed, lang) ? registry.allowed[lang].slice() : []);

  // ------------------------------------------------------------ decode
  // Before walking, load what the key reads: the cores of its homophone
  // surfaces, the Japanese example lists for a ja surface, every English
  // row file of an en->X surface (unless encode just registered the rows
  // it used), and the challenge slices for any other hop.
  async function prefetch(key, ciphertext, withRows) {
    const needs = keyNeeds(key, ciphertext, { siteId, liveEnglishTargets });
    await Promise.all([
      needs.zh ? native.loadZhCore() : null,
      needs.hanja ? native.loadHanjaCore() : null,
      needs.quick ? native.loadQuick() : null,
      needs.jyutping ? native.loadJyutping() : null,
      needs.ja ? loadJaLists() : null,
      native.loadCangjieShards([...needs.cangjie]),
      ...(withRows ? [...needs.rows].map(sid => english.loadAllRows(sid)) : []),
      needs.challenges ? loadChallengeLists() : null,
    ]);
  }

  function refusal(e) {
    if (e instanceof LoadError) return { ok: false, reason: "loadFailed", message: e.message };
    if (e instanceof Tier2Error) return { ok: false, reason: "tier2", message: e.message };
    // a refused hop (docs/10 §9.7) is named, so the page can say why in its own words
    if (e instanceof NotCarried) return { ok: false, reason: "notCarried", message: e.message, ...(e.hop ? { hop: e.hop } : {}) };
    if (e instanceof KeyError || e instanceof PickError) return { ok: false, reason: "keyInvalid", message: e.message };
    throw e;
  }

  // A key is JSON text or a kp1 string (docs/10 §2.2).  format "auto" reads
  // kp1 when the text, trimmed of ASCII whitespace, starts with "kp1." in
  // any case (the codec itself then insists on lowercase), else JSON.
  // only the leading part is tested, so a pasted JSON key is never trimmed whole
  const isCompact = keyText => /^[\t\n\f\r ]*kp1\./i.test(keyText);
  const decode = ({ ciphertext, keyText, format = "auto" }) => decodeText(ciphertext, keyText, true, format);

  // docs/10 §9.7: the lists of these hops are never shipped (the el→en
  // lists), so a key that walks one is refused before anything loads
  const refusedHop = key => {
    for (const seg of key.segments)
      for (const hop of splitRoute(seg.route)[0]) if (registry.refusedHops.includes(hop)) return hop;
    return null;
  };
  const REFUSED_WHAT = { "translate:el>en": "the Greek-to-English lists of translate:el>en" };

  async function decodeText(ciphertext, keyText, withRows, format = "json") {
    let key, compact = null;
    if (format === "kp1" || (format === "auto" && isCompact(keyText))) {
      compact = kp1.trimAscii(keyText);
      try { key = kp1.unpack(compact, registry); } catch (e) {
        if (e instanceof KeyError) return { ok: false, reason: "keyInvalid", compact: true, message: e.message };
        throw e;
      }
    } else {
      try { key = parseKeyJson(keyText); } catch (e) {
        if (e instanceof JsonError) return { ok: false, reason: "badJson", message: e.message };
        throw e;
      }
    }
    try {
      checkKey(key, registry);
      const refused = refusedHop(key);
      if (refused) throw Object.assign(new NotCarried(REFUSED_WHAT[refused] || `the lists of ${refused}`), { hop: refused });
      await prefetch(key, ciphertext, withRows);
      const { text, trace } = walkKey({ registry, layouts, lists, siteId }, ciphertext, key);
      const dumped = dumpsKeyWithSpans(key);
      return { ok: true, text, trace, key, keyText: dumped.text, spans: dumped.spans, compact };
    } catch (e) {
      return refusal(e);
    }
  }

  // ------------------------------------------------------------ kp1
  /** The kp1 string of a key (object or JSON text): {ok, text} | {ok: false, message}. */
  function kp1Pack(keyOrText) {
    try {
      const key = typeof keyOrText === "string" ? parseKeyJson(keyOrText) : keyOrText;
      return { ok: true, text: kp1.pack(key, registry) };
    } catch (e) {
      if (e instanceof KeyError || e instanceof JsonError) return { ok: false, message: e.message };
      throw e;
    }
  }
  /** The key a kp1 string carries (callers trim ASCII whitespace first): {ok, key, keyText} | {ok: false, message}. */
  function kp1Unpack(s, accepted = registry.editionHashes) {
    try {
      const key = kp1.unpack(s, registry, accepted);
      return { ok: true, key, keyText: dumpsKeyWithSpans(key).text };
    } catch (e) {
      if (e instanceof KeyError) return { ok: false, message: e.message };
      throw e;
    }
  }

  // ------------------------------------------------------------ encode
  async function encode({ text, source, surface }) {
    const newer = firstNewer(text);
    if (newer !== null) return { ok: false, reason: "newerUnicode", codePoint: formatCodePoint(newer) };
    if (source === "ja") return { ok: false, reason: "jaSource" };
    if (!allowed(source).includes(surface)) return { ok: false, reason: "routeOff" };
    const norm = normalize(text, source);
    if (!norm) return { ok: false, reason: "empty" };
    const s = surfaceById(surface);
    let assembled;
    try {
      if (s.language === source) {
        assembled = s.language === "zh" ? await native.encodeZh(norm, surface) : native.encodeBijective(norm, surface);
      } else {
        assembled = await english.encode(norm, surface);
        if (assembled.unknown) return { ok: false, reason: "unknownWords", words: assembled.unknown, typed: assembled.typed };
      }
    } catch (e) {
      if (e instanceof LoadError) return { ok: false, reason: "loadFailed", message: e.message };
      throw e;
    }
    const hops = s.language === source ? [] : [`translate:${source}>${s.language}`];
    const key = {
      keypath: registry.keyVersion,
      tables_sha256: registry.currentEdition,
      source_language: source,
      segments: [{
        language: s.language, layout: s.layout, route: [...hops, ...s.routeTail],
        selector_mode: "keyed", words: assembled.words,
      }],
    };
    const ciphertext = assembled.parts.join("");
    const { text: keyText } = dumpsKeyWithSpans(key);
    const back = await decodeText(ciphertext, keyText, false);
    if (!back.ok) return { ok: false, reason: back.reason === "loadFailed" ? "loadFailed" : "encodeError", message: back.message };
    if (back.text !== norm) return { ok: false, reason: "encodeError", message: "the walk back does not reproduce the message" };
    let choices = 0;
    for (const word of key.segments[0].words) {
      if (has(word, "translation")) choices++;
      for (const unit of word.units || []) if (has(unit, "homophone_index")) choices++;
    }
    const factors = [];
    for (const seg of back.trace.segments)
      for (const word of seg.words)
        for (const unit of word.units || []) if (unit.index !== null && unit.count > 1) factors.push(unit.count);
    return {
      ok: true, text: norm, ciphertext, key, keyText, spans: back.spans,
      leak: back.trace.leak, choices, factors, trace: back.trace,
    };
  }

  // -------------------------------------------------------- candidates
  async function list(edge, value) {
    if (edge === "homophone:zh") await native.loadZhCore();
    if (edge === "homophone:ko_hanja") await native.loadHanjaCore();
    if (edge === "shape:zh_quick") await native.loadQuick();
    if (edge === "homophone:zh_jyutping") await native.loadJyutping();
    if (edge === "shape:zh_cangjie" && typeof value === "string" && value) await native.loadCangjieShards([value[0]]);
    const d = lists.describe(edge, value);
    return d || { count: 0, items: [], complete: false };
  }

  /** The unit-layer (character) text of a trace with one unit's index overridden. */
  function whatIfParts(trace, path, index) {
    const [si, wi, ui] = path || [-1, -1, -1];
    const parts = [];
    trace.segments.forEach((seg, s) => {
      const joiner = registry.spacedLanguages.includes(seg.language) ? " " : "";
      let prevWord = false;
      seg.words.forEach((word, w) => {
        if (has(word, "literal")) { parts.push({ text: word.literal, mark: false }); prevWord = false; return; }
        if (joiner && prevWord) parts.push({ text: joiner, mark: false });
        word.units.forEach((unit, u) => {
          if (s === si && w === wi && u === ui) {
            const surface = registry.surfaces[seg.language][seg.layout];
            const d = surface.homophoneLayer ? lists.describe(surface.routeTail[0], unit.reading) : null;
            const items = d ? d.items : unit.head;
            if (!(Number.isInteger(index) && index >= 0 && index < items.length))
              throw new RangeError(`no candidate #${index} for ${unit.reading}`);
            parts.push({ text: items[index], mark: true });
          } else parts.push({ text: unit.out, mark: false });
        });
        prevWord = true;
      });
    });
    return parts;
  }
  const whatIf = (trace, path, index) => whatIfParts(trace, path, index).map(p => p.text).join("");
  /** The unit-layer text of a trace: what the keys spell, before any dictionary hop back. */
  const unitText = trace => whatIfParts(trace, null, 0).map(p => p.text).join("");

  return {
    version: registry.keypathVersion,
    edition: registry.currentEdition,
    registry,
    layouts,
    surfaces,
    allowed,
    detect,
    encode,
    decode,
    trace: async (ciphertext, keyText) => {
      const r = await decode({ ciphertext, keyText });
      return r.ok ? r.trace : null;
    },
    list,
    kp1Pack,
    kp1Unpack,
    lookup: workbench.lookup,
    type: workbench.type,
    isCompact,
    whatIf,
    whatIfParts,
    unitText,
    normalize,
    firstNewer: text => { const cp = firstNewer(text); return cp === null ? null : formatCodePoint(cp); },
    cpLength,
    // internals for tests and tools
    _internal: { data, lists, native, english, siteId, surfaceById, registerSlices, loadChallengeLists, kp1 },
  };
}
