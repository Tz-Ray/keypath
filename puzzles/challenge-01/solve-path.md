# Challenge #1 — intended solve path (SPOILERS)

> **Spoilers.** This is the setter's write-up of how to crack the puzzle
> (from KeyPath 2.0, tag `v2.0`); it may also give away steps of later
> puzzles. The command output it quotes (`keypath lookup`, `keypath
> analyze`, …) comes from KeyPath's Python implementation, which is not
> published, and is shown in full. Where it calls a table public, it means
> the public dictionaries and layouts the tables are built from, pinned in
> [`docs/VERSIONS.md`](../../docs/VERSIONS.md); the keyboard layouts are also
> in the [KeyPath page](https://tz-ray.github.io/keypath/)'s keyboard panel and in
> [`data/layouts.json`](../../data/layouts.json). References such as
> "docs/06 §5.1" are to KeyPath's unpublished design documents.

Ciphertext: `su3cl3` · hint: "Type it like a local" + a Taiwan/keyboard
motif.

## Step 1 — Recognition

Six characters, letters with interior digits, un-wordlike but
structured: `su3cl3` — the digit `3` recurs at positions 3 and 6,
suggesting a terminator. The hint nudges toward Taiwan + keyboard →
**Bopomofo (Zhuyin) IME input, Dàqiān (Standard) layout**.

A wrong turn the puzzle anticipates: assuming "digits = tones 1–5"
(true on the HanYu Pinyin layout, false here). On Dàqiān, digits
`1 2 5 8 9 0` are *phonetic symbols* (ㄅㄉㄓㄚㄞㄢ) and `6 3 4 7` are the
tone marks for tones 2/3/4/5; tone 1 has no character at all. Hitting
that wall is itself the clue that the layout must be looked up — the
tables are public (`tables/zh_daqian.tsv`).

## Step 2 — Layout inversion (keystroke layer)

Reading key-by-key with the Dàqiān table:

| key | symbol |
|-----|--------|
| `s` | ㄋ |
| `u` | ㄧ |
| `3` | ˇ (tone 3 — terminates the syllable) |
| `c` | ㄏ |
| `l` | ㄠ |
| `3` | ˇ (tone 3) |

The tone marks terminate syllables, so even with no delimiters the
stream splits naturally: **ㄋㄧˇ (nǐ) + ㄏㄠˇ (hǎo)**.

## Step 3 — Candidate generation (homophone layer)

From the public reading table (`tables/zh_chars.tsv`):

- ㄋㄧˇ → 32 candidates: 你 妳 尼 擬 泥 禰 鑈 薾 …
- ㄏㄠˇ → 4 candidates: 好 郝 㝀 㚼

## Step 4 — Coherence resolution

32 × 4 = 128 combinations, but only one reads as a sensible message:
**你好 ("hello")**. The ambiguity collapses by context — the intended
"aha."

## Step 5 — Confirm

Clean, meaningful, self-confirming phrase → solve confirmed. (The
author's key in `key.json` selects homophone index 0 for both syllables
— 你 and 好 are each the most frequent character for their reading
under the canonical ordering, docs/06 §5.1.)
