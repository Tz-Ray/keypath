// Encode/decode parity with keypath 2.2.0 on the generated corpus
// (tests/fixtures/vectors.jsonl.gz, written by tools/build_data.py): the
// site's examples, the cipher project's round-trip corpora and golden
// vectors, seeded fuzz strings per live surface, and edge cases.
import test from "node:test";
import assert from "node:assert/strict";
import { engine, readJsonl } from "./helpers.js";

const vectors = readJsonl("tests/fixtures/vectors.jsonl.gz");

test("the corpus covers every class and live surface", () => {
  const classes = new Set(vectors.map(v => v.class));
  for (const c of ["site", "golden-shape", "corpus-zh", "corpus-ko", "corpus-ru", "corpus-es", "corpus-en",
    "fuzz-zh", "fuzz-ko", "fuzz-ru", "fuzz-es", "fuzz-en-id", "fuzz-en-x", "fuzz-en-oov", "edge"])
    assert.ok(classes.has(c), c);
  const surfaces = new Set(vectors.filter(v => !v.jsRefusal && !v.expect.error).map(v => v.surface));
  assert.equal(surfaces.size, 10);
  assert.ok(vectors.length > 10000, `${vectors.length} vectors`);
  // every live surface has fuzz, and Cangjie and Quick the zh corpus and the en one
  for (const sid of ["zh_cangjie", "zh_quick"])
    for (const c of ["corpus-zh", "corpus-en", "fuzz-zh", "fuzz-en-x", "golden-shape"])
      assert.ok(vectors.some(v => v.class === c && v.surface === sid), `${c} on ${sid}`);
});

const byClass = new Map();
for (const v of vectors) {
  if (!byClass.has(v.class)) byClass.set(v.class, []);
  byClass.get(v.class).push(v);
}

for (const [cls, group] of byClass) {
  test(`encode + decode parity: ${cls} (${group.length})`, async () => {
    const e = await engine();
    let checked = 0;
    for (const v of group) {
      const where = `${v.id} ${JSON.stringify(v.text)} ${v.source} -> ${v.surface}`;
      const r = await e.encode({ text: v.text, source: v.source, surface: v.surface });
      if (v.jsRefusal) {
        assert.equal(r.ok, false, where);
        assert.equal(r.reason, v.jsRefusal[0], where);
        if (v.jsRefusal[0] === "unknownWords") assert.deepEqual(r.words, v.jsRefusal[1], where);
        if (v.jsRefusal[0] === "newerUnicode") assert.equal(r.codePoint, v.jsRefusal[1], where);
        checked++;
        continue;
      }
      if (v.expect.error) {
        assert.equal(r.ok, false, where);
        checked++;
        continue;
      }
      assert.equal(r.ok, true, `${where}: ${JSON.stringify(r)}`);
      assert.equal(r.ciphertext, v.expect.ciphertext, where);
      assert.equal(r.keyText, v.expect.keyText, where);
      assert.deepEqual(r.leak, v.expect.leak, where);
      assert.equal(r.leak[1] ? r.leak[0] / r.leak[1] : 0, v.expect.leakage, where);
      assert.equal(r.text, v.expect.decoded, where);
      // walk back the expected ciphertext with the expected key
      const d = await e.decode({ ciphertext: v.expect.ciphertext, keyText: v.expect.keyText });
      assert.equal(d.ok, true, `${where}: ${JSON.stringify(d)}`);
      assert.equal(d.text, v.expect.decoded, where);
      assert.equal(d.keyText, v.expect.keyText, where);
      checked++;
    }
    assert.equal(checked, group.length);
  });
}
