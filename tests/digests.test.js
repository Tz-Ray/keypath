// Exhaustive parity on the engine's internal encoders, compared through
// sha256 digests of line dumps that tools/build_data.py writes from Python:
// every zh phrase and character on all five zh surfaces, every reading's
// keys, every Cangjie and Quick code with its index, every Dubeolsik unit,
// every hanja's primary reading and every English row of every translated
// surface (Quick's derived from Cangjie's).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { freshEngine, readJson } from "./helpers.js";
import { cpCompare } from "../assets/js/engine/unicode.js";

const digests = readJson("tests/fixtures/digests.json");
const sha = s => createHash("sha256").update(s, "utf8").digest("hex");
const mismatch = (what, lines) => `${what} differs; the JS side's first lines:\n${lines.slice(0, 5).join("")}`;

test("zh: every phrase and character on zh_daqian, zh_pinyin and zh_hanja", async () => {
  const e = await freshEngine();
  const { native } = e._internal;
  await Promise.all([native.loadZhCore(), native.loadHanjaCore(), native.loadAllShards()]);
  const words = new Set([...native.phrases.keys(), ...native.zhState().readings.keys()]);
  const sorted = [...words].sort(cpCompare);
  const fmt = r => (r === null ? ["-", "-", "-"]
    : [r[1], r[0].map(u => u.len).join(","), r[0].map(u => u.homophone_index).join(",")]);
  const shards = Array.from({ length: 256 }, () => []);
  for (const w of sorted) {
    const d = fmt(native.encodeZhWord(w, "zh_daqian"));
    const p = fmt(native.encodeZhWord(w, "zh_pinyin"));
    const h = fmt(native.encodeZhWord(w, "zh_hanja"));
    assert.equal(d[2], p[2], w);
    shards[w.codePointAt(0) & 0xff].push([w, d[0], d[1], p[0], p[1], d[2], h[0], h[1], h[2]].join("\t") + "\n");
  }
  assert.equal(sorted.length, digests.zhCount);
  shards.forEach((lines, i) => {
    const id = i.toString(16).padStart(2, "0");
    assert.equal(sha(lines.join("")), digests.zh[id], mismatch(`zh shard ${id}`, lines));
  });
});

test("zh: every phrase and character on zh_cangjie and zh_quick", async () => {
  const e = await freshEngine();
  const { native } = e._internal;
  await Promise.all([native.loadZhCore(), native.loadAllShards(), native.loadAllShapes()]);
  const words = [...new Set([...native.phrases.keys(), ...native.zhState().readings.keys()])].sort(cpCompare);
  const fmt = r => (r === null ? ["-", "-", "-"]
    : [r[1], r[0].map(u => u.len).join(","), r[0].map(u => u.homophone_index).join(",")]);
  const shards = Array.from({ length: 256 }, () => []);
  for (const w of words) {
    const c = fmt(native.encodeZhWord(w, "zh_cangjie"));
    const q = fmt(native.encodeZhWord(w, "zh_quick"));
    shards[w.codePointAt(0) & 0xff].push([w, ...c, ...q].join("\t") + "\n");
  }
  shards.forEach((lines, i) => {
    const id = i.toString(16).padStart(2, "0");
    assert.equal(sha(lines.join("")), digests.zhShape[id], mismatch(`zhShape shard ${id}`, lines));
  });
});

test("every Cangjie and Quick code: char, code, index (docs/10 §9.7)", async () => {
  const e = await freshEngine();
  const { native } = e._internal;
  await native.loadAllShapes();
  for (const [name, table] of [["cangjie", native.cangjieState()], ["quick", native.quickState()]]) {
    const lines = [];
    for (const [code, chars] of table.lists) chars.forEach((ch, i) => lines.push(`${ch}\t${code}\t${i}\n`));
    lines.sort(cpCompare);
    assert.equal(lines.length, digests[`${name}Count`], name);
    assert.equal(sha(lines.join("")), digests[name], mismatch(name, lines));
  }
  // the two cover the same characters, and each one's Quick code is the rule's
  const cj = native.cangjieState(), q = native.quickState();
  assert.equal(cj.codeOf.size, q.codeOf.size);
  for (const [ch, code] of cj.codeOf) assert.equal(q.codeOf.get(ch), e.layouts.quickOf(code), ch);
});

test("every reading's Dàqiān and Pinyin keys", async () => {
  const e = await freshEngine();
  const zh = await e._internal.native.loadZhCore();
  const lines = [...zh.lists.keys()].sort(cpCompare)
    .map(r => `${r}\t${e.layouts.daqianKeys(r)}\t${e.layouts.pinyinKeys(r)}\n`);
  assert.equal(lines.length, 1412);
  assert.equal(sha(lines.join("")), digests.readings, mismatch("readings", lines));
});

test("every Dubeolsik unit's keys", async () => {
  const e = await freshEngine();
  const lines = [...e.layouts.koUnits()].map(([u, k]) => `${u}\t${k}\n`);
  assert.equal(lines.length, 11223);
  assert.equal(sha(lines.join("")), digests.ko, mismatch("ko", lines));
  for (const [u, k] of e.layouts.koUnits()) assert.equal(e.layouts.koUnit(k), u);
});

test("every hanja's primary reading", async () => {
  const e = await freshEngine();
  const hanja = await e._internal.native.loadHanjaCore();
  const lines = [...hanja.primary.keys()].sort(cpCompare).map(c => `${c}\t${hanja.primary.get(c)}\n`);
  assert.equal(lines.length, 27552);
  assert.equal(sha(lines.join("")), digests.hanjaPrimary, mismatch("hanjaPrimary", lines));
});

for (const sid of Object.keys(digests.rows)) {
  test(`every English row on ${sid}`, async () => {
    const e = await freshEngine();
    const { english } = e._internal;
    const letters = [..."abcdefghijklmnopqrstuvwxyz"];
    await Promise.all(letters.flatMap(l => [english.loadVocab(l), english.loadRows(sid, l)]));
    const vocab = letters.flatMap(l => [...english.vocab.get(l)]).sort(cpCompare);
    assert.equal(vocab.length, 10000);
    const lines = vocab.map(w => {
      const row = english.rowOf(sid, w);
      if (!row) return `${w}\t-\t-\n`;
      const [entry, keys] = english.entryOf(sid, row);
      return `${w}\t${JSON.stringify(entry)}\t${keys}\n`;
    });
    assert.equal(sha(lines.join("")), digests.rows[sid], mismatch(`rows ${sid}`, lines));
  });
}
