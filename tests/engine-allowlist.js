// The engine's whole public surface (docs/10 §9.7 "No solver"): the keys of
// the object createEngine() returns and the named exports of the engine's
// modules that the page imports.  tests/no-solver.test.js asserts that these
// lists are exact, and that none of these functions, given an unsplit stream
// of keys and no layout, answers with ways to split it.  Adding a key or an
// export means adding it here, with what it is for.
//
// Allowed (docs/10 §8.1): questions about one hypothesis on a keyboard the
// visitor named.  Not allowed: guessing the keyboard of a ciphertext, lookup
// or type without a layout, splitting a stream into units, ranking readings.

/** createEngine()'s object. */
export const ENGINE_KEYS = {
  version: "keypath version the data was built from",
  edition: "tables edition of that version",
  registry: "the registry data (data/registry.json)",
  layouts: "keyboard readers and writers for units the key has already delimited",
  surfaces: "the page's keyboards, in chip order",
  allowed: "the keyboards a source language can be typed on",
  detect: "plaintext language detection: the language of a message a visitor types, never of a ciphertext",
  encode: "a visitor's message, source language and keyboard -> ciphertext and key",
  decode: "a ciphertext and its key -> the message and its walk",
  trace: "decode's walk alone",
  list: "one candidate list, named by its edge and value",
  kp1Pack: "a key -> its short (kp1) form",
  kp1Unpack: "a short key -> the key",
  lookup: "the workbench: chunks the visitor split, on the layout the visitor named",
  type: "the workbench: a text typed on the layout the visitor named",
  isCompact: "whether key text is a short (kp1) key",
  whatIf: "a decoded walk with one unit's candidate changed",
  whatIfParts: "whatIf, in parts",
  unitText: "what a decoded walk's keys spell before any dictionary hop",
  normalize: "KeyPath's text normalization",
  firstNewer: "the Unicode guard: the first code point newer than Unicode 14",
  cpLength: "length in code points",
  _internal: "internals for the tests and tools",
};

/** Named exports, per engine module. */
export const MODULE_EXPORTS = {
  "assets/js/engine/index.js": {
    createEngine: "the engine",
    normalize: "KeyPath's text normalization",
    cpCompare: "code-point order",
    cpLength: "length in code points",
    codePoints: "a string's code points",
    answerNorm: "a challenge answer, normalized for checking",
    answerFold: "answerNorm without accents",
    sha256Hex: "SHA-256 of text",
    checkAnswer: "a guess against a challenge's answer digests",
    dumpsKey: "a key's JSON text",
    dumpsKeyWithSpans: "dumpsKey, with the span of each unit",
    trimAscii: "trim ASCII whitespace (as kp1 does)",
    KP1_PREFIX: "the short-key prefix",
  },
  "assets/js/engine/workbench.js": {
    createWorkbench: "the workbench's lookup and type, for createEngine",
    DEFAULT_TOP: "lookup's default number of candidates",
  },
};
