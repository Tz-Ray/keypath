// The playground: "Hide a message" (encode) and "Walk one back" (decode).
import { $, $$, h, announce, toast, copyText, reducedMotion, cps } from "./dom.js";
import { T, LANG_NAMES, LANG_TAGS, DEFAULT_SURFACE } from "./text.js";
import { LOWERCASE_LANGUAGES } from "../engine/normalize.js";
import { renderCipher, statsOf, keyspaceFormula } from "./walk.js";
import { mountFigure } from "./figure.js";
import { renderKeyText, bindKeyButtons } from "./keypanel.js";
import { renderKeyboard } from "./keyboard.js";
import { closePopover } from "./popover.js";

const DEBOUNCE = 150;

export function initPlayground({ engine, legends, getEngine, dumpsKeyWithSpans }) {
  const registry = engine.registry;
  const layouts = engine.layouts;
  const surfaces = new Map(engine.surfaces.map(s => [s.id, s]));

  const el = {
    tabs: $$("#try [role=tab]"),
    msg: $("#msg"), lang: $("#lang"), langMode: $("#lang-mode"),
    chips: $$("#kbd input[name=kbd]"), routeNote: $("#route-note"),
    examples: $$("#examples button"),
    result: $("#enc-result"), refusal: $("#enc-refusal"),
    cipher: $("#cipher"), caption: $("#caption"), stats: $("#stats"), stats2: $("#stats2"),
    whatIf: $("#whatif-slot"), walk: $("#walk"), walked: $("#walked"),
    walkBack: $("#walk-back"), replay: $("#replay"), table: $("#table-toggle"), marks: $("#unit-marks"),
    keyPre: $("#key-pre"), keyPanel: $("#key-panel"), kbdPanel: $("#kbd-panel"), kbdPic: $("#kbd-pic"),
    copyCipher: $("#copy-cipher"),
    decCipher: $("#dec-cipher"), decKey: $("#dec-key"), decFile: $("#dec-file"), decGo: $("#dec-go"),
    decOut: $("#dec-out"), decText: $("#dec-text"), decWalk: $("#dec-walk"), decErr: $("#dec-err"), decWhatIf: $("#dec-whatif"),
  };

  const state = {
    lang: "en", langMode: "detected", surface: "zh_daqian", ja: false,
    result: null, seq: 0, table: false, fig: null, prevKeys: null,
    cipherSpans: new Map(), keySpans: new Map(), kb: null, heroLists: null,
  };

  // ------------------------------------------------------------ chips
  function syncChips() {
    const allowed = engine.allowed(state.lang);
    for (const input of el.chips) {
      const ok = allowed.includes(input.value);
      input.checked = input.value === state.surface;
      input.setAttribute("aria-disabled", ok ? "false" : "true");
      input.closest(".chip").classList.toggle("off", !ok);
      const tip = input.closest(".chip").querySelector(".tip");
      const reason = ok ? "" : routeOffText();
      input.closest(".chip").title = reason;
      if (tip) tip.textContent = reason ? ` (${reason})` : "";
    }
    const off = allowed.length < el.chips.length && !state.ja;
    el.routeNote.hidden = !off;
    el.routeNote.textContent = off ? routeOffText() : "";
    el.lang.value = state.lang;
    el.langMode.textContent = state.langMode === "detected" ? T.detected : T.chosen;
  }
  function routeOffText() {
    const names = engine.allowed(state.lang).map(id => surfaces.get(id).label);
    return T.routeOff(LANG_NAMES[state.lang], names);
  }

  function setLang(lang) {
    state.lang = lang;
    if (!engine.allowed(lang).includes(state.surface)) state.surface = DEFAULT_SURFACE[lang] || state.surface;
  }

  // ------------------------------------------------------------ encode
  let timer = 0, composing = false;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE);
  }

  function detectNow() {
    const text = el.msg.value;
    if (!text) { state.langMode = "detected"; state.ja = false; return; }
    const d = engine.detect(text);
    // only a detected Japanese message is refused here; a chosen language
    // is encoded as chosen (the engine treats kana as plain text then)
    state.ja = state.langMode === "detected" && d === "ja";
    if (state.langMode === "detected" && d && d !== "ja") setLang(d);
  }

  async function run(animate = "diff") {
    clearTimeout(timer);
    const seq = ++state.seq;
    detectNow();
    syncChips();
    const text = el.msg.value;
    if (!text) return refuse(T.empty);
    if (state.ja) return refuse(T.jaSource);
    const busy = setTimeout(() => { if (seq === state.seq) setBusy(true); }, 120);
    let r;
    try {
      const e = await getEngine();
      r = await e.encode({ text, source: state.lang, surface: state.surface });
    } catch (err) {
      r = { ok: false, reason: "encodeError", message: String(err && err.message) };
    }
    clearTimeout(busy);
    if (seq !== state.seq) return;
    setBusy(false);
    if (!r.ok) {
      if (r.reason === "unknownWords") return refuse(T.unknownWords(r.words));
      if (r.reason === "jaSource") return refuse(T.jaSource);
      if (r.reason === "routeOff") return refuse(routeOffText());
      if (r.reason === "newerUnicode") return refuse(T.newerUnicode(r.codePoint));
      if (r.reason === "empty") return refuse(T.empty);
      if (r.reason === "loadFailed") return refuse(T.loadFailed, true);
      return refuse(T.encodeError);
    }
    show(r, animate);
    announce(T.announce(r.ciphertext.length), 800);
  }

  function setBusy(on) {
    el.result.classList.toggle("busy", on);
    el.walk.setAttribute("aria-busy", on ? "true" : "false");
    if (on) el.cipher.replaceChildren(h("span.looking", T.lookingUp));
    else if (state.result && el.cipher.querySelector(".looking")) paintCipher(state.result);
  }

  function refuse(text, retry = false) {
    state.result = null;
    el.result.hidden = true;
    el.refusal.hidden = false;
    el.refusal.replaceChildren(h("span", text));
    if (retry) {
      const b = h("button.btn.small", { type: "button" }, T.retry);
      b.addEventListener("click", () => run("build"));
      el.refusal.append(" ", b);
    }
  }

  function paintCipher(r) {
    const spans = renderCipher(el.cipher, r.trace, registry);
    state.cipherSpans = new Map(spans.map(s => [s.dataset.path, s]));
    for (const s of spans) {
      s.addEventListener("mouseenter", () => highlight(s.dataset.path, true));
      s.addEventListener("mouseleave", () => highlight(null, true));
    }
  }

  function surfaceName(id) { return surfaces.get(id).longName; }

  function show(r, animate) {
    closePopover(false);
    state.result = r;
    el.refusal.hidden = true;
    el.result.hidden = false;
    el.walked.textContent = "";
    el.walked.hidden = true;
    paintCipher(r);
    const sname = surfaceName(state.surface);
    const [before, after] = T.caption(sname);
    el.caption.replaceChildren(before, h("bdi", r.text), after);
    const st = statsOf(r.trace, r.key);
    const [n, m] = st.leak;
    el.stats.textContent = T.statsLine(st.k, st.choices, n ? T.leakSome(n, m) : T.leakNone);
    el.stats.classList.toggle("leaks", n > 0);
    const f = keyspaceFormula(st.factors);
    el.stats2.hidden = !f;
    if (f) {
      const formula = f.sup ? [f.text, h("sup", f.sup)] : [f.text];
      el.stats2.replaceChildren(T.keyspace[0], h("span.formula", formula), T.keyspace[1]);
    }
    drawFigure(animate);
    state.keySpans = renderKeyText(el.keyPre, r.keyText, r.spans);
    for (const [k, span] of state.keySpans) {
      if (k.startsWith("t:")) continue;
      span.addEventListener("mouseenter", () => highlight(k, true));
      span.addEventListener("mouseleave", () => highlight(null, true));
    }
    const layout = surfaces.get(state.surface).layout;
    const pairs = r.trace.segments.flatMap(s => s.words.flatMap(w => (w.units || []).map(u => [u.keys, u.reading])));
    el.kbdPanel.hidden = layout === "en_identity";
    state.kb = renderKeyboard(el.kbdPic, layout, r.ciphertext, legends, { pairs });
  }

  function drawFigure(animate) {
    const r = state.result;
    if (!r) return;
    if (state.fig) state.fig.clearWhatIf();
    if (state.fig && state.fig.view) state.fig.view.destroy();
    state.fig = mountFigure(el.walk, r.trace, {
      engine: getEngine, registry, layouts, legends,
      animate: state.prevKeys ? animate : "build",
      prevKeys: animate === "diff" ? state.prevKeys : null,
      message: r.text, surfaceName: surfaceName(state.surface),
      whatIfSlot: el.whatIf, table: state.table, heroLists: state.heroLists,
      onFocusUnit: u => highlight(u ? u.path.join("-") : null, false),
    });
    state.prevKeys = state.fig.view ? state.fig.view.keysSeen : state.prevKeys;
  }

  function highlight(pathKey, fromOutside) {
    for (const s of el.cipher.querySelectorAll(".cu.hl")) s.classList.remove("hl");
    for (const s of el.keyPre.querySelectorAll(".ks.hl")) s.classList.remove("hl");
    let keys = null;
    if (pathKey) {
      const c = state.cipherSpans.get(pathKey);
      if (c) { c.classList.add("hl"); keys = c.textContent; }
      const k = state.keySpans.get(pathKey);
      if (k) k.classList.add("hl");
    }
    if (fromOutside && state.fig && state.fig.view) state.fig.view.highlight(pathKey ? pathKey.split("-").map(Number) : null);
    if (state.kb) state.kb.highlight(keys);
  }

  // the message box grows with its text (one line at rest)
  function fitMessage() {
    el.msg.style.height = "auto";
    el.msg.style.height = `${Math.min(el.msg.scrollHeight + 2, 168)}px`;
  }
  window.addEventListener("resize", fitMessage);

  // ------------------------------------------------------------ wiring
  el.msg.addEventListener("compositionstart", () => { composing = true; clearTimeout(timer); });
  el.msg.addEventListener("compositionend", () => { composing = false; run(); });
  el.msg.addEventListener("input", ev => {
    if (composing || ev.isComposing) return;
    if (!el.msg.value) state.langMode = "detected";
    fitMessage();
    schedule();
  });
  el.lang.addEventListener("change", () => {
    state.langMode = "chosen";
    setLang(el.lang.value);
    run("build");
  });
  for (const input of el.chips) {
    input.addEventListener("change", () => {
      if (input.getAttribute("aria-disabled") === "true") {
        // keep the previous keyboard; the reason is shown under the chips
        syncChips();
        el.routeNote.classList.remove("pulse");
        void el.routeNote.offsetWidth;
        el.routeNote.classList.add("pulse");
        return;
      }
      state.surface = input.value;
      run("build");
    });
  }
  for (const b of el.examples) {
    b.addEventListener("click", () => {
      load({ t: b.dataset.text, l: b.dataset.lang, s: b.dataset.surface });
    });
  }
  el.marks.addEventListener("change", () => el.cipher.classList.toggle("marks", el.marks.checked));
  el.cipher.classList.toggle("marks", el.marks.checked);
  el.copyCipher.addEventListener("click", async () => {
    if (state.result && await copyText(state.result.ciphertext)) toast(T.copied);
  });
  bindKeyButtons($("#copy-key"), $("#dl-key"), () => (state.result ? state.result.keyText : ""));
  el.table.addEventListener("click", () => {
    state.table = !state.table;
    el.table.setAttribute("aria-pressed", String(state.table));
    el.walkBack.disabled = state.table;
    el.replay.disabled = state.table;
    drawFigure("none");
  });

  // walk back: a real decode of the current ciphertext and key, lit bottom-up
  el.walkBack.addEventListener("click", async () => {
    const r = state.result;
    if (!r || !state.fig || !state.fig.view) return;
    el.walked.hidden = true;
    let back;
    try {
      const e = await getEngine();
      back = await e.decode({ ciphertext: r.ciphertext, keyText: r.keyText });
    } catch {
      back = { ok: false, reason: "loadFailed" };
    }
    if (state.result !== r) return;
    await state.fig.view.walkBack();
    if (state.result !== r) return;
    el.walked.hidden = false;
    if (!back.ok) {
      el.walked.textContent = back.reason === "loadFailed" ? T.loadFailed : T.keyInvalid(back.message);
      return;
    }
    // "identical" only when the decoded text is exactly what is in the box
    const parts = back.text !== r.text ? T.walkedBackOther
      : back.text === el.msg.value ? T.walkedBack
      : T.walkedBackNorm(LOWERCASE_LANGUAGES.has(r.key.source_language));
    el.walked.replaceChildren(parts[0], h("bdi", back.text), parts[1]);
  });

  // replay typing: the cursor steps through the keycaps, the ciphertext fills in
  el.replay.addEventListener("click", async () => {
    if (reducedMotion() || !state.fig || !state.fig.view) return;
    const r = state.result;
    const chars = Array.from(el.cipher.querySelectorAll(".cc"));
    el.cipher.classList.add("replaying");
    chars.forEach(c => c.classList.remove("typed"));
    el.replay.disabled = true;
    await state.fig.view.replay(c => {
      if (chars[c.at]) chars[c.at].classList.add("typed");
      if (state.kb) state.kb.flash(c.key);
    });
    el.replay.disabled = false;
    if (state.result === r) el.cipher.classList.remove("replaying");
  });

  // mode tabs
  const panels = el.tabs.map(t => document.getElementById(t.getAttribute("aria-controls")));
  function selectTab(i, focus) {
    el.tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(i === j));
      t.tabIndex = i === j ? 0 : -1;
      panels[j].hidden = i !== j;
    });
    if (focus) el.tabs[i].focus();
    closePopover(false);
    if (i === 1 && !el.decCipher.value && !el.decKey.value && state.result) {
      el.decCipher.value = state.result.ciphertext;
      el.decKey.value = state.result.keyText;
    }
  }
  el.tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(i, false));
    t.addEventListener("keydown", ev => {
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { ev.preventDefault(); selectTab(1 - i, true); }
      if (ev.key === "Home") { ev.preventDefault(); selectTab(0, true); }
      if (ev.key === "End") { ev.preventDefault(); selectTab(1, true); }
    });
  });

  // ------------------------------------------------------------ decode mode
  el.decFile.addEventListener("change", async () => {
    const f = el.decFile.files && el.decFile.files[0];
    if (!f) return;
    el.decKey.value = await f.text();
    el.decFile.value = "";
  });
  let decFig = null;
  el.decGo.addEventListener("click", async () => {
    closePopover(false);
    el.decErr.hidden = true;
    // an empty ciphertext is valid: a message of digits and punctuation
    // only rides entirely in the key
    const ciphertext = el.decCipher.value.trim();
    const keyText = el.decKey.value;
    if (!keyText.trim()) return decError(T.needKey);
    let r;
    try {
      const e = await getEngine();
      r = await e.decode({ ciphertext, keyText });
    } catch {
      r = { ok: false, reason: "crashed" };
    }
    if (!r.ok) {
      el.decOut.hidden = true;
      const msg = r.reason === "badJson" ? T.badJson : r.reason === "keyInvalid" ? T.keyInvalid(r.message)
        : r.reason === "notCarried" ? T.notCarried(r.message) : r.reason === "tier2" ? T.tier2
        : r.reason === "crashed" ? T.keyCrashed : T.loadFailed;
      return decError(msg);
    }
    el.decOut.hidden = false;
    el.decText.textContent = r.text;
    el.decText.lang = LANG_TAGS[r.key.source_language] || "en";
    if (decFig && decFig.view) decFig.view.destroy();
    const names = r.trace.segments.map(s => surfaces.get(s.surface)).filter(Boolean).map(s => s.longName);
    decFig = mountFigure(el.decWalk, r.trace, {
      engine: getEngine, registry, layouts, legends, animate: "none",
      message: r.text, surfaceName: names.join(", then "), whatIfSlot: el.decWhatIf,
    });
    if (decFig.view) decFig.view.walkBack();
  });
  function decError(text) {
    el.decErr.hidden = false;
    el.decErr.textContent = text;
  }

  // ------------------------------------------------------------ public
  /** Fill the form (example chip or #try= link) and encode now. */
  function load({ t, l, s }, animate = "build") {
    el.msg.value = t;
    fitMessage();
    state.langMode = "detected";
    if (l && engine.allowed(l).length) {
      // the link's language wins; it reads "detected" only if detection agrees
      setLang(l);
      if (engine.detect(t) !== l) state.langMode = "chosen";
    }
    if (s && engine.allowed(state.lang).includes(s)) state.surface = s;
    detectNow();
    return run(animate);
  }

  /** Show a precomputed result (the hero) without encoding. */
  function showPrecomputed(hero) {
    const key = JSON.parse(hero.keyText);
    const { spans } = dumpsKeyWithSpans(key);
    state.heroLists = hero.lists;
    el.msg.value = hero.text;
    fitMessage();
    state.lang = hero.source;
    state.surface = hero.surface;
    syncChips();
    show({ ok: true, text: hero.text, ciphertext: hero.ciphertext, key, keyText: hero.keyText, spans, trace: hero.trace }, "build");
  }

  /** Re-encode the current form and compare (used once the engine is warm). */
  async function verifyHero(hero) {
    const e = await getEngine();
    const r = await e.encode({ text: hero.text, source: hero.source, surface: hero.surface });
    const same = r.ok && r.ciphertext === hero.ciphertext && r.keyText === hero.keyText
      && JSON.stringify(r.trace) === JSON.stringify(hero.trace);
    // the page keeps showing the hero only if the live engine reproduces it
    if (!same && el.msg.value === hero.text && state.surface === hero.surface) run("none");
    else if (state.result && state.result.ciphertext === hero.ciphertext) {
      state.result = { ...r, trace: state.result.trace };
      state.heroLists = null;
    }
    return same;
  }

  const initialOpen = () => {
    if (el.result.getBoundingClientRect().width >= 900) el.kbdPanel.open = true;
  };

  syncChips();
  return {
    load, showPrecomputed, verifyHero, initialOpen, run,
    get state() { return { text: el.msg.value, lang: state.lang, surface: state.surface, result: state.result }; },
    surfaceName,
  };
}
