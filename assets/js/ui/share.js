// Share links, carried entirely in the URL fragment (never sent anywhere):
//   #try=<base64url JSON {t, l, s}>          fills the playground
//   #puzzle=<base64url JSON {c, h, f, k?, l?, t?, u?}>
//       a ciphertext + answer fingerprints; k names the keyboard (a hint);
//       when the message went through a dictionary, l is its language and
//       t/u fingerprint what the keys spell, which is accepted too
//   #walk=<base64url JSON {c, k} or {c, j}>  (docs/10 §9.7)
//       a ciphertext and its key, as a kp1 string (k) or compact key JSON
//       (j): the page walks it back, exactly as "Walk one back" does
// Strings taken from a fragment reach the page only as text (textContent,
// text nodes, form values), never as markup.
import { h, $, $$, copyText, toast } from "./dom.js";
import { T, LANG_NAMES } from "./text.js";
import { answerNorm, answerFold, sha256Hex, checkAnswer } from "../engine/hash.js";

/** The longest fragment body any link carries: one constant for the parser and the link controls. */
export const FRAGMENT_MAX = 8000;
const BODY = new RegExp(`^[A-Za-z0-9_-]{1,${FRAGMENT_MAX}}$`);
/** The longest #try message: the message box's own limit (index.html's maxlength). */
export const MESSAGE_MAX = 200;
/** A #walk ciphertext: 1 to 6,000 printable ASCII characters, no space. */
const WALK_CIPHER = /^[\x21-\x7e]{1,6000}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function toB64url(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s) {
  if (!BODY.test(s)) return null;
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

/** The kind of share link a fragment names ("try", "puzzle", "walk"), readable or not; else null. */
export function linkKind(hash) {
  const m = /^#(try|puzzle|walk)=/.exec(hash || "");
  return m ? m[1] : null;
}

/** Parse the current fragment -> {try} | {puzzle} | {walk} | null (malformed: null). */
export function parseFragment(hash, surfaceIds) {
  const m = /^#(try|puzzle|walk)=(.+)$/.exec(hash || "");
  if (!m) return null;
  const v = fromB64url(m[2]);
  if (!v) return null;
  if (m[1] === "walk") {
    // exactly {c, k} or {c, j}, with string values; anything else is malformed
    const names = Object.keys(v);
    if (names.length !== 2 || typeof v.c !== "string" || !WALK_CIPHER.test(v.c)) return null;
    if (own(v, "k") && typeof v.k === "string") return { walk: { c: v.c, k: v.k } };
    if (own(v, "j") && typeof v.j === "string") return { walk: { c: v.c, j: v.j } };
    return null;
  }
  if (m[1] === "try") {
    if (typeof v.t !== "string" || v.t.length > MESSAGE_MAX) return null;
    return { try: { t: v.t, l: typeof v.l === "string" ? v.l : null, s: surfaceIds.includes(v.s) ? v.s : null } };
  }
  if (typeof v.c !== "string" || !/^[\x21-\x7e]{1,2000}$/.test(v.c) || !HEX.test(v.h) || !HEX.test(v.f)) return null;
  const alt = isLang(v.l) && HEX.test(v.t) && HEX.test(v.u);
  return { puzzle: { c: v.c, h: v.h, f: v.f, k: surfaceIds.includes(v.k) ? v.k : null,
    l: alt ? v.l : null, t: alt ? v.t : null, u: alt ? v.u : null } };
}

/**
 * The #walk body for a ciphertext and its key, given as {k: kp1 text} or
 * {j: compact key JSON}: {ok: true, body} or {ok: false, reason} with reason
 * "empty" (nothing to type, so no walk) or "tooLong" (the body would pass
 * FRAGMENT_MAX).  A body is never truncated.
 */
export function walkBody(ciphertext, key) {
  if (!ciphertext) return { ok: false, reason: "empty" };
  const body = toB64url({ c: ciphertext, ...key });
  if (ciphertext.length > 6000 || body.length > FRAGMENT_MAX) return { ok: false, reason: "tooLong", length: body.length };
  if (!WALK_CIPHER.test(ciphertext)) return { ok: false, reason: "notAscii" };
  return { ok: true, body, length: body.length };
}

/** The walk link body of an encode result: the key as kp1 (compact key JSON if it has no kp1 form). */
export function walkLinkOf(result, engine) {
  if (!result) return { ok: false, reason: "none" };
  const packed = engine.kp1Pack(result.key);
  return walkBody(result.ciphertext, packed.ok ? { k: packed.text } : { j: JSON.stringify(result.key) });
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

export function initShare({ playground, getEngine, engine }) {
  // the walk link: enabled only when the walk fits a link; otherwise the
  // control is disabled and says why
  const walkBtn = $("#copy-walk");
  const walkNote = $("#walk-link-note");
  const updateWalk = result => {
    const r = walkLinkOf(result, engine);
    walkBtn.disabled = !r.ok;
    const why = r.reason === "empty" ? T.walkEmpty : r.reason === "tooLong" ? T.walkTooLong : "";
    walkNote.hidden = !why;
    walkNote.textContent = why;
  };
  playground.onResult(updateWalk);
  updateWalk(playground.state.result);
  walkBtn.addEventListener("click", async () => {
    const r = walkLinkOf(playground.state.result, engine);
    if (r.ok && await copyText(`${base()}#walk=${r.body}`)) toast(T.walkLinkCopied);
  });

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
