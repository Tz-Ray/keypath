// Help for a refused walk (assets/js/ui/decodehelp.js): the refusal stays
// the engine's, and the page adds one plain advice line for the common
// paste mistakes and names keyboards and lists in its own words.
import test from "node:test";
import assert from "node:assert/strict";
import { engine, readJson } from "./helpers.js";
import { plainMessage, pasteAdvice } from "../assets/js/ui/decodehelp.js";
import { T } from "../assets/js/ui/text.js";

const hero = readJson("data/hero.json");
const surfaces = readJson("data/registry.json").siteSurfaces;

test("each common paste mistake is still refused, as before, and gets its advice line", async () => {
  const e = await engine();
  const short = e.kp1Pack(hero.keyText).text;
  const cases = [
    ["a short key in double quotes", hero.ciphertext, JSON.stringify(short), T.adviceQuoted, "keyInvalid"],
    ["a short key in single quotes", hero.ciphertext, `'${short}'`, T.adviceQuoted, "badJson"],
    ["a JSON key as a JSON string", hero.ciphertext, JSON.stringify(hero.keyText), T.adviceQuoted, "keyInvalid"],
    ["a short key in curly quotes", hero.ciphertext, `“${short}”`, T.adviceQuoted, "badJson"],
    ["the boxes swapped (JSON key)", hero.keyText, hero.ciphertext, T.adviceSwapped, "badJson"],
    ["the boxes swapped (short key)", short, hero.ciphertext, T.adviceSwapped, "badJson"],
    ["a ciphertext in the key box, nothing else", "", hero.ciphertext, T.adviceSwapped, "badJson"],
    ["a short key wrapped by email", hero.ciphertext, `${short.slice(0, 20)}\n${short.slice(20)}`, T.adviceKp1Spaces, "keyInvalid"],
    ["a short key with a space inside", hero.ciphertext, `${short.slice(0, 20)} ${short.slice(20)}`, T.adviceKp1Spaces, "keyInvalid"],
    ["a space inside the ciphertext", `${hero.ciphertext.slice(0, 3)} ${hero.ciphertext.slice(3)}`, hero.keyText, T.adviceCipherSpaces, "keyInvalid"],
    ["a line break inside the ciphertext", `${hero.ciphertext.slice(0, 3)}\n${hero.ciphertext.slice(3)}`, short, T.adviceCipherSpaces, "keyInvalid"],
  ];
  for (const [name, c, k, advice, reason] of cases) {
    const r = await e.decode({ ciphertext: c.trim(), keyText: k });
    assert.deepEqual([r.ok, r.reason], [false, reason], name);
    assert.equal(pasteAdvice(c.trim(), k), advice, name);
  }
});

test("no advice for a key that is simply wrong, or for a key that reads", async () => {
  const e = await engine();
  const short = e.kp1Pack(hero.keyText).text;
  assert.equal(pasteAdvice(hero.ciphertext, hero.keyText), null);
  assert.equal(pasteAdvice(hero.ciphertext, `\n ${short} \n`), null);
  assert.equal(pasteAdvice("cj0u/6ru9", hero.keyText), null);
  assert.equal(pasteAdvice(hero.ciphertext, "{"), null);
  assert.equal(pasteAdvice("", hero.keyText), null);
  // a quoted word that is no key is not "a key in quotes"
  assert.equal(pasteAdvice(hero.ciphertext, '"hello"'), null);
});

test("internal names in a refusal become the page's names; anything else is kept", () => {
  assert.equal(plainMessage("unit  ru contains ' ', which is outside the zh_daqian alphabet", surfaces),
    "unit  ru contains ' ', which is outside the Bopomofo (Taiwan) keyboard alphabet");
  assert.equal(plainMessage("ㄐㄧㄞ has no homophone:zh candidates", surfaces), "ㄐㄧㄞ has no Chinese sound candidates");
  assert.equal(plainMessage("the homophone:ja candidates of ありがと", surfaces), "the Japanese reading candidates of ありがと");
  assert.equal(plainMessage("the lists of translate:ru>en", surfaces), "the lists of the Russian-to-English dictionary");
  assert.equal(plainMessage("surface (zh, ko_dubeolsik) has no homophone layer", surfaces), "surface (zh, Korean keyboard) has no homophone layer");
  for (const kept of ["ciphertext ends mid-unit", "layout zz_nothing is not supported", "the lists of translate:xx>en", "homophone:zz"])
    assert.equal(plainMessage(kept, surfaces), kept);
  // every layout a refusal can name has a page name
  for (const s of surfaces) if (s.id === s.layout) assert.doesNotMatch(plainMessage(`the ${s.layout} alphabet`, surfaces), /_/, s.layout);
});
