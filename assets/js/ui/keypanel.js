// The key panel: the exact `keypath encode --out` text, with a span per unit
// object and translation record so the figure and the key highlight each
// other; Copy and Download.
import { h, copyText, toast } from "./dom.js";
import { T } from "./text.js";

/**
 * Fill `pre` with keyText, wrapping each span {kind, path, start, end}.
 * Returns Map(pathKey -> element) for units and "t:" + pathKey for translations.
 */
export function renderKeyText(pre, keyText, spans) {
  const map = new Map();
  pre.replaceChildren();
  let pos = 0;
  for (const s of spans || []) {
    if (s.start < pos) continue; // nested (never at key 1.x) - keep the outer one
    if (s.start > pos) pre.append(keyText.slice(pos, s.start));
    const el = h("span.ks", { "data-kind": s.kind }, keyText.slice(s.start, s.end));
    map.set((s.kind === "translation" ? "t:" : "") + s.path.join("-"), el);
    pre.append(el);
    pos = s.end;
  }
  if (pos < keyText.length) pre.append(keyText.slice(pos));
  return map;
}

export function bindKeyButtons(copyBtn, downloadBtn, getText) {
  copyBtn.addEventListener("click", async () => {
    if (await copyText(getText())) toast(T.copied);
  });
  downloadBtn.addEventListener("click", () => {
    const blob = new Blob([getText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: "key.json" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
