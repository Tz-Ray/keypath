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
  assert.equal(manifest.keypath, "2.0.0");
  assert.equal(manifest.tag, "v2.0");
  assert.equal(manifest.edition, "67a40391169bcb9b891b52c84e126fb386e5b9b6e1153665ea55aba214c161f2");
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
  for (const sid of reg.allowed.en.filter(s => s !== "en_identity"))
    assert.equal(dataFiles.filter(f => f.startsWith(`data/en/${sid}/`)).length, 26, sid);
  const index = readJson("data/challenges/index.json");
  assert.deepEqual(index.map(c => c.n), [1, 2, 3, 4, 5, 6]);
  for (const c of index) assert.equal(readJson(`data/challenges/0${c.n}.json`).ciphertext, c.ciphertext);
  const vocab = dataFiles.filter(f => f.startsWith("data/en/vocab/")).flatMap(f => readJson(f));
  assert.equal(vocab.length, 10000);
  assert.ok(vocab.includes("welcome") && vocab.includes("home") && vocab.includes("alison"));
});
