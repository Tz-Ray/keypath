// The keyboard pictures (docs/10 §8.4, §9.7): the US rows with `=` and `\`,
// one US shift map, and on every layout drawn as a key grid exactly the
// legends KeyPath's layouts give each key (tests/fixtures/legends.json,
// written by tools/build_data.py from the tables), the shift layers of
// Dubeolsik and JIS kana included.  The browser run (tools/cdp.mjs) checks
// the drawn pictures and their width at 360 px.
import test from "node:test";
import assert from "node:assert/strict";
import { engine, readJson } from "./helpers.js";
import { makeLegends } from "../assets/js/ui/walk.js";
import { ROWS, US_SHIFT, GRID_LAYOUTS, keyboardModel, hasShiftLayer, bopomofoToneNote, jyutpingNote, kanaNotes }
  from "../assets/js/ui/keyboard.js";

const fixture = readJson("tests/fixtures/legends.json");
const layoutsJson = readJson("data/layouts.json");
const legendsOf = async () => makeLegends((await engine()).layouts);

test("the picture's rows are the US rows, with = and \\, and the one shift map is the US keycaps'", () => {
  assert.deepEqual(ROWS.map(r => r.join("")), fixture.usRows);
  assert.deepEqual(ROWS.map(r => r.map(k => US_SHIFT[k]).join("")), fixture.usShiftedRows);
  assert.ok(ROWS[0].includes("=") && ROWS[1].includes("\\"));
  assert.equal(Object.keys(US_SHIFT).length, ROWS.flat().length);
  // spelled out (docs/10 §9.7)
  for (const [key, shifted] of [["`", "~"], ["1", "!"], ["0", ")"], ["=", "+"], ["[", "{"], ["]", "}"], ["\\", "|"], [";", ":"],
    ["'", '"'], [",", "<"], [".", ">"], ["/", "?"], ["q", "Q"], ["v", "V"], ["z", "Z"]]) assert.equal(US_SHIFT[key], shifted, key);
});

test("every grid layout draws exactly KeyPath's legends, unshifted and shifted", async () => {
  const legends = await legendsOf();
  const drawn = new Set([...ROWS.flat(), ...ROWS.flat().map(k => US_SHIFT[k])]);
  for (const layout of GRID_LAYOUTS) {
    const want = fixture.layouts[layout];
    assert.ok(want, layout);
    // no legend is lost: every key the layout labels is on the picture, or on its shift layer
    for (const key of Object.keys(want)) assert.ok(drawn.has(key), `${layout}: ${key}`);
    const shift = hasShiftLayer(legends, layout);
    for (const layer of shift ? [false, true] : [false]) {
      for (const row of keyboardModel(legends, layout, layer)) {
        for (const k of row) {
          assert.equal(k.typed, layer ? US_SHIFT[k.key] : k.key);
          assert.equal(k.legend, want[k.typed] ?? "", `${layout} ${layer ? "Shift+" : ""}${k.key}`);
        }
      }
    }
    // a shift layer exactly when the layout labels a shifted key
    assert.equal(shift, Object.keys(want).some(k => !ROWS.flat().includes(k)), layout);
  }
  assert.deepEqual([...GRID_LAYOUTS].filter(l => hasShiftLayer(legends, l)), ["ko_dubeolsik", "ja_kana"]);
});

test("ETen and kana legends, asserted from the tables", async () => {
  const legends = await legendsOf();
  const at = (layout, key, shift = false) => keyboardModel(legends, layout, shift).flat().find(k => k.key === key).legend;
  // ETen: each key the table gives a symbol or tone mark
  const et = layoutsJson.zh_eten;
  for (const [sym, key] of [...Object.entries(et.symbolToKey), ...Object.entries(et.toneToKey)]) assert.equal(at("zh_eten", key), sym, key);
  assert.equal(at("zh_eten", "7"), "ㄑ");
  assert.equal(at("zh_eten", "1"), "˙");
  assert.equal(at("zh_eten", "="), "ㄦ");
  assert.equal(at("zh_eten", "5"), "");
  // the tone keys, from the table (ETen's 2 3 4 1; Dàqiān's 6 3 4 7)
  const tones = layout => keyboardModel(legends, layout).flat().filter(k => k.tone).map(k => k.key).sort().join("");
  assert.equal(tones("zh_eten"), "1234");
  assert.equal(tones("zh_daqian"), "3467");
  assert.equal(tones("zh_jyutping"), "123456");
  // JIS kana: every one-key row on its key or on its key with Shift, and [ ] as the voicing marks
  const kana = new Map(layoutsJson.ja_kana.keysByKana);
  for (const [k, keys] of kana) {
    if (keys.length !== 1) continue;
    const key = ROWS.flat().find(x => x === keys || US_SHIFT[x] === keys);
    assert.equal(at("ja_kana", key, keys !== key), k, k);
  }
  assert.equal(at("ja_kana", "\\"), "む");
  assert.equal(at("ja_kana", "0", true), "を");
  assert.equal(at("ja_kana", "v", true), "ゐ");
  assert.equal(at("ja_kana", "z", true), "っ");
  assert.equal(at("ja_kana", "["), "゛");
  assert.equal(at("ja_kana", "]"), "゜");
  assert.equal(at("ja_kana", "a", true), "", "Shift+a types no kana on this table");
  // Dubeolsik's shifted jamo, now read through the same map
  assert.deepEqual("qwertop".split("").map(k => at("ko_dubeolsik", k, true)).join(""), "ㅃㅉㄸㄲㅆㅒㅖ");
});

test("the notes under the pictures are read from the tables", async () => {
  const legends = await legendsOf();
  assert.equal(bopomofoToneNote(layoutsJson.zh_daqian), "Tone keys: 6 ˊ · 3 ˇ · 4 ˋ · 7 ˙; the first tone types nothing.");
  assert.equal(bopomofoToneNote(layoutsJson.zh_eten), "Tone keys: 2 ˊ · 3 ˇ · 4 ˋ · 1 ˙; the first tone types nothing.");
  assert.equal(jyutpingNote(layoutsJson.zh_jyutping), "Each character is typed as its Jyutping syllable, then its tone digit: "
    + "1 high level · 2 high rising · 3 mid level · 4 low falling · 5 low rising · 6 low level.");
  const { voicing, shifted } = kanaNotes(legends);
  assert.deepEqual(voicing, [
    { markKey: "[", mark: "゛", base: "か", kana: "が", keys: "t[" },
    { markKey: "]", mark: "゜", base: "は", kana: "ぱ", keys: "f]" },
  ]);
  assert.deepEqual(shifted.map(x => `${x.typed}${x.kana}${x.key}`), ["&ゃ7", "*ゅ8", "(ょ9", ")を0", "+ゑ=", "Zっz", "Vゐv"]);
});

test("the walk's keycaps: ETen and kana keys carry their legends, digits and punctuation the misdirection dot", async () => {
  const legends = await legendsOf();
  const caps = (layout, keys) => legends.legends(layout, keys).map(c => `${c.key}${c.legend}${c.mis ? "*" : ""}${c.shift ? "^" : ""}`);
  assert.deepEqual(caps("zh_eten", "ne3"), ["nㄋ", "eㄧ", "3ˇ*"]);
  assert.deepEqual(caps("zh_eten", ",2"), [",ㄓ*", "2ˊ*"]);
  assert.deepEqual(caps("ja_kana", "3lt[s4"), ["3あ*", "lり", "tか", "[゛*", "sと", "4う*"]);
  assert.deepEqual(caps("ja_kana", "iZ-]yb["), ["iに", "Zっ^", "-ほ*", "]゜*", "yん", "bこ", "[゛*"]);
  assert.deepEqual(caps("ja_kana", "b+"), ["bこ", "+ゑ*^"]);
  assert.deepEqual(caps("zh_jyutping", "nei5"), ["n", "e", "i", "5"]);
});
