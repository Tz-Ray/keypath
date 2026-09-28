// The generated data/ tree: integrity against data/manifest.json, the size
// budget for lazily loaded files, and the shapes the engine relies on.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { ROOT, readJson } from "./helpers.js";

const files = (dir) => readdirSync(dir).flatMap(name => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const dataFiles = files(join(ROOT, "data")).map(p => relative(ROOT, p).split("\\").join("/")).sort();
const manifest = readJson("data/manifest.json");

test("data/manifest.json lists every data file with its size and sha256", () => {
  assert.equal(manifest.keypath, "2.2.0");
  assert.equal(manifest.tag, "v2.2");
  assert.equal(manifest.edition, "be6aa0474bc67cec820d7ecf484678918415df21140ec57977883b7b40658732");
  assert.deepEqual(Object.keys(manifest.files).sort(), dataFiles.filter(f => f !== "data/manifest.json"));
  for (const [path, { bytes, sha256 }] of Object.entries(manifest.files)) {
    const buf = readFileSync(join(ROOT, path));
    assert.equal(buf.length, bytes, path);
    assert.equal(createHash("sha256").update(buf).digest("hex"), sha256, path);
  }
});

test("budget: every data file is at most 120 KB gzipped, data/ at most 4.5 MB raw", () => {
  let total = 0;
  for (const path of dataFiles) {
    const buf = readFileSync(join(ROOT, path));
    total += buf.length;
    const gz = gzipSync(buf, { level: 9 }).length;
    assert.ok(gz <= 120 * 1024, `${path}: ${gz} bytes gzipped`);
  }
  assert.ok(total <= 4.5 * 1024 * 1024, `data/ is ${total} bytes`);
});

test("first-view data (registry, layouts, unicode14, hero) stays small", () => {
  const first = ["data/registry.json", "data/layouts.json", "data/unicode14.json", "data/hero.json"];
  const gz = first.reduce((n, p) => n + gzipSync(readFileSync(join(ROOT, p)), { level: 9 }).length, 0);
  assert.ok(gz <= 20 * 1024, `${gz} bytes gzipped`);
});

test("shapes: 256 phrase shards, 26 vocabulary files, 26 row files per surface, 6 challenges", () => {
  assert.equal(dataFiles.filter(f => f.startsWith("data/zh/p/")).length, 256);
  assert.equal(dataFiles.filter(f => f.startsWith("data/en/vocab/")).length, 26);
  const reg = readJson("data/registry.json");
  // docs/10 §9.7: row files for every translated surface except the derived
  // ones (their rows are computed from their base surface's), none for those
  assert.deepEqual(reg.derivedRows, { zh_quick: "zh_cangjie" });
  const withFiles = reg.allowed.en.filter(s => s !== "en_identity" && !Object.hasOwn(reg.derivedRows, s));
  assert.equal(withFiles.length, 8);
  for (const sid of withFiles)
    assert.equal(dataFiles.filter(f => f.startsWith(`data/en/${sid}/`) && f.endsWith(".json")).length, 26, sid);
  for (const sid of Object.keys(reg.derivedRows)) {
    assert.ok(reg.allowed.en.includes(sid) && reg.allowed.en.includes(reg.derivedRows[sid]), sid);
    assert.equal(dataFiles.filter(f => f.startsWith(`data/en/${sid}/`)).length, 0, sid);
  }
  // Cangjie lists by first code letter (a-y; z is unused), Quick in one file
  assert.deepEqual(dataFiles.filter(f => f.startsWith("data/cangjie/") && f.endsWith(".json")),
    [..."abcdefghijklmnopqrstuvwxy"].map(l => `data/cangjie/${l}.json`));
  assert.ok(dataFiles.includes("data/quick.json"));
  const index = readJson("data/challenges/index.json");
  assert.deepEqual(index.map(c => c.n), [1, 2, 3, 4, 5, 6]);
  for (const c of index) assert.equal(readJson(`data/challenges/0${c.n}.json`).ciphertext, c.ciphertext);
  const vocab = dataFiles.filter(f => f.startsWith("data/en/vocab/")).flatMap(f => readJson(f));
  assert.equal(vocab.length, 10000);
  assert.ok(vocab.includes("welcome") && vocab.includes("home") && vocab.includes("alison"));
});

test("registry: kp1's ordinal lists equal kp1-ordinals.jsonl (docs/10 §2.2, §9.7)", () => {
  const reg = readJson("data/registry.json");
  const lines = readFileSync(join(ROOT, "tests/fixtures/kp1-ordinals.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  for (const [list, field] of [["languages", "kp1Languages"], ["surfaces", "kp1Surfaces"]]) {
    const rows = lines.filter(l => l.list === list);
    assert.deepEqual(rows.map(l => l.ordinal), rows.map((_, i) => i), `${list}: ordinals 0..n-1`);
    assert.deepEqual(reg[field], rows.map(l => l.id), field);
  }
  assert.deepEqual(reg.kp1Languages, reg.languages);
  // every registered surface is listed once, and the per-language registry agrees
  const pairs = Object.entries(reg.surfaces).flatMap(([lang, layouts]) => Object.keys(layouts).map(y => `${lang}/${y}`));
  assert.deepEqual([...pairs].sort(), reg.kp1Surfaces.map(([l, y]) => `${l}/${y}`).sort());
  // surfaces from strictSelectorOrdinal on are keyed only (docs/10 §2.1)
  assert.equal(reg.strictSelectorOrdinal, 8);
  for (const [l, y] of reg.kp1Surfaces.slice(reg.strictSelectorOrdinal))
    assert.deepEqual(reg.surfaces[l][y].selectorModes, ["keyed"], `${l}/${y}`);
  assert.deepEqual(reg.kp1Surfaces.slice(8), [["zh", "zh_cangjie"], ["zh", "zh_quick"]]);
});
