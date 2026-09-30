// End-to-end browser checks (SPEC §11.5): serves the repo at /keypath/,
// drives headless Chromium over the DevTools protocol and checks what a
// visitor sees against the engine and the Python-generated fixtures.
//
//   node tools/cdp.mjs                 checks; prints CHROMIUM PASS / FAIL
//   node tools/cdp.mjs --shots DIR     also saves screenshots to DIR
//                                      (default without DIR: tests/.out/)
//
// Screenshots use the Noto CJK fonts in tools/.cache/ when present (see
// tools/build_fonts.py), so machines without CJK fonts show real glyphs.
import { readFileSync, mkdirSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { startServer } from "./serve.mjs";
import { launch, findChrome, fontConfig, sleep } from "./browser.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const SHOTS = shotsAt < 0 ? null : (args[shotsAt + 1] && !args[shotsAt + 1].startsWith("--") ? args[shotsAt + 1] : join(ROOT, "tests/.out"));

const readJson = p => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const readJsonl = p => gunzipSync(readFileSync(join(ROOT, p))).toString("utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));

const chrome = findChrome();
if (!chrome) {
  console.log("CHROMIUM SKIP: no Chromium binary found");
  process.exit(0);
}

const hero = readJson("data/hero.json");
const S = readJson("tests/fixtures/static.json");
const vectors = readJsonl("tests/fixtures/vectors.jsonl.gz");
const decodeErrors = readJsonl("tests/fixtures/decode-errors.jsonl.gz");
const traces = readJsonl("tests/fixtures/traces.jsonl.gz");
const layoutsJson = readJson("data/layouts.json");
const pad = n => String(n).padStart(2, "0");
const chalIndex = readJson("data/challenges/index.json");
const challenges = chalIndex.map(c => readJson(`data/challenges/${pad(c.n)}.json`));
// challenges 7-12: their hints, which the page fetches one per click
const hintsOf = c => Array.from({ length: c.hints || 0 }, (_, i) => readJson(`data/challenges/hints/${pad(c.n)}-${i + 1}.json`));
const CARDS_READY = `document.querySelectorAll('.chal').length === ${chalIndex.length}`;
const kp1Fixtures = readJson("tests/fixtures/kp1.json");
const wbLookups = readJsonl("tests/fixtures/workbench-lookup.jsonl.gz");
const wbTypes = readJsonl("tests/fixtures/workbench-type.jsonl.gz");
const registryJson = readJson("data/registry.json");
const legendsJson = readJson("tests/fixtures/legends.json");
const b64url = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");

// ------------------------------------------------------------ bookkeeping
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? `\n       ${String(detail).slice(0, 600)}` : ""}`);
  return !!ok;
}
async function attempt(name, fn) {
  try { await fn(); } catch (e) { check(name, false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e); }
}

const srv = await startServer(0);
const fontsDir = join(ROOT, "tools/.cache");
const fontsConf = existsSync(fontsDir) ? fontConfig(fontsDir, mkdtempSync(join(tmpdir(), "kp-fonts-"))) : null;
const b = await launch({ chrome, fontsConf });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const js = v => JSON.stringify(v);
// Walk timing.  walkBack (assets/js/ui/walk.js) adds "walking" to the walk,
// then lights its n parts 0, 140, …, (n - 1) × 140 ms later; a timer never
// fires early, so the last part lights at least (n - 1) × 140 ms after
// "walking" was added, however late the first one fires on a busy page.
// WALK_HOOK logs both as they happen, from classList.add itself (a
// MutationObserver's callback runs after the timers are set, too late to
// bound them).
const WALK_HOOK = `if (!window.__walkLog) { window.__walkLog = []; const add = DOMTokenList.prototype.add;
  DOMTokenList.prototype.add = function (...tokens) {
    for (const t of tokens) if (t === "walking" || t === "lit") window.__walkLog.push([t, performance.now()]);
    return add.apply(this, tokens);
  }; }`;
/** The last walk in WALK_HOOK's log lit two or more parts, 140 ms apart. */
function animated(log) {
  const at = log.map(e => e[0]).lastIndexOf("walking");
  if (at < 0) return false;
  const lit = log.slice(at + 1).filter(e => e[0] === "lit").map(e => e[1]);
  // 1 ms for performance.now()'s coarsened clock
  return lit.length >= 2 && lit[lit.length - 1] - log[at][1] >= (lit.length - 1) * 140 - 1;
}
const q = sel => `document.querySelector(${js(sel)})`;

async function open(width = 1280, height = 800, { dark = false, reduced = false, hash = "" } = {}) {
  await b.viewport(width, height);
  await b.media({ dark, reduced });
  await b.navigate("about:blank");
  await b.navigate(srv.url + hash);
  await b.waitFor("document.documentElement.classList.contains('ready')");
}
const cipherIs = text => `(${q("#cipher")}.textContent === ${js(text)} && !${q("#enc-result")}.hidden)`;
const keyIs = text => `(${q("#key-pre")}.textContent === ${js(text)})`;
const settle = () => b.waitFor("!document.querySelector('#enc-result').classList.contains('busy') && !document.querySelector('#cipher .looking')");
const noHScroll = width => b.evaluate(`document.documentElement.scrollWidth <= ${width} && innerWidth === ${width}`);

async function shot(name, opts) {
  if (!SHOTS) return;
  await b.screenshot(join(SHOTS, `${name}.png`), opts);
}
async function shotOf(name, selector) {
  if (!SHOTS) return;
  const r = await b.evaluate(`(() => { const e = ${q(selector)}; e.scrollIntoView({ block: "start" }); scrollBy(0, -72);
    const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
  await sleep(250);
  const w = await b.evaluate("innerWidth");
  await b.screenshot(join(SHOTS, `${name}.png`), {
    clip: { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(w, r.width + 24), height: Math.min(r.height + 24, 4000) },
  });
}

/** Type a message the way a visitor does: pick the language and keyboard, then type. */
async function typeMessage(text, source, surface) {
  await b.evaluate(`(() => { const s = ${q("#lang")}; s.value = ${js(source)}; s.dispatchEvent(new Event("change")); })()`);
  await b.evaluate(`${q(`input[name=kbd][value=${surface}]`)}.click()`);
  await b.evaluate(`(() => { const t = ${q("#msg")}; t.focus(); t.select(); })()`);
  await b.send("Input.insertText", { text });
}

/** typeMessage, then wait until the page shows what the engine encodes for it. */
async function typeAndWait(text, source, surface) {
  const want = await b.evaluate(`window.__keypath.engine.encode({ text: ${js(text)}, source: ${js(source)}, surface: ${js(surface)} }).then(r => r.ciphertext)`);
  await typeMessage(text, source, surface);
  await b.waitFor(`${cipherIs(want)} && ${q("#caption bdi")} && ${q("#caption bdi")}.textContent === window.__keypath.engine.normalize(${js(text)}, ${js(source)})`);
  await settle();
  return want;
}

/** The keyboard picture as drawn: key -> [US label, legend, tone key, dead key, dimmed]. */
const pictureOf = () => b.evaluate(`Object.fromEntries([...document.querySelectorAll("#kbd-pic .kb-key")].map(k =>
  [k.dataset.key, [k.querySelector(".us").textContent, k.querySelector(".sym") ? k.querySelector(".sym").textContent : "",
    k.classList.contains("tone"), k.classList.contains("dead"), k.classList.contains("unused")]]))`);
const shiftedOf = key => legendsJson.usShiftedRows.join("")[legendsJson.usRows.join("").indexOf(key)];
/** Whether every key of a drawn picture carries KeyPath's legend for what it types. */
const matches = (pic, layout, shift) => Object.entries(pic).every(([key, [us, sym]]) => {
  const typed = shift ? shiftedOf(key) : key;
  // KeyPath's legends, except where its picture shows another label (kana's [ ゛ and ] ゜)
  const want = (legendsJson.pictures[layout] || {})[typed] ?? legendsJson.layouts[layout][typed] ?? "";
  return sym === want && us === (typed === key ? key : `⇧${typed}`);
});
/** Every key inside the picture, and the picture inside its box. */
const pictureFits = () => b.evaluate(`(() => { const p = ${q("#kbd-pic .kb-pic")}; const box = ${q("#kbd-pic")}.getBoundingClientRect();
  return [...p.querySelectorAll(".kb-key")].every(k => k.getBoundingClientRect().right <= box.right + 0.5) && p.scrollWidth <= p.clientWidth + 1; })()`);

// ================================================================ checks
await attempt("hero", async () => {
  await open(1280, 800);
  check("hero: ciphertext shown", await b.evaluate(cipherIs(hero.ciphertext)));
  check("hero: key panel is the exact key file", await b.evaluate(keyIs(hero.keyText)));
  check("hero: figure drawn", await b.evaluate("document.querySelectorAll('#walk .unit').length === 3"));
  // the live engine re-encodes the hero once idle; the page must not change
  await sleep(2500);
  check("hero: engine reproduces the precomputed hero", await b.evaluate(cipherIs(hero.ciphertext) + " && " + keyIs(hero.keyText)));
  const live = await b.evaluate(`window.__keypath.engine.encode({ text: ${js(hero.text)}, source: "en", surface: "zh_daqian" }).then(r => r.keyText)`);
  check("hero: live encode equals hero.json", live === hero.keyText);
  await b.evaluate(`${q("#walk-back")}.click()`);
  await b.waitFor(`!${q("#walked")}.hidden`);
  const walked = await b.evaluate(`${q("#walked")}.textContent`);
  check("hero: walk back", walked === `Walked back: “${hero.text}”, identical to your message.`, walked);
});

await attempt("example chips", async () => {
  const chips = await b.evaluate("[...document.querySelectorAll('#examples button')].map(b => b.dataset.text)");
  check("chips: eight examples", chips.length === 8 && S.chips.length === 8 && chips.every((t, i) => t === S.chips[i].text), chips);
  for (const [i, c] of S.chips.entries()) {
    await b.evaluate(`document.querySelectorAll('#examples button')[${i}].click()`);
    await b.waitFor(cipherIs(c.ciphertext));
    await settle();
    const key = await b.evaluate(`window.__keypath.engine.encode({ text: ${js(c.text)}, source: ${js(c.source)}, surface: ${js(c.surface)} }).then(r => r.keyText)`);
    check(`chip ${c.text}: ciphertext ${c.ciphertext}`, await b.evaluate(keyIs(key)));
  }
});

await attempt("shape keyboards", async () => {
  // "welcome home" on Cangjie and Quick (docs/10 §4.2: 歡迎家), from the chips
  for (const [w, h] of [[1280, 800], [360, 780]]) {
    await open(w, h);
    for (const [surface, want] of [["zh_cangjie", "tgnoyhvljmso"], ["zh_quick", "toyljo"]]) {
      await b.evaluate(`${q(`input[name=kbd][value=${surface}]`)}.click()`);
      await b.waitFor(cipherIs(want));
      await settle();
      check(`${surface} at ${w}px: "welcome home" shows ${want}`, await b.evaluate(cipherIs(want)));
      const key = await b.evaluate(`window.__keypath.engine.encode({ text: "welcome home", source: "en", surface: ${js(surface)} }).then(r => r.keyText)`);
      check(`${surface} at ${w}px: the key panel is the exact key file`, await b.evaluate(keyIs(key)));
      check(`${surface} at ${w}px: no horizontal scroll`, await noHScroll(w), await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
    }
  }
  await open(1280, 800);
  await b.evaluate(`${q("input[name=kbd][value=zh_cangjie]")}.click()`);
  await b.waitFor(cipherIs("tgnoyhvljmso"));
  await settle();
  // the walk: a Shape band with each code's radicals (the code beneath), labelled Shape
  const shapes = await b.evaluate(`[...document.querySelectorAll("#walk .unit .b-shape")].map(b => [b.querySelector(".radicals").textContent, b.querySelector(".py").textContent])`);
  check("Cangjie: the Shape band shows radicals over each code", js(shapes) === js([["廿土弓人", "tgno"], ["卜竹女中", "yhvl"], ["十一尸人", "jmso"]]), js(shapes));
  check("Cangjie: the band is labelled Shape, and there is no Sound band",
    await b.evaluate(`[...document.querySelectorAll("#walk .walk-gutter span")].some(s => s.textContent === "Shape") && !document.querySelector("#walk .b-sound")`));
  const legends = await b.evaluate(`[...document.querySelectorAll("#walk .unit")][0].querySelectorAll("kbd .leg").length`);
  check("Cangjie: every keycap carries its radical", legends === 4, legends);
  // the keyboard picture: radical legends read from the table, x is 難, z unused
  await b.evaluate(`${q("#kbd-panel")}.open = true`);
  const pic = await b.evaluate(`Object.fromEntries([...document.querySelectorAll("#kbd-pic .kb-key")].map(k => [k.querySelector(".us").textContent, k.querySelector(".sym") ? k.querySelector(".sym").textContent : ""]))`);
  const radicals = await b.evaluate("window.__keypath.engine.layouts.radicals");
  check("Cangjie keyboard: a-y carry their radicals, z is unused",
    [..."abcdefghijklmnopqrstuvwxy"].every(k => pic[k] === radicals[k]) && pic.x === "難" && pic.a === "日" && pic.z === "", js(pic));
  // the candidate popover names the code and its radicals
  await b.evaluate(`document.querySelector('#walk .stack').click()`);
  await b.waitFor(`document.querySelector('.popover') && !document.querySelector('.popover').hidden`);
  const title = await b.evaluate(`document.querySelector('.popover .pop-title').textContent`);
  check("Cangjie: the popover lists the code's characters", title === "tgno · 廿土弓人: 3 characters share this code", title);
  await b.evaluate("document.querySelector('.popover .pop-close').click()");
  // Quick: the note says how its codes are made
  await b.evaluate(`${q("input[name=kbd][value=zh_quick]")}.click()`);
  await b.waitFor(cipherIs("toyljo"));
  await settle();
  check("Quick: the keyboard picture explains the first and last letters",
    await b.evaluate(`[...document.querySelectorAll("#kbd-pic .kb-note")].some(n => n.textContent.startsWith("Quick types only the first and last letters"))`));
  // Chinese typed on both, and a message mixing the three Chinese keyboards walked back
  const guo = await typeAndWait("中國", "zh", "zh_cangjie");
  check("Cangjie: 中國 typed as lwirm", guo === "lwirm", guo);
  const guoQ = await typeAndWait("中國", "zh", "zh_quick");
  check("Quick: 中國 typed as lwm", guoQ === "lwm", guoQ);
});

await attempt("vietnamese", async () => {
  // docs/10 §6.6: every golden, typed on the Telex and the VNI chip, shows Python's ciphertext and key
  const goldens = vectors.filter(v => v.class === "golden-vi");
  check("Vietnamese: the goldens are on both keyboards", ["vi_telex", "vi_vni"].every(s => goldens.filter(v => v.surface === s).length >= 17), goldens.length);
  for (const [w, h] of [[1280, 800], [360, 780]]) {
    await open(w, h);
    for (const v of w === 1280 ? goldens : goldens.filter((_, i) => i % 3 === 0)) {
      await typeMessage(v.text, "vi", v.surface);
      try {
        await b.waitFor(`${cipherIs(v.expect.ciphertext)} && ${keyIs(v.expect.keyText)}`, 15000);
        await settle();
        check(`${v.surface} at ${w}px: "${v.text}" shows ${js(v.expect.ciphertext)} and Python's key`, await b.evaluate(`${cipherIs(v.expect.ciphertext)} && ${keyIs(v.expect.keyText)}`));
      } catch {
        const got = await b.evaluate(`[${q("#cipher")}.textContent, ${q("#enc-refusal")}.textContent]`);
        check(`${v.surface} at ${w}px: "${v.text}" shows ${js(v.expect.ciphertext)} and Python's key`, false, js(got));
      }
    }
    check(`Vietnamese at ${w}px: no horizontal scroll`, await noHScroll(w), await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
    // a long message, with the keyboard legend open
    const long = vectors.find(v => v.class === "edge" && v.source === "vi" && v.surface === "vi_vni" && Array.from(v.text).length >= 190);
    await typeMessage(long.text, "vi", "vi_vni");
    await b.waitFor(`${cipherIs(long.expect.ciphertext)} && ${keyIs(long.expect.keyText)}`, 15000);
    await b.evaluate(`${q("#kbd-panel")}.open = true`);
    await sleep(150);
    check(`Vietnamese at ${w}px: a 200-character message and the keyboard legend, no horizontal scroll`, await noHScroll(w),
      await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
  }

  // detection (docs/10 §9.7): a letter Spanish does not share makes the message Vietnamese
  await open(1280, 800);
  const typeFresh = async text => {
    await b.evaluate(`(() => { const t = ${q("#msg")}; t.value = ""; t.dispatchEvent(new Event("input")); t.focus(); })()`);
    await b.send("Input.insertText", { text });
  };
  await typeFresh("tôi có gì");
  await b.waitFor(cipherIs("tooicosgif"));
  await settle();
  check("detect: “tôi có gì” is Vietnamese, typed on Telex",
    await b.evaluate(`${q("#lang")}.value === "vi" && ${q("#lang-mode")}.textContent === "detected" && ${q("input[name=kbd][value=vi_telex]")}.checked`));
  // the walk: one unit per syllable, each letter over its keys, the modifier and tone keys marked
  const pairs = await b.evaluate(`[...document.querySelectorAll("#walk .unit")].map(u => [...u.querySelectorAll(".pair")].map(p =>
    [p.querySelector(".lcell").textContent, [...p.querySelectorAll("kbd")].map(k => k.querySelector(".main").textContent + (k.querySelector(".leg") ? k.querySelector(".leg").textContent : ""))]))`);
  check("walk: tôi có gì, each letter over its keys", js(pairs) === js([[["t", ["t"]], ["ô", ["o", "oô"]], ["i", ["i"]]],
    [["c", ["c"]], ["ó", ["o", "só"]]], [["g", ["g"]], ["ì", ["i", "fì"]]]]), js(pairs));
  check("walk: the band is labelled Letters", await b.evaluate(`[...document.querySelectorAll("#walk .walk-gutter span")].some(s => s.textContent === "Letters") && !document.querySelector("#walk .b-sound")`));
  // walk back animates, unit by unit, and reads the message back
  await b.evaluate(`${WALK_HOOK} window.__litVi = []; window.__obsVi = new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains("lit")) window.__litVi.push(performance.now()); });
    window.__obsVi.observe(${q("#walk")}, { subtree: true, attributes: true, attributeFilter: ["class"] });`);
  await b.evaluate(`${q("#walk-back")}.click()`);
  await b.waitFor(`!${q("#walked")}.hidden`);
  const [lit, log] = await b.evaluate("window.__obsVi.disconnect(), [window.__litVi, window.__walkLog]");
  check("walk back on Telex animates, unit by unit", lit.length >= 6 && animated(log), js([lit.length, log]));
  check("walk back on Telex reads the message back",
    await b.evaluate(`${q("#walked")}.textContent === "Walked back: “tôi có gì”, identical to your message."`), await b.evaluate(`${q("#walked")}.textContent`));
  // the keyboard picture: the modifier and tone legend, read from the table
  await b.evaluate(`${q("#kbd-panel")}.open = true`);
  const legend = await b.evaluate(`[...document.querySelectorAll("#kbd-pic .kb-vi")].map(ul => [...ul.children].map(li => [li.textContent, li.classList.contains("used")]))`);
  const telex = layoutsJson.vi_telex;
  const example = name => `a${layoutsJson.vi_syllables.tones.find(t => t[0] === name)[1]}`.normalize("NFC");
  check("Telex keyboard: the modifier and tone keys are the table's, those the message uses marked",
    js(legend) === js([telex.letters.map(([l, k]) => [`${k} ${l}`, l === "ô"]), telex.tones.map(([n, k]) => [`${k} ${n} (${example(n)})`, ["sắc", "huyền"].includes(n)])]), js(legend));
  const placement = await b.evaluate(`[...document.querySelectorAll("#kbd-pic .kb-note")].map(n => n.textContent)`);
  check("Telex keyboard: the keys record where the tone sits", placement.includes("The keys record where the tone mark sits: hòa is hofa, hoà is hoaf."), js(placement));
  check("Telex keyboard: the note says how a syllable is typed", placement[0].startsWith("Type each letter as its base letter, then its modifier key if it has one."), js(placement));
  // VNI: the digits carry the misdirection dot and name the letter they make
  await b.evaluate(`${q("input[name=kbd][value=vi_vni]")}.click()`);
  await b.waitFor(cipherIs("to6ico1gi2"));
  await settle();
  const digits = await b.evaluate(`[...document.querySelectorAll("#walk kbd.mis")].map(k => [k.querySelector(".main").textContent, k.querySelector(".leg").textContent, k.title])`);
  check("VNI: each digit carries its letter and the misdirection dot", js(digits) === js([["6", "ô", 'On this keyboard "6" types ô.'], ["1", "ó", 'On this keyboard "1" types ó.'], ["2", "ì", 'On this keyboard "2" types ì.']]), js(digits));
  const vni = layoutsJson.vi_vni;
  const legendV = await b.evaluate(`[...document.querySelectorAll("#kbd-pic .kb-vi")].map(ul => [...ul.children].map(li => li.textContent))`);
  check("VNI keyboard: the modifier and tone digits are the table's",
    js(legendV) === js([vni.letters.map(([l, k]) => `${k} ${l}`), vni.tones.map(([n, k]) => `${k} ${n} (${example(n)})`)]), js(legendV));
  const noteV = await b.evaluate(`document.querySelector("#kbd-pic .kb-note").textContent`);
  check("VNI keyboard: the note says how a syllable is typed", noteV.startsWith("Type each letter as its base letter, then its modifier digit (6 to 9)")
    && noteV.includes("type the tone digit (1 to 5), once per syllable"), noteV);
  // "có" alone stays Spanish (the writer can pick Vietnamese by hand)
  await typeFresh("có");
  await b.waitFor(`${q("#lang")}.value === "es" && !${q("#enc-result")}.hidden`);
  check("detect: “có” alone stays Spanish", await b.evaluate(`${q("#lang-mode")}.textContent === "detected" && ${q("input[name=kbd][value=es_accent]")}.checked`));
  // Telex and VNI segments alternating in one key, walked back
  const mixed = traces.find(t => t.id === "mixed-3");
  await b.evaluate(`${q("#tab-dec")}.click()`);
  await b.evaluate(`(() => { ${q("#dec-cipher")}.value = ${js(mixed.ciphertext)}; ${q("#dec-key")}.value = ${js(mixed.keyText)}; ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-out")}.hidden || !${q("#dec-err")}.hidden`);
  const badges = await b.evaluate(`[${q("#dec-text")}.textContent, [...document.querySelectorAll("#dec-walk .seg-badge")].map(x => x.textContent)]`);
  check("walk one back: Telex and VNI segments, each under its badge", badges[0] === mixed.trace.text
    && js(badges[1]) === js(mixed.trace.segments.map(s => (s.layout === "vi_telex" ? "Telex" : "VNI") + " · Vietnamese")), js(badges));
  await b.evaluate(`${q("#tab-enc")}.click()`);
});

await attempt("ETen, Jyutping and kana", async () => {
  // docs/10 §4.3-§4.4: every golden typed on the ETen and Jyutping chips shows Python's ciphertext and key
  const goldens = vectors.filter(v => v.class === "golden-m16" && (v.surface === "zh_eten" || v.surface === "zh_jyutping"));
  const hello = sid => goldens.find(v => v.surface === sid && v.text === "你好");
  check("M16 goldens: 你好 is ne3hz3 on ETen and nei5hou2 on Jyutping, all goldens on both chips",
    hello("zh_eten").expect.ciphertext === "ne3hz3" && hello("zh_jyutping").expect.ciphertext === "nei5hou2"
    && goldens.filter(v => v.surface === "zh_eten").length === 6 && goldens.filter(v => v.surface === "zh_jyutping").length === 8, goldens.length);
  for (const [w, h] of [[1280, 800], [360, 780]]) {
    await open(w, h);
    for (const v of w === 1280 ? goldens : goldens.filter(g => g.text === "你好")) {
      await typeMessage(v.text, "zh", v.surface);
      try {
        await b.waitFor(`${cipherIs(v.expect.ciphertext)} && ${keyIs(v.expect.keyText)}`, 15000);
        await settle();
        check(`${v.surface} at ${w}px: "${v.text}" shows ${js(v.expect.ciphertext)} and Python's key`, await b.evaluate(`${cipherIs(v.expect.ciphertext)} && ${keyIs(v.expect.keyText)}`));
      } catch {
        const got = await b.evaluate(`[${q("#cipher")}.textContent, ${q("#enc-refusal")}.textContent]`);
        check(`${v.surface} at ${w}px: "${v.text}" shows ${js(v.expect.ciphertext)} and Python's key`, false, js(got));
      }
    }
    check(`ETen and Jyutping at ${w}px: no horizontal scroll`, await noHScroll(w), await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
  }
  // the walk on ETen: bopomofo legends on the keys, the misdirection dot on digits and punctuation
  await typeMessage("你好", "zh", "zh_eten");
  await b.waitFor(cipherIs("ne3hz3"));
  await settle();
  const etCaps = await b.evaluate(`[...document.querySelectorAll("#walk .unit")].map(u => [u.querySelector(".b-sound .sound").textContent,
    [...u.querySelectorAll("kbd")].map(k => k.querySelector(".main").textContent + k.querySelector(".leg").textContent + (k.classList.contains("mis") ? "*" : ""))])`);
  check("ETen walk: 你好, each key under its bopomofo", js(etCaps) === js([["ㄋㄧˇ", ["nㄋ", "eㄧ", "3ˇ*"]], ["ㄏㄠˇ", ["hㄏ", "zㄠ", "3ˇ*"]]]), js(etCaps));
  // the Jyutping popover lists the syllable's characters: 好 is 0 of 2 (on Pinyin, hou2 is 侯's)
  await typeMessage("你好", "zh", "zh_jyutping");
  await b.waitFor(cipherIs("nei5hou2"));
  await settle();
  await b.evaluate(`document.querySelectorAll('#walk .stack')[1].click()`);
  await b.waitFor(`document.querySelector('.popover') && !document.querySelector('.popover').hidden`);
  const jyTitle = await b.evaluate(`[document.querySelector('.popover .pop-title').textContent, [...document.querySelectorAll('.popover .cand .cg')].map(c => c.textContent)]`);
  check("Jyutping: the popover lists hou2's two characters", jyTitle[0] === "hou2: 2 characters share this sound" && js(jyTitle[1].slice(0, 1)) === js(["好"]), js(jyTitle));
  await b.evaluate("document.querySelector('.popover .pop-close').click()");

  // docs/10 §5: ありがとう typed as Japanese is refused (the page carries no Japanese dictionary) ...
  await open(1280, 800);
  const kanaGolden = vectors.find(v => v.class === "golden-m16" && v.surface === "ja_kana" && v.text === "ありがとう");
  check("kana golden: ありがとう is 3lt[s4 (Python)", kanaGolden.expect.ciphertext === "3lt[s4" && js(kanaGolden.jsRefusal) === js(["jaSource"]));
  await b.evaluate(`${q("input[name=kbd][value=ja_kana]")}.click()`);
  await b.waitFor(cipherIs(S.heroAll.ja_kana));
  await b.evaluate(`(() => { const t = ${q("#msg")}; t.value = ""; t.dispatchEvent(new Event("input")); t.focus(); })()`);
  await b.send("Input.insertText", { text: "ありがとう" });
  await b.waitFor(`!${q("#enc-refusal")}.hidden`);
  check("kana: a Japanese message is refused with its reason, keeping the kana keyboard",
    await b.evaluate(`${q("#enc-refusal")}.textContent.startsWith("Japanese messages need the full Japanese dictionary") && ${q("input[name=kbd][value=ja_kana]")}.checked`),
    await b.evaluate(`${q("#enc-refusal")}.textContent`));
  // ... and its key, from Python, walks back to ありがとう on the page, each kana over its keys
  await b.evaluate(`${q("#tab-dec")}.click()`);
  await b.evaluate(`(() => { ${q("#dec-cipher")}.value = ${js(kanaGolden.expect.ciphertext)}; ${q("#dec-key")}.value = ${js(kanaGolden.expect.keyText)}; ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-out")}.hidden || !${q("#dec-err")}.hidden`);
  const kanaWalk = await b.evaluate(`[${q("#dec-text")}.textContent, [...document.querySelectorAll("#dec-walk kbd")].map(k => k.querySelector(".main").textContent + (k.querySelector(".leg") ? k.querySelector(".leg").textContent : "")),
    [...document.querySelectorAll("#dec-walk .rank")].map(r => r.textContent), [...document.querySelectorAll("#dec-walk .seg-badge")].map(x => x.textContent)]`);
  check("kana: ありがとう's key walks back, kana over its keys, as typed", kanaWalk[0] === "ありがとう"
    && js(kanaWalk[1]) === js(["3あ", "lり", "tか", "[゛", "sと", "4う"]) && js(kanaWalk[2]) === js(["kana as typed"]), js(kanaWalk));
  // its unit, left at its kana, still names the reading's SKK words (Python's count 2), never the kana alone
  await b.evaluate(`document.querySelector('#dec-walk .stack').click()`);
  await b.waitFor(`document.querySelector('.popover') && !document.querySelector('.popover').hidden`);
  const kanaPop = await b.evaluate(`[document.querySelector('.popover .pop-title').textContent, [...document.querySelectorAll('.popover .cand .cg')].map(c => c.textContent)]`);
  check("kana: the unit's popover lists SKK's two words for ありがとう", kanaPop[0] === "ありがとう: 2 words share this reading"
    && js(kanaPop[1]) === js(["有難う", "有り難う"]), js(kanaPop));
  await b.evaluate("document.querySelector('.popover .pop-close').click()");
  // a kana unit whose reading's list the page lacks is refused, with the reason
  const lacking = JSON.parse(kanaGolden.expect.keyText);
  lacking.segments[0].words[0].units[0].len = 5;
  await b.evaluate(`(() => { ${q("#dec-err")}.hidden = true; ${q("#dec-cipher")}.value = "3lt[s"; ${q("#dec-key")}.value = ${js(JSON.stringify(lacking))}; ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-err")}.hidden`);
  const lackMsg = await b.evaluate(`${q("#dec-err")}.textContent`);
  check("kana: a unit whose list the page lacks is refused, not shown as the kana alone",
    lackMsg.includes("This key needs dictionary data this page doesn't carry (the homophone:ja candidates of ありがと)"), lackMsg);
  await b.evaluate(`${q("#tab-enc")}.click()`);

  // a #walk link on a new keyboard (the kana golden, its key as kp1) decodes and animates
  const kp1 = await b.evaluate(`window.__keypath.engine.kp1Pack(${js(kanaGolden.expect.keyText)})`);
  check("kana: the golden key has a kp1 form", kp1.ok && kp1.text.startsWith("kp1."), js(kp1));
  const watch = await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `${WALK_HOOK} window.__lit = [];
    new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains("lit")) window.__lit.push(performance.now()); })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });` });
  for (const [name, body] of [["kana", { c: kanaGolden.expect.ciphertext, k: kp1.text }],
    ["Jyutping", { c: hello("zh_jyutping").expect.ciphertext, j: JSON.stringify(JSON.parse(hello("zh_jyutping").expect.keyText)) }]]) {
    await b.navigate("about:blank");
    await b.navigate(`${srv.url}#walk=${b64url(body)}`);
    await b.waitFor("document.documentElement.classList.contains('ready')");
    await b.waitFor(`!${q("#dec-out")}.hidden || !${q("#dec-err")}.hidden`, 20000);
    // every unit, then its word, lit
    await b.waitFor(`document.querySelectorAll("#dec-walk .unit").length > 0 && [...document.querySelectorAll("#dec-walk .unit, #dec-walk .wg")].every(e => e.classList.contains("lit"))`);
    const got = await b.evaluate(`[${q("#dec-text")}.textContent, ${q("#dec-err")}.hidden, window.__lit.length, window.__walkLog]`);
    const want = name === "kana" ? "ありがとう" : "你好";
    // unit by unit, then the word: each lights up 140 ms after the one before
    check(`walk link on ${name}: decodes and animates`, got[0] === want && got[1] && got[2] >= 2 && animated(got[3]), js(got));
  }
  await b.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: watch.identifier });

  // the keyboard pictures: legends from the tables, the kana shift layer, no overflow
  for (const [w, h] of [[1280, 800], [360, 780]]) {
    await open(w, h);
    for (const sid of ["zh_eten", "zh_jyutping", "ja_kana"]) {
      await b.evaluate(`${q(`input[name=kbd][value=${sid}]`)}.click()`);
      await b.waitFor(cipherIs(S.heroAll[sid]));
      await settle();
      await b.evaluate(`${q("#kbd-panel")}.open = true`);
      await sleep(120);
      const pic = await pictureOf();
      check(`${sid} keyboard at ${w}px: 47 keys, = and \\ among them, legends as KeyPath's`,
        Object.keys(pic).length === 47 && "=" in pic && "\\" in pic && matches(pic, sid, false), js(pic).slice(0, 500));
      if (sid === "zh_eten") check(`ETen keyboard at ${w}px: 7 is ㄑ, the tone keys 2 3 4 1`, pic["7"][1] === "ㄑ"
        && Object.entries(pic).filter(([, v]) => v[2]).map(([k]) => k).sort().join("") === "1234", js(pic["7"]));
      if (sid === "zh_jyutping") check(`Jyutping keyboard at ${w}px: the six tone digits and their names`,
        Object.entries(pic).filter(([, v]) => v[2]).map(([k]) => k).sort().join("") === "123456"
        && await b.evaluate(`[...document.querySelectorAll("#kbd-pic .kb-note")].some(n => n.textContent.endsWith("5 low rising · 6 low level."))`));
      if (sid === "ja_kana") {
        check(`kana keyboard at ${w}px: \\ is む, [ and ] voice`, pic["\\"][1] === "む" && pic["["][1] === "゛" && pic["]"][1] === "゜", js([pic["\\"], pic["["]]));
        await b.evaluate(`${q("#kbd-pic .kb-shift input")}.click()`);
        await sleep(80);
        const shifted = await pictureOf();
        check(`kana keyboard at ${w}px with Shift: 0 is を, v is ゐ, z is っ, all as KeyPath's`,
          shifted["0"][1] === "を" && shifted.v[1] === "ゐ" && shifted.z[1] === "っ" && shifted["0"][0] === "⇧)" && matches(shifted, sid, true),
          js([shifted["0"], shifted.v, shifted.z]));
        const notes = await b.evaluate(`[...document.querySelectorAll("#kbd-pic .kb-note, #kbd-pic li")].map(n => n.textContent)`);
        check(`kana keyboard at ${w}px: the voicing and shift notes`, notes.includes("Each key types one kana. [ after a kana adds ゛ (か t, が t[); ] after a kana adds ゜ (は f, ぱ f]).")
          && notes.includes(") を (Shift+0)") && notes.includes("V ゐ (Shift+v)"), js(notes));
      }
      const fits = await pictureFits();
      check(`${sid} keyboard at ${w}px: every key inside the picture, no horizontal scroll`, fits && await noHScroll(w),
        await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
    }
  }
  // Dubeolsik reads its shifted jamo through the same shift map
  await open(1280, 800);
  await b.evaluate(`${q("input[name=kbd][value=ko_dubeolsik]")}.click()`);
  await b.waitFor(cipherIs(S.heroAll.ko_dubeolsik));
  await b.evaluate(`${q("#kbd-panel")}.open = true`);
  await b.evaluate(`${q("#kbd-pic .kb-shift input")}.click()`);
  const ko = await pictureOf();
  check("Dubeolsik keyboard with Shift: Q W E R T O P show their doubled jamo, as KeyPath's", matches(ko, "ko_dubeolsik", true)
    && "qwertop".split("").map(k => ko[k][1]).join("") === "ㅃㅉㄸㄲㅆㅒㅖ", js(ko.q));
});

await attempt("greek", async () => {
  // docs/10 §7.1 and §7.3: every golden typed on the Greek chip, native and from English, shows Python's ciphertext and key
  const goldens = vectors.filter(v => v.class === "golden-el");
  const golden = (source, text) => goldens.find(v => v.source === source && v.text === text);
  check("Greek goldens: καλημέρα is kalhm;era, ΟΔΟΣ is odow, English cat is g;ata (Python), twelve in all",
    golden("el", "καλημέρα").expect.ciphertext === "kalhm;era" && golden("el", "ΟΔΟΣ").expect.ciphertext === "odow"
    && golden("en", "cat").expect.ciphertext === "g;ata" && goldens.length === 12 && goldens.every(v => v.surface === "el_greek"), goldens.length);
  for (const [w, h] of [[1280, 800], [360, 780]]) {
    await open(w, h);
    for (const v of w === 1280 ? goldens : goldens.filter(g => ["καλημέρα", "ΟΔΟΣ", "cat"].includes(g.text))) {
      await typeMessage(v.text, v.source, "el_greek");
      try {
        await b.waitFor(`${cipherIs(v.expect.ciphertext)} && ${keyIs(v.expect.keyText)}`, 15000);
        await settle();
        check(`el_greek at ${w}px: ${v.source} "${v.text}" shows ${js(v.expect.ciphertext)} and Python's key`,
          await b.evaluate(`${cipherIs(v.expect.ciphertext)} && ${keyIs(v.expect.keyText)} && ${q("input[name=kbd][value=el_greek]")}.checked`));
      } catch {
        const got = await b.evaluate(`[${q("#cipher")}.textContent, ${q("#enc-refusal")}.textContent]`);
        check(`el_greek at ${w}px: ${v.source} "${v.text}" shows ${js(v.expect.ciphertext)} and Python's key`, false, js(got));
      }
    }
    check(`Greek at ${w}px: no horizontal scroll`, await noHScroll(w), await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
  }

  // detection (docs/10 §9.7): a Greek sentence is Greek, typed on the Greek keyboard; "tôi có gì" is still Vietnamese
  await open(1280, 800);
  const typeFresh = async text => {
    await b.evaluate(`(() => { const t = ${q("#msg")}; t.value = ""; t.dispatchEvent(new Event("input")); t.focus(); })()`);
    await b.send("Input.insertText", { text });
  };
  const sentence = "Η θάλασσα είναι ωραία σήμερα, φίλε μου.";
  const sentenceKeys = await b.evaluate(`window.__keypath.engine.encode({ text: ${js(sentence)}, source: "el", surface: "el_greek" }).then(r => r.ciphertext)`);
  await typeFresh(sentence);
  await b.waitFor(cipherIs(sentenceKeys));
  await settle();
  check("detect: a Greek sentence is Greek, typed on the Greek keyboard",
    await b.evaluate(`${q("#lang")}.value === "el" && ${q("#lang-mode")}.textContent === "detected" && ${q("input[name=kbd][value=el_greek]")}.checked`),
    await b.evaluate(`[${q("#lang")}.value, ${q("#lang-mode")}.textContent]`));
  await typeFresh("tôi có gì");
  await b.waitFor(cipherIs("tooicosgif"));
  check("detect: “tôi có gì” is still Vietnamese, typed on Telex",
    await b.evaluate(`${q("#lang")}.value === "vi" && ${q("#lang-mode")}.textContent === "detected" && ${q("input[name=kbd][value=vi_telex]")}.checked`));

  // the walk: one unit per word, each letter over its keys, an accented letter over its dead key and its vowel
  await typeFresh("προϊόν καλημέρα");
  await b.waitFor(cipherIs("pro:i;onkalhm;era"));
  await settle();
  const pairs = await b.evaluate(`[...document.querySelectorAll("#walk .unit")].map(u => [...u.querySelectorAll(".pair")].map(p =>
    [p.querySelector(".lcell").textContent, [...p.querySelectorAll("kbd")].map(k => (k.querySelector(".shift") ? "⇧" : "")
      + k.querySelector(".main").textContent + (k.querySelector(".leg") ? k.querySelector(".leg").textContent : "") + (k.classList.contains("mis") ? "*" : ""))]))`);
  check("Greek walk: προϊόν καλημέρα, each letter over its keys, the dead keys first", js(pairs) === js([
    [["π", ["pπ"]], ["ρ", ["rρ"]], ["ο", ["oο"]], ["ϊ", ["⇧:¨*", "iι"]], ["ό", [";΄*", "oο"]], ["ν", ["nν"]]],
    [["κ", ["kκ"]], ["α", ["aα"]], ["λ", ["lλ"]], ["η", ["hη"]], ["μ", ["mμ"]], ["έ", [";΄*", "eε"]], ["ρ", ["rρ"]], ["α", ["aα"]]]]), js(pairs));
  check("Greek walk: the band is labelled Letters, and the misdirection dot names the accent",
    await b.evaluate(`[...document.querySelectorAll("#walk .walk-gutter span")].some(s => s.textContent === "Letters") && !document.querySelector("#walk .b-sound")
      && document.querySelector("#walk kbd.mis").title === 'On this keyboard ":" types ¨.'`), await b.evaluate(`document.querySelector("#walk kbd.mis").title`));
  // walk back animates, unit by unit, and reads the message back
  await b.evaluate(`${WALK_HOOK} window.__litEl = []; window.__obsEl = new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains("lit")) window.__litEl.push(performance.now()); });
    window.__obsEl.observe(${q("#walk")}, { subtree: true, attributes: true, attributeFilter: ["class"] });`);
  await b.evaluate(`${q("#walk-back")}.click()`);
  await b.waitFor(`!${q("#walked")}.hidden`);
  const [lit, log] = await b.evaluate("window.__obsEl.disconnect(), [window.__litEl, window.__walkLog]");
  check("walk back on Greek animates, unit by unit", lit.length >= 4 && animated(log), js([lit.length, log]));
  check("walk back on Greek reads the message back",
    await b.evaluate(`${q("#walked")}.textContent === "Walked back: “προϊόν καλημέρα”, identical to your message."`), await b.evaluate(`${q("#walked")}.textContent`));
  // ΟΔΟΣ is lowercased with the final sigma (docs/10 §3.2), and the walk back says so
  await typeFresh("ΟΔΟΣ");
  await b.waitFor(cipherIs("odow"));
  await settle();
  await b.evaluate(`${q("#walk-back")}.click()`);
  await b.waitFor(`!${q("#walked")}.hidden`);
  check("walk back: ΟΔΟΣ reads back as οδος, KeyPath's normalization",
    await b.evaluate(`${q("#walked")}.textContent === "Walked back: “οδος”, your message after KeyPath's normalization (lowercase, single spaces)."`),
    await b.evaluate(`${q("#walked")}.textContent`));

  // English onto Greek: the dictionary hop (en>el) and its sense, from FreeDict ell-eng
  await typeMessage("cat", "en", "el_greek");
  await b.waitFor(cipherIs("g;ata"));
  await settle();
  const hop = await b.evaluate(`[document.querySelector("#walk .pill").textContent, document.querySelector("#walk .wtile.dict").textContent, document.querySelector("#walk .sense").textContent]`);
  check("English cat onto Greek: γάτα, the 2nd of its 2 English senses", js(hop) === js(["en → el", "γάτα", "sense 2 of 2"]), js(hop));
  await b.evaluate(`document.querySelector("#walk .sense").click()`);
  await b.waitFor(`document.querySelector('.popover') && !document.querySelector('.popover').hidden`);
  const sense = await b.evaluate(`document.querySelector('.popover .pop-body').textContent`);
  check("English cat onto Greek: the sense popover names FreeDict ell-eng", sense.startsWith("γάτα has 2 English senses in FreeDict ell-eng. The key records the 2nd: cat."), sense);
  await b.evaluate("document.querySelector('.popover .pop-close').click()");

  // el→X is refused: from Greek, only the Greek keyboard; the other chips say why
  await b.evaluate(`(() => { const s = ${q("#lang")}; s.value = "el"; s.dispatchEvent(new Event("change")); })()`);
  await b.waitFor(`${q("input[name=kbd][value=el_greek]")}.checked`);
  await b.evaluate(`${q("input[name=kbd][value=zh_daqian]")}.click()`);
  await sleep(200);
  const off = await b.evaluate(`[${q("#route-note")}.hidden, ${q("#route-note")}.textContent, ${q("input[name=kbd][value=el_greek]")}.checked,
    [...document.querySelectorAll("input[name=kbd]")].filter(i => i.getAttribute("aria-disabled") === "false").map(i => i.value),
    ${q("input[name=kbd][value=zh_daqian]")}.closest(".chip").title]`);
  const EL_OFF = "From Greek, this page types on the Greek keyboard only. Typing Greek on another keyboard needs the Greek-to-English dictionary, which this page doesn't carry.";
  check("el→X: from Greek only the Greek chip is on, and the page says why", !off[0] && off[1] === EL_OFF && off[2] && js(off[3]) === js(["el_greek"]) && off[4] === EL_OFF, js(off));

  // ... and a key that translates out of Greek (Python decodes it) is refused in "Walk one back" and as a #walk link
  const EL_OUT = "This key translates Greek through the Greek-to-English dictionary, which this page doesn't carry.";
  const elFixture = readJson("tests/fixtures/el.json");
  const outward = elFixture.outward[0];
  await b.evaluate(`${q("#tab-dec")}.click()`);
  await b.evaluate(`(() => { ${q("#dec-err")}.hidden = true; ${q("#dec-cipher")}.value = ${js(outward.ciphertext)}; ${q("#dec-key")}.value = ${js(outward.keyText)}; ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-err")}.hidden`);
  check("el→X: a key out of Greek is refused with the page's reason", await b.evaluate(`${q("#dec-err")}.textContent === ${js(EL_OUT)} && ${q("#dec-out")}.hidden`),
    await b.evaluate(`${q("#dec-err")}.textContent`));
  const outKp1 = await b.evaluate(`window.__keypath.engine.kp1Pack(${js(outward.keyText)})`);
  await b.navigate("about:blank");
  await b.navigate(`${srv.url}#walk=${b64url({ c: outward.ciphertext, k: outKp1.text })}`);
  await b.waitFor("document.documentElement.classList.contains('ready')");
  await b.waitFor(`!${q("#dec-out")}.hidden || !${q("#dec-err")}.hidden`, 20000);
  check("el→X: as a walk link, refused the same way, with no walk", await b.evaluate(`${q("#dec-err")}.textContent === ${js(EL_OUT)} && ${q("#dec-out")}.hidden`),
    await b.evaluate(`${q("#dec-err")}.textContent`));

  // a #walk link on the Greek keyboard (native καλημέρα as kp1, English cat as JSON) decodes and animates
  const watch = await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `${WALK_HOOK} window.__lit = [];
    new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains("lit")) window.__lit.push(performance.now()); })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });` });
  const kalimera = golden("el", "καλημέρα"), cat = golden("en", "cat");
  const kalimeraKp1 = await b.evaluate(`window.__keypath.engine.kp1Pack(${js(kalimera.expect.keyText)})`);
  for (const [name, body, want] of [["καλημέρα", { c: kalimera.expect.ciphertext, k: kalimeraKp1.text }, "καλημέρα"],
    ["cat", { c: cat.expect.ciphertext, j: JSON.stringify(JSON.parse(cat.expect.keyText)) }, "cat"]]) {
    await b.navigate("about:blank");
    await b.navigate(`${srv.url}#walk=${b64url(body)}`);
    await b.waitFor("document.documentElement.classList.contains('ready')");
    await b.waitFor(`!${q("#dec-out")}.hidden || !${q("#dec-err")}.hidden`, 20000);
    await b.waitFor(`document.querySelectorAll("#dec-walk .unit").length > 0 && [...document.querySelectorAll("#dec-walk .unit, #dec-walk .wg")].every(e => e.classList.contains("lit"))`);
    const got = await b.evaluate(`[${q("#dec-text")}.textContent, ${q("#dec-err")}.hidden, window.__lit.length, window.__walkLog,
      [...document.querySelectorAll("#dec-walk .seg-badge, #dec-walk .lcell")].map(e => e.textContent).join("")]`);
    check(`walk link on Greek (${name}): decodes and animates`, kalimeraKp1.ok && got[0] === want && got[1] && got[2] >= 2 && animated(got[3])
      && got[4] === (name === "cat" ? "γάτα" : "καλημέρα"), js(got));
  }
  await b.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: watch.identifier });

  // the keyboard picture: letters, the dead keys ; ΄, Shift-; ¨ and Shift-W ΅ from the table, q unused; no overflow at 360
  const els = legendsJson.layouts.el_greek;
  for (const [w, h] of [[1280, 800], [360, 780]]) {
    await open(w, h);
    await b.evaluate(`${q("input[name=kbd][value=el_greek]")}.click()`);
    await b.waitFor(cipherIs(S.heroAll.el_greek));
    await settle();
    await b.evaluate(`${q("#kbd-panel")}.open = true`);
    await sleep(120);
    const pic = await pictureOf();
    check(`Greek keyboard at ${w}px: 47 keys, legends as KeyPath's`, Object.keys(pic).length === 47 && matches(pic, "el_greek", false), js(pic).slice(0, 500));
    check(`Greek keyboard at ${w}px: ; is the dead key ΄, q is unused`, pic[";"][1] === els[";"] && pic[";"][3] && pic.q[1] === "" && pic.q[4]
      && Object.entries(pic).filter(([, v]) => v[3]).map(([k]) => k).join("") === ";", js([pic[";"], pic.q]));
    await b.evaluate(`${q("#kbd-pic .kb-shift input")}.click()`);
    await sleep(80);
    const shifted = await pictureOf();
    check(`Greek keyboard at ${w}px with Shift: ; is ⇧: ¨ and w is ⇧W ΅, both dead, as KeyPath's`, matches(shifted, "el_greek", true)
      && js(shifted[";"].slice(0, 4)) === js(["⇧:", els[":"], false, true]) && js(shifted.w.slice(0, 4)) === js(["⇧W", els.W, false, true])
      && Object.entries(shifted).filter(([, v]) => v[1]).map(([k]) => k).sort().join("") === ";w", js([shifted[";"], shifted.w]));
    const notes = await b.evaluate(`[...document.querySelectorAll("#kbd-pic .kb-note")].map(n => n.textContent)`);
    const accented = await b.evaluate(`[...document.querySelectorAll("#kbd-pic .kb-es li")].map(li => [li.textContent, li.classList.contains("used")])`);
    const rows = layoutsJson.el_greek.letters.filter(([, k]) => k.length === 2);
    check(`Greek keyboard at ${w}px: the dead-key note, the 11 accented letters (those the message uses marked) and q`,
      notes[0] === "Each letter key types one Greek letter. The accents are dead keys, typed before their vowel: ; ΄ (tonos), : ¨ (dialytika, Shift+;), W ΅ (dialytika and tonos, Shift+w)."
      && js(accented) === js(rows.map(([l, k]) => [`${k} ${l}`, S.heroAll.el_greek.includes(k)]))
      && notes[1] === "q types the Greek question mark, not a letter, so it never appears in the keys.", js([notes, accented]));
    check(`Greek keyboard at ${w}px: every key inside the picture, no horizontal scroll`, await pictureFits() && await noHScroll(w),
      await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
  }
});

await attempt("typing", async () => {
  // every keyboard chip on the page: the site vectors, the corpora and fuzz strings
  const chips = await b.evaluate(`[...document.querySelectorAll("input[name=kbd]")].map(i => i.value)`);
  check("typing: every keyboard chip is a live surface of the engine",
    chips.length >= 12 && chips.every(id => registryJson.siteSurfaces.some(s => s.id === id)), js(chips));
  const bySurface = new Map();
  const usable = v => v.carried && !v.jsRefusal && v.expect && v.expect.ciphertext !== undefined && Array.from(v.text).length <= 200 && v.text.trim()
    && chips.includes(v.surface);
  for (const cls of ["site", "corpus-zh", "corpus-ko", "corpus-ru", "corpus-es", "corpus-en", "corpus-vi", "corpus-el", "fuzz-en-x", "fuzz-zh", "fuzz-es",
    "fuzz-ru", "fuzz-ko", "fuzz-en-id", "fuzz-vi", "fuzz-el"]) {
    for (const v of vectors) {
      if (v.class !== cls || !usable(v)) continue;
      const k = `${v.source}/${v.surface}`;
      const list = bySurface.get(k) || [];
      if (list.length < (cls === "site" ? 9 : 3) && !list.some(x => x.text === v.text)) { list.push(v); bySurface.set(k, list); }
    }
  }
  const picked = [...bySurface.values()].flat();
  const surfaces = new Set(picked.map(v => v.surface));
  check("typing: vectors cover every keyboard chip", surfaces.size === chips.length && chips.every(id => surfaces.has(id)), [...surfaces]);
  for (const v of picked) {
    await typeMessage(v.text, v.source, v.surface);
    try {
      await b.waitFor(`${cipherIs(v.expect.ciphertext)} && ${keyIs(v.expect.keyText)}`, 15000);
      const live = await b.evaluate(`window.__keypath.engine.encode({ text: ${q("#msg")}.value, source: ${js(v.source)}, surface: ${js(v.surface)} }).then(r => r.ciphertext)`);
      check(`typed on ${v.surface} (${v.id})`, live === v.expect.ciphertext, live);
    } catch {
      const got = await b.evaluate(`[${q("#cipher")}.textContent, ${q("#enc-refusal")}.textContent]`);
      check(`typed on ${v.surface} (${v.id})`, false, `want ${v.expect.ciphertext}, page shows ${js(got)}`);
    }
  }
  const oov = vectors.find(v => v.class === "fuzz-en-oov" && chips.includes(v.surface));
  await typeMessage(oov.text, oov.source, oov.surface);
  // (switching the language re-encodes the previous message first, which may be refused too)
  await b.waitFor(`!${q("#enc-refusal")}.hidden && ${js(oov.jsRefusal[1])}.every(w => ${q("#enc-refusal")}.textContent.includes(w))`).catch(() => {});
  const msg = await b.evaluate(`${q("#enc-refusal")}.textContent`);
  check("typing: words outside the list are refused, naming them",
    msg.startsWith("Not in this page's 10,000-word English list: ") && oov.jsRefusal[1].every(w => msg.includes(w)), msg);
  await typeMessage("the café straße", "en", "zh_daqian");
  await b.waitFor(`/café/.test(${q("#enc-refusal")}.textContent)`).catch(() => {});
  const whole = await b.evaluate(`${q("#enc-refusal")}.textContent`);
  check("typing: a refused word is named whole, accents included", /: café, straße\. /.test(whole), whole);
});

await attempt("widths", async () => {
  for (const [w, h] of [[360, 780], [390, 844], [768, 1024], [1280, 800]]) {
    await open(w, h);
    let ok = await noHScroll(w);
    for (const [i, c] of S.chips.entries()) {
      await b.evaluate(`document.querySelectorAll('#examples button')[${i}].click()`);
      await b.waitFor(cipherIs(c.ciphertext));
      await sleep(80);
      ok = ok && await noHScroll(w);
    }
    check(`no horizontal scroll at ${w}px (hero and every chip)`, ok, await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
  }
});

await attempt("reduced motion", async () => {
  await open(1280, 800, { reduced: true });
  await b.evaluate(`document.querySelectorAll('#examples button')[1].click()`);
  await b.waitFor(cipherIs(S.chips[1].ciphertext));
  await b.evaluate(`${q("#walk-back")}.click()`);
  await b.waitFor(`!${q("#walked")}.hidden`);
  await sleep(100);
  check("reduced motion: no animations after walk back", await b.evaluate("document.getAnimations().length === 0"),
    await b.evaluate("document.getAnimations().map(a => a.animationName || a.transitionProperty)"));
  check("reduced motion: replay typing hidden", await b.evaluate(`${q("#replay")}.offsetParent === null`));
});

const key = (keyName, code, vk, text) => [
  { type: "rawKeyDown", key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
  ...(text ? [{ type: "char", key: keyName, code, text, windowsVirtualKeyCode: vk }] : []),
  { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
];
async function press(name) {
  const K = { Tab: ["Tab", 9], ArrowRight: ["ArrowRight", 39], ArrowLeft: ["ArrowLeft", 37], Enter: ["Enter", 13, "\r"], Escape: ["Escape", 27] }[name];
  for (const ev of key(name, K[0], K[1], K[2])) await b.send("Input.dispatchKeyEvent", ev);
  await sleep(60);
}
const active = () => b.evaluate(`(() => { const a = document.activeElement; if (!a) return "";
  if (a.closest(".walk")) return "figure:" + (a.className.baseVal ?? a.className);
  if (a.closest(".popover")) return "popover";
  return a.id || (a.name ? a.name + ":" + a.value : a.tagName.toLowerCase() + "." + a.className); })()`);

await attempt("keyboard", async () => {
  await open(1280, 800);
  await b.evaluate("document.activeElement && document.activeElement.blur()");
  const seen = [];
  for (let i = 0; i < 40; i++) {
    await press("Tab");
    const a = await active();
    seen.push(a);
    if (a === "kbd:zh_daqian") {
      await press("ArrowRight");
      const moved = await active();
      check("keyboard: arrow keys move between keyboard chips", moved === "kbd:zh_eten" && await b.evaluate(`${q("input[value=zh_eten]")}.checked`), moved);
      await b.waitFor(cipherIs(S.heroAll.zh_eten));
      await press("ArrowLeft");
      await b.waitFor(cipherIs(hero.ciphertext));
    }
    if (a === "walk-back") break;
  }
  const at = name => seen.findIndex(s => (name.endsWith("*") ? s.startsWith(name.slice(0, -1)) : s === name));
  const order = ["msg", "lang", "kbd:*", "figure:*", "walk-back"].map(at);
  check("keyboard: Tab reaches message, language, keyboards, figure, then controls",
    order.every(i => i >= 0) && order.every((v, i) => !i || v > order[i - 1]), seen.join(" > "));
  // into the figure: → moves to the first character, Enter opens its popover, Esc returns
  await b.evaluate(`document.querySelector('#walk [tabindex="0"]').focus()`);
  await press("ArrowRight");
  const onStack = await active();
  await press("Enter");
  await b.waitFor(`document.querySelector('.popover') && !document.querySelector('.popover').hidden`);
  const inside = await active();
  await press("Escape");
  const back = await active();
  check("keyboard: figure stops, popover opens with focus inside, Esc returns",
    onStack.includes("stack") && inside === "popover" && back === onStack && await b.evaluate("document.querySelector('.popover').hidden"),
    [onStack, inside, back]);
});

await attempt("composition", async () => {
  await open(1280, 800);
  await b.evaluate(`(() => { const t = ${q("#msg")}; t.focus(); t.select(); })()`);
  await b.send("Input.imeSetComposition", { text: "ho", selectionStart: 2, selectionEnd: 2 });
  await sleep(600);
  const during = await b.evaluate(`[${q("#msg")}.value, ${q("#cipher")}.textContent]`);
  check("composition: nothing is encoded mid-composition", during[1] === hero.ciphertext, during);
  await b.send("Input.insertText", { text: "home" });
  const want = await b.evaluate(`window.__keypath.engine.encode({ text: "home", source: "en", surface: "zh_daqian" }).then(r => r.ciphertext)`);
  await b.waitFor(cipherIs(want));
  check("composition: the committed text is encoded", true);
});

await attempt("share links", async () => {
  await open(1280, 800);
  const capture = `Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async t => { window.__copied = t; } } })`;
  await b.evaluate(capture);
  await b.evaluate(`document.querySelectorAll('#examples button')[4].click()`);
  await b.waitFor(cipherIs(S.chips[4].ciphertext));
  await b.evaluate(`${q("#copy-link")}.click()`);
  const tryLink = await b.waitFor("window.__copied");
  check("share: #try= link is relative to the page", tryLink.startsWith(srv.url + "#try="), tryLink);
  await b.navigate("about:blank");
  await b.navigate(tryLink);
  await b.waitFor("document.documentElement.classList.contains('ready')");
  await b.waitFor(cipherIs(S.chips[4].ciphertext));
  check("share: #try= reopens message, language and keyboard",
    await b.evaluate(`${q("#msg")}.value === ${js(S.chips[4].text)} && ${q("#lang")}.value === "ru" && ${q("input[value=ru_jcuken]")}.checked`));
  // the page's own examples can't become puzzles: their answers are on the page
  await b.evaluate(capture);
  await b.evaluate(`${q("#make-puzzle")}.click()`);
  check("share: an example can't be made a puzzle", await b.evaluate(`!${q("#puzzle-note")}.hidden && ${q("#puzzle-copy")}.disabled`));
  await b.evaluate(`${q("#puzzle-close")}.click()`);
  const yolka = await typeAndWait("ёлка", "ru", "ru_jcuken");
  await b.evaluate(capture);
  await b.evaluate(`${q("#make-puzzle")}.click()`);
  check("share: a new message can", await b.evaluate(`${q("#puzzle-note")}.hidden && !${q("#puzzle-copy")}.disabled`));
  await b.evaluate(`${q("#puzzle-hint")}.checked = true`);
  await b.evaluate(`${q("#puzzle-copy")}.click()`);
  const puzzleLink = await b.waitFor("window.__copied && window.__copied.includes('#puzzle=') && window.__copied");
  await b.navigate("about:blank");
  await b.navigate(puzzleLink);
  await b.waitFor("document.documentElement.classList.contains('ready') && document.querySelector('#puzzle-h')");
  const banner = await b.evaluate(`${q(".puzzle-banner")}.textContent`);
  check("share: #puzzle= shows the ciphertext and the hint", banner.includes(yolka) && banner.includes("Hint: typed on a Russian ЙЦУКЕН keyboard.")
    && !banner.includes("Written in"), banner);
  const answer = async text => {
    await b.evaluate(`(() => { ${q("#puzzle-answer")}.value = ${js(text)}; ${q(".puzzle-banner form")}.requestSubmit(); })()`);
    await sleep(150);
    return b.waitFor(`${q(".puzzle-banner .verdict")}.textContent`);
  };
  check("share: puzzle rejects a wrong answer", (await answer("hedgehog")) === "Not quite. Keep going.");
  check("share: puzzle accepts the answer", (await answer("  ЁЛКА! ")) === "Solved.");
  check("share: puzzle accepts it accents aside", (await answer("елка")) === "Solved, accents aside.");

  // through a dictionary: the English and what the keys spell both count
  await open(1280, 800);
  await typeAndWait("thank you", "en", "zh_daqian");
  const spelled = await b.evaluate("window.__keypath.engine.unitText(window.__keypath.playground.state.result.trace)");
  await b.evaluate(capture);
  await b.evaluate(`${q("#make-puzzle")}.click()`);
  await b.evaluate(`${q("#puzzle-hint")}.checked = true`);
  await b.evaluate(`${q("#puzzle-copy")}.click()`);
  const hopLink = await b.waitFor("window.__copied && window.__copied.includes('#puzzle=') && window.__copied");
  await b.navigate("about:blank");
  await b.navigate(hopLink);
  await b.waitFor("document.documentElement.classList.contains('ready') && document.querySelector('#puzzle-h')");
  const hopBanner = await b.evaluate(`${q(".puzzle-banner")}.textContent`);
  check("share: a dictionary puzzle says which language to answer in",
    hopBanner.includes("Written in English: answer in English, or with the Chinese the keys spell."), hopBanner);
  check("share: it accepts what the keys spell", /\p{Script=Han}/u.test(spelled) && (await answer(spelled)) === "Solved.", spelled);
  check("share: and the English", (await answer("Thank you!")) === "Solved.");

  // #try= keeps a language chosen by hand (not what detection would pick)
  for (const [text, source, surface] of [["hola amigo", "es", "es_accent"], ["ok 좋아", "en", "ko_dubeolsik"], ["привет world", "en", "ru_jcuken"],
    ["xin chao ban", "vi", "vi_vni"]]) {
    await open(1280, 800);
    await typeAndWait(text, source, surface);
    const sent = await b.evaluate(`[${q("#cipher")}.textContent, ${q("#key-pre")}.textContent, ${q("#enc-result")}.hidden]`);
    await b.evaluate(capture);
    await b.evaluate(`${q("#copy-link")}.click()`);
    const link = await b.waitFor("window.__copied");
    await b.navigate("about:blank");
    await b.navigate(link);
    await b.waitFor("document.documentElement.classList.contains('ready')");
    await settle();
    await b.waitFor(`!${q("#enc-result")}.hidden || !${q("#enc-refusal")}.hidden`);
    const got = await b.evaluate(`[${q("#cipher")}.textContent, ${q("#key-pre")}.textContent, ${q("#enc-result")}.hidden]`);
    check(`share: #try= reopens "${text}" as ${source} on ${surface} unchanged`,
      !sent[2] && js(got) === js(sent) && await b.evaluate(`${q("#lang")}.value === ${js(source)}`), [sent[0], got[0]]);
  }
});

await attempt("challenges", async () => {
  const from = b.events.length;
  await open(1280, 800);
  await b.waitFor(CARDS_READY);
  // what the page fetched since it opened, and all the text it holds (hidden text included)
  const fetched = () => b.events.slice(from).filter(e => e.method === "Network.requestWillBeSent").map(e => e.params.request.url);
  const pageText = () => b.evaluate("document.documentElement.textContent");
  const got = (url, rel) => url.split("?")[0].endsWith(`/keypath/${rel}`);
  const allHints = chalIndex.flatMap(c => hintsOf(c));
  check("challenges: all twelve cards render, in order",
    js(await b.evaluate("[...document.querySelectorAll('.chal')].map(a => a.id)")) === js(chalIndex.map(c => `challenge-${c.n}`)));
  const text0 = await pageText();
  check("challenges: no hint and no answer is on the page before a click",
    allHints.length === 18 && allHints.every(t => !text0.includes(t)) && challenges.every(c => !text0.includes(c.plaintext)));
  check("challenges: no hint and no challenge's own file is fetched before a click",
    !fetched().some(u => /\/data\/challenges\/(hints\/|\d\d\.json)/.test(u)), fetched().filter(u => u.includes("/challenges/")));
  // first, every card as a visitor meets it: its hints, a wrong answer, the right one
  for (const [i, c] of challenges.entries()) {
    const card = chalIndex[i], n = card.n;
    const sel = `#challenge-${n}`;
    check(`challenge ${n}: ciphertext`, await b.evaluate(`${q(`${sel} .chal-cipher code`)}.textContent === ${js(c.ciphertext)}`));
    check(`challenge ${n}: level, title and blurb`, js(await b.evaluate(`[${q(`${sel} .diff`)}.textContent, ${q(`${sel} h3`)}.textContent,
      ${q(`${sel} .blurb`)}.textContent]`)) === js([card.difficulty, card.title, card.blurb]));
    // the hints of 7-12: one per click, nothing of a hint before its click
    const hints = hintsOf(card);
    check(`challenge ${n}: ${hints.length ? "three hints, none shown" : "no hints"}`, hints.length
      ? await b.evaluate(`${q(`${sel} .hint-btn`)}.textContent === "Show a hint (1 of 3)" && ${q(`${sel} .hint-list`)}.hidden && !${q(`${sel} .hint-list li`)}`)
      : await b.evaluate(`!${q(`${sel} .hints`)}`));
    for (const [k, hint] of hints.entries()) {
      const later = hints.slice(k);
      const text = await pageText();
      check(`challenge ${n}: hint ${k + 1} is neither on the page nor fetched before its click`,
        later.every(t => !text.includes(t)) && !fetched().some(u => later.some((_, j) => got(u, `data/challenges/hints/${pad(n)}-${k + j + 1}.json`))));
      await b.evaluate(`${q(`${sel} .hint-btn`)}.click()`);
      await b.waitFor(`document.querySelectorAll(${js(`${sel} .hint-list li`)}).length === ${k + 1}`);
      const shown = await b.evaluate(`[...document.querySelectorAll(${js(`${sel} .hint-list li`)})].map(li => li.textContent)`);
      check(`challenge ${n}: hint ${k + 1} shows after its click, and only it`,
        shown[k] === `Hint ${k + 1} ${hint}` && hints.slice(k + 1).every(t => !shown.join("").includes(t))
        && !fetched().some(u => got(u, `data/challenges/hints/${pad(n)}-${k + 2}.json`)), js(shown));
    }
    if (hints.length) {
      check(`challenge ${n}: after the last hint the button goes and focus lands on the hint`,
        await b.evaluate(`${q(`${sel} .hint-btn`)}.hidden && document.activeElement === document.querySelectorAll(${js(`${sel} .hint-list li`)})[2]`));
    }
    // a wrong answer neither solves nor reveals it
    await b.evaluate(`(() => { ${q(`${sel} input`)}.value = "definitely not it"; ${q(`${sel} form`)}.requestSubmit(); })()`);
    const wrong = await b.waitFor(`${q(`${sel} .verdict`)}.textContent`);
    check(`challenge ${n}: a wrong answer does not solve or reveal it`,
      wrong === "Not quite. Keep going." && await b.evaluate(`${q(`${sel} .badge-solved`)}.hidden && ${q(`${sel} .revealed`)}.hidden`)
      && !(await pageText()).includes(c.plaintext), wrong);
    await b.evaluate(`(() => { ${q(`${sel} .verdict`)}.textContent = ""; ${q(`${sel} input`)}.value = ${js(c.plaintext)}; ${q(`${sel} form`)}.requestSubmit(); })()`);
    const verdict = await b.waitFor(`${q(`${sel} .verdict`)}.textContent`);
    check(`challenge ${n}: the answer checks`, verdict === "Solved." && await b.evaluate(`!${q(`${sel} .badge-solved`)}.hidden`), verdict);
  }
  check("challenges: checking answers fetches no challenge's own file (answers are checked against hashes)",
    !fetched().some(u => /\/data\/challenges\/\d\d\.json/.test(u)), fetched().filter(u => u.includes("/challenges/")));
  // then every reveal: the plaintext, and the walk back
  for (const [i, c] of challenges.entries()) {
    const n = chalIndex[i].n;
    const sel = `#challenge-${n}`;
    // a key of 1-6 may load the slices of 1-6; nothing loads a file of 7-12 but its own reveal
    if (n >= 7) check(`challenge ${n}: its file is fetched only by its reveal`, !fetched().some(u => got(u, `data/challenges/${pad(n)}.json`)));
    await b.evaluate(`${q(`${sel} .reveal .btn`)}.click()`);
    await b.evaluate(`${q(`${sel} .confirm .btn.primary`)}.click()`);
    await b.waitFor(`${q(`${sel} .revealed .plain`)}`, 30000);
    const plain = await b.evaluate(`${q(`${sel} .revealed .plain`)}.textContent`);
    check(`challenge ${n}: reveal shows the plaintext`, plain === c.plaintext, plain);
    // the walk back lights every part of the walk
    await b.waitFor(`(() => { const u = document.querySelectorAll(${js(`${sel} .chal-walk .unit`)});
      return u.length > 0 && u.length === document.querySelectorAll(${js(`${sel} .chal-walk .unit.lit`)}).length; })()`, 30000);
    const href = await b.evaluate(`${q(`${sel} .solve a`)}.href`);
    const path = `puzzles/challenge-${pad(n)}/solve-path.md`;
    check(`challenge ${n}: the solve-path link names this repository's ${path}`,
      href === `https://github.com/Tz-Ray/keypath/blob/main/${path}` && existsSync(join(ROOT, path)), href);
  }
});

// docs/10 §9.7, M18: walking back a key of challenges 1-6 loads the list
// slices of 1-6 only; the files of 7-12 hold their answers
await attempt("challenge slices", async () => {
  const from = b.events.length;
  await open(1280, 800);
  await b.evaluate(`${q("#tab-dec")}.click()`);
  await b.evaluate(`(() => { ${q("#dec-cipher")}.value = ${js(challenges[1].ciphertext)}; ${q("#dec-key")}.value = ${js(challenges[1].keyText)}; ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-out")}.hidden || !${q("#dec-err")}.hidden`, 20000);
  const urls = b.events.slice(from).filter(e => e.method === "Network.requestWillBeSent").map(e => e.params.request.url.split("?")[0]);
  const chal = urls.filter(u => u.includes("/data/challenges/")).map(u => u.slice(u.indexOf("/data/challenges/") + 17)).sort();
  check("walk one back: challenge 2's key walks back over the slices of 1-6 and fetches nothing of 7-12",
    await b.evaluate(`${q("#dec-text")}.textContent === ${js(challenges[1].plaintext)}`)
    && js([...new Set(chal)]) === js(["01.json", "02.json", "03.json", "04.json", "05.json", "06.json", "index.json"]), js(chal));
});

await attempt("tampered keys", async () => {
  await open(1280, 800);
  await b.evaluate(`${q("#tab-dec")}.click()`);
  for (const t of decodeErrors.slice(0, 3)) {
    await b.evaluate(`(() => { ${q("#dec-err")}.hidden = true; ${q("#dec-cipher")}.value = ${js(t.ciphertext)}; ${q("#dec-key")}.value = ${js(t.keyText)}; ${q("#dec-go")}.click(); })()`);
    await b.waitFor(`!${q("#dec-err")}.hidden`);
    const msg = await b.evaluate(`${q("#dec-err")}.textContent`);
    check(`tampered key ${t.id}: refused`, msg.startsWith("This key doesn't fit this ciphertext: "), msg);
  }
  await b.evaluate(`(() => { ${q("#dec-cipher")}.value = ${js(hero.ciphertext)}; ${q("#dec-key")}.value = ${js(hero.keyText)}; ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-out")}.hidden`);
  check("decode: the hero key walks back", await b.evaluate(`${q("#dec-text")}.textContent === ${js(hero.text)}`));
});

await attempt("edge messages", async () => {
  await open(1280, 800);
  // a message of digits and punctuation: no keystrokes, and the key walks it back
  await typeMessage("123 !!!", "en", "zh_daqian");
  await b.waitFor(`${cipherIs("")} && ${q("#stats")}.textContent.startsWith("0 keystrokes")`);
  await b.evaluate(`${q("#make-puzzle")}.click()`);
  check("all-literal: no puzzle from an empty ciphertext", await b.evaluate(`!${q("#puzzle-note")}.hidden && ${q("#puzzle-copy")}.disabled`));
  await b.evaluate(`${q("#puzzle-close")}.click()`);
  await b.evaluate(`${q("#tab-dec")}.click()`);
  await b.evaluate(`${q("#dec-go")}.click()`);
  await b.waitFor(`!${q("#dec-out")}.hidden || !${q("#dec-err")}.hidden`);
  check("all-literal: walks back from its key alone", await b.evaluate(`${q("#dec-text")}.textContent === "123 !!!" && ${q("#dec-err")}.hidden`),
    await b.evaluate(`${q("#dec-err")}.textContent`));
  // a pathologically deep key is refused as bad JSON, with no exception
  await b.evaluate(`(() => { ${q("#dec-cipher")}.value = "cj0u/6ru8"; ${q("#dec-key")}.value = '{"a":'.repeat(3000) + "1" + "}".repeat(3000); ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-err")}.hidden`);
  check("decode: a deeply nested key is bad JSON", await b.evaluate(`${q("#dec-err")}.textContent === "That key isn't valid JSON."`));
  await b.evaluate(`${q("#tab-enc")}.click()`);

  // the katakana middle dot is punctuation: detected (and chosen) Chinese encodes
  await b.evaluate(`(() => { const t = ${q("#msg")}; t.value = ""; t.dispatchEvent(new Event("input")); })()`);
  await b.evaluate(`${q("#msg")}.focus()`);
  await b.send("Input.insertText", { text: "哈利・波特" });
  const dot = await b.evaluate(`window.__keypath.engine.encode({ text: "哈利・波特", source: "zh", surface: "zh_daqian" }).then(r => r.ciphertext)`);
  await b.waitFor(cipherIs(dot));
  check("katakana dot: detected as Chinese", await b.evaluate(`${q("#lang")}.value === "zh" && ${q("#lang-mode")}.textContent === "detected"`));
  await typeMessage("キ官鑄進修班", "zh", "zh_daqian");
  const ki = await b.evaluate(`window.__keypath.engine.encode({ text: "キ官鑄進修班", source: "zh", surface: "zh_daqian" }).then(r => r.ciphertext)`);
  await b.waitFor(cipherIs(ki));
  check("kana with Chinese chosen: encoded as chosen", true);

  // walk back names normalization when the box differs from the walked-back text
  await typeAndWait("Welcome   HOME", "en", "zh_daqian");
  await b.evaluate(`${q("#walk-back")}.click()`);
  await b.waitFor(`!${q("#walked")}.hidden`);
  const walked = await b.evaluate(`${q("#walked")}.textContent`);
  check("walk back: says the message was normalized", walked === "Walked back: “welcome home”, your message after KeyPath's normalization (lowercase, single spaces).", walked);

  // user text is isolated from the page's own copy (bidi controls stay inside)
  await typeMessage("hello \u202eworld home", "en", "zh_daqian");
  await settle();
  await b.waitFor(`${q("#caption bdi")} && ${q("#caption bdi")}.textContent.includes("world")`);
  check("bidi: the caption isolates the message", await b.evaluate(`${q("#caption")}.textContent.endsWith("typed on a Bopomofo (Dàqiān) keyboard.")`));
});

await attempt("long input stays in its box", async () => {
  for (const w of [360, 1280]) {
    await open(w, 800);
    for (const [name, text] of [["greek", "Γειά σου κόσμε, τι κάνεις σήμερα; Είμαι καλά, ευχαριστώ πολύ για την ερώτηση σου φίλε μου."],
      ["digits", "1234567890".repeat(20)], ["emoji", "😀".repeat(100)], ["long word", "donaudampfschifffahrtsgesellschaftskapitän"], ["one letter", "a".repeat(199)]]) {
      await typeMessage(text, "en", "zh_daqian");
      await settle();
      await b.waitFor(`!${q("#enc-result")}.hidden || !${q("#enc-refusal")}.hidden`);
      await sleep(150);
      const inside = await b.evaluate(`[...document.querySelectorAll("#walk .lit-text")].every(t => { const g = t.closest(".wg").getBoundingClientRect(), r = t.getBoundingClientRect(); return r.left >= g.left - 1 && r.right <= g.right + 1; })`);
      check(`overflow: ${name} at ${w}px`, inside && await noHScroll(w), await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
    }
  }
  await open(360, 780);
  await b.evaluate(`${q("#tab-dec")}.click()`);
  const bad = hero.keyText.replace('"homophone_index": 1', '"homophone_index": -1');
  await b.evaluate(`(() => { ${q("#dec-cipher")}.value = ${js(hero.ciphertext)}; ${q("#dec-key")}.value = ${js(bad)}; ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-err")}.hidden`);
  check("overflow: a long error path at 360px", bad !== hero.keyText && await noHScroll(360), await b.evaluate(`${q("#dec-err")}.textContent`));
});

await attempt("touch targets", async () => {
  await open(360, 780);
  await b.waitFor(CARDS_READY);
  await b.evaluate(`document.querySelector("#key-panel").open = true`);
  const small = await b.evaluate(`[...document.querySelectorAll("button, .btn, [role=tab], summary, .chip")]
    .filter(e => e.offsetParent && !e.closest(".walk, .walk-legend, .kb-pic, .popover"))
    .map(e => { const r = e.getBoundingClientRect(); return [e.id || e.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; })
    .filter(([, w, h]) => w < 44 || h < 44)`);
  check("touch targets: every control is at least 44 x 44 px at 360px", small.length === 0, js(small));
  // The walk figure's controls may draw smaller (the 18px sense chips) but must
  // take taps across 44 x 44 px: from each one's centre, hit-test pixel by pixel
  // outwards and measure the unbroken span that reaches it, across and down.
  const figure = await b.evaluate(`(() => {
    const out = { senses: 0, missed: [] };
    for (const e of document.querySelectorAll(".walk button")) {
      if (!e.offsetParent) continue;
      if (e.classList.contains("sense")) out.senses++;
      e.scrollIntoView({ block: "center", inline: "center" });
      const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const stops = [];
      const reach = (dx, dy) => {
        let n = 0;
        while (n < 80) {
          const hit = document.elementFromPoint(cx + dx * (n + 1), cy + dy * (n + 1));
          if (!hit || hit.closest("button") !== e) { stops.push(hit && (hit.tagName + "." + hit.className)); break; }
          n++;
        }
        return n;
      };
      const w = reach(-1, 0) + reach(1, 0) + 1, h = reach(0, -1) + reach(0, 1) + 1;
      if (w < 44 || h < 44) out.missed.push([e.className, e.textContent.trim().slice(0, 20), w, h, stops]);
    }
    return out;
  })()`);
  check("touch targets: the walk figure's buttons, sense chips included, take taps across 44 x 44 px",
    figure.senses > 0 && figure.missed.length === 0, js(figure));
});

await attempt("focus", async () => {
  await open(360, 780);
  await b.evaluate(`document.querySelectorAll('#examples button')[1].click()`);
  await b.waitFor(cipherIs(S.chips[1].ciphertext));
  await settle();
  await b.evaluate(`document.querySelector('#walk .stack').focus()`);
  const inv = await active();
  await press("Enter");
  await b.waitFor(`document.querySelector('.popover') && !document.querySelector('.popover').hidden`);
  await press("Tab");
  check("popover: Tab past the grid closes it and returns to the unit",
    await b.evaluate("document.querySelector('.popover').hidden") && (await active()) === inv, await active());
  await press("Enter");
  await b.waitFor(`!document.querySelector('.popover').hidden`);
  await b.evaluate("document.querySelector('.popover .pop-close').focus()");
  await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 });
  await sleep(60);
  check("popover: Shift+Tab from its first control closes it too",
    await b.evaluate("document.querySelector('.popover').hidden") && (await active()) === inv, await active());
  // reveal moves focus to the answer
  await b.waitFor(CARDS_READY);
  await b.evaluate(`${q("#challenge-3 .reveal .btn")}.focus()`);
  await press("Enter");
  await press("Enter");
  await b.waitFor(`${q("#challenge-3 .revealed .plain")}`);
  check("reveal: focus lands on the answer", await b.evaluate(`document.activeElement === ${q("#challenge-3 .revealed .plain")}`), await active());
});

await attempt("walk links", async () => {
  const capture = `Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async t => { window.__copied = t; } } })`;
  const decoded = () => `(!${q("#dec-out")}.hidden || !${q("#dec-err")}.hidden)`;
  // the link control in the key panel makes a #walk link with the key as kp1
  await open(1280, 800);
  const message = "welcome home, thank you";
  await typeAndWait(message, "en", "zh_cangjie");
  await b.evaluate(`${q("#key-panel")}.open = true`);
  check("walk link: the control is enabled for a typed message",
    await b.evaluate(`!${q("#copy-walk")}.disabled && ${q("#walk-link-note")}.hidden`));
  check("walk link: the key panel says anyone with the link can read the message",
    /Anyone with the link can read the message\./.test(await b.evaluate(`${q("#key-panel")}.textContent`)));
  await b.evaluate(capture);
  await b.evaluate(`${q("#copy-walk")}.click()`);
  const link = await b.waitFor("window.__copied && window.__copied.includes('#walk=') && window.__copied");
  const shortKey = await b.evaluate(`window.__keypath.engine.kp1Pack(window.__keypath.playground.state.result.key).text`);
  check("walk link: #walk= relative to the page, carrying the kp1 key",
    link.startsWith(srv.url + "#walk=") && JSON.parse(Buffer.from(link.split("#walk=")[1], "base64url").toString()).k === shortKey, link);

  // opened in a fresh browser (a new profile: nothing cached, no service worker)
  const b2 = await launch({ chrome, fontsConf });
  try {
    await b2.viewport(1280, 800);
    // record when each part of the walk lights up
    await b2.send("Page.addScriptToEvaluateOnNewDocument", { source: `${WALK_HOOK} window.__lit = [];
      new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains("lit")) window.__lit.push(performance.now()); })
        .observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });` });
    await b2.navigate(link);
    await b2.waitFor("document.documentElement.classList.contains('ready')");
    await b2.waitFor(decoded(), 20000);
    const got = await b2.evaluate(`[${q("#dec-text")}.textContent, ${q("#tab-dec")}.getAttribute("aria-selected"), ${q("#dec-err")}.hidden,
      ${q("#dec-key")}.value, ${q("#dec-note")}.textContent]`);
    check("walk link in a fresh browser: walks the message back", got[0] === message && got[1] === "true" && got[2] && got[3] === shortKey, got);
    check("walk link in a fresh browser: says anyone with the link can read the message", /anyone with the link can read the message/.test(got[4]), got[4]);
    await b2.waitFor(`document.querySelectorAll("#dec-walk .unit").length > 0 && document.querySelectorAll("#dec-walk .unit").length === document.querySelectorAll("#dec-walk .unit.lit").length`);
    const [lit, log] = await b2.evaluate("[window.__lit, window.__walkLog]");
    check("walk link in a fresh browser: the walk animates, unit by unit", lit.length >= 6 && animated(log), js([lit.length, log]));
    const origin2 = srv.origin + "/";
    const req2 = b2.events.filter(e => e.method === "Network.requestWillBeSent").map(e => e.params.request.url);
    check("walk link in a fresh browser: every request stays on the page's origin",
      req2.length > 5 && req2.every(u => u.startsWith(origin2) || u.startsWith("data:") || u.startsWith("about:")), req2.filter(u => !u.startsWith(origin2)).slice(0, 3));
    const err2 = b2.events.filter(e => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error"));
    check("walk link in a fresh browser: no exceptions and no errors", err2.length === 0, err2.slice(0, 2).map(e => js(e.params).slice(0, 300)));
  } finally {
    b2.close();
  }

  // a reject vector: opened as #walk, and pasted into "Walk one back", shows the refusal and no key
  const reject = kp1Fixtures.rejected.find(g => g.why === "check mismatch");
  await b.navigate("about:blank");
  await b.navigate(`${srv.url}#walk=${b64url({ c: challenges[0].ciphertext, k: reject.kp1 })}`);
  await b.waitFor("document.documentElement.classList.contains('ready')");
  await b.waitFor(decoded());
  const refused = await b.evaluate(`[${q("#dec-err")}.textContent, ${q("#dec-out")}.hidden, ${q("#tab-dec")}.getAttribute("aria-selected")]`);
  check("walk link: a reject vector shows the refusal, not a key",
    refused[0].startsWith("This short key can't be read: ") && refused[1] && refused[2] === "true", refused);
  const upper = kp1Fixtures.rejected.find(g => g.why === "prefix is case-sensitive");
  for (const [name, text] of [["reject vector (uppercase prefix)", upper.kp1], ["reject vector (check mismatch)", reject.kp1]]) {
    await b.evaluate(`(() => { ${q("#dec-err")}.hidden = true; ${q("#dec-cipher")}.value = ${js(challenges[0].ciphertext)}; ${q("#dec-key")}.value = ${js(text)}; ${q("#dec-go")}.click(); })()`);
    await b.waitFor(`!${q("#dec-err")}.hidden`);
    const msg = await b.evaluate(`[${q("#dec-err")}.textContent, ${q("#dec-out")}.hidden]`);
    check(`walk one back: a pasted ${name} is refused`, msg[0].startsWith("This short key can't be read: ") && msg[1], msg);
  }

  // challenge 6's kp1 pasted into "Walk one back" decodes
  const six = kp1Fixtures.accepted.find(g => g.source === "puzzles/challenge-06/key.json");
  await b.evaluate(`(() => { ${q("#dec-note")}.hidden = true; ${q("#dec-cipher")}.value = ${js(challenges[5].ciphertext)}; ${q("#dec-key")}.value = ${js(`\n${six.kp1}\n`)}; ${q("#dec-go")}.click(); })()`);
  await b.waitFor(`!${q("#dec-out")}.hidden && ${q("#dec-text")}.textContent === ${js(challenges[5].plaintext)}`);
  check("walk one back: challenge 6's kp1 key decodes", await b.evaluate(`${q("#dec-err")}.hidden && document.querySelectorAll("#dec-walk .unit").length > 10`));

  // a hint and a literal of markup: text only, no element, no dialog, no request
  const m = kp1Fixtures.markup;
  for (const [form, body] of [["k", { c: m.ciphertext, k: m.kp1 }], ["j", { c: m.ciphertext, j: JSON.stringify(JSON.parse(m.keyText)) }]]) {
    const from = b.events.length;
    await b.navigate("about:blank");
    await b.navigate(`${srv.url}#walk=${b64url(body)}`);
    await b.waitFor("document.documentElement.classList.contains('ready')");
    await b.waitFor(decoded());
    await sleep(600);
    const page = await b.evaluate(`[${q("#dec-text")}.textContent, document.querySelectorAll("img").length,
      [...document.querySelectorAll("#dec-walk .lit-text")].map(t => t.textContent).join("|")]`);
    const since = b.events.slice(from);
    const dialogs = since.filter(e => e.method === "Page.javascriptDialogOpening").length;
    const xhits = since.filter(e => e.method === "Network.requestWillBeSent" && /\/x(\?|#|$)/.test(e.params.request.url)).length;
    check(`walk link (${form}): markup in the hint and a literal stays text`,
      page[0] === m.decoded && page[1] === 0 && page[2].includes("<img␣src=x␣onerror=alert(1)>") && dialogs === 0 && xhits === 0,
      js({ page, dialogs, xhits }));
  }

  // malformed fragments are ignored: the page opens as usual
  for (const body of [b64url({ c: "su3cl3" }), b64url({ c: "su3cl3", k: reject.kp1, x: 1 }), "A".repeat(8001)]) {
    await b.navigate("about:blank");
    await b.navigate(`${srv.url}#walk=${body}`);
    await b.waitFor("document.documentElement.classList.contains('ready')");
    await sleep(200);
    check(`walk link: a malformed fragment is ignored (${body.slice(0, 12)}…)`,
      await b.evaluate(`${cipherIs(hero.ciphertext)} && ${q("#tab-enc")}.getAttribute("aria-selected") === "true" && ${q("#dec-cipher")}.value === ""`));
  }

  // the control is disabled, saying why, when there is nothing to type
  await open(360, 780);
  await typeMessage("123 !!!", "en", "zh_daqian");
  await b.waitFor(`${cipherIs("")} && ${q("#stats")}.textContent.startsWith("0 keystrokes")`);
  await b.evaluate(`${q("#key-panel")}.open = true`);
  const empty = await b.evaluate(`[${q("#copy-walk")}.disabled, ${q("#walk-link-note")}.hidden, ${q("#walk-link-note")}.textContent]`);
  check("walk link: an empty ciphertext disables the control with its message",
    empty[0] && !empty[1] && empty[2] === "This message has nothing to type on the keyboard, so there is no walk to share.", empty);
  check("walk link: no horizontal scroll at 360px with the key panel open", await noHScroll(360));
  // the 200-character zh_pinyin edge message fits a link through kp1
  const long = vectors.find(v => v.class === "edge" && v.surface === "zh_pinyin" && Array.from(v.text).length === 200);
  await typeAndWait(long.text, "zh", "zh_pinyin");
  check("walk link: a 200-character Pinyin message fits a link as kp1",
    await b.evaluate(`!${q("#copy-walk")}.disabled && ${q("#walk-link-note")}.hidden`));
  // a #walk opened at 360px stays in its box
  await b.navigate("about:blank");
  await b.navigate(link);
  await b.waitFor("document.documentElement.classList.contains('ready')");
  await b.waitFor(`!${q("#dec-out")}.hidden`);
  check("walk link: no horizontal scroll at 360px on a walk link", await noHScroll(360));
});

await attempt("workbench", async () => {
  await open(1280, 800);
  const layouts = registryJson.workbench.map(w => w.layout);
  const radios = await b.evaluate(`[...document.querySelectorAll("#wb-kbd input")].map(r => [r.name, r.value, r.checked])`);
  check("workbench: a picker with exactly the workbench keyboards, none picked and no 'any'",
    js(radios.map(r => r[1])) === js(layouts) && radios.every(r => r[0] === "wbkbd" && !r[2]), js(radios));
  const status = id => q(`#wb-${id}-status`);
  const out = id => q(`#wb-${id}-out`);
  /** Submit a tool and wait for its answer (or its message). */
  const submit = async (id, field, value, top) => {
    await b.evaluate(`(() => { ${status(id)}.textContent = ""; ${q(field)}.value = ${js(value)};
      ${top === undefined ? "" : `${q("#wb-top")}.value = ${js(String(top))};`} ${q(`#wb-${id}`)}.requestSubmit(); })()`);
    await b.waitFor(`${status(id)}.textContent !== ""`);
    return b.evaluate(`[${status(id)}.textContent, ${out(id)}.hidden, ${out(id)}.textContent]`);
  };
  const look = (keys, top = 10) => submit("look", "#wb-keys", keys, top);
  const type = text => submit("type", "#wb-text", text);
  const pick = layout => b.evaluate(`${q(`#wb-kbd input[value=${layout}]`)}.click()`);

  const none = await look("tgnoyhvljmso");
  const noneT = await type("welcome home");
  check("workbench: without a keyboard it asks for one and answers nothing",
    none[0] === "Pick a keyboard first. The workbench never guesses it." && none[1] && noneT[0] === none[0] && noneT[1], js([none, noneT]));

  // every keyboard: lookups and typing exactly as the Python CLI printed them
  for (const layout of layouts) {
    await pick(layout);
    const cases = wbLookups.filter(r => r.layout === layout && [10, 50, 500].includes(r.top) && r.chunks.length && r.chunks.every(Boolean));
    for (const r of new Set([cases[0], cases.find(c => !c.wellFormed), cases.find(c => c.top !== 10 && c.wellFormed)].filter(Boolean))) {
      const got = await look(r.chunks.join(" "), r.top);
      check(`workbench lookup on ${layout} (${r.id})`, !got[1] && got[2] === r.output
        && got[0].startsWith(`${r.chunks.length} unit${r.chunks.length === 1 ? "" : "s"} on `), js(got).slice(0, 400));
    }
    const typed = wbTypes.filter(r => r.layout === layout && r.input.trim() && Array.from(r.input).length <= 200 && !r.input.includes("\r"));
    for (const r of new Set([typed[0], typed.find(t => /\(literal: /.test(t.output) && /\n[^(]/.test(t.output)), typed[typed.length - 1]].filter(Boolean))) {
      const got = await type(r.input);
      check(`workbench type on ${layout} (${r.id})`, !got[1] && got[2] === r.output, js(got).slice(0, 400));
    }
  }
  // each surface's part carries its language
  await pick("ko_dubeolsik");
  await look("rnr");
  check("workbench: Korean and hanja parts are tagged ko and zh-Hant",
    js(await b.evaluate(`[...${out("look")}.children].map(s => s.lang)`)) === js(["ko", "zh-Hant"]));
  // a new keyboard answers the same keys again
  await pick("zh_cangjie");
  await look("tgno");
  await b.evaluate(`${status("look")}.textContent = ""`);
  await pick("zh_quick");
  await b.waitFor(`${status("look")}.textContent !== ""`);
  const quick = await b.evaluate(`window.__keypath.engine.lookup({ layout: "zh_quick", chunks: ["tgno"] }).then(r => r.text)`);
  check("workbench: picking another keyboard answers again on it",
    await b.evaluate(`${out("look")}.textContent === ${js(quick)} && ${status("look")}.textContent.includes("Quick")`), quick);
  // keys that are not printable ASCII are refused with the page's message
  await pick("zh_daqian");
  const bad = await look("su3 é");
  check("workbench: a key outside printable ASCII is refused, named", bad[1]
    && bad[0] === "“é” (U+00E9) isn't a key on a US keyboard. Units use its printable keys only (letters, digits and punctuation), split by spaces.", js(bad));
  const tab = await look("su3\tcl3");
  check("workbench: an invisible one is named by its code point", tab[1] && tab[0].startsWith("U+0009 isn't a key"), js(tab));
  // Enter in the keys field looks them up
  await b.evaluate(`(() => { ${status("look")}.textContent = ""; const i = ${q("#wb-keys")}; i.value = "su3"; i.focus(); })()`);
  await press("Enter");
  await b.waitFor(`${status("look")}.textContent !== ""`);
  check("workbench: Enter in the keys field looks them up",
    await b.evaluate(`${out("look")}.textContent.startsWith("su3 · (zh, zh_daqian) · well-formed: yes")`));

  // phones: long answers wrap inside their box
  await open(360, 780);
  await pick("zh_daqian");
  const long = await look(`u4 ${"1qaz2wsx3edc".repeat(5)} ${"'\"\\".repeat(20)}`, 500);
  const longT = await type("歡迎回家".repeat(40) + " welcome home and a very long word: donaudampfschifffahrtsgesellschaftskapitän");
  const inBox = await b.evaluate(`[${out("look")}, ${out("type")}].every(p => p.scrollWidth <= p.clientWidth + 1)`);
  check("workbench at 360px: long answers wrap, no horizontal scroll", !long[1] && !longT[1] && inBox && await noHScroll(360),
    await b.evaluate("[document.documentElement.scrollWidth, innerWidth]"));
});

// requests and errors, for everything above
const origin = srv.origin + "/";
const requests = b.events.filter(e => e.method === "Network.requestWillBeSent").map(e => e.params.request.url);
const outside = requests.filter(u => !u.startsWith(origin) && !u.startsWith("about:") && !u.startsWith("data:") && !u.startsWith("blob:"));
check("network: every request stays on the page's origin", requests.length > 20 && outside.length === 0, outside.slice(0, 5));
const errors = b.events.filter(e => e.method === "Runtime.exceptionThrown"
  || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")
  || (e.method === "Log.entryAdded" && e.params.entry.level === "error"));
check("console: no exceptions and no errors", errors.length === 0,
  errors.slice(0, 3).map(e => e.params.exceptionDetails?.exception?.description || e.params.entry?.text || js(e.params.args)));

await attempt("reveal retry", async () => {
  await open(1280, 800);
  await b.waitFor(CARDS_READY);
  await b.send("Network.setBypassServiceWorker", { bypass: true });
  await b.send("Network.setCacheDisabled", { cacheDisabled: true });
  await b.send("Network.setBlockedURLs", { urls: ["*data/challenges/04.json"] });
  await b.evaluate(`(() => { const a = ${q("#challenge-4")}; a.querySelector('.reveal .btn').click(); a.querySelector('.confirm .btn.primary').click(); })()`);
  await b.waitFor(`${q("#challenge-4 .revealed .error button")}`);
  check("reveal: a failed load offers Retry", await b.evaluate(`document.activeElement === ${q("#challenge-4 .revealed .error")}`));
  await b.send("Network.setBlockedURLs", { urls: [] });
  await b.evaluate(`${q("#challenge-4 .revealed .error button")}.click()`);
  await b.waitFor(`${q("#challenge-4 .revealed .plain")}`);
  check("reveal: Retry then shows the answer", await b.evaluate(`${q("#challenge-4 .revealed .plain")}.textContent === ${js(challenges[3].plaintext)}`));
  await b.send("Network.setBypassServiceWorker", { bypass: false });
  await b.send("Network.setCacheDisabled", { cacheDisabled: false });
});

await attempt("offline", async () => {
  await open(1280, 800);
  await b.waitFor("navigator.serviceWorker.ready.then(() => true)");
  await b.send("Page.reload", {});
  await b.waitFor("document.readyState === 'complete' && document.documentElement.classList.contains('ready') && !!navigator.serviceWorker.controller");
  await sleep(2500); // the idle hero check loads the dictionaries through the worker
  await b.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.send("Page.reload", {});
  let ok = false;
  try {
    await b.waitFor(`document.documentElement.classList.contains('ready') && ${cipherIs(hero.ciphertext)} && document.querySelectorAll('#walk .unit').length === 3`, 10000);
    ok = true;
  } catch { ok = false; }
  check("offline: a reload still renders the hero", ok);
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
});

// ================================================================ screenshots
if (SHOTS) {
  await attempt("screenshots", async () => {
    await b.evaluate("localStorage.clear()"); // a visitor's first view: nothing solved yet
    for (const [w, h] of [[1440, 900], [390, 844], [1280, 800], [360, 780]]) {
      for (const dark of [false, true]) {
        const tag = `${w}-${dark ? "dark" : "light"}`;
        await open(w, h, { dark });
        if (w === 1440 && !dark) { await sleep(280); await shot("mid-animation-build-1440"); }
        await sleep(2200);
        await shot(`hero-${tag}`);
        if (w === 1440 || w === 390) await shot(`page-${tag}`, { fullPage: true });
        if (w === 1440 || w === 360) {
          // ETen, Jyutping and JIS kana: the walk and the keyboard picture (kana also with Shift)
          for (const [sid, text, lang] of [["zh_eten", "你好", "zh"], ["zh_jyutping", "廣東話", "zh"], ["ja_kana", "welcome home", "en"]]) {
            await typeAndWait(text, lang, sid);
            await b.evaluate(`${q("#kbd-panel")}.open = true`);
            await sleep(1500);
            await shotOf(`${sid}-${tag}`, ".enc-out");
            await shotOf(`${sid}-keyboard-${tag}`, "#kbd-panel");
          }
          await b.evaluate(`${q("#kbd-pic .kb-shift input")}.click()`);
          await sleep(200);
          await shotOf(`ja_kana-keyboard-shift-${tag}`, "#kbd-panel");
          // Greek: native, with all three dead keys, and English onto Greek; the keyboard and its Shift layer
          await typeAndWait("Καλημέρα! Προϊόν, καΐκι.", "el", "el_greek");
          await b.evaluate(`${q("#kbd-panel")}.open = true`);
          await sleep(1500);
          await shotOf(`el_greek-${tag}`, ".enc-out");
          await shotOf(`el_greek-keyboard-${tag}`, "#kbd-panel");
          await b.evaluate(`${q("#kbd-pic .kb-shift input")}.click()`);
          await sleep(200);
          await shotOf(`el_greek-keyboard-shift-${tag}`, "#kbd-panel");
          await typeAndWait("the cat and the sea", "en", "el_greek");
          await sleep(1500);
          await shotOf(`el_greek-en-${tag}`, ".enc-out");
          await b.evaluate(`(() => { const s = ${q("#lang")}; s.value = "el"; s.dispatchEvent(new Event("change")); })()`);
          await sleep(400);
          await shotOf(`el_greek-chips-${tag}`, "#kbd");
          await b.evaluate(`(() => { ${q("#wb-kbd input[value=el_greek]")}.click(); ${q("#wb-keys")}.value = "kalhm;era pro:i;on kal;b W q";
            ${q("#wb-look")}.requestSubmit(); ${q("#wb-text")}.value = "Καλημέρα, κόσμε! ΟΔΟΣ"; ${q("#wb-type")}.requestSubmit(); })()`);
          await b.waitFor(`!${q("#wb-look-out")}.hidden && !${q("#wb-type-out")}.hidden`);
          await shotOf(`workbench-greek-${tag}`, "#workbench");
          await b.evaluate(`(() => { ${q("#wb-kbd input[value=zh_jyutping]")}.click(); ${q("#wb-keys")}.value = "nei5 hou2 nei7 si1";
            ${q("#wb-look")}.requestSubmit(); ${q("#wb-text")}.value = "廣東話, hello"; ${q("#wb-type")}.requestSubmit(); })()`);
          await b.waitFor(`!${q("#wb-look-out")}.hidden && !${q("#wb-type-out")}.hidden`);
          await shotOf(`workbench-jyutping-${tag}`, "#workbench");
          await open(w, h, { dark });
          await sleep(1200);
        }
        if (w === 1280 || w === 360) {
          await shotOf(`how-${tag}`, "#how");
          await b.evaluate(`(() => { const s = document.querySelectorAll('#walk .stack')[1]; s.scrollIntoView({ block: "center" }); s.click(); })()`);
          await sleep(500);
          await shot(`popover-${tag}`);
          await b.evaluate("document.querySelector('.popover .pop-close').click()");
          await b.waitFor(CARDS_READY);
          await b.evaluate(`(() => { const a = ${q("#challenge-1")}; a.querySelector('.reveal .btn').click(); a.querySelector('.confirm .btn.primary').click(); })()`);
          await b.waitFor(`${q("#challenge-1 .revealed .plain")}`);
          await sleep(1500);
          await shotOf(`challenges-${tag}`, "#challenges");
          // pack II: two hints of #7 asked for, and #11 revealed
          await b.evaluate(`${q("#challenge-7 .hint-btn")}.click()`);
          await b.waitFor(`document.querySelectorAll("#challenge-7 .hint-list li").length === 1`);
          await b.evaluate(`${q("#challenge-7 .hint-btn")}.click()`);
          await b.waitFor(`document.querySelectorAll("#challenge-7 .hint-list li").length === 2`);
          await shotOf(`challenge-7-hints-${tag}`, "#challenge-7");
          await b.evaluate(`(() => { const a = ${q("#challenge-11")}; a.querySelector('.reveal .btn').click(); a.querySelector('.confirm .btn.primary').click(); })()`);
          await b.waitFor(`${q("#challenge-11 .revealed .plain")}`, 30000);
          await sleep(4000);
          await shotOf(`challenge-11-revealed-${tag}`, "#challenge-11");
          // Cangjie: the Shape band and the radical keyboard picture
          await b.evaluate(`${q("input[name=kbd][value=zh_cangjie]")}.click()`);
          await b.waitFor(cipherIs("tgnoyhvljmso"));
          await b.evaluate(`${q("#kbd-panel")}.open = true`);
          await sleep(1500);
          await shotOf(`cangjie-${tag}`, ".enc-out");
          // Vietnamese: the letters over their keys, and the VNI legend
          await typeAndWait("Việt Nam đẹp lắm", "vi", "vi_vni");
          await sleep(1500);
          await shotOf(`vi-vni-${tag}`, ".enc-out");
          await typeAndWait("Việt Nam đẹp lắm", "vi", "vi_telex");
          await sleep(1500);
          await shotOf(`vi-telex-${tag}`, ".enc-out");
          // the workbench, both tools answered on Bopomofo
          await b.evaluate(`(() => { ${q("#wb-kbd input[value=zh_daqian]")}.click(); ${q("#wb-keys")}.value = "cj0 u/6 ru8 zz'";
            ${q("#wb-look")}.requestSubmit(); ${q("#wb-text")}.value = "歡迎回家, hello"; ${q("#wb-type")}.requestSubmit(); })()`);
          await b.waitFor(`!${q("#wb-look-out")}.hidden && !${q("#wb-type-out")}.hidden`);
          await shotOf(`workbench-${tag}`, "#workbench");
        }
      }
    }
    // mid-animation: walk back and replay typing
    await open(1440, 900);
    await sleep(2200);
    await b.evaluate(`${q("#walk-back")}.click()`);
    await sleep(330);
    await shotOf("mid-animation-walkback-1440", ".enc-out");
    await sleep(1500);
    await b.evaluate(`${q("#replay")}.click()`);
    await sleep(430);
    await shotOf("mid-animation-replay-1440", ".enc-out");
    check(`screenshots saved to ${SHOTS}`, true);
  });
}

b.close();
srv.server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(failed.length ? "CHROMIUM FAIL" : "CHROMIUM PASS");
process.exit(failed.length ? 1 : 0);
