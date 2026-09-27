// A tiny static server that mounts the repository at /keypath/, the way
// GitHub Pages serves it (https://tz-ray.github.io/keypath/).
//   node tools/serve.mjs [port]         -> prints the URL
//   import { startServer } from "./serve.mjs"  (tests)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MOUNT = "/keypath/";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png",
};
const PRIVATE = /^(\.git|\.venv|node_modules|tools\/\.cache|tests\/\.out)(\/|$)/;

export function startServer(port = 0, root = ROOT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/" || url.pathname === "/keypath") {
      res.writeHead(302, { location: MOUNT }); res.end(); return;
    }
    if (!url.pathname.startsWith(MOUNT)) { res.writeHead(404); res.end("not found"); return; }
    let rel;
    try { rel = decodeURIComponent(url.pathname.slice(MOUNT.length)); } catch { res.writeHead(400); res.end(); return; }
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    const path = normalize(join(root, rel));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) || PRIVATE.test(rel)) { res.writeHead(404); res.end(); return; }
    try {
      const s = await stat(path);
      if (!s.isFile()) throw new Error("not a file");
      const body = await readFile(path);
      res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream", "cache-control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }); res.end("not found");
    }
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => {
    const { port: p } = server.address();
    resolve({ server, port: p, origin: `http://127.0.0.1:${p}`, url: `http://127.0.0.1:${p}${MOUNT}` });
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { url } = await startServer(Number(process.argv[2]) || 8080);
  console.log(`serving ${ROOT} at ${url}`);
}
