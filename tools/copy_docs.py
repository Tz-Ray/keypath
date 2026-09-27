#!/usr/bin/env python3
"""Copy the puzzles, the analysis and the table provenance from keypath v2.0.

The cipher project's repository is not public, so the page links to these
copies in this repository instead.  Files are read from the project's git
tag `v2.0` (never its working tree); Markdown copies get a one-paragraph
preface after the title, everything else is copied byte for byte.

    python3 tools/copy_docs.py            # (re)write docs/ and puzzles/
    python3 tools/copy_docs.py --check    # fail if any copy differs
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
PROJECT = Path(os.environ.get("KEYPATH_PROJECT", SITE.parent / "cipher-project"))
TAG = "v2.0"
PAGE = "https://tz-ray.github.io/keypath/"


def preface(source: str) -> str:
    return (f"> A copy of `{source}` from KeyPath 2.0 (tag `{TAG}`). The commands it\n"
            "> names (`keypath lookup`, `keypath layouts`, …) and the paths under\n"
            "> `tables/`, `docs/`, `scripts/` and `tests/` belong to KeyPath's Python\n"
            "> implementation, which is not published. The table provenance it\n"
            "> cites is [`docs/VERSIONS.md`](../docs/VERSIONS.md) here, and the\n"
            f"> [KeyPath page]({PAGE}) does the same lookups in your browser.\n\n")


def with_preface(path: str, up: str) -> bytes:
    """The file with the preface after its title line; `up` leads back to the site root."""
    title, _, body = show(path).decode("utf-8").partition("\n\n")
    return f"{title}\n\n{preface(path).replace('](../', f']({up}')}{body}".encode("utf-8")


def show(path: str) -> bytes:
    return subprocess.run(["git", "-C", str(PROJECT), "show", f"{TAG}:{path}"],
                          check=True, capture_output=True).stdout


def puzzles_index() -> str:
    index = json.loads((SITE / "data/challenges/index.json").read_text(encoding="utf-8"))
    rows = "\n".join(f"| {c['n']} | {c['difficulty']} | {c['title']} | "
                     f"[`challenge-{c['n']:02d}/`](challenge-{c['n']:02d}/) |" for c in index)
    return ("# The six KeyPath puzzles\n\n"
            f"Play them on the [KeyPath page]({PAGE}#challenges). Each folder holds the\n"
            "puzzle's `ciphertext.txt` and, as **spoilers**, the author's `key.json`, the\n"
            "`plaintext.txt` and `solve-path.md`, the intended way to crack it.\n\n"
            "| # | level | title | files |\n|---|-------|-------|-------|\n"
            f"{rows}\n")


def build() -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for n in range(1, 7):
        src = f"puzzles/challenge-{n:02d}"
        for name in ("ciphertext.txt", "key.json", "plaintext.txt"):
            files[f"{src}/{name}"] = show(f"{src}/{name}")
        files[f"{src}/solve-path.md"] = with_preface(f"{src}/solve-path.md", "../../")
    files["puzzles/README.md"] = puzzles_index().encode()
    files["docs/analysis.md"] = with_preface("docs/09-analysis.md", "../")
    files["docs/VERSIONS.md"] = show("tables/VERSIONS.md")  # verbatim: its sha256 is the edition
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
