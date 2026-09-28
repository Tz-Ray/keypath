// The workbench section (docs/10 §9.7): the visitor names a keyboard (none is
// picked for them, and there is no "any"), then looks up keys split into
// units with spaces, or types a guess to see its keys.  The answers are the
// engine's text, shown as it is, each surface's part tagged with its
// language; the page adds only its own messages around it.
import { $, $$, h } from "./dom.js";
import { T, LANG_TAGS } from "./text.js";

/** A character for a message: quoted with its code point ("U+00E9") when visible, else the code point alone. */
function shownKey(codePoint) {
  const ch = String.fromCodePoint(parseInt(codePoint.slice(2), 16));
  return /^[\p{L}\p{M}\p{N}\p{P}\p{S}]$/u.test(ch) ? `“${ch}” (${codePoint})` : codePoint;
}

export function initWorkbench({ root, engine }) {
  const radios = $$("input[name=wbkbd]", root);
  const tools = {
    look: { form: $("#wb-look", root), input: $("#wb-keys", root), status: $("#wb-look-status", root), out: $("#wb-look-out", root), seq: 0 },
    type: { form: $("#wb-type", root), input: $("#wb-text", root), status: $("#wb-type-status", root), out: $("#wb-type-out", root), seq: 0 },
  };
  const top = $("#wb-top", root);
  const checked = () => radios.find(r => r.checked) || null;
  const keyboardName = radio => radio.closest(".chip").querySelector(".t").textContent;

  function say(tool, message, refused) {
    tool.status.textContent = message;
    tool.status.classList.toggle("warn", refused);
    if (refused) {
      tool.out.hidden = true;
      tool.out.replaceChildren();
    }
  }

  /** The engine's text, one span per part (lang-tagged), joined by `sep`. */
  function show(tool, parts, sep) {
    tool.out.replaceChildren(...parts.flatMap((p, i) => [i ? sep : null, h("span", { lang: LANG_TAGS[p.language] }, p.text)]).filter(Boolean));
    tool.out.hidden = false;
  }

  function refusal(r) {
    if (r.reason === "badChunk") return T.wbBadKey(shownKey(r.codePoint));
    if (r.reason === "newerUnicode") return T.newerUnicode(r.codePoint);
    if (r.reason === "loadFailed") return T.loadFailed;
    return T.wbPick;
  }

  async function look() {
    const tool = tools.look, seq = ++tool.seq;
    const radio = checked();
    if (!radio) return say(tool, T.wbPick, true);
    const text = tool.input.value;
    const chunks = text.split(" ").filter(Boolean);
    if (!chunks.length) return say(tool, T.wbNoKeys, true);
    const r = await engine.lookup({ layout: radio.value, chunks, top: Number(top.value) });
    if (seq !== tool.seq) return;
    if (!r.ok) return say(tool, refusal(r), true);
    show(tool, r.blocks, "\n\n");
    say(tool, T.wbLooked(chunks.length, keyboardName(radio), r.wellFormed), false);
  }

  async function type() {
    const tool = tools.type, seq = ++tool.seq;
    const radio = checked();
    if (!radio) return say(tool, T.wbPick, true);
    const text = tool.input.value;
    if (!text) return say(tool, T.wbNoText, true);
    const r = await engine.type({ layout: radio.value, text });
    if (seq !== tool.seq) return;
    if (!r.ok) return say(tool, refusal(r), true);
    show(tool, r.sections, "\n");
    say(tool, T.wbTyped(keyboardName(radio)), false);
  }

  tools.look.run = look;
  tools.type.run = type;
  for (const tool of Object.values(tools)) {
    tool.form.addEventListener("submit", event => {
      event.preventDefault();
      tool.asked = true;
      tool.run();
    });
  }
  top.addEventListener("change", () => { if (tools.look.asked) look(); });
  // a new keyboard answers again whatever was asked before
  for (const radio of radios) {
    radio.addEventListener("change", () => {
      for (const tool of Object.values(tools)) if (tool.asked) tool.run();
    });
  }
  return { look, type };
}
