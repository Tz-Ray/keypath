// The Trace (the walk the page draws) equals the Python walk, field for
// field, for the site's examples, the twelve challenges and 400 sampled keys.
import test from "node:test";
import assert from "node:assert/strict";
import { engine, readJsonl } from "./helpers.js";

const traces = readJsonl("tests/fixtures/traces.jsonl.gz");

test("trace fixtures include the challenges and a broad sample", () => {
  assert.deepEqual(traces.filter(t => t.id.startsWith("challenge-")).map(t => t.id),
    Array.from({ length: 12 }, (_, i) => `challenge-${String(i + 1).padStart(2, "0")}`));
  assert.ok(traces.length >= 400);
});

test("JS traces deep-equal the Python traces", async () => {
  const e = await engine();
  for (const t of traces) {
    const r = await e.decode({ ciphertext: t.ciphertext, keyText: t.keyText });
    assert.equal(r.ok, true, `${t.id}: ${JSON.stringify(r)}`);
    assert.deepStrictEqual(r.trace, t.trace, t.id);
  }
});
