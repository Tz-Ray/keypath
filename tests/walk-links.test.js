// #walk links (docs/10 §9.7): the fragment parser and the function behind
// the link control, which share one length limit; and the static ban on
// HTML-parsing sinks in the page's scripts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, engine, readJson, readJsonl } from "./helpers.js";
import { parseFragment, walkBody, walkLinkOf, toB64url, fromB64url, FRAGMENT_MAX } from "../assets/js/ui/share.js";
import { T } from "../assets/js/ui/text.js";

const F = readJson("tests/fixtures/kp1.json");
const ids = readJson("data/registry.json").siteSurfaces.map(s => s.id);
const parse = obj => parseFragment(`#walk=${typeof obj === "string" ? obj : toB64url(obj)}`, ids);
const good = F.accepted[0].kp1;

test("one length limit, 8,000 characters, for the parser and the link control", () => {
  assert.equal(FRAGMENT_MAX, 8000);
  const src = readFileSync(join(ROOT, "assets/js/ui/share.js"), "utf8");
  assert.equal((src.match(/8000/g) || []).length, 1, "the limit is written once");
  // a body of 8,001 characters is refused, whatever it holds
  assert.equal(parse("A".repeat(8001)), null);
  assert.equal(fromB64url("A".repeat(8001)), null);
  // a well-formed walk whose body is just over the limit is refused; at the limit it is read
  const sized = n => {
    let lo = 1, hi = 6000;
    const body = len => toB64url({ c: "a".repeat(len), k: good });
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (body(mid).length <= n) lo = mid; else hi = mid - 1; }
    return body(lo);
  };
  const atLimit = sized(8000), over = toB64url({ c: "a".repeat(6000), k: good });
  assert.ok(atLimit.length <= 8000 && atLimit.length > 7990, `${atLimit.length}`);
  assert.ok(over.length > 8000);
  assert.ok(parse(atLimit).walk);
  assert.equal(parse(over), null);
});

test("well-formed: {c, k} or {c, j}, strings, c printable ASCII of 1 to 6,000 characters", () => {
  assert.deepEqual(parse({ c: "su3cl3", k: good }), { walk: { c: "su3cl3", k: good } });
  assert.deepEqual(parse({ c: "su3cl3", j: "{}" }), { walk: { c: "su3cl3", j: "{}" } });
  // k is kept as given: it is trimmed and unpacked by the decode path, which refuses a bad one
  assert.deepEqual(parse({ c: "a", k: ` ${good}\n` }), { walk: { c: "a", k: ` ${good}\n` } });
  assert.deepEqual(parse({ c: "x", k: "KP1.nonsense" }), { walk: { c: "x", k: "KP1.nonsense" } });
});

test("anything else is a malformed fragment, and ignored", () => {
  const bad = [
    { c: "su3cl3" }, { k: good }, { c: "su3cl3", k: good, j: "{}" }, { c: "su3cl3", k: good, x: 1 },
    { c: "", k: good }, { c: "a b", k: good }, { c: "a\n", k: good }, { c: "é", k: good }, { c: "a".repeat(6001), k: good },
    { c: 5, k: good }, { c: "a", k: 5 }, { c: "a", j: { keypath: "1.1" } }, { c: "a", k: null },
    { c: "a", __proto__: null, k: good, extra: true },
  ];
  for (const obj of bad) assert.equal(parse(obj), null, JSON.stringify(obj));
  for (const body of ["", "!!!", "a=b", toB64url([1, 2]), toB64url("walk"), "eyJjIjoi"])
    assert.equal(parseFragment(`#walk=${body}`, ids), null, body);
  // a JSON "__proto__" member is an ordinary field here, so a third field
  const proto = Buffer.from(`{"c":"a","k":"${good}","__proto__":{"j":"{}"}}`).toString("base64url");
  assert.equal(parse(proto), null);
});

test("the link control: kp1 in k, never truncated; too long with j for the long zh_pinyin vector", async () => {
  const e = await engine();
  // site vector edge-7413 of docs/10 (now numbered edge-11275): the 200-character zh_pinyin edge message
  const v = readJsonl("tests/fixtures/vectors.jsonl.gz")
    .find(r => r.class === "edge" && r.surface === "zh_pinyin" && Array.from(r.text).length === 200);
  assert.equal(v.id, "edge-11275");
  const key = JSON.parse(v.expect.keyText);
  const j = walkBody(v.expect.ciphertext, { j: JSON.stringify(key) });
  assert.equal(j.ok, false);
  assert.equal(j.reason, "tooLong");
  assert.ok(j.length > 12000, `${j.length}`);
  const packed = e.kp1Pack(key);
  const k = walkBody(v.expect.ciphertext, { k: packed.text });
  assert.equal(k.ok, true);
  assert.ok(k.body.length < 2500, `${k.body.length}`);
  assert.deepEqual(parse(k.body), { walk: { c: v.expect.ciphertext, k: packed.text } });
  // the result-level builder picks kp1
  const link = walkLinkOf({ ciphertext: v.expect.ciphertext, key }, e);
  assert.equal(link.body, k.body);
  // the disabled-control messages, verbatim (docs/10 §9.7)
  assert.equal(T.walkTooLong, "This key is too long for a link; download the key instead.");
  assert.equal(T.walkEmpty, "This message has nothing to type on the keyboard, so there is no walk to share.");
});

test("an empty ciphertext has no walk to share", async () => {
  const e = await engine();
  const r = await e.encode({ text: "12 34 5", source: "en", surface: "en_identity" });
  assert.deepEqual([r.ok, r.ciphertext], [true, ""]);
  assert.deepEqual(walkLinkOf(r, e), { ok: false, reason: "empty" });
  assert.deepEqual(walkBody("", { k: good }), { ok: false, reason: "empty" });
  assert.equal(parse({ c: "", k: good }), null);
  assert.deepEqual(walkLinkOf(null, e), { ok: false, reason: "none" });
});

test("a walk link round-trips: build, parse, decode through the same path", async () => {
  const e = await engine();
  const r = await e.encode({ text: "welcome home", source: "en", surface: "zh_cangjie" });
  const link = walkLinkOf(r, e);
  assert.equal(link.ok, true);
  const { walk } = parse(link.body);
  const d = await e.decode({ ciphertext: walk.c, keyText: walk.k, format: "kp1" });
  assert.deepEqual([d.ok, d.text, d.keyText], [true, "welcome home", r.keyText]);
  // j carries the compact JSON; it walks back the same
  const jb = walkBody(r.ciphertext, { j: JSON.stringify(r.key) });
  const jw = parse(jb.body).walk;
  const dj = await e.decode({ ciphertext: jw.c, keyText: jw.j, format: "json" });
  assert.deepEqual(dj.trace, d.trace);
  // a reject vector in a well-formed walk is read, then refused by the decode path
  for (const g of F.rejected) {
    const w = parse({ c: "su3cl3", k: g.kp1 });
    assert.ok(w && w.walk, g.why);
    const rr = await e.decode({ ciphertext: w.walk.c, keyText: w.walk.k, format: "kp1" });
    assert.deepEqual([rr.ok, rr.reason, rr.compact], [false, "keyInvalid", true], g.why);
  }
});

test("the page's scripts never parse strings as HTML or code", () => {
  const files = dir => readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : [];
  });
  const all = files(join(ROOT, "assets/js"));
  assert.ok(all.length >= 20);
  const banned = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/;
  for (const f of all) assert.doesNotMatch(readFileSync(f, "utf8"), banned, relative(ROOT, f));
  // and the service worker and the inline theme script
  assert.doesNotMatch(readFileSync(join(ROOT, "sw.js"), "utf8"), banned);
  assert.doesNotMatch(readFileSync(join(ROOT, "index.html"), "utf8"), banned);
});
