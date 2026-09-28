// pyrepr(s): Python's repr() of a string, for the values KeyPath's messages
// quote (docs/10 §9.7).  The rule, for strings of U+0020-U+007E and printable
// non-ASCII (readings, radicals, Hangul), which repr leaves as they are: the
// delimiter is " when s contains ' and no ", else '; a backslash doubles;
// the delimiter is escaped (\') when it is '.
//
// Only such strings reach it: workbench chunks are printable ASCII, the
// decoder checks a unit's alphabet before reading it, and readings are
// printable.  tools/build_data.py implements the same rule and asserts it
// equals repr() for every value a workbench fixture quotes;
// tests/workbench.test.js checks this function against
// tests/fixtures/pyrepr.json (Python's own repr of those values and more).
export function pyrepr(s) {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, "\\\\");
  return quote + (quote === "'" ? body.replace(/'/g, "\\'") : body) + quote;
}
