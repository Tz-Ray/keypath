// A small, dependency-free HTML walker for the page tests: enough to read
// index.html (which the repo controls), not a general HTML parser.
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style"]);

const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(src))) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}

/**
 * Parse into a tree of {tag, attrs, children, parent} and {text, parent}.
 * Comments and doctype are dropped; script/style contents are kept as raw
 * text children.
 */
export function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-z0-9-]+)\s*>|<([a-z0-9-]+)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi;
  let last = 0, m;
  const text = t => { if (t) cur.children.push({ text: decode(t), parent: cur }); };
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      let n = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n) cur = n.parent;
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const el = { tag, attrs: parseAttrs(m[3] || ""), children: [], parent: cur };
      cur.children.push(el);
      if (RAW.has(tag)) {
        const end = html.toLowerCase().indexOf(`</${tag}`, last);
        el.children.push({ text: html.slice(last, end), parent: el, raw: true });
        const close = html.indexOf(">", end);
        last = re.lastIndex = close + 1;
      } else if (!VOID.has(tag) && !m[4]) cur = el;
    }
  }
  text(html.slice(last));
  return root;
}

export function* walk(node) {
  yield node;
  for (const c of node.children || []) yield* walk(c);
}

export const elements = root => [...walk(root)].filter(n => n.tag && n.tag !== "#root");

export function ancestors(node) {
  const out = [];
  for (let n = node.parent; n; n = n.parent) out.push(n);
  return out;
}

export const textOf = node => [...walk(node)].filter(n => n.text !== undefined && !n.raw).map(n => n.text).join("");

export const byId = (root, id) => elements(root).find(e => e.attrs.id === id) || null;

export const query = (root, pred) => elements(root).filter(pred);
