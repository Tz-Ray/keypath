// End-to-end: the page in headless Chromium (tools/cdp.mjs), served under
// /keypath/ like GitHub Pages.  Skipped when no Chromium is installed;
// set KEYPATH_CHROME to point at a binary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./helpers.js";
import { findChrome } from "../tools/browser.mjs";

const chrome = findChrome();

test("the page in a real browser (tools/cdp.mjs)", { skip: chrome ? false : "no Chromium binary found", timeout: 600_000 }, () => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools/cdp.mjs")], { cwd: ROOT, encoding: "utf8", timeout: 590_000 });
  const out = `${r.stdout}\n${r.stderr}`;
  const failures = out.split("\n").filter(l => l.startsWith("FAIL")).join("\n");
  assert.equal(r.status, 0, failures || out.slice(-2000));
  assert.match(r.stdout, /CHROMIUM PASS/);
});
