# Challenge #9 — intended solve path (SPOILERS)

> **Spoilers.** This is the setter's write-up of how to crack the puzzle
> (from KeyPath 2.6, tag `v2.6`); it may also give away steps of other
> puzzles. The public site it names is the [KeyPath page](https://tz-ray.github.io/keypath/): its
> keyboard pictures, its [workbench](https://tz-ray.github.io/keypath/#workbench) and its playground.
> KeyPath's Python implementation, whose `$ keypath` output it quotes in
> full, is not published; references such as "docs/08 §4" are to its
> unpublished design documents, and paths such as `tables/…` and `tests/…`
> to its unpublished repository. The tables are built from the public
> sources pinned in [`docs/VERSIONS.md`](../../docs/VERSIONS.md).

Ciphertext: `gey3f94dr1mzx03x03x03x03g94w94u;6` · hint: *"The keyboard of #1
has a twin in Taipei. One passed the message to the other, once."* ·
framing: "The line comes from a hillside town near Taipei, and each
keyboard typed one of its doubled words."

Every step uses a tool of the public site: a keyboard picture, the
workbench (Look up keys and Type a guess, on the keyboard you name) or
the playground. Under each step, a `$ keypath` block asks the
command-line tools the same question and shows their real output.

The ciphertext holds `;`, which a shell would read as the end of a
command, so the blocks below pass it through `--ciphertext-file` with a
quoted heredoc, and quote the chunk `'u;6'` (docs/10 §3.3).

## Step 1 — Recognition

Digits that close units the way tone keys do (`3`, `4`, `1` and the
final `6`), other digits inside units (`9`, `0`) and a `;` mark a
Bopomofo stream. The card points at #1's keyboard, Dàqiān, and at its
twin in Taipei, ETen (倚天), and says the message changed keyboards
once. The site's two keyboard pictures show the same Bopomofo symbols
on other keys:

```
$ keypath layouts zh_daqian zh_eten
1  ㄅ  ˙ *
2  ㄉ  ˊ *
3  ˇ   ˇ
4  ˋ   ˋ
5  ㄓ  · *
6  ˊ   · *
7  ˙   ㄑ *
8  ㄚ  ㄢ *
9  ㄞ  ㄣ *
0  ㄢ  ㄤ *
-  ㄦ  ㄥ *
=  ·   ㄦ *
q  ㄆ  ㄟ *
w  ㄊ  ㄝ *
e  ㄍ  ㄧ *
r  ㄐ  ㄜ *
t  ㄔ  ㄊ *
y  ㄗ  ㄡ *
u  ㄧ  ㄩ *
i  ㄛ  ㄞ *
o  ㄟ  ㄛ *
p  ㄣ  ㄆ *
a  ㄇ  ㄚ *
s  ㄋ  ㄙ *
d  ㄎ  ㄉ *
f  ㄑ  ㄈ *
g  ㄕ  ㄐ *
h  ㄘ  ㄏ *
j  ㄨ  ㄖ *
k  ㄜ  ㄎ *
l  ㄠ  ㄌ *
;  ㄤ  ㄗ *
'  ·   ㄘ *
z  ㄈ  ㄠ *
x  ㄌ  ㄨ *
c  ㄏ  ㄒ *
v  ㄒ  ㄍ *
b  ㄖ  ㄅ *
n  ㄙ  ㄋ *
m  ㄩ  ㄇ *
,  ㄝ  ㄓ *
.  ㄡ  ㄔ *
/  ㄥ  ㄕ *
41 of 43 keys differ
```

ETen has no `5` and no `6`, so the final `6` is Dàqiān's (the tone ˊ).

## Step 2 — Dàqiān reads the end, not the start

On the workbench (keyboard: Bopomofo (Taiwan), which is Dàqiān), the
last three units read ㄕㄞˋ ㄊㄞˋ ㄧㄤˊ, and 曬 太 陽 are among their
first candidates. The card asks for the standard Traditional forms, so
the first is 曬 (rank 1), not its variant 晒 (rank 2). CC-CEDICT glosses 曬太陽 as "to be in the sun
(getting warm or sunbathing etc)". The start does not read: `gey3`,
`mz`, `f94` and `dr1` are no syllables there.

```
$ keypath lookup --layout zh_daqian --top 4 g94 w94 'u;6' gey3 mz f94 dr1
g94 · (zh, zh_daqian) · well-formed: yes
  reading: ㄕㄞˋ / shai4
  candidates: 5
  0:殺 1:曬 2:晒 3:鎩  (+1 more)

w94 · (zh, zh_daqian) · well-formed: yes
  reading: ㄊㄞˋ / tai4
  candidates: 20
  0:大 1:太 2:態 3:泰  (+16 more)

u;6 · (zh, zh_daqian) · well-formed: yes
  reading: ㄧㄤˊ / yang2
  candidates: 41
  0:陽 1:洋 2:揚 3:羊  (+37 more)

gey3 · (zh, zh_daqian) · well-formed: no
  violated rule: unit 'gey3' maps to 'ㄕㄍㄗˇ', which is not a syllable in the reading table

mz · (zh, zh_daqian) · well-formed: no
  violated rule: unit 'mz' maps to 'ㄩㄈ', which is not a syllable in the reading table

f94 · (zh, zh_daqian) · well-formed: no
  violated rule: unit 'f94' maps to 'ㄑㄞˋ', which is not a syllable in the reading table

dr1 · (zh, zh_daqian) · well-formed: no
  violated rule: unit 'dr1' maps to 'ㄎㄐㄅ', which is not a syllable in the reading table
```

The first twelve keys, `gey3f94dr1mz`, have no Dàqiān cut into units
that each type a character (only a bare phonetic letter such as ㄈ for
`z`, as in #6).

## Step 3 — ETen reads the start, not the end

On the workbench with the keyboard Bopomofo ETen, the first four units
read ㄐㄧㄡˇ ㄈㄣˋ ㄉㄜ˙ ㄇㄠ: 九份的貓. The hillside town is Jiufen, which
CC-CEDICT glosses as "Jiufen (or Jioufen or Chiufen), mountainside town
in north Taiwan, …", so the second character is 份 (rank 1), not the
rank-0 分, and ㄇㄠ is 貓 (rank 0), not its variant 猫 (rank 2). ETen
cannot read the tail: `g94` is ㄐㄣˋ and `w94` is ㄝㄣˋ, no syllables,
and `u;6` holds a `6`, which ETen never types.

```
$ keypath lookup --layout zh_eten --top 4 gey3 f94 dr1 mz g94 w94 'u;6'
gey3 · (zh, zh_eten) · well-formed: yes
  reading: ㄐㄧㄡˇ / jiu3
  candidates: 33
  0:九 1:久 2:酒 3:糾  (+29 more)

f94 · (zh, zh_eten) · well-formed: yes
  reading: ㄈㄣˋ / fen4
  candidates: 31
  0:分 1:份 2:奮 3:憤  (+27 more)

dr1 · (zh, zh_eten) · well-formed: yes
  reading: ㄉㄜ˙ / de5
  candidates: 10
  0:地 1:的 2:得 3:底  (+6 more)

mz · (zh, zh_eten) · well-formed: yes
  reading: ㄇㄠ / mao1
  candidates: 3
  0:貓 1:摸 2:猫

g94 · (zh, zh_eten) · well-formed: no
  violated rule: unit 'g94' maps to 'ㄐㄣˋ', which is not a syllable in the reading table

w94 · (zh, zh_eten) · well-formed: no
  violated rule: unit 'w94' maps to 'ㄝㄣˋ', which is not a syllable in the reading table

u;6 · (zh, zh_eten) · well-formed: no
  violated rule: unit 'u;6' contains '6', which is outside the zh_eten alphabet
```

So the message starts on ETen and ends on Dàqiān, and the one handover
lies between `mz` and `g94`.

## Step 4 — The run of four x03

Between them, `x03` comes four times, and it reads on both keyboards:
ㄨㄤˇ on ETen (網 往 …) and ㄌㄢˇ on Dàqiān (覽 纜 攬 懶 …). A handover
could also fall inside one `x03`: ETen reads `x` alone as ㄨ, and Dàqiān
reads `03` as ㄢˇ.

```
$ keypath lookup --layout zh_eten --top 4 x03 x
x03 · (zh, zh_eten) · well-formed: yes
  reading: ㄨㄤˇ / wang3
  candidates: 22
  0:網 1:往 2:惘 3:枉  (+18 more)

x · (zh, zh_eten) · well-formed: yes
  reading: ㄨ / wu1
  candidates: 41
  0:於 1:屋 2:喔 3:污  (+37 more)
```

```
$ keypath lookup --layout zh_daqian --top 4 x03 03
x03 · (zh, zh_daqian) · well-formed: yes
  reading: ㄌㄢˇ / lan3
  candidates: 25
  0:覽 1:纜 2:攬 3:懶  (+21 more)

03 · (zh, zh_daqian) · well-formed: yes
  reading: ㄢˇ / an3
  candidates: 13
  0:俺 1:黤 2:匼 3:晻  (+9 more)
```

One ETen-to-Dàqiān handover can fall in nine places, all in the run or
at its edges: before any of the four units, after the last, or inside
one of them. Put it after the first k units:

- k = 2 reads as words: 往往 on ETen (CC-CEDICT: "usually", "in many
  cases", "more often than not"), then 懶懶 on Dàqiān. CC-CEDICT has 懶
  "lazy" and no row for 懶懶; "lazily" is the setter's gloss.
- k = 1 and k = 3 read as no words.
- k = 0 and k = 4 put the handover at the edge of the run and double a
  doubled word: 懶懶懶懶, 往往往往. One keyboard then types the whole run
  and the other none of it, so the card's "each keyboard typed one of
  its doubled words" excludes both.
- A handover inside an `x03` gives the other four places, such as
  九份的貓於俺懶懶懶曬太陽, and none of them reads as words.

A Dàqiān-to-ETen handover never parses. The reverse order, 懶懶 then
往往, types the same 33 keys, but it needs three handovers (ETen,
Dàqiān, ETen, Dàqiān), and the card's "once" excludes it; 往往, a word
of frequency, also goes before the manner word 懶懶.

## Step 5 — Coherence

九份的貓往往懶懶曬太陽. The setter's translation: "Jiufen's cats often
laze in the sun."

## Step 6 — Confirmation

On the playground (Chinese source), the first half on the ETen chip and
the second on the Dàqiān chip type the two halves:

```
$ keypath encode --source-lang zh --layout zh_eten --out head.json 九份的貓往往
gey3f94dr1mzx03x03
leakage: 0.000
```

```
$ keypath encode --source-lang zh --layout zh_daqian --out tail.json 懶懶曬太陽
x03x03g94w94u;6
leakage: 0.000
```

With the author's key, `analyze` agrees: six units on ETen, then five
on Dàqiān.

```
$ keypath analyze --key key.json --ciphertext-file - <<'EOF'
gey3f94dr1mzx03x03x03x03g94w94u;6
EOF
keypath 1.1 · source language: zh
segment 0: zh/zh_eten selector=keyed words=4 units=6 literal_chars=0 translated=0
  hint: The keyboard of #1 has a twin in Taipei. One passed the message to the other, once.
  route: homophone:zh -> keystroke:zh_eten
  candidate set sizes: [33, 31, 10, 3, 22, 22] (forced: 0, keyspace ~10^7.17)
segment 1: zh/zh_daqian selector=keyed words=2 units=5 literal_chars=0 translated=0
  route: homophone:zh -> keystroke:zh_daqian
  candidate set sizes: [25, 25, 5, 20, 41] (forced: 0, keyspace ~10^6.41)
total homophone keyspace ~10^13.58
leaked chars (tier 2/3): 0
leakage: 0.000 (0/11 chars)
```

## The aha

The same keys, `x03`, appear four times in a row. The first two are
ETen's 往往, "often"; the last two are Dàqiān's 懶懶, "lazily". The one
handover falls in the middle of identical keystrokes: twin keyboards,
the same keys, different words.

Both readings, recorded:

- `x03x03` (and the whole run) is well-formed on `zh_eten`, ㄨㄤˇ ㄨㄤˇ,
  where 往往 is 往 (rank 1 of 22) twice, and on `zh_daqian`, ㄌㄢˇ ㄌㄢˇ,
  where 懶懶 is 懶 (rank 3 of 25) twice. The first pair makes sense only
  on ETen and the second only on Dàqiān.
- The neighbours settle it: `gey3` and `mz` fail on Dàqiān, `g94`,
  `w94` and `u;6` fail on ETen, the card allows one handover and has
  each keyboard type one doubled word, and neither 往往往往 nor 懶懶懶懶
  is a sentence.
