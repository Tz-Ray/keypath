#!/usr/bin/env python3
"""Generate the site's data/ and tests/fixtures/ from keypath 2.2.0.

Everything under data/ and tests/fixtures/ is written by this script and
never edited by hand.  The oracle is the keypath package installed in the
site's own venv (from the cipher project at tag v2.2); the cipher project
itself is only read as files (puzzles, golden vectors, test corpora,
docs/09) and never imported from, executed or written to.  The walks the
page draws come from keypath.trace (trace/1), mapped to the site's surface
ids.

    .venv/bin/python tools/build_data.py            # (re)write data/ + fixtures
    .venv/bin/python tools/build_data.py --check    # rebuild to a temp dir, byte-compare

Output is deterministic: dict order is table order or sorted, JSON uses
ensure_ascii=False and compact separators, gzip uses mtime=0, and every
random choice comes from random.Random(20260924).
"""
from __future__ import annotations

import argparse
import ast
import copy
import filecmp
import gzip
import hashlib
import io
import json
import os
import random
import re
import shutil
import statistics
import sys
import tempfile
import unicodedata
from pathlib import Path
from typing import Any, Callable, Iterable

os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
sys.dont_write_bytecode = True

import keypath  # noqa: E402
from keypath import registry  # noqa: E402
from keypath.editions import edition_tables, known_editions  # noqa: E402
from keypath.keyspec import (  # noqa: E402
    KEY_SCHEMA, KEY_VERSION, KEY_VERSIONS, V1_LANGUAGES, V1_LAYOUTS, compute_leakage, dumps_key, loads_key,
)
from keypath.errors import KeyValidationError, KeypathError  # noqa: E402
from keypath.keycodec import pack as kp1_pack, unpack as kp1_unpack  # noqa: E402
from keypath.layouts import ja_romaji as ja_layout  # noqa: E402
from keypath.layouts import zh_cangjie as cangjie_layout  # noqa: E402
from keypath.layouts import zh_quick as quick_layout  # noqa: E402
from keypath.layouts import ko_dubeolsik as ko_layout  # noqa: E402
from keypath.layouts import zh_daqian as daqian_layout  # noqa: E402
from keypath.layouts import zh_pinyin as pinyin_layout  # noqa: E402
from keypath.normalize import LOWERCASE_LANGUAGES, normalize  # noqa: E402
from keypath.surfaces import zh as zh_surface  # noqa: E402
from keypath.surfaces import zh_ko_hanja  # noqa: E402
from keypath.surfaces.base import SPACED  # noqa: E402
from keypath.tables import (  # noqa: E402
    es_accent, es_en, ja_romaji, ko_dubeolsik, ko_hanja, ko_hanja_readings, ru_en, ru_jcuken,
    tables_sha256, zh_cangjie, zh_chars, zh_daqian, zh_phrases, zh_pinyin, zh_quick,
)
from keypath.trace import trace as trace1  # noqa: E402
from keypath.walk import decode, encode  # noqa: E402

SITE = Path(__file__).resolve().parent.parent
# a checkout of the cipher project at tag v2.2; by default next to this repository
PROJECT = Path(os.environ.get("KEYPATH_PROJECT", SITE.parent / "cipher-project"))
VERSION = "2.2.0"
TAG = "v2.2"
EDITION = "be6aa0474bc67cec820d7ecf484678918415df21140ec57977883b7b40658732"
VOCAB_SIZE = 10_000
SEED = 20260924
LETTERS = "abcdefghijklmnopqrstuvwxyz"
SHAPE_LETTERS = "abcdefghijklmnopqrstuvwxy"   # Cangjie and Quick keys (z is unused)
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"

# The site's surfaces, in chip order: id -> (language, layout).
SURFACES: dict[str, tuple[str, str]] = {
    "zh_daqian": ("zh", "zh_daqian"),
    "zh_pinyin": ("zh", "zh_pinyin"),
    "zh_cangjie": ("zh", "zh_cangjie"),
    "zh_quick": ("zh", "zh_quick"),
    "zh_hanja": ("zh", "ko_dubeolsik"),
    "ja_romaji": ("ja", "ja_romaji"),
    "ko_dubeolsik": ("ko", "ko_dubeolsik"),
    "ru_jcuken": ("ru", "ru_jcuken"),
    "es_accent": ("es", "es_accent"),
    "en_identity": ("en", "en_identity"),
}
SURFACE_LABELS = {
    "zh_daqian": ("ㄅ", "Bopomofo (Taiwan)", "a Bopomofo (Dàqiān) keyboard"),
    "zh_pinyin": ("pīn", "Pinyin", "a Pinyin keyboard with tone numbers"),
    "zh_cangjie": ("倉", "Cangjie", "a Cangjie keyboard"),
    "zh_quick": ("速", "Quick", "a Quick (simplified Cangjie) keyboard"),
    "zh_hanja": ("漢", "Chinese on a Korean keyboard", "a Korean keyboard, as hanja"),
    "ja_romaji": ("か", "Japanese romaji", "a Japanese romaji keyboard"),
    "ko_dubeolsik": ("한", "Korean", "a Korean (Dubeolsik) keyboard"),
    "ru_jcuken": ("Й", "Russian ЙЦУКЕН", "a Russian ЙЦУКЕН keyboard"),
    "es_accent": ("ñ", "Spanish accents", "a Spanish accent-digit keyboard"),
    "en_identity": ("a", "Plain English", "a plain English keyboard"),
}
SITE_ID = {pair: sid for sid, pair in SURFACES.items()}
EN_X = [sid for sid in SURFACES if sid != "en_identity"]
# Surfaces whose English rows the page derives from another surface's rows
# instead of loading files (docs/10 §9.7): Quick rows are the Cangjie rows
# with each unit recoded to its Quick code and re-indexed in the Quick list.
DERIVED_ROWS = {"zh_quick": "zh_cangjie"}
ALLOWED = {
    "en": list(SURFACES),
    "zh": ["zh_daqian", "zh_pinyin", "zh_cangjie", "zh_quick", "zh_hanja"],
    "ko": ["ko_dubeolsik"],
    "ru": ["ru_jcuken"],
    "es": ["es_accent"],
}

# Examples used by the page (§6); every one is re-encoded and asserted.
HERO = ("welcome home", "en", "zh_daqian", "cj0u/6ru8")
CHIPS = [
    ("welcome home", "en", "zh_daqian", "cj0u/6ru8"),
    ("鍵盤", "zh", "zh_daqian", "ru04q06"),
    ("國家", "zh", "zh_hanja", "rnrrk"),
    ("한국어", "ko", "ko_dubeolsik", "gksrnrdj"),
    ("ёжик", "ru", "ru_jcuken", "`;br"),
    ("mañana", "es", "es_accent", "man1ana"),
]
HERO_ALL = {
    "zh_daqian": "cj0u/6ru8", "zh_pinyin": "huan1ying2jia1", "zh_hanja": "ghksdudrk",
    "zh_cangjie": "tgnoyhvljmso", "zh_quick": "toyljo",
    "ko_dubeolsik": "ghksduddkstlrcj", "ru_jcuken": "ghbdtncndjdfnmljvf",
    "ja_romaji": "kanngeikokunai", "es_accent": "bienvenida", "en_identity": "welcomehome",
}
STRIP = {
    "text": "la luna y el sol de la ciudad", "source": "es",
    "segments": [{"length": 7, "route": "ja", "selector_mode": "inline"},
                 {"length": 9, "route": "en"}, {"length": 13, "route": "zh"}],
    "ciphertext": "sono3gatsu1andthesun2k7s84g4",
}

# Keys with several segments, one per Chinese keyboard: the page cannot make
# them, but walks them back ("Walk one back"); their traces are fixtures.
MIXED = [
    ("我愛你中國森林", "zh", [{"length": 3, "route": "zh", "layout": "zh_daqian"},
                        {"length": 2, "route": "zh", "layout": "zh_cangjie"},
                        {"length": 2, "route": "zh", "layout": "zh_quick"}]),
    ("welcome home, thank you", "en", [{"length": 13, "route": "zh", "layout": "zh_cangjie"},
                                       {"length": 10, "route": "zh", "layout": "zh_quick"}]),
]

CHALLENGE_COPY = {
    1: ("Warm-up", "Type it like a local", "Two characters of very common courtesy. 🇹🇼⌨️", None),
    2: ("Warm-up", "Dos teclados, un mensaje",
        "No keyboard picture this time, and the digits do not all mean the same thing.", "Two keyboards"),
    3: ("Easy", "The Key Right of the Space Bar",
        "Nobody pressed the key to the right of the space bar.", None),
    4: ("Medium", "Mother Tongue",
        "Открытка из Москвы, typed on a PC. Every word but one; that one insisted on being typed "
        "in its mother tongue.", "Two keyboards"),
    5: ("Hard", "A Friend from Afar",
        "The Master said it. Seoul recites it. One word came from even farther away.", "Three keyboards"),
    6: ("Expert", "Each in Its Own Way", "…несчастлива по-своему.", "Four keyboards"),
}


# ================================================================ helpers

def jdump(obj: Any) -> str:
    """Compact JSON; lone surrogates (only in fixtures) escaped so the file stays UTF-8."""
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return re.sub("[\ud800-\udfff]", lambda m: "\\u%04x" % ord(m.group()), text)


def gz(data: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0, filename="") as fh:
        fh.write(data)
    return buf.getvalue()


def gz_size(data: bytes) -> int:
    return len(gz(data))


class Out:
    """Writes files under one output root and remembers them."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.files: dict[str, bytes] = {}

    def write(self, rel: str, data: bytes | str) -> None:
        if isinstance(data, str):
            data = data.encode("utf-8")
        self.files[rel] = data
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def json(self, rel: str, obj: Any) -> None:
        self.write(rel, jdump(obj))

    def jsonl_gz(self, rel: str, records: Iterable[Any]) -> None:
        body = "".join(jdump(r) + "\n" for r in records).encode("utf-8")
        self.write(rel, gz(body))


def surface_of(sid: str):
    lang, layout = SURFACES[sid]
    s = registry.surface(lang, layout)
    assert s is not None
    return s


def py_encode(text: str, source: str, sid: str):
    lang, layout = SURFACES[sid]
    return encode(text, source, route_language=lang, layout=layout)


def key_text(key: dict[str, Any]) -> str:
    return dumps_key(key)


def leak_count(key: dict[str, Any]) -> int:
    """compute_leakage's numerator, as an integer count of code points."""
    total = 0
    for segment in key.get("segments", []):
        for word in segment.get("words", []):
            if "literal" in word:
                total += len(word["literal"]["text"])
    return total


# ================================================================== trace

# trace/1 (keypath.trace) minus what the page does not draw: the format tag,
# residualBytes, each segment's span and hint, a tier-2 word's patch record
# and each unit's choice; each segment gains the site's surface id first.
TRACE_DROPPED = {"top": ("format", "residualBytes"), "segment": ("span", "hint"),
                 "word": ("tier2",), "unit": ("choice",)}


def site_trace(ciphertext: str, key: dict[str, Any]) -> dict[str, Any]:
    """The page's Trace (site SPEC §7.4) of one key: keypath.trace.trace, mapped."""
    obj = trace1(ciphertext, key)
    drop = TRACE_DROPPED

    def word(w: dict[str, Any]) -> dict[str, Any]:
        if "literal" in w:
            return dict(w)
        out = {k: v for k, v in w.items() if k not in drop["word"]}
        out["units"] = [{k: v for k, v in u.items() if k not in drop["unit"]} for u in w["units"]]
        return out

    segments = []
    for seg in obj["segments"]:
        mapped: dict[str, Any] = {"surface": SITE_ID[(seg["language"], seg["layout"])]}
        for k, v in seg.items():
            if k not in drop["segment"]:
                mapped[k] = [word(w) for w in v] if k == "words" else v
        segments.append(mapped)
    top = {k: v for k, v in obj.items() if k not in drop["top"] and k != "segments"}
    top["segments"] = segments
    return top


# ============================================================= registry

def registry_data() -> dict[str, Any]:
    editions = sorted(known_editions())
    return {
        "keypathVersion": keypath.__version__,
        "keyVersion": KEY_VERSION,
        "keyVersions": list(KEY_VERSIONS),
        "currentEdition": tables_sha256(),
        "editionHashes": editions,
        "editionTables": {sha: sorted(edition_tables(sha)) for sha in editions},
        "keySchema": KEY_SCHEMA,
        "v1Languages": list(V1_LANGUAGES),
        "v1Layouts": list(V1_LAYOUTS),
        "spacedLanguages": sorted(SPACED),
        "lowercaseLanguages": sorted(LOWERCASE_LANGUAGES),
        "languages": list(registry.LANGUAGES),
        "surfaces": {
            lang: {
                s.layout: {"routeTail": list(s.route_tail), "homophoneLayer": s.homophone_layer,
                           "alphabet": "".join(sorted(s.alphabet)), "tables": list(s.tables),
                           "selectorModes": list(s.selector_modes)}
                for (s_lang, _layout), s in registry.SURFACES.items() if s_lang == lang
            }
            for lang in registry.LANGUAGES
        },
        "hops": [hop.name for hop in registry.HOPS.values()],
        "hopTables": {hop.name: list(hop.tables) for hop in registry.HOPS.values()},
        # kp1's ordinal lists (docs/10 §2.2): languages and [language, layout]
        # surfaces in registration order; surfaces from strictSelectorOrdinal
        # on accept only their own selector modes (docs/10 §2.1)
        "kp1Languages": list(registry.LANGUAGES),
        "kp1Surfaces": [list(pair) for pair in registry.SURFACES],
        "strictSelectorOrdinal": registry.STRICT_SELECTOR_ORDINAL,
        "siteSurfaces": [
            {"id": sid, "language": lang, "layout": layout, "glyph": SURFACE_LABELS[sid][0],
             "label": SURFACE_LABELS[sid][1], "longName": SURFACE_LABELS[sid][2]}
            for sid, (lang, layout) in SURFACES.items()
        ],
        "allowed": ALLOWED,
        "derivedRows": DERIVED_ROWS,
    }


def layouts_data() -> dict[str, Any]:
    dq = zh_daqian()
    py = zh_pinyin()
    return {
        "zh_daqian": {"symbolToKey": dict(dq.symbol_to_key), "toneToKey": dict(dq.tone_to_key)},
        "zh_pinyin": {"spellingByBase": dict(py.spelling_by_base),
                      "toneDigits": [[m, d] for m, d in pinyin_layout.TONE_DIGITS.items()]},
        "ko_dubeolsik": {"keysByJamo": dict(ko_dubeolsik().keys_by_jamo),
                         "initials": ko_layout.INITIALS, "vowels": ko_layout.VOWELS,
                         "finals": list(ko_layout.FINALS),
                         "jamoFirst": ko_layout.JAMO_FIRST, "jamoLast": ko_layout.JAMO_LAST,
                         "syllableFirst": ko_layout.SBASE, "syllableLast": ko_layout.SLAST},
        "ru_jcuken": {"keysByLetter": dict(ru_jcuken().keys_by_letter)},
        "es_accent": {"rows": [list(r) for r in es_accent().rows]},
        "ja_romaji": {"pairs": [[k, r] for k, r in ja_romaji().kana_to_romaji.items()]},
        "en_identity": {},
        "zh_cangjie": {"radicals": dict(cangjie_layout.RADICALS), "maxLetters": cangjie_layout.MAX_LETTERS},
        "zh_quick": {"maxLetters": quick_layout.MAX_LETTERS},
    }


def unicode14_ranges() -> list[list[int]]:
    assert unicodedata.unidata_version == "14.0.0", unicodedata.unidata_version
    ranges: list[list[int]] = []
    for cp in range(0x110000):
        cat = unicodedata.category(chr(cp))
        if cat in ("Cn", "Cs"):
            continue
        if ranges and ranges[-1][1] == cp - 1:
            ranges[-1][1] = cp
        else:
            ranges.append([cp, cp])
    return ranges


# ===================================================================== zh

def effective_digits(word: str) -> list[int]:
    """Per char: index into readings_by_char of the reading word_units uses."""
    chars = zh_chars()
    readings = zh_surface.readings_for_word(word)
    out = []
    for c, r in zip(word, readings, strict=True):
        if c not in chars.candidates_by_reading.get(r, ()):
            r = chars.readings_by_char[c][0]
        out.append(chars.readings_by_char[c].index(r))
    return out


def zh_data(out: Out) -> dict[str, Any]:
    chars = zh_chars()
    phrases = zh_phrases()
    readings_h = ko_hanja_readings()
    lists = {r: "".join(cs) for r, cs in chars.candidates_by_reading.items()}
    multi = {c: " ".join(rs) for c, rs in chars.readings_by_char.items() if len(rs) > 1}
    out.json("data/zh/core.json", {"maxWordLen": phrases.max_word_len, "lists": lists, "readings": multi})

    shards: dict[int, list[tuple[str, str]]] = {i: [] for i in range(256)}
    n_multi = n_solo = 0
    for word in phrases.readings_by_word:
        assert "|" not in word and "\n" not in word, word
        in_zh = all(c in chars.readings_by_char for c in word)
        digits = ""
        if in_zh:
            idx = effective_digits(word)
            assert all(i < 36 for i in idx)
            if any(idx):
                digits = "".join(B36[i] for i in idx)
        hangul = ""
        if len(word) > 1:
            encoded = zh_ko_hanja.encode_word(word, "keyed")  # raises -> build fails
            if encoded is not None:
                final = zh_ko_hanja.encode_reading(word)
                joined = "".join(readings_h.primary_by_char[c] for c in word)
                if final != joined:
                    hangul = final
        if len(word) == 1:
            if not digits:
                continue
            n_solo += 1
        else:
            n_multi += 1
        line = word
        if hangul:
            line = f"{word}|{digits}|{hangul}"
        elif digits:
            line = f"{word}|{digits}"
        shards[ord(word[0]) & 0xFF].append((word, line))
    for i in range(256):
        body = "\n".join(line for _w, line in sorted(shards[i])) + "\n"
        out.write(f"data/zh/p/{i:02x}.txt", body)
    print(f"[zh] {len(lists)} readings, {len(multi)} multi-reading chars, "
          f"{n_multi} phrases + {n_solo} solo overrides in 256 shards")
    return {"multi": n_multi, "solo": n_solo}


def hanja_data(out: Out) -> None:
    table = ko_hanja()
    primary = ko_hanja_readings().primary_by_char
    lists = [[s, "".join(cs)] for s, cs in table.candidates_by_syllable.items()]
    derived: dict[str, str] = {}
    for s, cs in table.candidates_by_syllable.items():
        for c in cs:
            derived.setdefault(c, s)
    assert set(derived) == set(primary), "hanja primary keys differ from the list members"
    exceptions = {c: primary[c] for c in sorted(primary) if primary[c] != derived[c]}
    out.json("data/hanja/core.json", {"lists": lists, "primary": exceptions})
    print(f"[hanja] {len(lists)} syllables, {len(primary)} hanja, {len(exceptions)} primary exceptions")


# ============================================================ Cangjie, Quick

def quick_of(code: str) -> str:
    """docs/10 §4.2 (the page applies the same rule): a Cangjie code's Quick
    code is the code if it has at most 2 letters, else its first and last."""
    return code if len(code) <= 2 else code[0] + code[-1]


def shape_data(out: Out) -> dict[str, dict[str, str]]:
    """data/cangjie/{a..y}.json: the Cangjie lists {code: characters}, sharded
    by the code's first letter; data/quick.json: the Quick lists.  Both keep
    the table's candidate order.  -> {"cangjie": lists, "quick": lists}."""
    cj = zh_cangjie()
    shards: dict[str, dict[str, str]] = {c: {} for c in SHAPE_LETTERS}
    for code, chars in cj.candidates_by_code.items():
        assert re.fullmatch("[a-y]{1,5}", code), code
        shards[code[0]][code] = "".join(chars)
    for letter in SHAPE_LETTERS:
        assert shards[letter], letter
        out.json(f"data/cangjie/{letter}.json", {c: shards[letter][c] for c in sorted(shards[letter])})
    # Quick has no table: its lists are the stable group-by of the Cangjie
    # rows (table order) by quick_of(code); the package's lists must agree
    derived: dict[str, list[str]] = {}
    for char, code in cj.code_by_char.items():
        derived.setdefault(quick_of(code), []).append(char)
    quick = {q: "".join(cs) for q, cs in zh_quick().candidates_by_code.items()}
    assert {q: "".join(cs) for q, cs in derived.items()} == quick
    assert list(derived) == list(quick)
    out.json("data/quick.json", quick)
    # a character's Quick code starts with its Cangjie code's letter, so the
    # page finds a character's Cangjie shard through data/quick.json
    assert all(zh_quick().code_by_char[c][0] == code[0] for c, code in cj.code_by_char.items())
    print(f"[shape] {len(cj.candidates_by_code)} Cangjie codes in {len(SHAPE_LETTERS)} shards, "
          f"{len(quick)} Quick codes, {len(cj.code_by_char)} characters")
    return {"cangjie": {c: "".join(v) for c, v in cj.candidates_by_code.items()}, "quick": quick}


# ================================================================ English

def vocabulary() -> list[str]:
    from wordfreq import top_n_list

    words = [w for w in top_n_list("en", 80000) if re.fullmatch("[a-z]+", w)][:VOCAB_SIZE]
    assert len(words) == VOCAB_SIZE and words[-1] == "alison", words[-1]
    return words


def en_row(word: str, sid: str) -> tuple[list[Any] | None, dict[str, Any] | None, str]:
    """-> (row, python entry, ciphertext); row None when the word is a literal."""
    lang, layout = SURFACES[sid]
    result = py_encode(word, "en", sid)
    entry = result.key["segments"][0]["words"][0]
    if "literal" in entry:
        return None, None, result.ciphertext
    surface = registry.surface(lang, layout)
    edge = registry.HOPS[("en", lang)].edge
    units = entry["units"]
    target, _ = surface.decode_word(result.ciphertext, 0, units, "keyed")
    row: list[Any] = [target, entry["translation"]["index"], len(edge.backward(target)),
                      result.ciphertext, [u["len"] for u in units]]
    if surface.homophone_layer:
        row.append([u["homophone_index"] for u in units])
    if lang == "ja":
        parsed = surface.unit_candidates(result.ciphertext, "keyed")
        row += [len(parsed.candidates), list(parsed.candidates[:4])]
    rebuilt = entry_from_row(row, surface.homophone_layer)
    assert json.dumps(rebuilt) == json.dumps(entry), (word, sid, rebuilt, entry)
    return row, entry, result.ciphertext


def entry_from_row(row: list[Any], homophone: bool) -> dict[str, Any]:
    lens = row[4]
    if homophone:
        units = [{"len": n, "homophone_index": i} for n, i in zip(lens, row[5])]
    else:
        units = [{"len": n} for n in lens]
    return {"units": units, "translation": {"tier": 1, "index": row[1]}}


def derive_row(sid: str, row: list[Any] | None, shape: dict[str, dict[str, str]]) -> list[Any] | None:
    """A derived surface's row from its base surface's row (DERIVED_ROWS), as
    the page derives it: each unit's Cangjie code recoded to its Quick code,
    the index the character's place in that Quick list."""
    assert sid == "zh_quick", sid
    if row is None:
        return None
    target, hop_index, hop_count, keys, lens, _idx = row
    chars = list(target)
    assert len(chars) == len(lens), row
    codes, pos = [], 0
    for n in lens:
        codes.append(keys[pos:pos + n])
        pos += n
    quick = [quick_of(code) for code in codes]
    return [target, hop_index, hop_count, "".join(quick), [len(q) for q in quick],
            [list(shape["quick"][q]).index(ch) for q, ch in zip(quick, chars)]]


def english_data(out: Out, vocab: list[str], shape: dict[str, dict[str, str]]) -> dict[str, dict[str, tuple]]:
    by_letter: dict[str, list[str]] = {c: [] for c in LETTERS}
    for w in vocab:
        by_letter[w[0]].append(w)
    for c in LETTERS:
        out.json(f"data/en/vocab/{c}.json", sorted(by_letter[c]))
    results: dict[str, dict[str, tuple]] = {}
    for sid in EN_X:
        rows: dict[str, dict[str, Any]] = {c: {} for c in LETTERS}
        results[sid] = {}
        for w in vocab:
            row, entry, cipher = en_row(w, sid)
            results[sid][w] = (row, entry, cipher)
            if row is not None:
                rows[w[0]][w] = row
        n = sum(len(r) for r in rows.values())
        if sid in DERIVED_ROWS:
            # no files: the page derives these rows; they must be exactly
            # the rows Python's own encode yields, for the same words
            base = DERIVED_ROWS[sid]
            for w in vocab:
                assert derive_row(sid, results[base][w][0], shape) == results[sid][w][0], (sid, w)
            print(f"[en] {sid}: {n} of {len(vocab)} words have a row, all derived from {base}")
            continue
        for c in LETTERS:
            out.json(f"data/en/{sid}/{c}.json", {w: rows[c][w] for w in sorted(rows[c])})
        print(f"[en] {sid}: {n} of {len(vocab)} words have a row")
    return results


# ============================================================= challenges

def challenge_files() -> list[dict[str, Any]]:
    out = []
    for folder in sorted((PROJECT / "puzzles").glob("challenge-*")):
        out.append({
            "n": int(folder.name.removeprefix("challenge-")),
            "ciphertext": (folder / "ciphertext.txt").read_text(encoding="utf-8"),
            "keyText": (folder / "key.json").read_text(encoding="utf-8"),
            "plaintext": (folder / "plaintext.txt").read_text(encoding="utf-8"),
        })
    return out


def answer_norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s).lower()
    return "".join(ch for ch in s if unicodedata.category(ch)[0] in "LMN")


def answer_fold(s: str) -> str:
    d = unicodedata.normalize("NFD", answer_norm(s))
    return unicodedata.normalize("NFC", "".join(ch for ch in d if unicodedata.category(ch) != "Mn"))


def sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def list_slices(ciphertext: str, key: dict[str, Any]) -> dict[str, dict[str, list[Any]]]:
    """The hop and homophone:ja lists a key reads, as {edge: {value: [count, prefix]}}."""
    needs: dict[str, dict[str, tuple[tuple[str, ...], int]]] = {}

    def select(edge: str, value: str, full: tuple[str, ...], index: int) -> str:
        lists = needs.setdefault(edge, {})
        highest = lists[value][1] if value in lists else -1
        lists[value] = (tuple(full), max(highest, index))
        return full[index]

    pos = 0
    for segment in key["segments"]:
        surface = registry.surface(segment["language"], segment["layout"])
        hops, tail = registry.split_route(segment["route"])
        mode = segment["selector_mode"]
        for word in segment["words"]:
            if "literal" in word:
                continue
            start = pos
            for unit in word["units"]:
                chunk = ciphertext[pos : pos + unit["len"]]
                pos += unit["len"]
                if segment["language"] == "ja":
                    parsed = surface.unit_candidates(chunk, mode)
                    pick = unit.get("homophone_index")
                    if pick is None:
                        pick = parsed.selected
                    if not parsed.identity:
                        select(tail[0], parsed.reading, parsed.candidates, pick if pick is not None else 0)
            text, _ = surface.decode_word(ciphertext, start, word["units"], mode)
            records = (word["translations"] if "translations" in word
                       else [word["translation"]] if "translation" in word else [])
            for step, record in zip(reversed(hops), reversed(records)):
                a, b = step.removeprefix(registry.HOP_PREFIX).split(">")
                full = registry.HOPS[(a, b)].edge.backward(text)
                text = select(step, text, full, record["index"])
    return {edge: {v: [len(full), list(full[: hi + 1])] for v, (full, hi) in sorted(lists.items())}
            for edge, lists in sorted(needs.items())}


def challenges_data(out: Out) -> list[dict[str, Any]]:
    index = []
    shipped = challenge_files()
    assert [c["n"] for c in shipped] == [1, 2, 3, 4, 5, 6]
    for c in shipped:
        key = json.loads(c["keyText"])
        assert decode(c["ciphertext"], key) == c["plaintext"], c["n"]
        difficulty, title, blurb, keyboards = CHALLENGE_COPY[c["n"]]
        index.append({"n": c["n"], "difficulty": difficulty, "title": title, "blurb": blurb,
                      "keyboards": keyboards, "ciphertext": c["ciphertext"],
                      "hash": sha(answer_norm(c["plaintext"])), "fold": sha(answer_fold(c["plaintext"]))})
        out.json(f"data/challenges/{c['n']:02d}.json", {
            "ciphertext": c["ciphertext"], "keyText": c["keyText"], "plaintext": c["plaintext"],
            "lists": list_slices(c["ciphertext"], key)})
    out.json("data/challenges/index.json", index)
    return shipped


# =================================================================== hero

def hero_data(out: Out) -> dict[str, Any]:
    text, source, sid, cipher = HERO
    result = py_encode(text, source, sid)
    assert result.ciphertext == cipher, result.ciphertext
    trace = site_trace(result.ciphertext, result.key)
    chars = zh_chars()
    lists = {}
    for word in trace["segments"][0]["words"]:
        for unit in word["units"]:
            lists[unit["reading"]] = "".join(chars.candidates_by_reading[unit["reading"]])
    hero = {"text": text, "source": source, "surface": sid, "ciphertext": result.ciphertext,
            "keyText": key_text(result.key), "trace": trace, "lists": lists}
    out.json("data/hero.json", hero)
    return hero


# ================================================================ fixtures

def load_corpora() -> dict[str, list[str]]:
    wanted = {"test_walk_roundtrip_zh.py": ("CURATED", "OOV_CASES"),
              "test_walk_roundtrip_en.py": ("CORPUS",),
              "test_walk_roundtrip_ja_es.py": ("ES_CORPUS", "JA_CORPUS")}
    found: dict[str, list[str]] = {}
    for file, names in wanted.items():
        tree = ast.parse((PROJECT / "tests" / file).read_text(encoding="utf-8"))
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                    and isinstance(node.targets[0], ast.Name) and node.targets[0].id in names:
                found[node.targets[0].id] = ast.literal_eval(node.value)
    for name in ("CURATED", "OOV_CASES", "CORPUS", "ES_CORPUS", "JA_CORPUS"):
        assert name in found, name
    golden = {}
    for name in ("vectors_zh", "vectors_zh_pinyin", "vectors_ko_hanja", "vectors_zh_cangjie", "vectors_ko", "vectors_ru"):
        data = json.loads((PROJECT / "tests" / "golden" / f"{name}.json").read_text(encoding="utf-8"))
        golden[name] = [v["plaintext"] for v in data["vectors"]]
    found.update(golden)
    return found


class Vectors:
    def __init__(self, vocab: set[str]) -> None:
        self.records: list[dict[str, Any]] = []
        self.valid: list[dict[str, Any]] = []   # (for traces and tampering)
        self.vocab = vocab
        self.seen: set[tuple[str, str, str]] = set()

    def add(self, cls: str, text: str, source: str, sid: str, *, carried: bool = True) -> None:
        sig = (text, source, sid)
        if sig in self.seen:
            return
        self.seen.add(sig)
        rec: dict[str, Any] = {"id": f"{cls}-{len(self.records)}", "class": cls, "text": text,
                               "source": source, "surface": sid, "carried": carried}
        refusal = self.js_refusal(text, source, sid)
        try:
            result = py_encode(text, source, sid)
        except Exception as exc:  # noqa: BLE001 - recorded, JS must refuse too
            rec["expect"] = {"error": type(exc).__name__}
            if refusal:
                rec["jsRefusal"] = refusal
            self.records.append(rec)
            return
        decoded = decode(result.ciphertext, result.key)
        assert decoded == normalize(text, source)
        rec["expect"] = {"ciphertext": result.ciphertext, "keyText": key_text(result.key),
                         "leak": [leak_count(result.key), len(decoded)],
                         "leakage": result.leakage, "decoded": decoded}
        assert rec["expect"]["leak"][0] / max(1, len(decoded)) == result.leakage or not decoded
        if refusal:
            rec["jsRefusal"] = refusal
        elif carried:
            self.valid.append(rec)
        self.records.append(rec)

    def js_refusal(self, text: str, source: str, sid: str) -> list[Any] | None:
        for ch in text:
            cp = ord(ch)
            if 0xD800 <= cp <= 0xDFFF or unicodedata.category(ch) == "Cn":
                return ["newerUnicode", f"U+{cp:04X}"]
        if source == "ja":
            return ["jaSource"]
        if sid not in ALLOWED.get(source, []):
            return ["routeOff"]
        norm = normalize(text, source)
        if not norm:
            return ["empty"]
        if source == "en" and sid != "en_identity":
            unknown: list[str] = []
            for w in re.findall("[a-z]+", norm):
                if w not in self.vocab and w not in unknown:
                    unknown.append(w)
            if unknown:
                return ["unknownWords", unknown]
        return None


def fuzz_strings(rng: random.Random, vocab: list[str], rows: dict[str, dict[str, tuple]]) -> dict[str, list[str]]:
    chars = zh_chars()
    phrases = list(zh_phrases().readings_by_word)
    zh_list = list(chars.readings_by_char)
    multi = [c for c in zh_list if len(chars.readings_by_char[c]) > 1]
    solo = [w for w in phrases if len(w) == 1 and any(effective_digits(w))]
    non_bmp = [c for c in zh_list if ord(c) > 0xFFFF]
    zh_set = set(zh_list)
    not_zh = [chr(cp) for cp in range(0x4E00, 0xA000) if chr(cp) not in zh_set]
    ascii_ = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

    def zh_token() -> str:
        kind = rng.randrange(12)
        if kind < 4:
            return rng.choice(phrases)
        if kind == 4:
            return rng.choice(multi)
        if kind == 5:
            return rng.choice(solo)
        if kind == 6:
            return rng.choice(zh_list)
        if kind == 7:
            return rng.choice(non_bmp)
        if kind == 8:
            return rng.choice(not_zh)
        if kind == 9:
            return rng.choice(["，", "。", "！", "😀", "豈", "更"])
        if kind == 10:
            return "".join(rng.choice(ascii_) for _ in range(rng.randint(1, 3)))
        return " " * rng.randint(1, 3)

    fz = [("".join(zh_token() for _ in range(rng.randint(1, 6)))) for _ in range(1000)]

    halfwidth = [chr(cp) for cp in range(0xFFA0, 0xFFDD) if unicodedata.category(chr(cp)) != "Cn"]

    def ko_token() -> str:
        kind = rng.randrange(8)
        if kind < 3:
            return "".join(chr(rng.randint(0xAC00, 0xD7A3)) for _ in range(rng.randint(1, 4)))
        if kind == 3:
            return chr(rng.randint(0x3131, 0x3163))
        if kind == 4:
            return chr(rng.randint(0x3165, 0x318E))
        if kind == 5:
            return rng.choice(halfwidth)
        if kind == 6:
            return rng.choice(["가", "한", "ab", "Z", "1", "!"])
        return " " * rng.randint(1, 2)

    fko = ["".join(ko_token() for _ in range(rng.randint(1, 6))) for _ in range(400)]

    ru_words = sorted(ru_en().translations_by_ru)

    def ru_token() -> str:
        kind = rng.randrange(8)
        if kind < 3:
            return rng.choice(ru_words)
        if kind == 3:
            return rng.choice(ru_words).upper()
        if kind == 4:
            return rng.choice(["Ё", "Ё", "ёлка", "Ёж"])
        if kind == 5:
            return rng.choice(["і", "ў", "ґ", "Ї"])
        if kind == 6:
            return rng.choice([",", ".", "!", "—", "-", "?", "1"])
        return " " * rng.randint(1, 3)

    fru = ["".join(ru_token() for _ in range(rng.randint(1, 6))) for _ in range(300)]

    es_words = sorted(es_en().translations_by_es)

    def es_token() -> str:
        kind = rng.randrange(8)
        if kind < 3:
            return rng.choice(es_words)
        if kind == 3:
            return rng.choice(es_words).capitalize()
        if kind == 4:
            return unicodedata.normalize("NFD", rng.choice(es_words + ["canción", "año", "pingüino"]))
        if kind == 5:
            return rng.choice(["ü", "Ü", "ñ", "Ñ", "ç", "ö", "è"])
        if kind == 6:
            return rng.choice(["1", "2026", ",", "¿", "¡", "?"])
        return " " * rng.randint(1, 3)

    fes = ["".join(es_token() for _ in range(rng.randint(1, 6))) for _ in range(300)]

    def en_id() -> str:
        parts = []
        for _ in range(rng.randint(1, 6)):
            kind = rng.randrange(6)
            if kind < 3:
                w = rng.choice(vocab)
                parts.append(w.upper() if rng.random() < 0.2 else w)
            elif kind == 3:
                parts.append(rng.choice(["don't", "e-mail", "123", "ü", "naïve", "İstanbul"]))
            elif kind == 4:
                parts.append(rng.choice([",", ".", "!", "?", "  ", "\t"]))
            else:
                parts.append(" ")
        return " ".join(parts)

    fen = [en_id() for _ in range(200)]

    no_row = sorted({w for sid in EN_X for w, (row, _e, _c) in rows[sid].items() if row is None})

    def en_sentence() -> str:
        out = ""
        for i in range(rng.randint(1, 6)):
            w = rng.choice(no_row) if rng.random() < 0.35 else rng.choice(vocab)
            r = rng.random()
            if r < 0.15:
                w = w.capitalize()
            elif r < 0.2:
                w = w.upper()
            if i:
                out += rng.choice([" ", " ", " ", "  ", ", ", ". ", "! ", "? ", " '"])
            out += w
        if rng.random() < 0.4:
            out += rng.choice([".", "!", "?", "'", " "])
        return out

    fx = [en_sentence() for _ in range(400)]

    from wordfreq import top_n_list

    vset = set(vocab)
    oov_pool = [w for w in top_n_list("en", 80000) if re.fullmatch("[a-z]+", w) and w not in vset][:5000]

    def oov_sentence() -> str:
        words = [rng.choice(vocab) for _ in range(rng.randint(0, 4))]
        for _ in range(rng.randint(1, 2)):
            words.insert(rng.randint(0, len(words)),
                         rng.choice(oov_pool) if rng.random() < 0.7 else
                         "".join(rng.choice("qxzjkv") for _ in range(5)))
        return " ".join(words)

    foov = [oov_sentence() for _ in range(50)]
    return {"zh": fz, "ko": fko, "ru": fru, "es": fes, "en": fen, "enx": fx, "oov": foov}


EDGE_CASES = [
    ("", "en"), (" ", "en"), ("   ", "en"), ("!?,.", "en"), ("\t", "en"), ("a\nb", "en"),
    ("hello\tworld\n", "en"), ("İ", "en"), ("ΟΔΟΣ ΣΑΣ", "en"), ("Straße", "en"),
    ("café", "es"), ("ÉL", "es"), ("ÑANDÚ", "es"), ("   año  ", "es"),
    ("ЁЛКА", "ru"), ("ΣΑΣ привет", "ru"), ("", "zh"), (" ", "zh"), ("   ", "zh"),
    ("\t", "zh"), ("𠀀𠀁𠀂", "zh"), ("𪚲", "zh"), ("豈更", "zh"), ("你好\n世界", "zh"),
    ("각", "ko"), ("ㅋㅋㅋ", "ko"), ("   ", "ko"), ("ㅤ", "ko"),
    ("\U00031350", "zh"), ("hello \U00031350", "en"), ("\ud800", "en"), ("a\udc00b", "zh"),
]


def build_fixtures(out: Out, vocab: list[str], rows: dict[str, dict[str, tuple]],
                   corpora: dict[str, list[str]], shipped: list[dict[str, Any]]) -> None:
    rng = random.Random(SEED)
    vec = Vectors(set(vocab))
    # site vectors
    for sid, cipher in HERO_ALL.items():
        vec.add("site", HERO[0], "en", sid)
        assert vec.records[-1]["expect"]["ciphertext"] == cipher, (sid, vec.records[-1]["expect"])
    for golden in json.loads((PROJECT / "tests" / "golden" / "vectors_zh_cangjie.json").read_text(encoding="utf-8"))["vectors"]:
        for sid in ("zh_cangjie", "zh_quick"):
            vec.add("golden-shape", golden["plaintext"], "zh", sid)
            rec = next(r for r in vec.records if (r["text"], r["source"], r["surface"]) == (golden["plaintext"], "zh", sid))
            assert rec["expect"]["ciphertext"] == golden[sid]["ciphertext"], (golden, rec["expect"])
    for text, source, sid, cipher in CHIPS:
        vec.add("site", text, source, sid)
        rec = next(r for r in vec.records if (r["text"], r["source"], r["surface"]) == (text, source, sid))
        assert rec["expect"]["ciphertext"] == cipher, (text, rec["expect"])
    # corpora
    zh_texts = corpora["CURATED"] + corpora["OOV_CASES"] + corpora["vectors_zh"] \
        + corpora["vectors_zh_pinyin"] + corpora["vectors_ko_hanja"] + corpora["vectors_zh_cangjie"]
    for t in zh_texts:
        for sid in ALLOWED["zh"]:
            vec.add("corpus-zh", t, "zh", sid)
    for t in corpora["vectors_ko"]:
        vec.add("corpus-ko", t, "ko", "ko_dubeolsik")
    for t in corpora["vectors_ru"]:
        vec.add("corpus-ru", t, "ru", "ru_jcuken")
    for t in corpora["ES_CORPUS"]:
        vec.add("corpus-es", t, "es", "es_accent")
    for t in corpora["CORPUS"]:
        for sid in SURFACES:
            vec.add("corpus-en", t, "en", sid)
    for t in corpora["JA_CORPUS"]:
        vec.add("corpus-ja", t, "ja", "ja_romaji")
    # routes the page refuses
    vec.add("route", "你好", "zh", "ru_jcuken")
    vec.add("route", "привет", "ru", "zh_daqian")
    # fuzz
    fz = fuzz_strings(rng, vocab, rows)
    for t in fz["zh"]:
        for sid in ALLOWED["zh"]:
            vec.add("fuzz-zh", t, "zh", sid)
    for t in fz["ko"]:
        vec.add("fuzz-ko", t, "ko", "ko_dubeolsik")
    for t in fz["ru"]:
        vec.add("fuzz-ru", t, "ru", "ru_jcuken")
    for t in fz["es"]:
        vec.add("fuzz-es", t, "es", "es_accent")
    for t in fz["en"]:
        vec.add("fuzz-en-id", t, "en", "en_identity")
    for t in fz["enx"]:
        for sid in EN_X:
            vec.add("fuzz-en-x", t, "en", sid)
    for t in fz["oov"]:
        vec.add("fuzz-en-oov", t, "en", rng.choice(EN_X))
    for text, source in EDGE_CASES:
        for sid in ALLOWED[source] if source != "en" else ["en_identity", "zh_daqian", "ja_romaji"]:
            vec.add("edge", text, source, sid)
    long_zh = "".join(rng.choice(list(zh_phrases().readings_by_word)) for _ in range(120))[:200]
    for sid in ALLOWED["zh"]:
        vec.add("edge", long_zh, "zh", sid)
    long_en = " ".join(rng.choice(vocab) for _ in range(60))[:200].rstrip()
    for sid in SURFACES:
        vec.add("edge", long_en, "en", sid)
    out.jsonl_gz("tests/fixtures/vectors.jsonl.gz", vec.records)

    # traces: site, challenges, sample
    traces = []
    for rec in vec.valid:
        if rec["class"] == "site":
            traces.append({"id": rec["id"], "ciphertext": rec["expect"]["ciphertext"],
                           "keyText": rec["expect"]["keyText"],
                           "trace": site_trace(rec["expect"]["ciphertext"], json.loads(rec["expect"]["keyText"]))})
    for c in shipped:
        traces.append({"id": f"challenge-{c['n']:02d}", "ciphertext": c["ciphertext"], "keyText": c["keyText"],
                       "trace": site_trace(c["ciphertext"], json.loads(c["keyText"]))})
    for i, (text, source, segments) in enumerate(MIXED):
        result = encode(text, source, segments=segments)
        assert decode(result.ciphertext, result.key) == normalize(text, source)
        assert len(result.key["segments"]) == len(segments)
        traces.append({"id": f"mixed-{i}", "ciphertext": result.ciphertext, "keyText": key_text(result.key),
                       "trace": site_trace(result.ciphertext, result.key)})
    pool = [r for r in vec.valid if r["class"] != "site"]
    by_group: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in pool:
        by_group.setdefault((r["class"], r["surface"]), []).append(r)
    sample: list[dict[str, Any]] = []
    groups = sorted(by_group)
    while len(sample) < 400 and any(by_group[g] for g in groups):
        for g in groups:
            if by_group[g] and len(sample) < 400:
                sample.append(by_group[g].pop(rng.randrange(len(by_group[g]))))
    for rec in sample:
        traces.append({"id": rec["id"], "ciphertext": rec["expect"]["ciphertext"],
                       "keyText": rec["expect"]["keyText"],
                       "trace": site_trace(rec["expect"]["ciphertext"], json.loads(rec["expect"]["keyText"]))})
    out.jsonl_gz("tests/fixtures/traces.jsonl.gz", traces)

    out.jsonl_gz("tests/fixtures/decode-errors.jsonl.gz", tampered(rng, vec.valid, shipped))
    print(f"[fixtures] {len(vec.records)} vectors ({len(vec.valid)} carried), {len(traces)} traces")


def tampered(rng: random.Random, valid: list[dict[str, Any]], shipped: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mutated keys; each one Python's decode refuses (recorded class)."""
    def pick(pred: Callable[[dict[str, Any]], bool], n: int) -> list[tuple[str, dict[str, Any]]]:
        cands = [r for r in valid if pred(r)]
        rng.shuffle(cands)
        return [(r["expect"]["ciphertext"], json.loads(r["expect"]["keyText"])) for r in cands[:n]]

    def has_units(r: dict[str, Any], homophone: bool) -> bool:
        k = json.loads(r["expect"]["keyText"])
        for seg in k["segments"]:
            s = registry.surface(seg["language"], seg["layout"])
            if s.homophone_layer == homophone and any("units" in w for w in seg["words"]):
                return True
        return False

    def first_unit(key: dict[str, Any], homophone: bool) -> dict[str, Any]:
        for seg in key["segments"]:
            s = registry.surface(seg["language"], seg["layout"])
            if s.homophone_layer != homophone:
                continue
            for w in seg["words"]:
                if "units" in w:
                    return w["units"][0]
        raise AssertionError

    def first_word(key: dict[str, Any], with_translation: bool) -> dict[str, Any]:
        for seg in key["segments"]:
            for w in seg["words"]:
                if "units" in w and (("translation" in w) == with_translation):
                    return w
        raise AssertionError

    zh_keys = pick(lambda r: r["surface"] in ("zh_daqian", "zh_pinyin", "zh_hanja") and has_units(r, True), 60)
    bij_keys = pick(lambda r: r["surface"] in ("ko_dubeolsik", "ru_jcuken", "es_accent", "en_identity")
                    and has_units(r, False), 30)
    hop_keys = pick(lambda r: r["source"] == "en" and r["surface"] != "en_identity"
                    and '"translation"' in r["expect"]["keyText"], 40)
    lit_keys = pick(lambda r: '"literal"' in r["expect"]["keyText"] and r["expect"]["ciphertext"], 10)
    shape_keys = pick(lambda r: r["surface"] in ("zh_cangjie", "zh_quick") and r["source"] == "zh"
                      and has_units(r, True), 40)
    all_keys = zh_keys[:10] + bij_keys[:10] + hop_keys[:10]

    muts: list[tuple[str, str, dict[str, Any]]] = []

    def add(name: str, cipher: str, key: dict[str, Any]) -> None:
        muts.append((name, cipher, key))

    def unit_count(key: dict[str, Any], cipher: str) -> int:
        """The candidate count of the first homophone unit (to go one past it)."""
        pos = 0
        for seg in key["segments"]:
            s = registry.surface(seg["language"], seg["layout"])
            for w in seg["words"]:
                for u in w.get("units", []):
                    if s.homophone_layer:
                        return len(s.unit_candidates(cipher[pos:pos + u["len"]], seg["selector_mode"]).candidates)
                    pos += u["len"]
        raise AssertionError

    for i, (c, k) in enumerate(zh_keys[:24]):
        k2 = copy.deepcopy(k)
        u = first_unit(k2, True)
        choice = i % 6
        if choice == 0:
            u["homophone_index"] = -1
        elif choice == 1:
            u["homophone_index"] = unit_count(k, c)
        elif choice == 2:
            u["homophone_index"] = 1.5
        elif choice == 3:
            u["homophone_index"] = True
        elif choice == 4:
            u["homophone_index"] = 1.0
        else:
            del u["homophone_index"]
        add(f"homophone_index-{choice}", c, k2)
    for c, k in bij_keys[:10]:
        k2 = copy.deepcopy(k)
        first_unit(k2, False)["homophone_index"] = 0
        add("index-on-bijective", c, k2)
    for c, k in all_keys[:10]:
        k2 = copy.deepcopy(k)
        for seg in k2["segments"]:
            for w in seg["words"]:
                if "units" in w:
                    del w["units"][0]["len"]
                    break
            else:
                continue
            break
        add("missing-len", c, k2)
    for c, k in all_keys[:10]:
        add("extra-char", c + "a", copy.deepcopy(k))
        add("missing-char", c[:-1], copy.deepcopy(k))
        add("outside-alphabet", "!" + c[1:], copy.deepcopy(k))
    for c, k in all_keys[:6]:
        k2 = copy.deepcopy(k)
        k2["tables_sha256"] = "0" * 64
        add("unknown-edition", c, k2)
        k3 = copy.deepcopy(k)
        k3["keypath"] = "3.0"
        add("key-version", c, k3)
    for c, k in bij_keys[:10]:
        if k["segments"][0]["language"] == "ko":
            k2 = copy.deepcopy(k)
            k2["keypath"] = "1.0"
            add("v1-names-ko", c, k2)
    for c, k in hop_keys[:6]:
        k2 = copy.deepcopy(k)
        seg = k2["segments"][0]
        seg["route"] = [seg["route"][0]] + ["translate:zh>en"] + seg["route"][1:]
        add("disconnected-hops", c, k2)
        k3 = copy.deepcopy(k)
        w = first_word(k3, True)
        w["translations"] = [w["translation"], w["translation"]]
        del w["translation"]
        add("translations-length", c, k3)
        k4 = copy.deepcopy(k)
        k4["source_language"] = "es"
        add("source-mismatch", c, k4)
    for c, k in hop_keys[6:16]:
        k2 = copy.deepcopy(k)
        w = first_word(k2, True)
        w["translation"] = {"tier": 1, "index": 10_000}
        add("hop-index-range", c, k2)
    for c, k in hop_keys[16:22]:
        k2 = copy.deepcopy(k)
        if k2["segments"][0]["layout"] == "zh_daqian":
            continue
        first_word(k2, True)["translation"] = {"tier": 2, "engine": "mockmt-1", "patch": []}
        add("tier2-off-path", c, k2)
    for c, k in lit_keys[:6]:
        k2 = copy.deepcopy(k)
        for seg in k2["segments"]:
            for w in seg["words"]:
                if "literal" in w:
                    w["literal"]["text"] = "\ud800"
        add("literal-surrogate", c, k2)
    for c, k in zh_keys[24:30]:
        k2 = copy.deepcopy(k)
        seg = k2["segments"][0]
        seg["route"] = seg["route"][:-1] + ["keystroke:zh_pinyin" if seg["layout"] != "zh_pinyin"
                                             else "keystroke:zh_daqian"]
        add("route-tail", c, k2)
    for c, k in zh_keys[30:36]:
        k2 = copy.deepcopy(k)
        k2["segments"][0]["language"] = "xx"
        add("unknown-language", c, k2)
    for c, k in zh_keys[36:42]:
        k2 = copy.deepcopy(k)
        first_unit(k2, True)["len"] = 0
        add("len-zero", c, k2)
    # Cangjie and Quick: keyed only (docs/10 §2.1), a chunk must be a code of
    # the table, and the v2.0 edition does not list zh_cangjie.tsv
    shape_tables = {"zh_cangjie": set(zh_cangjie().candidates_by_code), "zh_quick": set(zh_quick().candidates_by_code)}

    def non_code(layout: str, n: int) -> str:
        """The first a-y string of length n (in order) that is no code on `layout`."""
        import itertools
        for letters in itertools.product(SHAPE_LETTERS[::-1], repeat=n):
            if "".join(letters) not in shape_tables[layout]:
                return "".join(letters)
        raise AssertionError((layout, n))

    for i, (c, k) in enumerate(shape_keys[:40]):
        k2 = copy.deepcopy(k)
        seg = k2["segments"][0]
        choice = i % 5
        if choice == 0:
            seg["selector_mode"] = "inline"
            add("shape-inline", c, k2)
        elif choice == 1:
            first_unit(k2, True)["homophone_index"] = unit_count(k, c)
            add("shape-index-range", c, k2)
        elif choice == 2:
            del first_unit(k2, True)["homophone_index"]
            add("shape-index-missing", c, k2)
        elif choice == 3:
            k2["tables_sha256"] = "67a40391169bcb9b891b52c84e126fb386e5b9b6e1153665ea55aba214c161f2"
            add("shape-old-edition", c, k2)
        else:
            # the first unit's chunk (literals take no keys, so it starts the
            # ciphertext) replaced by a well-shaped non-code
            n = first_unit(k2, True)["len"]
            add("shape-not-a-code", non_code(seg["layout"], n) + c[n:], k2)
    for layout, chunk in (("zh_quick", "abc"), ("zh_cangjie", "abcdef"), ("zh_cangjie", "az")):
        tail = list(registry.surface("zh", layout).route_tail)
        add(f"shape-malformed-{layout}", chunk, {
            "keypath": "1.1", "tables_sha256": EDITION, "source_language": "zh",
            "segments": [{"language": "zh", "layout": layout, "route": tail, "selector_mode": "keyed",
                          "words": [{"units": [{"len": len(chunk), "homophone_index": 0}]}]}]})
    ch = {c["n"]: c for c in shipped}
    for n in (2, 4, 5, 6):
        k = json.loads(ch[n]["keyText"])
        k2 = copy.deepcopy(k)
        for seg in k2["segments"]:
            for w in seg["words"]:
                if "translations" in w:
                    w["translations"][0]["index"] = 999
                    break
                if "translation" in w:
                    w["translation"]["index"] = 999
                    break
        add("challenge-hop-range", ch[n]["ciphertext"], k2)
    # docs/10 §2.1 decode-error parity: a zh_cangjie (and a zh_quick) key
    # with selector_mode inline, which both decoders refuse
    for layout in ("zh_cangjie", "zh_quick"):
        c, k = next((c, k) for c, k in shape_keys if k["segments"][0]["layout"] == layout)
        k2 = copy.deepcopy(k)
        k2["segments"][0]["selector_mode"] = "inline"
        add(f"{layout.removeprefix('zh_')}-inline", c, k2)
    records = []
    for name, cipher, key in muts:
        text = json.dumps(key, ensure_ascii=False, indent=2) + "\n"
        text = re.sub("[\ud800-\udfff]", lambda m: "\\u%04x" % ord(m.group()), text)
        try:
            decode(cipher, loads_key(text))
        except keypath.errors.KeypathError as exc:  # type: ignore[attr-defined]
            records.append({"id": f"{name}-{len(records)}", "ciphertext": cipher, "keyText": text,
                            "error": type(exc).__name__})
            continue
        raise SystemExit(f"tampered key {name} decoded without error")
    assert len(records) >= 100, len(records)
    return records


def digests(out: Out, vocab: list[str], rows: dict[str, dict[str, tuple]]) -> None:
    chars = zh_chars()
    phrases = zh_phrases()
    dq = surface_of("zh_daqian")
    py = surface_of("zh_pinyin")
    words = sorted(set(phrases.readings_by_word) | set(chars.readings_by_char))
    shards: dict[int, list[str]] = {i: [] for i in range(256)}

    def fmt(result: Any) -> tuple[str, str, str]:
        if result is None:
            return "-", "-", "-"
        units, keys = result
        return (keys, ",".join(str(u["len"]) for u in units),
                ",".join(str(u["homophone_index"]) for u in units))

    for w in words:
        d = fmt(dq.encode_word(w, "keyed"))
        p = fmt(py.encode_word(w, "keyed"))
        h = fmt(zh_ko_hanja.encode_word(w, "keyed"))
        assert d[2] == p[2]
        shards[ord(w[0]) & 0xFF].append("\t".join([w, d[0], d[1], p[0], p[1], d[2], h[0], h[1], h[2]]) + "\n")
    result: dict[str, Any] = {"zh": {f"{i:02x}": sha("".join(shards[i])) for i in range(256)}}
    result["zhCount"] = len(words)
    # the same words on Cangjie and Quick (a word with a character that has
    # no code is "-": a tier-3 literal)
    cj, qk = surface_of("zh_cangjie"), surface_of("zh_quick")
    shape_shards: dict[int, list[str]] = {i: [] for i in range(256)}
    for w in words:
        c = fmt(cj.encode_word(w, "keyed"))
        q = fmt(qk.encode_word(w, "keyed"))
        assert (c[0] == "-") == (q[0] == "-"), w
        shape_shards[ord(w[0]) & 0xFF].append("\t".join([w, *c, *q]) + "\n")
    result["zhShape"] = {f"{i:02x}": sha("".join(shape_shards[i])) for i in range(256)}
    # every character's (code, index) on both (docs/10 §9.7: `cangjie`
    # char<TAB>code<TAB>idx and `quick` char<TAB>quick<TAB>idx, lines sorted
    # by code point), through the surfaces' own encoders
    table = zh_cangjie()
    for name, surface, codes in (("cangjie", cj, table.code_by_char), ("quick", qk, zh_quick().code_by_char)):
        lines = []
        for char, code in codes.items():
            units, keys = surface.encode_word(char, "keyed")
            assert keys == code and len(units) == 1, (name, char)
            lines.append(f"{char}\t{keys}\t{units[0]['homophone_index']}\n")
        result[name] = sha("".join(sorted(lines)))
        result[f"{name}Count"] = len(lines)
    result["readings"] = sha("".join(
        f"{r}\t{daqian_layout.keys_for_reading(r)}\t{pinyin_layout.keys_for_reading(r)}\n"
        for r in sorted(chars.candidates_by_reading)))
    result["ko"] = sha("".join(f"{u}\t{ko_layout.keys_for_unit(u)}\n" for u in ko_layout.units()))
    primary = ko_hanja_readings().primary_by_char
    result["hanjaPrimary"] = sha("".join(f"{c}\t{primary[c]}\n" for c in sorted(primary)))
    result["rows"] = {}
    for sid in EN_X:
        lines = []
        for w in sorted(vocab):
            _row, entry, cipher = rows[sid][w]
            lines.append(f"{w}\t{'-' if entry is None else jdump(entry)}\t{cipher if entry else '-'}\n")
        result["rows"][sid] = sha("".join(lines))
    out.json("tests/fixtures/digests.json", result)


def unicode_fixture(out: Out) -> None:
    lower = []
    for cp in range(0x110000):
        ch = chr(cp)
        if unicodedata.category(ch) in ("Cn", "Cs"):
            continue
        if ch.lower() != ch:
            lower.append([cp, ch.lower()])
    samples_in = [
        "각", "한국", "é", "Å", "Å",
        "豈更車", "\U0002f800", "👩‍💻", "🇹🇼", "Ё", "Ё", "ñ", "ñ",
        "̈́", "क़", "ｶﾞ", "각", "Ạ̊", "ΣΑΣ", "ΟΔΟΣ", "İ", "ǅ", "ﬀ",
    ]
    samples = [[s, unicodedata.normalize("NFC", s)] for s in samples_in]
    lowers = [[s, s.lower()] for s in ["ΟΔΟΣ ΣΑΣ", "Σ", "ΑΣ.", "İSTANBUL", "ǅemal", "ΣΑΣ", "ABCΣ1", "aΣb"]]
    out.json("tests/fixtures/unicode.json", {"lower": lower, "samples": samples, "lowerStrings": lowers})
    print(f"[unicode] {len(lower)} code points lowercase differently")


def static_fixture(out: Out, hero: dict[str, Any], vec_rows: dict[str, dict[str, tuple]]) -> None:
    units = [u for w in hero["trace"]["segments"][0]["words"] for u in w["units"]]
    factors = [u["count"] for u in units]
    keyspace = 1
    for f in factors:
        keyspace *= f
    counts = [len(v) for v in zh_chars().candidates_by_reading.values()]
    analysis = (PROJECT / "docs" / "09-analysis.md").read_text(encoding="utf-8")
    m = re.search(r"On the zh round-trip corpus, ([0-9.]+)% of the (\d+) Dàqiān", analysis)
    assert m, "docs/09 rank-0 sentence not found"
    assert "median of 11 and at most 215" in analysis
    # the mixed strip
    strip = encode(STRIP["text"], STRIP["source"], segments=STRIP["segments"])
    assert strip.ciphertext == STRIP["ciphertext"], strip.ciphertext
    parts = []
    pos = 0
    for seg in strip.key["segments"]:
        n = sum(u["len"] for w in seg["words"] for u in w.get("units", []))
        parts.append({"keys": strip.ciphertext[pos:pos + n],
                      "surface": SITE_ID[(seg["language"], seg["layout"])]})
        pos += n
    words = hero["trace"]["segments"][0]["words"]
    yu = units[1]
    static = {
        "hero": {"text": hero["text"], "ciphertext": hero["ciphertext"], "surface": hero["surface"],
                 "factors": factors, "keyspace": keyspace},
        "step1": {"source": words[0]["source"], "target": words[0]["chain"][0]["word"],
                  "index": words[0]["chain"][0]["index"], "count": words[0]["chain"][0]["count"]},
        "step2": {"reading": yu["reading"], "pinyin": pinyin_layout.keys_for_reading(yu["reading"]),
                  "count": yu["count"], "head": list(hero["lists"][yu["reading"]])[:4],
                  "chosen": yu["out"], "index": yu["index"]},
        "step3": {"keys": list(yu["keys"]),
                  "legends": [{v: k for k, v in {**zh_daqian().symbol_to_key, **zh_daqian().tone_to_key}.items()}[k]
                              for k in yu["keys"]]},
        "strip": {"text": STRIP["text"], "ciphertext": strip.ciphertext, "parts": parts,
                  "leakage": strip.leakage},
        "stats": {"keyspace": keyspace, "factors": factors, "medianCandidates": statistics.median(counts),
                  "maxCandidates": max(counts), "rank0Percent": float(m.group(1)),
                  "rank0Choices": int(m.group(2))},
        "chips": [{"text": t, "source": s, "surface": sid, "ciphertext": c} for t, s, sid, c in CHIPS],
        "heroAll": HERO_ALL,
    }
    assert static["stats"]["medianCandidates"] == 11 and static["stats"]["maxCandidates"] == 215
    out.json("tests/fixtures/static.json", static)


# ================================================================== main

# Where every generated file comes from (docs/10 §9.2).  SOURCE_INFO names
# each source; SOURCES maps a path glob (first match wins) to the directory
# whose NOTICE covers it and to its sources, each copyleft one with the
# dates its data was changed.  The NOTICE files are written from this map,
# and tests/fixtures/sources.json carries it to the page's coverage test.
SOURCE_INFO: dict[str, tuple[str, str, str | None, bool]] = {
    # id: (name, license, license text, copyleft)
    "chewing": ("libchewing-data", "LGPL-2.1-or-later", "LICENSES/LGPL-2.1.txt", True),
    "skk": ("SKK-JISYO.L", "GPL-2.0-or-later", "LICENSES/GPL-2.0.txt", True),
    "spa": ("FreeDict spa-eng 0.3.1", "GPL-2.0-or-later", "LICENSES/GPL-2.0.txt", True),
    "keng": ("kengdic", "LGPL-2.0-or-later", "LICENSES/LGPL-2.0.txt", True),
    "cedict": ("CC-CEDICT", "CC BY-SA 4.0", None, False),
    "jmdict": ("JMdict", "CC BY-SA 4.0", None, False),
    "hanja": ("libhangul hanja.txt", "BSD-3-Clause", None, False),
    "rus": ("FreeDict rus-eng", "CC BY-SA 3.0", None, False),
    "wordfreq": ("wordfreq data", "CC BY-SA 4.0", None, False),
    "unihan": ("Unihan", "Unicode-3.0", "LICENSES/Unicode-3.0.txt", False),
    "ucd": ("Unicode Character Database", "Unicode License", "LICENSES/Unicode.txt", False),
    "keypath": ("KeyPath", "MIT", "LICENSE", False),
}
_CHEWING = {"chewing": ("2026-07-10", "2026-09-23", "2026-09-24")}
_CHEWING_SHAPE = {"chewing": ("2026-07-10", "2026-09-28")}   # the Cangjie table's character set and order
_SKK = {"skk": ("2026-07-10", "2026-09-24")}
_SPA = {"spa": ("2026-07-10", "2026-09-24")}
_KENG = {"keng": ("2026-09-23", "2026-09-24")}
_ = ()
SOURCES: list[tuple[str, str | None, dict[str, tuple[str, ...]]]] = [
    ("data/registry.json", None, {"keypath": _}),
    ("data/manifest.json", None, {"keypath": _}),
    ("data/unicode14.json", None, {"ucd": _}),
    ("data/hero.json", "data", {"cedict": _, **_CHEWING}),
    ("data/layouts.json", "data", {"keypath": _, **_CHEWING}),
    ("data/quick.json", "data", {"unihan": _, **_CHEWING_SHAPE}),
    ("data/zh/core.json", "data/zh", {**_CHEWING}),
    ("data/zh/p/*.txt", "data/zh", {**_CHEWING, "hanja": _}),
    ("data/hanja/core.json", None, {"hanja": _}),
    ("data/cangjie/*.json", "data/cangjie", {"unihan": _, **_CHEWING_SHAPE}),
    ("data/en/vocab/*.json", None, {"wordfreq": _}),
    ("data/en/zh_daqian/*.json", "data/en/zh_daqian", {"cedict": _, **_CHEWING, "wordfreq": _}),
    ("data/en/zh_pinyin/*.json", "data/en/zh_pinyin", {"cedict": _, **_CHEWING, "wordfreq": _}),
    ("data/en/zh_cangjie/*.json", "data/en/zh_cangjie", {"cedict": _, "unihan": _, **_CHEWING_SHAPE, "wordfreq": _}),
    ("data/en/zh_hanja/*.json", "data/en/zh_hanja", {"cedict": _, **_CHEWING, "hanja": _, "wordfreq": _}),
    ("data/en/ja_romaji/*.json", "data/en/ja_romaji", {"jmdict": _, **_SKK, "wordfreq": _}),
    ("data/en/ko_dubeolsik/*.json", "data/en/ko_dubeolsik", {**_KENG, "wordfreq": _}),
    ("data/en/ru_jcuken/*.json", None, {"rus": _, "wordfreq": _}),
    ("data/en/es_accent/*.json", "data/en/es_accent", {**_SPA, "wordfreq": _}),
    ("data/challenges/02.json", "data/challenges", {"keypath": _, "cedict": _, **_SPA, **_CHEWING, "wordfreq": _}),
    ("data/challenges/*.json", "data/challenges",
     {"keypath": _, "cedict": _, "rus": _, **_CHEWING, "hanja": _, "wordfreq": _}),
    ("tests/fixtures/*", "tests/fixtures",
     {"keypath": _, "cedict": _, "jmdict": _, **_SKK, **_KENG, "hanja": _, "rus": _, **_SPA,
      "chewing": _CHEWING["chewing"] + ("2026-09-28",), "unihan": _, "wordfreq": _, "ucd": _}),
]


def glob_match(glob: str, path: str) -> bool:
    """A path glob: `*` matches any run of characters other than `/`."""
    return re.fullmatch("[^/]*".join(re.escape(part) for part in glob.split("*")), path) is not None


def source_of(path: str) -> tuple[str, str | None, dict[str, tuple[str, ...]]]:
    for entry in SOURCES:
        if glob_match(entry[0], path):
            return entry
    raise AssertionError(f"{path}: no SOURCES entry")


def and_list(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def notices(out: Out) -> None:
    """GPL-2.0 §2(a) / LGPL §2(b): the files derived from the copyleft sources
    carry a notice that they were changed, and when: one NOTICE per
    directory named in SOURCES, over the files it covers."""
    covered: dict[str, dict[str, Any]] = {}
    for rel in sorted(out.files):
        if not (rel.startswith("data/") or rel.startswith("tests/fixtures/")) or rel.endswith("/NOTICE"):
            continue
        _glob, folder, sources = source_of(rel)
        copyleft = {sid: dates for sid, dates in sources.items() if SOURCE_INFO[sid][3]}
        assert bool(folder) == bool(copyleft), rel
        if not folder:
            continue
        assert rel.startswith(folder + "/"), (rel, folder)
        entry = covered.setdefault(folder, {"files": [], "sources": {}})
        entry["files"].append(rel[len(folder) + 1:])
        for sid, dates in copyleft.items():
            entry["sources"].setdefault(sid, set()).update(dates)
    for folder, entry in covered.items():
        direct = [f for f in entry["files"] if "/" not in f]
        subdirs = sorted({f.rsplit("/", 1)[0] for f in entry["files"] if "/" in f})
        siblings = [p.rsplit("/", 1)[1] for p in out.files if p.rsplit("/", 1)[0] == folder and not p.endswith("/NOTICE")]
        which = []
        if direct:
            which.append("the files in this directory" if sorted(direct) == sorted(siblings) else and_list(sorted(direct)))
        which += [f"{'in' if which else 'the files in'} {d}/" for d in subdirs]
        up = "../" * folder.count("/") + "../"
        lines = [f"Parts of {and_list(which)} are modified versions of:", ""]
        for sid in SOURCE_INFO:
            if sid in entry["sources"]:
                name, lic, text, _copyleft = SOURCE_INFO[sid]
                lines.append(f"- {name} ({lic}, {up}{text}), changed by the KeyPath project on "
                             f"{and_list(sorted(entry['sources'][sid]))}")
        lines += ["", "They are not the original works; do not report errors in them upstream.",
                  f"What was changed, the copyright notices and the upstream versions: {up}DATA-LICENSES.md",
                  "(\"Changes to the GPL and LGPL sources\"); later changes: this repository's history.",
                  "They are distributed WITHOUT ANY WARRANTY; without even the implied warranty of",
                  "MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the license texts above.", ""]
        out.write(f"{folder}/NOTICE", "\n".join(lines))
    out.json("tests/fixtures/sources.json", {
        "sources": {sid: {"name": n, "license": lic, "text": text, "copyleft": c}
                    for sid, (n, lic, text, c) in SOURCE_INFO.items()},
        "files": [{"glob": g, "notice": folder, "sources": {sid: list(d) for sid, d in srcs.items()}}
                  for g, folder, srcs in SOURCES],
    })


def kp1_ordinals(out: Out) -> None:
    """kp1's ordinal lists (docs/10 §2.2) in the golden's own format; the
    cipher project's tests/golden/kp1-ordinals.jsonl must be the same bytes."""
    lines = [{"list": "languages", "ordinal": i, "id": lang} for i, lang in enumerate(registry.LANGUAGES)]
    lines += [{"list": "surfaces", "ordinal": i, "id": list(pair)} for i, pair in enumerate(registry.SURFACES)]
    text = "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines)
    golden = (PROJECT / "tests" / "golden" / "kp1-ordinals.jsonl").read_text(encoding="utf-8")
    assert text == golden, "the registry's ordinals differ from kp1-ordinals.jsonl"
    out.write("tests/fixtures/kp1-ordinals.jsonl", text)


# docs/10 §2.2 "Accepted but refused": each unpacks and packs back to itself,
# and decode refuses its key; with a ciphertext of the right length for it.
KP1_REFUSED = [
    ("kp1.AQFnpAORFpsFAQABBQABAgEHAAEAkvYj", "cj0"),      # route translate:ru>zh: unknown hop
    ("kp1.AQFnpAORFpsFAQABAwABAgEHAAEAMGz8", "cj0"),      # source ru, hop en>zh: not from the source
    ("kp1.AQEujFMFrFIEAQUAAAEAAQZoE74", "gks"),           # 1.1 on edition v1.0 with ko_dubeolsik
    ("kp1.AQAujFMFrFIAAQAAAAEAAv____8P_____w8HAJ_yXA", "su3cl3"),  # len 2^31-1, index 2^32-1
]
# a walk whose hint and literal are markup (docs/10 §10 M14): text, never HTML
MARKUP = "<img src=x onerror=alert(1)>"


def py_pack(key_text: str) -> str | None:
    """Python's kp1 pack of a key's text, or None when it has no kp1 form
    (or is no valid key at all); either way it must not raise otherwise."""
    try:
        key = json.loads(key_text)
    except ValueError:
        return None
    try:
        return kp1_pack(key)
    except KeyValidationError:
        return None


def kp1_fixtures(out: Out) -> None:
    """tests/fixtures/kp1.json: the kp1 goldens, reject vectors and
    accepted-but-refused strings (docs/10 §2.2), and a markup walk;
    tests/fixtures/kp1-keys.jsonl.gz: Python's pack of every key in the
    other fixtures (null where it has no kp1 form)."""
    golden = PROJECT / "tests" / "golden"
    accepted = []
    for line in (golden / "kp1.jsonl").read_text(encoding="utf-8").splitlines():
        g = json.loads(line)
        key = json.loads((PROJECT / g["source"]).read_text(encoding="utf-8"))
        for step in g["path"]:
            key = key[step]
        assert kp1_pack(key) == g["kp1"], g["source"]
        assert dumps_key(kp1_unpack(g["kp1"])) == dumps_key(key), g["source"]
        accepted.append({"source": g["source"], "path": g["path"], "kp1": g["kp1"], "keyText": dumps_key(key)})
    rejected = []
    for line in (golden / "kp1-reject.jsonl").read_text(encoding="utf-8").splitlines():
        g = json.loads(line)
        try:
            kp1_unpack(g["kp1"])
        except KeyValidationError:
            rejected.append({"why": g["why"], "kp1": g["kp1"]})
            continue
        raise SystemExit(f"kp1 reject vector accepted: {g['why']}")
    refused = []
    for s, cipher in KP1_REFUSED:
        key = kp1_unpack(s)
        assert kp1_pack(key) == s, s
        try:
            decode(cipher, key)
        except KeypathError as exc:
            refused.append({"kp1": s, "keyText": dumps_key(key), "ciphertext": cipher, "error": type(exc).__name__})
            continue
        raise SystemExit(f"accepted-but-refused kp1 decoded: {s}")
    # the hero's key with a markup hint and a markup literal after its words
    hero = py_encode(HERO[0], HERO[1], HERO[2])
    key = copy.deepcopy(hero.key)
    key["segments"][0]["words"].append({"literal": {"tier": 3, "text": MARKUP}})
    key["segments"][0]["hint"] = MARKUP
    markup = {"ciphertext": hero.ciphertext, "keyText": dumps_key(key), "kp1": kp1_pack(key),
              "decoded": decode(hero.ciphertext, key)}
    assert markup["decoded"].endswith(MARKUP)
    out.json("tests/fixtures/kp1.json", {"accepted": accepted, "rejected": rejected, "refused": refused,
                                          "markup": markup})
    # every key of the other fixtures, once each
    seen: set[str] = set()
    rows = []
    for fixture in ("vectors", "traces", "decode-errors"):
        for rec in json.loads("[" + ",".join(gzip.decompress(out.files[f"tests/fixtures/{fixture}.jsonl.gz"])
                                             .decode("utf-8").splitlines()) + "]"):
            text = rec.get("expect", {}).get("keyText") if fixture == "vectors" else rec["keyText"]
            if text is None or text in seen:
                continue
            seen.add(text)
            rows.append({"fixture": fixture, "id": rec["id"], "kp1": py_pack(text)})
    out.jsonl_gz("tests/fixtures/kp1-keys.jsonl.gz", rows)
    print(f"[kp1] {len(accepted)} goldens, {len(rejected)} reject vectors, {len(refused)} refused; "
          f"{len(rows)} fixture keys, {sum(r['kp1'] is not None for r in rows)} with a kp1 form")


def guards() -> None:
    assert keypath.__version__ == VERSION, keypath.__version__
    assert tables_sha256() == EDITION, tables_sha256()
    assert (PROJECT / "puzzles").is_dir(), PROJECT


def build(root: Path) -> Out:
    guards()
    out = Out(root)
    out.json("data/registry.json", registry_data())
    out.json("data/layouts.json", layouts_data())
    out.json("data/unicode14.json", unicode14_ranges())
    zh_data(out)
    hanja_data(out)
    shape = shape_data(out)
    vocab = vocabulary()
    example_words = set(re.findall("[a-z]+", " ".join([HERO[0]] + [c[0] for c in CHIPS if c[1] == "en"])))
    assert example_words <= set(vocab), example_words - set(vocab)
    rows = english_data(out, vocab, shape)
    shipped = challenges_data(out)
    hero = hero_data(out)
    corpora = load_corpora()
    build_fixtures(out, vocab, rows, corpora, shipped)
    digests(out, vocab, rows)
    unicode_fixture(out)
    static_fixture(out, hero, rows)
    kp1_ordinals(out)
    kp1_fixtures(out)
    notices(out)
    files = {rel: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
             for rel, data in sorted(out.files.items()) if rel.startswith("data/")}
    out.json("data/manifest.json", {"keypath": keypath.__version__, "tag": TAG, "edition": EDITION,
                                    "vocab": VOCAB_SIZE, "files": files})
    return out


def budget(out: Out) -> None:
    def size(rel: str) -> tuple[int, int]:
        data = out.files.get(rel)
        if data is None:
            data = (SITE / rel).read_bytes()
        return len(data), gz_size(data)

    first = ["data/registry.json", "data/layouts.json", "data/unicode14.json", "data/hero.json"]
    raw = sum(size(r)[0] for r in first)
    g = sum(size(r)[1] for r in first)
    print(f"[budget] first-view data: {raw / 1024:.1f} KB raw / {g / 1024:.1f} KB gz")
    data_files = [r for r in out.files if r.startswith("data/")]
    total = sum(len(out.files[r]) for r in data_files)
    largest = max(data_files, key=lambda r: gz_size(out.files[r]))
    print(f"[budget] data/ total {total / 1024:.0f} KB raw in {len(data_files)} files; "
          f"largest gz {largest} {gz_size(out.files[largest]) / 1024:.1f} KB")
    fixtures = sum(len(v) for r, v in out.files.items() if r.startswith("tests/fixtures/"))
    print(f"[budget] tests/fixtures total {fixtures / 1024:.0f} KB")


def check() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        build(root)
        bad = []
        for sub in ("data", "tests/fixtures"):
            new = {p.relative_to(root).as_posix() for p in (root / sub).rglob("*") if p.is_file()}
            old = {p.relative_to(SITE).as_posix() for p in (SITE / sub).rglob("*") if p.is_file()}
            for rel in sorted(new | old):
                if rel not in new or rel not in old or not filecmp.cmp(root / rel, SITE / rel, shallow=False):
                    bad.append(rel)
        if bad:
            print("[check] differs:", *bad[:20], sep="\n  ")
            return 1
    print("[check] data/ and tests/fixtures/ are up to date")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="rebuild to a temp dir and byte-compare")
    args = parser.parse_args()
    if args.check:
        return check()
    for sub in ("data", "tests/fixtures"):
        shutil.rmtree(SITE / sub, ignore_errors=True)
    out = build(SITE)
    budget(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
