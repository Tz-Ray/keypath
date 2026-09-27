// The page's hard-coded figures (hero, how-it-works, stat tiles, example
// chips, footer) against the values the Python build wrote (SPEC §2.4–2.5,
// §6.3): every number and string on the page is KeyPath output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJson, engine } from "./helpers.js";
import { parseHtml, elements, textOf, byId } from "./html.js";

const doc = parseHtml(readFileSync(join(ROOT, "index.html"), "utf8"));
const S = readJson("tests/fixtures/static.json");
const hero = readJson("data/hero.json");
const registry = readJson("data/registry.json");
const nf = new Intl.NumberFormat("en");

const get = path => path.split(".").reduce((o, k) => o[k], { ...S, edition8: registry.currentEdition.slice(0, 8) });

test("every data-static value matches the build's static.json", () => {
  const els = elements(doc).filter(e => e.attrs["data-static"] !== undefined);
  assert.ok(els.length >= 20, `found ${els.length}`);
  for (const el of els) {
    const path = el.attrs["data-static"];
    const value = get(path);
    if (path.startsWith("chips.")) {
      assert.equal(el.attrs["data-text"], value.text, path);
      assert.equal(el.attrs["data-lang"], value.source, path);
      assert.equal(el.attrs["data-surface"], value.surface, path);
      continue;
    }
    const fmt = el.attrs["data-format"];
    const want = fmt === "number" ? nf.format(value)
      : fmt === "times" ? value.join(" × ")
      : fmt === "int" ? String(Math.round(value))
      : fmt === "round" ? String(Math.round(value))
      : String(value);
    assert.equal(textOf(el), want, path);
  }
});

test("step 2 candidate tiles and step 3 keycaps match", () => {
  const list = elements(doc).find(e => e.attrs["data-static-list"] === "step2.head");
  const tiles = list.children.filter(c => c.tag === "span" && !(c.attrs.class || "").includes("more"));
  assert.deepEqual(tiles.map(textOf), S.step2.head);
  assert.equal(textOf(tiles.find(t => (t.attrs.class || "").includes("chosen"))), S.step2.chosen);
  assert.equal(S.step2.head[S.step2.index], S.step2.chosen);

  const keys = elements(doc).find(e => e.attrs["data-static-keys"] === "step3");
  const mains = elements(keys).filter(e => e.attrs.class === "main").map(textOf);
  const legs = elements(keys).filter(e => e.attrs.class === "leg").map(textOf);
  assert.deepEqual(mains, S.step3.keys);
  assert.deepEqual(legs, S.step3.legends);
});

test("the hero figures agree with hero.json and a live encode", async () => {
  assert.equal(S.hero.ciphertext, hero.ciphertext);
  assert.equal(S.hero.text, hero.text);
  assert.equal(S.stats.keyspace, S.stats.factors.reduce((a, b) => a * b, 1));
  const e = await engine();
  const r = await e.encode({ text: hero.text, source: hero.source, surface: hero.surface });
  assert.ok(r.ok);
  assert.deepEqual(r.factors, S.hero.factors);
  const [w, h] = r.trace.segments[0].words;
  assert.deepEqual({ word: w.chain[0].word, index: w.chain[0].index, count: w.chain[0].count },
    { word: S.step1.target, index: S.step1.index, count: S.step1.count });
  const u = w.units[1];
  assert.equal(u.reading, S.step2.reading);
  assert.equal(u.count, S.step2.count);
  assert.equal(u.index, S.step2.index);
  assert.equal(u.keys, S.step3.keys.join(""));
  assert.ok(h);
  // the example chips and the hero on every keyboard
  for (const c of S.chips) {
    const rc = await e.encode({ text: c.text, source: c.source, surface: c.surface });
    assert.equal(rc.ciphertext, c.ciphertext, c.text);
  }
  for (const [surface, ciphertext] of Object.entries(S.heroAll)) {
    const rs = await e.encode({ text: hero.text, source: "en", surface });
    assert.equal(rs.ciphertext, ciphertext, surface);
  }
});

test("the stat tiles restate the analysis", () => {
  assert.equal(Math.round(S.stats.rank0Percent), 73);
  assert.equal(S.stats.medianCandidates, 11);
  assert.equal(S.stats.maxCandidates, 215);
});

test("the hero markup shows the precomputed ciphertext before scripts run", () => {
  assert.equal(textOf(byId(doc, "cipher")).trim(), hero.ciphertext);
  assert.equal(textOf(byId(doc, "msg")), hero.text);
});
