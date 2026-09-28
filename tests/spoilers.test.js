// Spoiler guard (SPEC §11.4): nothing the page shows before a reveal gives
// away a challenge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJson } from "./helpers.js";

const S = readJson("tests/fixtures/static.json");
const hero = readJson("data/hero.json");
const challenges = [1, 2, 3, 4, 5, 6].map(n => readJson(`data/challenges/0${n}.json`));
const index = readJson("data/challenges/index.json");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

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
  assert.equal(challenges.length, 6);
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

test("no challenge answer, or character only a challenge answer uses, is on the page or in the fallback fonts", () => {
  const curatedChars = new Set([...curated.flatMap(c => Array.from(c.text)), ...Array.from(JSON.stringify(hero))]);
  const exclusive = new Set();
  for (const ch of challenges) {
    for (const c of ch.plaintext) if (/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c) && !curatedChars.has(c)) exclusive.add(c);
  }
  const heroText = JSON.stringify(hero);
  for (const ch of challenges) {
    assert.ok(!html.includes(ch.plaintext), "a challenge answer is in index.html");
    assert.ok(!heroText.includes(ch.plaintext), "a challenge answer is in hero.json");
  }
  const ranges = readJson("fonts/ranges.json");
  const inFont = cp => Object.entries(ranges).filter(([k]) => k.endsWith(".woff2")).some(([, spec]) => spec.split(",").some(r => {
    const [a, b = a] = r.trim().replace(/^U\+/, "").split("-");
    return cp >= parseInt(a, 16) && cp <= parseInt(b, 16);
  }));
  for (const c of exclusive) {
    assert.ok(!html.includes(c), `answer-only character ${c} in index.html`);
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
