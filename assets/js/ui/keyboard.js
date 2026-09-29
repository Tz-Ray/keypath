// The keyboard picture: what each US key types on the current layout, which
// keys the ciphertext uses, and (on hover/focus) the focused unit's keys.
import { h, cps } from "./dom.js";

const ROWS = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
];
const INDENT = [0, 0.5, 0.75, 1.25];
const PINYIN_TONE = { 1: "ˉ", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙" };
const DAQIAN_TONES = new Set(["6", "3", "4", "7"]);
const SHAPE = new Set(["zh_cangjie", "zh_quick"]);
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
  if (layout === "en_identity") return null;

  const legendOf = key => {
    if (layout === "zh_daqian") return legends.dq.get(key) || "";
    if (layout === "ko_dubeolsik") return legends.ko.get(shift && /[qwertop]/.test(key) ? key.toUpperCase() : key) || "";
    if (layout === "ru_jcuken") return legends.ru.get(key) || "";
    if (layout === "zh_pinyin") return PINYIN_TONE[key] || (/[a-z]/.test(key) ? key : "");
    if (SHAPE.has(layout)) return legends.shape.get(key) || "";
    return "";
  };
  const legendLang = layout === "ru_jcuken" ? "ru" : layout === "ko_dubeolsik" ? "ko" : layout === "zh_pinyin" ? "en" : "zh-Hant";

  const pic = h("div.kb-pic", { role: "img", "aria-label": "Keyboard picture" });
  const draw = () => {
    pic.replaceChildren();
    els.clear();
    ROWS.forEach((row, r) => {
      const rowEl = h("div.kb-row", { style: { "--indent": String(INDENT[r]) } });
      for (const key of row) {
        const typed = layout === "ko_dubeolsik" && shift && /[qwertop]/.test(key) ? key.toUpperCase() : key;
        const leg = legendOf(key);
        const n = counts.get(typed) || 0;
        const el = h("span.kb-key", {
          class: `kb-key${leg ? "" : " unused"}${n ? " used" : ""}${layout === "zh_daqian" && DAQIAN_TONES.has(key) ? " tone" : ""}`,
        }, h("span.us", { lang: "en" }, typed === key ? key : `⇧${key.toUpperCase()}`),
        leg ? h("span.sym", { lang: legendLang }, leg) : null,
        n ? h("span.cnt", String(n)) : null);
        els.set(typed, el);
        rowEl.append(el);
      }
      pic.append(rowEl);
    });
  };
  draw();
  const parts = [pic];
  if (layout === "ko_dubeolsik") {
    const box = h("input", { type: "checkbox" });
    box.addEventListener("change", () => { shift = box.checked; draw(); });
    parts.unshift(h("label.kb-shift", box, " Shift"));
  }
  if (layout === "zh_pinyin") parts.push(h("p.kb-note", "Tone digits: 1 ˉ · 2 ˊ · 3 ˇ · 4 ˋ · 5 neutral"));
  if (layout === "zh_daqian") parts.push(h("p.kb-note", "Tone keys: 6 ˊ · 3 ˇ · 4 ˋ · 7 ˙; the first tone types nothing."));
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
