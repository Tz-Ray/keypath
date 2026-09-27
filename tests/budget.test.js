// Payload budget (SPEC §5.8, §11.6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { ROOT } from "./helpers.js";

const gz = path => gzipSync(readFileSync(join(ROOT, path)), { level: 9 }).length;

function files(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = dir ? `${dir}/${name}` : name;
    if (!dir && [".git", ".venv", "node_modules", "tests", "tools"].includes(name)) continue;
    const s = statSync(join(ROOT, rel));
    if (s.isDirectory()) out.push(...files(rel));
    else out.push(rel);
  }
  return out;
}
const served = files("").filter(f => !f.endsWith(".md"));

test("first view is at most 160 KB gzipped", () => {
  const first = ["index.html", "assets/css/site.css", "data/registry.json", "data/layouts.json", "data/unicode14.json", "data/hero.json",
    ...served.filter(f => f.startsWith("assets/js/"))];
  const total = first.reduce((s, f) => s + gz(f), 0);
  assert.ok(total <= 160 * 1024, `first view ${total} bytes gz`);
});

test("every data file is at most 120 KB gzipped", () => {
  for (const f of served.filter(f => f.startsWith("data/"))) assert.ok(gz(f) <= 120 * 1024, `${f}: ${gz(f)} bytes gz`);
});

test("the served total is at most 5 MB", () => {
  const total = served.reduce((s, f) => s + statSync(join(ROOT, f)).size, 0);
  assert.ok(total <= 5 * 1024 * 1024, `served ${total} bytes`);
});

test("fonts stay small", () => {
  const tc = statSync(join(ROOT, "fonts/glyphs-tc.woff2")).size;
  const kr = statSync(join(ROOT, "fonts/glyphs-kr.woff2")).size;
  assert.ok(tc <= 70 * 1024 && kr <= 70 * 1024 && tc + kr <= 90 * 1024, `${tc} + ${kr}`);
});

test("every script the page loads is modulepreloaded", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  for (const f of served.filter(f => f.startsWith("assets/js/") && f.endsWith(".js"))) {
    assert.ok(html.includes(`<link rel="modulepreload" href="${f}">`), `${relative(ROOT, join(ROOT, f))} not preloaded`);
  }
});
