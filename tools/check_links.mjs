// Checks that every external link on the page resolves for a visitor who is
// not signed in (needs the network, so it is not part of `npm test`):
//   node tools/check_links.mjs        -> one line per URL; exit 1 if any fails
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(`${ROOT}index.html`, "utf8");
const urls = new Set([...html.matchAll(/href="(https:[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&")));
// the challenge write-ups linked after a reveal (assets/js/ui/challenges.js)
for (let n = 1; n <= 6; n++) urls.add(`https://github.com/Tz-Ray/keypath/blob/main/puzzles/challenge-0${n}/solve-path.md`);

let failed = 0;
for (const url of [...urls].sort()) {
  let status;
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "keypath-link-check" } });
    status = r.status;
  } catch (e) {
    status = e.cause?.code || e.message;
  }
  const ok = typeof status === "number" && status < 400;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${status} ${url}`);
}
console.log(failed ? `${failed} link(s) failed` : "all links resolve");
process.exit(failed ? 1 : 0);
