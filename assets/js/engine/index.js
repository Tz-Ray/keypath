// The in-browser KeyPath engine: encodes the site's live routes exactly like
// keypath 2.0.0 and decodes keys, returning the Trace the page draws.
//
//   const engine = await createEngine({ fetchText });
//   await engine.encode({ text, source, surface })
//   await engine.decode({ ciphertext, keyText })
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
import { KeyError, JsonError, checkKey, parseKeyJson, has } from "./keycheck.js";
import { dumpsKeyWithSpans } from "./dumps.js";

export { normalize } from "./normalize.js";
export { cpCompare, cpLength, codePoints } from "./unicode.js";
export { answerNorm, answerFold, sha256Hex, checkAnswer } from "./hash.js";
export { dumpsKey, dumpsKeyWithSpans } from "./dumps.js";

const CHALLENGE_COUNT = 6;

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
  const english = createEnglish({ data, layouts, lists, surfaceById });

  let challengeLists = null;
  function loadChallengeLists() {
    if (!challengeLists) {
      challengeLists = Promise.all(Array.from({ length: CHALLENGE_COUNT }, (_, i) =>
        data.json(`data/challenges/${String(i + 1).padStart(2, "0")}.json`))).then(all => {
        for (const c of all) registerSlices(c.lists);
      });
      challengeLists.catch(() => { challengeLists = null; });
    }
    return challengeLists;
  }
  /** {edge: {value: [count, prefix]}} -> the list store. */
  function registerSlices(slices) {
    for (const [edge, values] of Object.entries(slices))
      for (const [value, [count, prefix]] of Object.entries(values))
        prefix.forEach((item, i) => lists.addEntry(edge, value, count, i, item));
  }

  // ------------------------------------------------------------ detect
  function detect(text) {
    const t = text.normalize("NFC");
    // kana letters only: the katakana middle dot and the long-vowel mark
    // (U+30FB, U+30FC) are common punctuation, also used in Chinese
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t)) return "ja";
    if (/\p{Script=Han}/u.test(t)) return "zh";
    if (/\p{Script=Hangul}/u.test(t)) return "ko";
    if (/\p{Script=Cyrillic}/u.test(t)) return "ru";
    if (/[ñáéíóúü¿¡]/iu.test(t)) return "es";
    if (/\p{Script=Latin}/u.test(t)) return "en";
    return null;
  }

  const allowed = lang => (has(registry.allowed, lang) ? registry.allowed[lang].slice() : []);

  // ------------------------------------------------------------ decode
  // Before walking, load what the key reads: the cores of its homophone
  // surfaces, every English row file of an en->X surface (unless encode
  // just registered the rows it used), and the challenge slices for any
  // other hop.
  async function prefetch(key, withRows) {
    const needs = keyNeeds(key, { siteId, liveEnglishTargets });
    await Promise.all([
      needs.zh ? native.loadZhCore() : null,
      needs.hanja ? native.loadHanjaCore() : null,
      ...(withRows ? [...needs.rows].map(sid => english.loadAllRows(sid)) : []),
      needs.challenges ? loadChallengeLists() : null,
    ]);
  }

  function refusal(e) {
    if (e instanceof LoadError) return { ok: false, reason: "loadFailed", message: e.message };
    if (e instanceof Tier2Error) return { ok: false, reason: "tier2", message: e.message };
    if (e instanceof NotCarried) return { ok: false, reason: "notCarried", message: e.message };
    if (e instanceof KeyError || e instanceof PickError) return { ok: false, reason: "keyInvalid", message: e.message };
    throw e;
  }

  const decode = ({ ciphertext, keyText }) => decodeText(ciphertext, keyText, true);

  async function decodeText(ciphertext, keyText, withRows) {
    let key;
    try { key = parseKeyJson(keyText); } catch (e) {
      if (e instanceof JsonError) return { ok: false, reason: "badJson", message: e.message };
      throw e;
    }
    try {
      checkKey(key, registry);
      await prefetch(key, withRows);
      const { text, trace } = walkKey({ registry, layouts, lists, siteId }, ciphertext, key);
      const dumped = dumpsKeyWithSpans(key);
      return { ok: true, text, trace, key, keyText: dumped.text, spans: dumped.spans };
    } catch (e) {
      return refusal(e);
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
        if (assembled.unknown) return { ok: false, reason: "unknownWords", words: assembled.unknown };
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
    whatIf,
    whatIfParts,
    unitText,
    normalize,
    firstNewer: text => { const cp = firstNewer(text); return cp === null ? null : formatCodePoint(cp); },
    cpLength,
    // internals for tests and tools
    _internal: { data, lists, native, english, siteId, surfaceById, registerSlices, loadChallengeLists },
  };
}
