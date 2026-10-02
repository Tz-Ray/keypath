// Spoiler guard (SPEC §11.4): nothing the page shows before a reveal gives
// away a challenge; for challenges 7-12 (docs/10 §10 M18) neither the cards
// nor their hints, which the page fetches one per click.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJson } from "./helpers.js";
import { parseHtml, shownTexts, jsStrings } from "./html.js";
import { GRID_LAYOUTS } from "../assets/js/ui/keyboard.js";

const S = readJson("tests/fixtures/static.json");
const hero = readJson("data/hero.json");
const pad = n => String(n).padStart(2, "0");
const index = readJson("data/challenges/index.json");
const challenges = index.map(c => readJson(`data/challenges/${pad(c.n)}.json`));
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const textJs = readFileSync(join(ROOT, "assets/js/ui/text.js"), "utf8");
// What the page shows, as opposed to its source: index.html's text nodes
// (no comment, script or style), text.js's string literals (no comment) and
// the legends the keyboard pictures draw (tests/fixtures/legends.json, which
// keyboard.test.js holds to data/layouts.json), not every field of that file.
const htmlShown = shownTexts(parseHtml(html)).join("\n");
const textJsShown = jsStrings(textJs).join("\n");
const legendsShown = [...GRID_LAYOUTS].flatMap(l => Object.values(readJson("tests/fixtures/legends.json").layouts[l])).join("\n");
// what a card shows before any click: its title, blurb and keyboards line
const cardText = c => [c.title, c.blurb, c.keyboards || ""].join("\n");
const hintsOf = c => Array.from({ length: c.hints || 0 }, (_, i) => readJson(`data/challenges/hints/${pad(c.n)}-${i + 1}.json`));

// Curated content (SPEC §11.4): the hero default, the example chips, the
// how-it-works figures and the mixed strip.
const curated = [
  { text: hero.text, ciphertext: hero.ciphertext },
  ...S.chips.map(c => ({ text: c.text, ciphertext: c.ciphertext })),
  { text: S.step1.source + " " + S.step1.target, ciphertext: S.step3.keys.join("") },
  { text: S.step2.head.join(""), ciphertext: "" },
  { text: S.strip.text, ciphertext: S.strip.ciphertext },
];

const words = t => (t.toLowerCase().match(/[\p{Script=Latin}\p{Script=Cyrillic}]{4,}/gu) || []);
const bigrams = t => {
  const out = new Set();
  const cs = Array.from(t);
  for (let i = 0; i + 1 < cs.length; i++) {
    if (/[\p{Script=Han}\p{Script=Hangul}]/u.test(cs[i]) && /[\p{Script=Han}\p{Script=Hangul}]/u.test(cs[i + 1])) out.add(cs[i] + cs[i + 1]);
  }
  return out;
};

test("the challenge data is the published set", () => {
  assert.equal(challenges.length, 12);
  for (const [i, c] of challenges.entries()) assert.equal(index[i].ciphertext, c.ciphertext);
});

test("no curated ciphertext shares 5 characters with a challenge", () => {
  for (const c of curated) {
    const cs = c.ciphertext;
    for (let i = 0; i + 5 <= cs.length; i++) {
      const sub = cs.slice(i, i + 5);
      for (const ch of challenges) assert.ok(!ch.ciphertext.includes(sub), `"${sub}" (${c.text}) is in a challenge ciphertext`);
    }
  }
});

test("no curated message shares a word or a CJK bigram with a challenge answer", () => {
  for (const c of curated) {
    for (const ch of challenges) {
      const answerWords = new Set(words(ch.plaintext));
      for (const w of words(c.text)) assert.ok(!answerWords.has(w), `"${w}" appears in a challenge answer`);
      const answerBigrams = bigrams(ch.plaintext);
      for (const b of bigrams(c.text)) assert.ok(!answerBigrams.has(b), `"${b}" appears in a challenge answer`);
    }
  }
});

test("the page's shown text leaves out comments, attributes, scripts and a script's comments", () => {
  const page = '<p title="甲">乙<!-- 丙 --><script>const x = "丁";</script><style>b::after{content:"戊"}</style>己</p>';
  assert.equal(shownTexts(parseHtml(page)).join(""), "乙己");
  const js = 'const a = "甲"; // "乙"\n/* 丙 */ const b = `丁${c ? "戊" : `己`}庚`; const r = /[辛"]/u; const d = e / 2 / f;';
  assert.deepEqual(jsStrings(js), ["甲", "丁", "戊", "己", "庚"]);
  // text.js's one comment in Han (a popover title's example) is not a string it writes
  assert.ok(textJs.includes("廿土弓人") && !textJsShown.includes("廿土弓人"));
});

// A character the page itself shows is not answer-only: the text index.html
// shows, text.js's strings, the legends the keyboard pictures draw and the
// cards' own strings (above; never a comment, an attribute or a script).  The
// Cangjie chip's 倉, the legends 人 心 ㅋ and 金 of #7's card are such
// characters.  An answer-only character is then checked against the raw
// files, so one in a comment or an attribute still fails.
test("no challenge answer, or character only a challenge answer uses, is on the page or in the fallback fonts", () => {
  const curatedChars = new Set([...curated.flatMap(c => Array.from(c.text)), ...Array.from(JSON.stringify(hero)),
    ...htmlShown, ...textJsShown, ...legendsShown, ...index.flatMap(c => Array.from(cardText(c)))]);
  const exclusive = new Set();
  for (const ch of challenges) {
    for (const c of ch.plaintext) if (/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c) && !curatedChars.has(c)) exclusive.add(c);
  }
  const heroText = JSON.stringify(hero);
  for (const ch of challenges) {
    assert.ok(!html.includes(ch.plaintext), "a challenge answer is in index.html");
    assert.ok(!heroText.includes(ch.plaintext), "a challenge answer is in hero.json");
    assert.ok(!textJs.includes(ch.plaintext), "a challenge answer is in text.js");
    assert.ok(!index.some(c => cardText(c).includes(ch.plaintext)), "a challenge answer is on a card");
  }
  assert.ok(exclusive.size > 20, exclusive.size);
  const ranges = readJson("fonts/ranges.json");
  const inFont = cp => Object.entries(ranges).filter(([k]) => k.endsWith(".woff2")).some(([, spec]) => spec.split(",").some(r => {
    const [a, b = a] = r.trim().replace(/^U\+/, "").split("-");
    return cp >= parseInt(a, 16) && cp <= parseInt(b, 16);
  }));
  for (const c of exclusive) {
    assert.ok(!html.includes(c), `answer-only character ${c} in index.html`);
    assert.ok(!textJs.includes(c), `answer-only character ${c} in text.js`);
    assert.ok(!heroText.includes(c), `answer-only character ${c} in hero.json`);
    const cp = c.codePointAt(0);
    // Hangul jamo and syllables of the fallback font's range are generic; Han characters are not
    if (/\p{Script=Han}/u.test(c)) assert.ok(!inFont(cp), `answer-only character ${c} is in a fallback font`);
  }
});

// docs/10 §9.7: a #walk link carries the key, so it spoils its message; the
// page says so where it makes one and where it opens one, and never makes
// one for a challenge.
test("walk links say that anyone with the link can read the message", async () => {
  const { T } = await import("../assets/js/ui/text.js");
  const said = /anyone with the link can read the message/i;
  const panel = html.slice(html.indexOf('<details id="key-panel"'), html.indexOf("</details>", html.indexOf('<details id="key-panel"')));
  assert.ok(panel.includes('id="copy-walk"'), "the walk link control is in the key panel");
  assert.match(panel.replace(/<[^>]+>/g, ""), said, "the key panel says who can read a walk link");
  assert.match(T.walkOpened, said, "a page opened from a walk link says it too");
  assert.match(T.walkLinkCopied, said, "and so does the copy confirmation");
  assert.doesNotMatch(`${T.walkOpened} ${T.walkLinkCopied}`, /secret|hidden|safe/i);
  // the challenges offer no walk link: a revealed walk stays on its card
  const challengesJs = readFileSync(join(ROOT, "assets/js/ui/challenges.js"), "utf8");
  assert.doesNotMatch(challengesJs, /#walk|walkBody|walkLinkOf|kp1/);
});

// docs/10 §10 M18's spoiler rule (KeyPath's scripts/check_spoilers.py): a
// text leaks a 07-12 answer when it holds 4 or more consecutive characters
// of one of its CJK runs, one of its words of 6 or more letters, or 3 or
// more of its tokens in a row (a CJK run counts as one token).  Tokens are
// read after NFC and case folding (lowercase, ς as σ, ß as ss): maximal runs
// of Han, kana or Hangul, and maximal runs of Latin, Cyrillic or Greek
// letters.
const CJK_RANGES = [[0x1100, 0x11FF], [0x2E80, 0x2FDF], [0x3005, 0x3005], [0x3007, 0x3007], [0x3021, 0x3029],
  [0x3038, 0x303B], [0x3040, 0x30FF], [0x3130, 0x318F], [0x31F0, 0x31FF], [0x3400, 0x4DBF], [0x4E00, 0x9FFF],
  [0xA960, 0xA97F], [0xAC00, 0xD7FF], [0xF900, 0xFAFF], [0xFF66, 0xFF9F], [0xFFA0, 0xFFDC], [0x1AFF0, 0x1B16F],
  [0x20000, 0x3FFFF]];
const isCjk = ch => CJK_RANGES.some(([a, b]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= b);
const isLetter = ch => /\p{L}/u.test(ch) && /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u.test(ch);
function ruleTokens(text) {
  const t = Array.from(text.normalize("NFC").toLowerCase().replace(/ς/g, "σ").replace(/ß/g, "ss"));
  const out = [];
  for (let i = 0; i < t.length;) {
    const kind = isCjk(t[i]) ? "cjk" : isLetter(t[i]) ? "word" : null;
    if (!kind) { i++; continue; }
    let j = i + 1;
    while (j < t.length && (kind === "cjk" ? isCjk(t[j]) : isLetter(t[j]))) j++;
    out.push({ kind, text: t.slice(i, j).join("") });
    i = j;
  }
  return out;
}
/** The longest common run of `a` and `b` (arrays), by length. */
function longestCommon(a, b, eq = (x, y) => x === y) {
  let best = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      let n = 0;
      while (i + n < a.length && j + n < b.length && eq(a[i + n], b[j + n])) n++;
      best = Math.max(best, n);
    }
  return best;
}
function leaks(text, plaintext) {
  const mine = ruleTokens(text), theirs = ruleTokens(plaintext);
  const found = [];
  for (const m of mine.filter(t => t.kind === "cjk"))
    for (const r of theirs.filter(t => t.kind === "cjk"))
      if (longestCommon(Array.from(m.text), Array.from(r.text)) >= 4) found.push(`CJK run in ${m.text}`);
  const words = new Set(theirs.filter(t => t.kind === "word" && Array.from(t.text).length >= 6).map(t => t.text));
  for (const m of mine) if (m.kind === "word" && words.has(m.text)) found.push(`word ${m.text}`);
  if (longestCommon(mine, theirs, (x, y) => x.kind === y.kind && x.text === y.text) >= 3) found.push("three words in a row");
  return found;
}

test("the spoiler rule catches a leak and passes an innocent line", () => {
  const plain = "一二三四五 the quick brown fox";
  assert.ok(leaks("x 二三四五 y", plain).length);
  assert.ok(leaks("QUICK BROWN FOX", plain).length);
  assert.ok(leaks("a brown hat", plain).length === 0);
  assert.ok(leaks("the quick", plain).length === 0);
});

test("no card, no hint and nothing the page shows gives away an answer of 7-12 (docs/10 §10 M18's rule)", () => {
  const pack = index.filter(c => c.n >= 7).map(c => [c.n, challenges[c.n - 1].plaintext]);
  assert.equal(pack.length, 6);
  const texts = [...index.map(c => [`card #${c.n}`, cardText(c)]),
    ...index.flatMap(c => hintsOf(c).map((hint, i) => [`hint ${i + 1} of #${c.n}`, hint])),
    ["index.html's text", htmlShown], ["text.js's strings", textJsShown]];
  assert.equal(texts.length, 12 + 18 + 2);
  for (const [what, text] of texts)
    for (const [n, plain] of pack) assert.deepEqual(leaks(text, plain), [], `${what} and the answer of #${n}`);
});

test("the card data holds no hint and no answer: hints are fetched one per click", () => {
  const raw = readFileSync(join(ROOT, "data/challenges/index.json"), "utf8");
  for (const c of index) {
    assert.deepEqual(Object.keys(c), ["n", "difficulty", "title", "blurb", "keyboards", "ciphertext", "hash", "fold",
      ...(c.alts ? ["alts"] : []), ...(c.altFolds ? ["altFolds"] : []), ...(c.n >= 7 ? ["hints"] : [])], `#${c.n}`);
    assert.equal(c.hints ?? 0, c.n >= 7 ? 3 : 0);
    for (const hint of hintsOf(c)) {
      assert.ok(hint.length > 20 && !raw.includes(hint), `#${c.n}: a hint is in index.json`);
      assert.ok(!html.includes(hint) && !textJs.includes(hint), `#${c.n}: a hint is in the page`);
    }
    assert.ok(!raw.includes(challenges[c.n - 1].plaintext), `#${c.n}: its answer is in index.json`);
  }
  // the card script names a hint's file only where a click asks for it
  const js = readFileSync(join(ROOT, "assets/js/ui/challenges.js"), "utf8");
  assert.equal(js.match(/HINT_FILE\(/g).length, 1);
  const click = js.slice(js.indexOf('btn.addEventListener("click"'), js.indexOf("return h(\"div.hints\""));
  assert.match(click, /HINT_FILE\(c\.n, shown \+ 1\)/);
});
