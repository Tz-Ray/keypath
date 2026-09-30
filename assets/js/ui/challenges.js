// The challenge cards: copy, answer check (hashes only), the hints of
// challenges 7-12 (each fetched only when the visitor asks for it), and a
// confirmed "Reveal the walk" that decodes the published key.
import { h, $, copyText, toast, storage, announce } from "./dom.js";
import { T, LANG_TAGS } from "./text.js";
import { checkAnswer } from "../engine/hash.js";
import { mountFigure } from "./figure.js";
import { renderKeyText } from "./keypanel.js";

const pad = n => String(n).padStart(2, "0");
const SOLVE_PATH = n => `https://github.com/Tz-Ray/keypath/blob/main/puzzles/challenge-${pad(n)}/solve-path.md`;
const HINT_FILE = (n, k) => `data/challenges/hints/${pad(n)}-${k}.json`;
const TITLE_LANG = { 2: "es" };
// the difficulty label's colour (warm-up plain)
const LEVEL = { Easy: "lv-easy", Medium: "lv-medium", Hard: "lv-hard", Expert: "lv-expert", Meta: "lv-meta" };

// Runs of another script, wrapped in <span lang> so screen readers switch
// voice: Cyrillic (with the punctuation inside a phrase), Han and Bopomofo
// with its tone marks, kana, Greek.
const RUNS = [
  [/[Ѐ-ӿ][Ѐ-ӿ\s,.\-…]*[Ѐ-ӿ.]/u, "ru"],
  [/[\p{Script=Han}\p{Script=Bopomofo}ˇˊˋ˙]+/u, "zh-Hant"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]+/u, "ja"],
  [/\p{Script=Greek}+/u, "el"],
];
function withLang(text) {
  const all = new RegExp(RUNS.map(([re]) => `(${re.source})`).join("|"), "gu");
  const out = [];
  let at = 0;
  for (const m of text.matchAll(all)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(h("span", { lang: RUNS[m.slice(1).findIndex(g => g !== undefined)][1] }, m[0]));
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

function solvedSet() {
  try { return new Set(JSON.parse(storage.get("kp-solved") || "[]")); } catch { return new Set(); }
}
function markSolved(n) {
  const s = solvedSet();
  s.add(n);
  storage.set("kp-solved", JSON.stringify([...s]));
}

export async function initChallenges({ host, getEngine, registry, layouts, legends, surfaces }) {
  let index;
  try {
    const e = await getEngine();
    index = await e._internal.data.json("data/challenges/index.json");
  } catch {
    return;
  }
  const solved = solvedSet();
  host.replaceChildren(...index.map(c => card(c, solved.has(c.n))));

  function card(c, isSolved) {
    const id = `ans-${c.n}`;
    const badge = h("span.badge-solved", { hidden: !isSolved }, T.solvedBadge);
    const verdict = h("p.verdict", { role: "status" });
    const input = h("input", { id, type: "text", autocomplete: "off", spellcheck: "false", autocapitalize: "off" });
    const form = h("form.answer",
      h("label", { for: id }, T.yourAnswer),
      h("div.answer-row", input, h("button.btn.primary", { type: "submit" }, T.check)),
      verdict);
    const art = h("article.chal", { id: `challenge-${c.n}`, "data-n": String(c.n) },
      h("div.chal-top", h("span.chal-n", `#${c.n}`), h("span", { class: `diff ${LEVEL[c.difficulty] || ""}`.trim() }, c.difficulty), badge),
      h("h3", { lang: TITLE_LANG[c.n] || null }, c.title),
      h("p.blurb", withLang(c.blurb)),
      c.keyboards ? h("p.kbds", c.keyboards) : null);
    const copyBtn = h("button.btn.small", { type: "button", "aria-label": `Copy ciphertext of challenge ${c.n}` }, T.copy);
    copyBtn.addEventListener("click", async () => { if (await copyText(c.ciphertext)) toast(T.copied); });
    art.append(h("div.chal-cipher", h("code", { lang: "en", translate: "no" }, c.ciphertext), copyBtn));
    if (c.hints) art.append(hints(c));
    art.append(form);

    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const guess = input.value;
      if (!guess.trim()) return;
      const v = await checkAnswer(guess, c);
      verdict.textContent = v === "solved" ? T.solved : v === "folded" ? T.solvedFolded : T.notQuite;
      verdict.className = `verdict ${v}`;
      if (v !== "wrong") { badge.hidden = false; markSolved(c.n); }
    });

    // reveal, behind a confirmation
    const revealBtn = h("button.btn", { type: "button" }, T.revealWalk);
    const yes = h("button.btn.primary", { type: "button" }, T.reveal);
    const no = h("button.btn", { type: "button" }, T.cancel);
    const confirm = h("div.confirm", { hidden: true }, h("p", T.revealConfirm), h("div.btn-row", yes, no));
    const out = h("div.revealed", { hidden: true });
    revealBtn.addEventListener("click", () => {
      confirm.hidden = false;
      revealBtn.hidden = true;
      yes.focus();
    });
    no.addEventListener("click", () => {
      confirm.hidden = true;
      revealBtn.hidden = false;
      revealBtn.focus();
    });
    yes.addEventListener("click", async () => {
      yes.disabled = true;
      await reveal(c, art, out);
      confirm.hidden = true;
      yes.disabled = false;
    });
    art.append(h("div.reveal", revealBtn, confirm), out);
    return art;
  }

  /**
   * The challenge's hints, one per click: nothing of a hint is on the page,
   * or fetched, before the click that asks for it.
   */
  function hints(c) {
    const list = h("ol.hint-list", { hidden: true });
    const btn = h("button.btn.small.hint-btn", { type: "button" }, T.hintNext(1, c.hints));
    const err = h("p.error.hint-error", { role: "status", hidden: true });
    let shown = 0, busy = false;
    btn.addEventListener("click", async () => {
      if (busy || shown >= c.hints) return;
      busy = true;
      btn.setAttribute("aria-busy", "true");
      let text;
      try {
        const e = await getEngine();
        text = await e._internal.data.json(HINT_FILE(c.n, shown + 1));
        if (typeof text !== "string") throw new Error("not a hint");
      } catch {
        busy = false;
        btn.removeAttribute("aria-busy");
        err.textContent = T.hintFailed;
        err.hidden = false;
        return;
      }
      err.hidden = true;
      shown++;
      const item = h("li", { tabindex: "-1" }, h("span.hint-n", T.hintLabel(shown)), " ", withLang(text));
      list.append(item);
      list.hidden = false;
      busy = false;
      btn.removeAttribute("aria-busy");
      if (shown < c.hints) {
        btn.textContent = T.hintNext(shown + 1, c.hints);
        announce(`${T.hintLabel(shown)}: ${text}`);
      } else {
        // the last one: the button goes, and focus moves to the hint
        btn.hidden = true;
        item.focus();
      }
    });
    return h("div.hints", list, btn, err);
  }

  async function reveal(c, art, out) {
    let data, r;
    try {
      const e = await getEngine();
      data = await e._internal.data.json(`data/challenges/${pad(c.n)}.json`);
      r = await e.decode({ ciphertext: data.ciphertext, keyText: data.keyText });
    } catch {
      r = { ok: false };
    }
    out.hidden = false;
    art.classList.add("open");
    if (!r.ok) {
      // the answer stays hidden; offer the same reveal again
      const retry = h("button.btn.small", { type: "button" }, T.retry);
      const msg = h("p.error", { tabindex: "-1" }, T.loadFailed, " ", retry);
      retry.addEventListener("click", () => reveal(c, art, out));
      out.replaceChildren(msg);
      msg.focus();
      return;
    }
    const walk = h("div.chal-walk.walk-slot");
    const whatIf = h("div");
    const pre = h("pre.key-pre");
    renderKeyText(pre, r.keyText, r.spans);
    const names = r.trace.segments.map(s => surfaces.get(s.surface)).filter(Boolean).map(s => s.longName);
    const plain = h("p.plain", { lang: LANG_TAGS[r.key.source_language] || "en", tabindex: "-1" }, r.text);
    out.replaceChildren(
      plain,
      whatIf, walk,
      h("details.key-details", h("summary", T.theKey), pre),
      h("p.solve", h("a", { href: SOLVE_PATH(c.n), rel: "noopener" }, T.solvePath)));
    const fig = mountFigure(walk, r.trace, {
      engine: getEngine, registry, layouts, legends, animate: "none",
      message: r.text, surfaceName: names.join(", then "), whatIfSlot: whatIf,
    });
    art.scrollIntoView({ block: "nearest", behavior: "instant" });
    // focus the answer, so keyboard and screen-reader users land on it
    plain.focus({ preventScroll: true });
    if (fig.view) fig.view.walkBack();
  }
}

export const challengeSelector = n => $(`#challenge-${n}`);
