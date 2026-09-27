// The walk figure: one Trace (engine/decode.js) drawn as a layered graph in
// reading order.  Word groups flow left to right and wrap like text; inside
// each group one column per key unit; fixed horizontal bands from the
// message (top) down to the keys (bottom).  Layout is pure CSS (band heights
// are custom properties, edges are inline SVG with percentage coordinates),
// so the script never measures anything.
import { h, reducedMotion, cps } from "./dom.js";
import { T, LANG_TAGS, SURFACE_BADGE } from "./text.js";

const US_PUNCT = /[^a-zA-Z]/;
const PINYIN_TONE = { 1: "ˉ", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙" };
const UNIT_LIMIT = 60;
const FAN_MAX = 10;

// ------------------------------------------------------------ legends

/** Per-layout key -> legend maps, built once from data/layouts.json. */
export function makeLegends(layouts) {
  const L = layouts.data;
  const dq = new Map();
  for (const [sym, key] of Object.entries(L.zh_daqian.symbolToKey)) dq.set(key, sym);
  for (const [tone, key] of Object.entries(L.zh_daqian.toneToKey)) dq.set(key, tone);
  const ko = new Map();
  for (const [jamo, keys] of Object.entries(L.ko_dubeolsik.keysByJamo)) if (keys.length === 1) ko.set(keys, jamo);
  const ru = new Map(Object.entries(L.ru_jcuken.keysByLetter).map(([l, k]) => [k, l]));
  const es = new Map(L.es_accent.rows.map(([b, d, v]) => [b + d, v]));

  /** keys (string) on a layout -> [{key, legend, mis, shift}] */
  function legends(layout, keys) {
    const ks = cps(keys);
    return ks.map((key, i) => {
      let legend = "", mis = false, shift = false;
      if (layout === "zh_daqian") { legend = dq.get(key) || ""; mis = US_PUNCT.test(key); }
      else if (layout === "zh_pinyin") legend = PINYIN_TONE[key] || "";
      else if (layout === "ko_dubeolsik") { legend = ko.get(key) || ""; shift = key >= "A" && key <= "Z"; }
      else if (layout === "ru_jcuken") { legend = ru.get(key) || ""; mis = US_PUNCT.test(key); }
      else if (layout === "es_accent" && key >= "0" && key <= "9" && i > 0) legend = es.get(ks[i - 1] + key) || "";
      return { key, legend, mis, shift };
    });
  }
  return { legends, dq, ko, ru, es, layouts };
}

// ------------------------------------------------------------ model

/** Flatten a trace into words and units with the facts the figure needs. */
export function modelOf(trace, registry) {
  const words = [], units = [], segs = [];
  let nHops = 0, hasHomophone = false, hasLetters = false, hasEnglish = false;
  trace.segments.forEach((seg, si) => {
    const surf = registry.surfaces[seg.language][seg.layout];
    const info = { nHops: 0, hasHomophone: false, hasLetters: false, hasUnits: false };
    segs.push(info);
    seg.words.forEach((word, wi) => {
      const w = { si, wi, seg, word, surfaceId: seg.surface, literal: Object.prototype.hasOwnProperty.call(word, "literal"), units: [] };
      if (!w.literal) {
        nHops = Math.max(nHops, word.chain.length);
        info.nHops = Math.max(info.nHops, word.chain.length);
        word.units.forEach((unit, ui) => {
          const kind = surf.homophoneLayer ? "homophone"
            : seg.layout === "ko_dubeolsik" ? "syllable"
            : seg.layout === "en_identity" ? "plain" : "letters";
          info.hasUnits = true;
          if (kind === "homophone") hasHomophone = info.hasHomophone = true;
          else if (kind === "plain") hasEnglish = true;
          else hasLetters = info.hasLetters = true;
          const u = { si, wi, ui, unit, kind, seg, word: w, n: units.length, path: [si, wi, ui] };
          w.units.push(u);
          units.push(u);
        });
      }
      words.push(w);
    });
  });
  return { trace, words, units, segs, nHops, hasHomophone, hasLetters, hasEnglish, multi: trace.segments.length > 1 };
}

/**
 * The band stack (top to bottom) for one segment.  Bands are per segment:
 * segments are drawn as separate blocks, so only words of one segment need
 * to line up, and a segment never carries another one's empty bands.
 */
function bandsOf(m) {
  const b = ["msg"];
  for (let i = 0; i < m.nHops; i++) b.push(`hop${i}`, `dict${i}`);
  if (m.hasUnits) {
    b.push("bracket");
    if (m.hasHomophone) b.push("char", "choice", "sound");
    else if (m.hasLetters) b.push("letters");
    if (m.hasHomophone || m.hasLetters) b.push("keyedge");
    b.push("keys");
  }
  return b;
}

const bandClass = b => (/^hop\d/.test(b) ? "hop" : /^dict\d/.test(b) ? "dict" : b);

export function bandLabel(b, m) {
  const c = bandClass(b);
  if (c === "msg") return T.bands.msg;
  if (c === "dict") return T.bands.dict;
  if (c === "char") return T.bands.char;
  if (c === "sound") return T.bands.sound;
  if (c === "letters") return T.bands.letters;
  if (c === "keys") return T.bands.keys;
  return "";
}

// ------------------------------------------------------------ small parts

const svgLine = (x1, y1, x2, y2, cls = "edge") =>
  h("line", { class: cls, x1, y1, x2, y2, pathLength: "1", "vector-effect": "non-scaling-stroke" });

const edgeSvg = (cls, ...lines) => h("svg", { class: `edges ${cls}`, "aria-hidden": "true", focusable: "false", preserveAspectRatio: "none" }, ...lines);

function band(name, bi, ...children) {
  const el = h(`div.band.b-${bandClass(name)}`, { "data-band": name, style: { "--bi": String(bi) } }, ...children);
  return el;
}

function keycaps(legend, layout) {
  const caps = legend.map(({ key, legend: leg, mis, shift }) => {
    const title = mis && leg ? T.misdirection(key, leg) : null;
    return h("span.kc", h("kbd", { lang: "en", translate: "no", title, class: mis ? "mis" : null },
      shift ? h("span.shift", { "aria-hidden": "true" }, "⇧") : null,
      h("span.main", shift ? key : key),
      leg ? h("span.leg", { lang: layout === "ru_jcuken" ? "ru" : layout === "ko_dubeolsik" ? "ko" : layout === "es_accent" ? "es" : "zh-Hant", "aria-hidden": "true" }, leg) : null,
      mis ? h("span.dot", { "aria-hidden": "true" }) : null));
  });
  return h("span.keyrow", { style: { "--n": String(legend.length) } }, caps);
}

function fan(n) {
  if (n <= 0) return edgeSvg("fan");
  if (n > FAN_MAX) return edgeSvg("fan", svgLine("50%", "0", "50%", "100%", "edge key"));
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(svgLine("50%", "0", `${((i + 0.5) / n) * 100}%`, "100%", "edge key"));
  const svg = edgeSvg("fan", ...lines);
  svg.style.setProperty("--n", String(n));
  return svg;
}

function rankText(u) {
  const { unit, seg } = u;
  if (unit.selected !== null && unit.selected !== undefined) return T.pickedByDigit(unit.selected);
  if (seg.layout === "ja_romaji" && unit.index === null) return T.kanaAsTyped;
  if (unit.count === 1) return T.onlyOne;
  return T.rank(unit.index, unit.count);
}

// ------------------------------------------------------------ figure

/**
 * Render a trace into `host`.
 * ctx: {registry, layouts, legends, surfaces (Map id -> surface), animate: "build"|"diff"|"none",
 *       prevKeys?: Set, onFocusUnit?(u|null), onOpenUnit?(view, u, el), onOpenSense?(view, w, hop, el),
 *       message?, surfaceName?, limit?}
 */
export function renderWalk(host, trace, ctx) {
  const m = modelOf(trace, ctx.registry);
  const segInfo = m.segs.map(info => {
    const bands = bandsOf(info);
    return { ...info, bands, bandIndex: new Map(bands.map((b, i) => [b, i])) };
  });
  const bands = segInfo.reduce((a, s) => (s.bands.length > a.length ? s.bands : a), []);
  const limit = ctx.limit ?? UNIT_LIMIT;
  const view = {
    model: m, host, trace, unitEls: new Map(), wordEls: new Map(), stops: [], keysSeen: new Set(),
    override: null,
  };
  const pathKey = p => p.join("-");
  const timers = [];
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

  const root = h("div.walk-host", {
    class: `walk-host${m.multi ? " multi" : ""}`,
  });
  const figure = h("figure.walk-fig", { "aria-label": T.figureLabel });
  const caption = h("figcaption.vh", T.figCaption(ctx.message ?? trace.text, trace.ciphertext, ctx.surfaceName ?? "",
    m.words.filter(w => !w.literal).length, m.units.length, cps(trace.ciphertext).length));
  figure.append(caption);

  // legend (narrow) and gutter (wide) share the band labels
  const labelled = segInfo.flatMap(s => s.bands).filter(b => bandLabel(b, m));
  const legendRow = h("ul.walk-legend", { "aria-hidden": "true" },
    ["msg", "dict", "char", "sound", "letters", "keys"].filter(c => labelled.some(x => bandClass(x) === c)).map(c => h(`li.lg-${c}`, h("span.dot"), bandLabel(c === "dict" ? "dict0" : c, m))));
  // the gutter labels the bands of a single-segment walk (multi: legend only)
  const gutter = m.multi ? null : h("div.walk-gutter", { "aria-hidden": "true",
    class: `walk-gutter${segInfo[0].hasHomophone ? " has-homophone" : ""}${segInfo[0].hasLetters ? " has-letters" : ""}` },
    segInfo[0].bands.map(b => h(`div.band.b-${bandClass(b)}`, bandLabel(b, m) ? h("span", bandLabel(b, m)) : null)));

  const list = h("ol.walk", { role: "list" });
  let rendered = 0, truncated = false;

  const segEls = new Map();
  const segEl = (si, seg) => {
    if (segEls.has(si)) return segEls.get(si);
    const words = h("ol.seg-words", { role: "list" });
    const S = segInfo[si];
    const li = h("li.seg", { "data-surface": seg.surface, class: `seg${S.hasHomophone ? " has-homophone" : ""}${S.hasLetters ? " has-letters" : ""}` },
      m.multi ? h("div.seg-badge", h("span", SURFACE_BADGE[seg.surface] || seg.surface)) : null, words);
    list.append(li);
    const rec = { li, words };
    segEls.set(si, rec);
    return rec;
  };

  let wordNo = 0;
  for (const w of m.words) {
    if (rendered >= limit) { truncated = true; break; }
    const S = segInfo[w.si];
    const { bandIndex } = S;
    const srcTag = LANG_TAGS[trace.source] || "en";
    const gkey = `${w.si}:${w.wi}:${w.surfaceId}:${w.literal ? `L${w.word.literal}` : w.word.source}:${w.literal ? "" : w.word.units.map(u => `${u.keys}/${u.index}`).join(",")}`;
    const isNew = !ctx.prevKeys || !ctx.prevKeys.has(gkey);
    view.keysSeen.add(gkey);
    wordNo++;
    const g = h("li.wg", { "data-key": gkey, "data-surface": w.surfaceId });
    if (ctx.animate === "diff" && isNew) g.classList.add("enter");

    if (w.literal) {
      const shown = w.word.literal.replace(/ /g, "␣");
      g.classList.add("literal");
      g.setAttribute("aria-label", T.literalLabel(wordNo, w.word.literal));
      g.append(band("msg", 0, h("span.wtile.lit-tile", { title: T.literalTitle },
        h("bdi.lit-text", { lang: srcTag }, shown), h("span.lit-cap", T.literalCaption))));
      segEl(w.si, w.seg).words.append(g);
      view.wordEls.set(`${w.si}-${w.wi}`, g);
      continue;
    }

    const chain = w.word.chain;
    g.setAttribute("aria-label", T.wordLabel(wordNo, w.word.source, chain));
    g.append(band("msg", bandIndex.get("msg"), h("span.wtile.src", { lang: srcTag }, w.word.source)));
    // hops: pill on a dashed edge, then the dictionary word with its sense chip
    const hops = w.seg.hops || [];
    for (let i = 0; i < S.nHops; i++) {
      const c = chain[i];
      if (!c) {
        // no dictionary step for this word: a plain connector through the empty bands
        g.append(band(`hop${i}`, bandIndex.get(`hop${i}`), edgeSvg("pass", svgLine("50%", "0", "50%", "100%", "edge br"))),
          band(`dict${i}`, bandIndex.get(`dict${i}`), edgeSvg("pass", svgLine("50%", "0", "50%", "100%", "edge br"))));
        continue;
      }
      const [from, to] = (hops[i] || "").split(">");
      g.append(band(`hop${i}`, bandIndex.get(`hop${i}`),
        edgeSvg("hopline", svgLine("50%", "0", "50%", "100%", "edge hop")),
        h("span.pill", `${from} → ${to}`)));
      const chip = h("button.sense", { type: "button", tabindex: "-1", "aria-haspopup": "dialog", "data-hop": String(i) },
        c.lang === "en" ? T.pivotWord(c.index, c.count) : T.sense(c.index, c.count));
      chip.addEventListener("click", () => ctx.onOpenSense && ctx.onOpenSense(view, w, i, chip));
      view.stops.push(chip);
      g.append(band(`dict${i}`, bandIndex.get(`dict${i}`),
        h("span.wtile.dict", { lang: LANG_TAGS[c.lang] || "en" }, c.word), chip));
    }

    const unitList = h("ol.units", { role: "list" }, edgeSvg("tick", svgLine("50%", "0", "50%", "100%", "edge br")));
    w.units.forEach((u, idx) => {
      if (rendered >= limit) { truncated = true; return; }
      rendered++;
      unitList.append(renderUnit(u, idx === 0, idx === w.units.length - 1));
    });
    g.append(unitList);
    segEl(w.si, w.seg).words.append(g);
    view.wordEls.set(`${w.si}-${w.wi}`, g);
  }

  function renderUnit(u, first, last) {
    const { unit, seg } = u;
    const { bandIndex, hasHomophone, hasLetters } = segInfo[u.si];
    const layout = seg.layout;
    const legend = ctx.legends.legends(layout, unit.keys);
    const tag = LANG_TAGS[seg.language];
    const li = h("li.unit", { "data-path": pathKey(u.path), "data-kind": u.kind, class: `unit k-${u.kind}${first ? " first" : ""}${last ? " last" : ""}` });
    li.append(band("bracket", bandIndex.get("bracket"),
      edgeSvg("br", svgLine(first ? "50%" : "0", "50%", last ? "50%" : "100%", "50%", "edge br"), svgLine("50%", "50%", "50%", "100%", "edge br"))));
    const keysText = cps(unit.keys).join(" ");
    let stop;
    if (u.kind === "homophone") {
      const pinyin = seg.language === "zh" && seg.layout !== "ko_dubeolsik" ? ctx.layouts.numberedPinyin(unit.reading) : null;
      const ghosts = unit.head.filter(c => c !== unit.out).slice(0, 3);
      const rank = rankText(u);
      const soundTag = seg.layout === "ko_dubeolsik" ? "ko" : seg.language === "ja" ? "ja" : "zh-Hant";
      const label = unit.count > 1 && unit.index !== null
        ? `${unit.out}, candidate ${unit.index + 1} of ${unit.count}, sound ${unit.reading}${pinyin ? ` ${pinyin}` : ""}, keys ${keysText}`
        : `${unit.out}, ${rank}, sound ${unit.reading}${pinyin ? ` ${pinyin}` : ""}, keys ${keysText}`;
      li.setAttribute("aria-label", label);
      const wide = cps(unit.out).length > 1;
      const stack = h("button.stack", { type: "button", tabindex: "-1", "aria-haspopup": "dialog", "aria-label": label, class: `stack${wide ? " wide" : ""}${unit.count <= 1 ? " single" : ""}` },
        unit.count > 1 ? ghosts.map((c, i) => h(`span.ghost.g${i + 1}`, { lang: tag, "aria-hidden": "true" }, c)) : null,
        h("span.tile", { lang: tag }, h("span.glyph", unit.out)),
        unit.count > 1 ? h("span.count", { "aria-hidden": "true" }, String(unit.count)) : null);
      stack.addEventListener("click", () => ctx.onOpenUnit && ctx.onOpenUnit(view, u, stack));
      stop = stack;
      li.append(
        band("char", bandIndex.get("char"), stack, h("span.rank", { "aria-hidden": "true" }, rank)),
        band("choice", bandIndex.get("choice"), edgeSvg("choice", svgLine("50%", "0", "50%", "100%", "edge ch"))),
        band("sound", bandIndex.get("sound"), h("span.sound", { lang: soundTag }, unit.reading), pinyin ? h("span.py", { lang: "en" }, pinyin) : null),
        band("keyedge", bandIndex.get("keyedge"), fan(legend.length)),
        band("keys", bandIndex.get("keys"), keycaps(legend, layout)));
    } else if (u.kind === "syllable") {
      li.setAttribute("aria-label", `${unit.out}, keys ${keysText}`);
      if (hasHomophone) li.append(h("div.band.b-upper-rest", { style: { "--bi": String(bandIndex.get("char")) } }));
      li.append(
        band("letters", bandIndex.get(hasHomophone ? "sound" : "letters"), h("span.syl", { lang: "ko" }, unit.out)),
        band("keyedge", bandIndex.get("keyedge"), fan(legend.length)),
        band("keys", bandIndex.get("keys"), keycaps(legend, layout)));
      stop = li;
    } else if (u.kind === "letters") {
      li.setAttribute("aria-label", `${unit.out}, keys ${keysText}`);
      if (hasHomophone) li.append(h("div.band.b-upper-rest", { style: { "--bi": String(bandIndex.get("char")) } }));
      // one pair per letter: the letter over its key(s), wrapping together
      const letters = cps(unit.out);
      const pairs = h("div.pairs", { style: { "--bi": String(bandIndex.get(hasHomophone ? "sound" : "letters")) } });
      let k = 0;
      for (const letter of letters) {
        const n = layout === "es_accent" && k + 1 < legend.length && /[0-9]/.test(legend[k + 1].key) ? 2 : 1;
        const caps = legend.slice(k, k + n);
        k += n;
        // a cell over two keys (an accent digit) gets one edge to each
        const edges = Array.from({ length: n }, (_, j) => svgLine("50%", "0", `${((j + 0.5) / n) * 100}%`, "100%", "edge key"));
        pairs.append(h("span.pair", { style: { "--n": String(n) } },
          h("span.lcell", { lang: tag }, letter),
          edgeSvg("straight", ...edges),
          keycaps(caps, layout)));
      }
      li.append(pairs);
      stop = li;
    } else {
      li.setAttribute("aria-label", `${unit.out}, keys ${keysText}`);
      if (hasHomophone || hasLetters) li.append(h("div.band.b-upper-all"));
      li.append(band("keys", bandIndex.get("keys"), keycaps(legend, layout)));
      stop = li;
    }
    if (stop === li) li.tabIndex = -1;
    view.stops.push(stop);
    view.unitEls.set(pathKey(u.path), { li, u, stop });
    const enter = () => ctx.onFocusUnit && ctx.onFocusUnit(u);
    const leave = () => ctx.onFocusUnit && ctx.onFocusUnit(null);
    li.addEventListener("mouseenter", enter);
    li.addEventListener("mouseleave", leave);
    stop.addEventListener("focus", enter);
    stop.addEventListener("blur", leave);
    return li;
  }

  const body = h("div.walk-body", gutter, list);
  figure.append(legendRow, body);
  if (truncated) {
    const more = h("button.btn.more", { type: "button" }, T.showAll(m.units.length));
    more.addEventListener("click", () => {
      const r = renderWalk(host, trace, { ...ctx, limit: Infinity, animate: "none" });
      ctx.onReplace && ctx.onReplace(r);
      const s = r.stops[Math.min(r.stops.length - 1, view.stops.length)];
      if (s) s.focus();
    });
    figure.append(more);
  }
  root.append(figure);

  // roving focus: one tab stop, arrows move
  if (view.stops.length) view.stops[0].tabIndex = 0;
  list.addEventListener("keydown", ev => {
    const i = view.stops.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") j = Math.min(view.stops.length - 1, i + 1);
    else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") j = Math.max(0, i - 1);
    else if (ev.key === "Home") j = 0;
    else if (ev.key === "End") j = view.stops.length - 1;
    if (j === null) return;
    ev.preventDefault();
    view.stops[i].tabIndex = -1;
    view.stops[j].tabIndex = 0;
    view.stops[j].focus();
  });
  list.addEventListener("focusin", ev => {
    const i = view.stops.indexOf(ev.target);
    if (i < 0) return;
    for (const s of view.stops) s.tabIndex = -1;
    ev.target.tabIndex = 0;
  });

  host.replaceChildren(root);
  view.root = root;
  view.figure = figure;

  // entry animation
  const motion = !reducedMotion();
  if (motion && ctx.animate === "build") {
    root.classList.add("building");
    later(() => root.classList.remove("building"), bands.length * 120 + 520);
  } else if (motion && ctx.animate === "diff") {
    later(() => root.querySelectorAll(".wg.enter").forEach(g => g.classList.remove("enter")), bands.length * 60 + 520);
  } else {
    root.querySelectorAll(".wg.enter").forEach(g => g.classList.remove("enter"));
  }

  // ---------------------------------------------------------- view API
  view.highlight = path => {
    root.querySelectorAll(".unit.hl").forEach(el => el.classList.remove("hl"));
    if (path) { const r = view.unitEls.get(pathKey(path)); if (r) r.li.classList.add("hl"); }
  };
  view.focusUnit = path => { const r = view.unitEls.get(pathKey(path)); if (r) r.stop.focus(); };
  view.stopFor = path => { const r = view.unitEls.get(pathKey(path)); return r ? r.stop : null; };

  /** Show a what-if candidate in one unit's tile (dashed) until cleared. */
  view.setOverride = (path, char, index, count) => {
    view.clearOverride();
    const r = view.unitEls.get(pathKey(path));
    if (!r) return;
    const tile = r.li.querySelector(".tile .glyph"), rank = r.li.querySelector(".rank");
    view.override = { r, glyph: tile.textContent, rank: rank.textContent };
    tile.textContent = char;
    rank.textContent = T.rank(index, count);
    r.li.classList.add("whatif");
  };
  view.clearOverride = () => {
    if (!view.override) return;
    const { r, glyph, rank } = view.override;
    r.li.querySelector(".tile .glyph").textContent = glyph;
    r.li.querySelector(".rank").textContent = rank;
    r.li.classList.remove("whatif");
    view.override = null;
  };

  /** Light the walk bottom-up (keys -> message), unit by unit. Resolves when done. */
  view.walkBack = () => new Promise(resolve => {
    root.querySelectorAll(".lit").forEach(el => el.classList.remove("lit"));
    const seq = [];
    for (const w of m.words) {
      const g = view.wordEls.get(`${w.si}-${w.wi}`);
      if (!g) continue;
      for (const u of w.units) { const r = view.unitEls.get(pathKey(u.path)); if (r) seq.push(r.li); }
      seq.push(g);
    }
    root.classList.add("walking");
    if (!motion || reducedMotion()) {
      for (const el of seq) el.classList.add("lit");
      resolve();
      return;
    }
    seq.forEach((el, i) => later(() => el.classList.add("lit"), i * 140));
    later(resolve, seq.length * 140 + 360);
  });
  view.unlight = () => { root.classList.remove("walking"); root.querySelectorAll(".lit").forEach(el => el.classList.remove("lit")); };

  /** Step a cursor through the keycaps (90 ms per key). cb(unitIndex, charIndexInCipher). */
  view.replay = onKey => new Promise(resolve => {
    const caps = [];
    for (const u of m.units) {
      const r = view.unitEls.get(pathKey(u.path));
      if (!r) continue;
      r.li.querySelectorAll("kbd").forEach((kbd, j) => caps.push({ kbd, at: u.unit.at + j, key: cps(u.unit.keys)[j] }));
    }
    caps.forEach((c, i) => later(() => {
      c.kbd.classList.add("press");
      onKey && onKey(c);
      later(() => c.kbd.classList.remove("press"), 80);
    }, i * 90));
    later(resolve, caps.length * 90 + 120);
  });

  view.destroy = () => { timers.forEach(clearTimeout); };
  return view;
}

// ------------------------------------------------------------ table view

export function renderTable(host, trace, ctx) {
  const m = modelOf(trace, ctx.registry);
  const srcTag = LANG_TAGS[trace.source] || "en";
  const table = h("table.walk-table",
    h("caption.vh", T.figCaption(ctx.message ?? trace.text, trace.ciphertext, ctx.surfaceName ?? "",
      m.words.filter(w => !w.literal).length, m.units.length, cps(trace.ciphertext).length)),
    h("thead", h("tr", T.tableHead.map(t => h("th", { scope: "col" }, t)))));
  const tbody = h("tbody");
  let n = 0;
  for (const w of m.words) {
    if (w.literal) {
      n++;
      tbody.append(h("tr.lit-row", h("td", String(n)), h("td", { colspan: "5" }, T.tableLiteral[0], h("bdi", w.word.literal), T.tableLiteral[1])));
      continue;
    }
    w.units.forEach((u, i) => {
      n++;
      const tr = h("tr", h("td", String(n)));
      if (i === 0) {
        const span = String(w.units.length);
        tr.append(h("td", { rowspan: span, lang: srcTag }, w.word.source),
          h("td", { rowspan: span }, w.word.chain.length
            ? w.word.chain.map((c, k) => [k ? " → " : "", h("span", { lang: LANG_TAGS[c.lang] }, c.word),
              ` (${c.lang === "en" ? T.pivotWord(c.index, c.count) : T.sense(c.index, c.count)})`])
            : "—"));
      }
      const tag = LANG_TAGS[u.seg.language];
      const pinyin = u.kind === "homophone" && u.seg.language === "zh" && u.seg.layout !== "ko_dubeolsik" ? ctx.layouts.numberedPinyin(u.unit.reading) : null;
      tr.append(
        h("td", u.kind === "homophone" ? [h("span", { lang: tag }, u.unit.out), " ", rankText(u)] : h("span", { lang: tag }, u.unit.out)),
        h("td", u.kind === "homophone" ? [h("span", { lang: u.seg.layout === "ko_dubeolsik" ? "ko" : tag }, u.unit.reading), pinyin ? ` ${pinyin}` : ""] : "—"),
        h("td.mono", { lang: "en", translate: "no" }, u.unit.keys));
      tbody.append(tr);
    });
  }
  table.append(tbody);
  host.replaceChildren(h("div.table-wrap", table));
}

// ------------------------------------------------------------ ciphertext

/** The ciphertext as one span per unit (segment-coloured underline). */
export function renderCipher(el, trace, registry) {
  const m = modelOf(trace, registry);
  const text = trace.ciphertext;
  const spans = [];
  let pos = 0;
  el.replaceChildren();
  el.setAttribute("lang", "en");
  el.setAttribute("translate", "no");
  for (const u of m.units) {
    if (u.unit.at > pos) el.append(text.slice(pos, u.unit.at));
    const s = h("span.cu", { "data-path": u.path.join("-"), "data-surface": u.seg.surface, class: `cu${u.n % 2 ? " odd" : ""}` },
      cps(u.unit.keys).map(c => h("span.cc", c)));
    el.append(s);
    spans.push(s);
    pos = u.unit.at + u.unit.keys.length;
  }
  if (pos < text.length) el.append(text.slice(pos));
  el.classList.toggle("multi", m.multi);
  return spans;
}

// ------------------------------------------------------------ stats

/** {k, choices, leak:[n,m], factors} for a trace and its key. */
export function statsOf(trace, key) {
  let choices = 0;
  for (const seg of key.segments || []) {
    for (const word of seg.words || []) {
      if (word.translation && word.translation.tier === 1) choices++;
      if (Array.isArray(word.translations)) choices += word.translations.filter(r => r && r.tier === 1).length;
      for (const unit of word.units || []) if (Object.prototype.hasOwnProperty.call(unit, "homophone_index")) choices++;
    }
  }
  const factors = [];
  for (const seg of trace.segments)
    for (const word of seg.words)
      for (const unit of word.units || []) if (unit.index !== null && unit.count > 1) factors.push(unit.count);
  return { k: cps(trace.ciphertext).length, choices, leak: trace.leak, factors };
}

/** "18 × 46 × 34 = 28,152", or "about 10^x" (as [text, sup]) for big products. */
export function keyspaceFormula(factors) {
  const fmt = new Intl.NumberFormat("en");
  if (!factors.length) return null;
  let product = 1n;
  for (const f of factors) product *= BigInt(f);
  if (factors.length <= 6 && product < 10n ** 15n) {
    if (factors.length === 1) return { text: fmt.format(product) };
    return { text: `${factors.map(f => fmt.format(f)).join(" × ")} = ${fmt.format(product)}` };
  }
  const x = factors.reduce((s, f) => s + Math.log10(f), 0);
  return { text: "about 10", sup: x.toFixed(1) };
}
