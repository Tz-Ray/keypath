// Content lint (SPEC §11.3): no dev or owner-facing words anywhere visible,
// honest wording about security, and only relative or known links.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.js";
import { parseHtml, walk, ancestors, elements } from "./html.js";

const html = readFileSync(join(ROOT, "index.html"), "utf8");
const doc = parseHtml(html);

const BANNED = ["demo", "wip", "placeholder", "todo", "tbd", "fixme", "lorem", "coming soon", "beta", "claude", "note to self"];
const bannedRe = new RegExp(`(?<![\\p{L}\\p{N}_])(${BANNED.join("|")})(?![\\p{L}\\p{N}_])`, "iu");
const honestyRe = /(?<![\p{L}])(encrypt\p{L}*|secur\p{L}*|private)(?![\p{L}])/iu;
const VISIBLE_ATTRS = ["alt", "title", "aria-label", "placeholder"];

/** [text, inHonesty] for every visible text node and visible attribute. */
function visibleTexts() {
  const out = [];
  for (const n of walk(doc)) {
    const inHonesty = n => [n, ...ancestors(n)].some(a => a.attrs && "data-honesty" in a.attrs);
    if (n.text !== undefined && !n.raw) {
      if (n.text.trim()) out.push([n.text, inHonesty(n.parent)]);
    } else if (n.tag) {
      for (const a of VISIBLE_ATTRS) if (n.attrs[a]) out.push([n.attrs[a], inHonesty(n)]);
      if (n.tag === "title" || n.tag === "meta" && n.attrs.name === "description") {
        out.push([n.tag === "meta" ? n.attrs.content : n.children.map(c => c.text).join(""), false]);
      }
    }
  }
  return out;
}

/** String and template literals from a JS source (comments stripped). */
function jsStrings(src) {
  const out = [];
  const re = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|\/(?![*/])(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[a-z]*/g;
  let m;
  while ((m = re.exec(src))) {
    const s = m[1] ?? m[2] ?? m[3];
    if (s !== undefined) out.push(s);
  }
  return out;
}

const uiDir = join(ROOT, "assets/js/ui");
const uiStrings = readdirSync(uiDir).filter(f => f.endsWith(".js"))
  .flatMap(f => jsStrings(readFileSync(join(uiDir, f), "utf8")).map(s => [f, s]));

test("index.html has no dev or owner-facing words", () => {
  for (const [text] of visibleTexts()) assert.doesNotMatch(text, bannedRe, `banned word in: ${text}`);
});

test("UI script strings have no dev or owner-facing words", () => {
  assert.ok(uiStrings.length > 100);
  for (const [file, s] of uiStrings) {
    // file paths ("assets/js/…") are not visible text
    if (/^[\w./-]+\.(js|json|css|md|woff2)$/.test(s)) continue;
    assert.doesNotMatch(s, bannedRe, `banned word in ${file}: ${s}`);
  }
});

test("'encryption', 'security' and 'private' appear only inside data-honesty", () => {
  let honest = 0;
  for (const [text, inHonesty] of visibleTexts()) {
    if (!honestyRe.test(text)) continue;
    assert.ok(inHonesty, `security wording outside data-honesty: ${text}`);
    honest++;
  }
  assert.ok(honest >= 1, "the honesty section states it is not encryption");
  for (const [file, s] of uiStrings) assert.doesNotMatch(s, honestyRe, `security wording in ${file}: ${s}`);
});

const UPSTREAM = [
  "https://github.com/chewing/libchewing-data",
  "https://www.mdbg.net/chinese/dictionary?page=cc-cedict",
  "https://www.edrdg.org/",
  "https://github.com/scriptin/jmdict-simplified",
  "https://github.com/skk-dev/dict",
  "https://github.com/garfieldnate/kengdic",
  "https://github.com/libhangul/libhangul",
  "https://download.freedict.org/dictionaries/rus-eng/",
  "https://github.com/freedict/fd-dictionaries",
  "https://github.com/rspeer/wordfreq",
  "https://github.com/notofonts/noto-cjk",
  "https://www.unicode.org/ucd/",
];
const DATA_LICENSES = "https://github.com/Tz-Ray/keypath/blob/main/DATA-LICENSES.md";

test("links are relative, to the project on GitHub, or to a credited upstream", () => {
  const urls = [];
  for (const el of elements(doc)) for (const a of ["href", "src"]) if (el.attrs[a] !== undefined) urls.push(el.attrs[a]);
  assert.ok(urls.length > 20);
  for (const u of urls) {
    assert.ok(!u.startsWith("http:") && !u.startsWith("//"), `insecure or protocol-relative URL: ${u}`);
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
      const ok = u.startsWith("https://github.com/Tz-Ray/cipher-project") || UPSTREAM.includes(u) || u === DATA_LICENSES
        || u.startsWith("data:image/svg+xml,");
      assert.ok(ok, `unexpected absolute URL: ${u}`);
    } else {
      assert.ok(!u.startsWith("/"), `root-absolute URL breaks under /keypath/: ${u}`);
      const file = u.split("#")[0];
      if (file) assert.ok(existsSync(join(ROOT, file)), `relative link to a missing file: ${u}`);
    }
  }
  // every credited upstream is linked
  for (const u of UPSTREAM) assert.ok(urls.includes(u), `credit link missing: ${u}`);
  assert.ok(urls.includes("https://github.com/Tz-Ray/cipher-project"));
  assert.ok(urls.includes(DATA_LICENSES));
});

test("the (L)GPL data ships with the license texts, linked from the credits", () => {
  const texts = { "LICENSES/GPL-2.0.txt": "GNU GENERAL PUBLIC LICENSE\\s+Version 2, June 1991",
    "LICENSES/LGPL-2.0.txt": "GNU LIBRARY GENERAL PUBLIC LICENSE\\s+Version 2, June 1991",
    "LICENSES/LGPL-2.1.txt": "GNU LESSER GENERAL PUBLIC LICENSE\\s+Version 2.1, February 1999" };
  const md = readFileSync(join(ROOT, "DATA-LICENSES.md"), "utf8");
  for (const [path, head] of Object.entries(texts)) {
    const t = readFileSync(join(ROOT, path), "utf8");
    assert.match(t, new RegExp(head), path);
    assert.match(t, /END OF TERMS AND CONDITIONS/, `${path} is complete`);
    assert.ok(html.includes(`href="${path}"`), `${path} linked from the credits`);
    assert.ok(md.includes(`(${path})`), `${path} linked from DATA-LICENSES.md`);
  }
  assert.match(readFileSync(join(ROOT, "LICENSES/Unicode.txt"), "utf8"), /COPYRIGHT AND PERMISSION NOTICE/);
  // the repository's own license stays plain MIT
  assert.match(readFileSync(join(ROOT, "LICENSE"), "utf8"), /^MIT License/);
  assert.doesNotMatch(readFileSync(join(ROOT, "LICENSE"), "utf8"), /GNU|Unicode|CC BY/);
});

test("no absolute or protocol-relative URLs in scripts and styles", () => {
  const css = readFileSync(join(ROOT, "assets/css/site.css"), "utf8");
  assert.doesNotMatch(css, /url\(\s*["']?(https?:|\/\/|\/)/, "site.css must use relative urls");
  assert.doesNotMatch(css, /@import/);
  for (const [file, s] of uiStrings) {
    if (s === "http://www.w3.org/2000/svg") continue; // a namespace, not a request
    if (/^(https?:)?\/\//.test(s)) assert.ok(s.startsWith("https://github.com/Tz-Ray/cipher-project"), `${file}: ${s}`);
  }
});

test("the page names itself honestly", () => {
  assert.match(html, /<title>KeyPath: hide a message in keystrokes<\/title>/);
  assert.match(html, /puzzle cipher/i);
});
