# 09 — Analysis: the ambiguity each layout adds

> A copy of `docs/09-analysis.md` from KeyPath 2.0 (tag `v2.0`). The commands it
> names (`keypath lookup`, `keypath layouts`, …) and the paths under
> `tables/`, `docs/`, `scripts/` and `tests/` belong to KeyPath's Python
> implementation, which is not published. The table provenance it
> cites is [`docs/VERSIONS.md`](../docs/VERSIONS.md) here, and the
> [KeyPath page](https://tz-ray.github.io/keypath/) does the same lookups in your browser.

This document measures, from the committed tables, how much ambiguity
each keyboard layout and each translation hop adds to a KeyPath message,
and how much of it a key actually spends. It answers the three
questions of docs/07 §10 (M12):

- how large the candidate sets are, per layout and per hop;
- how often the chosen candidate is the first one (rank 0) on the test
  corpora;
- how many bits a key carries per message.

**Every number here is generated.** Each table and figure sits between
`<!-- BEGIN GENERATED: … -->` and `<!-- END GENERATED -->` markers and
is written by `scripts/analysis.py`, which reads the tables through the
library's own loaders, surface registry and `unit_candidates` (the
per-unit parse that `decode`, `analyze` and `lookup` share).
`tests/test_analysis.py` re-runs the analysis and fails if any block
differs from fresh output, so the document cannot drift from the
tables. The prose outside the blocks states no measured number. From
the repository root:

```bash
.venv/bin/python scripts/analysis.py --check
.venv/bin/python scripts/analysis.py --write
```

The first command exits non-zero if a block is stale; the second
rewrites the blocks. With no flag the script prints them.

## At a glance

<!-- BEGIN GENERATED: headline -->
- A Chinese reading has a median of 11 and at most 215 candidate characters (1,412 readings, 11.1% of them unambiguous); a Korean hanja syllable a median of 33 and at most 352; a Japanese SKK reading a median of 1 and at most 239.
- On the zh round-trip corpus, 73.4% of the 154 Dàqiān (and Pinyin) choices are rank 0 (73.4% of the 154 made from a set of two or more); typed as hanja on Dubeolsik, 41.6%. On the ja corpus, 40.0% of the 15 keyed choices are rank 0.
- Across the round-trip corpora and routes, 72.7% of the 198 translation-hop choices are rank 0. The frozen v1.0 keys, whose texts were picked to select non-zero candidates, have 37.1% of their 256 translation-hop choices at rank 0.
- A zh message costs 5.41 key bits per character on Dàqiān and 7.00 as hanja on Dubeolsik; an en message routed to Chinese costs 3.55 per character by lexicon and 4.02 in free mode, where 71.3% of the bits are tier-2 patch text.
- The 6 shipped challenges carry 273.69 key bits between them; the largest, challenge-06, carries 113.63.
<!-- END GENERATED: headline -->

## Definitions

- **Candidate set.** What one ciphertext unit can mean on its surface:
  the characters of a Chinese reading, the words of a Japanese SKK
  reading, the hanja of a Hangul syllable. A key's `homophone_index`
  picks one. A translation hop has lists too: a tier-1 record's `index`
  points into the list the hop's table gives for the word on the far
  side of the hop.
- **Keyed choice.** A `homophone_index`, or a tier-1 translation
  `index`, and one more on keyed Japanese units. There the key may
  leave the index out, and the unit then decodes to its kana, so the key
  chooses from the kana's SKK candidates plus the kana itself, with or
  without an index. A kana run that is no SKK reading has only itself,
  so it is no choice. Nothing else is a keyed choice. An inline Japanese
  selector digit is public, because it is in the ciphertext, and a unit
  of a bijective layout has one meaning and carries no index.
- **Rank.** The index a keyed choice records. Rank 0 is the first
  candidate in the table's order. The kana option of a keyed Japanese
  unit is placed after its candidates, so it is never rank 0.
- **Key size** (docs/07 §10). For one message, the sum of `log2(n)`
  over its keyed choices, where `n` is the size of the set the choice
  was made from, plus `8 ×` the UTF-8 bytes of its residual text. A
  choice from a set of one costs nothing, and rank 0 of a large set
  still costs its full `log2(n)` bits, because the key must still say
  so. Residual text is the text of each tier-3 literal and the
  replacement text of each tier-2 patch span. JSON syntax does not
  count.
- **Unit-boundary bits** (reported apart from the key size). A key
  also records structure: unit lengths, word grouping, segment
  boundaries, routes, patch span offsets. None of these is a choice
  from a candidate set, so none enters the key size. The unit lengths
  are the one piece a solver must recover from the ciphertext alone,
  so they are measured separately: for each segment, `log2` of the
  number of ways its keystrokes split into well-formed units of its
  surface.
- **Test corpora.** The texts the round-trip tests already use,
  imported from the test modules and never copied: the zh, ja, es and
  en round-trip corpora, the ko and ru golden vectors, and the
  translation routes of the ko and ru tests. Each native corpus is
  encoded with default settings on every layout its language has, and
  the en corpus is also routed to Chinese in both translation modes,
  as its test does. Two further rows are shown as controls. The frozen
  v1.0 keys (docs/07 §1.2) are walked as minted; their texts were chosen
  to select non-zero candidates. The shipped challenges are walked as
  shipped.

<!-- BEGIN GENERATED: corpora -->
| corpus | texts from | encoded as | messages | plaintext chars |
|---|---|---|---|---|
| zh round-trip | `test_walk_roundtrip_zh: corpus() + OOV_CASES` | zh on (zh, zh_daqian) | 86 | 177 |
| zh round-trip | `test_walk_roundtrip_zh: corpus() + OOV_CASES` | zh on (zh, zh_pinyin) | 86 | 177 |
| zh round-trip | `test_walk_roundtrip_zh: corpus() + OOV_CASES` | zh on (zh, ko_dubeolsik) | 86 | 177 |
| ja round-trip | `test_walk_roundtrip_ja_es: JA_CORPUS` | ja on (ja, ja_romaji) | 11 | 49 |
| es round-trip | `test_walk_roundtrip_ja_es: ES_CORPUS` | es on (es, es_accent) | 9 | 111 |
| en round-trip | `test_walk_roundtrip_en: CORPUS` | en on (en, en_identity) | 25 | 483 |
| ko vectors | `test_ko: GOLDEN plaintexts` | ko on (ko, ko_dubeolsik) | 4 | 14 |
| ru vectors | `test_ru: GOLDEN plaintexts` | ru on (ru, ru_jcuken) | 3 | 16 |
| en round-trip | `test_walk_roundtrip_en: CORPUS` | en → zh (lexicon) on (zh, zh_daqian) | 25 | 483 |
| en round-trip | `test_walk_roundtrip_en: CORPUS` | en → zh (free) on (zh, zh_daqian) | 25 | 483 |
| ko routes | `test_ko: ROUTES` | each row's route, default layout | 8 | 153 |
| ru routes | `test_ru: ROUTES` | each row's route and layout | 12 | 233 |
| frozen v1.0 | `tests/golden/keys-v1.0 (test_frozen_v1: CASES)` | each key as minted | 100 | 1,781 |
| challenges | `puzzles/challenge-*` | each shipped key | 6 | 168 |
<!-- END GENERATED: corpora -->

## 1. Candidate sets per layout

A layout adds keyed ambiguity only if it has a homophone layer.
English letters type themselves, the Spanish accent selectors name
each variant, and ЙЦУКЕН puts each Russian letter on its own key. On Korean Dubeolsik, every syllable and
jamo has its own key sequence. Such a layout is a bijection. Its keys
carry no index, and its unit space (every word) is infinite, so it is
checked rather than enumerated. Every symbol its units spell is
encoded by the surface and parsed back to exactly one candidate:

<!-- BEGIN GENERATED: bijective -->
|  | symbols checked | symbols | distinct keystrokes | largest candidate set |
|---|---|---|---|---|
| (es, es_accent) | es word characters | 51 | 51 | 1 |
| (en, en_identity) | a-z | 26 | 26 | 1 |
| (ko, ko_dubeolsik) | syllables and jamo | 11,223 | 11,223 | 1 |
| (ru, ru_jcuken) | ru_jcuken.tsv letters | 33 | 33 | 1 |
<!-- END GENERATED: bijective -->

The other surfaces are homophone layers. For each one, every
reading its table lists is typed on its layout and parsed back by the
surface, and the size of the candidate set is recorded. The Japanese
row counts SKK candidates; a keyed Japanese unit's key chooses from one
more, the kana itself (see Definitions):

<!-- BEGIN GENERATED: candidate-sets -->
|  | domain | sets | size 1 | min | median | mean | p90 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| (zh, zh_daqian) | zh_chars.tsv readings | 1,412 | 11.1% | 1 | 11 | 18.48 | 45 | 106 | 215 |
| (zh, zh_pinyin) | zh_chars.tsv readings | 1,412 | 11.1% | 1 | 11 | 18.48 | 45 | 106 | 215 |
| (ja, ja_romaji) | ja_skk.tsv readings | 130,697 | 84.3% | 1 | 1 | 1.38 | 2 | 7 | 239 |
| (zh, ko_dubeolsik) | ko_hanja.tsv syllables | 555 | 10.3% | 1 | 33 | 51.30 | 123 | 282 | 352 |
<!-- END GENERATED: candidate-sets -->

<!-- BEGIN GENERATED: candidate-histogram -->
|  | 1 | 2–4 | 5–9 | 10–31 | 32–99 | 100+ |
|---|---|---|---|---|---|---|
| (zh, zh_daqian) | 157 | 231 | 257 | 517 | 233 | 17 |
| (zh, zh_pinyin) | 157 | 231 | 257 | 517 | 233 | 17 |
| (ja, ja_romaji) | 110,208 | 17,685 | 2,116 | 604 | 74 | 10 |
| (zh, ko_dubeolsik) | 57 | 34 | 49 | 130 | 194 | 91 |
<!-- END GENERATED: candidate-histogram -->

What the tables say:

- **Dàqiān and Pinyin have identical rows.** Both surfaces use the same
  readings and the same candidate order (docs/07 §5), so a key's
  indices are the same on either. They differ only in keystrokes, and
  the difference shows up in the unit-boundary column of §4, not here.
- **Hanja conversion has the largest sets.** Korean has far fewer
  distinct syllables than Chinese has tonal readings, so each syllable
  collects many more characters. Typing Chinese on a Korean keyboard
  therefore spends more bits per character than typing it in Bopomofo.
- **Japanese is lopsided.** Most SKK readings are long compound
  readings that name a single word. The short readings carry the long
  candidate lists, as the table by reading length shows, and short
  readings are the ones everyday words use.

<!-- BEGIN GENERATED: ja-by-length -->
| reading length (kana) | readings | size 1 | median | mean | p90 | max |
|---|---|---|---|---|---|---|
| 1 | 69 | 4.3% | 17 | 25.99 | 63 | 139 |
| 2 | 1,934 | 32.3% | 2 | 5.23 | 10 | 239 |
| 3 | 13,057 | 61.1% | 1 | 2.01 | 4 | 174 |
| 4 | 28,646 | 70.8% | 1 | 1.59 | 3 | 39 |
| 5 | 21,672 | 84.2% | 1 | 1.29 | 2 | 28 |
| 6 | 21,195 | 94.0% | 1 | 1.08 | 1 | 28 |
| 7+ | 44,124 | 97.8% | 1 | 1.03 | 1 | 40 |
<!-- END GENERATED: ja-by-length -->

## 2. Candidate lists of the translation hops

A hop from language *a* to *b* records, for each translated word, the
position of the source word in the list the table gives for the
*b*-side word. The hops into English from Chinese, Japanese and Korean
(`zh>en`, `ja>en`, `ko>en`) point into lists that start from an English
word and hold every source-language word with a gloss containing it,
so a common English word can have a very long list. The hops into
English from Spanish and Russian (`es>en`, `ru>en`) are exact reverse
indexes instead: an English translation, taken whole (a phrase is an
entry of its own), lists only the headwords that give exactly that
translation, so those lists stay about as short as the lists in the
other direction. The hops out of English point into lists that start
from a foreign word and hold its English glosses or translations, and
those stay short.

<!-- BEGIN GENERATED: hop-lists -->
|  | domain | sets | size 1 | min | median | mean | p90 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| `translate:en>zh` | CC-CEDICT headwords → glosses | 120,953 | 56.9% | 1 | 1 | 1.76 | 3 | 7 | 32 |
| `translate:zh>en` | English words → CC-CEDICT candidates | 49,115 | 42.4% | 1 | 2 | 14.71 | 19 | 175 | 31,184 |
| `translate:en>ja` | JMdict words → glosses | 214,704 | 51.8% | 1 | 1 | 2.04 | 4 | 9 | 76 |
| `translate:ja>en` | English words → JMdict candidates | 76,597 | 45.2% | 1 | 2 | 14.08 | 19 | 195 | 30,811 |
| `translate:es>en` | English words → Spanish candidates | 5,813 | 69.8% | 1 | 1 | 1.53 | 3 | 6 | 12 |
| `translate:en>es` | Spanish headwords → translations | 4,497 | 53.7% | 1 | 1 | 1.98 | 4 | 8 | 14 |
| `translate:en>ko` | kengdic words → glosses | 67,631 | 70.4% | 1 | 1 | 1.50 | 3 | 6 | 24 |
| `translate:ko>en` | English words → kengdic candidates | 44,381 | 56.5% | 1 | 1 | 3.58 | 5 | 33 | 4,186 |
| `translate:en>ru` | Russian headwords → translations | 38,887 | 57.3% | 1 | 1 | 1.84 | 3 | 7 | 24 |
| `translate:ru>en` | English words → Russian candidates | 45,280 | 74.1% | 1 | 1 | 1.58 | 3 | 8 | 36 |
<!-- END GENERATED: hop-lists -->

<!-- BEGIN GENERATED: hop-histogram -->
|  | 1 | 2–4 | 5–9 | 10–31 | 32–99 | 100+ |
|---|---|---|---|---|---|---|
| `translate:en>zh` | 68,789 | 48,115 | 3,699 | 349 | 1 | 0 |
| `translate:zh>en` | 20,818 | 14,260 | 5,521 | 5,362 | 2,155 | 999 |
| `translate:en>ja` | 111,193 | 89,441 | 11,989 | 2,017 | 64 | 0 |
| `translate:ja>en` | 34,620 | 21,160 | 8,222 | 7,637 | 3,274 | 1,684 |
| `translate:es>en` | 4,055 | 1,590 | 162 | 6 | 0 | 0 |
| `translate:en>es` | 2,416 | 1,768 | 292 | 21 | 0 | 0 |
| `translate:en>ko` | 47,596 | 18,675 | 1,290 | 70 | 0 | 0 |
| `translate:ko>en` | 25,089 | 13,843 | 3,169 | 1,804 | 400 | 76 |
| `translate:en>ru` | 22,271 | 14,625 | 1,895 | 96 | 0 | 0 |
| `translate:ru>en` | 33,563 | 9,852 | 1,573 | 291 | 1 | 0 |
<!-- END GENERATED: hop-histogram -->

## 3. How often the chosen candidate is rank 0

Chinese characters are ordered by derived frequency (docs/06 §5.1).
SKK words keep the dictionary's file order (docs/06 §5.3), and hanja
keep hanja.txt's file order (docs/07 §6). The hop lists differ by
direction:

- `zh>en`, `ja>en` and `ko>en` order by match class first (a gloss that
  is the English word before one that merely contains it), then by the
  source word's frequency (Chinese, Korean) or by JMdict's common-word
  flag (Japanese), then by code point.
- `es>en` and `ru>en` have no match class. They order by the source
  word's frequency, then lexicographically.
- The hops out of English keep each headword's own list order: the
  dictionary's gloss order for `en>zh`, `en>ja` and `en>ko`, and English
  word frequency, fixed when the table was built, for `en>es` and
  `en>ru`.

Natural text concentrates at rank 0 as far as an order agrees with it,
and the tables show how far each one does:

<!-- BEGIN GENERATED: rank0-surfaces -->
| corpus | encoded as | surface | keyed choices | from sets ≥ 2 | rank 0 | rank 0 (sets ≥ 2) | mean rank | max rank |
|---|---|---|---|---|---|---|---|---|
| zh round-trip | zh on (zh, zh_daqian) | (zh, zh_daqian) | 154 | 154 | 73.4% | 73.4% | 0.64 | 11 |
| zh round-trip | zh on (zh, zh_pinyin) | (zh, zh_pinyin) | 154 | 154 | 73.4% | 73.4% | 0.64 | 11 |
| zh round-trip | zh on (zh, ko_dubeolsik) | (zh, ko_dubeolsik) | 154 | 154 | 41.6% | 41.6% | 4.44 | 94 |
| ja round-trip | ja on (ja, ja_romaji) | (ja, ja_romaji) | 15 | 15 | 40.0% | 40.0% | 11.00 | 118 |
| es round-trip | es on (es, es_accent) | (es, es_accent) | 0 | 0 | — | — | — | — |
| en round-trip | en on (en, en_identity) | (en, en_identity) | 0 | 0 | — | — | — | — |
| ko vectors | ko on (ko, ko_dubeolsik) | (ko, ko_dubeolsik) | 0 | 0 | — | — | — | — |
| ru vectors | ru on (ru, ru_jcuken) | (ru, ru_jcuken) | 0 | 0 | — | — | — | — |
| en round-trip | en → zh (lexicon) on (zh, zh_daqian) | (zh, zh_daqian) | 97 | 96 | 63.9% | 63.5% | 1.04 | 19 |
| en round-trip | en → zh (free) on (zh, zh_daqian) | (zh, zh_daqian) | 123 | 122 | 61.0% | 60.7% | 1.03 | 19 |
| ko routes | each row's route, default layout | (ko, ko_dubeolsik) | 0 | 0 | — | — | — | — |
| ko routes | each row's route, default layout | (en, en_identity) | 0 | 0 | — | — | — | — |
| ko routes | each row's route, default layout | (zh, zh_daqian) | 7 | 7 | 28.6% | 28.6% | 2.29 | 9 |
| ko routes | each row's route, default layout | (ja, ja_romaji) | 3 | 3 | 33.3% | 33.3% | 1.00 | 2 |
| ru routes | each row's route and layout | (ru, ru_jcuken) | 0 | 0 | — | — | — | — |
| ru routes | each row's route and layout | (en, en_identity) | 0 | 0 | — | — | — | — |
| ru routes | each row's route and layout | (zh, zh_daqian) | 6 | 6 | 33.3% | 33.3% | 1.17 | 3 |
| ru routes | each row's route and layout | (zh, zh_pinyin) | 6 | 6 | 33.3% | 33.3% | 1.17 | 3 |
| ru routes | each row's route and layout | (zh, ko_dubeolsik) | 6 | 6 | 66.7% | 66.7% | 0.67 | 3 |
| ru routes | each row's route and layout | (ja, ja_romaji) | 3 | 3 | 66.7% | 66.7% | 0.67 | 2 |
| ru routes | each row's route and layout | (ko, ko_dubeolsik) | 0 | 0 | — | — | — | — |
| frozen v1.0 | each key as minted | (zh, zh_daqian) | 286 | 282 | 50.3% | 49.6% | 7.65 | 214 |
| frozen v1.0 | each key as minted | (en, en_identity) | 0 | 0 | — | — | — | — |
| frozen v1.0 | each key as minted | (es, es_accent) | 0 | 0 | — | — | — | — |
| frozen v1.0 | each key as minted | (ja, ja_romaji) | 57 | 57 | 40.4% | 40.4% | 33.07 | 238 |
| challenges | each shipped key | (zh, zh_daqian) | 9 | 9 | 44.4% | 44.4% | 0.56 | 1 |
| challenges | each shipped key | (es, es_accent) | 0 | 0 | — | — | — | — |
| challenges | each shipped key | (ko, ko_dubeolsik) | 0 | 0 | — | — | — | — |
| challenges | each shipped key | (ru, ru_jcuken) | 0 | 0 | — | — | — | — |
| challenges | each shipped key | (zh, zh_pinyin) | 19 | 19 | 52.6% | 52.6% | 1.84 | 12 |
| challenges | each shipped key | (zh, ko_dubeolsik) | 17 | 17 | 29.4% | 29.4% | 2.76 | 19 |
<!-- END GENERATED: rank0-surfaces -->

The same measure for every translation hop, per corpus and over all
of them:

<!-- BEGIN GENERATED: rank0-hops -->
| corpus | encoded as | hop | keyed choices | from sets ≥ 2 | rank 0 | rank 0 (sets ≥ 2) | mean rank | max rank |
|---|---|---|---|---|---|---|---|---|
| en round-trip | en → zh (lexicon) on (zh, zh_daqian) | `translate:en>zh` | 67 | 57 | 44.8% | 35.1% | 2.25 | 16 |
| ko routes | each row's route, default layout | `translate:en>ko` | 21 | 6 | 76.2% | 16.7% | 0.33 | 3 |
| ko routes | each row's route, default layout | `translate:ko>en` | 17 | 17 | 94.1% | 94.1% | 0.06 | 1 |
| ko routes | each row's route, default layout | `translate:es>en` | 4 | 2 | 100.0% | 100.0% | 0.00 | 0 |
| ko routes | each row's route, default layout | `translate:en>zh` | 4 | 0 | 100.0% | — | 0.00 | 0 |
| ko routes | each row's route, default layout | `translate:en>ja` | 3 | 3 | 0.0% | 0.0% | 8.33 | 12 |
| ko routes | each row's route, default layout | `translate:zh>en` | 4 | 4 | 75.0% | 75.0% | 0.25 | 1 |
| ru routes | each row's route and layout | `translate:en>ru` | 21 | 11 | 95.2% | 90.9% | 0.05 | 1 |
| ru routes | each row's route and layout | `translate:ru>en` | 26 | 21 | 100.0% | 100.0% | 0.00 | 0 |
| ru routes | each row's route and layout | `translate:es>en` | 4 | 3 | 100.0% | 100.0% | 0.00 | 0 |
| ru routes | each row's route and layout | `translate:en>zh` | 12 | 3 | 100.0% | 100.0% | 0.00 | 0 |
| ru routes | each row's route and layout | `translate:en>ja` | 3 | 3 | 33.3% | 33.3% | 6.00 | 12 |
| ru routes | each row's route and layout | `translate:en>ko` | 3 | 1 | 66.7% | 0.0% | 0.33 | 1 |
| ru routes | each row's route and layout | `translate:zh>en` | 4 | 4 | 75.0% | 75.0% | 0.25 | 1 |
| ru routes | each row's route and layout | `translate:ja>en` | 2 | 2 | 0.0% | 0.0% | 3.00 | 4 |
| ru routes | each row's route and layout | `translate:ko>en` | 3 | 3 | 100.0% | 100.0% | 0.00 | 0 |
| frozen v1.0 | each key as minted | `translate:en>zh` | 49 | 42 | 34.7% | 23.8% | 4.47 | 31 |
| frozen v1.0 | each key as minted | `translate:zh>en` | 38 | 38 | 26.3% | 26.3% | 2.82 | 17 |
| frozen v1.0 | each key as minted | `translate:en>ja` | 46 | 45 | 39.1% | 37.8% | 7.28 | 65 |
| frozen v1.0 | each key as minted | `translate:ja>en` | 23 | 23 | 0.0% | 0.0% | 14.57 | 34 |
| frozen v1.0 | each key as minted | `translate:es>en` | 65 | 48 | 46.2% | 27.1% | 1.25 | 11 |
| frozen v1.0 | each key as minted | `translate:en>es` | 35 | 19 | 57.1% | 21.1% | 2.40 | 13 |
| challenges | each shipped key | `translate:en>zh` | 4 | 3 | 50.0% | 33.3% | 1.00 | 2 |
| challenges | each shipped key | `translate:es>en` | 3 | 2 | 66.7% | 50.0% | 0.33 | 1 |
| challenges | each shipped key | `translate:ru>en` | 1 | 1 | 100.0% | 100.0% | 0.00 | 0 |
| challenges | each shipped key | `translate:en>ru` | 2 | 1 | 100.0% | 100.0% | 0.00 | 0 |
| challenges | each shipped key | `translate:zh>en` | 2 | 2 | 0.0% | 0.0% | 2.50 | 4 |
| all corpora |  | `translate:en>zh` | 136 | 105 | 47.8% | 32.4% | 2.75 | 31 |
| all corpora |  | `translate:zh>en` | 48 | 48 | 33.3% | 33.3% | 2.38 | 17 |
| all corpora |  | `translate:en>ja` | 52 | 51 | 36.5% | 35.3% | 7.27 | 65 |
| all corpora |  | `translate:ja>en` | 25 | 25 | 0.0% | 0.0% | 13.64 | 34 |
| all corpora |  | `translate:es>en` | 76 | 55 | 52.6% | 34.5% | 1.08 | 11 |
| all corpora |  | `translate:en>es` | 35 | 19 | 57.1% | 21.1% | 2.40 | 13 |
| all corpora |  | `translate:en>ko` | 24 | 7 | 75.0% | 14.3% | 0.33 | 3 |
| all corpora |  | `translate:ko>en` | 20 | 20 | 95.0% | 95.0% | 0.05 | 1 |
| all corpora |  | `translate:en>ru` | 23 | 12 | 95.7% | 91.7% | 0.04 | 1 |
| all corpora |  | `translate:ru>en` | 27 | 22 | 100.0% | 100.0% | 0.00 | 0 |
<!-- END GENERATED: rank0-hops -->

The frozen v1.0 row is the control. Those texts were picked to select
non-zero candidates, including members of frequency-tie groups, so they
show how far ranks move when a setter looks for it. The challenge rows
are the setters' own choices.

## 4. Key size in bits

Per corpus and encoding: the mean, median and largest key per message
(empty messages left out), the bits per plaintext character over the
whole corpus, the share of those bits that is residual text, and,
apart from the key size, the unit-boundary bits per character:

<!-- BEGIN GENERATED: key-size -->
| corpus | encoded as | messages | mean bits | median | max | bits / char | from residual text | unit-boundary bits / char |
|---|---|---|---|---|---|---|---|---|
| zh round-trip | zh on (zh, zh_daqian) | 85 | 11.27 | 9.04 | 87 | 5.41 | 24.2% | 0.83 |
| zh round-trip | zh on (zh, zh_pinyin) | 85 | 11.27 | 9.04 | 87 | 5.41 | 24.2% | 0.00 |
| zh round-trip | zh on (zh, ko_dubeolsik) | 85 | 14.57 | 12.87 | 93.04 | 7.00 | 18.7% | 0.00 |
| ja round-trip | ja on (ja, ja_romaji) | 10 | 13.66 | 1.95 | 96 | 2.79 | 76.2% | 0.96 |
| es round-trip | es on (es, es_accent) | 8 | 11.00 | 0 | 88 | 0.79 | 100.0% | 0.73 |
| en round-trip | en on (en, en_identity) | 24 | 6.67 | 0 | 72 | 0.33 | 100.0% | 0.79 |
| ko vectors | ko on (ko, ko_dubeolsik) | 4 | 0.00 | 0 | 0 | 0.00 | — | 1.04 |
| ru vectors | ru on (ru, ru_jcuken) | 3 | 0.00 | 0 | 0 | 0.00 | — | 0.81 |
| en round-trip | en → zh (lexicon) on (zh, zh_daqian) | 24 | 71.43 | 54.34 | 198.00 | 3.55 | 65.8% | 0.17 |
| en round-trip | en → zh (free) on (zh, zh_daqian) | 24 | 80.84 | 80.06 | 287.09 | 4.02 | 71.3% | 0.23 |
| ko routes | each row's route, default layout | 8 | 37.93 | 32.46 | 133.88 | 1.98 | 39.5% | 0.77 |
| ru routes | each row's route and layout | 12 | 33.48 | 25.93 | 140.32 | 1.72 | 35.8% | 0.63 |
| frozen v1.0 | each key as minted | 97 | 45.41 | 39.97 | 136 | 2.47 | 46.0% | 0.74 |
| challenges | each shipped key | 6 | 45.62 | 21.33 | 113.63 | 1.63 | 5.8% | 0.63 |
<!-- END GENERATED: key-size -->

Per shipped challenge:

<!-- BEGIN GENERATED: challenges -->
| challenge | surfaces | chars | keyed choices | index bits | residual bits | key bits | unit-boundary bits |
|---|---|---|---|---|---|---|---|
| challenge-01 | (zh, zh_daqian) | 2 | 2 | 7.00 | 0 | 7.00 | 2.00 |
| challenge-02 | (es, es_accent), (zh, zh_daqian) | 42 | 9 | 19.56 | 8 | 27.56 | 25.00 |
| challenge-03 | (ko, ko_dubeolsik) | 26 | 0 | 0.00 | 0 | 0.00 | 28.20 |
| challenge-04 | (ru, ru_jcuken), (zh, zh_pinyin) | 56 | 3 | 7.11 | 8 | 15.11 | 40.00 |
| challenge-05 | (zh, zh_pinyin), (zh, ko_dubeolsik), (ru, ru_jcuken) | 21 | 22 | 110.40 | 0 | 110.40 | 3.00 |
| challenge-06 | (zh, ko_dubeolsik), (zh, zh_pinyin), (ru, ru_jcuken), (zh, zh_daqian) | 21 | 21 | 113.63 | 0 | 113.63 | 7.00 |
<!-- END GENERATED: challenges -->

Reading the table:

- **Bijective layouts add no keyed bits.** An English, Spanish, Korean
  or Russian key spends bits only on residual text (punctuation,
  digits and words the layout cannot type, carried as tier-3
  literals). Its ciphertext is the message retyped on another keyboard
  with the spaces taken out.
- **Homophone layers are where the key's bits live.** A Chinese
  character costs the logarithm of its reading's candidate count,
  whatever its rank, so the Chinese rows are the heaviest native rows,
  and hanja conversion is heavier than Bopomofo.
- **Residual text is expensive.** Each literal byte costs eight bits,
  far more than a typical index. The leakage rule (docs/06 §6) caps it
  in shipped challenges to a small share of their characters, but it
  does not forbid it, and the challenge table shows the ones that keep
  some. The en-to-Chinese rows show the cost: the words the lexicon
  cannot translate, and in free mode the tier-2 patch text, make up a
  large share of the key.
- **Unit boundaries are the solver's work, not the key's.** Pinyin's
  column carries no information because every unit ends in its tone
  digit, so the split is forced. Dàqiān's does, because the first tone
  types no key and a bare phonetic letter is a unit of its own. On
  word-per-unit layouts the boundaries are the missing spaces. A Korean
  challenge can carry no key bits at all and still be a puzzle, because
  all of its difficulty is recognising the keyboard and splitting the
  stream.

## 5. Hand solving versus brute force

KeyPath is a puzzle cipher, not a secure one (docs/03 §6). Under
analysis it reduces to book-cipher-class structure. The measurements
above show what that means in practice.

- **The key size is the setter's freedom, not the solver's work.**
  A key of *k* bits would be one of 2^*k* equally likely keys only if
  every candidate were equally likely. They are not: choices crowd the
  top of their lists (§3), and the text must be coherent. A solver
  reading the first few candidates of each unit, as `keypath lookup`
  lists them, recovers much of a message and fixes the rest from
  context. This is
  how a book cipher falls once the book is known.
- **Brute force has no foothold.** An automated search must enumerate
  layouts, unit splits, candidates, routes and hop indices together,
  with no oracle but "the result reads as language". The table sizes
  above multiply across every unit of a message. This is the same
  property that leaves book ciphers without a general solver, and why
  KeyPath ships no solver (docs/03 §4).
- **Recognition is the real gate.** A bijective layout needs no key
  bits, and a pinyin segment has no hidden boundaries, yet neither is
  readable until the solver sees which keyboard typed it. The puzzle
  lives in that recognition step and in the hints (docs/03 §3), and
  docs/08 shows a setter how to tune both.
- **These numbers describe this edition and these corpora.** They are
  measured on the current tables and on the small test corpora, which
  were written to exercise code paths, not to sample natural text.
  Read them as the shape of the ambiguity, not as statistics of a
  language.
