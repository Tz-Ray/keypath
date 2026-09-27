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
const challenges = [1, 2, 3, 4, 5, 6].map(n => readJson(`data/challenges/0${n}.json`));

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
  check("chips: six examples", chips.length === 6 && chips.every((t, i) => t === S.chips[i].text), chips);
  for (const [i, c] of S.chips.entries()) {
    await b.evaluate(`document.querySelectorAll('#examples button')[${i}].click()`);
    await b.waitFor(cipherIs(c.ciphertext));
    await settle();
    const key = await b.evaluate(`window.__keypath.engine.encode({ text: ${js(c.text)}, source: ${js(c.source)}, surface: ${js(c.surface)} }).then(r => r.keyText)`);
    check(`chip ${c.text}: ciphertext ${c.ciphertext}`, await b.evaluate(keyIs(key)));
  }
});

await attempt("typing", async () => {
  // every live keyboard: the site vectors, the corpora and fuzz strings
  const bySurface = new Map();
  const usable = v => v.carried && !v.jsRefusal && v.expect && v.expect.ciphertext !== undefined && Array.from(v.text).length <= 200 && v.text.trim();
  for (const cls of ["site", "corpus-zh", "corpus-ko", "corpus-ru", "corpus-es", "corpus-en", "fuzz-en-x", "fuzz-zh", "fuzz-es", "fuzz-ru", "fuzz-ko", "fuzz-en-id"]) {
    for (const v of vectors) {
      if (v.class !== cls || !usable(v)) continue;
      const k = `${v.source}/${v.surface}`;
      const list = bySurface.get(k) || [];
      if (list.length < (cls === "site" ? 9 : 3) && !list.some(x => x.text === v.text)) { list.push(v); bySurface.set(k, list); }
    }
  }
  const picked = [...bySurface.values()].flat();
  const surfaces = new Set(picked.map(v => v.surface));
  check("typing: vectors cover all 8 keyboards", surfaces.size === 8, [...surfaces]);
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
  const oov = vectors.find(v => v.class === "fuzz-en-oov");
  await typeMessage(oov.text, oov.source, oov.surface);
  await b.waitFor(`!${q("#enc-refusal")}.hidden`);
  const msg = await b.evaluate(`${q("#enc-refusal")}.textContent`);
  check("typing: words outside the list are refused, naming them",
    msg.startsWith("Not in this page's 10,000-word English list: ") && oov.jsRefusal[1].every(w => msg.includes(w)), msg);
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
      check("keyboard: arrow keys move between keyboard chips", moved === "kbd:zh_pinyin" && await b.evaluate(`${q("input[value=zh_pinyin]")}.checked`), moved);
      await b.waitFor(cipherIs(S.heroAll.zh_pinyin));
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
  await b.evaluate(capture);
  await b.evaluate(`${q("#make-puzzle")}.click()`);
  await b.evaluate(`${q("#puzzle-hint")}.checked = true`);
  await b.evaluate(`${q("#puzzle-copy")}.click()`);
  const puzzleLink = await b.waitFor("window.__copied && window.__copied.includes('#puzzle=') && window.__copied");
  await b.navigate("about:blank");
  await b.navigate(puzzleLink);
  await b.waitFor("document.documentElement.classList.contains('ready') && document.querySelector('#puzzle-h')");
  const banner = await b.evaluate(`${q(".puzzle-banner")}.textContent`);
  check("share: #puzzle= shows the ciphertext and the hint", banner.includes(S.chips[4].ciphertext) && banner.includes("Hint: typed on a Russian ЙЦУКЕН keyboard."), banner);
  const answer = async text => {
    await b.evaluate(`(() => { ${q("#puzzle-answer")}.value = ${js(text)}; ${q(".puzzle-banner form")}.requestSubmit(); })()`);
    await sleep(150);
    return b.waitFor(`${q(".puzzle-banner .verdict")}.textContent`);
  };
  check("share: puzzle rejects a wrong answer", (await answer("hedgehog")) === "Not quite. Keep going.");
  check("share: puzzle accepts the answer", (await answer("  ЁЖИК! ")) === "Solved.");
  check("share: puzzle accepts it accents aside", (await answer("ежик")) === "Solved, accents aside.");
});

await attempt("challenges", async () => {
  await open(1280, 800);
  await b.waitFor("document.querySelectorAll('.chal').length === 6");
  for (const [i, c] of challenges.entries()) {
    const n = i + 1;
    const sel = `#challenge-${n}`;
    check(`challenge ${n}: ciphertext`, await b.evaluate(`${q(`${sel} .chal-cipher code`)}.textContent === ${js(c.ciphertext)}`));
    await b.evaluate(`(() => { ${q(`${sel} input`)}.value = ${js(c.plaintext)}; ${q(`${sel} form`)}.requestSubmit(); })()`);
    const verdict = await b.waitFor(`${q(`${sel} .verdict`)}.textContent`);
    check(`challenge ${n}: the answer checks`, verdict === "Solved.", verdict);
    await b.evaluate(`${q(`${sel} .reveal .btn`)}.click()`);
    await b.evaluate(`${q(`${sel} .confirm .btn.primary`)}.click()`);
    await b.waitFor(`${q(`${sel} .revealed .plain`)}`);
    const plain = await b.evaluate(`${q(`${sel} .revealed .plain`)}.textContent`);
    check(`challenge ${n}: reveal shows the plaintext`, plain === c.plaintext, plain);
  }
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
        if (w === 1280 || w === 360) {
          await shotOf(`how-${tag}`, "#how");
          await b.evaluate(`(() => { const s = document.querySelectorAll('#walk .stack')[1]; s.scrollIntoView({ block: "center" }); s.click(); })()`);
          await sleep(500);
          await shot(`popover-${tag}`);
          await b.evaluate("document.querySelector('.popover .pop-close').click()");
          await b.waitFor("document.querySelectorAll('.chal').length === 6");
          await b.evaluate(`(() => { const a = ${q("#challenge-1")}; a.querySelector('.reveal .btn').click(); a.querySelector('.confirm .btn.primary').click(); })()`);
          await b.waitFor(`${q("#challenge-1 .revealed .plain")}`);
          await sleep(1500);
          await shotOf(`challenges-${tag}`, "#challenges");
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
