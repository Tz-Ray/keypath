// No solver (docs/10 §8.1, §9.7): the engine's public surface is exactly the
// checked-in allowlist, and nothing in it splits an unsplit stream of keys
// or answers without a layout the visitor named.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT, freshEngine } from "./helpers.js";
import { ENGINE_KEYS, MODULE_EXPORTS } from "./engine-allowlist.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// "welcome home" on Cangjie (歡迎家: tgno yhvl jmso), unsplit
const STREAM = "tgnoyhvljmso";

const sorted = xs => [...xs].sort();
const modules = Object.fromEntries(await Promise.all(Object.keys(MODULE_EXPORTS)
  .map(async path => [path, await import(pathToFileURL(join(ROOT, path)).href)])));

test("the engine's keys and the modules' named exports equal the allowlist", async () => {
  const engine = await freshEngine();
  assert.deepEqual(sorted(Object.keys(engine)), sorted(Object.keys(ENGINE_KEYS)));
  for (const [path, exports] of Object.entries(MODULE_EXPORTS))
    assert.deepEqual(sorted(Object.keys(modules[path])), sorted(Object.keys(exports)), path);
  assert.ok("detect" in ENGINE_KEYS && /plaintext language detection/.test(ENGINE_KEYS.detect));
});

/**
 * A split of the stream: two or more pieces, not all single code points (a
 * string's code points are no split), that join to it.  Pieces are the runs
 * of the stream's own alphabet (a-z) in some strings, so any separator or
 * annotation between units counts ("tgno|yhvl", "tgno 歡 yhvl 迎"), and the
 * strings are those of
 *   - a string, or an array of strings;
 *   - an array of objects: the values of one property across its elements
 *     (units as {keys: "tgno"}, the shape the engine's own walks use);
 *   - an array of arrays of strings: each inner array joined (units as
 *     lists of keys).
 */
const SEPARATOR = /[^a-z]+/;
const isPieces = pieces => pieces.length > 1 && pieces.join("") === STREAM && pieces.some(p => Array.from(p).length > 1);
const piecesOf = strings => strings.flatMap(s => s.split(SEPARATOR)).filter(p => p !== "");
const isObject = v => v !== null && typeof v === "object" && !Array.isArray(v);

function isSplit(x) {
  if (typeof x === "string") return isPieces(piecesOf([x]));
  if (!Array.isArray(x) || x.length < 2) return false;
  if (x.every(p => typeof p === "string")) return isPieces(piecesOf(x));
  if (x.every(p => Array.isArray(p) && p.every(q => typeof q === "string"))) return isPieces(x.map(p => p.join("")));
  const names = [...new Set(x.filter(isObject).flatMap(o => Object.keys(o)))].sort();
  return names.some(name => isPieces(piecesOf(x.filter(o => isObject(o) && typeof o[name] === "string").map(o => o[name]))));
}

/** Whether `value` is, or holds anywhere inside it, a split of the stream. */
function holdsSplits(value, seen = new Set()) {
  if (isSplit(value)) return true;
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const items = value instanceof Map || value instanceof Set ? [...value.values()] : Object.values(value);
  return items.some(x => holdsSplits(x, seen));
}

/** The ways a function could be handed the stream with no layout. */
const CALLS = [
  [STREAM],
  [{ chunks: [STREAM] }],
  [{ chunks: [STREAM], top: 500 }],
  [{ text: STREAM }],
  [{ ciphertext: STREAM }],
  [{ stream: STREAM, keys: STREAM, text: STREAM, chunks: [STREAM], ciphertext: STREAM }],
  [STREAM, STREAM],
];

async function answer(fn, args) {
  try { return await fn(...args); } catch { return undefined; }
}

test("the detector finds splits", () => {
  assert.ok(holdsSplits([["tgno", "yhvl", "jmso"], ["tg", "noyhvljmso"]]));
  assert.ok(holdsSplits({ ok: true, splits: [["tgno", "yhvljmso"]] }));
  assert.ok(holdsSplits(["tgno", "yhvl", "jmso"]));
  assert.ok(holdsSplits(new Map([[0, ["tgnoyhvl", "jmso"]]])));
  assert.ok(holdsSplits(["tgno yhvl jmso"]));
  // units as objects, the shape the engine's own walks use, alone or nested
  assert.ok(holdsSplits([{ keys: "tgno" }, { keys: "yhvl" }, { keys: "jmso" }]));
  assert.ok(holdsSplits({ ok: true, units: [{ keys: "tgno", index: 0 }, { keys: "yhvl", index: 1 }, { keys: "jmso", index: 0 }] }));
  assert.ok(holdsSplits([{ code: "tgnoyhvl", n: 2 }, { code: "jmso", n: 1 }]));
  // units as lists of keys
  assert.ok(holdsSplits([["t", "g", "n", "o"], ["y", "h", "v", "l"], ["j", "m", "s", "o"]]));
  // text with any separator between units, or with readings between them
  for (const text of ["tgno|yhvl|jmso", "tgno,yhvl,jmso", "tgno/yhvl/jmso", "tgno·yhvl·jmso", "tgno+yhvl+jmso",
    "tgno-yhvl-jmso", "tgno\nyhvl\njmso", "tgno 歡 yhvl 迎 jmso 家", "[tgno][yhvl][jmso]"])
    assert.ok(holdsSplits(text), text);
  assert.ok(holdsSplits(["tgno|yhvl", "jmso"]));
  // not splits: code points, one unit, the stream quoted or annotated whole
  assert.ok(!holdsSplits([...STREAM]), "a string's code points are no split");
  assert.ok(!holdsSplits([...STREAM].map(keys => ({ keys }))), "code points as objects are no split");
  assert.ok(!holdsSplits([...STREAM].join(" ")), "code points as text are no split");
  assert.ok(!holdsSplits([{ keys: STREAM }]));
  assert.ok(!holdsSplits(`'${STREAM}'`));
  assert.ok(!holdsSplits(`${STREAM} · (zh, zh_cangjie) · well-formed: no`));
  assert.ok(!holdsSplits({ ok: false, reason: "noLayout" }));
  assert.ok(!holdsSplits(STREAM));
});

test("the detector catches a splitter that hides behind the allowlist", async () => {
  // what a hypothetical allowlisted splitter would answer, in each shape
  const splitters = [
    s => [{ keys: s.slice(0, 4) }, { keys: s.slice(4, 8) }, { keys: s.slice(8) }],
    s => ({ ok: true, units: [{ keys: s.slice(0, 4) }, { keys: s.slice(4) }] }),
    s => `${s.slice(0, 4)}|${s.slice(4, 8)}|${s.slice(8)}`,
    s => [[...s.slice(0, 4)], [...s.slice(4)]],
  ];
  for (const fn of splitters) assert.ok(holdsSplits(await answer(fn, CALLS[0])), String(fn));
});

test("no allowlisted function, given the unsplit stream and no layout, returns splits of it", async () => {
  const engine = await freshEngine();
  const targets = [];
  for (const key of Object.keys(ENGINE_KEYS)) {
    if (typeof engine[key] === "function") targets.push([`engine.${key}`, engine[key]]);
  }
  // the keyboard readers too: they read units the key delimits, never a stream
  for (const [key, fn] of Object.entries(engine.layouts)) {
    if (typeof fn === "function") targets.push([`engine.layouts.${key}`, fn]);
  }
  for (const [path, exports] of Object.entries(MODULE_EXPORTS)) {
    for (const key of Object.keys(exports)) {
      if (typeof modules[path][key] === "function") targets.push([`${path} ${key}`, modules[path][key]]);
    }
  }
  assert.ok(targets.length >= 40, `${targets.length} functions`);
  for (const [name, fn] of targets) {
    for (const args of CALLS) {
      const result = await answer(fn, args);
      assert.ok(!holdsSplits(result), `${name}(${JSON.stringify(args)}) returned splits`);
    }
  }
});

test("lookup and type need a workbench layout: none, an unknown one, or 'any' is noLayout", async () => {
  const engine = await freshEngine();
  const noLayout = { ok: false, reason: "noLayout" };
  for (const layout of [undefined, null, "", "any", "all", "*", "auto", "ja_romaji", "zh_hanja", "ZH_DAQIAN", "__proto__",
    "toString", "constructor", ["zh_cangjie"], { layout: "zh_cangjie" }, 1]) {
    assert.deepEqual(await engine.lookup({ layout, chunks: [STREAM] }), noLayout, String(layout));
    assert.deepEqual(await engine.type({ layout, text: STREAM }), noLayout, String(layout));
  }
  assert.deepEqual(await engine.lookup(), noLayout);
  assert.deepEqual(await engine.type(), noLayout);
  assert.deepEqual(await engine.lookup(STREAM), noLayout);
  assert.deepEqual(await engine.type(STREAM), noLayout);
  // with a layout the stream is one chunk, never split
  const r = await engine.lookup({ layout: "zh_cangjie", chunks: [STREAM] });
  assert.equal(r.ok, true);
  assert.equal(r.wellFormed, false);
  assert.equal(r.text.split("\n")[0], `${STREAM} · (zh, zh_cangjie) · well-formed: no`);
});
