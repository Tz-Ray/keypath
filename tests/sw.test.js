// The service worker (sw.js), run against stand-ins for its globals:
// network-first with revalidation, the cache when offline, and this page's
// older caches deleted on activate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { ROOT } from "./helpers.js";

const ORIGIN = "https://tz-ray.github.io";

function load({ online = true, cached = null, names = [] } = {}) {
  const handlers = {}, fetched = [], put = [], deleted = [];
  let claimed = false;
  const store = { put: async (req, res) => { put.push([req.url, res]); } };
  const caches = {
    keys: async () => names.slice(),
    delete: async n => { deleted.push(n); return true; },
    open: async () => store,
    match: async () => cached,
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => { claimed = true; } },
  };
  const fetch = async (req, init) => {
    fetched.push([req.url, JSON.stringify(init)]); // made in the worker's realm
    if (!online) throw new TypeError("Failed to fetch");
    return { ok: true, type: "basic", clone() { return this; } };
  };
  vm.runInNewContext(readFileSync(join(ROOT, "sw.js"), "utf8"), { self, caches, fetch, URL, Promise });
  /** Dispatch a fetch event; -> the response promise (or null when the worker passes). */
  const request = (url, method = "GET") => {
    let out = null;
    const waits = [];
    handlers.fetch({ request: { url, method }, respondWith: p => { out = p; }, waitUntil: p => waits.push(p) });
    return out && out.then(async r => { await Promise.all(waits); return r; });
  };
  const activate = async () => {
    const waits = [];
    handlers.activate({ waitUntil: p => waits.push(p) });
    await Promise.all(waits);
  };
  return { request, activate, fetched, put, deleted, get claimed() { return claimed; } };
}

test("every same-origin GET goes to the network first, revalidating, and is cached", async () => {
  const sw = load();
  const res = await sw.request(`${ORIGIN}/keypath/data/registry.json`);
  assert.equal(res.ok, true);
  assert.deepEqual(sw.fetched, [[`${ORIGIN}/keypath/data/registry.json`, '{"cache":"no-cache"}']]);
  assert.deepEqual(sw.put.map(p => p[0]), [`${ORIGIN}/keypath/data/registry.json`]);
});

test("offline, the cache answers; other origins and other methods pass through", async () => {
  const hit = { ok: true, cached: true };
  const sw = load({ online: false, cached: hit });
  assert.equal(await sw.request(`${ORIGIN}/keypath/`), hit);
  const miss = load({ online: false, cached: null });
  await assert.rejects(miss.request(`${ORIGIN}/keypath/`), TypeError);
  assert.equal(sw.request("https://example.com/x.js"), null);
  assert.equal(sw.request(`${ORIGIN}/keypath/`, "POST"), null);
});

// github.io serves every project of an account from one origin: another
// site's caches are not this page's to delete
test("activate deletes this page's older caches only, then claims the page", async () => {
  const sw = load({ names: ["keypath-v0", "keypath-v1", "other-site-v3"] });
  await sw.activate();
  assert.deepEqual([...sw.deleted], ["keypath-v0"]);
  assert.equal(sw.claimed, true);
});
