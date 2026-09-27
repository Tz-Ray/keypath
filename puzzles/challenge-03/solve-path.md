# Challenge #3 — intended solve path (SPOILERS)

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

Ciphertext: `dkssudgktpdygksdudwjsghksgksmsrjfEhRkaQkrgoTdjdyzz` · hint:
*"Nobody pressed the key to the right of the space bar."*

## Step 1 — Recognition

The stream is 50 keys, all letters: no digits, no punctuation, and four
capitals, `E`, `R`, `Q` and `T`, sitting inside lowercase runs. Of the
seven layouts `keypath layouts` prints, `ko_dubeolsik` is the only one
whose alphabet has capitals (docs/07 §4). On the Korean 2-set
(Dubeolsik) keyboard, Shift types the tense consonants (and ㅒ ㅖ).

The hint agrees. On a Korean keyboard the key to the right of the space
bar is 한/영 (Han/Yeong; right Alt on many laptops), which toggles
between Korean and English input. Nobody pressed it, so Korean was typed
while the English layout was active. The stream opens with
`dkssudgktpdy`, the best-known wrong-layout string on the Korean
internet: 안녕하세요, "hello".

## Step 2 — Layout inversion

The public map (`tables/ko_dubeolsik.tsv`, KS X 5002):

```
$ keypath layouts ko_dubeolsik
ko_dubeolsik: Hangul Dubeolsik (KS X 5002) — the standard Korean keyboard
  surfaces: (ko, ko_dubeolsik), (zh, ko_dubeolsik)
  alphabet: a-z E O-R T W
  keyboard (ko_dubeolsik.tsv), each key drawn as `key jamo`:
    q ㅂ  w ㅈ  e ㄷ  r ㄱ  t ㅅ  y ㅛ  u ㅕ  i ㅑ  o ㅐ  p ㅔ
     a ㅁ  s ㄴ  d ㅇ  f ㄹ  g ㅎ  h ㅗ  j ㅓ  k ㅏ  l ㅣ
         z ㅋ  x ㅌ  c ㅊ  v ㅍ  b ㅠ  n ㅜ  m ㅡ
  shifted (Shift+key): Q ㅃ · W ㅉ · E ㄸ · R ㄲ · T ㅆ · O ㅒ · P ㅖ
  compound vowels: ㅘ hk · ㅙ ho · ㅚ hl · ㅝ nj · ㅞ np · ㅟ nl · ㅢ ml
  compound finals: ㄳ rt · ㄵ sw · ㄶ sg · ㄺ fr · ㄻ fa · ㄼ fq · ㄽ ft · ㄾ fx · ㄿ fv · ㅀ fg · ㅄ qt
  unit: one syllable typed initial + vowel (+ final), or one lone jamo; 11,223 units with pairwise-distinct keys
  e.g. 한 = gks · 국 = rnr · 과 = rhk · 값 = rkqt · 빠 = Qk · 있 = dlT · ㅋ = z · ㄳ = rt
```

The keyboard puts the consonants on the left half (the q–t, a–g and z–v
keys) and the vowels on the right half (y–p, h–l, b–m). Shift gives ㅃ ㅉ
ㄸ ㄲ ㅆ ㅒ ㅖ, so the four capitals are ㄸ ㄲ ㅃ ㅆ. `hk` is the compound
vowel ㅘ.

Assemble syllables the 2-set way: a consonant followed by a vowel opens
a new syllable, and a consonant after a vowel is a final until the next
vowel claims it. The syllables, with the words separated by `·`:

    dks sud gk tp dy · gks dud · wjs ghks gk sms · rjf · Eh · Rka Qkr goT dj dy · z z

## Step 3 — The trap

You can also type the stream into any 2-set IME. It comes out as

    안녕하세요한영전환하는걸또깜빡했어욬ㅋ

The IME is greedy. After `dy` (요) it takes the first `z` (ㅋ) as a final
consonant, making 욬, and leaves the second `z` as a lone ㅋ. A Korean
reader undoes that at once: the sentence ends in 요, and `zz` is ㅋㅋ,
the Korean "lol".

## Step 4 — Candidates

There are none to choose from. (ko, ko_dubeolsik) is bijective: every
syllable or lone jamo has exactly one key sequence, and every key
sequence of a unit types exactly one of them. `keypath lookup` also
prints the hanja surface, where the same keys stand for Chinese typed
by its Korean reading. That is a red herring here, because the hangul
already reads as Korean:

```
$ keypath lookup --layout ko_dubeolsik dks
dks · (ko, ko_dubeolsik) · well-formed: yes
  reading: 안
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:안

dks · (zh, ko_dubeolsik) · well-formed: yes
  reading: 안
  candidates: 60
  0:安 1:案 2:眼 3:顔 4:岸 5:雁 6:鞍 7:按 8:晏 9:鮟  (+50 more)
```

## Step 5 — Coherence

> 안녕하세요 한영 전환하는 걸 또 깜빡했어요 ㅋㅋ

"Hello! I forgot to switch Han/Yeong again, lol." The six keys `gksdud`
spell 한영: the message names the key the hint says nobody pressed.
Solved.

With the author's key, `analyze` confirms it: 20 units, every candidate
set of size 1, nothing leaked.

```
$ keypath analyze --key key.json --ciphertext-file ciphertext.txt
keypath 1.1 · source language: ko
segment 0: ko/ko_dubeolsik selector=keyed words=7 units=20 literal_chars=0 translated=0
  hint: Nobody pressed the key to the right of the space bar.
  route: keystroke:ko_dubeolsik
  candidate set sizes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] (forced: 20, keyspace ~10^0.0)
total homophone keyspace ~10^0.0
leaked chars (tier 2/3): 0
leakage: 0.000 (0/26 chars)
```
