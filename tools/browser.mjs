// A minimal Chrome DevTools Protocol driver for the browser checks: launches
// headless Chromium, opens one page and exposes send/evaluate/screenshot.
// No dependencies: Node's built-in WebSocket and fetch.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  process.env.KEYPATH_CHROME,
  join(homedir(), ".cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell"),
  join(homedir(), ".cache/ms-playwright/chromium-1228/chrome-linux64/chrome"),
].filter(Boolean);

export function findChrome() {
  return CANDIDATES.find(p => existsSync(p)) || null;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * A fontconfig file that adds `fontDir` (e.g. tools/.cache with the Noto CJK
 * OTFs) to the system fonts, so screenshots on a machine without CJK fonts
 * show real glyphs.  Returns the path, or null when fontDir is missing.
 */
export function fontConfig(fontDir, outDir) {
  if (!fontDir || !existsSync(fontDir)) return null;
  const path = join(outDir, "fonts.conf");
  writeFileSync(path, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <dir>${fontDir}</dir>
  <cachedir>${join(outDir, "fc-cache")}</cachedir>
</fontconfig>
`);
  return path;
}

// Every browser this process launched whose profile directory is not yet
// removed, by profile.  The browsers go down with the process however it
// ends: normally, on an uncaught error, or on SIGTERM / SIGINT / SIGHUP (a
// test runner's timeout, ^C), and their profiles with them, so no headless
// browser and no profile outlives its driver.
const launched = new Map();

function removeProfile(profile) {
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still in use */ }
  if (!existsSync(profile)) launched.delete(profile);
}

/** Blocks for `ms` milliseconds: the exit handler cannot await. */
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Whether a process of process group `group` still runs; a zombie (dead,
 * not yet reaped) does not.  Read from /proc; without one, whether the
 * group can still be signalled.
 */
function groupRuns(group) {
  let pids;
  try { pids = readdirSync("/proc").filter(name => /^[0-9]+$/.test(name)); } catch {
    try { process.kill(-group, 0); return true; } catch { return false; }
  }
  return pids.some(pid => {
    let stat;
    try { stat = readFileSync(`/proc/${pid}/stat`, "utf8"); } catch { return false; }
    const [state, , pgrp] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return pgrp === String(group) && state !== "Z" && state !== "X";
  });
}

let hooked = false;
function hookExit() {
  if (hooked) return;
  hooked = true;
  process.on("exit", () => {
    // Each browser runs in a process group of its own (detached), so one
    // SIGKILL ends it with its zygotes, renderers and utility processes; a
    // browser merely asked to stop would still be shutting down, and write
    // Default/Session Storage into its profile, after the profile is gone.
    // A browser already reaped is skipped: its pid may be another's by now.
    const browsers = [...launched.values()].filter(proc => proc.exitCode === null && proc.signalCode === null);
    for (const proc of browsers) {
      try { process.kill(-proc.pid, "SIGKILL"); } catch { try { proc.kill("SIGKILL"); } catch { /* gone */ } }
    }
    const t0 = Date.now();
    while (browsers.some(proc => groupRuns(proc.pid)) && Date.now() - t0 < 2000) pause(20);
    for (let i = 0; i < 3 && launched.size; i++) {
      if (i) pause(50);
      for (const profile of [...launched.keys()]) removeProfile(profile);
    }
  });
  for (const [signal, number] of [["SIGTERM", 15], ["SIGINT", 2], ["SIGHUP", 1]])
    process.once(signal, () => process.exit(128 + number));
}

/**
 * The DevTools port a browser listens on and its browser endpoint's path,
 * from the DevToolsActivePort file it writes into its own profile once it
 * has bound the port (--remote-debugging-port=0 lets the system pick a free
 * one), or null while it has not.
 */
function activePort(profile) {
  let text;
  try { text = readFileSync(join(profile, "DevToolsActivePort"), "utf8"); } catch { return null; }
  const [port, path = ""] = text.split("\n");
  return /^[0-9]+$/.test(port) && /^\/devtools\/browser\/\S+$/.test(path) ? { port: Number(port), path } : null;
}

export async function launch({ chrome = findChrome(), fontsConf = null } = {}) {
  if (!chrome) throw new Error("no Chromium binary found");
  const profile = mkdtempSync(join(tmpdir(), "kp-chrome-"));
  const env = { ...process.env };
  if (fontsConf) env.FONTCONFIG_FILE = fontsConf;
  hookExit();
  const proc = spawn(chrome, [
    "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore", env, detached: true });
  launched.set(profile, proc);
  const running = () => proc.exitCode === null && proc.signalCode === null;
  const stop = () => {
    if (running()) {
      proc.once("exit", () => removeProfile(profile));
      try { proc.kill(); } catch { /* gone */ }
    } else removeProfile(profile);
  };
  const abort = message => { stop(); throw new Error(message); };
  // this browser's own port and endpoint, never a guess another browser may hold
  let active = null;
  for (let i = 0; i < 150 && !active && running(); i++) {
    active = activePort(profile);
    if (!active) await sleep(100);
  }
  if (!active) abort("Chromium did not report its DevTools port");
  const { port } = active;
  let target, endpoint;
  for (let i = 0; i < 150 && !target; i++) {
    try {
      endpoint ??= String((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl);
      if (!endpoint.endsWith(active.path)) break;
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(t => t.type === "page");
    } catch { /* not up yet */ }
    if (!target) await sleep(100);
  }
  if (endpoint !== undefined && !endpoint.endsWith(active.path)) abort(`port ${port} answers for another browser`);
  if (!target) abort("no CDP page target");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  const listeners = new Set();
  ws.addEventListener("message", ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    events.push(msg);
    for (const fn of listeners) fn(msg);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, msg => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text}\n  in: ${expr.slice(0, 200)}`);
    return r.result.value;
  };
  const waitFor = async (expr, timeout = 15000) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await evaluate(expr); } catch { v = null; }
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for: ${expr}`);
      await sleep(50);
    }
  };
  const viewport = (width, height, mobile = width < 600) => send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height,
  });
  const media = ({ dark = false, reduced = false } = {}) => send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: dark ? "dark" : "light" },
      { name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" },
    ],
  });
  const screenshot = async (path, { fullPage = false, clip = null } = {}) => {
    const params = { format: "png", captureBeyondViewport: fullPage };
    if (fullPage) {
      const { contentSize } = await send("Page.getLayoutMetrics");
      params.clip = { x: 0, y: 0, width: Math.ceil(contentSize.width), height: Math.min(Math.ceil(contentSize.height), 16000), scale: 1 };
    } else if (clip) { params.clip = { scale: 1, ...clip }; params.captureBeyondViewport = true; }
    const { data } = await send("Page.captureScreenshot", params);
    writeFileSync(path, Buffer.from(data, "base64"));
    return path;
  };
  const navigate = async url => {
    await send("Page.navigate", { url });
    await waitFor("document.readyState === 'complete'");
  };
  const close = () => {
    try { ws.close(); } catch { /* closed */ }
    stop();
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
  return { send, evaluate, waitFor, viewport, media, screenshot, navigate, close, events, listeners, port, pid: proc.pid, profile };
}
