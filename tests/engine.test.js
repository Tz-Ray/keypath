// Engine behaviour beyond the fixture corpora: the hero, the challenges, the
// English rows, refusals, key-text spans, what-if, and a JS-only
// round-trip property on random text.
import test from "node:test";
import assert from "node:assert/strict";
import { engine, freshEngine, readJson } from "./helpers.js";
import { answerNorm, answerFold, sha256Hex, checkAnswer } from "../assets/js/engine/hash.js";
import { parseKeyJson, PyFloat } from "../assets/js/engine/keycheck.js";

const hero = readJson("data/hero.json");
const index = readJson("data/challenges/index.json");

test("the engine re-encodes the hero exactly as data/hero.json", async () => {
  const e = await freshEngine();
  const r = await e.encode({ text: hero.text, source: hero.source, surface: hero.surface });
  assert.equal(r.ok, true);
  assert.equal(r.ciphertext, "cj0u/6ru8");
  assert.equal(r.keyText, hero.keyText);
  assert.deepStrictEqual(r.trace, hero.trace);
  assert.equal(r.choices, 5);
  assert.deepEqual(r.factors, [18, 46, 34]);
  assert.deepEqual(r.leak, [0, 12]);
  for (const [reading, chars] of Object.entries(hero.lists)) {
    const l = await e.list("homophone:zh", reading);
    assert.equal(l.items.join(""), chars);
    assert.equal(l.complete, true);
  }
});

test("the hero loads only what it needs (no whole-vocabulary fetch)", async () => {
  const seen = [];
  const { createEngine } = await import("../assets/js/engine/index.js");
  const { fetchText } = await import("./helpers.js");
  const e = await createEngine({ fetchText: p => { seen.push(p); return fetchText(p); } });
  await e.encode({ text: "welcome home", source: "en", surface: "zh_daqian" });
  assert.deepEqual(seen.sort(), ["data/en/vocab/h.json", "data/en/vocab/w.json", "data/en/zh_daqian/h.json",
    "data/en/zh_daqian/w.json", "data/layouts.json", "data/registry.json", "data/unicode14.json", "data/zh/core.json"]);
});

test("every shipped challenge decodes to its plaintext on a fresh engine", async () => {
  for (const { n } of index) {
    const e = await freshEngine();
    const c = readJson(`data/challenges/${String(n).padStart(2, "0")}.json`);
    const r = await e.decode({ ciphertext: c.ciphertext, keyText: c.keyText });
    assert.equal(r.ok, true, `challenge ${n}: ${JSON.stringify(r)}`);
    assert.equal(r.text, c.plaintext);
    assert.equal(r.trace.ciphertext, c.ciphertext);
  }
});

test("answer hashes reproduce for all six challenges", async () => {
  for (const item of index) {
    const c = readJson(`data/challenges/${String(item.n).padStart(2, "0")}.json`);
    assert.equal(await sha256Hex(answerNorm(c.plaintext)), item.hash);
    assert.equal(await sha256Hex(answerFold(c.plaintext)), item.fold);
    assert.equal(await checkAnswer(`  ${c.plaintext.toUpperCase()}!! `, item), "solved");
    assert.equal(await checkAnswer("definitely not it", item), "wrong");
  }
  assert.equal(answerNorm("¿Qué  tal, Año?"), "quétalaño");
  assert.equal(answerFold("¿Qué tal, Año?"), "quetalano");
});

test("every English row decodes: units give the target, the hop list gives the word", async () => {
  const e = await freshEngine();
  const { english, surfaceById } = e._internal;
  const R = e.registry;
  for (const sid of R.allowed.en.filter(s => s !== "en_identity")) {
    await english.loadAllRows(sid);
    const s = surfaceById(sid);
    let n = 0;
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      for (const [word, row] of Object.entries(english.rows.get(`${sid}/${letter}`))) {
        const [entry, keys] = english.entryOf(sid, row);
        const key = { keypath: "1.1", tables_sha256: R.currentEdition, source_language: "en",
          segments: [{ language: s.language, layout: s.layout, route: [`translate:en>${s.language}`, ...s.routeTail],
            selector_mode: "keyed", words: [entry] }] };
        const r = await e.decode({ ciphertext: keys, keyText: JSON.stringify(key) });
        assert.equal(r.ok, true, `${sid} ${word}: ${JSON.stringify(r)}`);
        assert.equal(r.text, word);
        const w = r.trace.segments[0].words[0];
        assert.equal(w.chain[0].word, row[0]);
        assert.equal(w.chain[0].count, row[2]);
        assert.equal(w.units.map(u => u.out).join(""), row[0]);
        n++;
      }
    }
    assert.ok(n > 2500, `${sid}: ${n} rows`);
  }
});

test("key text spans slice exactly the unit objects and translation records", async () => {
  const e = await engine();
  const r = await e.encode({ text: "welcome home", source: "en", surface: "zh_daqian" });
  const units = r.spans.filter(s => s.kind === "unit");
  const recs = r.spans.filter(s => s.kind === "translation");
  assert.equal(units.length, 3);
  assert.equal(recs.length, 2);
  for (const s of r.spans) {
    const [si, wi, i] = s.path;
    const word = r.key.segments[si].words[wi];
    const expected = s.kind === "unit" ? word.units[i] : word.translation;
    assert.deepEqual(JSON.parse(r.keyText.slice(s.start, s.end)), expected);
  }
  const d = await e.decode({ ciphertext: hero.ciphertext, keyText: hero.keyText });
  assert.deepEqual(d.spans, r.spans);
});

test("what-if: another candidate under the same keys", async () => {
  const e = await engine();
  const r = await e.encode({ text: "welcome home", source: "en", surface: "zh_daqian" });
  assert.equal(e.whatIf(r.trace, [0, 0, 1], 0), "歡營家");
  assert.equal(e.whatIf(r.trace, [0, 0, 1], 1), "歡迎家");
  const parts = e.whatIfParts(r.trace, [0, 1, 0], 1);
  assert.deepEqual(parts.filter(p => p.mark).map(p => p.text), ["加"]);
  assert.throws(() => e.whatIf(r.trace, [0, 0, 0], 18), RangeError);
  const lit = await e.encode({ text: "welcome home", source: "en", surface: "es_accent" });
  assert.equal(e.whatIf(lit.trace, [0, 0, 0], 0), "bienvenida home");
});

test("encode refusals", async () => {
  const e = await engine();
  const enc = (text, source, surface) => e.encode({ text, source, surface });
  assert.equal((await enc("", "en", "zh_daqian")).reason, "empty");
  assert.equal((await enc("你好", "zh", "ru_jcuken")).reason, "routeOff");
  assert.equal((await enc("hola", "es", "zh_daqian")).reason, "routeOff");
  assert.equal((await enc("こんにちは", "ja", "ja_romaji")).reason, "jaSource");
  const newer = await enc("hi \u{31350}", "en", "en_identity");
  assert.deepEqual([newer.reason, newer.codePoint], ["newerUnicode", "U+31350"]);
  const unknown = await enc("Welcome, xyzzy and qwertyuiop! xyzzy", "en", "ru_jcuken");
  assert.deepEqual([unknown.reason, unknown.words], ["unknownWords", ["xyzzy", "qwertyuiop"]]);
  assert.deepEqual(unknown.typed, ["xyzzy", "qwertyuiop"]);
  // words is Python's list (a-z runs); typed, which the page shows, is the whole
  // typed word, not its a-z run ("caf"); naïve is na + ï + ve, both known
  const accented = await enc("Un café, naïve über-smart", "en", "zh_daqian");
  assert.deepEqual([accented.reason, accented.words, accented.typed], ["unknownWords", ["caf", "ber"], ["café", "über"]]);
  const plain = await enc("xyzzy", "en", "en_identity");
  assert.equal(plain.ciphertext, "xyzzy");
});

test("the examples on every keyboard", async () => {
  const e = await engine();
  const all = { zh_daqian: "cj0u/6ru8", zh_pinyin: "huan1ying2jia1", zh_cangjie: "tgnoyhvljmso", zh_quick: "toyljo",
    zh_hanja: "ghksdudrk", ko_dubeolsik: "ghksduddkstlrcj", ru_jcuken: "ghbdtncndjdfnmljvf", ja_romaji: "kanngeikokunai",
    es_accent: "bienvenida", en_identity: "welcomehome" };
  for (const [surface, ciphertext] of Object.entries(all))
    assert.equal((await e.encode({ text: "welcome home", source: "en", surface })).ciphertext, ciphertext, surface);
  const es = await e.encode({ text: "welcome home", source: "en", surface: "es_accent" });
  assert.deepEqual(es.leak, [5, 12]);
  for (const [text, source, surface, ciphertext] of [["鍵盤", "zh", "zh_daqian", "ru04q06"],
    ["國家", "zh", "zh_hanja", "rnrrk"], ["한국어", "ko", "ko_dubeolsik", "gksrnrdj"],
    ["ёжик", "ru", "ru_jcuken", "`;br"], ["mañana", "es", "es_accent", "man1ana"]])
    assert.equal((await e.encode({ text, source, surface })).ciphertext, ciphertext, text);
});

test("decode refusals: invalid key, missing data, free translation", async () => {
  const e = await engine();
  const heroKey = JSON.parse(hero.keyText);
  const dec = (ciphertext, key) => e.decode({ ciphertext, keyText: typeof key === "string" ? key : JSON.stringify(key) });
  // Python's json reads 1.0 as a float, which is not an integer index
  const floaty = hero.keyText.replace('"homophone_index": 1', '"homophone_index": 1.0');
  assert.notEqual(floaty, hero.keyText);
  assert.equal((await dec(hero.ciphertext, floaty)).reason, "keyInvalid");
  assert.ok(parseKeyJson("[1.0, 1e2, 3]")[0] instanceof PyFloat);
  assert.equal(parseKeyJson("[1.0, 1e2, 3]")[2], 3);
  assert.equal((await dec(hero.ciphertext + "x", heroKey)).reason, "keyInvalid");
  // a key without the version field says so, not "unsupported key version undefined"
  const { keypath: _v, ...noVersion } = heroKey;
  const missing = await dec(hero.ciphertext, noVersion);
  assert.equal(missing.reason, "keyInvalid");
  assert.match(missing.message, /missing required field "keypath"/);
  assert.doesNotMatch(missing.message, /undefined/);
  assert.equal((await dec("cj0u/6ru", heroKey)).reason, "keyInvalid");
  const tier2 = structuredClone(heroKey);
  tier2.segments[0].words = [{ units: heroKey.segments[0].words[0].units.concat(heroKey.segments[0].words[1].units),
    translation: { tier: 2, engine: "mockmt-1", patch: [] } }];
  assert.equal((await dec(hero.ciphertext, tier2)).reason, "tier2");
  // 至 lists four English senses; the challenge slices carry only three
  const zh = await e._internal.native.loadZhCore();
  const reading = zh.readings.get("至")[0];
  const keys = e.layouts.daqianKeys(reading);
  const idx = zh.lists.get(reading).indexOf("至");
  const esKey = { keypath: "1.1", tables_sha256: e.edition, source_language: "es",
    segments: [{ language: "zh", layout: "zh_daqian", route: ["translate:es>en", "translate:en>zh", "homophone:zh", "keystroke:zh_daqian"],
      selector_mode: "keyed", words: [{ units: [{ len: keys.length, homophone_index: idx }],
        translations: [{ tier: 1, index: 0 }, { tier: 1, index: 3 }] }] }] };
  assert.equal((await dec(keys, esKey)).reason, "notCarried");
  esKey.segments[0].words[0].translations[1].index = 2;
  const ok = await dec(keys, esKey);
  assert.deepEqual([ok.ok, ok.text], [true, "a"]);
  esKey.segments[0].words[0].translations[1].index = 4;
  assert.equal((await dec(keys, esKey)).reason, "keyInvalid");
});

test("detect, allowed routes and surfaces", async () => {
  const e = await engine();
  assert.deepEqual(e.surfaces.map(s => s.id), ["zh_daqian", "zh_pinyin", "zh_cangjie", "zh_quick", "zh_hanja",
    "ja_romaji", "ko_dubeolsik", "ru_jcuken", "es_accent", "en_identity"]);
  assert.deepEqual(e.allowed("zh"), ["zh_daqian", "zh_pinyin", "zh_cangjie", "zh_quick", "zh_hanja"]);
  assert.equal(e.allowed("en").length, 10);
  assert.deepEqual(e.allowed("ja"), []);
  const cases = { "welcome home": "en", "mañana": "es", "¿qué?": "es", "ёжик": "ru", "한국어": "ko",
    "國家": "zh", "カタカナ and 漢字": "ja", "123 !?": null,
    // the katakana middle dot and long-vowel mark are punctuation, also used in Chinese
    "哈利・波特": "zh", "ー・": null, "ラーメン": "ja", "ひらがな": "ja" };
  for (const [text, lang] of Object.entries(cases)) assert.equal(e.detect(text), lang, text);
});

test("JS round trip on random text: decode(encode(x)) == normalize(x)", async () => {
  const e = await engine();
  const zh = await e._internal.native.loadZhCore();
  const chars = [...zh.readings.keys()];
  let seed = 20260924;
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const pick = arr => arr[rand(arr.length)];
  const pools = {
    zh: () => pick([pick(chars), pick(chars) + pick(chars), "，", " ", "A1", "😀", "一二"]),
    ko: () => pick([String.fromCharCode(0xac00 + rand(11172)), String.fromCharCode(0x3131 + rand(51)), " ", "ㆍ", "Q"]),
    ru: () => pick(["привет", "Ёж", "съел", " ", "—", "і"]),
    es: () => pick(["Canción", "AÑO", "pingüino", " ", "¿", "é"]),
    en: () => pick(["Hello", "world", "the", "zebra", " ", "  ", ",", "'s"]),
  };
  let checked = 0;
  for (let i = 0; i < 600; i++) {
    const source = pick(Object.keys(pools));
    const surface = pick(e.allowed(source));
    const text = Array.from({ length: 1 + rand(8) }, pools[source]).join("");
    const r = await e.encode({ text, source, surface });
    if (!r.ok) { assert.ok(["unknownWords", "empty"].includes(r.reason), `${text}: ${r.reason}`); continue; }
    const d = await e.decode({ ciphertext: r.ciphertext, keyText: r.keyText });
    assert.equal(d.text, e.normalize(text, source), text);
    checked++;
  }
  assert.ok(checked > 400, `${checked}`);
});

test("unitText: what the keys spell, before the dictionary hop back", async () => {
  const e = await engine();
  const r = await e.encode({ text: "welcome home", source: "en", surface: "zh_daqian" });
  assert.equal(e.unitText(r.trace), "歡迎家");
  const n = await e.encode({ text: "國家", source: "zh", surface: "zh_daqian" });
  assert.equal(e.unitText(n.trace), "國家");
});

test("a message of digits and punctuation rides entirely in the key", async () => {
  const e = await engine();
  const r = await e.encode({ text: "123 !!!", source: "en", surface: "zh_daqian" });
  assert.equal(r.ciphertext, "");
  const d = await e.decode({ ciphertext: "", keyText: r.keyText });
  assert.deepEqual([d.ok, d.text], [true, "123 !!!"]);
});

test("Cangjie and Quick: the docs/10 §4.1-4.2 facts, refusals and candidate lists", async () => {
  const e = await freshEngine();
  const enc = (text, source, surface) => e.encode({ text, source, surface });
  const units = r => r.trace.segments.flatMap(s => s.words.flatMap(w => w.units || []));
  // 歡迎家, from English: keys, indices and set sizes on both keyboards
  const cj = await enc("welcome home", "en", "zh_cangjie");
  assert.equal(cj.ciphertext, "tgnoyhvljmso");
  assert.deepEqual(units(cj).map(u => [u.keys, u.index, u.count]), [["tgno", 0, 3], ["yhvl", 0, 1], ["jmso", 0, 1]]);
  assert.deepEqual(units(cj).map(u => u.reading), ["tgno", "yhvl", "jmso"]);
  const qk = await enc("welcome home", "en", "zh_quick");
  assert.equal(qk.ciphertext, "toyljo");
  assert.deepEqual(units(qk).map(u => [u.keys, u.index, u.count]), [["to", 0, 59], ["yl", 4, 38], ["jo", 0, 29]]);
  assert.equal(e.unitText(qk.trace), "歡迎家");
  // native Chinese
  for (const [text, c, q] of [["明", "ab", "ab"], ["你好", "onfvnd", "ofvd"], ["中國", "lwirm", "lwm"], ["森林", "ddddd", "dddd"]]) {
    assert.equal((await enc(text, "zh", "zh_cangjie")).ciphertext, c, text);
    assert.equal((await enc(text, "zh", "zh_quick")).ciphertext, q, text);
  }
  const ri = await enc("日曰", "zh", "zh_cangjie");
  assert.deepEqual(units(ri).map(u => [u.keys, u.index, u.count]), [["a", 0, 2], ["a", 1, 2]]);
  // a compatibility ideograph normalizes (NFC) to its twin; 〇 has no code, so it rides in the key
  assert.deepEqual(units(await enc("兀", "zh", "zh_cangjie")).map(u => [u.keys, u.index, u.out]), [["mu", 0, "兀"]]);
  const lit = await enc("〇", "zh", "zh_cangjie");
  assert.deepEqual([lit.ciphertext, lit.leak], ["", [1, 1]]);
  // candidate lists (the popover): complete, in table order
  const l = await e.list("shape:zh_cangjie", "tgno");
  assert.deepEqual([l.count, l.complete, l.items[0]], [3, true, "歡"]);
  const lq = await e.list("shape:zh_quick", "yl");
  assert.deepEqual([lq.count, lq.complete, lq.items[4]], [38, true, "迎"]);
  // refusals: keyed only (docs/10 §2.1), and a well-shaped chunk that is no code is malformed, not missing data
  const key = JSON.parse(cj.keyText);
  const inline = structuredClone(key);
  inline.segments[0].selector_mode = "inline";
  assert.equal((await e.decode({ ciphertext: cj.ciphertext, keyText: JSON.stringify(inline) })).reason, "keyInvalid");
  const fresh = await freshEngine();
  const notCode = await fresh.decode({ ciphertext: "yyyyyhvljmso", keyText: JSON.stringify({ ...key,
    segments: [{ ...key.segments[0], words: [{ ...key.segments[0].words[0], units: [{ len: 5, homophone_index: 0 }, { len: 4, homophone_index: 0 }] }, key.segments[0].words[1]] }] }) });
  assert.equal(notCode.reason, "keyInvalid", JSON.stringify(notCode));
  for (const [cipher, layout, len] of [["abc", "zh_quick", 3], ["az", "zh_cangjie", 2]]) {
    const r = await fresh.decode({ ciphertext: cipher, keyText: JSON.stringify({ keypath: "1.1", tables_sha256: e.edition, source_language: "zh",
      segments: [{ language: "zh", layout, route: [`shape:${layout}`, `keystroke:${layout}`], selector_mode: "keyed", words: [{ units: [{ len, homophone_index: 0 }] }] }] }) });
    assert.equal(r.reason, "keyInvalid", `${layout} ${cipher}`);
  }
  // the v2.0 edition does not list zh_cangjie.tsv
  const old = { ...key, tables_sha256: "67a40391169bcb9b891b52c84e126fb386e5b9b6e1153665ea55aba214c161f2" };
  assert.equal((await e.decode({ ciphertext: cj.ciphertext, keyText: JSON.stringify(old) })).reason, "keyInvalid");
});

test("a Quick key loads the Cangjie rows it derives from, not files of its own", async () => {
  const seen = [];
  const { createEngine } = await import("../assets/js/engine/index.js");
  const { fetchText } = await import("./helpers.js");
  const e = await createEngine({ fetchText: p => { seen.push(p); return fetchText(p); } });
  const r = await e.encode({ text: "welcome home", source: "en", surface: "zh_quick" });
  assert.equal(r.ciphertext, "toyljo");
  assert.ok(!seen.some(p => p.startsWith("data/en/zh_quick/")), seen.join(" "));
  assert.ok(seen.includes("data/en/zh_cangjie/w.json") && seen.includes("data/quick.json"));
  // a fresh engine decodes the key: all 26 Cangjie row files, Quick recoded
  const seen2 = [];
  const d = await (await createEngine({ fetchText: p => { seen2.push(p); return fetchText(p); } })).decode({ ciphertext: r.ciphertext, keyText: r.keyText });
  assert.deepEqual([d.ok, d.text], [true, "welcome home"]);
  assert.equal(seen2.filter(p => p.startsWith("data/en/zh_cangjie/")).length, 26);
  assert.ok(!seen2.some(p => p.startsWith("data/en/zh_quick/") || p.startsWith("data/cangjie/")));
});

test("the Cangjie keyboard legends are read from the table (docs/10 §4.1)", () => {
  const { radicals } = readJson("data/layouts.json").zh_cangjie;
  assert.deepEqual(Object.keys(radicals), [..."abcdefghijklmnopqrstuvwxy"]);
  for (const [key, radical] of Object.entries(radicals)) {
    const shard = readJson(`data/cangjie/${key}.json`);
    if (key === "x") {
      // 難 is the conventional difficult-character key: no character's code is x alone
      assert.equal(radical, "難");
      assert.ok(!Object.hasOwn(shard, "x"));
    } else assert.ok(Array.from(shard[key] || "").includes(radical), `${key}: ${radical} is not coded ${key}`);
  }
});
