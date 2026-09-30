// Python 3.11 (Unicode 14) and this JS runtime must normalize identically
// on everything the Unicode-14 guard lets through.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readJson } from "./helpers.js";
import { FINAL_SIGMA_RANGES, normalize, pyLower } from "../assets/js/engine/normalize.js";
import { makeUnicodeGuard, cpCompare, cpLength, formatCodePoint } from "../assets/js/engine/unicode.js";

const fixture = readJson("tests/fixtures/unicode.json");
const ranges = readJson("data/unicode14.json");

test("lowercase agrees with Python on every Unicode-14 code point that changes", () => {
  assert.equal(fixture.lower.length, 1433);
  const bad = fixture.lower.filter(([cp, low]) => pyLower(String.fromCodePoint(cp)) !== low);
  assert.deepEqual(bad, []);
});

test("every other Unicode-14 code point lowercases to itself, as in Python", () => {
  const changes = new Set(fixture.lower.map(([cp]) => cp));
  const bad = [];
  for (const [first, last] of ranges)
    for (let cp = first; cp <= last; cp++) {
      if (changes.has(cp)) continue;
      const ch = String.fromCodePoint(cp);
      if (pyLower(ch) !== ch) bad.push(cp);
    }
  assert.deepEqual(bad, []);
});

test("lowercase agrees in context (final sigma, dotted I)", () => {
  for (const [s, low] of fixture.lowerStrings) assert.equal(pyLower(s), low, s);
  // Unicode 16.0 changed these two: ʕ is cased and U+1171E case-ignorable in 14.0
  assert.equal(pyLower("ΑʕΣ ΑΣʕ Α\u{1171e}Σ ΑΣ\u{1171e}Α"), "αʕς ασʕ α\u{1171e}ς ασ\u{1171e}α");
  assert.equal(normalize("ΟΔΟΣʕ ΑΣ\u{1171e}Α", "el"), "οδοσʕ ασ\u{1171e}α");
});

// docs/10 §3.2: Final_Sigma results are part of the contract whenever every
// code point around a Σ is assigned in Unicode 14.0
test("Final_Sigma reads Unicode 14.0's Case_Ignorable and Cased, as Python 3.11 does", () => {
  const want = fixture.finalSigma;
  assert.deepEqual(FINAL_SIGMA_RANGES.caseIgnorable, want.caseIgnorable);
  assert.deepEqual(FINAL_SIGMA_RANGES.cased, want.cased);
});

test("Final_Sigma agrees with Python around every Unicode-14 code point", () => {
  const { contexts, count, finals, sha256 } = fixture.finalSigma;
  assert.deepEqual(contexts, ["Α{}Σ", "ΑΣ{}", "ΑΣ{}Α", "{}Σ", "{}ΣΑ"]);
  const hash = createHash("sha256");
  const got = contexts.map(() => 0);
  let n = 0;
  for (const [first, last] of ranges)
    for (let cp = first; cp <= last; cp++) {
      const ch = String.fromCodePoint(cp);
      const lowered = contexts.map(ctx => pyLower(ctx.split("{}").join(ch)));
      lowered.forEach((low, i) => { if (low.includes("ς")) got[i]++; });
      hash.update(`${cp.toString(16)}\t${lowered.join("\t")}\n`, "utf8");
      n++;
    }
  assert.deepEqual([n, got], [count, finals]);
  assert.equal(hash.digest("hex"), sha256);
});

test("NFC agrees with Python on the samples", () => {
  for (const [s, nfc] of fixture.samples) assert.equal(s.normalize("NFC"), nfc, s);
});

test("normalize: NFC, lowercase only en/es/ru, collapse space runs only", () => {
  assert.equal(normalize("Hello  World", "en"), "hello world");
  assert.equal(normalize("ЁЛКА   и", "ru"), "ёлка и");
  assert.equal(normalize("Ａ  Ｂ", "zh"), "Ａ Ｂ");
  assert.equal(normalize("a\t\tb\n\nc", "en"), "a\t\tb\n\nc");
  assert.equal(normalize("É", "es"), "é");
  assert.equal(normalize("ÀB", "ko"), "ÀB");
});

test("the Unicode-14 guard", () => {
  const firstNewer = makeUnicodeGuard(ranges);
  assert.equal(ranges.length, 698);
  assert.equal(firstNewer("welcome home 你好 한국어 😀"), null);
  assert.equal(firstNewer("a\u{31350}b"), 0x31350);        // CJK Ext H, Unicode 15
  assert.equal(firstNewer("x\ud800"), 0xd800);              // lone surrogate
  assert.equal(firstNewer("\udc00"), 0xdc00);
  assert.equal(firstNewer("\u{e0000}"), 0xe0000);           // unassigned
  assert.equal(firstNewer("﷐"), 0xfdd0);               // noncharacter (Cn)
  assert.equal(firstNewer("\u{f0000}"), null);              // private use is assigned
  assert.equal(formatCodePoint(0x31350), "U+31350");
  assert.equal(formatCodePoint(0xd800), "U+D800");
});

test("code-point helpers", () => {
  assert.equal(cpLength("a😀𠀀"), 3);
  const words = ["￿", "😀", "a", "𠀀", ""];
  assert.deepEqual(words.sort(cpCompare), ["a", "", "￿", "😀", "𠀀"]);
  assert.equal(cpCompare("ab", "a"), 1);
  assert.equal(cpCompare("", ""), 0);
});
