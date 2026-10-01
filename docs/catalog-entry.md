# KeyPath cipher — catalog entry

> From KeyPath 3.0 (tag `v3.0`). KeyPath's Python reference implementation
> is not published: the `keypath` commands and output this entry quotes,
> its offline decoder, and the files it names in that repository (its
> design documents, such as "docs/10 §3", and its `tables/…` and `*.tsv`
> tables) are not public. Its `docs/09-analysis.md` is copied here as
> [`analysis.md`](analysis.md) and its `tables/VERSIONS.md` as
> [`VERSIONS.md`](VERSIONS.md), which pins every table's public source;
> the licenses of the data this site ships are in
> [`DATA-LICENSES.md`](../DATA-LICENSES.md). The [KeyPath page](https://tz-ray.github.io/keypath/)
> encodes, decodes and walks keys in your browser.

*Format modeled on cipher-catalog entries (dCode, CacheSleuth).*

## Classification

- **Category:** substitution → homophonic / book-cipher class; multi-stage
- **Era:** modern (2026); computer-assisted encode/decode, hand-solvable
- **Key type:** per-message JSON route (segment layouts, unit lengths,
  candidate and translation indices), also carried as a one-line `kp1`
  string; public pinned language tables (Kerckhoffs-style), versioned as
  append-only editions
- **Ciphertext alphabet:** layout-local (see the table below), no
  spaces or delimiters. The union over the fifteen layouts is 62
  symbols: `a-z`, `0-9`, the nine capitals `E` `O` `P` `Q` `R` `T` `V`
  `W` `Z`, and the seventeen marks `&` `'` `(` `)` `*` `+` `,` `-` `.`
  `/` `:` `;` `=` `[` `\` `]` `` ` ``.

## Description

KeyPath encodes a message as the raw US-keyboard keystrokes an IME user
would type to produce it. Each segment declares a language and a layout,
and keystroke semantics are layout-local: on the Bopomofo Dàqiān layout
digits `1 2 5 8 9 0` are phonetic symbols and `3 4 6 7` are tone marks;
on the Spanish accent layout a digit selects an accent variant of the
letter before it; on Japanese romaji a digit can be an inline
candidate selector, and on JIS kana every digit is a kana; on ЙЦУКЕН a
comma is the letter б; on Cangjie each letter is a radical, a piece of
a character's shape; on Vietnamese VNI a digit is a tone or a vowel
mark; on Greek `;` is the tonos, typed before its vowel. Segments may route through another language via
public bilingual lexicons before hitting the keyboard. English is the
pivot: every hop is to or from English, so Spanish reaches Russian as
es → en → ru. The coherent reading may not be in the language the
ciphertext suggests.

## Layouts

Eight languages on fifteen layouts. The alphabet is what the decoder
accepts on the layout (docs/07 §4, docs/10 §3). Each character in it is
typed by some unit the layout's tables define, with these gaps:
`ja_romaji` never types `l` `q` `v` `x` (its digits `1`–`9` are inline
selectors, typed after a unit), `vi_telex` never types `z`, `vi_vni`
never types `f` `j` `w` `z`, and `zh_jyutping` never types `q` `r` `v`
`x`.

| layout | language | keyboard | alphabet | since |
|---|---|---|---|---|
| `zh_daqian` | zh | Bopomofo (Zhuyin) Dàqiān | `a-z` `0-9` `,` `-` `.` `/` `;` | v1.0 |
| `zh_pinyin` | zh | Hanyu Pinyin, tone numbers | `a-z` `1-5` | v1.2 |
| `ja_romaji` | ja | romaji IME, SKK candidates | `a-z` `1-9` | v1.0 |
| `es_accent` | es | accent selectors | `a-z` `1-6` | v1.0 |
| `en_identity` | en | identity | `a-z` | v1.0 |
| `ko_dubeolsik` | ko, zh (hanja conversion) | Dubeolsik (KS X 5002) | `a-z` `E` `O` `P` `Q` `R` `T` `W` | v1.3 |
| `ru_jcuken` | ru | ЙЦУКЕН, PC layout | `a-z` `'` `,` `.` `;` `[` `]` `` ` `` | v1.4 |
| `zh_cangjie` | zh | Cangjie (shape codes, Unihan kCangjie) | `a-y` | v2.1 |
| `zh_quick` | zh | Quick 速成 (first and last Cangjie keys) | `a-y` | v2.1 |
| `vi_telex` | vi | Telex (marks and tones as letters) | `a-z` | v2.3 |
| `vi_vni` | vi | VNI (marks and tones as digits) | `a-z` `1-9` | v2.3 |
| `zh_eten` | zh | Bopomofo (Zhuyin) ETen 倚天 | `a-z` `0-4` `7-9` `'` `,` `-` `.` `/` `;` `=` | v2.4 |
| `zh_jyutping` | zh | Cantonese Jyutping, tone numbers (Unihan kCantonese) | `a-z` `1-6` | v2.4 |
| `ja_kana` | ja | JIS kana, SKK candidates | `a-z` `0-9` `V` `Z` `&` `'` `(` `)` `*` `+` `,` `-` `.` `/` `;` `=` `[` `\` `]` `` ` `` | v2.4 |
| `el_greek` | el | Greek, Windows layout | `a-p` `r-z` `:` `;` `W` | v2.5 |

## Recognition

Ciphertext looks like un-wordlike but *structured* Latin keystrokes:
mostly lowercase, with digits, a few capitals or punctuation marks
depending on the layouts. Random text is usually *not* well-formed IME
input, so the decisive test is parsing a stretch under a suspected
layout. Telltales:

- **Dàqiān:** the digits `3 4 6 7` (tones) only ever end a syllable,
  while `1 2 5 8 9 0` are phonetic symbols (ㄅ ㄉ ㄓ ㄚ ㄞ ㄢ). `-` is ㄦ
  and `/` is ㄥ. Dàqiān never types `'` or `=`.
- **ETen:** Dàqiān's syllables on other keys (你好 is `ne3hz3`, not
  `su3cl3`). The tones `1 2 3 4` (˙ ˊ ˇ ˋ) only ever end a syllable,
  `7 8 9 0` are ㄑ ㄢ ㄣ ㄤ, and `'` (ㄘ) and `=` (ㄦ) are letters.
  ETen never types `5` or `6`.
- **Pinyin:** every syllable ends in a tone digit `1`–`5`, so the text
  cuts after each digit into pinyin spellings (`ni3hao3`), and a pinyin
  stretch never has two digits in a row.
- **Jyutping:** every syllable ends in a Cantonese tone digit `1`–`6`,
  its only digit (`nei5hou2`), and never contains `q`, `r`, `v` or `x`.
- **Cangjie and Quick:** only the letters `a`–`y`: no `z`, no digits,
  no capitals. Every letter but `x` is a one-key code by itself, and
  `x` (難) is never a unit alone. A Cangjie unit is one to five keys, a
  Quick unit one or two, so the cuts are hidden.
- **Japanese romaji:** long vowel-rich runs that parse as romaji and
  never contain `l`, `q`, `v` or `x`, with an optional inline selector
  digit `1`–`9` ending a unit.
- **Japanese kana:** every key is a kana, digits and punctuation
  included. `\` (む) occurs on no other layout, nor do `&` `(` `)` `*`
  `+` (ゃ ょ を ゅ ゑ) and the capitals `V` (ゐ) and `Z` (っ). `[` (゛)
  follows only a kana that has a voiced form, `]` (゜) only one that has
  a semi-voiced form, and neither starts a unit.
- **Spanish accents:** readable Spanish with a digit right after `a e i
  o u n c` (`n1` is ñ); `5` only after `a` or `o`, `6` only after `a`.
- **English:** plain lowercase letters, no digits.
- **Vietnamese Telex:** plain lowercase letters too, but the marks are
  letters inside a syllable (`aa` â, `aw` ă, `ee` ê, `oo` ô, `ow` ơ,
  `uw` ư, `dd` đ) and so are the tones (`s f r x j`): tôi có gì is
  `tooicosgif`. `w` follows only `a`, `o` or `u`, and Telex never types
  `z`.
- **Vietnamese VNI:** a digit right after a letter: `1`–`5` are the
  tones, `6` `7` `8` `9` the marks (â ê ô, ơ ư, ă, đ), as in
  `to6ico1gi2`. VNI never types `f`, `j`, `w` or `z`.
- **Dubeolsik:** capitals only on `Q W E R T O P`, the Shift keys (ㅃ ㅉ
  ㄸ ㄲ ㅆ ㅒ ㅖ), and `E` `O` `P` `Q` `R` `T` occur on no other layout.
  No digits. 2-set Korean alternates consonant and vowel keys:
  consonants sit on `q w e r t a s d f g z x c v`, vowels on `y u i o p
  h j k l b n m`, and every syllable is one consonant key, one or two
  vowel keys, then at most two final consonant keys. So vowel keys come
  in runs of one or two and consonant keys in runs of at most three,
  unless lone jamo are typed (ㅋㅋ is `zz`). The same keys may be
  Korean, or Chinese typed by hanja conversion.
- **ЙЦУКЕН:** punctuation used as letters, inside words: `` ` `` ё,
  `[` х, `]` ъ, `'` э, `,` б, `.` ю, `;` ж. No digits, no capitals.
- **Greek:** never `q`. Three keys type no letter alone and precede
  only a vowel key: `;` the tonos (ά έ ή ί ό ύ ώ), `:` the dialytika
  and Shift-`W` both (ϊ ϋ, ΐ ΰ); `:` occurs on no other layout.

## Examples

Ciphertext `su3cl3` under the Bopomofo Dàqiān layout:
`s`→ㄋ `u`→ㄧ `3`→ˇ | `c`→ㄏ `l`→ㄠ `3`→ˇ ⇒ *nǐ hǎo* ⇒ homophone
candidates {你,妳,尼,…}×{好,郝,…} ⇒ coherence ⇒ **你好**.

Ciphertext `rnrrk` under Dubeolsik (v1.3): `r`→ㄱ `n`→ㅜ `r`→ㄱ |
`r`→ㄱ `k`→ㅏ ⇒ 국 가. Read as Korean, that is the word 국가 ("state")
and the walk ends: the Korean surface is a bijection, so the key holds
no index. Read as Chinese typed by hanja conversion, each syllable opens
a candidate list: 국 → {國,局,菊,鞠,…} (58), 가 → {可,家,加,歌,…} (125)
⇒ coherence ⇒ **國家**, at ranks 0 and 1. Deciding which language sits
behind a Dubeolsik segment is part of the puzzle.

Ciphertext `toyljo` under Quick (v2.1): each unit is two radicals,
`t`→廿 `o`→人 | `y`→卜 `l`→中 | `j`→十 `o`→人, and each opens a long
list: `to` → {歡,欺,蒙,…} (59), `yl` → {新,部,近,…} (38), `jo` →
{家,定,軟,…} (29) ⇒ coherence ⇒ **歡迎家**, at ranks 0, 4 and 0. On
Cangjie the same three characters are `tgnoyhvljmso`, four keys each,
and nearly every Cangjie code names one character, so the key is almost
empty there, but the cuts are hidden: the twelve keys split into units
in 180 ways. Translated from English, 歡迎 is "welcome" and 家 is
"home".

## Encode / decode

The public browser engine is the site, <https://tz-ray.github.io/keypath/>:
it encodes, decodes and draws the walk in the page, reads `kp1` keys and
`#walk` links, and has a workbench that looks up keys and types text on
a layout the visitor names. The reference implementation, in Python, is
private: `keypath encode|decode|analyze`, plus `lookup`, `type`,
`layouts` and `trace` for the mechanical steps of a hand solve, and
`key pack|unpack` for kp1 strings, with pinned data tables and a
single-file offline web decoder that decodes challenges 01–06. The key
stores the walk: per segment the language/layout and route, per unit the
ciphertext length consumed and the branch choice (candidate index →
patch → literal — the "residual ladder"). Round-trip exactness is
guaranteed by construction; the encoder reports how much of the message
leaks into the key. Tables are append-only editions, so every key ever
shipped keeps decoding. The reference implementation's own run of the
Quick example:

```bash
keypath encode --source-lang en --route zh --layout zh_quick --out key.json "welcome home"
# toyljo
# leakage: 0.000
keypath type --layout zh_quick 歡迎家
# (zh, zh_quick)
# 歡 to 0/59
# 迎 yl 4/38
# 家 jo 0/29
```

## Security

None claimed. This is a puzzle cipher: without the key it reduces to
book-cipher-class structure (which is why no general solver exists);
with the key, decoding is deterministic. The intended attack is human:
recognize the layout(s), invert the keystrokes, resolve candidates by
linguistic coherence. `docs/09-analysis.md` measures the ambiguity each
layout adds, the key size in bits, and where the ambiguity lives (in
the key or in the unit boundaries).

## References

- Public site: https://tz-ray.github.io/keypath/ (public browser engine;
  reference implementation private)
- Apple Zhuyin input documentation (Dàqiān layout verification)
- Cross-checks of the authored layouts (not table inputs): libchewing
  `et.rs` (ETen), Mozc's kana tables (JIS kana), CLDR release-43's
  Windows keyboards (Greek, ЙЦУКЕН)
- Data sources (provenance pinned in `tables/VERSIONS.md`, licenses in
  `tables/LICENSES.md`):
  - libchewing-data — zh readings, frequencies, phrases (LGPL-2.1-or-later)
  - CC-CEDICT via MDBG — zh↔en lexicon (CC BY-SA 4.0)
  - SKK-JISYO.L — ja readings → candidates (GPL-2.0-or-later)
  - JMdict via jmdict-simplified — ja↔en lexicon (CC BY-SA 4.0)
  - FreeDict spa-eng — es↔en lexicon (GPL-2.0-or-later)
  - libhangul hanja.txt — hangul → hanja candidates (BSD-3-Clause)
  - kengdic — ko↔en lexicon (LGPL-2.0-or-later)
  - FreeDict rus-eng — ru↔en lexicon, from Wiktionary via WikDict
    (CC BY-SA 3.0)
  - Unihan — Cangjie codes and Cantonese readings, release 18.0.0, in
    `zh_cangjie.tsv` and `zh_jyutping.tsv` (Unicode License V3)
  - FreeDict ell-eng — el↔en lexicon, from Wiktionary via WikDict
    (CC BY-SA 3.0)
  - wordfreq 3.1.1 — frequency order of the es, ko, ru and el lexicons
    (data CC BY-SA 4.0)
  - the layout tables `zh_daqian.tsv`, `ja_romaji.tsv`, `es_accent.tsv`,
    `ko_dubeolsik.tsv`, `ru_jcuken.tsv`, `vi_syllables.tsv`,
    `vi_telex.tsv`, `vi_vni.tsv`, `zh_eten.tsv`, `ja_kana.tsv` and
    `el_greek.tsv` — authored in the repository (MIT); `zh_pinyin.tsv`
    spells libchewing-data's syllables by pinned rules
    (LGPL-2.1-or-later); `zh_cangjie.tsv` and `zh_jyutping.tsv` are
    Unihan-derived (above); `zh_quick` reads `zh_cangjie.tsv`
