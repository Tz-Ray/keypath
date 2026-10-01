# Challenge #10 — intended solve path (SPOILERS)

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

Ciphertext: `mmobmrptmmchdlnvihmlcbrpioyrtchkvrtw` · hint: *"易經. The second
line was typed in a hurry."* · framing: "Two lines, eight characters
each."

Every step uses a tool of the public site: a keyboard picture, the
workbench (Look up keys and Type a guess, on the keyboard you name) or
the playground. Under each step, a `$ keypath` block asks the
command-line tools the same question and shows their real output.

## Step 1 — Recognition

The stream is 36 keys, all lowercase letters: no digit, no punctuation,
and no `z`. As in #7, that fits the shape keyboards, Cangjie and Quick,
whose alphabets stop at `y` (the Vietnamese keyboards never type a `z`
either, but the card's 易經 points at Chinese). The card promises sixteen
characters in two lines. Quick types a character with one or two keys,
so sixteen characters on Quick alone would take at most 32 keys, not
36: at least the first line is Cangjie, the keyboard of #7. The card
also names the source: the 易經, the Book of Changes.

## Step 2 — Line one on Cangjie

On the workbench (keyboard: Cangjie), taking the longest code each
time, as #7 taught, cuts the whole stream into fifteen codes,
`mm obmr pt mm chd ln vihml cb rp io yr tc hk vr tw`, which read
二侗世二鉌鬥斷鈅叱庂占共夭如曲: one code short of the card's sixteen
characters, and nonsense. Here the longest piece misleads.

```
$ keypath lookup --layout zh_cangjie mm obmr pt chd ln vihml cb rp c
mm · (zh, zh_cangjie) · well-formed: yes
  reading: mm / 一一
  candidates: 1
  0:二

obmr · (zh, zh_cangjie) · well-formed: yes
  reading: obmr / 人月一口
  candidates: 1
  0:侗

pt · (zh, zh_cangjie) · well-formed: yes
  reading: pt / 心廿
  candidates: 1
  0:世

chd · (zh, zh_cangjie) · well-formed: yes
  reading: chd / 金竹木
  candidates: 1
  0:鉌

ln · (zh, zh_cangjie) · well-formed: yes
  reading: ln / 中弓
  candidates: 2
  0:鬥 1:刂

vihml · (zh, zh_cangjie) · well-formed: yes
  reading: vihml / 女戈竹一中
  candidates: 1
  0:斷

cb · (zh, zh_cangjie) · well-formed: yes
  reading: cb / 金月
  candidates: 1
  0:鈅

rp · (zh, zh_cangjie) · well-formed: yes
  reading: rp / 口心
  candidates: 2
  0:叱 1:吣

c · (zh, zh_cangjie) · well-formed: yes
  reading: c / 金
  candidates: 1
  0:金
```

The card's 易經 gives a reader who knows it the crib, and hint 1 says
the saying is about what two people of one mind can do: 二人同心，
其利斷金. Type a guess on the Cangjie keyboard, and the saying types
the first 21 keys, so line one ends there:

```
$ keypath type --layout zh_cangjie 二人同心其利斷金
(zh, zh_cangjie)
二 mm 0/1
人 o 0/1
同 bmr 0/1
心 p 0/1
其 tmmc 0/1
利 hdln 0/2
斷 vihml 0/1
金 c 0/1
```

Those 21 keys show how longest-first misleads. It cuts them into eight
codes, `mm obmr pt mm chd ln vihml c` = 二侗世二鉌鬥斷金: the right count,
but nonsense before its last two. The 21 keys have 23,660 cuts into
Cangjie codes, and 30 of them have eight units: 24 end in `vihml c` =
斷金, and 12 in `tmmc hdln vihml c` = 其利斷金, a foothold for a solver
who half remembers the saying. Exactly one of the 30 starts with
二人同心: `mm o bmr p tmmc hdln vihml c` = 二人同心其利斷金. Every pick
is the first of its list, and only `hdln` has two (利 剁):

```
$ keypath lookup --layout zh_cangjie o bmr p tmmc hdln
o · (zh, zh_cangjie) · well-formed: yes
  reading: o / 人
  candidates: 1
  0:人

bmr · (zh, zh_cangjie) · well-formed: yes
  reading: bmr / 月一口
  candidates: 1
  0:同

p · (zh, zh_cangjie) · well-formed: yes
  reading: p / 心
  candidates: 1
  0:心

tmmc · (zh, zh_cangjie) · well-formed: yes
  reading: tmmc / 廿一一金
  candidates: 1
  0:其

hdln · (zh, zh_cangjie) · well-formed: yes
  reading: hdln / 竹木中弓
  candidates: 2
  0:利 1:剁
```

## Step 3 — Line two, typed in a hurry

The last 15 keys, `brpioyrtchkvrtw`, read on Cangjie too, but as
nonsense: `br p io yr tc hk vr tw` = 冋心庂占共夭如曲, each the first of
its list.

```
$ keypath lookup --layout zh_cangjie br p io yr tc hk vr tw
br · (zh, zh_cangjie) · well-formed: yes
  reading: br / 月口
  candidates: 1
  0:冋

p · (zh, zh_cangjie) · well-formed: yes
  reading: p / 心
  candidates: 1
  0:心

io · (zh, zh_cangjie) · well-formed: yes
  reading: io / 戈人
  candidates: 1
  0:庂

yr · (zh, zh_cangjie) · well-formed: yes
  reading: yr / 卜口
  candidates: 1
  0:占

tc · (zh, zh_cangjie) · well-formed: yes
  reading: tc / 廿金
  candidates: 2
  0:共 1:菳

hk · (zh, zh_cangjie) · well-formed: yes
  reading: hk / 竹大
  candidates: 1
  0:夭

vr · (zh, zh_cangjie) · well-formed: yes
  reading: vr / 女口
  candidates: 1
  0:如

tw · (zh, zh_cangjie) · well-formed: yes
  reading: tw / 廿田
  candidates: 2
  0:曲 1:苗
```

Look again: `br p` is 同心 once more, with only the first and last
letters of `bmr`, and `tc` is 其's `tmmc` cut the same way. That is
Quick (速成), Cangjie typed in a hurry: a code of one or two letters
stays as it is, and a longer one keeps its first and last letters. The
site's two keyboard pictures carry the same radicals on the same keys:

```
$ keypath layouts zh_cangjie zh_quick
q  手  手
w  田  田
e  水  水
r  口  口
t  廿  廿
y  卜  卜
u  山  山
i  戈  戈
o  人  人
p  心  心
a  日  日
s  尸  尸
d  木  木
f  火  火
g  土  土
h  竹  竹
j  十  十
k  大  大
l  中  中
x  難  難
c  金  金
v  女  女
b  月  月
n  弓  弓
m  一  一
0 of 25 keys differ
```

On Type a guess with the keyboard Quick, line one's 同心 and 其 type
exactly those keys:

```
$ keypath type --layout zh_quick 同心其
(zh, zh_quick)
同 br 0/59
心 p 0/1
其 tc 0/47
```

## Step 4 — Line two on Quick

The couplet goes on (易經, 繫辭上): 二人同心，其利斷金；同心之言，
其臭如蘭. On the workbench (keyboard: Quick), at its default top 10:

```
$ keypath lookup --layout zh_quick br p io yr tc hk vr tw
br · (zh, zh_quick) · well-formed: yes
  reading: br / 月口
  candidates: 59
  0:同 1:貼 2:周 3:胎 4:賠 5:膽 6:瞎 7:瞻 8:眳 9:膳  (+49 more)

p · (zh, zh_quick) · well-formed: yes
  reading: p / 心
  candidates: 1
  0:心

io · (zh, zh_quick) · well-formed: yes
  reading: io / 戈人
  candidates: 20
  0:之 1:次 2:凝 3:庚 4:腐 5:欴 6:祧 7:庣 8:庾 9:祑  (+10 more)

yr · (zh, zh_quick) · well-formed: yes
  reading: yr / 卜口
  candidates: 91
  0:這 1:商 2:高 3:過 4:言 5:話 6:站 7:調 8:造 9:語  (+81 more)

tc · (zh, zh_quick) · well-formed: yes
  reading: tc / 廿金
  candidates: 47
  0:其 1:共 2:並 3:黃 4:典 5:兼 6:蘋 7:鑿 8:蓂 9:藬  (+37 more)

hk · (zh, zh_quick) · well-formed: yes
  reading: hk / 竹大
  candidates: 69
  0:微 1:徵 2:笑 3:啟 4:牧 5:奧 6:徹 7:臭 8:戾 9:徽  (+59 more)

vr · (zh, zh_quick) · well-formed: yes
  reading: vr / 女口
  candidates: 63
  0:如 1:結 2:給 3:紹 4:絡 5:始 6:姑 7:繕 8:綺 9:嚮  (+53 more)

tw · (zh, zh_quick) · well-formed: yes
  reading: tw / 廿田
  candidates: 26
  0:蘭 1:曲 2:苗 3:蕃 4:蓄 5:蕾 6:蔔 7:藩 8:薔 9:茜  (+16 more)
```

Taking the first of each list reads 同心之這其微如蘭. The known text
asks for 言 at rank 4 of 91 and 臭 at rank 7 of 69, both inside the ten
the workbench lists by default: the text confirms them, and nothing is
searched. The line's 15 keys have 987 cuts into Quick codes, 8 of them
with eight units, and the text fixes `br p io yr tc hk vr tw`.

## Step 5 — Coherence

二人同心其利斷金同心之言其臭如蘭. The setter's translation: "when two
are of one heart, their edge cuts through metal; words from one heart
are fragrant as orchids." Here 臭 is the classical xiù, "scent".
CC-CEDICT's first row for 臭 reads "stench/smelly/to smell
(bad)/repulsive/loathsome/terrible/bad/severely/ruthlessly/dud
(ammunition)" and its second "sense of smell/smell bad"; the known text
settles it. The couplet gave Chinese 金蘭, which CC-CEDICT glosses as
"profound friendship/sworn brotherhood".

## Step 6 — Confirmation

On the playground (Chinese source), line one on the Cangjie chip and
line two on the Quick chip type the two halves:

```
$ keypath encode --source-lang zh --layout zh_cangjie --out line1.json 二人同心其利斷金
mmobmrptmmchdlnvihmlc
leakage: 0.000
```

```
$ keypath encode --source-lang zh --layout zh_quick --out line2.json 同心之言其臭如蘭
brpioyrtchkvrtw
leakage: 0.000
```

With the author's key, `analyze` agrees: eight units on Cangjie, seven
of them forced, then eight on Quick.

```
$ keypath analyze --key key.json --ciphertext-file ciphertext.txt
keypath 1.1 · source language: zh
segment 0: zh/zh_cangjie selector=keyed words=5 units=8 literal_chars=0 translated=0
  hint: 易經. The second line was typed in a hurry.
  route: shape:zh_cangjie -> keystroke:zh_cangjie
  candidate set sizes: [1, 1, 1, 1, 1, 2, 1, 1] (forced: 7, keyspace ~10^0.3)
segment 1: zh/zh_quick selector=keyed words=7 units=8 literal_chars=0 translated=0
  route: shape:zh_quick -> keystroke:zh_quick
  candidate set sizes: [59, 1, 20, 91, 47, 69, 63, 26] (forced: 1, keyspace ~10^11.76)
total homophone keyspace ~10^12.06
leaked chars (tier 2/3): 0
leakage: 0.000 (0/16 chars)
```

## The aha

The couplet types its shared words twice: 同心 is `bmr p` in line one
and `br p` in line two, and 其 is `tmmc` and then `tc`. The second
line is Cangjie in a hurry: Quick keeps only the first and last
radical. Read on #7's keyboard, it is the nonsense 冋心庂占共夭如曲.

Both readings, recorded:

- `brpioyrtchkvrtw` is well-formed on `zh_cangjie`, as
  `br p io yr tc hk vr tw` = 冋 心 庂 占 共 夭 如 曲, each rank 0, and on
  `zh_quick`, as 同 心 之 言 其 臭 如 蘭 at ranks 0 0 0 4 0 7 0 0. It makes
  sense only on Quick.
- `mm` is 二 on `zh_cangjie`, its only candidate, and on `zh_quick` a
  list that starts 0:工 1:二 2:三 3:五.

```
$ keypath lookup --layout zh_quick --top 4 mm
mm · (zh, zh_quick) · well-formed: yes
  reading: mm / 一一
  candidates: 76
  0:工 1:二 2:三 3:五  (+72 more)
```
