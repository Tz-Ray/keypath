// The data provider: fetchText(relPath) -> Promise<string>, where relPath is
// repo-relative ("data/zh/core.json").  The browser resolves it against the
// site root; node tests read the file system.  Results are cached and
// concurrent requests for one path share a single fetch; a failed fetch is
// forgotten so a retry can succeed.

export class LoadError extends Error {
  constructor(path, cause) {
    super(`could not load ${path}${cause && cause.message ? `: ${cause.message}` : ""}`);
    this.path = path;
  }
}

export function createData(fetchText) {
  const texts = new Map(), jsons = new Map();
  const memo = (cache, path, make) => {
    let p = cache.get(path);
    if (!p) {
      p = make();
      cache.set(path, p);
      p.catch(() => { if (cache.get(path) === p) cache.delete(path); });
    }
    return p;
  };
  const text = path => memo(texts, path, () => Promise.resolve()
    .then(() => fetchText(path))
    .then(t => { if (typeof t !== "string") throw new Error("not text"); return t; },
          e => { throw e instanceof LoadError ? e : new LoadError(path, e); }));
  const json = path => memo(jsons, path, () => text(path).then(t => {
    try { return JSON.parse(t); } catch (e) { throw new LoadError(path, e); }
  }));
  return { text, json };
}

/** The browser provider: paths resolve against the site root (works under /keypath/). */
export function browserFetchText(base) {
  return async path => {
    const res = await fetch(new URL(path, base));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
}
