// Share links, carried entirely in the URL fragment (never sent anywhere):
//   #try=<base64url JSON {t, l, s}>          fills the playground
//   #puzzle=<base64url JSON {c, h, f, k?}>    a ciphertext + answer fingerprints
import { h, $, copyText, toast } from "./dom.js";
import { T } from "./text.js";
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
  return { puzzle: { c: v.c, h: v.h, f: v.f, k: surfaceIds.includes(v.k) ? v.k : null } };
}

export function initShare({ playground }) {
  $("#copy-link").addEventListener("click", async () => {
    const s = playground.state;
    const link = `${base()}#try=${toB64url({ t: s.text, l: s.lang, s: s.surface })}`;
    if (await copyText(link)) toast(T.linkCopied);
  });

  const dialog = $("#puzzle-dialog");
  const hint = $("#puzzle-hint");
  $("#make-puzzle").addEventListener("click", () => {
    if (!playground.state.result) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });
  $("#puzzle-close").addEventListener("click", () => dialog.close());
  $("#puzzle-copy").addEventListener("click", async () => {
    const s = playground.state;
    if (!s.result) return;
    const text = s.result.text;
    const payload = { c: s.result.ciphertext, h: await sha256Hex(answerNorm(text)), f: await sha256Hex(answerFold(text)) };
    if (hint.checked) payload.k = s.surface;
    const link = `${base()}#puzzle=${toB64url(payload)}`;
    if (await copyText(link)) toast(T.linkCopied);
    dialog.close();
  });
}

/** The banner above the hero heading for a #puzzle= link. */
export function showPuzzleBanner(slot, puzzle, surfaceName) {
  const input = h("input#puzzle-answer", { type: "text", autocomplete: "off", spellcheck: "false", autocapitalize: "off" });
  const verdict = h("p.verdict", { role: "status" });
  const form = h("form.answer",
    h("label", { for: "puzzle-answer" }, T.yourAnswer),
    h("div.answer-row", input, h("button.btn.primary", { type: "submit" }, T.check)),
    verdict,
    h("p.small.muted", "Answers ignore spaces, punctuation and capitals."));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!input.value.trim()) return;
    const v = await checkAnswer(input.value, { hash: puzzle.h, fold: puzzle.f });
    verdict.textContent = v === "solved" ? T.solved : v === "folded" ? T.solvedFolded : T.notQuite;
    verdict.className = `verdict ${v}`;
  });
  const close = h("button.pop-close", { type: "button", "aria-label": "Close puzzle" }, h("span", { "aria-hidden": "true" }, "×"));
  const card = h("section.card.puzzle-banner", { "aria-labelledby": "puzzle-h" },
    close,
    h("h2#puzzle-h", "A puzzle for you"),
    h("p.cipher.big", { lang: "en", translate: "no" }, puzzle.c),
    puzzle.k ? h("p.muted", T.hint(surfaceName(puzzle.k))) : null,
    form);
  close.addEventListener("click", () => {
    card.remove();
    history.replaceState(null, "", base());
  });
  slot.replaceChildren(card);
  return card;
}
