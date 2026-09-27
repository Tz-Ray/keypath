# Challenge #3 — intended solve path (SPOILERS)

> A copy of `puzzles/challenge-03/solve-path.md` from KeyPath 2.0 (tag `v2.0`). The commands it
> names (`keypath lookup`, `keypath layouts`, …) and the paths under
> `tables/`, `docs/`, `scripts/` and `tests/` belong to KeyPath's Python
> implementation, which is not published. The table provenance it
> cites is [`docs/VERSIONS.md`](../../docs/VERSIONS.md) here, and the
> [KeyPath page](https://tz-ray.github.io/keypath/) does the same lookups in your browser.

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

## Leakage

0/26 = 0.000. Korean is written with spaces, and the joiner elides them
(docs/07 §3), so the key carries no literal text at all. The only
information the key adds is the unit lengths and their grouping into
words, which is where decode puts the six spaces back. The lengths fix
every syllable boundary, including the `dyzz` fork of step 3. The
grouping follows standard Korean spacing (걸, short for 것을, is written
apart), and ㅋㅋ stands apart too. A solver cannot recover it from the
ciphertext, so the README says answers are compared with spaces
ignored.

## How it was minted

One segment, source language ko, typed on `ko_dubeolsik`:

```
$ keypath encode --source-lang ko --out key.json --segments '[{"length":26,"route":"ko","layout":"ko_dubeolsik","selector_mode":"keyed","hint":"Nobody pressed the key to the right of the space bar."}]' '안녕하세요 한영 전환하는 걸 또 깜빡했어요 ㅋㅋ'
dkssudgktpdygksdudwjsghksgksmsrjfEhRkaQkrgoTdjdyzz
leakage: 0.000
```

## Fairness checklist (docs/03 §5), answered

1. **Is the keystroke layer recognizable?** Yes. It is a valid 2-set key
   log. The capitals are a fingerprint anyone can check against the
   public alphabets, and the opener `dkssudgktpdy` is famous on its own.
2. **Does one coherent decoding exist and stand out?** Yes. The layout
   is bijective, so no candidate is ever chosen. Standard 2-set assembly
   reads the whole stream as the message except at `dyzz`, which splits
   as 욬ㅋ or 요ㅋㅋ. Only 요ㅋㅋ is Korean.
3. **Are the tables public and derivable?** Yes. The keyboard is
   `ko_dubeolsik.tsv` (docs/07 §6, KS X 5002), pinned in
   `tables/VERSIONS.md`. Syllables compose by the Unicode §3.12
   arithmetic. No lexicon is involved.
4. **Is the difficulty tuned to the audience?** Yes. This is the entry
   rung for the layouts added since v1.0: one keyboard, no homophones,
   no translation, a famous opener and one trap.

## Playtest

Blind-solved on 2026-09-24 by an independent solver who saw only the
public page, the earlier challenges and the tools. They named the 한/영
key from the hint, confirmed `ko_dubeolsik` with `keypath layouts`, and
read every syllable. One early mis-split (`gks|ms`) was rejected at once
by `keypath lookup`. The only difference from `plaintext.txt` was
spacing: they wrote 깜빡했어요ㅋㅋ with no space, and said spacing could
not be recovered. The README now says how answers are checked (spaces
ignored, one language, no punctuation). The hint and the key are
unchanged.
