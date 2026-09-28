// The NOTICE and DATA-LICENSES coverage test (docs/10 §9.2).  tools/
// build_data.py maps every generated file, by path glob, to the sources it
// derives from (its SOURCES map, written to tests/fixtures/sources.json).
// Every file under data/ and tests/fixtures/ must match an entry; every
// file derived from a GPL or LGPL source must be named, with that source,
// its license text and the dates of the change, in its directory's NOTICE;
// and DATA-LICENSES.md must list its path and, under "Changes to the GPL
// and LGPL sources", what was changed.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, readJson } from "./helpers.js";

const map = readJson("tests/fixtures/sources.json");
const md = readFileSync(join(ROOT, "DATA-LICENSES.md"), "utf8");
const walk = dir => readdirSync(join(ROOT, dir)).flatMap(name => {
  const rel = `${dir}/${name}`;
  return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
});
const all = [...walk("data"), ...walk("tests/fixtures")].map(p => relative(ROOT, join(ROOT, p)).split("\\").join("/"));
const files = all.filter(f => !f.endsWith("/NOTICE"));
const notices = all.filter(f => f.endsWith("/NOTICE"));

const globRe = glob => new RegExp(`^${glob.split("*").map(p => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
const entryOf = file => map.files.find(e => globRe(e.glob).test(file));
const copyleft = entry => Object.keys(entry.sources).filter(id => map.sources[id].copyleft);
/** Does a backticked path from DATA-LICENSES cover `file`? (exact, a directory prefix, or a glob) */
const covers = (token, file) => token === file || (token.endsWith("/") && file.startsWith(token))
  || (token.includes("*") && globRe(token).test(file));
const tokens = text => [...text.matchAll(/`([^`]+)`/g)].map(m => m[1]);

const section = (title) => {
  const start = md.indexOf(`\n## ${title}\n`);
  assert.ok(start >= 0, title);
  const end = md.indexOf("\n## ", start + 1);
  return md.slice(start, end < 0 ? undefined : end);
};
const tableRows = section("Which file comes from where").split("\n").filter(l => l.startsWith("| `"))
  .map(l => tokens(l.split("|")[1]));
const changes = section("Changes to the GPL and LGPL sources");
const bullet = name => {
  const start = changes.indexOf(`\n- **${name}**`);
  assert.ok(start >= 0, `Changes to the GPL and LGPL sources: ${name}`);
  const end = changes.indexOf("\n- **", start + 1);
  return changes.slice(start, end < 0 ? undefined : end);
};

test("every generated file has a SOURCES entry, and every entry names known sources", () => {
  assert.ok(files.length > 500);
  for (const file of files) assert.ok(entryOf(file), `${file}: no SOURCES entry in tools/build_data.py`);
  for (const e of map.files) {
    for (const id of Object.keys(e.sources)) assert.ok(map.sources[id], `${e.glob}: unknown source ${id}`);
    assert.equal(Boolean(e.notice), copyleft(e).length > 0, `${e.glob}: a NOTICE directory iff a copyleft source`);
    for (const id of copyleft(e)) assert.ok(e.sources[id].length > 0, `${e.glob}: ${id} has no change dates`);
  }
});

test("each directory's NOTICE names every GPL/LGPL source of every file it covers", () => {
  const expected = new Set();
  for (const file of files) {
    const e = entryOf(file);
    if (!e.notice) continue;
    assert.ok(file.startsWith(`${e.notice}/`), `${file}: NOTICE directory ${e.notice}`);
    expected.add(`${e.notice}/NOTICE`);
    const notice = readFileSync(join(ROOT, e.notice, "NOTICE"), "utf8");
    const up = "../".repeat(e.notice.split("/").length);
    for (const id of copyleft(e)) {
      const { name, license, text } = map.sources[id];
      const line = notice.split("\n").find(l => l.startsWith(`- ${name} (${license}, ${up}${text}), changed by the KeyPath project on `));
      assert.ok(line, `${e.notice}/NOTICE: ${name} for ${file}`);
      for (const date of e.sources[id]) assert.ok(line.includes(date), `${e.notice}/NOTICE: ${name} changed on ${date}`);
    }
    // the file is among the ones the NOTICE says it covers
    const rest = file.slice(e.notice.length + 1);
    const which = notice.split("\n")[0];
    const sub = rest.includes("/") ? rest.slice(0, rest.lastIndexOf("/") + 1) : null;
    assert.ok(sub ? which.includes(`in ${sub} `) : which.includes("the files in this directory") || which.includes(rest),
      `${e.notice}/NOTICE does not cover ${rest}: ${which}`);
  }
  assert.deepEqual([...notices].sort(), [...expected].sort(), "a NOTICE exactly where copyleft-derived files are");
  for (const n of notices) {
    const text = readFileSync(join(ROOT, n), "utf8");
    assert.match(text, /modified versions of:[\s\S]*changed by the KeyPath project on 20\d\d-\d\d-\d\d/, n);
    for (const [, rel] of text.matchAll(/((?:\.\.\/)+[\w./-]+\.(?:txt|md))/g))
      assert.ok(existsSync(join(ROOT, n, "..", rel)), `${n}: ${rel}`);
  }
});

test("DATA-LICENSES lists every file's path, and what changed for each copyleft source", () => {
  for (const file of files) {
    assert.ok(tableRows.some(ts => ts.some(t => covers(t, file))), `DATA-LICENSES "Which file comes from where": ${file}`);
    for (const id of copyleft(entryOf(file))) {
      const b = bullet(map.sources[id].name);
      assert.ok(tokens(b).some(t => covers(t, file)), `DATA-LICENSES "Changes": ${map.sources[id].name} → ${file}`);
      for (const date of entryOf(file).sources[id]) assert.ok(b.includes(date), `DATA-LICENSES "Changes": ${map.sources[id].name} changed ${date}`);
    }
  }
});
