// The browser driver (tools/browser.mjs) the e2e checks run on: two drivers
// at once never share a browser, and a driver that dies takes its browser
// and the browser's profile directory with it.  Skipped when no Chromium is
// installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

/**
 * Whether a browser's profile directory is removed and stays removed: a
 * browser still shutting down when its profile goes would write it again
 * (Default/Session Storage) within this second.
 */
async function removed(profile, ms = 10_000) {
  const t0 = Date.now();
  while (existsSync(profile)) {
    if (Date.now() - t0 > ms) return false;
    await sleep(100);
  }
  await sleep(1000);
  return !existsSync(profile);
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
  assert.notEqual(a.profile, b.profile);
  assert.ok(await removed(a.profile) && await removed(b.profile), "close() removes both profiles");
});

/**
 * A driver in its own process: launches, prints its browser's pid and
 * profile directory, then `then`.
 */
function driver(then) {
  const code = `import { launch } from ${JSON.stringify(BROWSER)};
const b = await launch();
console.log("launched " + JSON.stringify({ pid: b.pid, profile: b.profile }));
${then}`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
  const launched = new Promise((resolve, reject) => {
    let out = "", err = "";
    child.stdout.on("data", d => {
      out += d;
      const m = out.match(/^launched (\{.*\})$/m);
      if (m) resolve(JSON.parse(m[1]));
    });
    child.stderr.on("data", d => { err += d; });
    child.on("exit", () => reject(new Error(`driver exited before launching: ${err.slice(-500)}`)));
  });
  const exited = new Promise(resolve => child.on("exit", (code, signal) => resolve({ code, signal })));
  return { child, launched, exited };
}

test("a driver stopped by SIGTERM, SIGINT or SIGHUP (a test runner's timeout, ^C) takes its browser and profile down", { skip, timeout: 90_000 }, async () => {
  for (const [signal, status] of [["SIGTERM", 143], ["SIGINT", 130], ["SIGHUP", 129]]) {
    const d = driver("setInterval(() => {}, 1000);");
    const { pid, profile } = await d.launched;
    assert.ok(alive(pid), `${signal}: the browser runs`);
    assert.ok(existsSync(profile), `${signal}: the profile exists`);
    d.child.kill(signal);
    const { code } = await d.exited;
    assert.equal(code, status, signal);
    assert.ok(await gone(pid), `${signal}: browser ${pid} outlived its driver`);
    assert.ok(await removed(profile), `${signal}: profile ${profile} outlived its driver`);
  }
});

test("a driver that crashes, exits without close(), or exits right after close() takes its browser and profile down", { skip, timeout: 90_000 }, async () => {
  for (const [then, status] of [["setTimeout(() => { throw new Error('boom'); }, 50);", 1], ["process.exit(3);", 3],
    ["b.close(); process.exit(0);", 0]]) {
    const d = driver(then);
    const { pid, profile } = await d.launched;
    const { code } = await d.exited;
    assert.equal(code, status, then);
    assert.ok(await gone(pid), `${then}: browser ${pid} outlived its driver`);
    assert.ok(await removed(profile), `${then}: profile ${profile} outlived its driver`);
  }
});
