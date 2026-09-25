// Shared test helpers: an engine reading the repo from disk, and the
// fixtures tools/build_data.py generates from the Python implementation.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createEngine } from "../assets/js/engine/index.js";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const fetchText = path => readFile(join(ROOT, path), "utf8");

let shared = null;
/** One engine per test file (engines cache what they load). */
export const engine = () => (shared ??= createEngine({ fetchText }));
export const freshEngine = () => createEngine({ fetchText });

export const readJson = path => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
export const readJsonl = path => gunzipSync(readFileSync(join(ROOT, path)))
  .toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
