#!/usr/bin/env python3
"""Build the two fallback glyph fonts in fonts/ from pinned Noto Sans CJK.

The page never needs these on a system with a CJK font: "KeyPath Glyphs"
is the last family in every CJK font stack, and each @font-face carries a
unicode-range, so a browser downloads a file only when some glyph on the
page has no system font.  The subsets cover the curated content only:

  glyphs-tc.woff2  Bopomofo U+3100-312F, the tone marks U+02C7 U+02CA U+02CB
                   U+02D9, hiragana U+3041-3096, and every Han character in
                   index.html, assets/js/ui/text.js, data/hero.json (with
                   its candidate lists), data/layouts.json (the keyboard
                   pictures' legends) and the Python traces of the site's
                   examples (tests/fixtures/traces.jsonl.gz, class "site")
  glyphs-kr.woff2  compatibility jamo U+3131-318E and the Hangul syllables
                   in those same sources

Characters found only in challenge plaintexts are never included (they
would give answers away through the font's character map).

    .venv/bin/python tools/build_fonts.py          # (re)write fonts/
    .venv/bin/python tools/build_fonts.py --check  # rebuild in a temp dir, byte-compare

Downloads go to tools/.cache/ (gitignored) and are sha256-pinned.  The
subsets are renamed "KeyPath Glyphs" (a Modified Version under the SIL OFL
1.1) and keep the upstream copyright and license strings.
"""
from __future__ import annotations

import argparse
import gzip
import os
import hashlib
import io
import json
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

SITE = Path(__file__).resolve().parent.parent
CACHE = SITE / "tools" / ".cache"
TAG = "Sans2.004"
BASE = f"https://github.com/notofonts/noto-cjk/raw/{TAG}"
# The full pan-CJK font (Traditional Chinese glyph forms by default): the
# region subsets (SubsetOTF/TC, /KR) lack characters the page shows, such as
# 内 (the Japanese hero) and the simplified forms in the candidate lists.
SOURCES = {
    "NotoSansCJKtc-Regular.otf": (f"{BASE}/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf",
                                  "dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4"),
    "LICENSE": (f"{BASE}/LICENSE",
                "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2"),
}
FAMILY = "KeyPath Glyphs"
TC_FIXED = (list(range(0x3100, 0x3130)) + [0x02C7, 0x02CA, 0x02CB, 0x02D9]
            + list(range(0x3041, 0x3097)))
KR_FIXED = list(range(0x3131, 0x318F))
LIMITS = {"glyphs-tc.woff2": 70 * 1024, "glyphs-kr.woff2": 70 * 1024}


def fetch(name: str) -> bytes:
    url, sha = SOURCES[name]
    path = CACHE / name
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != sha:
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"[fonts] downloading {url}")
        with urllib.request.urlopen(url, timeout=120) as res:  # noqa: S310 - pinned https URL
            data = res.read()
        got = hashlib.sha256(data).hexdigest()
        if got != sha:
            raise SystemExit(f"{name}: sha256 {got} != pinned {sha}")
        path.write_bytes(data)
    return path.read_bytes()


def is_han(cp: int) -> bool:
    return (0x3400 <= cp <= 0x4DBF or 0x4E00 <= cp <= 0x9FFF or 0xF900 <= cp <= 0xFAFF
            or 0x20000 <= cp <= 0x3134F)


def is_hangul(cp: int) -> bool:
    return 0xAC00 <= cp <= 0xD7A3


def curated_text() -> str:
    parts = []
    for rel in ("index.html", "assets/js/ui/text.js", "data/hero.json", "data/layouts.json"):
        path = SITE / rel
        if path.is_file():
            parts.append(path.read_text(encoding="utf-8"))
    traces = SITE / "tests" / "fixtures" / "traces.jsonl.gz"
    vectors = SITE / "tests" / "fixtures" / "vectors.jsonl.gz"
    site_ids = {json.loads(line)["id"] for line in gzip.open(vectors, "rt", encoding="utf-8")
                if json.loads(line)["class"] == "site"}
    for line in gzip.open(traces, "rt", encoding="utf-8"):
        record = json.loads(line)
        if record["id"] in site_ids:
            parts.append(json.dumps(record["trace"], ensure_ascii=False))
    return "".join(parts)


def challenge_only(curated: set[int]) -> set[int]:
    chars: set[int] = set()
    for path in sorted((SITE / "data" / "challenges").glob("[0-9][0-9].json")):
        chars |= {ord(c) for c in json.loads(path.read_text(encoding="utf-8"))["plaintext"]}
    return chars - curated


def ranges(cps: list[int]) -> str:
    out: list[str] = []
    cps = sorted(set(cps))
    i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f"U+{cps[i]:X}" if i == j else f"U+{cps[i]:X}-{cps[j]:X}")
        i = j + 1
    return ", ".join(out)


def rename(font: TTFont) -> None:
    """A Modified Version under the OFL: its own family name everywhere."""
    names = {1: FAMILY, 2: "Regular", 3: f"{FAMILY} Regular", 4: FAMILY, 6: "KeyPathGlyphs-Regular",
             16: FAMILY, 17: "Regular"}
    table = font["name"]
    for record in list(table.names):
        if record.nameID in names:
            table.removeNames(nameID=record.nameID)
    for name_id, text in names.items():
        table.setName(text, name_id, 3, 1, 0x409)
    if "CFF " in font:
        cff = font["CFF "].cff
        cff.fontNames = ["KeyPathGlyphs-Regular"]
        top = cff.topDictIndex[0]
        top.FullName = f"{FAMILY} Regular"
        top.FamilyName = FAMILY


def build_font(source: bytes, cps: list[int]) -> tuple[bytes, list[int], str]:
    font = TTFont(io.BytesIO(source), recalcTimestamp=False)
    copyright_notice = font["name"].getDebugName(0) or ""
    options = subset.Options()
    options.flavor = "woff2"
    # Glyphs for isolated display only: no OpenType layout, vertical
    # metrics or hinting (they would more than double the size).
    options.layout_features = []
    options.drop_tables += ["GSUB", "GPOS", "BASE", "VORG", "vhea", "vmtx"]
    options.hinting = False
    options.desubroutinize = True
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=cps)
    subsetter.subset(font)
    rename(font)
    out = io.BytesIO()
    font.flavor = "woff2"
    font.save(out)
    covered = sorted(font.getBestCmap())
    return out.getvalue(), covered, copyright_notice


def build(root: Path) -> dict[str, bytes]:
    text = curated_text()
    curated = {ord(c) for c in text}
    han = sorted(cp for cp in curated if is_han(cp))
    hangul = sorted(cp for cp in curated if is_hangul(cp))
    leak = challenge_only(curated)
    tc_cps = sorted(set(TC_FIXED) | set(han))
    kr_cps = sorted(set(KR_FIXED) | set(hangul))
    assert not (set(tc_cps) | set(kr_cps)) & leak, "a challenge-only character would enter a font"
    files: dict[str, bytes] = {}
    source = fetch("NotoSansCJKtc-Regular.otf")
    tc, tc_cov, notice = build_font(source, tc_cps)
    kr, kr_cov, _ = build_font(source, kr_cps)
    missing = sorted(set(tc_cps + kr_cps) - set(tc_cov) - set(kr_cov) - set(range(0x3100, 0x3105)))
    assert not missing, f"the font lacks {''.join(map(chr, missing))}"
    files["fonts/glyphs-tc.woff2"] = tc
    files["fonts/glyphs-kr.woff2"] = kr
    license_text = fetch("LICENSE").decode("utf-8")
    files["fonts/OFL.txt"] = (
        f"{notice}\n\nKeyPath Glyphs (fonts/glyphs-tc.woff2, fonts/glyphs-kr.woff2) are subsets of\n"
        f"Noto Sans CJK TC 2.004 ({SOURCES['NotoSansCJKtc-Regular.otf'][0]}),\n"
        "renamed as Modified Versions under the SIL Open Font License 1.1 below.\n\n" + license_text
    ).encode("utf-8")
    files["fonts/ranges.json"] = (json.dumps({
        "family": FAMILY,
        "glyphs-tc.woff2": ranges(tc_cov),
        "glyphs-kr.woff2": ranges(kr_cov),
    }, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    for rel, data in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    for name, limit in LIMITS.items():
        size = len(files[f"fonts/{name}"])
        assert size <= limit, f"{name}: {size} bytes > {limit}"
    print(f"[fonts] glyphs-tc.woff2 {len(tc)} bytes, {len(tc_cov)} code points ({len(han)} Han)")
    print(f"[fonts] glyphs-kr.woff2 {len(kr)} bytes, {len(kr_cov)} code points ({len(hangul)} syllables)")
    print(f"[fonts] unicode-range tc: {ranges(tc_cov)}")
    print(f"[fonts] unicode-range kr: {ranges(kr_cov)}")
    return files


def main() -> int:
    # fontTools iterates sets of glyph names; pin string hashing so the
    # subsets (and so the woff2 bytes) are the same on every run.
    if os.environ.get("PYTHONHASHSEED") != "0":
        os.environ["PYTHONHASHSEED"] = "0"
        os.execv(sys.executable, [sys.executable, *sys.argv])
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="rebuild in a temp dir and byte-compare")
    args = parser.parse_args()
    if args.check:
        with tempfile.TemporaryDirectory() as tmp:
            files = build(Path(tmp))
            bad = [rel for rel, data in files.items()
                   if not (SITE / rel).is_file() or (SITE / rel).read_bytes() != data]
        if bad:
            print("[check] differs:", *bad, sep="\n  ")
            return 1
        print("[check] fonts/ is up to date")
        return 0
    shutil.rmtree(SITE / "fonts", ignore_errors=True)
    build(SITE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
