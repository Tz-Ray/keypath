# Challenge #7 — intended solve path (SPOILERS)

> **Spoilers.** This is the setter's write-up of how to crack the puzzle
> (from KeyPath 3.0.1, tag `v3.0.1`, as set for KeyPath 2.6); it may also
> give away steps of other puzzles. The public site it names is the
> [KeyPath page](https://tz-ray.github.io/keypath/): its keyboard pictures, its
> [workbench](https://tz-ray.github.io/keypath/#workbench) and its playground.
> KeyPath's Python implementation, whose `$ keypath` output it quotes in
> full, is not published; references such as "docs/08 §4" are to its
> unpublished design documents, and paths such as `tables/…` and `tests/…`
> to its unpublished repository. The tables are built from the public
> sources pinned in [`docs/VERSIONS.md`](../../docs/VERSIONS.md).

Ciphertext: `hoooomboiianmtvirhbndoiargrmbc` · hint: *"日月金木水火土"* ·
framing: "Seven characters. Every letter on this keyboard stands for a
shape."

Every step uses a tool of the public site: a keyboard picture, the
workbench (Look up keys and Type a guess, on the keyboard you name) or
the playground. Under each step, a `$ keypath` block asks the
command-line tools the same question and shows their real output.

## Step 1 — Recognition

The stream is 30 keys, all lowercase letters: no digit, no punctuation,
and no `z`. Cangjie and Quick are the only keyboards of the pack whose
alphabet stops at `y` (docs/08 §4, fingerprints). The Vietnamese
keyboards list a `z` but never type one, since no Vietnamese syllable
holds it, so the missing `z` does not settle the keyboard; the card
does: 日月金木水火土 are the legends of the keys A to G on the Cangjie
keyboard, as the site's Cangjie keyboard picture shows. Quick has the
same legends, but it types a character with one or two letters, so
seven characters would take at most 14 keys, not 30. It is Cangjie.

```
$ keypath layouts zh_cangjie
zh_cangjie: Cangjie codes as in Unihan kCangjie (Unicode 18.0.0)
  surfaces: (zh, zh_cangjie)
  alphabet: a-y
  A日 B月 C金 D木 E水 F火 G土 H竹 I戈 J十 K大 L中 M一 N弓 O人 P心 Q手 R口 S尸 T廿 U山 V女 W田 X難 Y卜
  q 手  w 田  e 水  r 口  t 廿  y 卜  u 山  i 戈  o 人  p 心
   a 日  s 尸  d 木  f 火  g 土  h 竹  j 十  k 大  l 中
             x 難  c 金  v 女  b 月  n 弓  m 一
  x 難 is the difficult-character key (no character's code is x alone); z is unused
  unit: one character's code, 1-5 letters a-y, typed as written (zh_cangjie.tsv: 17,758 codes for 18,687 characters)
  a code's candidates are its characters in table order; the key's index picks one
```

## Step 2 — Layout inversion

Each key is a radical, a piece of a character's shape. Read the
stream's keys off the picture: `h` 竹, `o` 人, `m` 一, `b` 月, `i` 戈,
`a` 日, `n` 弓, `t` 廿, `v` 女, `r` 口, `d` 木, `g` 土 and `c` 金.
`hoooo` reads 竹人人人人 and `oiar` 人戈日口. A Cangjie radical need not
be a part you can see: 竹 often stands for a short slanting stroke, such
as the one at the top of 彳.

## Step 3 — The cut

A Cangjie code is one to five letters, and the card says seven
characters, so seven codes use all 30 keys. On the workbench (keyboard:
Cangjie), take the longest piece that reads each time:

```
$ keypath lookup --layout zh_cangjie hoooo mboii anmt vir hbnd oiar grmbc
hoooo · (zh, zh_cangjie) · well-formed: yes
  reading: hoooo / 竹人人人人
  candidates: 1
  0:從

mboii · (zh, zh_cangjie) · well-formed: yes
  reading: mboii / 一月人戈戈
  candidates: 1
  0:零

anmt · (zh, zh_cangjie) · well-formed: yes
  reading: anmt / 日弓一廿
  candidates: 1
  0:開

vir · (zh, zh_cangjie) · well-formed: yes
  reading: vir / 女戈口
  candidates: 1
  0:始

hbnd · (zh, zh_cangjie) · well-formed: yes
  reading: hbnd / 竹月弓木
  candidates: 1
  0:學

oiar · (zh, zh_cangjie) · well-formed: yes
  reading: oiar / 人戈日口
  candidates: 1
  0:倉

grmbc · (zh, zh_cangjie) · well-formed: yes
  reading: grmbc / 土口一月金
  candidates: 1
  0:頡
```

Each code has one candidate: 從 零 開 始 學 倉 頡. The shorter pieces are
decoys. `hoo`, `hooo`, `mb`, `mbo` and `mboi` are not codes at all.
`h` (竹), `ho` (八 or 彳) and `oo` (从) are codes, but each leaves more
than seven units:

```
$ keypath lookup --layout zh_cangjie hoo hooo mb mbo mboi h ho oo
hoo · (zh, zh_cangjie) · well-formed: no
  violated rule: unit 'hoo' is not a code on layout zh_cangjie: no character of zh_cangjie.tsv has it

hooo · (zh, zh_cangjie) · well-formed: no
  violated rule: unit 'hooo' is not a code on layout zh_cangjie: no character of zh_cangjie.tsv has it

mb · (zh, zh_cangjie) · well-formed: no
  violated rule: unit 'mb' is not a code on layout zh_cangjie: no character of zh_cangjie.tsv has it

mbo · (zh, zh_cangjie) · well-formed: no
  violated rule: unit 'mbo' is not a code on layout zh_cangjie: no character of zh_cangjie.tsv has it

mboi · (zh, zh_cangjie) · well-formed: no
  violated rule: unit 'mboi' is not a code on layout zh_cangjie: no character of zh_cangjie.tsv has it

h · (zh, zh_cangjie) · well-formed: yes
  reading: h / 竹
  candidates: 1
  0:竹

ho · (zh, zh_cangjie) · well-formed: yes
  reading: ho / 竹人
  candidates: 2
  0:八 1:彳

oo · (zh, zh_cangjie) · well-formed: yes
  reading: oo / 人人
  candidates: 1
  0:从
```

The stream has 671,232 cuts into Cangjie codes. Exactly one of them has
seven units (9 have eight, 51 nine and 225 ten), and taking the longest
code each time finds it.

## Step 4 — A crib

The workbench's Type a guess answers the other way round. 倉頡 types
`oiar grmbc`, the last nine keys, so the message ends in the keyboard's
own name:

```
$ keypath type --layout zh_cangjie 倉頡
(zh, zh_cangjie)
倉 oiar 0/1
頡 grmbc 0/1
```

## Step 5 — Coherence

從零開始學倉頡. CC-CEDICT glosses 從零開始 as "to start from scratch",
and 倉頡 as "Cang Jie, legendary scribe of the Yellow Emperor and
inventor of Chinese writing" and "(computing) Cangjie input method".
The setter's translation: "learning Cangjie from scratch", literally
starting from zero.

## Step 6 — Confirmation

On the playground (Chinese source, the Cangjie chip), the answer types
to the same 30 keys:

```
$ keypath encode --source-lang zh --layout zh_cangjie --out typed.json 從零開始學倉頡
hoooomboiianmtvirhbndoiargrmbc
leakage: 0.000
```

With the author's key, `analyze` agrees: seven units, each with a
single candidate.

```
$ keypath analyze --key key.json --ciphertext-file ciphertext.txt
keypath 1.1 · source language: zh
segment 0: zh/zh_cangjie selector=keyed words=5 units=7 literal_chars=0 translated=0
  hint: 日月金木水火土
  route: shape:zh_cangjie -> keystroke:zh_cangjie
  candidate set sizes: [1, 1, 1, 1, 1, 1, 1] (forced: 7, keyspace ~10^0.0)
total homophone keyspace ~10^0.0
leaked chars (tier 2/3): 0
leakage: 0.000 (0/7 chars)
```

## The aha

The Latin letters are pictures. `hoooo` spells 從 as Cangjie sees it:
one slanting stroke (竹) and four 人 shapes. The last nine keys spell
the keyboard's own name, 倉頡. The message
says what the solver is doing: learning Cangjie from zero.

No stretch here reads two ways, since every code has one candidate. A
decoy only: `oo` is 从, the simplified form of 從, on Cangjie.
