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
