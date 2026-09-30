# Challenge #12 — intended solve path (SPOILERS)

> **Spoilers.** This is the setter's write-up of how to crack the puzzle
> (from KeyPath 2.6, tag `v2.6`); it may also give away steps of other
> puzzles. The public site it names is the [KeyPath page](https://tz-ray.github.io/keypath/): its
> keyboard pictures, its [workbench](https://tz-ray.github.io/keypath/#workbench) and its playground.
> KeyPath's Python implementation, whose `$ keypath` output it quotes in
> full, is not published; references such as "docs/08 §4" are to its
> unpublished design documents, and paths such as `tables/…` and `tests/…`
> to its unpublished repository. The tables are built from the public
> sources pinned in [`docs/VERSIONS.md`](../../docs/VERSIONS.md).

Ciphertext: `odvlybjkor` · hint: *"This one came without a key. You have
been carrying it: one number from each of #7 to #11, in order."* ·
framing: "The meta. Five characters, two keys each, on a keyboard of
#10."

Every step uses the answers of #7 to #11 and a tool of the public site:
a keyboard picture, the workbench (Look up keys and Type a guess, on
the keyboard you name) or the playground. Under each step, a
`$ keypath` block asks the command-line tools the same question and
shows their real output.

## Step 1 — The numbers you carried

Hint 1 says each answer from #7 to #11 contains exactly one number
word, in Chinese, Vietnamese or English. Take one from each answer, in
order: 零 (0) from #7, một (1) from #8, 九 (9) from #9, 二 (2) from #10
and five (5) from #11. The numbers are 0, 1, 9, 2 and 5.

The meta test, `tests/test_meta.py`, reads them by a documented rule: a
Chinese numeral character, or a whole Vietnamese or English number
word, and exactly one in each answer. Its full output is in step 5.

## Step 2 — What a key records

The card says this message came without a key. A KeyPath key records,
for each character, which candidate to take: its rank in the list the
workbench shows for that unit, counted from zero (hint 2). #7's answer
says where to start: from zero. So the five numbers are the five ranks
of the missing key, one per character, in order.

## Step 3 — Five units, and which keyboard

The card says five characters, two keys each, so the ten keys cut into
`od vl yb jk or`. The card also names a keyboard of #10: Cangjie or
Quick. On the workbench with the keyboard Cangjie, `or` is not a code,
so Cangjie has no cut of the ten keys into five characters, and `yb`
(迌) and `jk` (丈) hold one candidate each, too few for ranks 9 and 2:

```
$ keypath lookup --layout zh_cangjie od vl yb jk or
od · (zh, zh_cangjie) · well-formed: yes
  reading: od / 人木
  candidates: 1
  0:休

vl · (zh, zh_cangjie) · well-formed: yes
  reading: vl / 女中
  candidates: 2
  0:凵 1:妕

yb · (zh, zh_cangjie) · well-formed: yes
  reading: yb / 卜月
  candidates: 1
  0:迌

jk · (zh, zh_cangjie) · well-formed: yes
  reading: jk / 十大
  candidates: 1
  0:丈

or · (zh, zh_cangjie) · well-formed: no
  violated rule: unit 'or' is not a code on layout zh_cangjie: no character of zh_cangjie.tsv has it
```

Quick reads all five, and hint 3 agrees: of #10's two keyboards, Quick
is the one that types at most two keys per character. On Quick the ten
keys have 89 cuts into codes, and only `od vl yb jk or` has five.

## Step 4 — The five ranks on Quick

On the workbench (keyboard: Quick), at its default top 10, take rank 0
of `od`, 1 of `vl`, 9 of `yb`, 2 of `jk` and 5 of `or`:

```
$ keypath lookup --layout zh_quick od vl yb jk or
od · (zh, zh_quick) · well-formed: yes
  reading: od / 人木
  candidates: 39
  0:他 1:保 2:氣 3:集 4:條 5:休 6:餘 7:仔 8:傑 9:余  (+29 more)

vl · (zh, zh_quick) · well-formed: yes
  reading: vl / 女中
  candidates: 33
  0:斷 1:鄉 2:娜 3:糾 4:綁 5:姬 6:緬 7:紳 8:妎 9:妡  (+23 more)

yb · (zh, zh_quick) · well-formed: yes
  reading: yb / 卜月
  candidates: 73
  0:市 1:請 2:通 3:論 4:育 5:講 6:適 7:謂 8:遍 9:遇  (+63 more)

jk · (zh, zh_quick) · well-formed: yes
  reading: jk / 十大
  candidates: 24
  0:教 1:較 2:故 3:窗 4:突 5:丈 6:寞 7:竅 8:吏 9:轍  (+14 more)

or · (zh, zh_quick) · well-formed: yes
  reading: or / 人口
  candidates: 74
  0:個 1:合 2:信 3:何 4:館 5:知 6:佔 7:售 8:舍 9:含  (+64 more)
```

The picks are 他 鄉 遇 故 知: 他鄉遇故知, which CC-CEDICT glosses as
"meeting an old friend in a foreign place (idiom)". The deepest pick,
遇 at rank 9, is the last of the ten the workbench lists by default.
The line is one of the four joys of an old saying (the setter's
quotation: 久旱逢甘雨，他鄉遇故知，洞房花燭夜，金榜題名時), and it
answers #11's greeting.

## Step 5 — Any four of five

With one answer missing, take the four numbers you have and scan the
missing unit's ten visible candidates: exactly one of them completes a
word. The meta test checks this for each of #7 to #11 in turn. It
blanks that challenge's number, tries every digit from 0 to 9, and
accepts a try only when the five picks spell a word of the phrase list
`tables/zh_phrases.tsv`, pinned by its sha256. Its output:

```
predicate: the five picks spell a word of tables/zh_phrases.tsv, column 1
  sha256 856c26918c8b39d51733ec906fc6c585b6a8ba2baa8d141c086ad98f3e8a2efe
#12 on zh_quick: od vl yb jk or, list sizes [39, 33, 73, 24, 74]
slots: #07, #08, #09, #10, #11, each one digit 0-9
number words: #07 [零 0], #08 [một 1], #09 [九 9], #10 [二 2], #11 [five 5]
material [0, 1, 9, 2, 5] picks 他鄉遇故知: accepted
blank #07, try 0-9: 1 accepted, 0 → 他鄉遇故知
blank #08, try 0-9: 1 accepted, 1 → 他鄉遇故知
blank #09, try 0-9: 1 accepted, 9 → 他鄉遇故知
blank #10, try 0-9: 1 accepted, 2 → 他鄉遇故知
blank #11, try 0-9: 1 accepted, 5 → 他鄉遇故知
two blanks, try 0-9 each: completions per pair [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
no feeder, whole lists (166,856,976 picks): accepted ['他鄉遇故知']
```

So missing #7 still leaves the zero-based count, which hint 2 states,
and missing #10 still leaves the keyboard, since Cangjie fails at `or`
and hint 3 describes Quick. Even with two numbers missing, one
completion is left. The last line is the honest caveat: the five lists
alone hold one word of the phrase list, so a reader who knows the
saying can backsolve it from 他 at #0 and 鄉 at #1, and the numbers
then confirm it.

## Step 6 — Confirmation

On the playground (Chinese source, Quick chip), the line types the ten
keys, and on Type a guess (keyboard: Quick) each character shows its
rank:

```
$ keypath encode --source-lang zh --layout zh_quick --out line.json 他鄉遇故知
odvlybjkor
leakage: 0.000
```

```
$ keypath type --layout zh_quick 他鄉遇故知
(zh, zh_quick)
他 od 0/39
鄉 vl 1/33
遇 yb 9/73
故 jk 2/24
知 or 5/74
```

With the author's key, `trace` shows that the key records exactly the
five numbers:

```
$ keypath trace --key key.json --ciphertext-file ciphertext.txt
(from the ciphertext and the tables: keys, readings, set sizes; from the key: unit lengths, #indices, hop records, literals)
segment 1 · (zh, zh_quick) · keyed
  word 1: 他鄉遇故知
    od → od / 人木 → #0 of 39 → 他 (5.29 bits)
    vl → vl / 女中 → #1 of 33 → 鄉 (5.04 bits)
    yb → yb / 卜月 → #9 of 73 → 遇 (6.19 bits)
    jk → jk / 十大 → #2 of 24 → 故 (4.58 bits)
    or → or / 人口 → #5 of 74 → 知 (6.21 bits)
key bits 27.31 = index 27.31 + residual 0
```

## The aha

You never saw a key for any challenge, yet you have been writing this
one: the one number in each answer is exactly what this key stores,
counted from zero as #7's answer told you.

No stretch reads two ways here: the five chunks do not all read on
Cangjie, where `or` is not a code.
