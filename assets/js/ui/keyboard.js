// The keyboard picture: what each US key types on the current layout, which
// keys the ciphertext uses, and (on hover/focus) the focused unit's keys.
import { h, cps } from "./dom.js";

/** The US keys the picture draws, row by row (docs/10 §8.4's order). */
export const ROWS = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
];
const INDENT = [0, 0.5, 0.75, 1.25];
const SHIFTED_PUNCT = {
  "`": "~", 1: "!", 2: "@", 3: "#", 4: "$", 5: "%", 6: "^", 7: "&", 8: "*", 9: "(", 0: ")", "-": "_", "=": "+",
  "[": "{", "]": "}", "\\": "|", ";": ":", "'": '"', ",": "<", ".": ">", "/": "?",
};
/**
 * The one US shift map (docs/10 §9.7): what each key types with Shift (a
 * letter: its capital).  Every layout with a shift layer (Dubeolsik, JIS
 * kana) reads its shifted legends through it.
 */
export const US_SHIFT = Object.freeze(Object.fromEntries(ROWS.flat().map(key => [key, SHIFTED_PUNCT[key] ?? key.toUpperCase()])));
/** Layouts drawn as a key grid (the others get a list or no picture). */
export const GRID_LAYOUTS = new Set(["zh_daqian", "zh_eten", "zh_pinyin", "zh_jyutping", "zh_cangjie", "zh_quick",
  "ko_dubeolsik", "ru_jcuken", "ja_kana"]);
const SHAPE = new Set(["zh_cangjie", "zh_quick"]);
const LEGEND_LANG = { ru_jcuken: "ru", ko_dubeolsik: "ko", zh_pinyin: "en", zh_jyutping: "en", ja_kana: "ja" };

/**
 * The grid for `layout`: rows of {key, typed, legend, tone}, where `typed` is
 * what the key types (with `shift`, through US_SHIFT) and `legend` what that
 * means on the layout ("" for a key the layout does not use).
 */
export function keyboardModel(legends, layout, shift = false) {
  return ROWS.map(row => row.map(key => {
    const typed = shift ? US_SHIFT[key] : key;
    return { key, typed, legend: legends.keyLegend(layout, typed), tone: legends.isTone(layout, typed) };
  }));
}

/** Whether the layout types some key with Shift (its picture then has a Shift switch). */
export const hasShiftLayer = (legends, layout) => ROWS.flat().some(key => legends.keyLegend(layout, US_SHIFT[key]) !== "");

/** "Tone keys: 6 ˊ · 3 ˇ · 4 ˋ · 7 ˙; …", from a Bopomofo layout's table. */
export const bopomofoToneNote = table =>
  `Tone keys: ${Object.entries(table.toneToKey).map(([mark, key]) => `${key} ${mark}`).join(" · ")}; the first tone types nothing.`;

/** "Tone digits: 1 high level · …", from the Jyutping table. */
export const jyutpingNote = table =>
  `Each character is typed as its Jyutping syllable, then its tone digit: ${table.toneNames.map(([d, name]) => `${d} ${name}`).join(" · ")}.`;

/**
 * The JIS kana notes, from the table: the two voicing keys with an example
 * each ([base key, voiced kana, its keys, mark]), and the kana typed with
 * Shift ([typed, kana, key]) in keyboard order.
 */
export function kanaNotes(legends) {
  const table = legends.layouts.data.ja_kana.keysByKana;
  const oneKey = new Map(table.filter(([, keys]) => keys.length === 1));
  const { marks } = legends.layouts.kanaLegend();
  const voicing = [...marks].map(([markKey, mark]) => {
    const [kana, keys] = table.find(([, k]) => k.length === 2 && k[1] === markKey);
    return { markKey, mark, base: [...oneKey].find(([, k]) => k === keys[0])[0], kana, keys };
  });
  const shifted = ROWS.flat().filter(key => legends.keyLegend("ja_kana", US_SHIFT[key]))
    .map(key => ({ typed: US_SHIFT[key], kana: legends.keyLegend("ja_kana", US_SHIFT[key]), key }));
  return { voicing, shifted };
}

const VI = new Set(["vi_telex", "vi_vni"]);
// How a syllable is typed (docs/10 §6.3): each letter's base letter, then its
// modifier key, then (on the vowel that carries it) the syllable's one tone key
export const VI_NOTE = {
  vi_telex: "Type each letter as its base letter, then its modifier key if it has one. Right after the vowel that carries the tone (and its modifier key), type the tone key, once per syllable:",
  vi_vni: "Type each letter as its base letter, then its modifier digit (6 to 9) if it has one. Right after the vowel that carries the tone (and its modifier digit), type the tone digit (1 to 5), once per syllable:",
};

/**
 * The Telex or VNI legend, read from the layout's table (docs/10 §6.1):
 * {modifiers: [{keys, letter, used}], tones: [{key, name, example, used}], placement: [[word, keys]]},
 * `used` when the units of `pairs` ([keys, reading]) type that modifier or tone.
 */
export function viLegendModel(layouts, layout, pairs = []) {
  const { modifiers, tones } = layouts.viLegend(layout);
  const usedMods = new Set(), usedTones = new Set();
  for (const [keys] of pairs) {
    let letters;
    try { letters = layouts.viLetters(layout, keys); } catch { continue; }
    for (const l of letters) for (const k of l.keys) {
      if (k.role === "modifier") usedMods.add(l.keys[0].key + k.key);
      if (k.role === "tone") usedTones.add(k.key);
    }
  }
  return {
    modifiers: modifiers.map(([keys, letter]) => ({ keys, letter, used: usedMods.has(keys) })),
    tones: tones.map(([key, name, mark]) => ({ key, name, example: `a${mark}`.normalize("NFC"), used: usedTones.has(key) })),
    // §6.3: the keys record where the mark sits
    placement: ["hòa", "hoà"].map(w => [w, layouts.viKeys(layout, w)]),
  };
}

/**
 * Render the picture for `layout` into `host` (a <details> body).  Returns
 * {highlight(keys|null), flash(key)} or null when the layout has no picture.
 */
export function renderKeyboard(host, layout, ciphertext, legends, extra = {}) {
  host.replaceChildren();
  const counts = new Map();
  for (const c of cps(ciphertext)) counts.set(c, (counts.get(c) || 0) + 1);
  const els = new Map();
  let shift = false;

  if (layout === "es_accent") {
    const rows = legends.layouts.data.es_accent.rows;
    host.append(h("p.kb-note", "A digit after a vowel, n or c picks its accented form:"),
      h("ul.kb-es", { lang: "en" }, rows.map(([b, d, v]) => h("li", { class: counts.has(d) && ciphertext.includes(b + d) ? "used" : null },
        h("kbd", b + d), " ", h("span", { lang: "es" }, v)))));
    return { highlight() {}, flash() {} };
  }
  if (layout === "ja_romaji") {
    const pairs = extra.pairs || [];
    host.append(h("p.kb-note", "Kana are typed as romaji; っ doubles the next consonant; ん is nn."),
      pairs.length ? h("ul.kb-es", pairs.map(([keys, kana]) => h("li", h("kbd", { lang: "en" }, keys), " ", h("span", { lang: "ja" }, kana)))) : null);
    return { highlight() {}, flash() {} };
  }
  if (VI.has(layout)) {
    const m = viLegendModel(legends.layouts, layout, extra.pairs || []);
    const vi = text => h("span", { lang: "vi" }, text);
    host.append(h("p.kb-note", VI_NOTE[layout]),
      h("ul.kb-es.kb-vi", { "aria-label": "Modifier keys" }, m.modifiers.map(x => h("li", { class: x.used ? "used" : null },
        h("kbd", { lang: "en" }, x.keys), " ", vi(x.letter)))),
      h("ul.kb-es.kb-vi", { "aria-label": "Tone keys" }, m.tones.map(x => h("li", { class: x.used ? "used" : null },
        h("kbd", { lang: "en" }, x.key), " ", vi(`${x.name} (${x.example})`)))),
      h("p.kb-note", "The keys record where the tone mark sits: ", vi(m.placement[0][0]), " is ", h("kbd", { lang: "en" }, m.placement[0][1]),
        ", ", vi(m.placement[1][0]), " is ", h("kbd", { lang: "en" }, m.placement[1][1]), "."));
    return { highlight() {}, flash() {} };
  }

  if (!GRID_LAYOUTS.has(layout)) return null;
  const legendLang = LEGEND_LANG[layout] || "zh-Hant";
  const L = legends.layouts.data;

  const pic = h("div.kb-pic", { role: "img", "aria-label": "Keyboard picture" });
  const draw = () => {
    pic.replaceChildren();
    els.clear();
    keyboardModel(legends, layout, shift).forEach((row, r) => {
      const rowEl = h("div.kb-row", { style: { "--indent": String(INDENT[r]) } });
      for (const { key, typed, legend, tone } of row) {
        const n = counts.get(typed) || 0;
        const el = h("span.kb-key", {
          class: `kb-key${legend ? "" : " unused"}${n ? " used" : ""}${tone ? " tone" : ""}`,
          "data-key": key,
        }, h("span.us", { lang: "en" }, typed === key ? key : `⇧${typed}`),
        legend ? h("span.sym", { lang: legendLang }, legend) : null,
        n ? h("span.cnt", String(n)) : null);
        els.set(typed, el);
        rowEl.append(el);
      }
      pic.append(rowEl);
    });
  };
  draw();
  const parts = [pic];
  if (hasShiftLayer(legends, layout)) {
    const box = h("input", { type: "checkbox" });
    box.addEventListener("change", () => { shift = box.checked; draw(); });
    parts.unshift(h("label.kb-shift", box, " Shift"));
  }
  if (layout === "zh_pinyin") parts.push(h("p.kb-note", "Tone digits: 1 ˉ · 2 ˊ · 3 ˇ · 4 ˋ · 5 neutral"));
  if (layout === "zh_daqian") parts.push(h("p.kb-note", bopomofoToneNote(L.zh_daqian)));
  if (layout === "zh_eten") {
    parts.push(h("p.kb-note", "ETen types the same Bopomofo symbols as the Dàqiān keyboard, on other keys. ", bopomofoToneNote(L.zh_eten)));
  }
  if (layout === "zh_jyutping") parts.push(h("p.kb-note", jyutpingNote(L.zh_jyutping)));
  if (layout === "ja_kana") {
    const { voicing, shifted } = kanaNotes(legends);
    const kbd = text => h("kbd", { lang: "en" }, text);
    const ja = text => h("span", { lang: "ja" }, text);
    parts.push(h("p.kb-note", "Each key types one kana. ",
      voicing.flatMap((v, i) => [i ? "; " : "", kbd(v.markKey), " after a kana adds ", ja(v.mark), " (", ja(v.base), " ", kbd(v.keys[0]), ", ",
        ja(v.kana), " ", kbd(v.keys), ")"]), "."),
    h("p.kb-note", "With Shift:"),
    h("ul.kb-es", { "aria-label": "Kana typed with Shift" }, shifted.map(x => h("li", { class: counts.has(x.typed) ? "used" : null },
      kbd(x.typed), " ", ja(x.kana), ` (Shift+${x.key})`))));
  }
  if (SHAPE.has(layout)) {
    parts.push(h("p.kb-note", "Each letter stands for a shape, its radical; a character's code spells its parts (codes from Unihan). ",
      h("kbd", { lang: "en" }, "x"), " ", h("span", { lang: "zh-Hant" }, legends.shape.get("x")),
      " is the key for hard-to-split characters; ", h("kbd", { lang: "en" }, "z"), " is unused."));
    if (layout === "zh_quick") parts.push(h("p.kb-note", "Quick types only the first and last letters of a character's Cangjie code; a code of one or two letters stays whole."));
  }
  host.append(...parts);
  return {
    highlight(keys) {
      pic.querySelectorAll(".focus").forEach(el => el.classList.remove("focus"));
      if (!keys) return;
      for (const k of cps(keys)) { const el = els.get(k); if (el) el.classList.add("focus"); }
    },
    flash(key) {
      const el = els.get(key);
      if (!el) return;
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 160);
    },
  };
}
