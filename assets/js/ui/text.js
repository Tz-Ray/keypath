// Every user-visible string the scripts write into the page.
// (The static copy lives in index.html.)

export const LANG_NAMES = {
  en: "English", es: "Spanish", ru: "Russian", ko: "Korean", zh: "Chinese", ja: "Japanese",
};

/** The BCP 47 tag for native-script text of each KeyPath language. */
export const LANG_TAGS = { zh: "zh-Hant", ja: "ja", ko: "ko", ru: "ru", es: "es", en: "en" };

/** Default keyboard when the message language changes (§4.1). */
export const DEFAULT_SURFACE = { zh: "zh_daqian", ko: "ko_dubeolsik", ru: "ru_jcuken", es: "es_accent" };

/** Segment badge names. */
export const SURFACE_BADGE = {
  zh_daqian: "Bopomofo · Chinese",
  zh_pinyin: "Pinyin · Chinese",
  zh_hanja: "Korean keyboard · Chinese hanja",
  ja_romaji: "Romaji · Japanese",
  ko_dubeolsik: "Dubeolsik · Korean",
  ru_jcuken: "ЙЦУКЕН · Russian",
  es_accent: "Accent digits · Spanish",
  en_identity: "Plain · English",
};

export const DICTIONARY = {
  zh: "CC-CEDICT", ja: "JMdict", ko: "kengdic", ru: "FreeDict rus-eng", es: "FreeDict spa-eng",
};

/** "a, b and c" */
export function listAnd(items) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const stripDot = s => String(s || "").replace(/[.\s]+$/, "");

export const T = {
  // refusals, errors and toasts (§2.3)
  empty: "Type a message to see its keystrokes.",
  unknownWords: words => `Not in this page's 10,000-word English list: ${words.join(", ")}. The command-line tool has the full dictionaries.`,
  jaSource: "Japanese messages need the full Japanese dictionary, which this page doesn't carry. Try an English message on the Japanese keyboard.",
  routeOff: (lang, keyboards) => `From ${lang}, this page types on ${listAnd(keyboards)} only. Other routes need the full dictionaries of the command-line tool.`,
  newerUnicode: cp => `${cp} is newer than the Unicode version KeyPath uses. Remove it to continue.`,
  loadFailed: "Couldn't load part of the dictionary. Check your connection and try again.",
  retry: "Retry",
  badJson: "That key isn't valid JSON.",
  keyInvalid: message => `This key doesn't fit this ciphertext: ${stripDot(message)}.`,
  notCarried: what => `This key needs dictionary data this page doesn't carry (${stripDot(what)}). The command-line tool, keypath decode, can read it.`,
  tier2: "Free-translation keys need the command-line tool.",
  encodeError: "This message can't be walked here. The command-line tool can try it.",
  copied: "Copied.",
  linkCopied: "Link copied.",
  walkedBack: text => `Walked back: “${text}”, identical to your message.`,
  walkedBackOther: text => `Walked back: “${text}”.`,
  lookingUp: "Looking up…",
  needBoth: "Paste a ciphertext and its key.",

  // detection label
  detected: "detected",
  chosen: "chosen",

  // output
  caption: (message, keyboard) => `“${message}” typed on ${keyboard}.`,
  statsLine: (k, c, leak) => `${k} ${k === 1 ? "keystroke" : "keystrokes"} · ${c} ${c === 1 ? "choice" : "choices"} in the key · ${leak}`,
  leakNone: "nothing rides in the key as plain text",
  leakSome: (n, m) => `${n} of ${m} characters ride in the key as plain text`,
  // "Without the key, these keys allow {formula} character combinations."
  keyspace: ["Without the key, these keys allow ", " character combinations."],
  announce: k => `Ciphertext updated: ${k} keystrokes.`,
  unitMarks: "Unit marks",

  // figure
  bands: { msg: "Message", dict: "Dictionary", char: "Character", sound: "Sound", letters: "Letters", keys: "Keys" },
  figCaption: (message, ciphertext, keyboard, w, u, k) =>
    `${message} becomes ${ciphertext} on ${keyboard}: ${w} ${w === 1 ? "word" : "words"}, ${u} ${u === 1 ? "unit" : "units"}, ${k} keystrokes.`,
  figureLabel: "The walk from message to keystrokes",
  sense: (index, count) => `sense #${index} of ${count}`,
  rank: (index, count) => `#${index} of ${count}`,
  rankFirst: " · first",
  onlyOne: "only one",
  kanaAsTyped: "kana as typed",
  pickedByDigit: selected => `#${selected} · picked by the digit`,
  literalCaption: "in the key",
  literalTitle: "No route for this text, so the key carries it as plain text.",
  misdirection: (key, symbol) => `On this keyboard "${key}" types ${symbol}.`,
  showAll: n => `Show the whole walk (${n} units)`,
  wordLabel: (i, text, chain) => `Word ${i}: ${text}${chain.map(c => `, dictionary ${c.word}, sense ${c.index} of ${c.count}`).join("")}`,
  literalLabel: (i, text) => `Word ${i}: in the key as plain text: “${text}”`,
  unitLabel: u => u,
  tableHead: ["#", "Message", "Dictionary", "Character", "Sound", "Keys"],
  tableLiteral: text => `in the key: “${text}”`,

  // popovers
  // popover titles follow the reading: "ㄧㄥˊ · ying2: 46 characters share this sound"
  zhTitle: count => `: ${count} characters share this sound`,
  hanjaTitle: count => `: ${count} hanja share this syllable`,
  jaTitle: count => `: ${count} ${count === 1 ? "word shares" : "words share"} this reading`,
  jaMore: n => `+${n} more in the full dictionary`,
  zhCaption: "Ordered by how common each character is (libchewing), ties by code point.",
  hanjaCaption: "In hanja.txt order.",
  jaCaption: "In SKK dictionary order.",
  keysPick: "the key's pick",
  whatIf: k => `With #${k} there, the same keys spell `,
  backToKey: "Back to the key",
  senseBody: (target, count, dict, index, word) => `${target} has ${count} English ${count === 1 ? "sense" : "senses"} in ${dict}. The key records #${index}: ${word}.`,
  senseRule: word => `KeyPath takes the first dictionary entry for “${word}” that this keyboard can type.`,
  pivotBody: (target, count, lang, index, word) => `${target} lists ${count} ${lang} ${count === 1 ? "word" : "words"}; the key records #${index}: ${word}.`,
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

  // theme
  theme: mode => `Colour theme: ${mode}`,
  themeNames: { auto: "Auto", light: "Light", dark: "Dark" },
};
