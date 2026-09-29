#!/usr/bin/env python3
"""Copy the puzzles, the analysis and the table provenance from KeyPath.

The cipher project's repository is not public, so the page links to these
copies in this repository instead.  Files are read from the project's git
tags, never its working tree: the six puzzles from `v2.0`, where they were
set (their solve paths describe that release's keyboards), and the
analysis and the table provenance from `v2.3`, whose tables edition the
data under data/ is built from.  Until that tag is made, they are read
from the checkout's committed HEAD, and only if that is the release
candidate (its package version is 2.3.0).  A solve path keeps its title and its
solving steps (the setter's notes after them, which cite unpublished
documents and tools, are left out) and gets a short preface; the analysis
gets a preface too; everything else is copied byte for byte.

    python3 tools/copy_docs.py            # (re)write docs/ and puzzles/
    python3 tools/copy_docs.py --check    # fail if any copy differs
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
PROJECT = Path(os.environ.get("KEYPATH_PROJECT", SITE.parent / "cipher-project"))
PUZZLES_TAG = "v2.0"
DOCS_TAG = "v2.3"
DOCS_VERSION = "2.3.0"   # the package version of that tag (and of its candidate)
PAGE = "https://tz-ray.github.io/keypath/"
RULES = "All keyboards are PC layouts. Answers ignore spaces, punctuation and capitals."

# The setter's notes that follow the solving steps: they cite unpublished
# design documents, tools and review history, so the copies end before them.
SETTER_NOTES = re.compile(r"^## (Leakage|How it was minted|Fairness checklist|Playtest)\b", re.M)
# Text removed from a copy: {file: [(exact text, replacement)]}.  Each must
# match exactly once, so a change upstream fails the build instead of leaking.
CUTS = {
    # a hint for #5, given away the moment #4 is revealed
    "puzzles/challenge-04/solve-path.md": [(' Note for later: `lheu` =\nдруг, "friend".', "")],
}

SOLVE_PREFACE = """\
> **Spoilers.** This is the setter's write-up of how to crack the puzzle
> (from KeyPath 2.0, tag `v2.0`); it may also give away steps of later
> puzzles. The command output it quotes (`keypath lookup`, `keypath
> analyze`, …) comes from KeyPath's Python implementation, which is not
> published, and is shown in full. Where it calls a table public, it means
> the public dictionaries and layouts the tables are built from, pinned in
> [`docs/VERSIONS.md`](../../docs/VERSIONS.md); the keyboard layouts are also
> in the [KeyPath page]({page})'s keyboard panel and in
> [`data/layouts.json`](../../data/layouts.json). References such as
> "docs/06 §5.1" are to KeyPath's unpublished design documents.

"""

ANALYSIS_PREFACE = """\
> From KeyPath 2.3 (tag `v2.3`). The scripts, tests and design documents
> it cites (`scripts/analysis.py`, `tests/…`, "docs/07 §10", "M12") belong
> to KeyPath's Python implementation, which is not published; the tables
> it measures are built from the sources pinned in
> [`VERSIONS.md`](VERSIONS.md). The figures on the [KeyPath page]({page})
> come from this document.

"""


def show_bytes(path: str, tag: str = PUZZLES_TAG) -> bytes:
    return subprocess.run(["git", "-C", str(PROJECT), "show", f"{tag}:{path}"],
                          check=True, capture_output=True).stdout


def show(path: str, tag: str = PUZZLES_TAG) -> str:
    return show_bytes(path, tag).decode("utf-8")


def docs_ref() -> str:
    """DOCS_TAG once it exists; before, the checkout's HEAD, which must be
    that release's candidate (package version DOCS_VERSION)."""
    tags = subprocess.run(["git", "-C", str(PROJECT), "tag", "--list", DOCS_TAG],
                          check=True, capture_output=True, text=True).stdout.split()
    if DOCS_TAG in tags:
        return DOCS_TAG
    version = re.search(r'^version = "([^"]+)"', show("pyproject.toml", "HEAD"), re.M)
    assert version and version.group(1) == DOCS_VERSION, \
        f"no tag {DOCS_TAG}, and HEAD is not its candidate ({version and version.group(1)})"
    return "HEAD"


def with_preface(text: str, preface: str) -> bytes:
    """The text with the preface after its title line."""
    title, _, body = text.partition("\n\n")
    return f"{title}\n\n{preface.format(page=PAGE)}{body}".encode("utf-8")


def solve_path(path: str) -> bytes:
    text = show(path)
    notes = SETTER_NOTES.search(text)
    assert notes, f"{path}: no setter's notes heading"
    text = text[:notes.start()].rstrip("\n") + "\n"
    for old, new in CUTS.get(path, []):
        assert text.count(old) == 1, f"{path}: cut text not found exactly once: {old!r}"
        text = text.replace(old, new)
    return with_preface(text, SOLVE_PREFACE)


def puzzles_index() -> str:
    index = json.loads((SITE / "data/challenges/index.json").read_text(encoding="utf-8"))
    rows = "\n".join(
        f"| {c['n']} | {c['difficulty']} | {c['title']} | {c['blurb']} | "
        f"{c['keyboards'] or ''} | [`challenge-{c['n']:02d}/`](challenge-{c['n']:02d}/) |"
        for c in index)
    return ("# The six KeyPath puzzles\n\n"
            f"Play them on the [KeyPath page]({PAGE}#challenges): each is a ciphertext with no key.\n"
            f"Work out the keyboard, read the keys, and pick the words that make sense. {RULES}\n\n"
            "| # | level | title | hint | keyboards | files |\n"
            "|---|-------|-------|------|-----------|-------|\n"
            f"{rows}\n\n"
            "Each folder holds the puzzle's `ciphertext.txt` and, as **spoilers**, the author's\n"
            "`key.json`, the `plaintext.txt` and `solve-path.md`, the setter's way to crack it.\n"
            "A solve path may also give away steps of later puzzles.\n")


def build() -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for n in range(1, 7):
        src = f"puzzles/challenge-{n:02d}"
        for name in ("ciphertext.txt", "key.json", "plaintext.txt"):
            files[f"{src}/{name}"] = show(f"{src}/{name}").encode("utf-8")
        files[f"{src}/solve-path.md"] = solve_path(f"{src}/solve-path.md")
    files["puzzles/README.md"] = puzzles_index().encode("utf-8")
    ref = docs_ref()
    files["docs/analysis.md"] = with_preface(show("docs/09-analysis.md", ref), ANALYSIS_PREFACE)
    # verbatim: its sha256 is the tables edition
    files["docs/VERSIONS.md"] = show_bytes("tables/VERSIONS.md", ref)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if any copy differs")
    args = parser.parse_args()
    files = build()
    if args.check:
        bad = [rel for rel, data in files.items()
               if not (SITE / rel).is_file() or (SITE / rel).read_bytes() != data]
        print("[check] differs:", *bad, sep="\n  ") if bad else print("[check] copies are up to date")
        return 1 if bad else 0
    for rel, data in files.items():
        (SITE / rel).parent.mkdir(parents=True, exist_ok=True)
        (SITE / rel).write_bytes(data)
    print(f"wrote {len(files)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
