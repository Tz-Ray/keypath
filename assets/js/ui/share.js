// Share links, carried entirely in the URL fragment (never sent anywhere):
//   #try=<base64url JSON {t, l, s}>          fills the playground
//   #puzzle=<base64url JSON {c, h, f, k?, l?, t?, u?}>
//       a ciphertext + answer fingerprints; k names the keyboard (a hint);
//       when the message went through a dictionary, l is its language and
//       t/u fingerprint what the keys spell, which is accepted too
import { h, $, $$, copyText, toast } from "./dom.js";
import { T, LANG_NAMES } from "./text.js";
import { answerNorm, answerFold, sha256Hex, checkAnswer } from "../engine/hash.js";

export function toB64url(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s) {
  if (!/^[A-Za-z0-9_-]{1,8000}$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const base = () => location.href.split("#")[0];
const HEX = /^[0-9a-f]{64}$/;
const isLang = l => typeof l === "string" && Object.prototype.hasOwnProperty.call(LANG_NAMES, l);

/** Parse the current fragment -> {try} | {puzzle} | null (malformed: null). */
export function parseFragment(hash, surfaceIds) {
  const m = /^#(try|puzzle)=(.+)$/.exec(hash || "");
  if (!m) return null;
  const v = fromB64url(m[2]);
  if (!v) return null;
  if (m[1] === "try") {
    if (typeof v.t !== "string" || v.t.length > 400) return null;
    return { try: { t: v.t, l: typeof v.l === "string" ? v.l : null, s: surfaceIds.includes(v.s) ? v.s : null } };
  }
  if (typeof v.c !== "string" || !/^[\x21-\x7e]{1,2000}$/.test(v.c) || !HEX.test(v.h) || !HEX.test(v.f)) return null;
  const alt = isLang(v.l) && HEX.test(v.t) && HEX.test(v.u);
  return { puzzle: { c: v.c, h: v.h, f: v.f, k: surfaceIds.includes(v.k) ? v.k : null,
    l: alt ? v.l : null, t: alt ? v.t : null, u: alt ? v.u : null } };
}

/** Why a result can't become a puzzle (null when it can). */
function puzzleProblem(result) {
  if (!result.ciphertext) return T.puzzleEmpty;
  // the page itself shows the answers of its examples
  const shown = [...$$("#examples button").map(b => b.dataset.text), $('[data-static="strip.text"]')?.textContent || ""];
  const answer = answerNorm(result.text);
  if (shown.some(t => t && answerNorm(t) === answer)) return T.puzzleExample;
  return null;
}

export function initShare({ playground, getEngine }) {
  $("#copy-link").addEventListener("click", async () => {
    const s = playground.state;
    const link = `${base()}#try=${toB64url({ t: s.text, l: s.lang, s: s.surface })}`;
    if (await copyText(link)) toast(T.linkCopied);
  });

  const dialog = $("#puzzle-dialog");
  const hint = $("#puzzle-hint");
  const note = $("#puzzle-note");
  const copy = $("#puzzle-copy");
  $("#make-puzzle").addEventListener("click", () => {
    const r = playground.state.result;
    if (!r) return;
    const problem = puzzleProblem(r);
    note.hidden = !problem;
    note.textContent = problem || "";
    copy.disabled = !!problem;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    if (problem) $("#puzzle-close").focus();
  });
  $("#puzzle-close").addEventListener("click", () => dialog.close());
  copy.addEventListener("click", async () => {
    const s = playground.state;
    if (!s.result || puzzleProblem(s.result)) return;
    const text = s.result.text;
    const payload = { c: s.result.ciphertext, h: await sha256Hex(answerNorm(text)), f: await sha256Hex(answerFold(text)) };
    if (hint.checked) payload.k = s.surface;
    // through a dictionary: what the keys spell counts as an answer too
    const e = await getEngine();
    const spelled = e.unitText(s.result.trace);
    if (answerNorm(spelled) && answerNorm(spelled) !== answerNorm(text)) {
      Object.assign(payload, { l: s.lang, t: await sha256Hex(answerNorm(spelled)), u: await sha256Hex(answerFold(spelled)) });
    }
    const link = `${base()}#puzzle=${toB64url(payload)}`;
    if (await copyText(link)) toast(T.linkCopied);
    dialog.close();
  });
}

/** The banner above the hero heading for a #puzzle= link. */
export function showPuzzleBanner(slot, puzzle, surfaces) {
  const input = h("input#puzzle-answer", { type: "text", autocomplete: "off", spellcheck: "false", autocapitalize: "off" });
  const verdict = h("p.verdict", { role: "status" });
  const form = h("form.answer",
    h("label", { for: "puzzle-answer" }, T.yourAnswer),
    h("div.answer-row", input, h("button.btn.primary", { type: "submit" }, T.check)),
    verdict,
    h("p.small.muted", T.answersIgnore));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!input.value.trim()) return;
    let v = await checkAnswer(input.value, { hash: puzzle.h, fold: puzzle.f });
    if (v === "wrong" && puzzle.t) v = await checkAnswer(input.value, { hash: puzzle.t, fold: puzzle.u });
    verdict.textContent = v === "solved" ? T.solved : v === "folded" ? T.solvedFolded : T.notQuite;
    verdict.className = `verdict ${v}`;
  });
  const close = h("button.pop-close", { type: "button", "aria-label": "Close puzzle" }, h("span", { "aria-hidden": "true" }, "×"));
  const keyboard = puzzle.k ? surfaces.get(puzzle.k) : null;
  const card = h("section.card.puzzle-banner", { "aria-labelledby": "puzzle-h" },
    close,
    h("h2#puzzle-h", "A puzzle for you"),
    h("p.cipher.big", { lang: "en", translate: "no" }, puzzle.c),
    keyboard ? h("p.muted", T.hint(keyboard.longName)) : null,
    puzzle.l ? h("p.muted", T.answerLang(LANG_NAMES[puzzle.l], keyboard ? LANG_NAMES[keyboard.language] : null)) : null,
    form);
  close.addEventListener("click", () => {
    card.remove();
    history.replaceState(null, "", base());
  });
  slot.replaceChildren(card);
  return card;
}
