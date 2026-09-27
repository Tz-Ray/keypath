# Challenge #6 — intended solve path (SPOILERS)

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

Ciphertext: `godqhrwjrrkwjdehtltkdtkwjrbu2xing4de5ctvmzek4u.3ek42k7qnfgod` ·
hint: *"…несчастлива по-своему."* ("…is unhappy in its own way.")

## Step 1 — Footholds

The stream is 60 keys. It has two groups of digits, `2 4 5` in
`bu2xing4de5` and `4 3 4 2 7` in `ek4u.3ek42k7`, and the two groups
were typed on different keyboards.

`bu2xing4de5` is tone-numbered Pinyin: each syllable ends in its tone
digit, and on Dàqiān `2` and `5` are the letters ㄉ and ㄓ, not tones.
The Pinyin starts at `bu2`, because `u2` and `rbu2` are not syllables.

```
$ keypath lookup --layout zh_pinyin --top 5 bu2 xing4 de5
bu2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄅㄨˊ / bu2
  candidates: 2
  0:不 1:醭

xing4 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄒㄧㄥˋ / xing4
  candidates: 17
  0:行 1:性 2:興 3:姓 4:幸  (+12 more)

de5 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄉㄜ˙ / de5
  candidates: 10
  0:地 1:的 2:得 3:底 4:襶  (+5 more)
```

不幸的 means "unhappy". 不 is rank 0, 幸 rank 4 and 的 rank 1.

`ek4u.3ek42k7` is Dàqiān. `7` is no Pinyin tone and `.` is not in
Pinyin's alphabet, while on Dàqiān `3`, `4` and `7` are tone keys and `.`
is ㄡ:

```
$ keypath lookup --layout zh_daqian --top 3 ek4 u.3 2k7
ek4 · (zh, zh_daqian) · well-formed: yes
  reading: ㄍㄜˋ / ge4
  candidates: 12
  0:個 1:各 2:虼  (+9 more)

u.3 · (zh, zh_daqian) · well-formed: yes
  reading: ㄧㄡˇ / you3
  candidates: 30
  0:有 1:友 2:酉  (+27 more)

2k7 · (zh, zh_daqian) · well-formed: yes
  reading: ㄉㄜ˙ / de5
  candidates: 10
  0:地 1:的 2:得  (+7 more)
```

ㄍㄜˋ ㄧㄡˇ ㄍㄜˋ ㄉㄜ˙ is 各有各的, "each has its own". 各 is rank 1
(rank 0 is 個), 有 rank 0 and 的 rank 1.

Between the two groups sit five keys, `ctvmz`. They have no digit, so
they are not Pinyin. They are not Dàqiān Chinese either. Some of the
keys type characters there (`t` is 吃, `vm` is 需), but no cut types
only characters: `c` alone types only the bare phonetic letter ㄏ, `z`
alone only ㄈ, and neither key belongs to any longer Dàqiān unit. On
the Russian ЙЦУКЕН keyboard of #4 they read семья, "family":

```
$ keypath lookup --layout ru_jcuken ctvmz ctvmze
ctvmz · (ru, ru_jcuken) · well-formed: yes
  reading: семья
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:семья

ctvmze · (ru, ru_jcuken) · well-formed: yes
  reading: семьяу
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:семьяу
```

Where the Russian stops is a real fork. `k4` (ㄜˋ) is a Dàqiān syllable
too, so the Dàqiān could start at `ek4` or at `k4`. It cannot start
earlier: `z` alone types only ㄈ, and neither `ze` nor `zek4` is a
syllable. The Russian before it is семья or семьяу, and only семья is a
word: rus-eng lists семья, not семьяу. The five keys could also be two
Russian words, `ctvm` семь ("seven") and `z` я ("I"), the old pun on
семья. But "seven I" means nothing between 不幸的 and 各有各的, and
Tolstoy's sentence (step 2) has семья.

## Step 2 — The hint

"…несчастлива по-своему." is the end of the first sentence of Anna
Karenina: "Все счастливые семьи похожи друг на друга, каждая
несчастливая семья несчастлива по-своему." ("All happy families are
alike; each unhappy family is unhappy in its own way.") The footholds
agree: 不幸的 "unhappy", семья "family", 各有各的 "each has its own".
The standard Chinese rendering is 幸福的家庭都是相似的，不幸的家庭各有各的不幸,
and searching for 各有各的不幸 finds it.

## Step 3 — The rest is Dubeolsik

What is left is the opening 26 keys, `godqhrwjrrkwjdehtltkdtkwjr`, and
the closing six, `qnfgod`. Both are letters only, so they are not
Pinyin. No Dàqiān cut of either types only characters: every cut
leaves a bare phonetic letter. The third key of the opening, `d`, can
only be ㄎ, and the closing run must start with `q`, ㄆ. On ЙЦУКЕН they
read пщвйркцокклцовуределвелцок and йтапщв, which are not Russian.
Typed into the 2-set IME of #3, both assemble into whole syllables,
with no stray jamo:

    행복적가정도시상사적 … 불행

As Korean words they partly make sense. kengdic glosses 행복 as
'happiness'; 가정 as 'supposition', 'famly' [sic] and 'managing a
household'; 도시 as 'city'; 상사 first as 'major' and further down as
'similarity'; and 불행 as 'bad(ill) luck' and 'unhappiness'. 행복 가정 is
already "happy family", which agrees with семья. But the run is a list
of words, not a sentence. These are the Sino-Korean readings of Chinese
characters: hanja conversion, as in #5. With the sentence known,
幸福的家庭都是相似的 is 행복 적 가정 도시 상사 적, each character's primary
reading, and the closing 不幸 is 불행.

## Step 4 — Candidates

```
$ keypath lookup --layout ko_dubeolsik --language zh --top 20 god qhr wjr rk wjd eh tl tkd tk wjr qnf god
god · (zh, ko_dubeolsik) · well-formed: yes
  reading: 행
  candidates: 33
  0:行 1:幸 2:杏 3:倖 4:荇 5:悻 6:婞 7:涬 8:筕 9:㼬 10:绗 11:鸻 12:哘 13:啈 14:垳 15:堼 16:洐 17:烆 18:絎 19:緈  (+13 more)

qhr · (zh, ko_dubeolsik) · well-formed: yes
  reading: 복
  candidates: 92
  0:福 1:服 2:復 3:伏 4:卜 5:腹 6:覆 7:複 8:馥 9:僕 10:撲 11:輻 12:匐 13:鰒 14:洑 15:宓 16:茯 17:蔔 18:輹 19:仆  (+72 more)

wjr · (zh, ko_dubeolsik) · well-formed: yes
  reading: 적
  candidates: 116
  0:赤 1:的 2:敵 3:適 4:賊 5:積 6:籍 7:跡 8:績 9:摘 10:寂 11:滴 12:蹟 13:笛 14:炙 15:迹 16:嫡 17:藉 18:謫 19:狄  (+96 more)

rk · (zh, ko_dubeolsik) · well-formed: yes
  reading: 가
  candidates: 125
  0:可 1:家 2:加 3:歌 4:價 5:街 6:假 7:佳 8:暇 9:架 10:价 11:賈 12:伽 13:柯 14:迦 15:軻 16:嘉 17:駕 18:嫁 19:稼  (+105 more)

wjd · (zh, ko_dubeolsik) · well-formed: yes
  reading: 정
  candidates: 249
  0:正 1:定 2:丁 3:政 4:情 5:庭 6:停 7:精 8:靜 9:貞 10:井 11:淨 12:頂 13:廷 14:征 15:程 16:亭 17:整 18:鄭 19:訂  (+229 more)

eh · (zh, ko_dubeolsik) · well-formed: yes
  reading: 도
  candidates: 202
  0:刀 1:道 2:度 3:圖 4:島 5:都 6:到 7:徒 8:逃 9:導 10:渡 11:盜 12:途 13:倒 14:桃 15:跳 16:陶 17:塗 18:稻 19:挑  (+182 more)

tl · (zh, ko_dubeolsik) · well-formed: yes
  reading: 시
  candidates: 146
  0:十 1:時 2:始 3:示 4:市 5:寺 6:視 7:詩 8:試 9:是 10:施 11:侍 12:矢 13:柴 14:屍 15:諡 16:弑 17:匙 18:猜 19:豺  (+126 more)

tkd · (zh, ko_dubeolsik) · well-formed: yes
  reading: 상
  candidates: 134
  0:上 1:相 2:想 3:常 4:賞 5:商 6:尙 7:喪 8:傷 9:霜 10:狀 11:嘗 12:詳 13:祥 14:象 15:床 16:桑 17:像 18:償 19:裳  (+114 more)

tk · (zh, ko_dubeolsik) · well-formed: yes
  reading: 사
  candidates: 299
  0:四 1:事 2:食 3:士 4:死 5:思 6:使 7:史 8:私 9:寺 10:師 11:仕 12:絲 13:舍 14:謝 15:巳 16:射 17:司 18:辭 19:似  (+279 more)

wjr · (zh, ko_dubeolsik) · well-formed: yes
  reading: 적
  candidates: 116
  0:赤 1:的 2:敵 3:適 4:賊 5:積 6:籍 7:跡 8:績 9:摘 10:寂 11:滴 12:蹟 13:笛 14:炙 15:迹 16:嫡 17:藉 18:謫 19:狄  (+96 more)

qnf · (zh, ko_dubeolsik) · well-formed: yes
  reading: 불
  candidates: 46
  0:不 1:佛 2:拂 3:弗 4:彿 5:黻 6:紱 7:髴 8:祓 9:茀 10:芾 11:岪 12:艴 13:韍 14:咈 15:巿 16:紼 17:怫 18:昢 19:刜  (+26 more)

god · (zh, ko_dubeolsik) · well-formed: yes
  reading: 행
  candidates: 33
  0:行 1:幸 2:杏 3:倖 4:荇 5:悻 6:婞 7:涬 8:筕 9:㼬 10:绗 11:鸻 12:哘 13:啈 14:垳 15:堼 16:洐 17:烆 18:絎 19:緈  (+13 more)
```

Each character of the known sentence is there: 幸1 福0 的1 家1 庭5 都5
是9 相1 似19 的1, then 不0 幸1.

The Russian word checks out through the dictionaries. семья → 'family'
(its only rus-eng translation) → CC-CEDICT's candidates for 'family',
0:家 1:家庭. The key records 1. Going in, 'family' is 家庭's first gloss,
and семья is the first rus-eng headword for 'family'.

## Step 5 — Coherence and the aha

> 幸福的家庭都是相似的，不幸的家庭各有各的不幸。

"All happy families are alike; each unhappy family is unhappy in its
own way." The sentence fits every key, and its form mirrors its
content:

- The happy families "are all alike", and they share one keyboard.
- In the unhappy half each word has its own: Pinyin (不幸的), Russian
  (家庭), Bopomofo (各有各的) and Korean (不幸).
- 家庭 is typed twice, as 가정 (`rkwjd`) and as семья (`ctvmz`).

This is the book the friend was bringing in #4 ("везу книгу").

With the author's key, `analyze` confirms it: five segments on four
keyboards, one forced unit (the Russian word) and every other unit a
choice.

```
$ keypath analyze --key key.json --ciphertext-file ciphertext.txt
keypath 1.1 · source language: zh
segment 0: zh/ko_dubeolsik selector=keyed words=6 units=10 literal_chars=0 translated=0
  hint: …несчастлива по-своему.
  route: homophone:ko_hanja -> keystroke:ko_dubeolsik
  candidate set sizes: [33, 92, 116, 125, 249, 202, 146, 134, 299, 116] (forced: 0, keyspace ~10^21.18)
segment 1: zh/zh_pinyin selector=keyed words=2 units=3 literal_chars=0 translated=0
  route: homophone:zh -> keystroke:zh_pinyin
  candidate set sizes: [2, 17, 10] (forced: 0, keyspace ~10^2.53)
segment 2: ru/ru_jcuken selector=keyed words=1 units=1 literal_chars=0 translated=1
  route: translate:zh>en -> translate:en>ru -> keystroke:ru_jcuken
  candidate set sizes: [1] (forced: 1, keyspace ~10^0.0)
segment 3: zh/zh_daqian selector=keyed words=2 units=4 literal_chars=0 translated=0
  route: homophone:zh -> keystroke:zh_daqian
  candidate set sizes: [12, 30, 12, 10] (forced: 0, keyspace ~10^4.64)
segment 4: zh/ko_dubeolsik selector=keyed words=1 units=2 literal_chars=0 translated=0
  route: homophone:ko_hanja -> keystroke:ko_dubeolsik
  candidate set sizes: [46, 33] (forced: 0, keyspace ~10^3.18)
total homophone keyspace ~10^31.53
leaked chars (tier 2/3): 0
leakage: 0.000 (0/21 chars)
```
