// The fallback glyph fonts: size budget, license, and no character that
// only a challenge answer contains (a font's character map is public).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJson, readJsonl } from "./helpers.js";
import { parseHtml, shownTexts, jsStrings } from "./html.js";
import { GRID_LAYOUTS } from "../assets/js/ui/keyboard.js";

const ranges = readJson("fonts/ranges.json");
const size = f => readFileSync(join(ROOT, "fonts", f)).length;
const parse = text => text.split(", ").map(r => r.slice(2).split("-").map(h => parseInt(h, 16)))
  .map(([a, b = a]) => [a, b]);
const covers = (list, cp) => list.some(([a, b]) => cp >= a && cp <= b);
const cards = readJson("data/challenges/index.json");

test("font budget: each at most 70 KB, both at most 90 KB", () => {
  assert.ok(size("glyphs-tc.woff2") <= 70 * 1024);
  assert.ok(size("glyphs-kr.woff2") <= 70 * 1024);
  assert.ok(size("glyphs-tc.woff2") + size("glyphs-kr.woff2") <= 90 * 1024);
});

test("the fonts ship with the OFL and their copyright notice", () => {
  const ofl = readFileSync(join(ROOT, "fonts/OFL.txt"), "utf8");
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(ofl, /Adobe/);
  assert.equal(ranges.family, "KeyPath Glyphs");
});

test("the fonts cover the hero's characters and Bopomofo", () => {
  const tc = parse(ranges["glyphs-tc.woff2"]);
  const hero = readJson("data/hero.json");
  for (const ch of Object.values(hero.lists).join("") + "ㄅㄆㄇㄈˊˇˋ˙") assert.ok(covers(tc, ch.codePointAt(0)), ch);
  const kr = parse(ranges["glyphs-kr.woff2"]);
  for (const ch of "ㄱㅋㅣ한국") assert.ok(covers(kr, ch.codePointAt(0)), ch);
});

test("no character found only in challenge answers is in a font", () => {
  const all = [...parse(ranges["glyphs-tc.woff2"]), ...parse(ranges["glyphs-kr.woff2"])];
  const siteIds = new Set(readJsonl("tests/fixtures/vectors.jsonl.gz").filter(v => v.class === "site").map(v => v.id));
  const curated = new Set([
    readFileSync(join(ROOT, "data/hero.json"), "utf8"),
    readFileSync(join(ROOT, "data/layouts.json"), "utf8"),
    ...readJsonl("tests/fixtures/traces.jsonl.gz").filter(t => siteIds.has(t.id)).map(t => JSON.stringify(t.trace)),
    ...["index.html", "assets/js/ui/text.js"].map(f => { try { return readFileSync(join(ROOT, f), "utf8"); } catch { return ""; } }),
    ...cards.map(c => [c.title, c.blurb, c.keyboards || ""].join("")),
  ].join(""));
  assert.equal(cards.length, 12);
  for (const { n } of cards) {
    for (const ch of readJson(`data/challenges/${String(n).padStart(2, "0")}.json`).plaintext) {
      if (curated.has(ch)) continue;
      assert.ok(!covers(all, ch.codePointAt(0)), `challenge ${n}: ${ch}`);
    }
  }
});

test("the fonts cover every CJK character the page's own text and cards show", () => {
  const all = [...parse(ranges["glyphs-tc.woff2"]), ...parse(ranges["glyphs-kr.woff2"])];
  const cjk = /[ぁ-ゖㄅ-ㄯㄱ-ㆎ㐀-䶿一-鿿가-힣]/u;
  for (const f of ["index.html", "assets/js/ui/text.js"])
    for (const ch of new Set(readFileSync(join(ROOT, f), "utf8")))
      if (cjk.test(ch)) assert.ok(covers(all, ch.codePointAt(0)), `${f}: ${ch}`);
  let n = 0;
  for (const c of cards)
    for (const ch of [c.title, c.blurb, c.keyboards || ""].join(""))
      if (cjk.test(ch)) { n++; assert.ok(covers(all, ch.codePointAt(0)), `card #${c.n}: ${ch}`); }
  assert.ok(n >= 9, n);   // 日月金木水火土 (#7) and 易經 (#10)
});

// tools/build_fonts.py takes every CJK character of the raw index.html and
// text.js, comments included; each must be text the page shows (or a legend
// a keyboard picture draws), so no hidden character reaches a font.
test("every CJK character the fonts take from index.html and text.js is shown", () => {
  const cjk = /[ぁ-ゖㄅ-ㄯㄱ-ㆎ㐀-䶿一-鿿가-힣]/u;
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const textJs = readFileSync(join(ROOT, "assets/js/ui/text.js"), "utf8");
  const legends = readJson("tests/fixtures/legends.json").layouts;
  const shown = new Set([...shownTexts(parseHtml(html)), ...jsStrings(textJs),
    ...[...GRID_LAYOUTS].flatMap(l => Object.values(legends[l]))].join(""));
  for (const [f, text] of [["index.html", html], ["assets/js/ui/text.js", textJs]])
    for (const ch of new Set(text))
      if (cjk.test(ch)) assert.ok(shown.has(ch), `${f}: ${ch} is in the source but not shown`);
});

// The hints of 7-12 show only when asked, and some hold an answer's
// characters: the fonts carry none that is not also shown before a click.
test("no character found only in the hints is in a font", () => {
  const all = [...parse(ranges["glyphs-tc.woff2"]), ...parse(ranges["glyphs-kr.woff2"])];
  const shown = new Set([readFileSync(join(ROOT, "data/hero.json"), "utf8"), readFileSync(join(ROOT, "data/layouts.json"), "utf8"),
    readFileSync(join(ROOT, "index.html"), "utf8"), readFileSync(join(ROOT, "assets/js/ui/text.js"), "utf8"),
    ...cards.map(c => [c.title, c.blurb, c.keyboards || ""].join("")),
    ...readJsonl("tests/fixtures/traces.jsonl.gz").filter(t => !t.id.startsWith("challenge-")).map(t => JSON.stringify(t.trace))].join(""));
  const pad = n => String(n).padStart(2, "0");
  for (const c of cards.filter(c => c.hints))
    for (let k = 1; k <= c.hints; k++)
      for (const ch of readJson(`data/challenges/hints/${pad(c.n)}-${k}.json`))
        if (/[\p{Script=Han}\p{Script=Hangul}]/u.test(ch) && !shown.has(ch))
          assert.ok(!covers(all, ch.codePointAt(0)), `hint ${k} of #${c.n}: ${ch}`);
});

test("the fonts cover every legend the keyboard pictures draw", async () => {
  const { GRID_LAYOUTS } = await import("../assets/js/ui/keyboard.js");
  const all = [...parse(ranges["glyphs-tc.woff2"]), ...parse(ranges["glyphs-kr.woff2"])];
  const legends = readJson("tests/fixtures/legends.json").layouts;
  const cjk = /[ˇˊˋ˙ぁ-ゖ゛゜ㄅ-ㄯㄱ-ㆎ㐀-䶿一-鿿]/u;
  let n = 0;
  for (const layout of GRID_LAYOUTS)
    for (const legend of Object.values(legends[layout]))
      for (const ch of legend) if (cjk.test(ch)) { n++; assert.ok(covers(all, ch.codePointAt(0)), `${layout}: ${ch}`); }
  assert.ok(n > 200, n);
});

test("site.css gives each font exactly the unicode-range of its subset", () => {
  const css = readFileSync(join(ROOT, "assets/css/site.css"), "utf8");
  const faces = [...css.matchAll(/@font-face \{([\s\S]*?)\}/g)].map(m => m[1]);
  assert.equal(faces.length, 2);
  for (const file of ["glyphs-tc.woff2", "glyphs-kr.woff2"]) {
    const face = faces.find(f => f.includes(`fonts/${file}`));
    assert.ok(face, file);
    assert.equal(face.match(/unicode-range: ([^;]*);/)[1], ranges[file], file);
  }
});
