// Answer checking by SHA-256 digests of two normalizations: the checker
// needs no answer text, so the page never loads an answer to check a guess.
// The answers are not secret: each challenge's is published as a labelled
// spoiler (puzzles/challenge-NN/plaintext.txt), and a short answer can be
// found from its digest by trying guesses.
//   norm(s) = NFC, lowercase, keep only letters, marks and numbers
//   fold(s) = norm(s), NFD, drop nonspacing marks, NFC
// tools/build_data.py computes the same with Python's unicodedata.
import { pyLower } from "./normalize.js";

const KEEP = /[\p{L}\p{M}\p{N}]/u;
const MN = /\p{Mn}/gu;

export function answerNorm(s) {
  let out = "";
  for (const ch of pyLower(s.normalize("NFC"))) if (KEEP.test(ch)) out += ch;
  return out;
}

export const answerFold = s => answerNorm(s).normalize("NFD").replace(MN, "").normalize("NFC");

export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * "solved" | "folded" | "wrong" for a guess against {hash, fold} and a
 * challenge's accepted alternates {alts, altFolds} (other forms of the same
 * answer: simplified characters, digits for a number word), hashed alike.
 */
export async function checkAnswer(guess, { hash, fold, alts = [], altFolds = [] }) {
  const norm = await sha256Hex(answerNorm(guess));
  if (norm === hash || alts.includes(norm)) return "solved";
  const folded = await sha256Hex(answerFold(guess));
  if (folded === fold || altFolds.includes(folded)) return "folded";
  return "wrong";
}
