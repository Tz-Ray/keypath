# Challenge #4 — intended solve path (SPOILERS)

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

Ciphertext: `ghbdtnlheutlernt,tbpvjcrdsdctekdtperybuebcha2` · hint:
*"Открытка из Москвы, typed on a PC. Every word but one; that one
insisted on being typed in its mother tongue."* ("A postcard from
Moscow, …")

## Step 1 — Recognition

"Moscow" plus "PC" points to the Windows Russian ЙЦУКЕН keyboard, the
layout `keypath layouts` titles "PC layout" (Apple's default Russian
puts some letters on other keys):

```
$ keypath layouts ru_jcuken
ru_jcuken: Russian ЙЦУКЕН, PC layout (Windows Russian on US key positions)
  surfaces: (ru, ru_jcuken)
  alphabet: a-z ' , . ; [ ] `
  keyboard (ru_jcuken.tsv), each key drawn as `key letter`:
    ` ё
            q й  w ц  e у  r к  t е  y н  u г  i ш  o щ  p з  [ х  ] ъ
             a ф  s ы  d в  f а  g п  h р  j о  k л  l д  ; ж  ' э
               z я  x ч  c с  v м  b и  n т  m ь  , б  . ю
  PC layout; Apple's default Russian differs (this is Windows Russian, KLID 00000419 = macOS "Russian – PC")
  unit: one word, typed letter by letter; the 33 letters а-я and ё are pairwise-distinct keys, so no homophone layer
  e.g. привет = ghbdtn · хорошо = [jhjij · ёжик = `;br · тебе = nt,t · съел = c]tk · эхо = '[j
```

The stream opens with `ghbdtn`: привет ("hi") typed with the English
layout active, the best-known wrong-layout word on the Russian internet.
The one comma is a letter: on ЙЦУКЕН, `,` is б.

## Step 2 — Layout inversion, and where it stops

Key by key: приветдругедуктебеизмосквывсеулвезукнигуисрф, then `2`.
ЙЦУКЕН has no digit, so the tail was typed on another keyboard:

```
$ keypath lookup --layout ru_jcuken cha2
cha2 · (ru, ru_jcuken) · well-formed: no
  violated rule: unit 'cha2' contains '2', which is outside the ru_jcuken alphabet
```

Four of the seven layouts have a `2`: Dàqiān, Pinyin, Japanese romaji
and the Spanish accent picker. Letters closed by a digit at the very
end look like tone-numbered Pinyin, where every unit ends in its tone
digit. Where does the Pinyin start? Read back from the digit:

```
$ keypath lookup --layout zh_pinyin --gloss --top 3 a2 ha2 cha2 bcha2
a2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄚˊ / a2
  candidates: 1
  0:嗄  variant of 啊[a2]; hoarse

ha2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄏㄚˊ / ha2
  candidates: 3
  0:蝦  used in 蝦蟆|虾蟆[ha2 ma5]; shrimp; prawn
  1:蛤  (bound form) clam; used in 蛤蚧[ge2 jie4]; used in 蛤蟆[ha2 ma5]
  2:鰕  variant of 蝦|虾[xia1]

cha2 · (zh, zh_pinyin) · well-formed: yes
  reading: ㄔㄚˊ / cha2
  candidates: 23
  0:查  surname zha; to research; to check (+5 more)
  1:察  short name for chahar province 察哈爾|察哈尔[cha2 ha1 er3]; to examine; to inquire (+5 more)
  2:茶  tea; tea plant
  (+20 more)

bcha2 · (zh, zh_pinyin) · well-formed: no
  violated rule: 'bcha' is not a pinyin spelling on layout zh_pinyin
```

`bcha2` is not a syllable, so the Pinyin is `a2`, `ha2` or `cha2`, and
the Russian must end in whole words just before it:

- `…книгу иср` + `a2`: иср is not a word.
- `…книгу ис` + `ha2`: и с ("and with") leaves the preposition hanging
  before a Chinese shrimp or clam.
- `…книгу и` + `cha2`: "…bringing a book and ___". This one reads.

> привет друг еду к тебе из москвы в сеул везу книгу и ___

"Hi friend! I'm coming to you from Moscow to Seoul, bringing a book
and ___."

The other layouts with a `2` do not help. Dàqiān rejects `cha2` (ㄏㄘㄇㄉ
is no syllable), and es_accent reads `chà`, which is not Spanish.
ja_romaji reads ちゃ with the inline selector 2, which publicly picks
咤, not 茶 (茶 would be `cha1`):

```
$ keypath lookup --layout ja_romaji --gloss --top 3 cha2
cha2 · (ja, ja_romaji) · well-formed: yes · inline selector 2
  reading: ちゃ
  candidates: 2 (public: 1 — the inline digit selects rank 1)
  0:茶  tea; tea plant (camellia sinensis); tea preparation (+3 more)
  *1:咤  —
  selected: 1:咤  —
```

## Step 3 — Candidates

`cha2` is ㄔㄚˊ (chá), with 23 candidates. The Pinyin block in step 2
shows the first three: 0:查 "to check", 1:察 "to examine", 2:茶 "tea".

## Step 4 — Coherence, across two translations

"везу книгу и ___" is "bringing a book and ___". Of 查, 察 and 茶, only
茶, tea, is something you bring. But the hint says every word *but one*
was typed in Russian, and that one in its mother tongue. So the
plaintext word is Russian, and the Chinese is its translation. Carry the
gloss back through English with the public dictionaries:

- CC-CEDICT (`tables/zh_en_cedict.tsv`) glosses 茶 as "tea; tea plant".
- FreeDict rus-eng (`tables/ru_en_freedict.tsv`) translates чай as tea,
  tea party, tea plant, five o'clock tea. Of the three headwords that
  list 'tea' (чай, чаепитие, чайный), чай is the most frequent.

The chain is cha2 → 茶 (rank 2 of 23) → 'tea' (茶's first CC-CEDICT
gloss) → чай (the first rus-eng headword for 'tea'). Every hop takes its
first choice.

> привет друг еду к тебе из москвы в сеул везу книгу и чай

"Hi friend! I'm coming to you from Moscow to Seoul, bringing a book and
tea."

## Step 5 — The aha

Russian чай comes, ultimately, from northern Chinese chá, 茶: it
belongs to the "cha" family of words for tea, as against the "te" of
Min Chinese. The one word that "insisted on being typed in its mother
tongue" went home to Mandarin to be typed.

With the author's key, `analyze` confirms it: twelve forced Russian
words and one choice among 23.

```
$ keypath analyze --key key.json --ciphertext-file ciphertext.txt
keypath 1.1 · source language: ru
segment 0: ru/ru_jcuken selector=keyed words=13 units=12 literal_chars=1 translated=0
  hint: Открытка из Москвы, typed on a PC. Every word but one; that one insisted on being typed in its mother tongue.
  route: keystroke:ru_jcuken
  candidate set sizes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] (forced: 12, keyspace ~10^0.0)
segment 1: zh/zh_pinyin selector=keyed words=1 units=1 literal_chars=0 translated=1
  route: translate:ru>en -> translate:en>zh -> homophone:zh -> keystroke:zh_pinyin
  candidate set sizes: [23] (forced: 0, keyspace ~10^1.36)
total homophone keyspace ~10^1.36
leaked chars (tier 2/3): 1
leakage: 0.018 (1/56 chars)
```
