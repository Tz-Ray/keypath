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

test("answer hashes reproduce for all twelve challenges", async () => {
  assert.equal(index.length, 12);
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
    es_accent: "bienvenida", en_identity: "welcomehome", zh_eten: "hx8e-2gea", zh_jyutping: "fun1jing4gaa1", ja_kana: "ty'[ebhue" };
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
  assert.deepEqual(e.surfaces.map(s => s.id), ["zh_daqian", "zh_eten", "zh_pinyin", "zh_jyutping", "zh_cangjie", "zh_quick",
    "zh_hanja", "ja_romaji", "ja_kana", "ko_dubeolsik", "ru_jcuken", "es_accent", "vi_telex", "vi_vni", "el_greek", "en_identity"]);
  assert.deepEqual(e.allowed("zh"), ["zh_daqian", "zh_eten", "zh_pinyin", "zh_jyutping", "zh_cangjie", "zh_quick", "zh_hanja"]);
  assert.equal(e.allowed("en").length, 14);
  assert.deepEqual(e.allowed("el"), ["el_greek"]);
  assert.ok(!e.allowed("en").some(s => s.startsWith("vi_")));
  assert.deepEqual(e.allowed("vi"), ["vi_telex", "vi_vni"]);
  assert.deepEqual(e.allowed("ja"), []);
  const cases = { "welcome home": "en", "mañana": "es", "¿qué?": "es", "ёжик": "ru", "한국어": "ko",
    // docs/10 §9.7: a Vietnamese letter Spanish does not share wins over the Spanish test
    "tôi có gì": "vi", "có": "es", "VIỆT NAM": "vi", "đ": "vi", "à": "vi", "xin chao": "en", "canción ở": "vi",
    "國家": "zh", "カタカナ and 漢字": "ja", "123 !?": null,
    // docs/10 §9.7: any Greek-script letter is Greek, before the Spanish test
    "Καλημέρα": "el", "ΟΔΟΣ": "el", "ά": "el", "\u1f08θ\u1fc6ναι": "el", "mañana θ": "el", "café λ": "el",
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
    vi: () => pick(["Việt", "nam", "người", "hòa", "hoà", "THỦY", "xoong", "the", " ", ", ", "2024", "ñ"]),
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

test("ETen, Jyutping and JIS kana: the docs/10 §4.3-§5 facts and refusals", async () => {
  const e = await freshEngine();
  const enc = (text, source, surface) => e.encode({ text, source, surface });
  const units = r => r.trace.segments.flatMap(s => s.words.flatMap(w => w.units || []));
  // ETen: Dàqiān's readings and indices on other keys (§4.3)
  for (const [text, eten, daqian, idx] of [["你好", "ne3hz3", "su3cl3", [0, 0]], ["植物學", ",2x4cuw2", "56j4vm,6", [5, 1, 0]],
    ["明天見", "me-2te8ge84", "au/6wu0ru04", [1, 0, 3]], ["兒子", "=2;3", "-6y3", [1, 0]]]) {
    const r = await enc(text, "zh", "zh_eten"), d = await enc(text, "zh", "zh_daqian");
    assert.deepEqual([r.ciphertext, d.ciphertext], [eten, daqian], text);
    assert.deepEqual(units(r).map(u => u.index), idx, text);
    assert.deepEqual(units(r).map(u => [u.reading, u.count]), units(d).map(u => [u.reading, u.count]), text);
  }
  // Jyutping: one reading per character, typed as written (§4.4), and the pun of hou2
  const jy = await enc("歡迎家", "zh", "zh_jyutping");
  assert.equal(jy.ciphertext, "fun1jing4gaa1");
  assert.deepEqual(units(jy).map(u => [u.reading, u.index, u.count]), [["fun1", 0, 17], ["jing4", 4, 54], ["gaa1", 0, 28]]);
  assert.equal((await enc("銀行", "zh", "zh_jyutping")).ciphertext, "ngan4hang4");
  const hou = await e.list("homophone:zh_jyutping", "hou2");
  assert.deepEqual([hou.count, hou.items[0], hou.complete], [2, "好", true]);
  for (const [reading, count] of [["nei5", 14], ["zung1", 69], ["jyu4", 113]])
    assert.equal((await e.list("homophone:zh_jyutping", reading)).count, count, reading);
  // JIS kana: the romaji key's words and indices, on the kana keys (§5)
  const kana = await enc("welcome home", "en", "ja_kana"), romaji = await enc("welcome home", "en", "ja_romaji");
  assert.equal(kana.ciphertext, "ty'[ebhue");
  assert.deepEqual(units(kana).map(u => [u.reading, u.index, u.count, u.out]), units(romaji).map(u => [u.reading, u.index, u.count, u.out]));
  assert.deepEqual(units(kana).map(u => u.keys), ["ty'[e", "bhue"]);
  for (const [keys, reading] of [["3lt[s4", "ありがとう"], ["iZ-]yb[", "にっぽんご"], ["s4g(4", "とうきょう"], ["\\r[tde", "むずかしい"],
    ["t[Zb4", "がっこう"], ["gZw", "きって"], ["f]y", "ぱん"], ["b+", "こゑ"], ["d-xV", "しほさゐ"], ["t3", "かあ"]]) {
    assert.equal(e.layouts.keysToKana(keys), reading, keys);
    assert.equal(e.layouts.kanaToKeys(reading), keys, reading);
  }
  for (const bad of ["4[", "[", "t[[", "Z", "&"]) assert.throws(() => e.layouts.keysToKana(bad), /cannot be typed|voices no kana/, bad);
  // a kana key names no inline selector (docs/10 §2.1, §5): §5's t3, as JSON and as kp1
  const t3 = { keypath: "1.1", tables_sha256: e.edition, source_language: "ja", segments: [{ language: "ja", layout: "ja_kana",
    route: ["homophone:ja", "keystroke:ja_kana"], selector_mode: "inline", words: [{ units: [{ len: 2 }] }] }] };
  assert.equal((await e.decode({ ciphertext: "t3", keyText: JSON.stringify(t3) })).reason, "keyInvalid");
  const keyed = await e.decode({ ciphertext: "t3", keyText: JSON.stringify({ ...t3, segments: [{ ...t3.segments[0], selector_mode: "keyed" }] }) });
  assert.deepEqual([keyed.ok, keyed.text], [true, "かあ"]);
  for (const sid of ["zh_eten", "zh_jyutping", "ja_kana"]) {
    const r = await enc(sid === "ja_kana" ? "welcome home" : "你好", sid === "ja_kana" ? "en" : "zh", sid);
    const inline = JSON.parse(r.keyText);
    inline.segments[0].selector_mode = "inline";
    assert.equal((await e.decode({ ciphertext: r.ciphertext, keyText: JSON.stringify(inline) })).reason, "keyInvalid", sid);
    // and kp1 carries every one of these keys and gives it back
    const short = e.kp1Pack(r.keyText);
    assert.ok(short.ok, sid);
    const back = await e.decode({ ciphertext: r.ciphertext, keyText: short.text });
    assert.deepEqual([back.ok, back.keyText], [true, r.keyText], sid);
  }
});

test("ETen and kana keys load the rows they derive from, not files of their own", async () => {
  const { createEngine } = await import("../assets/js/engine/index.js");
  const { fetchText } = await import("./helpers.js");
  for (const [sid, base, ciphertext] of [["zh_eten", "zh_daqian", "hx8e-2gea"], ["ja_kana", "ja_romaji", "ty'[ebhue"]]) {
    const seen = [];
    const e = await createEngine({ fetchText: p => { seen.push(p); return fetchText(p); } });
    const r = await e.encode({ text: "welcome home", source: "en", surface: sid });
    assert.equal(r.ciphertext, ciphertext, sid);
    assert.ok(!seen.some(p => p.startsWith(`data/en/${sid}/`)), seen.join(" "));
    assert.ok(seen.includes(`data/en/${base}/w.json`) && seen.includes(`data/en/${base}/h.json`), seen.join(" "));
    // a fresh engine walks the key back through all 26 of the base surface's row files
    const seen2 = [];
    const d = await (await createEngine({ fetchText: p => { seen2.push(p); return fetchText(p); } })).decode({ ciphertext: r.ciphertext, keyText: r.keyText });
    assert.deepEqual([d.ok, d.text], [true, "welcome home"], sid);
    assert.equal(seen2.filter(p => p.startsWith(`data/en/${base}/`)).length, 26, sid);
    assert.ok(!seen2.some(p => p.startsWith(`data/en/${sid}/`)), sid);
  }
  // Jyutping ships its own rows and lists
  const seen = [];
  const e = await createEngine({ fetchText: p => { seen.push(p); return fetchText(p); } });
  assert.equal((await e.encode({ text: "welcome home", source: "en", surface: "zh_jyutping" })).ciphertext, "fun1jing4gaa1");
  assert.ok(seen.includes("data/en/zh_jyutping/w.json") && seen.includes("data/jyutping.json"), seen.join(" "));
});

// A ja unit left at its kana still carries its reading's SKK candidates in
// the Trace (Python's count and head), so the page walks one back only over
// a list it carries (data/ja/lists.json: docs/10 §5's examples), and
// refuses (notCarried) rather than show the kana as the only word.
test("a kana unit left at its kana: Python's count and head, or a refusal", async () => {
  const { createEngine } = await import("../assets/js/engine/index.js");
  const { fetchText } = await import("./helpers.js");
  const seen = [];
  const e = await createEngine({ fetchText: p => { seen.push(p); return fetchText(p); } });
  const kanaKey = (layout, len) => JSON.stringify({ keypath: "1.1", tables_sha256: e.edition, source_language: "ja",
    segments: [{ language: "ja", layout, route: ["homophone:ja", `keystroke:${layout}`], selector_mode: "keyed",
      words: [{ units: [{ len }] }] }] });
  const walk = async (layout, ciphertext) => {
    const r = await e.decode({ ciphertext, keyText: kanaKey(layout, ciphertext.length) });
    return r.ok ? [r.text, ...(({ reading, count, head, index }) => [reading, count, head, index])(r.trace.segments[0].words[0].units[0])]
      : [r.reason, r.message];
  };
  // SKK lists two words for ありがとう, neither of them the kana
  for (const [layout, keys] of [["ja_kana", "3lt[s4"], ["ja_romaji", "arigatou"]])
    assert.deepEqual(await walk(layout, keys), ["ありがとう", "ありがとう", 2, ["有難う", "有り難う"], null], layout);
  assert.ok(seen.includes("data/ja/lists.json"), seen.join(" "));
  // むずかしい has none: the kana alone; §5's t3, read keyed, is かあ, whose one word is 母
  assert.deepEqual(await walk("ja_kana", "\\r[tde"), ["むずかしい", "むずかしい", 1, ["むずかしい"], null]);
  assert.deepEqual(await walk("ja_kana", "t3"), ["かあ", "かあ", 1, ["母"], null]);
  // a reading whose list the page lacks is refused, whether or not SKK has it (かみ: 15 words; ありがと: none)
  for (const [layout, keys, reading] of [["ja_kana", "tn", "かみ"], ["ja_romaji", "kami", "かみ"], ["ja_kana", "3lt[s", "ありがと"],
    ["ja_romaji", "arigato", "ありがと"]]) {
    const [reason, message] = await walk(layout, keys);
    assert.equal(reason, "notCarried", `${layout} ${keys}`);
    assert.equal(message, `the homophone:ja candidates of ${reading}`);
  }
  // ... and so is one whose first four words it does not all know
  e._internal.lists.addEntry("homophone:ja", "かみ", 15, 1, "紙");
  assert.deepEqual(await walk("ja_kana", "tn"), ["notCarried", "the homophone:ja candidates of かみ"]);
});
