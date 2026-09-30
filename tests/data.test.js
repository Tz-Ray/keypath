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
  assert.equal(manifest.keypath, "2.6.0");
  assert.equal(manifest.tag, "v2.6");
  assert.equal(manifest.edition, "05b2373935c571bb838d6791d13dd567ca3fe2553ea42634daed5afa19379bd2");
  assert.deepEqual(Object.keys(manifest.files).sort(), dataFiles.filter(f => f !== "data/manifest.json"));
  for (const [path, { bytes, sha256 }] of Object.entries(manifest.files)) {
    const buf = readFileSync(join(ROOT, path));
    assert.equal(buf.length, bytes, path);
    assert.equal(createHash("sha256").update(buf).digest("hex"), sha256, path);
  }
});

// docs/10 §9.7: data/ at most 6 MiB raw from M14 (4.5 MiB through v2.0)
const DATA_CAP = 6 * 1024 * 1024;

test("budget: every data file is at most 120 KB gzipped, data/ at most 6 MiB raw", () => {
  let total = 0;
  for (const path of dataFiles) {
    const buf = readFileSync(join(ROOT, path));
    total += buf.length;
    const gz = gzipSync(buf, { level: 9 }).length;
    assert.ok(gz <= 120 * 1024, `${path}: ${gz} bytes gzipped`);
  }
  assert.equal(DATA_CAP, 6_291_456);
  assert.ok(total <= DATA_CAP, `data/ is ${total} bytes`);
});

test("first-view data (registry, layouts, unicode14, hero) stays small", () => {
  const first = ["data/registry.json", "data/layouts.json", "data/unicode14.json", "data/hero.json"];
  const gz = first.reduce((n, p) => n + gzipSync(readFileSync(join(ROOT, p)), { level: 9 }).length, 0);
  assert.ok(gz <= 20 * 1024, `${gz} bytes gzipped`);
});

test("shapes: 256 phrase shards, 26 vocabulary files, 26 row files per surface, 12 challenges", () => {
  assert.equal(dataFiles.filter(f => f.startsWith("data/zh/p/")).length, 256);
  assert.equal(dataFiles.filter(f => f.startsWith("data/en/vocab/")).length, 26);
  const reg = readJson("data/registry.json");
  // docs/10 §9.7: row files for every translated surface except the derived
  // ones (their rows are computed from their base surface's), none for those
  assert.deepEqual(reg.derivedRows, { zh_eten: "zh_daqian", zh_quick: "zh_cangjie", ja_kana: "ja_romaji" });
  const withFiles = reg.allowed.en.filter(s => s !== "en_identity" && !Object.hasOwn(reg.derivedRows, s));
  assert.equal(withFiles.length, 10);
  assert.equal(withFiles.length * 26, dataFiles.filter(f => /^data\/en\/(?!vocab\/)[a-z_]+\/[a-z]\.json$/.test(f)).length);
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
  // the Jyutping lists in one file (docs/10 §9.7)
  assert.ok(dataFiles.includes("data/jyutping.json"));
  // docs/10 §9.7: the 26 files of en→el rows; the el→en lists are never shipped
  assert.ok(withFiles.includes("el_greek"));
  assert.equal(dataFiles.filter(f => /^data\/en\/el_greek\/[a-z]\.json$/.test(f)).length, 26);
  assert.deepEqual(dataFiles.filter(f => /el_en|el>en|el-en/.test(f)), []);
  const index = readJson("data/challenges/index.json");
  assert.deepEqual(index.map(c => c.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const pad = n => String(n).padStart(2, "0");
  for (const c of index) assert.equal(readJson(`data/challenges/${pad(c.n)}.json`).ciphertext, c.ciphertext);
  // docs/10 §10 M18: three hints for each of 7-12, one file per hint; none for 1-6
  assert.deepEqual(index.map(c => c.hints ?? 0), [0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(dataFiles.filter(f => f.startsWith("data/challenges/hints/")),
    index.filter(c => c.hints).flatMap(c => [1, 2, 3].map(k => `data/challenges/hints/${pad(c.n)}-${k}.json`)));
  assert.deepEqual(dataFiles.filter(f => /^data\/challenges\/[^/]+$/.test(f)),
    ["data/challenges/NOTICE", ...index.map(c => `data/challenges/${pad(c.n)}.json`), "data/challenges/index.json"].sort());
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
  assert.deepEqual(reg.kp1Surfaces.slice(8), [["zh", "zh_cangjie"], ["zh", "zh_quick"], ["vi", "vi_telex"], ["vi", "vi_vni"],
    ["zh", "zh_eten"], ["zh", "zh_jyutping"], ["ja", "ja_kana"], ["el", "el_greek"]]);
  assert.deepEqual(reg.kp1Languages.slice(-1), ["el"]);
  // vi is native-only (docs/10 §6.5): no English rows, no other source reaches it
  assert.deepEqual(reg.allowed.vi, ["vi_telex", "vi_vni"]);
  for (const [lang, sids] of Object.entries(reg.allowed))
    if (lang !== "vi") assert.ok(sids.every(s => !s.startsWith("vi_")), lang);
  assert.ok(!reg.hops.some(h => h.split(">").includes("vi")));
  // Greek (docs/10 §9.7): from Greek and from English; the hop out of Greek
  // is registered, but its lists are never shipped, so keys using it are refused
  assert.deepEqual(reg.allowed.el, ["el_greek"]);
  assert.ok(reg.allowed.en.includes("el_greek"));
  for (const [lang, sids] of Object.entries(reg.allowed))
    if (!["el", "en"].includes(lang)) assert.ok(!sids.includes("el_greek"), lang);
  assert.deepEqual(reg.hops.filter(h => h.split(/[:>]/).includes("el")), ["translate:en>el", "translate:el>en"]);
  assert.deepEqual(reg.refusedHops, ["translate:el>en"]);
  assert.deepEqual(reg.recomposedLanguages, ["el"]);
});
