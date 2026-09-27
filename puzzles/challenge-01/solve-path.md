# Challenge #1 — intended solve path (SPOILERS)

> A copy of `puzzles/challenge-01/solve-path.md` from KeyPath 2.0 (tag `v2.0`). The commands it
> names (`keypath lookup`, `keypath layouts`, …) and the paths under
> `tables/`, `docs/`, `scripts/` and `tests/` belong to KeyPath's Python
> implementation, which is not published. The table provenance it
> cites is [`docs/VERSIONS.md`](../../docs/VERSIONS.md) here, and the
> [KeyPath page](https://tz-ray.github.io/keypath/) does the same lookups in your browser.

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

## Fairness checklist (docs/03 §5), answered

1. **Is the keystroke layer recognizable (valid IME sequences, not
   arbitrary)?** Yes — `su3cl3` is exactly what a Dàqiān typist's key
   log for 你好 looks like; both units are well-formed syllables in the
   public reading table, and the recurring tone key gives the stream
   visible structure.
2. **Does at least one coherent decoding exist and stand out enough to
   confirm a solve?** Yes — of the 128 candidate combinations, 你好 is
   the only common phrase; it is also the highest-frequency choice for
   both syllables (index 0 × index 0).
3. **Are the tables public/derivable, so a solver can reproduce them?**
   Yes — committed in `tables/` with provenance and checksums in
   `tables/VERSIONS.md`, re-derivable from pinned upstream
   (libchewing-data @ c44e81a) via `scripts/fetch_raw.py` +
   `scripts/build_tables.py`; the layout table is additionally
   documented in Apple's public Zhuyin input documentation.
4. **Is the difficulty tuned to the intended audience?** Yes — this is
   the introductory challenge: hint-gated recognition, a single
   two-syllable segment, single language/layout, tone-terminated units
   (no tone-1 boundary trap), and a target phrase any zh speaker (or
   any solver with a dictionary) confirms instantly. Harder knobs
   (mixed layouts, tone-1 boundaries, translation routing) are
   deliberately left for challenge #2.
