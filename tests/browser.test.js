// The browser driver (tools/browser.mjs) the e2e checks run on: two drivers
// at once never share a browser, and a driver that dies takes its browser
// with it.  Skipped when no Chromium is installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { ROOT } from "./helpers.js";
import { findChrome, launch, sleep } from "../tools/browser.mjs";

const skip = findChrome() ? false : "no Chromium binary found";
const BROWSER = pathToFileURL(join(ROOT, "tools/browser.mjs")).href;

const alive = pid => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
};

async function gone(pid, ms = 10_000) {
  const t0 = Date.now();
  while (alive(pid)) {
    if (Date.now() - t0 > ms) return false;
    await sleep(100);
  }
  return true;
}

test("two drivers launched together get their own browsers, even when Math.random repeats", { skip, timeout: 60_000 }, async () => {
  const random = Math.random;
  Math.random = () => 0.5;
  let a = null, b = null;
  try {
    [a, b] = await Promise.all([launch(), launch()]);
  } finally {
    Math.random = random;
  }
  try {
    assert.notEqual(a.port, b.port);
    assert.notEqual(a.pid, b.pid);
    await a.navigate("about:blank#driven-by-A");
    await b.navigate("about:blank#driven-by-B");
    assert.equal(await a.evaluate("location.href"), "about:blank#driven-by-A");
    assert.equal(await b.evaluate("location.href"), "about:blank#driven-by-B");
  } finally {
    a.close();
    b.close();
  }
  assert.ok(await gone(a.pid) && await gone(b.pid), "close() ends both browsers");
});

/** A driver in its own process: launches, prints its browser's pid, then `then`. */
function driver(then) {
  const code = `import { launch } from ${JSON.stringify(BROWSER)};
const b = await launch();
console.log("pid " + b.pid);
${then}`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
  const pid = new Promise((resolve, reject) => {
    let out = "", err = "";
    child.stdout.on("data", d => {
      out += d;
      const m = out.match(/pid (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    child.stderr.on("data", d => { err += d; });
    child.on("exit", () => reject(new Error(`driver exited before launching: ${err.slice(-500)}`)));
  });
  const exited = new Promise(resolve => child.on("exit", (code, signal) => resolve({ code, signal })));
  return { child, pid, exited };
}

test("a driver stopped by SIGTERM or SIGINT (a test runner's timeout, ^C) takes its browser down", { skip, timeout: 60_000 }, async () => {
  for (const [signal, status] of [["SIGTERM", 143], ["SIGINT", 130]]) {
    const d = driver("setInterval(() => {}, 1000);");
    const pid = await d.pid;
    assert.ok(alive(pid), `${signal}: the browser runs`);
    d.child.kill(signal);
    const { code } = await d.exited;
    assert.equal(code, status, signal);
    assert.ok(await gone(pid), `${signal}: browser ${pid} outlived its driver`);
  }
});

test("a driver that crashes or exits without close() takes its browser down", { skip, timeout: 60_000 }, async () => {
  for (const then of ["setTimeout(() => { throw new Error('boom'); }, 50);", "process.exit(3);"]) {
    const d = driver(then);
    const pid = await d.pid;
    const { code } = await d.exited;
    assert.notEqual(code, 0, then);
    assert.ok(await gone(pid), `${then}: browser ${pid} outlived its driver`);
  }
});
