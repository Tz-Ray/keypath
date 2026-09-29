// Encode/decode parity with keypath 2.4.0 on the generated corpus
// (tests/fixtures/vectors.jsonl.gz, written by tools/build_data.py): the
// site's examples, the cipher project's round-trip corpora and golden
// vectors, seeded fuzz strings per live surface, and edge cases.
import test from "node:test";
import assert from "node:assert/strict";
import { engine, readJsonl } from "./helpers.js";

const vectors = readJsonl("tests/fixtures/vectors.jsonl.gz");

test("the corpus covers every class and live surface", () => {
  const classes = new Set(vectors.map(v => v.class));
  for (const c of ["site", "golden-shape", "golden-vi", "golden-m16", "corpus-zh", "corpus-ko", "corpus-ru", "corpus-es", "corpus-en",
    "corpus-vi", "fuzz-zh", "fuzz-ko", "fuzz-ru", "fuzz-es", "fuzz-en-id", "fuzz-en-x", "fuzz-en-oov", "fuzz-vi", "route", "edge"])
    assert.ok(classes.has(c), c);
  const surfaces = new Set(vectors.filter(v => !v.jsRefusal && !v.expect.error).map(v => v.surface));
  assert.equal(surfaces.size, 15);
  // Vietnamese: the §6.6 goldens, the corpus, fuzz and edge cases on both keyboards
  for (const sid of ["vi_telex", "vi_vni"])
    for (const c of ["golden-vi", "corpus-vi", "fuzz-vi", "edge"])
      assert.ok(vectors.some(v => v.class === c && v.surface === sid && v.source === "vi" && !v.jsRefusal), `${c} on ${sid}`);
  // vi is native-only (docs/10 §6.5): Python raises for a route to or from it, the page refuses it
  const routes = vectors.filter(v => v.class === "route" && (v.source === "vi") !== v.surface.startsWith("vi_"));
  assert.ok(routes.length >= 4 && routes.every(v => v.expect.error === "EncodeError" && v.jsRefusal[0] === "routeOff"));
  assert.ok(vectors.length > 10000, `${vectors.length} vectors`);
  // every live surface has fuzz, and Cangjie and Quick the zh corpus and the en one
  for (const sid of ["zh_cangjie", "zh_quick"])
    for (const c of ["corpus-zh", "corpus-en", "fuzz-zh", "fuzz-en-x", "golden-shape"])
      assert.ok(vectors.some(v => v.class === c && v.surface === sid), `${c} on ${sid}`);
  // ETen and Jyutping: the docs/10 §4.3-§4.4 goldens, the zh corpus and the en one, and fuzz
  for (const sid of ["zh_eten", "zh_jyutping"])
    for (const c of ["corpus-zh", "corpus-en", "fuzz-zh", "fuzz-en-x", "golden-m16", "edge"])
      assert.ok(vectors.some(v => v.class === c && v.surface === sid && !v.jsRefusal), `${c} on ${sid}`);
  // JIS kana: typed from English on the page; Japanese text (the §5 goldens,
  // the ja corpus) is Python's alone, which the page refuses to type
  for (const c of ["corpus-en", "fuzz-en-x", "edge"])
    assert.ok(vectors.some(v => v.class === c && v.surface === "ja_kana" && !v.jsRefusal), `${c} on ja_kana`);
  for (const c of ["golden-m16", "corpus-ja"])
    assert.ok(vectors.some(v => v.class === c && v.surface === "ja_kana" && v.jsRefusal[0] === "jaSource"), `${c} on ja_kana`);
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
