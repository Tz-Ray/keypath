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
const CARDS = JSON.parse(readFileSync(join(ROOT, "data/challenges/index.json"), "utf8"));
const pad = n => String(n).padStart(2, "0");

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
  "https://download.freedict.org/dictionaries/ell-eng/",
  "https://github.com/freedict/fd-dictionaries",
  "https://github.com/rspeer/wordfreq",
  "https://github.com/notofonts/noto-cjk",
  "https://www.unicode.org/ucd/",
  "https://www.unicode.org/reports/tr38/",
];
const REPO = "https://github.com/Tz-Ray/keypath";
const DATA_LICENSES = `${REPO}/blob/main/DATA-LICENSES.md`;
/** A link into this repository must name a file or folder that exists here. */
function repoPath(u) {
  const m = u.match(/^https:\/\/github\.com\/Tz-Ray\/keypath(?:\/(?:blob|tree)\/main\/(.+))?$/);
  return m ? (m[1] ?? "") : null;
}

test("links are relative, into this repository on GitHub, or to a credited upstream", () => {
  const urls = [];
  for (const el of elements(doc)) for (const a of ["href", "src"]) if (el.attrs[a] !== undefined) urls.push(el.attrs[a]);
  assert.ok(urls.length > 20);
  for (const u of urls) {
    assert.ok(!u.startsWith("http:") && !u.startsWith("//"), `insecure or protocol-relative URL: ${u}`);
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
      const ok = repoPath(u) !== null || UPSTREAM.includes(u) || u.startsWith("data:image/svg+xml,");
      assert.ok(ok, `unexpected absolute URL: ${u}`);
      if (repoPath(u)) assert.ok(existsSync(join(ROOT, repoPath(u))), `link to a file this repository lacks: ${u}`);
    } else {
      assert.ok(!u.startsWith("/"), `root-absolute URL breaks under /keypath/: ${u}`);
      const file = u.split("#")[0];
      if (file) assert.ok(existsSync(join(ROOT, file)), `relative link to a missing file: ${u}`);
    }
  }
  // every credited upstream is linked
  for (const u of UPSTREAM) assert.ok(urls.includes(u), `credit link missing: ${u}`);
  assert.ok(urls.includes(REPO));
  assert.ok(urls.includes(DATA_LICENSES));
});

test("the (L)GPL and Unicode V3 data ships with the license texts, linked from the credits", () => {
  // [head, tail]: the GPL texts end with their terms; the Unicode License V3
  // notice (docs/10 §9.2) is the 39 lines of https://www.unicode.org/license.txt
  const texts = { "LICENSES/GPL-2.0.txt": ["GNU GENERAL PUBLIC LICENSE\\s+Version 2, June 1991", "END OF TERMS AND CONDITIONS"],
    "LICENSES/LGPL-2.0.txt": ["GNU LIBRARY GENERAL PUBLIC LICENSE\\s+Version 2, June 1991", "END OF TERMS AND CONDITIONS"],
    "LICENSES/LGPL-2.1.txt": ["GNU LESSER GENERAL PUBLIC LICENSE\\s+Version 2.1, February 1999", "END OF TERMS AND CONDITIONS"],
    "LICENSES/Unicode-3.0.txt": ["^UNICODE LICENSE V3\\n", "prior written\\nauthorization of the copyright holder\\.\\n$"] };
  const md = readFileSync(join(ROOT, "DATA-LICENSES.md"), "utf8");
  for (const [path, [head, tail]] of Object.entries(texts)) {
    const t = readFileSync(join(ROOT, path), "utf8");
    assert.match(t, new RegExp(head), path);
    assert.match(t, new RegExp(tail), `${path} is complete`);
    assert.ok(html.includes(`href="${path}"`), `${path} linked from the credits`);
    assert.ok(md.includes(`(${path})`), `${path} linked from DATA-LICENSES.md`);
  }
  const v3 = readFileSync(join(ROOT, "LICENSES/Unicode-3.0.txt"), "utf8");
  assert.equal(v3.split("\n").length - 1, 39);
  assert.match(v3, /Copyright © 1991-2026 Unicode, Inc\./);
  // every DATA-LICENSES row for the Unihan-derived paths links the V3 notice
  for (const path of ["data/cangjie/", "data/quick.json", "data/en/zh_cangjie/"]) {
    const row = md.split("\n").find(l => l.startsWith("| `") && l.includes(`\`${path}`));
    assert.ok(row && row.includes("(LICENSES/Unicode-3.0.txt)"), `DATA-LICENSES row for ${path}`);
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
    if (/^(https?:)?\/\//.test(s)) assert.ok(repoPath(s.replace(/\$\{n\}/g, "1")) !== null, `${file}: ${s}`);
  }
});

test("the page names itself honestly", () => {
  assert.match(html, /<title>KeyPath: hide a message in keystrokes<\/title>/);
  assert.match(html, /puzzle cipher/i);
});

// The cipher project's repository is private: nothing public may link to it.
test("nothing links to the private cipher-project repository", () => {
  const files = ["index.html", "README.md", "DATA-LICENSES.md", "puzzles/README.md", "docs/analysis.md",
    ...readdirSync(join(ROOT, "assets/js/ui")).map(f => `assets/js/ui/${f}`),
    ...CARDS.map(c => `puzzles/challenge-${pad(c.n)}/solve-path.md`)];
  for (const f of files) assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /github\.com\/Tz-Ray\/cipher-project/i, f);
});

test("the solve-path links after a reveal name files in this repository", () => {
  const js = readFileSync(join(ROOT, "assets/js/ui/challenges.js"), "utf8");
  const tpl = js.match(/const SOLVE_PATH = n => `([^`]+)`/)[1];
  assert.equal(CARDS.length, 12);
  for (const { n } of CARDS) {
    const path = repoPath(tpl.replace("${pad(n)}", pad(n)));
    assert.ok(path && existsSync(join(ROOT, path)), `solve path ${n}: ${path}`);
  }
});

test("the copied puzzles match the page's challenges, and the provenance is the edition's", async () => {
  const { createHash } = await import("node:crypto");
  const index = JSON.parse(readFileSync(join(ROOT, "data/challenges/index.json"), "utf8"));
  assert.equal(index.length, 12);
  for (const c of index) {
    const dir = join(ROOT, `puzzles/challenge-${pad(c.n)}`);
    const data = JSON.parse(readFileSync(join(ROOT, `data/challenges/${pad(c.n)}.json`), "utf8"));
    assert.equal(readFileSync(join(dir, "ciphertext.txt"), "utf8"), data.ciphertext, `${c.n} ciphertext`);
    assert.equal(readFileSync(join(dir, "key.json"), "utf8"), data.keyText, `${c.n} key`);
    assert.equal(readFileSync(join(dir, "plaintext.txt"), "utf8"), data.plaintext, `${c.n} plaintext`);
    // the hints the page shows one per click are the puzzle's hints.json, in order
    const hints = Array.from({ length: c.hints || 0 }, (_, i) =>
      JSON.parse(readFileSync(join(ROOT, `data/challenges/hints/${pad(c.n)}-${i + 1}.json`), "utf8")));
    if (c.n >= 7) assert.deepEqual(JSON.parse(readFileSync(join(dir, "hints.json"), "utf8")), hints, `${c.n} hints`);
    else assert.ok(!existsSync(join(dir, "hints.json")) && hints.length === 0, `${c.n} has no hints`);
  }
  const manifest = JSON.parse(readFileSync(join(ROOT, "data/manifest.json"), "utf8"));
  const sha = createHash("sha256").update(readFileSync(join(ROOT, "docs/VERSIONS.md"))).digest("hex");
  assert.equal(sha, manifest.edition);
});

test("the copied solve paths keep only the solving steps, and the index gives every hint", () => {
  const index = JSON.parse(readFileSync(join(ROOT, "data/challenges/index.json"), "utf8"));
  const readme = readFileSync(join(ROOT, "puzzles/README.md"), "utf8");
  for (const c of index) {
    assert.ok(readme.includes(c.blurb) && readme.includes(c.title), `puzzles/README.md: #${c.n}`);
    const md = readFileSync(join(ROOT, `puzzles/challenge-${pad(c.n)}/solve-path.md`), "utf8");
    assert.match(md, /^# Challenge #\d+[^\n]*\n\n> \*\*Spoilers\.\*\*/, `#${c.n}: title, then the preface`);
    // the release each was set in (1-6 in 2.0, 7-12 in 2.6)
    assert.ok(md.includes(c.n <= 6 ? "(from KeyPath 2.0, tag `v2.0`)" : "(from KeyPath 2.6, tag `v2.6`)"), `#${c.n}: its release`);
    // the setter's notes cite unpublished documents; #4's once gave away #5
    assert.doesNotMatch(md, /^## (Leakage|How it was minted|Fairness checklist|Playtest)/m, `#${c.n}`);
    assert.doesNotMatch(md, /Note for later|the README/i, `#${c.n}`);
  }
});

// The build notes name the keypath release the data is built from: the tag
// tools/build_data.py pins (TAG, VERSION), everywhere they mention it.
test("the build notes name the tag and version build_data.py pins", () => {
  const build = readFileSync(join(ROOT, "tools/build_data.py"), "utf8");
  const tag = build.match(/^TAG = "(v\d+\.\d+)"$/m)[1];
  const version = build.match(/^VERSION = "(\d+\.\d+\.\d+)"$/m)[1];
  assert.ok(version.startsWith(`${tag.slice(1)}.`), `${tag} ${version}`);
  for (const f of ["tools/requirements.txt", "README.md", "tools/build_data.py"]) {
    const text = readFileSync(join(ROOT, f), "utf8");
    const tags = [...text.matchAll(/\bat tag (v\d+\.\d+)/g)].map(m => m[1]);
    assert.ok(tags.length, `${f} names no tag`);
    assert.deepEqual([...new Set(tags)], [tag], f);
  }
});
