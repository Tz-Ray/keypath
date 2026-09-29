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

// docs/10 §9.2: the Vietnamese tables are authored in KeyPath (MIT); the page
// carries their inventories and key tables in data/layouts.json, so that
// file's row credits them, and they add no copyleft source to anything
test("the Vietnamese tables are credited as authored, MIT, and add no copyleft source", () => {
  const layouts = JSON.parse(readFileSync(join(ROOT, "data/layouts.json"), "utf8"));
  assert.ok(["vi_syllables", "vi_telex", "vi_vni"].every(k => k in layouts));
  const row = md.split("\n").find(l => l.startsWith("| `data/layouts.json`"));
  for (const table of ["vi_syllables.tsv", "vi_telex.tsv", "vi_vni.tsv"]) {
    assert.ok(row.includes(`\`${table}\``), `DATA-LICENSES data/layouts.json row: ${table}`);
    assert.ok(section("Sources").includes(`\`${table}\``), `DATA-LICENSES KeyPath section: ${table}`);
  }
  assert.match(row, /authored in KeyPath \(MIT\)/);
  assert.deepEqual(copyleft(entryOf("data/layouts.json")), ["chewing"], "only the Pinyin spellings are LGPL-derived");
});

// docs/10 §9.2, §9.7 (M16): the Jyutping lists and rows are Unihan
// kCantonese readings (Unicode License V3, whose text travels in LICENSES/)
// over libchewing-data's characters; the ETen and JIS kana key tables are
// authored (MIT) and ship inside data/layouts.json; the ETen and kana rows
// are derived by the page and ship as no files
test("ETen, Jyutping and JIS kana are credited, with the Unicode license text for Unihan", () => {
  const layouts = JSON.parse(readFileSync(join(ROOT, "data/layouts.json"), "utf8"));
  assert.ok(["zh_eten", "zh_jyutping", "ja_kana"].every(k => k in layouts));
  const layoutsRow = md.split("\n").find(l => l.startsWith("| `data/layouts.json`"));
  for (const table of ["zh_eten.tsv", "ja_kana.tsv"]) {
    assert.ok(layoutsRow.includes(`\`${table}\``), `DATA-LICENSES data/layouts.json row: ${table}`);
    assert.ok(section("Sources").includes(`\`${table}\``), `DATA-LICENSES KeyPath section: ${table}`);
  }
  assert.deepEqual(copyleft(entryOf("data/layouts.json")), ["chewing"], "the key tables add no copyleft source");
  for (const file of ["data/jyutping.json", "data/en/zh_jyutping/a.json"]) {
    const e = entryOf(file);
    assert.ok(e.sources.unihan && e.sources.chewing, `${file}: Unihan and libchewing-data`);
    const row = tableRows.findIndex(ts => ts.some(t => covers(t, file)));
    const line = md.split("\n").filter(l => l.startsWith("| `"))[row];
    assert.match(line, /Unihan `kCantonese`/, file);
    assert.ok(line.includes("[Unicode License V3](LICENSES/Unicode-3.0.txt)"), `${file}: links LICENSES/Unicode-3.0.txt`);
    assert.ok(existsSync(join(ROOT, "LICENSES/Unicode-3.0.txt")));
  }
  assert.match(section("Sources"), /`kCantonese` lines of `Unihan_Readings\.txt`/);
  // the derived rows ship as no files, and the rows they derive from say so
  const reg = JSON.parse(readFileSync(join(ROOT, "data/registry.json"), "utf8"));
  for (const [sid, base] of Object.entries(reg.derivedRows)) {
    assert.ok(!files.some(f => f.startsWith(`data/en/${sid}/`)), sid);
    const line = md.split("\n").find(l => l.startsWith("| ") && l.includes(`\`data/en/${base}/\``));
    assert.match(line, /the page derives the [\w ]+ rows from these/, base);
  }
});
