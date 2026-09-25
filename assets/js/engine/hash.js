// Answer checking without storing answers: SHA-256 of two normalizations.
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

/** "solved" | "folded" | "wrong" for a guess against {hash, fold}. */
export async function checkAnswer(guess, { hash, fold }) {
  if (await sha256Hex(answerNorm(guess)) === hash) return "solved";
  if (await sha256Hex(answerFold(guess)) === fold) return "folded";
  return "wrong";
}
