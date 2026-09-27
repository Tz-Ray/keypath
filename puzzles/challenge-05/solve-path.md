# Challenge #5 — intended solve path (SPOILERS)

> A copy of `puzzles/challenge-05/solve-path.md` from KeyPath 2.0 (tag `v2.0`). The commands it
> names (`keypath lookup`, `keypath layouts`, …) and the paths under
> `tables/`, `docs/`, `scripts/` and `tests/` belong to KeyPath's Python
> implementation, which is not published. The table provenance it
> cites is [`docs/VERSIONS.md`](../../docs/VERSIONS.md) here, and the
> [KeyPath page](https://tz-ray.github.io/keypath/) does the same lookups in your browser.

Ciphertext:
`zi3yue1xue2er2shi2xi2zhi1bu2yi4shuo1hu1dblheuwkdnjsqkdfobu2yi4le4hu1` ·
hint: *"The Master said it. Seoul recites it. One word came from even
farther away."*

## Step 1 — Recognition

The stream opens in tone-numbered Pinyin (`zh_pinyin`): letters closed
by a digit from 1 to 5, where every syllable ends in its tone digit.
Cut after each digit and look the syllables up, here with the tail's
`le4` added:

```
$ keypath lookup --layout zh_pinyin --top 2 zi3 yue1 xue2 er2 shi2 xi2 zhi1 bu2 yi4 shuo1 hu1 le4
zi3 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄗˇ / zi3
  candidates: 26
  0:子 1:仔  (+24 more)

yue1 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄩㄝ / yue1
  candidates: 5
  0:約 1:曰  (+3 more)

xue2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄒㄩㄝˊ / xue2
  candidates: 16
  0:學 1:尋  (+14 more)

er2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄦˊ / er2
  candidates: 28
  0:而 1:兒  (+26 more)

shi2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄕˊ / shi2
  candidates: 32
  0:十 1:時  (+30 more)

xi2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄒㄧˊ / xi2
  candidates: 57
  0:習 1:息  (+55 more)

zhi1 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄓ / zhi1
  candidates: 52
  0:之 1:只  (+50 more)

bu2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄅㄨˊ / bu2
  candidates: 2
  0:不 1:醭

yi4 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄧˋ / yi4
  candidates: 215
  0:一 1:意  (+213 more)

shuo1 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄕㄨㄛ / shuo1
  candidates: 3
  0:說 1:哾  (+1 more)

hu1 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄏㄨ / hu1
  candidates: 46
  0:戲 1:乎  (+44 more)

le4 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄌㄜˋ / le4
  candidates: 31
  0:樂 1:落  (+29 more)
```

zi3 yue1 xue2 er2 shi2 xi2 zhi1 bu2 yi4 shuo1 hu1 is
子曰學而時習之不亦說乎: "The Master said: to learn and practise it in
due time, is that not a pleasure?" It is the opening of the Analects,
and the hint's "The Master said it." The stream ends bu2 yi4 le4 hu1,
不亦樂乎, "is that not a joy?"

Two spellings come from the IME, not from the classical reading:

- 說 is `shuo1`, rank 0 of 3. In this line it means 悅, "pleased", and
  is read yuè: `yue4` would list it at rank 1 of 64. But the encoder
  types a word's most frequent reading in the phrase table
  (`tables/zh_phrases.tsv`), which ranks 說 ㄕㄨㄛ (43,458) far above
  ㄩㄝˋ (141).
- 不 is `bu2`, not bu4. The phrase table spells 不亦 ㄅㄨˊ ㄧˋ: 不 before
  a fourth tone is read bú (tone sandhi).

亦 is not among yi4's first two candidates. It is rank 12 of 215. Nobody
would find it by searching, but the known text fixes it:

```
$ keypath lookup --layout zh_pinyin --top 13 yi4
yi4 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄧˋ / yi4
  candidates: 215
  0:一 1:意 2:議 3:液 4:義 5:易 6:藝 7:衣 8:施 9:射 10:食 11:益 12:亦  (+202 more)
```

Between `hu1` and the last `bu2` sit 17 keys with no digit:
`dblheuwkdnjsqkdfo`. A Pinyin syllable cannot end without its tone
digit, and at the `2` only `bu2` is a syllable (`obu2` is not). So these
17 keys were typed on another keyboard. They are not Dàqiān either.
Tone 1 types no key there, so a digitless run could be a string of
first-tone syllables, but this one cannot even start: `d` alone types
only the bare phonetic letter ㄎ, and no longer prefix (`db`, `dbl`, …)
is a syllable.

```
$ keypath lookup --layout zh_daqian d db
d · (zh, zh_daqian) · well-formed: yes
  reading: ㄎ / k1
  candidates: 1
  0:ㄎ

db · (zh, zh_daqian) · well-formed: no
  violated rule: unit 'db' maps to 'ㄎㄖ', which is not a syllable in the reading table
```

## Step 2 — The crib

The line missing between the two questions is 有朋自遠方來, "to have a
friend come from afar". The hint says Seoul recites it: in Sino-Korean,
유붕자원방래, each character's primary reading
(`tables/ko_hanja_readings.tsv`). On the Korean 2-set keyboard of #3
that is `db qnd wk dnjs qkd fo`.

The ciphertext has `db lheu wk dnjs qkd fo` instead. Typed into a
2-set IME, the 17 keys come out as

    유ㅣㅗ뎌자원방래

This is the recitation with a hole where 붕 (朋) should be: `lheu`
stands where `qnd` would.

## Step 3 — The word from farther away

`lheu` reads as a word on one layout only:

- Pinyin wants a tone digit.
- Dàqiān reads it as ㄠㄘㄍㄧ, which is not a syllable.
- Romaji cannot parse it.
- On 2-set it is no syllable, only the lone vowels ㅣ ㅗ and then 뎌.
- en_identity and es_accent accept any letters, but no dictionary in
  `tables/` lists `lheu`, in English or in Spanish.

It is the second word of #4, typed on the Russian ЙЦУКЕН keyboard:

```
$ keypath lookup --layout ru_jcuken lheu
lheu · (ru, ru_jcuken) · well-formed: yes
  reading: друг
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:друг
```

друг, "friend". Read the whole 17-key run on ЙЦУКЕН and the friend is
sitting in it: видругцлвтоыйлващ.

The friend is 朋, and two public glosses confirm it:

- CC-CEDICT glosses 朋 as 'friend', its only gloss.
- hanja.txt names 朋 under 붕 by meaning and sound: 벗 붕, "friend,
  bung".

```
$ keypath lookup --layout ko_dubeolsik --language zh --gloss --top 3 qnd
qnd · (zh, ko_dubeolsik) · well-formed: yes
  reading: 붕
  candidates: 31
  0:朋  벗 붕
  1:崩  무너질 붕, 산무너질 붕
  2:鵬  대붕새 붕
  (+28 more)
```

The chain the key records runs from the Russian back to the Chinese:
друг → 'friend' (the first of друг's rus-eng translations, friend and
mate) → 朋, candidate 4 of CC-CEDICT's 94 for 'friend' (友 朋友 故 友人 朋
…). Going in, the encoder took the first choice at both hops: 'friend'
is 朋's first gloss, and друг is the first of the rus-eng headwords for
'friend' (друг, знакомый, френд, товарка, лазарёк).

## Step 4 — Candidates

The hanja, under the recited syllables:

```
$ keypath lookup --layout ko_dubeolsik --language zh db wk dnjs qkd fo
db · (zh, ko_dubeolsik) · well-formed: yes
  reading: 유
  candidates: 289
  0:有 1:流 2:由 3:油 4:留 5:猶 6:柳 7:遺 8:遊 9:酉  (+279 more)

wk · (zh, ko_dubeolsik) · well-formed: yes
  reading: 자
  candidates: 191
  0:子 1:自 2:者 3:字 4:姉 5:慈 6:資 7:姿 8:玆 9:紫  (+181 more)

dnjs · (zh, ko_dubeolsik) · well-formed: yes
  reading: 원
  candidates: 139
  0:元 1:原 2:遠 3:園 4:願 5:圓 6:怨 7:院 8:員 9:源  (+129 more)

qkd · (zh, ko_dubeolsik) · well-formed: yes
  reading: 방
  candidates: 134
  0:方 1:放 2:防 3:房 4:訪 5:邦 6:妨 7:芳 8:傍 9:倣  (+124 more)

fo · (zh, ko_dubeolsik) · well-formed: yes
  reading: 래
  candidates: 44
  0:來 1:萊 2:賚 3:崍 4:徠 5:来 6:淶 7:騋 8:顂 9:勑  (+34 more)
```

有 is 0 under 유, 自 1 under 자 (0 is 子), 遠 2 under 원, 方 0 under 방,
and 來 0 under 래. 來 is typed 래, its primary reading. hanja.txt also
lists it under 내 (rank 1 of 39), which would be typed `so` and break
the recitation. 遠方 has no word reading of its own: 원방 is its
characters' readings.

The Pinyin: 子0 曰1 學0 而0 時1 習0 之0 不0 亦12 說0 乎1, then 不0 亦12
樂0 乎1.

## Step 5 — Coherence

> 子曰：學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？

"The Master said: to learn and practise it in due time, is that not a
pleasure? To have a friend come from afar, is that not a joy?"
(Analects 1.1. The plaintext carries no punctuation.) The friend from
afar was typed on a Moscow keyboard.

With the author's key, `analyze` confirms it: five segments on three
keyboards, one forced unit (the Russian word) and every other unit a
choice.

```
$ keypath analyze --key key.json --ciphertext-file ciphertext.txt
keypath 1.1 · source language: zh
segment 0: zh/zh_pinyin selector=keyed words=9 units=11 literal_chars=0 translated=0
  hint: The Master said it. Seoul recites it. One word came from even farther away.
  route: homophone:zh -> keystroke:zh_pinyin
  candidate set sizes: [26, 5, 16, 28, 32, 57, 52, 2, 215, 3, 46] (forced: 0, keyspace ~10^14.52)
segment 1: zh/ko_dubeolsik selector=keyed words=1 units=1 literal_chars=0 translated=0
  route: homophone:ko_hanja -> keystroke:ko_dubeolsik
  candidate set sizes: [289] (forced: 0, keyspace ~10^2.46)
segment 2: ru/ru_jcuken selector=keyed words=1 units=1 literal_chars=0 translated=1
  route: translate:zh>en -> translate:en>ru -> keystroke:ru_jcuken
  candidate set sizes: [1] (forced: 1, keyspace ~10^0.0)
segment 3: zh/ko_dubeolsik selector=keyed words=3 units=4 literal_chars=0 translated=0
  route: homophone:ko_hanja -> keystroke:ko_dubeolsik
  candidate set sizes: [191, 139, 134, 44] (forced: 0, keyspace ~10^8.19)
segment 4: zh/zh_pinyin selector=keyed words=1 units=4 literal_chars=0 translated=0
  route: homophone:zh -> keystroke:zh_pinyin
  candidate set sizes: [2, 215, 31, 46] (forced: 0, keyspace ~10^5.79)
total homophone keyspace ~10^30.96
leaked chars (tier 2/3): 0
leakage: 0.000 (0/21 chars)
```

## Leakage

0/21 = 0.000. Chinese is written without spaces, so the segment
boundaries cost nothing, and the line has no punctuation. The key
carries no literal text.

The ciphertext holds none of the characters docs/07 §7 sends through a
heredoc (`' " $ \ ; [ ]` and the backtick), so it can be passed as a
plain argument.

## How it was minted

Five segments from a Chinese source: Pinyin, hanja conversion on the
Korean 2-set keyboard, 朋 routed zh → en → ru and typed on `ru_jcuken`,
hanja again, and Pinyin. The `zh_words` equal the greedy split of each
segment and are pinned so the split cannot drift:

```
$ keypath encode --source-lang zh --out key.json --segments '[{"length":11,"route":"zh","layout":"zh_pinyin","selector_mode":"keyed","zh_words":["子曰","學","而","時","習","之","不亦","說","乎"],"hint":"The Master said it. Seoul recites it. One word came from even farther away."},{"length":1,"route":"zh","layout":"ko_dubeolsik","selector_mode":"keyed","zh_words":["有"]},{"length":1,"route":"ru","layout":"ru_jcuken","selector_mode":"keyed"},{"length":4,"route":"zh","layout":"ko_dubeolsik","selector_mode":"keyed","zh_words":["自","遠方","來"]},{"length":4,"route":"zh","layout":"zh_pinyin","selector_mode":"keyed","zh_words":["不亦樂乎"]}]' 子曰學而時習之不亦說乎有朋自遠方來不亦樂乎
zi3yue1xue2er2shi2xi2zhi1bu2yi4shuo1hu1dblheuwkdnjsqkdfobu2yi4le4hu1
leakage: 0.000
```

## Fairness checklist (docs/03 §5), answered

1. **Is the keystroke layer recognizable?** Yes. Pinyin delimits itself,
   because every syllable ends in its tone digit. The 17-key digitless
   run cannot be Pinyin, and Dàqiān cannot even start it. On 2-set it
   assembles into the recitation of the missing line, with a visible
   hole. The four keys in the hole read as a word on one layout only,
   ЙЦУКЕН, and that word, друг, means 朋.
2. **Does one coherent decoding exist and stand out?** Yes. This is the
   best-known line of the Chinese classics. Every hanja pick is rank 2
   or better. Every Pinyin pick is rank 1 or better except 亦 (12 of
   215), which the known text fixes. Going in, the friend took the first
   choice at both hops.
3. **Are the tables public and derivable?** Yes: `zh_pinyin.tsv` with
   `zh_chars.tsv` and `zh_phrases.tsv` (the frequencies that order the
   candidates and choose each word's reading, docs/06 §5.1–§5.2);
   `ko_dubeolsik.tsv`, `ko_hanja.tsv` (hanja.txt, with its glosses) and
   `ko_hanja_readings.tsv` (docs/07 §6); `ru_jcuken.tsv` (docs/07 §7);
   and the dictionaries `zh_en_cedict.tsv` and `ru_en_freedict.tsv`
   (FreeDict rus-eng 2025.11.23). All are pinned in `tables/VERSIONS.md`.
4. **Is the difficulty tuned to the audience?** Yes, for hard: three
   keyboards, five segments, and one word translated twice, through
   English. The very strong crib, a hint that names the recitation, and
   #4's `lheu` balance that. The page does not point at #4: reading
   `lheu` on the keyboard that typed #4 is the solver's own step.

## Playtest

Blind-solved on 2026-09-24 by an independent solver who saw only the
public page, the earlier challenges and the tools. Their answer matched
`plaintext.txt` exactly (they also offered the punctuated line, and
asked whether punctuation counts). They judged the puzzle closer to
medium than hard. The Pinyin opening plus "The Master said it" gives
the Analects at once, and the README's line "If you solved #4, you have
already met the traveller." all but handed over `lheu` = друг. That line
was removed: the hint's "One word came from even farther away" still
says a word was translated, and #4's plaintext holds друг, so no step
became unfair. The README now also says how answers are checked (one
language, no punctuation, spaces ignored). The hint in the key, the
title and the level are unchanged, so the key was not re-minted.
