# Challenge #8 — intended solve path (SPOILERS)

> **Spoilers.** This is the setter's write-up of how to crack the puzzle
> (from KeyPath 3.0, tag `v3.0`, as set for KeyPath 2.6); it may also
> give away steps of other puzzles. The public site it names is the
> [KeyPath page](https://tz-ray.github.io/keypath/): its keyboard pictures, its
> [workbench](https://tz-ray.github.io/keypath/#workbench) and its playground.
> KeyPath's Python implementation, whose `$ keypath` output it quotes in
> full, is not published; references such as "docs/08 §4" are to its
> unpublished design documents, and paths such as `tables/…` and `tests/…`
> to its unpublished repository. The tables are built from the public
> sources pinned in [`docs/VERSIONS.md`](../../docs/VERSIONS.md).

Ciphertext: `moojtnguwowfibajnhoritooiinthelongruncosnghixalafgif` · hint:
*"Typed in Hanoi with Telex: a question, and a borrowed phrase."* ·
framing: "One Vietnamese sentence, but not every syllable in it is
Vietnamese. Keep the borrowed phrase as it was typed: it is part of the
answer."

Every step uses a tool of the public site: a keyboard picture, the
workbench (Look up keys and Type a guess, on the keyboard you name) or
the playground. Under each step, a `$ keypath` block asks the
command-line tools the same question and shows their real output.

## Step 1 — Recognition

The stream is 52 keys, all letters `a` to `z`, with doubled vowels
(`oo`), `uw` and `ow`, and the tone letters `s f r x j` straight after
vowels: `moojt`, `wowf`, `baj`, `hor`, `cos`, `hix`, `laf`, `gif`.
That is Telex, which the card names. The site's Telex keyboard picture
lists what each modifier and tone key does:

```
$ keypath layouts vi_telex
vi_telex: Vietnamese Telex (letters that are marks and tones)
  surfaces: (vi, vi_telex)
  alphabet: a-z
  every key types its own letter; a modifier or tone key right after a letter marks it (vi_telex.tsv):
    modifiers:  aa â        aw ă        ee ê        oo ô        ow ơ        uw ư        dd đ
    tones:      s sắc       f huyền     r hỏi       x ngã       j nặng
  unit: one syllable of G (vi_syllables.tsv: 111,003 syllables), each letter typed as its base, then its modifier key, then the tone key if it carries the tone
  the keys record where the mark sits: hòa = hofa, hoà = hoaf; one unit per word, no homophone layer
  e.g. việt = vieejt · người = nguwowfi · đường = dduwowfng · quốc = quoosc · tiếng = tieesng
```

## Step 2 — Cut and read

On the workbench (keyboard: Vietnamese Telex), every syllable has one
reading, so the work is the cut. Read one syllable at a time:

```
$ keypath lookup --layout vi_telex moojt nguwowfi bajn hori tooi in the long run cos nghixa laf gif
moojt · (vi, vi_telex) · well-formed: yes
  reading: một
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:một

nguwowfi · (vi, vi_telex) · well-formed: yes
  reading: người
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:người

bajn · (vi, vi_telex) · well-formed: yes
  reading: bạn
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:bạn

hori · (vi, vi_telex) · well-formed: yes
  reading: hỏi
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:hỏi

tooi · (vi, vi_telex) · well-formed: yes
  reading: tôi
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:tôi

in · (vi, vi_telex) · well-formed: yes
  reading: in
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:in

the · (vi, vi_telex) · well-formed: yes
  reading: the
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:the

long · (vi, vi_telex) · well-formed: yes
  reading: long
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:long

run · (vi, vi_telex) · well-formed: yes
  reading: run
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:run

cos · (vi, vi_telex) · well-formed: yes
  reading: có
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:có

nghixa · (vi, vi_telex) · well-formed: yes
  reading: nghĩa
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:nghĩa

laf · (vi, vi_telex) · well-formed: yes
  reading: là
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:là

gif · (vi, vi_telex) · well-formed: yes
  reading: gì
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:gì
```

The habit #7 taught, taking the longest piece that reads, misleads
twice here. It cuts `bajnh ori` (bạnh ỏi) and `cosng hixa` (cóng hĩa),
because `bajnho` and `cosngh` are not syllables:

```
$ keypath lookup --layout vi_telex baj nhori bajnh ori cosn ghixa cosng hixa bajnho cosngh
baj · (vi, vi_telex) · well-formed: yes
  reading: bạ
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:bạ

nhori · (vi, vi_telex) · well-formed: yes
  reading: nhỏi
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:nhỏi

bajnh · (vi, vi_telex) · well-formed: yes
  reading: bạnh
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:bạnh

ori · (vi, vi_telex) · well-formed: yes
  reading: ỏi
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:ỏi

cosn · (vi, vi_telex) · well-formed: yes
  reading: cón
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:cón

ghixa · (vi, vi_telex) · well-formed: yes
  reading: ghĩa
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:ghĩa

cosng · (vi, vi_telex) · well-formed: yes
  reading: cóng
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:cóng

hixa · (vi, vi_telex) · well-formed: yes
  reading: hĩa
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:hĩa

bajnho · (vi, vi_telex) · well-formed: no
  violated rule: D(bajnho) = bạnho is not a syllable of G; canonical Telex types a vowel's tone key right after that vowel and its modifier key (e.g. việt = vieejt)

cosngh · (vi, vi_telex) · well-formed: no
  violated rule: D(cosngh) = cóngh is not a syllable of G; canonical Telex types a vowel's tone key right after that vowel and its modifier key (e.g. việt = vieejt)
```

The stream has 2,592 Telex cuts. The 9 with the fewest syllables, 13,
come from two forks of three: `bajn hori` (bạn hỏi), `baj nhori` (bạ
nhỏi) or `bajnh ori` (bạnh ỏi); and `cos nghixa` (có nghĩa), `cosn
ghixa` (cón ghĩa) or `cosng hixa` (cóng hĩa). Only bạn hỏi … có nghĩa
reads as Vietnamese words: bạn "friend", hỏi "to ask", nghĩa
"meaning". Those glosses are the solver's own dictionary; KeyPath's
tables hold no Vietnamese glosses.

## Step 3 — The seam, both ways

`in`, `the`, `long` and `run` carry no mark and no tone. Each is a
Telex syllable, and even a Vietnamese word (in "to print", the "silk
gauze", long "dragon", run "to tremble", in the setter's glosses), but
only English makes sense of the four: "in the long run". On the Plain
English keyboard the same keys read as the same letters.

The reverse traps sit right after it. `cos` looks like English ('cos,
"because") and `gif` like the image format, but the `s` after the `o`
of `cos` is a tone key (có), and `gif` is gì:

```
$ keypath lookup --layout en_identity in the long run cos gif
in · (en, en_identity) · well-formed: yes
  reading: in
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:in

the · (en, en_identity) · well-formed: yes
  reading: the
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:the

long · (en, en_identity) · well-formed: yes
  reading: long
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:long

run · (en, en_identity) · well-formed: yes
  reading: run
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:run

cos · (en, en_identity) · well-formed: yes
  reading: cos
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:cos

gif · (en, en_identity) · well-formed: yes
  reading: gif
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:gif
```

## Step 4 — Coherence

một người bạn hỏi tôi in the long run có nghĩa là gì. The setter's
translation: "A friend asked me what 'in the long run' means." The
answer keeps the idiom as it was typed, as the card says.

## Step 5 — Confirmation

On the playground (Tiếng Việt source, the Telex chip), the sentence
types to the same 52 keys at leakage 0:

```
$ keypath encode --source-lang vi --out typed.json "một người bạn hỏi tôi in the long run có nghĩa là gì"
moojtnguwowfibajnhoritooiinthelongruncosnghixalafgif
leakage: 0.000
```

With the author's key, `analyze` agrees: 13 units, each with a single
candidate.

```
$ keypath analyze --key key.json --ciphertext-file ciphertext.txt
keypath 1.1 · source language: vi
segment 0: vi/vi_telex selector=keyed words=13 units=13 literal_chars=0 translated=0
  hint: Typed in Hanoi with Telex: a question, and a borrowed phrase.
  route: keystroke:vi_telex
  candidate set sizes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] (forced: 13, keyspace ~10^0.0)
total homophone keyspace ~10^0.0
leaked chars (tier 2/3): 0
leakage: 0.000 (0/52 chars)
```

## The aha

The English idiom is not smuggled in as literals. It is typed as four
real Vietnamese syllables, so `inthelongrun` sits in plain sight at
leakage 0. Right after it, `cos` and `gif` look English and are
Vietnamese (có, gì). Telex hides tones in letters, and English hides in
toneless syllables.

Both readings, recorded:

- `inthelongrun` reads on `vi_telex` as the four toneless syllables in,
  the, long and run, and on `en_identity` as the four English words. It
  makes sense only as English.
- `cos` reads có on `vi_telex`, where "có nghĩa là gì" asks what it
  means, and "cos" on `en_identity`, which makes no sense there.
- `gif` reads gì on `vi_telex` and "gif" on `en_identity`; only gì fits.
