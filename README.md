# KeyPath in the browser

The web page for KeyPath, a
puzzle cipher that hides a message in the keystrokes you would type for it
on a Chinese, Japanese, Korean, Russian, Vietnamese or Greek keyboard (or in a
Spanish accent-digit scheme), with a small key that records every choice on the way. The page encodes, decodes and draws the walk
entirely in the browser: a static site with no server, no build step and no
third-party requests. Everything it shows as KeyPath output is exactly what
KeyPath's Python reference implementation (keypath 2.6.0, not published)
produces; the parity tests check this. Its workbench, for solving by hand,
looks up keys and types text on a keyboard the visitor names, never
guessing one, and prints exactly what KeyPath's own `lookup` and `type`
tools print.
KeyPath is a puzzle, not encryption.

The data under `data/` is derived from the tables of keypath 2.6.0 (its tag
`v2.6`, tables edition `05b23739…9bd2`); its sources and licenses are listed in
[DATA-LICENSES.md](DATA-LICENSES.md), with the license texts in
[`LICENSES/`](LICENSES).

## Layout

| path | what |
|------|------|
| `index.html`, `assets/css/site.css` | the page (no build step; served as is) |
| `assets/js/app.js`, `assets/js/ui/` | the page scripts: playground, walk figure, popovers, challenges, share links, workbench |
| `assets/js/engine/` | the engine: plain ES modules, `createEngine()` in `index.js`, the workbench in `workbench.js` |
| `sw.js` | network-first service worker, so the page works offline once loaded |
| `data/` | generated tables the engine loads on demand (never edit by hand) |
| `fonts/` | fallback glyphs, used only when the system has no CJK font |
| `tools/build_data.py` | writes `data/` and `tests/fixtures/` from the Python implementation |
| `tools/copy_docs.py` | copies the puzzles, the analysis and the table provenance into `puzzles/` and `docs/` |
| `tools/build_fonts.py` | writes `fonts/` from pinned Noto Sans CJK |
| `tools/serve.mjs` | a static server that mounts the repo at `/keypath/`, like GitHub Pages |
| `tools/cdp.mjs` | end-to-end checks in headless Chromium, and screenshots |
| `tools/check_links.mjs` | checks the page's external links (network) |
| `puzzles/` | the twelve challenges: ciphertext and, as spoilers, key, plaintext and solve path (and the hints of 7 to 12) |
| `docs/` | `analysis.md` (the figures the page quotes) and `VERSIONS.md` (every table's upstream, pinned by sha256; a byte-for-byte copy, so the scripts it names are KeyPath's unpublished ones) |
| `LICENSES/` | the GPL, LGPL and Unicode license texts the data needs |
| `tests/` | `node --test` suites; `tests/fixtures/` is generated (`sources.json` says which sources every generated file derives from; the NOTICE files follow from it) |

## Rebuilding the data

The build reads a checkout of KeyPath's Python implementation at tag
`v2.6` (its repository is not published), given by `KEYPATH_PROJECT`
(default: `../cipher-project`, next to this repository), as files and uses
its `keypath` package, installed into a local virtual environment:

```sh
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python /path/to/cipher-project   # at tag v2.6
uv pip install --python .venv/bin/python -r tools/requirements.txt
.venv/bin/python tools/build_data.py            # data/ and tests/fixtures/
.venv/bin/python tools/copy_docs.py            # puzzles/ and docs/
.venv/bin/python tools/build_fonts.py           # fonts/ (downloads to tools/.cache/)
```

`tools/copy_docs.py` reads git tags of that checkout: puzzles 1 to 6 from
`v2.0` and puzzles 7 to 12 from `v2.6`, where each set was made, and the
analysis and `VERSIONS.md` from `v2.6`.
The scripts are deterministic; `--check` rebuilds into a temporary
directory and fails if anything differs from the committed files.

## Running locally

```sh
node tools/serve.mjs 8080        # then open http://127.0.0.1:8080/keypath/
```

Every URL in the page is relative, so it works under any subpath; GitHub
Pages serves the `main` branch root at https://tz-ray.github.io/keypath/.

## Testing

```sh
npm test          # or: node --test "tests/**/*.test.js"
node tools/cdp.mjs [--shots DIR]   # the browser checks on their own, optionally with screenshots
node tools/check_links.mjs         # needs the network: every external link resolves when signed out
```

The engine suites compare the JavaScript engine with fixtures the Python
implementation generated: about 15,600 encode/decode vectors over every live
route (KeyPath's test corpora and golden vectors, seeded fuzz strings,
edge cases), 489 walk traces, 309 tampered keys, and exhaustive digests of
every Chinese phrase and character on all seven Chinese keyboards, every
reading, every Cangjie and Quick code, every Cantonese (Jyutping) reading,
every Korean syllable, every hanja reading, every Vietnamese syllable (all
111,003, with their Telex and VNI keys), every string of up to three JIS
kana keys and of up to three kana, every Greek letter's keys and every
string of up to three Greek keys, and every English row (the ETen, Quick
and JIS kana rows, which the page derives from the Bopomofo, Cangjie and
romaji rows, included). The build itself asserts that each derived row
equals the row KeyPath's own encoder gives, for every word of the English
list, and that the same words have rows. The Vietnamese keyboards are written from KeyPath's
specification (the syllable grammar, the keys that type each syllable and
the one pass that reads keys back); their verdict on every string of up to
four Telex keys or three VNI keys, and on about 14,000 longer strings near
real syllables, must equal the Python reference's. The Greek keyboard is
written from its specification too (the accent's dead key typed before
the letter, and the one left-to-right reading of a word's keys); Greek
text is normalized as the Python reference normalizes it (lowercase with
the final-sigma rule, then composed again), and keys that translate out of
Greek are refused, since the page does not carry the Greek-to-English
lists.
The short keys (kp1, one line starting `kp1.`) have their own codec in
`assets/js/engine/kp1.js`, written from KeyPath's kp1 specification: it
packs every key in the fixtures to the same string as the Python reference
(about 15,000 keys), unpacks the reference's golden kp1 strings to their
keys, and refuses every one of its reject vectors and every key that asks
for inline selectors on a keyboard that has none.

The workbench has its own fixtures, printed by KeyPath's `lookup` and
`type` commands themselves: about 1,000 lookups (more than half of them keys
that do not read, reaching every rule a unit can break on every workbench
keyboard, ETen, Jyutping and Greek included, with keys holding quotes and
backslashes) and about 720 typed texts, all of which the page must print
byte for byte; Python's `repr`,
which those messages quote with, is checked against Python on every value
they quote. `tests/no-solver.test.js` holds the engine to the public
surface listed in `tests/engine-allowlist.js`, and calls every function in
it with an unsplit stream of keys and no keyboard: none may answer with
ways to split it, and the workbench answers nothing without a keyboard.

The page suites check the copy (no leftover development text, honest
wording, only relative or credited links), that every figure hard-coded in
`index.html` matches the build's output, that nothing shown before a reveal
spoils a challenge (no card and no hint of challenges 7 to 12 breaks their
setter's spoiler rule, and no hint is in the page or the card data: the
page fetches each one, from a file of its own, when the visitor asks for
it), the payload budget, and colour contrast in both themes.
`tests/keyboard.test.js` holds the keyboard pictures to KeyPath's own
legends (`tests/fixtures/legends.json`, from its tables): the US rows with
`=` and `\`, one US shift map, and on every keyboard drawn as keys exactly
the legend KeyPath gives each key, the shift layers of the Korean, JIS
kana and Greek keyboards included (ETen's `7` is ㄑ, kana's `\` is む,
Shift+`0` is を; Greek's dead keys are `;` for the tonos ΄, Shift+`;` for
the dialytika ¨ and Shift+`W` for both, ΅, and `q` types no letter).
`tests/e2e.test.js` runs `tools/cdp.mjs` when a Chromium binary is found
(Playwright's cache, or `KEYPATH_CHROME`) and is skipped otherwise: it
serves the site under `/keypath/`, types messages on every keyboard and
compares the rendered ciphertext and key with the fixtures, clicks the
examples, renders all twelve challenges and checks a right and a wrong
answer on each, keeps every hint of challenges 7 to 12 off the page and
off the network until the click that asks for it, reveals every challenge
and walks it back (each card's solve-path link names a file this
repository has), checks that walking back a key of challenges 1 to 6
fetches nothing of 7 to 12, walks tampered keys, checks keyboard
navigation, IME composition, share links, reduced motion, offline reload,
horizontal overflow from 360 px up (long literals, long words and error
paths included), the Cangjie radicals on the keyboard picture and the walk,
the Vietnamese goldens typed on the Telex and VNI keyboards, detection of
Vietnamese, the Telex and VNI legends and each letter over its keys, the
ETen and Jyutping goldens typed on their keyboards, a Japanese message
refused and the JIS kana golden's key walked back, walk links on the new
keyboards, the ETen, Jyutping and kana pictures (the kana shift layer
included) inside 360 px, the Greek goldens typed on the Greek keyboard
(in Greek and from English), detection of Greek, each Greek letter over
its keys (an accent's dead key first), keys that translate out of Greek
refused with the page's reason (pasted and as walk links), walk links on
Greek, the Greek picture with its dead keys and Shift layer inside 360 px,
touch-target sizes, focus after popovers and reveals, the workbench (no
keyboard picked for the visitor, lookups and typing on every keyboard
against the fixtures, refused keys, long answers at 360 px),
share links with a hand-picked language, puzzles through a dictionary,
walk links (`#walk=`, opened in a fresh browser, refused keys, markup that
must stay text), and that the page makes no request outside its own origin
and logs no errors.

Everything needs only Node.js 22 or later and this repository.
