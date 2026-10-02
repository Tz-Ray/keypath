// Ported from the normalization of KeyPath's reference implementation
// (unpublished; docs/10 §3.2, §9.7 "Text rules"): NFC (never NFKC), then
// lowercase for en, es, ru, vi and el, then NFC again for
// el, then runs of two or more U+0020 collapse to one.  Tabs and newlines
// are kept.  Lowercasing is toLowerCase(), never per code point: on a text
// with no capital sigma, on the whole string; otherwise on each run between
// capital sigmas (the same thing, since Final_Sigma is the one mapping of
// toLowerCase that reads context), with each Σ lowercased by Final_Sigma as
// Python's str.lower() does it (ΟΔΟΣ -> οδος, final ς), over Unicode 14.0's
// Cased and Case_Ignorable properties below rather than the runtime's: those
// change between Unicode versions (Unicode 16.0 made U+0295 ʕ Lo, so no
// longer cased, and U+1171E Mc, so no longer case-ignorable), and docs/10
// §3.2 makes Final_Sigma part of the contract whenever every code point
// around a Σ is assigned in Unicode 14.0.  Code point by code point,
// toLowerCase agrees with Python on every Unicode-14 code point
// (tests/unicode.test.js checks all 1,433 that change, and Final_Sigma
// around every one).  LOWER_OVERRIDES must stay empty: a per-code-point
// path would break Final_Sigma.  The second NFC composes what lowercasing
// leaves decomposed: capital Ϊ / Ϋ + U+0301 have no precomposed form and
// lowercase to ϊ / ϋ + U+0301, which compose to ΐ / ΰ (ΚΑΪ́ΚΙ -> καΐκι, one
// word).

export const LOWERCASE_LANGUAGES = new Set(["en", "es", "ru", "vi", "el"]);

/** The languages normalized with NFC again after lowercasing (docs/10 §3.2). */
export const RECOMPOSED_LANGUAGES = new Set(["el"]);

export const LOWER_OVERRIDES = new Map();

// Unicode 14.0 (Python 3.11): the Case_Ignorable code points, and the Cased
// code points that are not Case_Ignorable (Final_Sigma skips case-ignorable
// code points before it asks whether one is cased, so these are the only
// cased ones it reads).  Ranges, each the hex gap after the previous range's
// last code point, then "+" and the hex count of further code points when
// there are any.  tests/unicode.test.js checks both against Python's
// (tests/fixtures/unicode.json, from tools/build_data.py).
const CASE_IGNORABLE_14 = [
  "27 6 b 23 1 47 4 1 4 2+1 1f7+bf 4+1 4 9+1 1 fb+6 cf 5 31+2c 1 1+1 1+1 1 2c b+5 a+a 1 23 a+14 10 65+7 1+9",
  "1+3 21 1 1e+1a 5b+a 3a+a 4 2 18+17 2b+2 2c 7+1 6+7 29+39 37 1 4+7 4 3+6 a+1 d f 3a 4+3 8 14+1 1a 2+1 39",
  "4+1 4+1 2+2 3 1e+1 3 b+1 39 4+4 1+1 4 14+1 16+5 1 3a 2 1+3 8 7+1 b+1 1e 3d c 32 3 37 1+2 5+2 1+3 7+1 b+1",
  "1d 3a 2 6 5+1 14+1 1c+1 39+1 4+3 8 14+1 1d 48 7+2 1 5a 2+6 b+8 62 2+8 9 1+5 4a+1 1b 1 1 37+d 1+4 1+1 5+a",
  "1+23 9 66+3 1+5 1+1 2+1 19+1 4+2 10+3 d 2+1 6 f 5e 260+2 3b2+2 1d+1 1e+1 1e+1 40+1 1+6 8 2+a 3 5 2d+4 33",
  "41+1 22 76+2 4+1 9 6+2 db+1 2 3a 1+6 1 1 2+7 6+9 2 27 8+1e 31+3 30 1+4 1 5 28+8 c+1 20+3 2+1 1+2 38 1+1",
  "3 1+2 3a+7 2+1 40+5 52+2 1+c 1+6 4 6 3+1 32+3e d 22+64 1bd 1+2 b+2 d+2 d+2 d+1 c+4 8+1 a 2 2+4 31+4 1+9",
  "1 d 10+c 33+20 b8b+1 71+2 7d f 60+1f 2f 1d5 24+3 3+4 5 5d+5 5d+2 6f16 4e2+5 10e 62+3 1+9 1 1c+3 50+1",
  "e+21 4e 17+2 67+2 3+1 8 3 4 19+1 5 97+1 1a+11 d 26+7 19+a 2e+2 30 2+3 2+1 11 15+1 42+5 2+1 2+1 c 8 23 b",
  "33 1+2 2+1 5+1 1 1b e+1 5+1 1 64+4 9+2 79 2 4 4f30 93+10 23d+f 3 c+f 22 2 a9 7 6 b 23 1 2f 2d+1 43 15+2",
  "201 e2 95+4 405+5 1+29 1+8 246+2 1+1 5+3 28+2 4 a5+1 23d+3 183+1 99+a 31+3 7b 36+e 29 2+1 a+2 31+3 2+1 2",
  "4 a 32+2 24+4 1+7 3e c+1 34+8 a+3 2 5f+2 2 1+1 6 a0 3+7 15+1 39+1 3 25+6 3+4 c3+7 2+2 1 17 54+5 1 4+1",
  "1+1 ee+3 6+1 1+1 1b+1 55+7 2 1+1 6a 1 2+5 1 65+2 2+3 1+4 103+8 1+1 100+1 1 4 90+3 2+1 4 20+9 28+5 2+3 8",
  "9+5 2+2 2e+c 1+1 196+6 1+5 1 52+15 2+6 1+1 1+1 7a+5 3 1+1 1+6 1 48+1 3 1 15b+1 153b+8 36b7+4 3b+6 9+3",
  "40b 3f+10 40+1 1+1 400b+3 1+6 1+1 c9e+1 1+3 125c+2d 2+16 220+2 9+f 2+6 1e+3 94+2 7bb+36 4+31 8 e 16+4",
  "1+e 550+6 1+10 2+6 1+1 1+4 105+d 170 3d+3 5e0+6 6d+7 aaf+4 c0c01 1e+5f 80+ef",
].join(" ");
const CASED_14 = [
  "41+19 6+19 2f a 4 5+16 1+1e 1+c2 1+3 4+cf 1+1a c0+3 2+1 3+2 1 6 1+2 1 1+13 1+52 1+8a 8+a5 1+25 9+28",
  "b17+25 1 5 2+2a 2+2 2a0+55 2+5 882+8 7+2a 2+2 40+2b 3f+c 1+21 65+115 2+5 2+25 2+5 2+7 1 1 1 1+1e 2+34",
  "1+6 1 3+2 1+6 3+3 2+5 4+c 5+2 1+6 105 4 2+9 1 3+4 6 1 1 1+3 1+5 4 2+3 5+4 4 11+1f 3+1 331+33 716+7b 2+66",
  "6+3 3+1 c+25 1 5 7912+2d 12+1b 86+4d 1+16 3+3 1+3a 5+1 1 1+4 1b+1 3 335+2a 5+8 7+4f 4f40+6 c+4 409+19",
  "6+19 4a5+4f 60+23 4+23 74+a 1+e 1+6 1+1 1+a 1+e 1+6 1+1 6c3+32 d+32 bad+3f 5560+3f 6580+54 1+46 1+1 2",
  "2+1 2+3 1+b 1 1+6 1+40 1+3 2+7 1+6 1+1b 1+3 1+4 1 3+6 1+153 2+18 1+18 1+1e 1+18 1+1e 1+18 1+1e 1+18 1+1e",
  "1+18 1+7 734+9 1+13 9e1+43 7ec+19 6+19 6+19",
].join(" ");

function decodeRanges(text) {
  const out = [];
  let last = -1;
  for (const item of text.split(" ")) {
    const [gap, more = "0"] = item.split("+");
    const first = last + 1 + parseInt(gap, 16);
    last = first + parseInt(more, 16);
    out.push([first, last]);
  }
  return out;
}

/** Unicode 14.0's Final_Sigma classes as [first, last] ranges (for the tests). */
export const FINAL_SIGMA_RANGES = Object.freeze({
  caseIgnorable: decodeRanges(CASE_IGNORABLE_14),
  cased: decodeRanges(CASED_14),
});

function member(ranges) {
  const firsts = ranges.map(r => r[0]);
  return cp => {
    let lo = 0, hi = firsts.length - 1, at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (firsts[mid] <= cp) { at = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return at >= 0 && cp <= ranges[at][1];
  };
}

const caseIgnorable = member(FINAL_SIGMA_RANGES.caseIgnorable);
const cased = member(FINAL_SIGMA_RANGES.cased);
const SIGMA = "Σ";

/**
 * Whether the Σ at `cps[i]` is word-final, as CPython decides it: a cased
 * code point before it, skipping case-ignorable ones, and none after it,
 * skipping them again.
 */
function finalSigma(cps, i) {
  let j = i - 1;
  while (j >= 0 && caseIgnorable(cps[j].codePointAt(0))) j--;
  if (j < 0 || !cased(cps[j].codePointAt(0))) return false;
  j = i + 1;
  while (j < cps.length && caseIgnorable(cps[j].codePointAt(0))) j++;
  return j === cps.length || !cased(cps[j].codePointAt(0));
}

export function pyLower(s) {
  if (LOWER_OVERRIDES.size) {
    let r = "";
    for (const ch of s) r += LOWER_OVERRIDES.has(ch) ? LOWER_OVERRIDES.get(ch) : ch.toLowerCase();
    return r;
  }
  if (!s.includes(SIGMA)) return s.toLowerCase();
  const cps = Array.from(s);
  let out = "", run = "";
  cps.forEach((ch, i) => {
    if (ch !== SIGMA) run += ch;
    else {
      out += run.toLowerCase() + (finalSigma(cps, i) ? "ς" : "σ");
      run = "";
    }
  });
  return out + run.toLowerCase();
}

export function normalize(text, language) {
  let out = text.normalize("NFC");
  if (LOWERCASE_LANGUAGES.has(language)) out = pyLower(out);
  if (RECOMPOSED_LANGUAGES.has(language)) out = out.normalize("NFC");
  return out.replace(/ {2,}/g, " ");
}
