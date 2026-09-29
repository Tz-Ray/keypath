// kp1, the compact key transport (docs/10 §2.2): the page's own codec
// (assets/js/engine/kp1.js) against fixtures the Python reference wrote —
// the goldens, the reject vectors, the accepted-but-refused strings, and
// Python's pack of every key in the other fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, engine, freshEngine, readJson, readJsonl } from "./helpers.js";
import * as kp1 from "../assets/js/engine/kp1.js";
import { KeyError, parseKeyJson, validateKey, checkKey, checkDecodable } from "../assets/js/engine/keycheck.js";
import { dumpsKey } from "../assets/js/engine/dumps.js";

const R = readJson("data/registry.json");
const F = readJson("tests/fixtures/kp1.json");
const rows = readJsonl("tests/fixtures/kp1-keys.jsonl.gz");
const keyTexts = {
  vectors: new Map(readJsonl("tests/fixtures/vectors.jsonl.gz").filter(v => v.expect && v.expect.keyText).map(v => [v.id, v.expect.keyText])),
  traces: new Map(readJsonl("tests/fixtures/traces.jsonl.gz").map(t => [t.id, t.keyText])),
  "decode-errors": new Map(readJsonl("tests/fixtures/decode-errors.jsonl.gz").map(t => [t.id, t.keyText])),
};
const throwsKey = (fn, what) => assert.throws(fn, e => e instanceof KeyError, what);

test("the goldens: kp1.jsonl's 8 lines in order, unpacked to their keys and packed back", () => {
  assert.deepEqual(F.accepted.map(g => g.source), [1, 2, 3, 4, 5, 6].map(n => `puzzles/challenge-0${n}/key.json`)
    .concat(["tests/golden/ko_mixed_message.json", "tests/golden/ru_mixed_message.json"]));
  assert.equal(F.accepted[0].kp1, "kp1.AQAujFMFrFIAAQAAAAEAAgcABwAIwvM");
  for (const g of F.accepted) {
    const key = kp1.unpack(g.kp1, R);
    assert.equal(dumpsKey(key), g.keyText, g.source);
    assert.equal(kp1.pack(parseKeyJson(g.keyText), R), g.kp1, g.source);
  }
});

test("the challenges' kp1 strings unpack to their key.json files byte for byte", () => {
  for (const g of F.accepted.filter(a => a.source.startsWith("puzzles/"))) {
    const file = readFileSync(join(ROOT, g.source), "utf8");
    assert.equal(dumpsKey(kp1.unpack(g.kp1, R)), file, g.source);
  }
});

test("every reject vector is refused with a KeyError", () => {
  assert.equal(F.rejected.length, 28);
  for (const g of F.rejected) throwsKey(() => kp1.unpack(g.kp1, R), g.why);
});

test("inline on a keyed-only surface: the flag reads, the key is refused (docs/10 §2.1, §5's t3)", () => {
  assert.deepEqual(F.inlineRefused.map(g => JSON.parse(g.keyText).segments[0].layout), ["ja_kana", "zh_eten", "zh_jyutping", "ja_kana"]);
  for (const g of F.inlineRefused) {
    throwsKey(() => kp1.unpack(g.kp1, R), g.why);
    // the same key as JSON fails the same check
    throwsKey(() => validateKey(parseKeyJson(g.keyText), R), g.why);
  }
});

test("accepted but refused: they unpack to Python's key JSON and pack back, and decode refuses them", async () => {
  assert.equal(F.refused.length, 4);
  const e = await engine();
  for (const g of F.refused) {
    const key = kp1.unpack(g.kp1, R);
    assert.equal(dumpsKey(key), g.keyText, g.kp1);
    assert.equal(kp1.pack(key, R), g.kp1);
    validateKey(key, R);
    // the first three fail decode's key checks; the fourth (a unit of 2^31-1
    // keys) fails on the ciphertext
    if (g !== F.refused[3]) assert.throws(() => checkDecodable(key, R), KeyError, g.kp1);
    else checkDecodable(key, R);
    for (const keyText of [g.kp1, `\n ${g.kp1}\t`, g.keyText]) {
      const r = await e.decode({ ciphertext: g.ciphertext, keyText });
      assert.equal(r.ok, false, `${g.kp1} decoded`);
      assert.equal(r.reason, "keyInvalid", `${g.kp1}: ${r.message}`);
    }
  }
});

test("JS kp1 equals Python kp1 for every fixture key, and unpacks each back to it", () => {
  assert.ok(rows.length > 9000, `${rows.length}`);
  let packed = 0, none = 0;
  for (const row of rows) {
    const text = keyTexts[row.fixture].get(row.id);
    assert.ok(text !== undefined, `${row.fixture} ${row.id}`);
    let key = null;
    try { key = parseKeyJson(text); } catch { key = null; }
    if (row.kp1 === null) {
      if (key !== null) throwsKey(() => kp1.pack(key, R), `${row.fixture} ${row.id} has no kp1 form`);
      none++;
      continue;
    }
    assert.equal(kp1.pack(key, R), row.kp1, `${row.fixture} ${row.id}`);
    assert.equal(dumpsKey(kp1.unpack(row.kp1, R)), dumpsKey(key), `${row.fixture} ${row.id}`);
    packed++;
  }
  assert.ok(packed > 9000 && none > 50, `${packed} packed, ${none} without a kp1 form`);
});

test("no kp1 form: a literal tier written as a float validates and decodes, and both packers refuse it", async () => {
  assert.deepEqual(F.noForm.map(g => g.why), ["a literal whose tier is the float 3.0", "a literal whose tier is the float 3e0"]);
  const e = await engine();
  for (const g of F.noForm) {
    const key = parseKeyJson(g.keyText);
    validateKey(key, R);
    checkKey(key, R);
    const r = await e.decode({ ciphertext: g.ciphertext, keyText: g.keyText });
    assert.deepEqual([r.ok, r.text], [true, g.decoded], g.why);
    assert.throws(() => kp1.pack(key, R), err => err instanceof KeyError && err.message.startsWith("no kp1 form"), g.why);
    const packed = e.kp1Pack(g.keyText);
    assert.equal(packed.ok, false, g.why);
    assert.match(packed.message, /^no kp1 form/, g.why);
  }
});

test("the engine decodes a kp1 key exactly as its JSON (the challenges on fresh engines)", async () => {
  for (const g of F.accepted.filter(a => a.source.startsWith("puzzles/"))) {
    const n = g.source.match(/challenge-(\d+)/)[1];
    const c = readJson(`data/challenges/${n}.json`);
    const e = await freshEngine();
    const r = await e.decode({ ciphertext: c.ciphertext, keyText: `  ${g.kp1}\n` });
    assert.equal(r.ok, true, `${g.source}: ${JSON.stringify(r)}`);
    assert.equal(r.text, c.plaintext);
    assert.equal(r.keyText, c.keyText);
    assert.equal(r.compact, g.kp1);
    const viaJson = await e.decode({ ciphertext: c.ciphertext, keyText: c.keyText });
    assert.deepStrictEqual(r.trace, viaJson.trace);
  }
});

test("kp1 in the engine: pack, unpack, auto-detection and refusals", async () => {
  const e = await engine();
  const hero = readJson("data/hero.json");
  const packed = e.kp1Pack(hero.keyText);
  assert.equal(packed.ok, true);
  assert.equal(e.kp1Pack(JSON.parse(hero.keyText)).text, packed.text);
  const back = e.kp1Unpack(packed.text);
  assert.deepEqual([back.ok, back.keyText], [true, hero.keyText]);
  assert.equal(e.isCompact(`\t${packed.text} `), true);
  assert.equal(e.isCompact(hero.keyText), false);
  // any case routes to the codec, which then insists on lowercase
  const upper = await e.decode({ ciphertext: hero.ciphertext, keyText: packed.text.replace("kp1.", "KP1.") });
  assert.deepEqual([upper.reason, upper.compact], ["keyInvalid", true]);
  // format pins the reading: kp1 text given as JSON is bad JSON, and JSON given as kp1 is no kp1
  assert.equal((await e.decode({ ciphertext: hero.ciphertext, keyText: packed.text, format: "json" })).reason, "badJson");
  assert.equal((await e.decode({ ciphertext: hero.ciphertext, keyText: hero.keyText, format: "kp1" })).reason, "keyInvalid");
  // only ASCII whitespace is trimmed (a no-break space is part of the text)
  assert.equal((await e.decode({ ciphertext: hero.ciphertext, keyText: ` ${packed.text}`, format: "kp1" })).ok, false);
  // an extra field has no kp1 form
  const extra = JSON.parse(hero.keyText);
  extra.note = "x";
  assert.equal(e.kp1Pack(extra).ok, false);
  const reordered = JSON.parse(hero.keyText);
  const { keypath, ...rest } = reordered;
  assert.equal(e.kp1Pack({ ...rest, keypath }).ok, false);
  const upperDigest = { ...JSON.parse(hero.keyText) };
  upperDigest.tables_sha256 = upperDigest.tables_sha256.toUpperCase();
  assert.equal(e.kp1Pack(upperDigest).ok, false);
});

test("two accepted digests sharing their first 6 bytes: unpack names both", () => {
  const a = "ab".repeat(6) + "0".repeat(52), b = "ab".repeat(6) + "1".repeat(52);
  const key = { ...parseKeyJson(F.accepted[0].keyText), tables_sha256: a };
  const s = kp1.pack(key, R, [a]);
  assert.equal(dumpsKey(kp1.unpack(s, R, [a])), dumpsKey(key));
  assert.throws(() => kp1.unpack(s, R, [a, b]), e => e instanceof KeyError && e.message.includes(a) && e.message.includes(b));
  assert.throws(() => kp1.unpack(s, R, []), KeyError);
});

test("varints: the full 0…2^32-1 range by arithmetic, and nothing past it", () => {
  const base = parseKeyJson(F.accepted[0].keyText);
  for (const [len, index] of [[1, 0], [63, 127], [64, 128], [2 ** 28, 2 ** 28 - 1], [2 ** 31 - 1, 2 ** 31], [2 ** 31 - 1, 2 ** 32 - 1]]) {
    const key = structuredClone(base);
    key.segments[0].words[0].units[0] = { len, homophone_index: index };
    const s = kp1.pack(key, R);
    assert.deepEqual(kp1.unpack(s, R).segments[0].words[0].units[0], { len, homophone_index: index });
  }
  for (const [len, index] of [[2 ** 31, 0], [1, 2 ** 32], [1, -1]]) {
    const key = structuredClone(base);
    key.segments[0].words[0].units[0] = { len, homophone_index: index };
    throwsKey(() => kp1.pack(key, R), `${len} ${index}`);
  }
});

test("hardening and canonical base64url", () => {
  const good = F.accepted[0].kp1;
  for (const bad of ["kp1.", "kp1", "", "kp1.A", `${good}A`, `${good}==`, `${good.slice(0, -1)}+`, `${good.slice(0, -1)}/`,
    `${good.slice(0, 10)}é${good.slice(11)}`, `${good.slice(0, 10)}\u{1F600}${good.slice(12)}`, ` ${good}`])
    throwsKey(() => kp1.unpack(bad, R), JSON.stringify(bad));
  // every single-bit flip of challenge-01's decoded bytes is refused
  const body = good.slice(4);
  const bytes = Buffer.from(body, "base64url");
  let flips = 0;
  for (let i = 0; i < bytes.length; i++) {
    for (let bit = 0; bit < 8; bit++) {
      const copy = Buffer.from(bytes);
      copy[i] ^= 2 ** bit;
      throwsKey(() => kp1.unpack(`kp1.${copy.toString("base64url")}`, R), `byte ${i} bit ${bit}`);
      flips++;
    }
  }
  assert.equal(flips, 184);
});

test("unpack ends in validateKey (the validate_key part of the split checkKey), never decode's checks", () => {
  const src = readFileSync(join(ROOT, "assets/js/engine/kp1.js"), "utf8");
  assert.match(src, /import \{[^}]*\bvalidateKey\b[^}]*\} from "\.\/keycheck\.js"/);
  assert.doesNotMatch(src, /\bcheckKey\b|\bcheckDecodable\b|atob|Buffer/);
  const ks = readFileSync(join(ROOT, "assets/js/engine/keycheck.js"), "utf8");
  const body = ks.slice(ks.indexOf("export function checkKey"));
  assert.match(body, /validateKey\(key, R\);\s*checkDecodable\(key, R\);/);
  // the validate_key rules reject before any table is read ...
  for (const why of ['a "1.0" key with source language ru fails validate_key', "homophone_index on a surface with no homophone layer",
    'a "1.0" key with a hop through ko'])
    throwsKey(() => kp1.unpack(F.rejected.find(g => g.why === why).kp1, R), why);
  // ... and the selector-mode rule of §2.1 is one of them
  const cangjie = parseKeyJson(readJsonl("tests/fixtures/decode-errors.jsonl.gz").find(c => c.id.startsWith("cangjie-inline-")).keyText);
  throwsKey(() => validateKey(cangjie, R));
  throwsKey(() => kp1.pack(cangjie, R));
  cangjie.segments[0].selector_mode = "keyed";
  validateKey(cangjie, R);
  checkKey(cangjie, R);
});

test("decode-error parity: a zh_cangjie (and a zh_quick) key with selector_mode inline is refused", async () => {
  const e = await engine();
  const cases = readJsonl("tests/fixtures/decode-errors.jsonl.gz").filter(c => /^(cangjie|quick)-inline-/.test(c.id));
  assert.deepEqual(cases.map(c => c.id.split("-")[0]), ["cangjie", "quick"]);
  for (const c of cases) {
    assert.equal(c.error, "KeyValidationError");
    const key = JSON.parse(c.keyText);
    assert.equal(key.segments[0].selector_mode, "inline");
    const r = await e.decode({ ciphertext: c.ciphertext, keyText: c.keyText });
    assert.deepEqual([r.ok, r.reason], [false, "keyInvalid"]);
    assert.match(r.message, /"inline" is not a selector mode/);
  }
});

test("a markup hint and literal stay text: the key packs, unpacks and decodes to Python's text", async () => {
  const e = await engine();
  const m = F.markup;
  assert.equal(kp1.pack(parseKeyJson(m.keyText), R), m.kp1);
  const r = await e.decode({ ciphertext: m.ciphertext, keyText: m.kp1 });
  assert.equal(r.ok, true);
  assert.equal(r.text, m.decoded);
  assert.equal(r.key.segments[0].hint, "<img src=x onerror=alert(1)>");
});

test("the registry's ordinal lists are the ones the codec reads", () => {
  assert.deepEqual(R.kp1Languages, ["zh", "ja", "es", "en", "ko", "ru", "vi"]);
  assert.equal(R.kp1Surfaces.length, 15);
  assert.deepEqual(R.kp1Surfaces.slice(10), [["vi", "vi_telex"], ["vi", "vi_vni"], ["zh", "zh_eten"], ["zh", "zh_jyutping"], ["ja", "ja_kana"]]);
  // integer arithmetic (docs/10 §2.2): no shift or bitwise and/or in the codec
  const src = readFileSync(join(ROOT, "assets/js/engine/kp1.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /<<|>>|[\w)\]]\s*[|&](?![|&=])\s*[\w(]/);
});
