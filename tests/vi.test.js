// Vietnamese (docs/10 §3.2, §6, §9.7): the page's syllable grammar G, its
// canonical keystrokes E and its decode D, written from the specification,
// against what KeyPath's Python implementation computes: an exhaustive
// digest over G (every syllable with its Telex and VNI keys), the verdict on
// every short chunk and on chunks near G, the word class, detection and the
// keyboard legend read from the tables.  Encode and decode parity on the
// goldens, the corpus and fuzz strings is tests/vectors.test.js's.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { engine, readJson, readJsonl } from "./helpers.js";
import { cpCompare } from "../assets/js/engine/unicode.js";
import { LOWERCASE_LANGUAGES, LOWER_OVERRIDES, normalize } from "../assets/js/engine/normalize.js";
import { viLegendModel } from "../assets/js/ui/keyboard.js";

const digests = readJson("tests/fixtures/digests.json");
const registry = readJson("data/registry.json");
const layoutsJson = readJson("data/layouts.json");
const VI = ["vi_telex", "vi_vni"];
const sha = text => createHash("sha256").update(text).digest("hex");

// docs/10 §3.2, verbatim: the 67 letters besides a-z
const NON_ASCII = "àáảãạ ăằắẳẵặ âầấẩẫậ đ èéẻẽẹ êềếểễệ ìíỉĩị òóỏõọ ôồốổỗộ ơờớởỡợ ùúủũụ ưừứửữự ỳýỷỹỵ".replace(/ /g, "");

test("G: 111,003 syllables; E is injective on both keyboards and D inverts it; the digest is Python's", async () => {
  const { layouts } = await engine();
  const G = layouts.viGrammar();
  assert.equal(G.size, 111003);
  assert.equal(G.size, digests.viCount);
  const lines = [];
  const seen = { vi_telex: new Set(), vi_vni: new Set() };
  for (const t of G) {
    const keys = VI.map(l => layouts.viKeys(l, t));
    VI.forEach((l, i) => {
      seen[l].add(keys[i]);
      assert.equal(layouts.viSyllable(l, keys[i]), t, `${l}: D(E(${t}))`);
    });
    lines.push(`${t}\t${keys.join("\t")}\n`);
  }
  for (const l of VI) assert.equal(seen[l].size, G.size, `E is injective on ${l}`);
  assert.equal(sha(lines.sort(cpCompare).join("")), digests.vi, "docs/10 §9.7 vi digest");
});

test("the verdict on every chunk up to 4 keys (Telex) and 3 keys (VNI) is Python's", async () => {
  const { layouts } = await engine();
  for (const layout of VI) {
    const want = digests.viChunks[layout];
    const alphabet = Array.from(registry.surfaces.vi[layout].alphabet);
    const hash = createHash("sha256");
    let count = 0, units = 0;
    const visit = chunk => {
      let verdict;
      try { verdict = `=${layouts.viSyllable(layout, chunk)}`; units++; } catch (e) { verdict = `!${e.message}`; }
      hash.update(`${chunk}\t${verdict}\n`);
      count++;
    };
    // length, then alphabet order (the alphabet is sorted by code point)
    const walk = (prefix, n) => { if (!n) visit(prefix); else for (const k of alphabet) walk(prefix + k, n - 1); };
    for (let n = 1; n <= want.maxLen; n++) walk("", n);
    assert.deepEqual([count, units], [want.count, want.wellFormed], layout);
    assert.equal(hash.digest("hex"), want.sha256, layout);
  }
});

test("chunks near G (a key inserted, dropped, doubled or swapped; two syllables run together) read as Python reads them", async () => {
  const { layouts } = await engine();
  const chunks = readJsonl("tests/fixtures/vi-chunks.jsonl.gz");
  assert.ok(chunks.length > 10000 && chunks.some(c => c.verdict[0] === "=") && chunks.some(c => c.verdict[0] === "!"));
  for (const { layout, chunk, verdict } of chunks) {
    let got;
    try { got = `=${layouts.viSyllable(layout, chunk)}`; } catch (e) { got = `!${e.message}`; }
    assert.equal(got, verdict, `${layout} ${chunk}`);
  }
});

test("docs/10 §6.3-§6.4, §8.2: E, D and the rejection texts", async () => {
  const { layouts } = await engine();
  const E = (l, t) => layouts.viKeys(l, t);
  for (const [t, telex, vni] of [["việt", "vieejt", "vie65t"], ["người", "nguwowfi", "ngu7o72i"], ["đường", "dduwowfng", "d9u7o72ng"],
    ["hòa", "hofa", "ho2a"], ["hoà", "hoaf", "hoa2"], ["thủy", "thury", "thu3y"], ["thuỷ", "thuyr", "thuy3"]]) {
    assert.equal(E("vi_telex", t), telex, t);
    assert.equal(E("vi_vni", t), vni, t);
  }
  // D reads a chunk, not only E's; its text rejects keys that are no syllable
  assert.equal(layouts.viDecode("vi_telex", "xoong"), "xông");
  assert.throws(() => layouts.viSyllable("vi_telex", "vieetj"),
    { message: "D(vieetj) = viêtj is not a syllable of G; canonical Telex types a vowel's tone key right after that vowel and its modifier key (e.g. việt = vieejt)" });
  assert.throws(() => layouts.viSyllable("vi_vni", "vie55"),
    { message: "key '5' at position 4 cannot follow 'vie5' (VNI: a digit must follow the letter it marks)" });
  assert.throws(() => layouts.viSyllable("vi_vni", "5a"), { message: "key '5' at position 0 cannot follow '' (VNI: a digit must follow the letter it marks)" });
  assert.throws(() => layouts.viSyllable("vi_telex", ""), { message: "empty unit for vi_telex" });
  // canonical Telex has no undo escape, no mark re-placement and no lone w
  for (const chunk of ["xooong", "vieetj", "w", "hoaf" + "f", "cat"]) assert.throws(() => layouts.viSyllable("vi_telex", chunk), chunk);
  assert.equal(layouts.viSyllable("vi_telex", "uow"), "uơ");
  // the walk's letters: each over its base, modifier and tone keys
  assert.deepEqual(layouts.viLetters("vi_telex", "vieejt").map(l => [l.letter, l.keys.map(k => `${k.key}:${k.shows}`).join(" ")]),
    [["v", "v:"], ["i", "i:"], ["ệ", "e: e:ê j:ệ"], ["t", "t:"]]);
  assert.deepEqual(layouts.viLetters("vi_vni", "vie65t").map(l => l.keys.map(k => k.role)), [["letter"], ["letter"], ["letter", "modifier", "tone"], ["letter"]]);
});

test("the word class is docs/10 §3.2's 93 letters, and detection takes the 62 Spanish does not share", async () => {
  const e = await engine();
  const letters = e.layouts.viLetterSet("vi_telex");
  assert.deepEqual([...letters].sort(cpCompare), [..."abcdefghijklmnopqrstuvwxyz", ...NON_ASCII].sort(cpCompare));
  assert.deepEqual(e.layouts.viLetterSet("vi_vni").sort(cpCompare), [...letters].sort(cpCompare));
  const only = [...NON_ASCII].filter(ch => !"áéíóú".includes(ch));
  assert.equal(only.length, 62);
  for (const ch of only) {
    assert.equal(e.detect(ch), "vi", ch);
    assert.equal(e.detect(ch.toUpperCase()), "vi", ch.toUpperCase());
  }
  for (const ch of "áéíóú") assert.equal(e.detect(ch), "es", ch);
  assert.equal(e.detect("tôi có gì"), "vi");
  assert.equal(e.detect("có"), "es");
  assert.equal(e.detect("xin chao"), "en");
});

test("normalization: vi is lowercased (docs/10 §3.2), whole strings only, idempotent over the vi fixtures", () => {
  assert.deepEqual([...LOWERCASE_LANGUAGES].sort(), registry.lowercaseLanguages);
  assert.ok(registry.lowercaseLanguages.includes("vi") && registry.spacedLanguages.includes("vi"));
  assert.equal(LOWER_OVERRIDES.size, 0, "a per-code-point lowercase would break Final_Sigma");
  assert.equal(normalize("VIỆT   Nam", "vi"), "việt nam");
  assert.equal(normalize("việt", "vi"), "việt");
  const texts = readJsonl("tests/fixtures/vectors.jsonl.gz").filter(v => v.source === "vi").map(v => v.text);
  assert.ok(texts.length > 800);
  for (const t of texts) assert.equal(normalize(normalize(t, "vi"), "vi"), normalize(t, "vi"), JSON.stringify(t));
});

test("the Telex and VNI keyboard legend is read from the tables (docs/10 §6.1)", async () => {
  const { layouts } = await engine();
  for (const layout of VI) {
    const m = viLegendModel(layouts, layout, [[layouts.viKeys(layout, "việt")], [layouts.viKeys(layout, "đường")]]);
    const table = layoutsJson[layout];
    assert.deepEqual(m.modifiers.map(x => [x.letter, x.keys]), table.letters);
    assert.deepEqual(m.tones.map(x => [x.name, x.key]), table.tones);
    assert.deepEqual(m.tones.map(x => x.example), ["á", "à", "ả", "ã", "ạ"]);
    // việt uses ê and nặng; đường uses đ, ư, ơ and huyền
    assert.deepEqual(m.modifiers.filter(x => x.used).map(x => x.letter), ["ê", "ơ", "ư", "đ"], layout);
    assert.deepEqual(m.tones.filter(x => x.used).map(x => x.name), ["huyền", "nặng"], layout);
    assert.deepEqual(m.placement.map(([, k]) => k), layout === "vi_telex" ? ["hofa", "hoaf"] : ["ho2a", "hoa2"]);
  }
  // §6.1's table, as the build wrote it
  assert.deepEqual(layoutsJson.vi_telex.letters.map(([, k]) => k).join(" "), "aa aw ee oo ow uw dd");
  assert.deepEqual(layoutsJson.vi_telex.tones.map(([, k]) => k).join(" "), "s f r x j");
  assert.deepEqual(layoutsJson.vi_vni.letters.map(([, k]) => k).join(" "), "a6 a8 e6 o6 o7 u7 d9");
  assert.deepEqual(layoutsJson.vi_vni.tones.map(([, k]) => k).join(" "), "1 2 3 4 5");
});

test("vi walks: one unit per syllable, a letter's keys as its legend, and literals for text outside G", async () => {
  const e = await engine();
  const r = await e.encode({ text: "the cat sat on the mat", source: "vi", surface: "vi_telex" });
  assert.equal(r.ciphertext, "theonthe");
  assert.deepEqual(r.leak, [13, 22]);
  assert.deepEqual(r.trace.segments[0].words.map(w => w.literal ?? w.source), ["the", " cat sat ", "on", "the", " mat"]);
  const v = await e.encode({ text: "Việt Nam", source: "vi", surface: "vi_vni" });
  assert.equal(v.ciphertext, "vie65tnam");
  const unit = v.trace.segments[0].words[0].units[0];
  assert.deepEqual(unit, { keys: "vie65t", at: 0, reading: "việt", count: 1, head: ["việt"], index: null, selected: null, out: "việt" });
  const x = await e.encode({ text: "xoong is of", source: "vi", surface: "vi_telex" });
  assert.deepEqual([x.ciphertext, x.leak], ["", [11, 11]]);
  // no hop leaves or reaches vi
  assert.equal((await e.encode({ text: "hello", source: "en", surface: "vi_telex" })).reason, "routeOff");
  assert.equal((await e.encode({ text: "xin chào", source: "vi", surface: "zh_daqian" })).reason, "routeOff");
});
