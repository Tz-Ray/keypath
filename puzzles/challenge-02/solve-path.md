# Challenge #2 — intended solve path (SPOILERS)

> A copy of `puzzles/challenge-02/solve-path.md` from KeyPath 2.0 (tag `v2.0`). The commands it
> names (`keypath lookup`, `keypath layouts`, …) and the paths under
> `tables/`, `docs/`, `scripts/` and `tests/` belong to KeyPath's Python
> implementation, which is not published. The table provenance it
> cites is [`docs/VERSIONS.md`](../../docs/VERSIONS.md) here, and the
> [KeyPath page](https://tz-ray.github.io/keypath/) does the same lookups in your browser.

Ciphertext: `elpingu4inocantalacancio1n54ji3u.3` · hint: *"dos
teclados, un mensaje"* — two keyboards, one message.

## Step 1 — Recognition (and the trap)

The stream starts word-like: `elpingu4ino…` reads almost like Spanish
with digits stuck in. A solver who knows challenge #1 might try Bopomofo
first — and hit the trap: under `zh_daqian`, `u4` is ㄧˋ (yì) and `o1`
is ㄟㄅ, which produces phonetic garbage mid-"word". The digits are
**layout-local**: the hint says *two keyboards*.

On the macOS-style Spanish accent picker (`es_accent`, public table
`tables/es_accent.tsv`), a digit selects an accent variant of the letter
before it: `u4` = ü, `o1` = ó. Applying that:

```
elpingu4inocantalacancio1n  →  el pingüino canta la canción…
```

…which is readable Spanish once spaces are restored ("the penguin sings
the song…"). But the tail `54ji3u.3` refuses: `5`, `.` and a digit
*after nothing alphabetic* (`54`) are illegal under `es_accent`. A
second keyboard is in play.

## Step 2 — The second layout

`54ji3u.3` is classic Dàqiān Bopomofo (challenge #1's layout):

| unit | keys | bopomofo | pinyin |
|------|------|----------|--------|
| `54` | ㄓ + ˋ | ㄓˋ | zhì |
| `ji3` | ㄨ + ㄛ + ˇ | ㄨㄛˇ | wǒ |
| `u.3` | ㄧ + ㄡ + ˇ | ㄧㄡˇ | yǒu |

Note the polysemy in full daylight: the `4` in `u4` (= ü, twenty
characters back) was an accent selector; this `4` is a falling-tone
mark. And the `3` that never once appeared in the Spanish half
terminates two syllables here.

## Step 3 — Candidates

From `tables/zh_chars.tsv`, in the canonical frequency order of §5.1:
ㄓˋ → 134 candidates (製/至/知/制/治/…), ㄨㄛˇ → 4 (我/捰/婐/婑),
ㄧㄡˇ → 30 (有/友/酉/…). Raw homophone keyspace ≈ 10^4.2 — too much to
brute, small enough to reason.

## Step 4 — Coherence, across a translation

No three-character Chinese phrase reads naturally here — that is the
point. The Spanish half is missing its ending: *"…la canción ___ ___
___"*. Trying the frequent candidates as **glossed words** (CC-CEDICT
is public) and carrying each gloss back into Spanish (FreeDict, the
`es→en` hop run backwards):

| char | CC-CEDICT gloss | the gloss that fits | Spanish |
|------|-----------------|---------------------|---------|
| 至 | to arrive/most/**to**/until | *to* | *a* / **para** |
| 我 | I/me/**my** | *my* | **mi** |
| 友 | **friend** | *friend* | **amigo** / amiga |

→ *para mi amigo*. The message resolves in the **source language**:

> el pingüino canta la canción para mi amigo

("the penguin sings the song for my friend.")

## Step 5 — Confirm

Grammatical Spanish, hint satisfied (two keyboards, one message), every
ciphertext character consumed. Solved.

## Fairness checklist (docs/03 §5), answered

1. **Recognizable keystroke layer?** Yes — both halves are valid,
   well-formed sequences for their layouts (the Spanish half even reads
   half-decoded), and the es half *fails visibly* under the wrong
   layout, which is a nudge, not a dead end.
2. **Does one coherent decoding stand out?** Yes — the Spanish sentence
   completes itself; the zh candidates that fit sit at ranks 2/1/2 of
   their readings' frequency-ordered candidate lists, well inside any
   solver's first handful of tries.
3. **Public/derivable tables?** Yes — `tables/es_accent.tsv`,
   `tables/zh_daqian.tsv`, `tables/zh_chars.tsv`, `tables/zh_en_cedict.tsv`,
   all pinned in `tables/VERSIONS.md` and re-derivable via `scripts/`.
4. **Difficulty tuned?** Yes — meant as the step up from #1: cold-ish
   recognition (text hint only), two layouts with deliberate digit
   polysemy, and a translation layer; still a single short sentence with
   leakage 0.024 (1 boundary space in a 42-char message).
