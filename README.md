# KeyPath in the browser

The web page for KeyPath, a
puzzle cipher that hides a message in the keystrokes you would type for it
on a Chinese, Japanese, Korean or Russian keyboard (or in a Spanish
accent-digit scheme), with a small key that records every choice on the way. The page encodes, decodes and draws the walk
entirely in the browser: a static site with no server, no build step and no
third-party requests. Everything it shows as KeyPath output is exactly what
KeyPath's Python reference implementation (keypath 2.2.0, not published)
produces; the parity tests check this.
KeyPath is a puzzle, not encryption.

The data under `data/` is derived from the tables of keypath 2.2.0 (its tag
`v2.2`, tables edition `be6aa047…8732`, the edition of `v2.1`); its sources and licenses are listed in
[DATA-LICENSES.md](DATA-LICENSES.md), with the license texts in
[`LICENSES/`](LICENSES).

## Layout

| path | what |
|------|------|
| `index.html`, `assets/css/site.css` | the page (no build step; served as is) |
| `assets/js/app.js`, `assets/js/ui/` | the page scripts: playground, walk figure, popovers, challenges, share links |
| `assets/js/engine/` | the engine: plain ES modules, `createEngine()` in `index.js` |
| `sw.js` | network-first service worker, so the page works offline once loaded |
| `data/` | generated tables the engine loads on demand (never edit by hand) |
| `fonts/` | fallback glyphs, used only when the system has no CJK font |
| `tools/build_data.py` | writes `data/` and `tests/fixtures/` from the Python implementation |
| `tools/copy_docs.py` | copies the puzzles, the analysis and the table provenance into `puzzles/` and `docs/` |
| `tools/build_fonts.py` | writes `fonts/` from pinned Noto Sans CJK |
| `tools/serve.mjs` | a static server that mounts the repo at `/keypath/`, like GitHub Pages |
| `tools/cdp.mjs` | end-to-end checks in headless Chromium, and screenshots |
| `tools/check_links.mjs` | checks the page's external links (network) |
| `puzzles/` | the six challenges: ciphertext and, as spoilers, key, plaintext and solve path |
| `docs/` | `analysis.md` (the figures the page quotes) and `VERSIONS.md` (every table's upstream, pinned by sha256; a byte-for-byte copy, so the scripts it names are KeyPath's unpublished ones) |
| `LICENSES/` | the GPL, LGPL and Unicode license texts the data needs |
| `tests/` | `node --test` suites; `tests/fixtures/` is generated (`sources.json` says which sources every generated file derives from; the NOTICE files follow from it) |

## Rebuilding the data

The build reads a checkout of KeyPath's Python implementation at tag
`v2.2` (its repository is not published), given by `KEYPATH_PROJECT`
(default: `../cipher-project`, next to this repository), as files and uses
its `keypath` package, installed into a local virtual environment:

```sh
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python /path/to/cipher-project   # at tag v2.2
uv pip install --python .venv/bin/python -r tools/requirements.txt
.venv/bin/python tools/build_data.py            # data/ and tests/fixtures/
.venv/bin/python tools/copy_docs.py            # puzzles/ and docs/
.venv/bin/python tools/build_fonts.py           # fonts/ (downloads to tools/.cache/)
```

`tools/copy_docs.py` reads git tags of that checkout: the puzzles from
`v2.0`, where they were set, and the analysis and `VERSIONS.md` from `v2.1`.
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
implementation generated: about 10,400 encode/decode vectors over every live
route (KeyPath's test corpora and golden vectors, seeded fuzz strings,
edge cases), 421 walk traces, 193 tampered keys, and exhaustive digests of
every Chinese phrase and character on all five Chinese keyboards, every
reading, every Cangjie and Quick code, every Korean syllable, every hanja
reading and every English row (the Quick rows, which the page derives from
the Cangjie rows, included). The build itself asserts that each derived
Quick row equals the row KeyPath's own encoder gives, for every word of the
English list.

The page suites check the copy (no leftover development text, honest
wording, only relative or credited links), that every figure hard-coded in
`index.html` matches the build's output, that nothing shown before a reveal
spoils a challenge, the payload budget, and colour contrast in both themes.
`tests/e2e.test.js` runs `tools/cdp.mjs` when a Chromium binary is found
(Playwright's cache, or `KEYPATH_CHROME`) and is skipped otherwise: it
serves the site under `/keypath/`, types messages on every keyboard and
compares the rendered ciphertext and key with the fixtures, clicks the
examples, reveals every challenge, walks tampered keys, checks keyboard
navigation, IME composition, share links, reduced motion, offline reload,
horizontal overflow from 360 px up (long literals, long words and error
paths included), the Cangjie radicals on the keyboard picture and the walk,
touch-target sizes, focus after popovers and reveals,
share links with a hand-picked language, puzzles through a dictionary,
and that the page makes no request outside its own origin and logs no
errors.

Everything needs only Node.js 22 or later and this repository.
