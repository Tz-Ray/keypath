# Challenge #11 — intended solve path (SPOILERS)

> **Spoilers.** This is the setter's write-up of how to crack the puzzle
> (from KeyPath 2.6, tag `v2.6`); it may also give away steps of other
> puzzles. The public site it names is the [KeyPath page](https://tz-ray.github.io/keypath/): its
> keyboard pictures, its [workbench](https://tz-ray.github.io/keypath/#workbench) and its playground.
> KeyPath's Python implementation, whose `$ keypath` output it quotes in
> full, is not published; references such as "docs/08 §4" are to its
> unpublished design documents, and paths such as `tables/…` and `tests/…`
> to its unpublished repository. The tables are built from the public
> sources pinned in [`docs/VERSIONS.md`](../../docs/VERSIONS.md).

Ciphertext: `makr;ywfor;a;oxibl;epv;erxomaikaipot;ots;aimemoyseng53dqx83/04` ·
hint: *"Greek first. Then three keyboards on which a digit means three
different things."* · framing: "An English message. Most of it went
through Greek; each of its last three words went through a keyboard of
its own."

Every step uses a tool of the public site: a keyboard picture, the
workbench (Look up keys and Type a guess, on the keyboard you name) or
the playground. Under each step, a `$ keypath` block asks the
command-line tools the same question and shows their real output.

The ciphertext holds `;`, which a shell would read as the end of a
command, so the blocks below pass it through `--ciphertext-file` with a
quoted heredoc, and single-quote every chunk that holds a `;` (docs/10
§3.3).

## Step 1 — Recognition

The card says Greek first. On the site's Greek keyboard picture, `;` is
the accent (tonos), a dead key typed before the vowel it accents, `w` is
the final ς, and `q` types no letter at all. The stream fits up to its
first digit: every `;` there comes before a vowel key, the one `w`
comes early, and there is no `q`. The Greek keyboard types no digit,
so the Greek ends before the first digit, the `5`, or earlier. After
it come three keyboards, one for each of the last three words.

```
$ keypath layouts el_greek
el_greek: Greek, Windows layout (Windows Greek KLID 00000408 on US key positions)
  surfaces: (el, el_greek)
  alphabet: a-p r-z W : ;
  keyboard (el_greek.tsv), each key drawn as `key letter`:
        w ς  e ε  r ρ  t τ  y υ  u θ  i ι  o ο  p π
    a α  s σ  d δ  f φ  g γ  h η  j ξ  k κ  l λ  ; ΄
      z ζ  x χ  c ψ  v ω  b β  n ν  m μ
  shift layer (dead keys): W ΅ (Shift w) · : ¨ (Shift ;)
  dead keys, typed before the vowel they accent: ; ΄ + a ά e έ h ή i ί o ό y ύ v ώ · : ¨ + i ϊ y ϋ · W ΅ + i ΐ y ΰ
  q types the Greek question mark and no letter, so it never occurs in a unit
  unit: one word, typed letter by letter; the 36 letters have distinct keys and a dead key must be followed by a vowel it accents, so no homophone layer
  e.g. καλημέρα = kalhm;era · ευχαριστώ = eyxarist;v · θάλασσα = u;alassa · καΐκι = kaWiki · προϊόν = pro:i;on · οδος = odow
```

## Step 2 — The Greek, letter by letter

On the workbench (keyboard: Greek), the keys before the first digit
read as one run of letters. The Greek keyboard has one letter per key
or dead-key pair, so a chunk has no other reading:

```
$ keypath lookup --layout el_greek 'makr;ywfor;a;oxibl;epv;erxomaikaipot;ots;aimemoyseng'
makr;ywfor;a;oxibl;epv;erxomaikaipot;ots;aimemoyseng · (el, el_greek) · well-formed: yes
  reading: μακρύςφοράόχιβλέπωέρχομαικαιποτότσάιμεμουσενγ
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:μακρύςφοράόχιβλέπωέρχομαικαιποτότσάιμεμουσενγ
```

The final ς closes the first word, and a Greek dictionary cuts the
rest: `makr;yw` μακρύς · `for;a` φορά · `;oxi` όχι · `bl;epv` βλέπω ·
`;erxomai` έρχομαι · `kai` και · `pot;o` ποτό · `ts;ai` τσάι · `me` με ·
`moy` μου · `se` σε, and then `ng`, νγ, which is no Greek word. FreeDict
ell-eng glosses them: μακρύς "long" · φορά "time" · όχι "no" · βλέπω
"see/witness" · έρχομαι "come/happen" · και "and/both" · ποτό
"drink/beverage" · τσάι "tea" · με "with" · μου "my/me/moo" · σε
"to/in/you/on/at/along". One gloss each, word by word, gives "long
time no see" and then "come and drink tea with me at". One trap: the
keys `me` are με, "with"; the English "me" is `moy`, μου.

## Step 3 — Where the Greek ends: a tone

What follows σε is `ng53dqx83/04`. The next keyboard must take the
`ng` with the `5`, or begin earlier. On the workbench with the keyboard
Cantonese Jyutping, `seng5`, `eng5` and `g5` are no readings, and `ng5`
is one, with 五 first of 11. Pinyin, which also ends every syllable in
a tone digit, has no spelling `ng`. CC-CEDICT glosses 五 as "five/5".
Here the 5 is a Cantonese tone.

```
$ keypath lookup --layout zh_jyutping --top 4 ng5 seng5 eng5 g5
ng5 · (zh, zh_jyutping) · well-formed: yes
  reading: ng5
  candidates: 11
  0:五 1:午 2:伍 3:仵  (+7 more)

seng5 · (zh, zh_jyutping) · well-formed: no
  violated rule: unit 'seng5' is not a Jyutping reading on layout zh_jyutping: no character of zh_jyutping.tsv reads 'seng5'

eng5 · (zh, zh_jyutping) · well-formed: no
  violated rule: unit 'eng5' is not a Jyutping reading on layout zh_jyutping: no character of zh_jyutping.tsv reads 'eng5'

g5 · (zh, zh_jyutping) · well-formed: no
  violated rule: unit 'g5' is not a Jyutping reading on layout zh_jyutping: no character of zh_jyutping.tsv reads 'g5'
```

```
$ keypath lookup --layout zh_pinyin ng5
ng5 · (zh, zh_pinyin) · well-formed: no
  violated rule: 'ng' is not a pinyin spelling on layout zh_pinyin
```

## Step 4 — A 3 that is a kana

After `ng5` comes `3dq…`. On ETen, #9's keyboard, `3` is a tone key:
`3dq` puts it first, and `3` alone is a bare tone key. On Jyutping,
`3dq` ends in no tone digit and `3` alone is a bare tone digit.

```
$ keypath lookup --layout zh_eten 3dq 3
3dq · (zh, zh_eten) · well-formed: no
  violated rule: tone key not final in unit '3dq'

3 · (zh, zh_eten) · well-formed: no
  violated rule: unit '3' is a bare tone key
```

```
$ keypath lookup --layout zh_jyutping 3dq 3
3dq · (zh, zh_jyutping) · well-formed: no
  violated rule: unit '3dq' does not end in a tone digit 1-6

3 · (zh, zh_jyutping) · well-formed: no
  violated rule: unit '3' is a bare tone digit
```

So this `3` is a kana. On the site's Japanese kana keyboard picture,
`3` is あ, `d` is し and `q` is た: あした, "tomorrow". JMdict glosses
its word 明日 as "tomorrow" and "near future".

```
$ keypath layouts ja_kana
ja_kana: JIS kana on a US keyboard, as Mozc's macOS kana table (SKK kanji candidates)
  surfaces: (ja, ja_kana)
  alphabet: a-z V Z 0-9 & ' ( ) * + , - . / ; = [ \ ] `
  keyboard (ja_kana.tsv), each key drawn as `key kana`:
    ` ろ  1 ぬ  2 ふ  3 あ  4 う  5 え  6 お  7 や  8 ゆ  9 よ  0 わ  - ほ  = へ
             q た  w て  e い  r す  t か  y ん  u な  i に  o ら  p せ  [ ゛  ] ゜  \ む
              a ち  s と  d し  f は  g き  h く  j ま  k の  l り  ; れ  ' け
                  z つ  x さ  c そ  v ひ  b こ  n み  m も  , ね  . る  / め
  shift layer: & ゃ (Shift 7) · * ゅ (Shift 8) · ( ょ (Shift 9) · ) を (Shift 0) · + ゑ (Shift =) · Z っ (Shift z) · V ゐ (Shift v)
  voiced kana: base key + [ (゛): が t[ ぎ g[ ぐ h[ … (20 kana) · base key + ] (゜): ぱ f] ぴ v] ぷ 2] … (5 kana)
  a unit is one word's kana, key by key: the readings, SKK candidates and indices are ja_romaji's; digits are kana, so there is no inline selector
```

## Step 5 — Bopomofo letters on ETen

The rest, `x83/04`, reads on the workbench with the keyboard Bopomofo
ETen: `x83` is ㄨㄢˇ, with 晚 first of 58, and `/04` is ㄕㄤˋ, with 上
first of 8. Together they are 晚上, which CC-CEDICT glosses as
"evening/night/in the evening". Here 8 and 0 are the Bopomofo letters
ㄢ and ㄤ, and 3 and 4 are tones. On #1's keyboard, Dàqiān, `x83`
reads ㄌㄚˇ, but `/04` is no syllable.

```
$ keypath lookup --layout zh_eten --top 4 x83 /04 83 d q x /
x83 · (zh, zh_eten) · well-formed: yes
  reading: ㄨㄢˇ / wan3
  candidates: 58
  0:晚 1:腕 2:婉 3:碗  (+54 more)

/04 · (zh, zh_eten) · well-formed: yes
  reading: ㄕㄤˋ / shang4
  candidates: 8
  0:上 1:尚 2:蠰 3:仩  (+4 more)

83 · (zh, zh_eten) · well-formed: yes
  reading: ㄢˇ / an3
  candidates: 13
  0:俺 1:黤 2:匼 3:晻  (+9 more)

d · (zh, zh_eten) · well-formed: yes
  reading: ㄉ / d1
  candidates: 1
  0:ㄉ

q · (zh, zh_eten) · well-formed: yes
  reading: ㄟ / ei1
  candidates: 2
  0:欸 1:ㄟ

x · (zh, zh_eten) · well-formed: yes
  reading: ㄨ / wu1
  candidates: 41
  0:於 1:屋 2:喔 3:污  (+37 more)

/ · (zh, zh_eten) · well-formed: yes
  reading: ㄕ / shi1
  candidates: 39
  0:師 1:失 2:施 3:詩  (+35 more)
```

```
$ keypath lookup --layout zh_daqian --top 4 x83 /04
x83 · (zh, zh_daqian) · well-formed: yes
  reading: ㄌㄚˇ / la3
  candidates: 3
  0:拉 1:喇 2:藞

/04 · (zh, zh_daqian) · well-formed: no
  violated rule: unit '/04' maps to 'ㄥㄢˋ', which is not a syllable in the reading table
```

Other boundaries between the kana and ETen parse too, because a kana
unit reads almost any run of keys and ETen reads bare letters such as
`d`, `q`, `x` and `/`. With the kana part as one unit, there are 17
ways to finish the stream, over six kana lengths: for example
`3 | d q x83 /04`, `3dqx | 83 /04` (あしたさ, then 俺上) and
`3dqx83 | /04` (あしたさゆあ, then 上). Only `3dq | x83 /04` gives one
kana word and one ETen word (hint 2) that finish the message.

## Step 6 — Coherence

long time no see come and drink tea with me at five tomorrow evening.
The Greek part is English turned into Greek word by word. On the
playground, other English words type some of the same keys: `my`
types `moy` as `me` does, `in`, `on`, `you` and `along` type `se` as
`at` does, `witness` types `bl;epv` and `both` types `kai`. The idiom
and the grammar pick "see", "and", "me" and "at".

## Step 7 — Confirmation

On the playground (English source), the Greek part on the Greek chip,
"five" on the Jyutping chip, "tomorrow" on the kana chip and "evening"
on the ETen chip type the four pieces:

```
$ keypath encode --source-lang en --route el --layout el_greek --out greek.json "long time no see come and drink tea with me at"
makr;ywfor;a;oxibl;epv;erxomaikaipot;ots;aimemoyse
leakage: 0.000
```

```
$ keypath encode --source-lang en --route zh --layout zh_jyutping --out five.json five
ng5
leakage: 0.000
```

```
$ keypath encode --source-lang en --route ja --layout ja_kana --out tomorrow.json tomorrow
3dq
leakage: 0.000
```

```
$ keypath encode --source-lang en --route zh --layout zh_eten --out evening.json evening
x83/04
leakage: 0.000
```

With the author's key, `trace` walks every piece back to its English
word. Each hop record is the word's place in the English list of the
word it became: "me" is 1 of μου's 3 (my, me, moo), "at" is 4 of σε's
6, and every other word is the first of its list, as "five" is of 五's
2, "tomorrow" of 明日's 2 and "evening" of 晚上's 3.

```
$ keypath trace --key key.json --ciphertext-file - <<'EOF'
makr;ywfor;a;oxibl;epv;erxomaikaipot;ots;aimemoyseng53dqx83/04
EOF
(from the ciphertext and the tables: keys, readings, set sizes; from the key: unit lengths, #indices, hop records, literals)
segment 1 · (el, el_greek) · keyed · hops en>el
  word 1: long
    en>el: μακρύς → #0 of 1 → long (0.00 bits)
    makr;yw → μακρύς → identity → μακρύς (0.00 bits)
  word 2: time
    en>el: φορά → #0 of 1 → time (0.00 bits)
    for;a → φορά → identity → φορά (0.00 bits)
  word 3: no
    en>el: όχι → #0 of 1 → no (0.00 bits)
    ;oxi → όχι → identity → όχι (0.00 bits)
  word 4: see
    en>el: βλέπω → #0 of 2 → see (1.00 bits)
    bl;epv → βλέπω → identity → βλέπω (0.00 bits)
  word 5: come
    en>el: έρχομαι → #0 of 2 → come (1.00 bits)
    ;erxomai → έρχομαι → identity → έρχομαι (0.00 bits)
  word 6: and
    en>el: και → #0 of 2 → and (1.00 bits)
    kai → και → identity → και (0.00 bits)
  word 7: drink
    en>el: ποτό → #0 of 2 → drink (1.00 bits)
    pot;o → ποτό → identity → ποτό (0.00 bits)
  word 8: tea
    en>el: τσάι → #0 of 1 → tea (0.00 bits)
    ts;ai → τσάι → identity → τσάι (0.00 bits)
  word 9: with
    en>el: με → #0 of 1 → with (0.00 bits)
    me → με → identity → με (0.00 bits)
  word 10: me
    en>el: μου → #1 of 3 → me (1.58 bits)
    moy → μου → identity → μου (0.00 bits)
  word 11: at
    en>el: σε → #4 of 6 → at (2.58 bits)
    se → σε → identity → σε (0.00 bits)
  literal: " "
segment 2 · (zh, zh_jyutping) · keyed · hops en>zh
  word 1: five
    en>zh: 五 → #0 of 2 → five (1.00 bits)
    ng5 → ng5 → #0 of 11 → 五 (3.46 bits)
  literal: " "
segment 3 · (ja, ja_kana) · keyed · hops en>ja
  word 1: tomorrow
    en>ja: 明日 → #0 of 2 → tomorrow (1.00 bits)
    3dq → あした → #0 of 3 → 明日 (2.00 bits)
  literal: " "
segment 4 · (zh, zh_eten) · keyed · hops en>zh
  word 1: evening
    en>zh: 晚上 → #0 of 3 → evening (1.58 bits)
    x83 → ㄨㄢˇ / wan3 → #0 of 58 → 晚 (5.86 bits)
    /04 → ㄕㄤˋ / shang4 → #0 of 8 → 上 (3.00 bits)
key bits 50.07 = index 26.07 + residual 24
```

## The aha

In the last ten keys the digits change meaning three times: in `ng5`
the 5 is a Cantonese tone, in `3dq` the 3 is the kana あ, and in
`x83/04` the 8 and 0 are the Bopomofo letters ㄢ and ㄤ, while 3 and 4
are tones. So the two 3s in `3dqx83` mean different things. The Greek
salad μακρύς φορά όχι βλέπω is "long time no see" word by word, an
English idiom often said to be a calque of Chinese 好久不見.

Both readings, recorded:

- `me` is well-formed on `el_greek`, as με "with", which fits "drink
  tea with me", and on `en_identity`, as the English "me", which makes
  no sense inside the Greek; the English "me" is typed `moy`.
- `x83` is well-formed on `zh_eten`, as ㄨㄢˇ (0:晚 of 58), and on
  `zh_daqian`, as ㄌㄚˇ (0:拉 of 3). On Dàqiān the next unit, `/04`,
  fails, so it makes sense only on ETen.

```
$ keypath lookup --layout en_identity me
me · (en, en_identity) · well-formed: yes
  reading: me
  candidates: 1 (identity: the unit is its reading; a key carries no homophone_index)
  0:me
```

Not puns, but recorded: `ng5` fails on Pinyin, and `3dq` reads あした
only on the kana keyboard.
