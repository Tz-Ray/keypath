// Greek (docs/10 §3.2, §7.1, §7.3, §9.7): the page's Windows Greek keyboard
// (E and D with the dead-key rule), written from the specification, against
// what KeyPath's Python implementation computes: a digest of every letter's
// keys, the verdict (and the rejection text) on every short chunk, the word
// class, normalization (Final_Sigma and the second NFC), detection, and the
// refusals: keys that translate out of Greek (the page never ships the
// el→en lists), inline keys and malformed dead-key units.  Encode and decode
// parity on the goldens, the corpus and fuzz strings is
// tests/vectors.test.js's; the walks are tests/traces.test.js's.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { engine, readJson, readJsonl } from "./helpers.js";
import { cpCompare } from "../assets/js/engine/unicode.js";
import { LayoutError } from "../assets/js/engine/layouts.js";
import { LOWERCASE_LANGUAGES, LOWER_OVERRIDES, RECOMPOSED_LANGUAGES, normalize } from "../assets/js/engine/normalize.js";
import * as kp1 from "../assets/js/engine/kp1.js";

const digests = readJson("tests/fixtures/digests.json");
const registry = readJson("data/registry.json");
const layoutsJson = readJson("data/layouts.json");
const fixture = readJson("tests/fixtures/el.json");
const vectors = readJsonl("tests/fixtures/vectors.jsonl.gz");
const sha = text => createHash("sha256").update(text, "utf8").digest("hex");

// docs/10 §3.2, verbatim: α-ω (U+03B1-U+03C9, ς included) and the 11 accented letters
const LETTERS = [...Array.from({ length: 0x3c9 - 0x3b1 + 1 }, (_, i) => String.fromCodePoint(0x3b1 + i)), ..."άέήίόύώϊϋΐΰ"];
// docs/10 §7.1's table, verbatim
const TABLE = `α a  β b  γ g  δ d  ε e  ζ z  η h  θ u  ι i  κ k  λ l  μ m  ν n  ξ j  ο o  π p  ρ r
σ s  ς w  τ t  υ y  φ f  χ x  ψ c  ω v
ά ;a έ ;e ή ;h ί ;i ό ;o ύ ;y ώ ;v  ϊ :i ϋ :y  ΐ Wi ΰ Wy`;

const verdict = (fn, text) => {
  try { return `=${fn(text)}`; } catch (err) { if (err instanceof LayoutError) return `!${err.message}`; throw err; }
};

test("the table is docs/10 §7.1's, and E types every letter as the digest says (docs/10 §9.7 `el`)", async () => {
  const { layouts } = await engine();
  const pairs = TABLE.split(/\s+/).reduce((out, t, i, all) => (i % 2 ? out : [...out, [t, all[i + 1]]]), []);
  assert.deepEqual(layoutsJson.el_greek.letters, pairs);
  assert.deepEqual([...layouts.elLetterSet()].sort(cpCompare), [...LETTERS].sort(cpCompare));
  const lines = [];
  const seen = new Set();
  for (const letter of LETTERS) {
    const keys = layouts.elKeysForWord(letter);
    assert.equal(layouts.elWord(keys), letter, letter);
    assert.ok(!keys.includes("q"), letter);
    seen.add(keys);
    lines.push(`${letter}\t${keys}\n`);
  }
  assert.equal(seen.size, 36, "E is injective on the letters");
  assert.equal(lines.length, digests.elCount);
  assert.equal(sha(lines.sort(cpCompare).join("")), digests.el);
});

test("the verdict on every chunk of up to three keys is Python's, rejection texts included", async () => {
  const { layouts } = await engine();
  const want = digests.elChunks;
  const alphabet = registry.surfaces.el.el_greek.alphabet;
  assert.equal(alphabet, ":;Wabcdefghijklmnoprstuvwxyz");
  const symbols = [...new Set([...alphabet, ...want.extra])].sort(cpCompare);
  const hash = createHash("sha256");
  let count = 0, ok = 0;
  const visit = chunk => {
    const v = verdict(layouts.elWord, chunk);
    if (v[0] === "=") ok++;
    hash.update(`${chunk}\t${v}\n`);
    count++;
  };
  const walk = (prefix, n) => { if (!n) visit(prefix); else for (const k of symbols) walk(prefix + k, n - 1); };
  for (let n = 1; n <= want.maxLen; n++) walk("", n);
  assert.deepEqual([count, ok], [want.count, want.ok]);
  assert.equal(hash.digest("hex"), want.sha256);
});

test("docs/10 §7.1: the goldens, the dead-key rule and its rejection texts", async () => {
  const { layouts } = await engine();
  for (const [word, keys] of [["καλημέρα", "kalhm;era"], ["ευχαριστώ", "eyxarist;v"], ["θάλασσα", "u;alassa"],
    ["ωραίος", "vra;iow"], ["καΐκι", "kaWiki"], ["ψυχή", "cyx;h"], ["σκύλος", "sk;ylow"], ["προϊόν", "pro:i;on"], ["οδος", "odow"]]) {
    assert.equal(layouts.elKeysForWord(word), keys, word);
    assert.equal(layouts.elWord(keys), word, keys);
  }
  const rule = "on el_greek it must be followed by a vowel key it combines with";
  assert.throws(() => layouts.elWord("kal;b"),
    { message: `dead key ';' (΄) at position 3 of unit 'kal;b' is followed by 'b'; ${rule} (a e h i o y v)` });
  assert.throws(() => layouts.elWord("ab;"), { message: `dead key ';' (΄) at position 2 of unit 'ab;' ends the unit; ${rule} (a e h i o y v)` });
  assert.throws(() => layouts.elWord(":a"), { message: `dead key ':' (¨) at position 0 of unit ':a' is followed by 'a'; ${rule} (i y)` });
  assert.throws(() => layouts.elWord("W"), { message: `dead key 'W' (΅) at position 0 of unit 'W' ends the unit; ${rule} (i y)` });
  // a dead key never types a letter alone, and ;; is no letter
  assert.throws(() => layouts.elWord(";;a"), { message: `dead key ';' (΄) at position 0 of unit ';;a' is followed by ';'; ${rule} (a e h i o y v)` });
  assert.throws(() => layouts.elWord("q"), { message: "key 'q' types no letter on layout el_greek" });
  assert.throws(() => layouts.elWord(""), { message: "empty unit for el_greek" });
  assert.throws(() => layouts.elKeysForWord("ἀ"), { message: "'ἀ' is not one of the 36 Greek letters, so it is not typable on el_greek" });
  // the walk's letters: a dead key and its vowel under one letter
  assert.deepEqual(layouts.elLetters("pro:i;on").map(l => [l.letter, l.keys.map(k => k.key + (k.dead || "")).join(" ")]),
    [["π", "p"], ["ρ", "r"], ["ο", "o"], ["ϊ", ":¨ i"], ["ό", ";΄ o"], ["ν", "n"]]);
  // the legend, read from the table's two-key rows
  const legend = layouts.elLegend();
  assert.equal(legend.oneKey.size, 25);
  assert.ok(!legend.oneKey.has("q"));
  assert.deepEqual(legend.dead.map(([k, accent, vowels]) => [k, accent, vowels.map(([v]) => v).join("")]),
    [[";", "΄", "aehioyv"], [":", "¨", "iy"], ["W", "΅", "iy"]]);
});

test("the word class is docs/10 §3.2's 36 letters, and any Greek-script letter is detected as Greek", async () => {
  const e = await engine();
  const re = e._internal.native.TOKENIZERS.el;
  const words = cp => (String.fromCodePoint(cp).match(re) || []).length;
  const found = [];
  for (let cp = 0; cp < 0x3000; cp++) if (words(cp)) found.push(String.fromCodePoint(cp));
  assert.deepEqual(found.sort(cpCompare), [...LETTERS].sort(cpCompare));
  for (const ch of LETTERS) {
    assert.equal(e.detect(ch), "el", ch);
    assert.equal(e.detect(ch.toUpperCase()), "el", ch.toUpperCase());
  }
  // polytonic and archaic Greek letters are Greek too (they ride as literals)
  for (const text of ["\u1f08θ\u1fc6ναι", "ϐ", "ϴ", "hello κόσμε", "¿qué? λ"]) assert.equal(e.detect(text), "el", text);
  // Greek punctuation alone is no letter; the micro sign is not Greek script
  for (const text of ["\u037e", "\u0387", "\u0375", "\u00b5"]) assert.notEqual(e.detect(text), "el", text);
});

test("normalization: lowercase on whole strings (Final_Sigma), then NFC again for el (docs/10 §3.2)", () => {
  assert.equal(LOWER_OVERRIDES.size, 0, "a per-code-point lowercase would break Final_Sigma");
  assert.deepEqual([...LOWERCASE_LANGUAGES].sort(), registry.lowercaseLanguages);
  assert.deepEqual([...RECOMPOSED_LANGUAGES].sort(), registry.recomposedLanguages);
  assert.equal(["ΟΔΟΣ", "ΣΟΦΟΣ", "Α.Σ.", "ΑΣ1"].map(t => normalize(t, "el")).join(" "), "οδος σοφος α.ς. ας1");
  assert.equal(normalize("ΚΑ\u03aa\u0301ΚΙ", "el"), "καΐκι");
  assert.equal(normalize("ΚΑ\u03aa\u0301ΚΙ", "el"), "κα\u0390κι");
  assert.equal(normalize("\u03ab\u0301", "el"), "\u03b0");
  // the second NFC is el's alone
  assert.equal(normalize("\u03aa\u0301", "ru"), "\u03ca\u0301");
  assert.equal(normalize("\u03aa\u0301", "vi"), "\u03ca\u0301");
  assert.equal(normalize("Καλημέρα   Κόσμε", "el"), "καλημέρα κόσμε");
  // Python's normalize of the normalization fixtures, the corpus and the goldens
  assert.ok(fixture.normalize.length >= 30);
  for (const [text, want] of fixture.normalize) assert.equal(normalize(text, "el"), want, JSON.stringify(text));
  // Final_Sigma fixtures use only code points assigned in Unicode 14.0 (ASCII
  // or Greek and Coptic, whose assignments predate it)
  const ranges = readJson("data/unicode14.json");
  const assigned = cp => ranges.some(([a, b]) => cp >= a && cp <= b);
  for (const [text] of fixture.normalize.filter(([t]) => t.includes("Σ")))
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      assert.ok(cp < 0x80 || (cp >= 0x370 && cp <= 0x3ff && assigned(cp)), `${text}: U+${cp.toString(16)}`);
    }
  // idempotent over every el fixture
  const texts = [...fixture.normalize.map(([t]) => t), ...vectors.filter(v => v.source === "el").map(v => v.text)];
  assert.ok(texts.length > 400);
  for (const t of texts) assert.equal(normalize(normalize(t, "el"), "el"), normalize(t, "el"), JSON.stringify(t));
});

test("English onto Greek: docs/10 §7.3's goldens, with the en>el records and list sizes", async () => {
  const e = await engine();
  for (const [text, ciphertext, index, count, word] of [["cat", "g;ata", 1, 2, "γάτα"], ["sea", "u;alassa", 0, 1, "θάλασσα"],
    ["friend", "f;ilow", 0, 3, "φίλος"]]) {
    const r = await e.encode({ text, source: "en", surface: "el_greek" });
    assert.equal(r.ciphertext, ciphertext, text);
    const w = r.trace.segments[0].words[0];
    assert.deepEqual(w.chain, [{ lang: "el", word, index, count }], text);
    assert.deepEqual(w.units, [{ keys: ciphertext, at: 0, reading: word, count: 1, head: [word], index: null, selected: null, out: word }]);
  }
  const hero = await e.encode({ text: "welcome home", source: "en", surface: "el_greek" });
  assert.equal(hero.ciphertext, "kalvs;orismasp;iti");
  // native Greek, >= 2 words, with punctuation as literals
  const n = await e.encode({ text: "Καλημέρα, η θάλασσα είναι ωραία.", source: "el", surface: "el_greek" });
  assert.equal(n.text, "καλημέρα, η θάλασσα είναι ωραία.");
  assert.deepEqual(n.trace.segments[0].words.map(w => w.literal ?? w.source), ["καλημέρα", ", ", "η", "θάλασσα", "είναι", "ωραία", "."]);
  assert.equal(n.ciphertext, "kalhm;erahu;alassae;inaivra;ia");
});

test("a Greek `;` next to a Dàqiān `;` walks back (docs/10 §10 M17)", async () => {
  const e = await engine();
  const t = readJsonl("tests/fixtures/traces.jsonl.gz").find(x => x.ciphertext === "ej;;hliow");
  assert.ok(t, "the light sun trace");
  const r = await e.decode({ ciphertext: t.ciphertext, keyText: t.keyText });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.text, "light sun");
  assert.deepEqual(r.trace.segments.map(s => [s.surface, s.words.flatMap(w => (w.units || []).map(u => u.keys))]),
    [["zh_daqian", ["ej;"]], ["el_greek", [";hliow"]]]);
});

test("refusals: keys out of Greek (never shipped), from other sources, inline, malformed dead-key units", async () => {
  const e = await engine();
  // el→en, el→en→X, and a message whose first segment goes out of Greek:
  // Python decodes them; the page refuses them, and says why
  assert.ok(fixture.outward.length >= 4 && fixture.outward.some(o => o.ciphertext === "ej;;otan"));
  const outward = [...fixture.outward, ...vectors.filter(v => v.class === "route" && v.source === "el" && v.expect.keyText)
    .map(v => ({ id: v.id, ciphertext: v.expect.ciphertext, keyText: v.expect.keyText, decoded: v.expect.decoded }))];
  assert.ok(outward.length >= 8);
  for (const o of outward) {
    assert.ok(o.keyText.includes('"translate:el>en"'), o.id);
    const r = await e.decode({ ciphertext: o.ciphertext, keyText: o.keyText });
    assert.deepEqual([r.ok, r.reason], [false, "notCarried"], `${o.id}: ${JSON.stringify(r)}`);
    assert.equal(r.message, "the Greek-to-English lists of translate:el>en", o.id);
    // as a short key too
    const packed = e.kp1Pack(o.keyText);
    assert.equal(packed.ok, true, o.id);
    const s = await e.decode({ ciphertext: o.ciphertext, keyText: packed.text });
    assert.deepEqual([s.ok, s.reason], [false, "notCarried"], o.id);
  }
  // encoding out of Greek, or into it from anything but English, is off
  for (const [text, source, surface] of [["θάλασσα", "el", "en_identity"], ["θάλασσα", "el", "zh_daqian"],
    ["кошка", "ru", "el_greek"], ["el gato", "es", "el_greek"], ["海", "zh", "el_greek"], ["tôi", "vi", "el_greek"]])
    assert.equal((await e.encode({ text, source, surface })).reason, "routeOff", `${source} -> ${surface}`);
  // tampered Greek keys (tests/decode-errors.test.js refuses all of them): the dead-key units say so
  const tampered = readJsonl("tests/fixtures/decode-errors.jsonl.gz").filter(c => c.id.startsWith("el-"));
  const kinds = new Set(tampered.map(c => c.id.replace(/-\d+$/, "")));
  for (const k of ["el-inline", "el-index", "el-old-edition", "el-route-tail", "el-dead-key-0", "el-dead-key-1", "el-dead-key-2",
    "el-dead-key-3", "el-hop-index-range"]) assert.ok(kinds.has(k), k);
  for (const c of tampered) {
    const r = await e.decode({ ciphertext: c.ciphertext, keyText: c.keyText });
    assert.deepEqual([r.ok, r.reason], [false, "keyInvalid"], `${c.id}: ${JSON.stringify(r)}`);
    if (/^el-dead-key-[012]-/.test(c.id)) assert.match(r.message, /^malformed unit .*: dead key '[;:W]' \([΄¨΅]\) at position \d+ of unit /, c.id);
    if (c.id.startsWith("el-dead-key-3-")) assert.match(r.message, /outside the el_greek alphabet/, c.id);
    if (c.id.startsWith("el-inline-")) assert.match(r.message, /"inline" is not a selector mode of \(el, el_greek\)/, c.id);
  }
});

test("kp1: Greek keys pack as Python packs them, unpack to the same key and decode", async () => {
  const e = await engine();
  const rows = new Map(readJsonl("tests/fixtures/kp1-keys.jsonl.gz").map(r => [r.id, r.kp1]));
  const greek = vectors.filter(v => v.surface === "el_greek" && !v.jsRefusal && v.expect.keyText);
  assert.ok(greek.length > 800, `${greek.length}`);
  let n = 0;
  for (const v of greek) {
    if (!rows.has(v.id)) continue;   // a key text already listed under another vector
    const packed = e.kp1Pack(v.expect.keyText);
    assert.deepEqual(packed, { ok: true, text: rows.get(v.id) }, v.id);
    const back = e.kp1Unpack(packed.text);
    assert.equal(back.keyText, v.expect.keyText, v.id);
    n++;
  }
  assert.ok(n > 750, `${n}`);
  const v = greek.find(x => x.class === "golden-el" && x.text === "cat");
  const r = await e.decode({ ciphertext: v.expect.ciphertext, keyText: e.kp1Pack(v.expect.keyText).text });
  assert.deepEqual([r.ok, r.text, r.compact !== null], [true, "cat", true]);
  // an inline Greek key has no kp1 form the page reads: the flag reads, the key is refused
  const inline = readJson("tests/fixtures/kp1.json").inlineRefused.filter(g => g.keyText.includes('"el_greek"'));
  assert.equal(inline.length, 2);
  for (const g of inline) assert.throws(() => kp1.unpack(g.kp1, registry), /selector mode/, g.why);
});
