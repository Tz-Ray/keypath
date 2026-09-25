// dumpsKey: the exact text of `keypath encode --out` (Python's
// json.dumps(key, ensure_ascii=False, indent=2) + "\n"), plus the offsets of
// every unit object and translation record in it, for highlighting.
//
// JSON.stringify(v, null, 2) and Python's indent=2 dump agree byte for byte
// on keys (two-space indent, ", " never used, ": " between name and value,
// the same escapes for control characters, non-ASCII written raw).  The
// small writer below reproduces JSON.stringify while recording offsets; the
// result is asserted equal to JSON.stringify's.

const scalar = v => JSON.stringify(v);

/**
 * -> {text, spans}; spans: [{kind: "unit"|"translation", path: [seg, word, i], start, end}]
 * with UTF-16 offsets into text.
 */
export function dumpsKeyWithSpans(key) {
  const spans = [];
  let out = "";

  function write(v, indent, where) {
    if (v === null || typeof v !== "object" || typeof v.toJSON === "function") {
      out += scalar(v);
      return;
    }
    const start = out.length;
    const inner = indent + "  ";
    if (Array.isArray(v)) {
      if (!v.length) { out += "[]"; return; }
      out += "[\n";
      v.forEach((item, i) => {
        if (i) out += ",\n";
        out += inner;
        write(item, inner, where && where.child ? where.child(i) : null);
      });
      out += "\n" + indent + "]";
    } else {
      const keys = Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== "function");
      if (!keys.length) { out += "{}"; return; }
      out += "{\n";
      keys.forEach((k, i) => {
        if (i) out += ",\n";
        out += inner + scalar(k) + ": ";
        write(v[k], inner, where && where.field ? where.field(k) : null);
      });
      out += "\n" + indent + "}";
    }
    if (where && where.span) spans.push({ ...where.span, start, end: out.length });
  }

  // Where the interesting objects live: $.segments[s].words[w].units[u],
  // .translation and .translations[h].
  const leaf = span => ({ span });
  const word = (s, w) => ({
    field: k => {
      if (k === "units") return { child: u => leaf({ kind: "unit", path: [s, w, u] }) };
      if (k === "translation") return leaf({ kind: "translation", path: [s, w, 0] });
      if (k === "translations") return { child: h => leaf({ kind: "translation", path: [s, w, h] }) };
      return null;
    },
  });
  const segment = s => ({ field: k => (k === "words" ? { child: w => word(s, w) } : null) });
  const root = { field: k => (k === "segments" ? { child: segment } : null) };

  write(key, "", root);
  const text = out + "\n";
  const expected = JSON.stringify(key, null, 2) + "\n";
  if (text !== expected) throw new Error("dumpsKey writer disagrees with JSON.stringify");
  spans.sort((a, b) => a.start - b.start);
  return { text, spans };
}

export const dumpsKey = key => JSON.stringify(key, null, 2) + "\n";
