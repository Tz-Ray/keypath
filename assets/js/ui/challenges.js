// The six challenge cards: copy, answer check (hashes only), and a
// confirmed "Reveal the walk" that decodes the published key.
import { h, $, copyText, toast, storage } from "./dom.js";
import { T, LANG_TAGS } from "./text.js";
import { checkAnswer } from "../engine/hash.js";
import { mountFigure } from "./figure.js";
import { renderKeyText } from "./keypanel.js";

const SOLVE_PATH = n => `https://github.com/Tz-Ray/cipher-project/blob/v2.0/puzzles/challenge-0${n}/solve-path.md`;
const TITLE_LANG = { 2: "es" };

/** Wrap Cyrillic runs in <span lang="ru"> so screen readers switch voice. */
function withLang(text) {
  const parts = text.split(/([Ѐ-ӿ][Ѐ-ӿ\s,.\-…]*[Ѐ-ӿ.])/u);
  return parts.map((p, i) => (i % 2 ? h("span", { lang: "ru" }, p) : p));
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
      h("div.chal-top", h("span.chal-n", `#${c.n}`), h("span", { class: `diff d${c.n}` }, c.difficulty), badge),
      h("h3", { lang: TITLE_LANG[c.n] || null }, c.title),
      h("p.blurb", withLang(c.blurb)),
      c.keyboards ? h("p.kbds", c.keyboards) : null);
    const copyBtn = h("button.btn.small", { type: "button", "aria-label": `Copy ciphertext of challenge ${c.n}` }, T.copy);
    copyBtn.addEventListener("click", async () => { if (await copyText(c.ciphertext)) toast(T.copied); });
    art.append(h("div.chal-cipher", h("code", { lang: "en", translate: "no" }, c.ciphertext), copyBtn), form);

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

  async function reveal(c, art, out) {
    let data, r;
    try {
      const e = await getEngine();
      data = await e._internal.data.json(`data/challenges/${String(c.n).padStart(2, "0")}.json`);
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
