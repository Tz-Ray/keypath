// Key parsing and validation.
//
// checkSchema / checkKey are ported from KeyPath's reference implementation
// (unpublished; MIT), through its offline decoder (v2.0): its schema check
// over the structural KEY_SCHEMA plus the registry rules of validate_key
// and decode's route and edition-table checks.  They are split as docs/10 §2.2
// requires: validateKey is validate_key (what kp1 unpack ends in), and
// checkKey runs decode's own checks (checkDecodable) after it.
//
// parseKeyJson reads JSON the way Python's json.loads does where it matters
// for a key: a number written with a fraction or exponent (1.0, 1e2) is a
// float, which the schema's "integer" type rejects even when its value is
// whole; NaN / Infinity / -Infinity are accepted as floats; duplicate names
// keep the last value.  Floats are PyFloat objects (valueOf() is the number).

export class KeyError extends Error {}
const fail = msg => { throw new KeyError(msg); };
export const has = (obj, k) => obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, k);

export class PyFloat {
  constructor(value) { this.value = value; }
  valueOf() { return this.value; }
  toJSON() { return Number.isFinite(this.value) ? this.value : null; }
}

export class JsonError extends Error {}

/** JSON text -> value, with Python json.loads number semantics. */
export function parseKeyJson(text) {
  let i = 0;
  const n = text.length;
  const bad = what => { throw new JsonError(`${what} at position ${i}`); };
  const ws = () => { while (i < n && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++; };
  const NUMBER = /-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?/y;
  const ESC = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

  function string() {
    i++; // opening quote
    let out = "";
    for (;;) {
      if (i >= n) bad("unterminated string");
      const c = text[i];
      if (c === '"') { i++; return out; }
      if (c === "\\") {
        const e = text[i + 1];
        if (e === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) bad("invalid \\u escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e !== undefined && has(ESC, e)) { out += ESC[e]; i += 2; }
        else bad("invalid escape");
      } else {
        if (c.charCodeAt(0) < 0x20) bad("invalid control character");
        out += c;
        i++;
      }
    }
  }

  function value(depth) {
    // Python's json.loads gives up near its recursion limit (1000); a key
    // is under ten levels deep, and this keeps well inside the JS stack
    if (depth > 1000) bad("nesting too deep");
    ws();
    if (i >= n) bad("expecting value");
    const c = text[i];
    if (c === "{") {
      i++;
      const obj = {};
      ws();
      if (text[i] === "}") { i++; return obj; }
      for (;;) {
        ws();
        if (text[i] !== '"') bad("expecting property name");
        const k = string();
        ws();
        if (text[i] !== ":") bad("expecting ':'");
        i++;
        const v = value(depth + 1);
        if (k === "__proto__") Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
        else obj[k] = v;
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return obj; }
        bad("expecting ',' or '}'");
      }
    }
    if (c === "[") {
      i++;
      const arr = [];
      ws();
      if (text[i] === "]") { i++; return arr; }
      for (;;) {
        arr.push(value(depth + 1));
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; return arr; }
        bad("expecting ',' or ']'");
      }
    }
    if (c === '"') return string();
    for (const [word, v] of [["true", true], ["false", false], ["null", null],
      ["NaN", new PyFloat(NaN)], ["Infinity", new PyFloat(Infinity)], ["-Infinity", new PyFloat(-Infinity)]]) {
      if (text.startsWith(word, i)) { i += word.length; return v; }
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) bad("expecting value");
    i += m[0].length;
    const num = Number(m[0]);
    return m[1] !== undefined || m[2] !== undefined ? new PyFloat(num) : (Object.is(num, -0) ? 0 : num);
  }

  let out;
  try {
    out = value(0);
  } catch (e) {
    if (e instanceof RangeError) throw new JsonError("nesting too deep");
    throw e;
  }
  ws();
  if (i !== n) bad("extra data");
  return out;
}

// The reference's schema check, with Python's == for const/enum (true == 1,
// 1.0 == 1) and no bool or float integers.
const IS_TYPE = {
  object: v => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof PyFloat),
  array: v => Array.isArray(v),
  string: v => typeof v === "string",
  number: v => typeof v === "number" || typeof v === "boolean" || v instanceof PyFloat,
  boolean: v => typeof v === "boolean",
  integer: v => Number.isInteger(v),
};
const pyNumber = v => (typeof v === "boolean" ? Number(v) : v instanceof PyFloat ? v.value : v);
const pyEqual = (a, b) => (typeof pyNumber(a) === "number" && typeof pyNumber(b) === "number"
  ? pyNumber(a) === pyNumber(b) : a === b);
const typeName = v => (v === null ? "null" : Array.isArray(v) ? "array" : v instanceof PyFloat ? "float" : typeof v);
const show = v => JSON.stringify(v);

export function checkSchema(value, schema, path) {
  const bad = message => fail(`${path}: ${message}`);
  if (has(schema, "const") && !pyEqual(value, schema.const)) bad(`expected ${show(schema.const)}, got ${show(value)}`);
  if (has(schema, "enum") && !schema.enum.some(e => pyEqual(value, e))) bad(`${show(value)} not one of ${show(schema.enum)}`);
  if (has(schema, "type") && !IS_TYPE[schema.type](value)) bad(`expected ${schema.type}, got ${typeName(value)}`);
  if (has(schema, "minimum") && pyNumber(value) < schema.minimum) bad(`${show(value)} < minimum ${schema.minimum}`);
  if (has(schema, "minLength") && value.length < schema.minLength) bad(`length ${value.length} < minLength ${schema.minLength}`);
  if (has(schema, "maxLength") && value.length > schema.maxLength) bad(`length ${value.length} > maxLength ${schema.maxLength}`);
  if (has(schema, "minItems") && value.length < schema.minItems) bad(`${value.length} items < minItems ${schema.minItems}`);
  if (has(schema, "anyOf") && !schema.anyOf.some(sub => {
    try { checkSchema(value, sub, path); return true; } catch (e) { if (e instanceof KeyError) return false; throw e; }
  })) bad("matches no allowed alternative");
  if (IS_TYPE.object(value)) {
    for (const name of schema.required || []) if (!has(value, name)) bad(`missing required field ${show(name)}`);
    for (const [name, sub] of Object.entries(schema.properties || {}))
      if (has(value, name)) checkSchema(value[name], sub, `${path}.${name}`);
  }
  if (schema.type === "array" && has(schema, "items")) value.forEach((item, i) => checkSchema(item, schema.items, `${path}[${i}]`));
}

export const HOP_PREFIX = "translate:";

/** [leading translate:* steps, the surface tail], as the reference splits a route. */
export function splitRoute(route) {
  let i = 0;
  while (i < route.length && typeof route[i] === "string" && route[i].startsWith(HOP_PREFIX)) i++;
  return [route.slice(0, i), route.slice(i)];
}

const surfaceOf = (R, lang, layout) => (has(R.surfaces, lang) && has(R.surfaces[lang], layout)
  ? R.surfaces[lang][layout] : null);

/**
 * The reference's validate_key: the schema and the registry rules, and
 * nothing that needs the tables (docs/10 §2.2).  kp1 unpack ends here;
 * checkKey runs decode's own checks after it.
 */
export function validateKey(key, R) {
  if (!IS_TYPE.object(key)) fail("key is not a JSON object");
  if (!has(key, "keypath")) fail(`$: missing required field ${show("keypath")}`);
  if (!R.keyVersions.some(v => pyEqual(key.keypath, v))) fail(`unsupported key version ${show(key.keypath)}`);
  checkSchema(key, R.keySchema, "$");
  const v1 = key.keypath === "1.0";
  const checkLanguage = (lang, where) => {
    if (!R.languages.includes(lang)) fail(`${where} ${lang} is not a registered language`);
    if (v1 && !R.v1Languages.includes(lang)) fail(`a 1.0 key cannot use language ${lang}`);
  };
  checkLanguage(key.source_language, "source language");
  key.segments.forEach((seg, si) => {
    checkLanguage(seg.language, `segment ${si} language`);
    if (v1 && !R.v1Layouts.includes(seg.layout)) fail(`a 1.0 key cannot use layout ${seg.layout}`);
    const surface = surfaceOf(R, seg.language, seg.layout);
    if (!surface) fail(`segment ${si}: (${seg.language}, ${seg.layout}) is not a registered surface`);
    const [hops, tail] = splitRoute(seg.route);
    // the 1.0 hop-language rule reads each hop's names, registered or not
    if (v1) {
      for (const hop of hops)
        for (const code of hop.slice(HOP_PREFIX.length).split(">"))
          if (!R.v1Languages.includes(code)) fail(`a 1.0 key cannot use language ${code} (hop ${hop})`);
    }
    if (JSON.stringify(tail) !== JSON.stringify(surface.routeTail))
      fail(`segment ${si}: route tail ${show(tail)} is not the tail registered for (${seg.language}, ${seg.layout})`);
    // docs/10 §2.1: a surface first registered in v2.1 or later accepts only
    // its own selector modes (the v2.0 surfaces keep ignoring the mode)
    const ordinal = R.kp1Surfaces.findIndex(([l, y]) => l === seg.language && y === seg.layout);
    if (!surface.selectorModes.includes(seg.selector_mode) && ordinal >= R.strictSelectorOrdinal)
      fail(`segment ${si}: ${show(seg.selector_mode)} is not a selector mode of (${seg.language}, ${seg.layout}) (its modes: ${show(surface.selectorModes)})`);
    if (!surface.homophoneLayer)
      seg.words.forEach(word => {
        for (const unit of (has(word, "units") ? word.units : []))
          if (has(unit, "homophone_index"))
            fail(`segment ${si}: surface (${seg.language}, ${seg.layout}) has no homophone layer; its units carry no homophone_index`);
      });
  });
}

/**
 * Decode's own key checks, for a key validateKey accepted: the edition is
 * known, every hop is registered, the chain starts at the source language
 * and ends at the segment's, and the edition lists every table it reads.
 */
export function checkDecodable(key, R) {
  if (!R.editionHashes.includes(key.tables_sha256))
    fail("key tables_sha256 is not a known table edition");
  const listed = R.editionTables[key.tables_sha256];
  const requireListed = (owner, files) => {
    for (const file of files)
      if (!listed.includes(file)) fail(`${owner} reads table ${file}, which the key's edition does not list`);
  };
  key.segments.forEach((seg, si) => {
    const surface = surfaceOf(R, seg.language, seg.layout);
    const [hops] = splitRoute(seg.route);
    let from = key.source_language;
    for (const hop of hops) {
      if (!R.hops.includes(hop)) fail(`segment ${si}: unknown hop ${hop}`);
      const [a, b] = hop.slice(HOP_PREFIX.length).split(">");
      if (a !== from) fail(`segment ${si}: hop chain is not connected (${hop} after ${from})`);
      from = b;
    }
    if (hops.length && from !== seg.language) fail(`segment ${si}: hops do not end at ${seg.language}`);
    for (const hop of hops) requireListed(`segment ${si}: hop ${hop}`, R.hopTables[hop]);
    requireListed(`segment ${si}: surface (${seg.language}, ${seg.layout})`, surface.tables);
  });
}

/** Every key rule decode applies before walking: validate_key's, then decode's own. */
export function checkKey(key, R) {
  validateKey(key, R);
  checkDecodable(key, R);
}
