// The candidate and sense popovers (one reusable panel), and the what-if
// banner.  Desktop: anchored under the invoker; below 600 px: a bottom sheet.
import { h, cps } from "./dom.js";
import { T, LANG_TAGS, LANG_NAMES, DICTIONARY } from "./text.js";

let panel = null, titleEl, bodyEl, invoker = null, onCloseCb = null;

function ensurePanel() {
  if (panel) return;
  titleEl = h("h3.pop-title#pop-title");
  bodyEl = h("div.pop-body");
  const closeBtn = h("button.pop-close", { type: "button", "aria-label": T.close }, h("span", { "aria-hidden": "true" }, "×"));
  closeBtn.addEventListener("click", () => closePopover(true));
  panel = h("div.popover", { role: "dialog", "aria-modal": "false", "aria-labelledby": "pop-title", hidden: true },
    h("div.pop-head", titleEl, closeBtn), bodyEl);
  document.body.append(panel);
  panel.addEventListener("keydown", ev => {
    if (ev.key === "Escape") { ev.preventDefault(); closePopover(true); return; }
    const cells = Array.from(panel.querySelectorAll(".cand"));
    const i = cells.indexOf(document.activeElement);
    if (i < 0) return;
    let cols = 1;
    while (cols < cells.length && cells[cols].offsetTop === cells[0].offsetTop) cols++;
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[ev.key];
    if (ev.key === "Home" || ev.key === "End") { ev.preventDefault(); cells[ev.key === "Home" ? 0 : cells.length - 1].focus(); return; }
    if (!move) return;
    ev.preventDefault();
    const j = Math.max(0, Math.min(cells.length - 1, i + move));
    cells[j].focus();
  });
  document.addEventListener("pointerdown", ev => {
    if (!panel.hidden && !panel.contains(ev.target) && !(invoker && invoker.contains(ev.target))) closePopover(false);
  });
  window.addEventListener("resize", () => { if (!panel.hidden) place(); });
}

function place() {
  if (!invoker) return;
  const narrow = window.innerWidth < 600;
  panel.classList.toggle("sheet", narrow);
  if (narrow) { panel.style.left = ""; panel.style.top = ""; return; }
  const r = invoker.getBoundingClientRect();
  const w = Math.min(panel.offsetWidth || 380, window.innerWidth - 32);
  let left = r.left + window.scrollX + r.width / 2 - w / 2;
  left = Math.max(window.scrollX + 16, Math.min(left, window.scrollX + window.innerWidth - w - 16));
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(r.bottom + window.scrollY + 8)}px`;
}

export function closePopover(returnFocus) {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  const inv = invoker;
  invoker = null;
  if (onCloseCb) { const cb = onCloseCb; onCloseCb = null; cb(); }
  if (returnFocus && inv && inv.isConnected) inv.focus();
}

function open(inv, title, content, focusSel) {
  ensurePanel();
  closePopover(false);
  invoker = inv;
  titleEl.replaceChildren(...title);
  bodyEl.replaceChildren(...content);
  panel.hidden = false;
  place();
  const target = panel.querySelector(focusSel) || panel.querySelector("button");
  if (target) target.focus({ preventScroll: true });
  if (!panel.classList.contains("sheet")) {
    const r = panel.getBoundingClientRect();
    if (r.bottom > window.innerHeight) window.scrollBy({ top: r.bottom - window.innerHeight + 16, behavior: "instant" });
  }
}

/**
 * The candidate popover for one unit.
 * list: {count, items, complete}; onPick(index, char) for another candidate.
 */
export function openCandidates({ invoker: inv, unit, seg, list, layouts, current, onPick, onClose }) {
  const tag = LANG_TAGS[seg.language];
  let title, caption;
  if (seg.layout === "ko_dubeolsik") {
    title = [h("span", { lang: "ko" }, unit.reading), T.hanjaTitle(list.count)];
    caption = T.hanjaCaption;
  } else if (seg.language === "ja") {
    title = [h("span", { lang: "ja" }, unit.reading), T.jaTitle(list.count)];
    caption = T.jaCaption;
  } else {
    const py = layouts.numberedPinyin(unit.reading);
    title = [h("span", { lang: "zh-Hant" }, unit.reading), py ? ` · ${py}` : "", T.zhTitle(list.count)];
    caption = T.zhCaption;
  }
  const chosen = current ?? unit.index;
  const grid = h("div.cand-grid", { role: "group", "aria-label": `${list.count} candidates` },
    list.items.map((c, i) => {
      const isKey = i === unit.index;
      const b = h("button.cand", {
        type: "button",
        class: `cand${isKey ? " pick" : ""}${i === chosen && !isKey ? " cur" : ""}${cps(c).length > 1 ? " wide" : ""}`,
        "aria-label": `#${i}: ${c}${isKey ? `, ${T.keysPick}` : ""}`,
        "aria-pressed": i === chosen ? "true" : "false",
      }, h("span.ci", { "aria-hidden": "true" }, String(i)), h("span.cg", { lang: tag, "aria-hidden": "true" }, c));
      b.addEventListener("click", () => {
        onPick(i, c);
        closePopover(true);
      });
      return b;
    }));
  const extra = [];
  if (!list.complete && list.count > list.items.length) extra.push(h("p.pop-more", T.jaMore(list.count - list.items.length)));
  const legend = h("p.pop-legend", h("span.swatch", { "aria-hidden": "true" }), T.keysPick);
  onCloseCb = onClose || null;
  open(inv, title, [grid, ...extra, h("p.pop-caption", caption), legend], ".cand[aria-pressed=true]");
}

/** The sense popover for one hop of a word's chain. */
export function openSense({ invoker: inv, word, hop, hops }) {
  const c = word.chain[hop];
  const source = hop === 0 ? word.source : word.chain[hop - 1].word;
  const [from] = (hops[hop] || "").split(">");
  const title = [h("span", { lang: LANG_TAGS[c.lang] }, c.word)];
  let body;
  if (c.lang === "en") {
    body = [h("p", T.pivotBody(c.word, c.count, LANG_NAMES[from] || from, c.index, source))];
  } else {
    body = [h("p", T.senseBody(c.word, c.count, DICTIONARY[c.lang] || "the dictionary", c.index, source)),
      h("p.pop-caption", T.senseRule(source))];
  }
  onCloseCb = null;
  open(inv, title, body, ".pop-close");
}

/** The what-if banner: "With #k there, the same keys spell …" + Back to the key. */
export function whatIfBanner(parts, k, lang, onBack) {
  const back = h("button.btn.small", { type: "button" }, T.backToKey);
  back.addEventListener("click", onBack);
  return h("div.whatif-banner", { role: "status" },
    h("p", T.whatIf(k), h("span.wi-text", { lang: LANG_TAGS[lang] || "en" },
      parts.map(p => (p.mark ? h("mark", p.text) : p.text))), "."), back);
}
