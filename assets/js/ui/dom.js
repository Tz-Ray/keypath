// Tiny DOM helpers.

/**
 * h("div.card#id", {attrs, on: {click}}, ...children)
 * Attribute values of null/undefined/false are skipped; `true` sets "".
 */
export function h(spec, attrs, ...children) {
  const m = /^([a-z0-9-]+)((?:[.#][\w-]+)*)$/i.exec(spec);
  const tag = m ? m[1] : spec;
  const el = tag === "svg" || tag === "line" || tag === "path" ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === ".") el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === "style" && typeof v === "object") for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
      else if (k === "text") el.textContent = v;
      else if (k === "class") el.setAttribute("class", v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let liveTimer = 0;
/** Polite announcement through the page's live region. */
export function announce(text, delay = 0) {
  const region = document.getElementById("live");
  if (!region) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    region.textContent = "";
    requestAnimationFrame(() => { region.textContent = text; });
  }, delay);
}

let toastTimer = 0;
/** A short confirmation ("Copied.") near the bottom of the screen, also announced. */
export function toast(text) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
  announce(text);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API unavailable (insecure context): fall back to a hidden textarea
    const ta = h("textarea", { "aria-hidden": "true", style: { position: "fixed", opacity: "0", left: "0", top: "0" } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const storage = {
  get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
};

/** Code-point array. */
export const cps = s => Array.from(s);

export const nf = new Intl.NumberFormat("en");
