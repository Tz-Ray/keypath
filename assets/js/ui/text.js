// Every user-visible string the scripts write into the page.
// (The static copy lives in index.html.)

export const LANG_NAMES = {
  en: "English", es: "Spanish", ru: "Russian", ko: "Korean", zh: "Chinese", ja: "Japanese", vi: "Vietnamese", el: "Greek",
};

/** The BCP 47 tag for native-script text of each KeyPath language. */
export const LANG_TAGS = { zh: "zh-Hant", ja: "ja", ko: "ko", ru: "ru", es: "es", en: "en", vi: "vi", el: "el" };

/** Default keyboard when the message language changes (§4.1). */
export const DEFAULT_SURFACE = { zh: "zh_daqian", ko: "ko_dubeolsik", ru: "ru_jcuken", es: "es_accent", vi: "vi_telex", el: "el_greek", en: "zh_daqian" };

/** Segment badge names. */
export const SURFACE_BADGE = {
  zh_daqian: "Bopomofo · Chinese",
  zh_eten: "ETen Bopomofo · Chinese",
  zh_pinyin: "Pinyin · Chinese",
  zh_jyutping: "Jyutping · Chinese",
  zh_cangjie: "Cangjie · Chinese",
  zh_quick: "Quick · Chinese",
  zh_hanja: "Korean keyboard · Chinese hanja",
  ja_romaji: "Romaji · Japanese",
  ja_kana: "JIS kana · Japanese",
  ko_dubeolsik: "Dubeolsik · Korean",
  ru_jcuken: "ЙЦУКЕН · Russian",
  es_accent: "Accent digits · Spanish",
  vi_telex: "Telex · Vietnamese",
  vi_vni: "VNI · Vietnamese",
  el_greek: "Greek keyboard · Greek",
  en_identity: "Plain · English",
};

export const DICTIONARY = {
  zh: "CC-CEDICT", ja: "JMdict", ko: "kengdic", ru: "FreeDict rus-eng", es: "FreeDict spa-eng", el: "FreeDict ell-eng",
};

/** "a, b and c" */
export function listAnd(items) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const stripDot = s => String(s || "").replace(/[.\s]+$/, "");

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd" */
export function ordinal(n) {
  const t = n % 100, u = n % 10;
  const suffix = t >= 11 && t <= 13 ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** Wrap user text for a plain-text context (aria, captions) so its bidi controls stay inside. */
export const isolate = s => `\u2068${s}\u2069`;

export const T = {
  // refusals, errors and toasts (§2.3)
  empty: "Type a message to see its keystrokes.",
  unknownWords: words => `Not in this page's 10,000-word English list: ${words.join(", ")}. Try a more common word, or type it on Plain English.`,
  jaSource: "Japanese messages need the full Japanese dictionary, which this page doesn't carry. Try an English message on a Japanese keyboard (romaji or kana).",
  routeOff: (lang, keyboards) => `From ${lang}, this page types on ${listAnd(keyboards)} only.`,
  newerUnicode: cp => `${cp} is newer than the Unicode version KeyPath uses. Remove it to continue.`,
  loadFailed: "Couldn't load part of the dictionary. Check your connection and try again.",
  retry: "Retry",
  badJson: "That key isn't valid JSON.",
  keyInvalid: message => `This key doesn't fit this ciphertext: ${stripDot(message)}.`,
  kp1Invalid: message => `This short key can't be read: ${stripDot(message)}.`,
  notCarried: what => `This key needs dictionary data this page doesn't carry (${stripDot(what)}).`,
  // Greek into any other language goes through the Greek-to-English lists, which the page never ships (docs/10 §9.7)
  routeOffEl: "From Greek, this page types on the Greek keyboard only. Typing Greek on another keyboard needs the Greek-to-English dictionary, which this page doesn't carry.",
  elOut: "This key translates Greek through the Greek-to-English dictionary, which this page doesn't carry.",
  tier2: "This page can't read free-translation keys.",
  encodeError: "This message can't be walked here.",
  copied: "Copied.",
  linkCopied: "Link copied.",
  // walk links (#walk, docs/10 §9.7)
  walkLinkCopied: "Link copied. Anyone with the link can read the message.",
  walkOpened: "Opened from a walk link, which carries the ciphertext and its key: anyone with the link can read the message.",
  walkTooLong: "This key is too long for a link; download the key instead.",
  walkEmpty: "This message has nothing to type on the keyboard, so there is no walk to share.",
  // [before, after] around the decoded text (placed in an isolating <bdi>)
  walkedBack: ["Walked back: “", "”, identical to your message."],
  walkedBackNorm: lower => ["Walked back: “", `”, your message after KeyPath's normalization${lower ? " (lowercase, single spaces)" : ""}.`],
  walkedBackOther: ["Walked back: “", "”."],
  lookingUp: "Looking up…",
  needKey: "Paste the key (and its ciphertext).",
  keyCrashed: "This key can't be read here.",

  // detection label
  detected: "detected",
  chosen: "chosen",

  // output
  // [before, after] around the message (placed in an isolating <bdi>)
  caption: keyboard => ["“", `” typed on ${keyboard}.`],
  statsLine: (k, c, leak) => `${k} ${k === 1 ? "keystroke" : "keystrokes"} · ${c} ${c === 1 ? "choice" : "choices"} in the key · ${leak}`,
  leakNone: "nothing rides in the key as plain text",
  leakSome: (n, m) => `${n} of ${m} characters ride in the key as plain text`,
  // "Without the key, these keys allow {formula} character combinations."
  keyspace: ["Without the key, these keys allow ", " character combinations."],
  announce: k => `Ciphertext updated: ${k} keystrokes.`,
  unitMarks: "Unit marks",

  // figure
  bands: { msg: "Message", dict: "Dictionary", char: "Character", sound: "Sound", shape: "Shape", letters: "Letters", keys: "Keys" },
  figCaption: (message, ciphertext, keyboard, w, u, k) =>
    `${isolate(message)} becomes ${ciphertext} on ${keyboard}: ${w} ${w === 1 ? "word" : "words"}, ${u} ${u === 1 ? "unit" : "units"}, ${k} keystrokes.`,
  figureLabel: "The walk from message to keystrokes",
  // positions are shown counting from 1; the key stores them counting from 0
  sense: (index, count) => `sense ${index + 1} of ${count}`,
  pivotWord: (index, count) => `word ${index + 1} of ${count}`,
  rank: (index, count) => `${ordinal(index + 1)} of ${count}`,
  onlyOne: "only one",
  kanaAsTyped: "kana as typed",
  pickedByDigit: selected => `picked by the digit ${selected + 1}`,
  literalCaption: "in the key",
  literalTitle: "No route for this text, so the key carries it as plain text.",
  misdirection: (key, symbol) => `On this keyboard "${key}" types ${symbol}.`,
  showAll: n => `Show the whole walk (${n} units)`,
  wordLabel: (i, text, chain) => `Word ${i}: ${isolate(text)}${chain.map(c => `, dictionary ${c.word}, ${c.lang === "en" ? "word" : "sense"} ${c.index + 1} of ${c.count}`).join("")}`,
  literalLabel: (i, text) => `Word ${i}: in the key as plain text: “${isolate(text)}”`,
  unitLabel: u => u,
  tableHead: ["#", "Message", "Dictionary", "Character", "Sound", "Keys"],
  tableShape: "Shape",
  tableSoundShape: "Sound or shape",
  tableLiteral: ["in the key: “", "”"],

  // popovers
  // popover titles follow the reading: "ㄧㄥˊ · ying2: 46 characters share this sound"
  zhTitle: count => (count === 1 ? ": 1 character has this sound" : `: ${count} characters share this sound`),
  // "tgno · 廿土弓人: 3 characters share this code"
  shapeTitle: count => (count === 1 ? ": 1 character has this code" : `: ${count} characters share this code`),
  hanjaTitle: count => `: ${count} hanja share this syllable`,
  jaTitle: count => `: ${count} ${count === 1 ? "word shares" : "words share"} this reading`,
  jaMore: n => `+${n} more in the full dictionary`,
  zhCaption: "Ordered by how common each character is (libchewing), ties by code point.",
  shapeCaption: "Codes from Unihan. Ordered by how common each character is (libchewing), ties by code point.",
  jyutpingCaption: "Readings from Unihan. Ordered by how common each character is (libchewing), ties by code point.",
  hanjaCaption: "In hanja.txt order.",
  jaCaption: "In SKK dictionary order.",
  countNote: "Numbered from 1 here; the key counts from 0.",
  keysPick: "the key's pick",
  whatIf: k => `With candidate ${k + 1} there, the same keys spell `,
  backToKey: "Back to the key",
  senseBody: (target, count, dict, index, word) => `${target} has ${count} English ${count === 1 ? "sense" : "senses"} in ${dict}. The key records the ${ordinal(index + 1)}: ${word}.`,
  senseRule: word => `KeyPath takes the first dictionary entry for “${word}” that this keyboard can type.`,
  pivotBody: (target, count, lang, index, word) => `${target} lists ${count} ${lang} ${count === 1 ? "word" : "words"}; the key records the ${ordinal(index + 1)}: ${word}.`,
  close: "Close",

  // challenges
  solved: "Solved.",
  solvedFolded: "Solved, accents aside.",
  notQuite: "Not quite. Keep going.",
  solvedBadge: "Solved",
  revealConfirm: "This shows the answer. Reveal it?",
  reveal: "Reveal",
  cancel: "Cancel",
  revealWalk: "Reveal the walk",
  solvePath: "How it's meant to be solved ↗",
  theKey: "The key",
  yourAnswer: "Your answer",
  check: "Check",
  copy: "Copy",
  hint: keyboard => `Hint: typed on ${keyboard}.`,
  answerLang: (source, target) => target
    ? `Written in ${source}: answer in ${source}, or with the ${target} the keys spell.`
    : `Written in ${source}: answer in ${source}, or in the language the keys spell.`,
  answersIgnore: "Answers ignore spaces, punctuation and capitals.",
  puzzleExample: "This is one of the page's own examples, so its answer is already on the page. Type your own message first.",
  puzzleEmpty: "This message has nothing to type on the keyboard: all of it rides in the key. Add some words first.",

  // the workbench (docs/10 §9.7)
  wbPick: "Pick a keyboard first. The workbench never guesses it.",
  wbNoKeys: "Type the keys to look up, split into units with spaces.",
  wbNoText: "Type a guess to see the keys it makes.",
  // `shown` is a character in quotes with its code point, or the code point alone
  wbBadKey: shown => `${shown} isn't a key on a US keyboard. Units use its printable keys only (letters, digits and punctuation), split by spaces.`,
  wbLooked: (n, keyboard, all) => (n === 1
    ? `1 unit on ${keyboard}: ${all ? "it reads on this keyboard." : "it doesn't read on this keyboard, and the rule it breaks is below."}`
    : `${n} units on ${keyboard}: ${all ? "every one reads on this keyboard." : "not all of them read on this keyboard; each that doesn't names the rule it breaks."}`),
  wbTyped: keyboard => `Typed on ${keyboard}.`,

  // theme
  theme: mode => `Colour theme: ${mode}`,
  themeNames: { auto: "Auto", light: "Light", dark: "Dark" },
};
