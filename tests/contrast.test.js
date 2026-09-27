// Colour contrast of the design tokens in both themes, and static
// accessibility rules for index.html (SPEC §9.2, §11.7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.js";
import { parseHtml, elements, ancestors, textOf } from "./html.js";

const css = readFileSync(join(ROOT, "assets/css/site.css"), "utf8");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}
const block = (re) => { const m = re.exec(css); assert.ok(m, `block ${re}`); return m[1]; };
const light = tokens(block(/:root \{([\s\S]*?)\n\}/));
const darkMedia = tokens(block(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/));
const darkAttr = tokens(block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/));

const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const TEXT = ["ink", "ink-2", "keys", "choice", "hop", "literal"];
const SEGS = ["zh_daqian", "zh_pinyin", "zh_hanja", "ja_romaji", "ko_dubeolsik", "ru_jcuken", "es_accent", "en_identity"].map(s => `seg-${s}`);

test("both dark-theme blocks define the same tokens", () => {
  assert.deepEqual(darkMedia, darkAttr);
  assert.deepEqual(Object.keys(darkMedia).sort(), Object.keys(light).sort());
});

for (const [name, t] of [["light", light], ["dark", darkMedia]]) {
  test(`${name}: text tokens reach 4.5:1 on every surface`, () => {
    for (const fg of [...TEXT, ...SEGS]) {
      for (const bg of ["bg", "surface", "surface-2"]) {
        const r = ratio(t[fg], t[bg]);
        assert.ok(r >= 4.5, `--${fg} on --${bg}: ${r.toFixed(2)}`);
      }
    }
    // ink on the chosen-tile fill
    assert.ok(ratio(t.ink, t["choice-fill"]) >= 4.5);
  });
  test(`${name}: connectors and the focus ring reach 3:1`, () => {
    for (const fg of ["line", "focus"]) assert.ok(ratio(t[fg], t.bg) >= 3, `--${fg}: ${ratio(t[fg], t.bg).toFixed(2)}`);
  });
}

test("reduced motion switches every animation and transition off", () => {
  const m = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(m);
  assert.match(m[1], /animation: none !important/);
  assert.match(m[1], /transition: none !important/);
  assert.match(m[1], /\.motion-only \{ display: none !important; \}/);
});

const doc = parseHtml(readFileSync(join(ROOT, "index.html"), "utf8"));
const els = elements(doc);

test("one h1, and heading levels never skip", () => {
  const hs = els.filter(e => /^h[1-6]$/.test(e.tag)).map(e => Number(e.tag[1]));
  assert.equal(hs.filter(l => l === 1).length, 1);
  assert.equal(hs[0], 1);
  for (let i = 1; i < hs.length; i++) assert.ok(hs[i] <= hs[i - 1] + 1, `h${hs[i - 1]} then h${hs[i]}`);
});

test("every form control has a label", () => {
  const labelFor = new Set(els.filter(e => e.tag === "label" && e.attrs.for).map(e => e.attrs.for));
  const controls = els.filter(e => ["input", "select", "textarea"].includes(e.tag));
  assert.ok(controls.length >= 12);
  for (const c of controls) {
    const ok = (c.attrs.id && labelFor.has(c.attrs.id)) || ancestors(c).some(a => a.tag === "label") || c.attrs["aria-label"];
    assert.ok(ok, `unlabelled <${c.tag} id=${c.attrs.id}>`);
  }
});

test("decorative svg is hidden from assistive technology; buttons have names", () => {
  for (const s of els.filter(e => e.tag === "svg")) assert.equal(s.attrs["aria-hidden"], "true");
  for (const b of els.filter(e => e.tag === "button")) assert.ok(textOf(b).trim() || b.attrs["aria-label"], "unnamed button");
});

test("native-script text carries a lang tag", () => {
  const nativeRe = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}㄀-ㄯ]/u;
  for (const n of [...function* w(x) { yield x; for (const c of x.children || []) yield* w(c); }(doc)]) {
    if (n.text === undefined || n.raw || !nativeRe.test(n.text)) continue;
    const tagged = ancestors(n).find(a => a.attrs && a.attrs.lang);
    assert.ok(tagged && tagged.attrs.lang !== "en", `untagged native text: ${n.text.trim().slice(0, 40)}`);
  }
});
