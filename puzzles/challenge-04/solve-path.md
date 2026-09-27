# Challenge #4 — intended solve path (SPOILERS)

> A copy of `puzzles/challenge-04/solve-path.md` from KeyPath 2.0 (tag `v2.0`). The commands it
> names (`keypath lookup`, `keypath layouts`, …) and the paths under
> `tables/`, `docs/`, `scripts/` and `tests/` belong to KeyPath's Python
> implementation, which is not published. The table provenance it
> cites is [`docs/VERSIONS.md`](../../docs/VERSIONS.md) here, and the
> [KeyPath page](https://tz-ray.github.io/keypath/) does the same lookups in your browser.

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
tongue" went home to Mandarin to be typed. Note for later: `lheu` =
друг, "friend".

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

## Leakage

1/56 = 0.018. Russian is written with spaces, and the joiner elides the
ones between the Russian words (docs/07 §3). The space between и and чай
crosses the segment boundary, so the key carries it as a one-character
tier-3 literal. Challenge-02 ships the same structure.

The ciphertext holds none of the characters docs/07 §7 sends through a
heredoc (`' " $ \ ; [ ]` and the backtick), so it can be passed as a
plain argument.

## How it was minted

Two segments from a Russian source: 53 characters typed on `ru_jcuken`,
then чай routed ru → en → zh and typed on `zh_pinyin`:

```
$ keypath encode --source-lang ru --out key.json --segments '[{"length":53,"route":"ru","layout":"ru_jcuken","selector_mode":"keyed","hint":"Открытка из Москвы, typed on a PC. Every word but one; that one insisted on being typed in its mother tongue."},{"length":3,"route":"zh","layout":"zh_pinyin","selector_mode":"keyed"}]' 'привет друг еду к тебе из москвы в сеул везу книгу и чай'
ghbdtnlheutlernt,tbpvjcrdsdctekdtperybuebcha2
leakage: 0.018
```

## Fairness checklist (docs/03 §5), answered

1. **Is the keystroke layer recognizable?** Yes. It is a ЙЦУКЕН key log
   with a famous opener, and the hint names the city and the PC. The
   Pinyin tail breaks the Russian reading visibly with a digit, which
   nudges rather than blocks, and a Pinyin unit ends in its tone digit.
2. **Does one coherent decoding exist and stand out?** Yes. The Russian
   part is bijective. The Pinyin can start at `a2`, `ha2` or `cha2`, and
   only `cha2` leaves the Russian in whole words. For `cha2`, only 茶
   fits "везу книгу и ___", and 茶 → tea → чай takes the first choice at
   both hops. No other layout's public reading of `cha2` is tea:
   ja_romaji lists 茶 at rank 0, but its inline `2` selects 咤, and
   Dàqiān and es_accent give no Chinese at all. A solver who tries
   Japanese first still meets 茶 there, which does no harm.
3. **Are the tables public and derivable?** Yes: `ru_jcuken.tsv`
   (docs/07 §7), `zh_pinyin.tsv` with `zh_chars.tsv` and
   `zh_phrases.tsv` (the frequencies that order the candidates, docs/06
   §5.1–§5.2), `zh_en_cedict.tsv`, and `ru_en_freedict.tsv` (FreeDict
   rus-eng 2025.11.23). All are pinned in `tables/VERSIONS.md`.
4. **Is the difficulty tuned to the audience?** Yes, for medium: two
   keyboards, one candidate choice (rank 2 of 23) and one translation
   back into the source language. The hint names the city and "PC", and
   the famous opener gives the first keyboard away.

## Playtest

Blind-solved on 2026-09-24 by an independent solver who saw only the
public page, the earlier challenges and the tools. Their answer matched
`plaintext.txt` exactly. They recognised `ghbdtn` at once, found the
Pinyin tail at the digit, and took 茶 → tea → чай through the public
dictionaries. They asked two things the page did not answer: whether the
last word counts as чай or as 茶, and whether the lost commas and
capitals count. The README now says how answers are checked (one
language, no punctuation or capitals, spaces ignored). They rated the
puzzle medium-easy. The level, the hint and the key are unchanged.
