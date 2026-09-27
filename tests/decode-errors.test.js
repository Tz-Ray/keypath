// Tampered keys: every one that Python's decode refuses, the JS decoder
// refuses too (never ok:true), as an invalid key or a tier-2 refusal.
import test from "node:test";
import assert from "node:assert/strict";
import { engine, readJsonl } from "./helpers.js";

const cases = readJsonl("tests/fixtures/decode-errors.jsonl.gz");

test("at least 100 tampered keys, of many kinds", () => {
  assert.ok(cases.length >= 100);
  assert.ok(new Set(cases.map(c => c.id.replace(/-\d+$/, ""))).size >= 15);
});

test("every tampered key is refused", async () => {
  const e = await engine();
  for (const c of cases) {
    const r = await e.decode({ ciphertext: c.ciphertext, keyText: c.keyText });
    assert.equal(r.ok, false, `${c.id} (${c.error}) decoded to ${JSON.stringify(r.text)}`);
    assert.ok(["keyInvalid", "tier2"].includes(r.reason), `${c.id}: ${r.reason} ${r.message}`);
  }
});

test("malformed JSON is badJson", async () => {
  const e = await engine();
  for (const text of ["", "{", "{\"a\":}", "[1,]", "{} x", "﻿{}", "{'a': 1}"]) {
    const r = await e.decode({ ciphertext: "a", keyText: text });
    assert.equal(r.reason, "badJson", JSON.stringify(text));
  }
});

test("deeply nested JSON is badJson, never a stack overflow", async () => {
  const e = await engine();
  for (const text of ['{"a":'.repeat(3000) + "1" + "}".repeat(3000), "[".repeat(5000) + "]".repeat(5000),
    "[".repeat(200000) + "]".repeat(200000)]) {
    const r = await e.decode({ ciphertext: "cj0u/6ru8", keyText: text });
    assert.equal(r.reason, "badJson");
  }
  // the key schema is shallow; nesting well inside the limit is parsed and refused as a key
  const r = await e.decode({ ciphertext: "cj0u/6ru8", keyText: "[".repeat(900) + "]".repeat(900) });
  assert.equal(r.reason, "keyInvalid");
});
