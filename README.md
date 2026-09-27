# KeyPath in the browser

The web page for [KeyPath](https://github.com/Tz-Ray/cipher-project), a
puzzle cipher that hides a message in the raw keystrokes of a Chinese,
Japanese, Korean, Russian or Spanish keyboard, with a small key that records
every choice on the way. The page encodes, decodes and draws the walk
entirely in the browser: a static site with no server, no build step and no
third-party requests. Everything it shows as KeyPath output is exactly what
the command-line tool, keypath 2.0.0, produces; the parity tests check this.
KeyPath is a puzzle, not encryption.

The data under `data/` is derived from the keypath v2.0 tables (tag `v2.0`,
tables edition `67a40391…61f2`); its sources and licenses are listed in
[DATA-LICENSES.md](DATA-LICENSES.md).

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
| `tools/build_fonts.py` | writes `fonts/` from pinned Noto Sans CJK |
| `tools/serve.mjs` | a static server that mounts the repo at `/keypath/`, like GitHub Pages |
| `tools/cdp.mjs` | end-to-end checks in headless Chromium, and screenshots |
| `tests/` | `node --test` suites; `tests/fixtures/` is generated |

## Rebuilding the data

The build reads the cipher project (by default `/home/linuxuser1/cipher-project`,
or `KEYPATH_PROJECT`) as files and uses its `keypath` package, installed into a
local virtual environment:

```sh
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python /path/to/cipher-project   # at tag v2.0
uv pip install --python .venv/bin/python -r tools/requirements.txt
.venv/bin/python tools/build_data.py            # data/ and tests/fixtures/
.venv/bin/python tools/build_fonts.py           # fonts/ (downloads to tools/.cache/)
```

Both scripts are deterministic; `--check` rebuilds into a temporary
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
```

The engine suites compare the JavaScript engine with fixtures the Python
implementation generated: about 7,400 encode/decode vectors over every live
route (the cipher project's corpora and golden vectors, seeded fuzz strings,
edge cases), 419 walk traces, 149 tampered keys, and exhaustive digests of
every Chinese phrase and character on all three Chinese keyboards, every
reading, every Korean syllable, every hanja reading and every English row.

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
horizontal overflow from 360 px up, and that the page makes no request
outside its own origin and logs no errors.

Everything needs only Node.js 22 or later and this repository.
