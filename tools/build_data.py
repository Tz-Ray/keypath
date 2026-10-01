#!/usr/bin/env python3
"""Generate the site's data/ and tests/fixtures/ from keypath 2.6.0.

Everything under data/ and tests/fixtures/ is written by this script and
never edited by hand.  The oracle is the keypath package installed in the
site's own venv (from the cipher project at tag v2.6); the cipher project
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
import contextlib
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
from keypath import cli as keypath_cli  # noqa: E402
from keypath import lookup as toolkit  # noqa: E402
from keypath import registry  # noqa: E402
from keypath.editions import edition_tables, known_editions  # noqa: E402
from keypath.keyspec import (  # noqa: E402
    KEY_SCHEMA, KEY_VERSION, KEY_VERSIONS, V1_LANGUAGES, V1_LAYOUTS, compute_leakage, dumps_key, loads_key,
    validate_key,
)
from keypath.errors import KeyValidationError, KeypathError, LayoutError  # noqa: E402
from keypath.keycodec import pack as kp1_pack, payload as kp1_payload, text as kp1_text  # noqa: E402
from keypath.keycodec import unpack as kp1_unpack  # noqa: E402
from keypath.layouts import el_greek as el_layout  # noqa: E402
from keypath.layouts import ja_kana as kana_layout  # noqa: E402
from keypath.layouts import ja_romaji as ja_layout  # noqa: E402
from keypath.layouts.keyboard import US_ROWS, US_SHIFTED_ROWS  # noqa: E402
from keypath.layouts import vi_telex as vi_telex_layout  # noqa: E402
from keypath.layouts import vi_vni as vi_vni_layout  # noqa: E402
from keypath.layouts import zh_cangjie as cangjie_layout  # noqa: E402
from keypath.layouts import zh_quick as quick_layout  # noqa: E402
from keypath.layouts import ko_dubeolsik as ko_layout  # noqa: E402
from keypath.layouts import zh_daqian as daqian_layout  # noqa: E402
from keypath.layouts import zh_eten as eten_layout  # noqa: E402
from keypath.layouts import zh_jyutping as jyutping_layout  # noqa: E402
from keypath.layouts import zh_pinyin as pinyin_layout  # noqa: E402
from keypath.normalize import LOWERCASE_LANGUAGES, RECOMPOSED_LANGUAGES, normalize  # noqa: E402
from keypath.surfaces import el as el_language  # noqa: E402
from keypath.surfaces import zh as zh_surface  # noqa: E402
from keypath.surfaces import zh_ko_hanja  # noqa: E402
from keypath.surfaces.base import SPACED  # noqa: E402
from keypath.tables import (  # noqa: E402
    VI_CHECKED_TONES, VI_STOP_CODAS, VI_TONE_MARKS, el_en, el_greek, es_accent, es_en, ja_kana, ja_romaji, ko_dubeolsik,
    ko_hanja, ko_hanja_readings, ru_en, ru_jcuken, tables_sha256, vi_syllables, vi_telex, vi_vni, zh_cangjie, zh_chars,
    zh_daqian, zh_eten, zh_jyutping, zh_phrases, zh_pinyin, zh_quick,
)
from keypath.trace import trace as trace1  # noqa: E402
from keypath.walk import decode, encode  # noqa: E402

SITE = Path(__file__).resolve().parent.parent
# a checkout of the cipher project at tag v2.6; by default next to this repository
PROJECT = Path(os.environ.get("KEYPATH_PROJECT", SITE.parent / "cipher-project"))
VERSION = "2.6.0"
TAG = "v2.6"
EDITION = "05b2373935c571bb838d6791d13dd567ca3fe2553ea42634daed5afa19379bd2"
VOCAB_SIZE = 10_000
SEED = 20260924
LETTERS = "abcdefghijklmnopqrstuvwxyz"
SHAPE_LETTERS = "abcdefghijklmnopqrstuvwxy"   # Cangjie and Quick keys (z is unused)
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"

# The site's surfaces, in chip order: id -> (language, layout).
SURFACES: dict[str, tuple[str, str]] = {
    "zh_daqian": ("zh", "zh_daqian"),
    "zh_eten": ("zh", "zh_eten"),
    "zh_pinyin": ("zh", "zh_pinyin"),
    "zh_jyutping": ("zh", "zh_jyutping"),
    "zh_cangjie": ("zh", "zh_cangjie"),
    "zh_quick": ("zh", "zh_quick"),
    "zh_hanja": ("zh", "ko_dubeolsik"),
    "ja_romaji": ("ja", "ja_romaji"),
    "ja_kana": ("ja", "ja_kana"),
    "ko_dubeolsik": ("ko", "ko_dubeolsik"),
    "ru_jcuken": ("ru", "ru_jcuken"),
    "es_accent": ("es", "es_accent"),
    "vi_telex": ("vi", "vi_telex"),
    "vi_vni": ("vi", "vi_vni"),
    "el_greek": ("el", "el_greek"),
    "en_identity": ("en", "en_identity"),
}
SURFACE_LABELS = {
    "zh_daqian": ("ㄅ", "Bopomofo (Taiwan)", "a Bopomofo (Dàqiān) keyboard"),
    "zh_eten": ("倚", "Bopomofo ETen", "a Bopomofo ETen keyboard"),
    "zh_pinyin": ("pīn", "Pinyin", "a Pinyin keyboard with tone numbers"),
    "zh_jyutping": ("粵", "Cantonese Jyutping", "a Cantonese Jyutping keyboard with tone numbers"),
    "zh_cangjie": ("倉", "Cangjie", "a Cangjie keyboard"),
    "zh_quick": ("速", "Quick", "a Quick (simplified Cangjie) keyboard"),
    "zh_hanja": ("漢", "Chinese on a Korean keyboard", "a Korean keyboard, as hanja"),
    "ja_romaji": ("か", "Japanese romaji", "a Japanese romaji keyboard"),
    "ja_kana": ("あ", "Japanese kana", "a Japanese JIS kana keyboard"),
    "ko_dubeolsik": ("한", "Korean", "a Korean (Dubeolsik) keyboard"),
    "ru_jcuken": ("Й", "Russian ЙЦУКЕН", "a Russian ЙЦУКЕН keyboard"),
    "es_accent": ("ñ", "Spanish accents", "a Spanish accent-digit keyboard"),
    "vi_telex": ("ư", "Vietnamese Telex", "a Vietnamese Telex keyboard"),
    "vi_vni": ("ơ", "Vietnamese VNI", "a Vietnamese VNI keyboard"),
    "el_greek": ("λ", "Greek", "a Greek keyboard"),
    "en_identity": ("a", "Plain English", "a plain English keyboard"),
}
SITE_ID = {pair: sid for sid, pair in SURFACES.items()}
# Languages no hop leaves or reaches (docs/10 §6.5: vi is native-only): their
# surfaces take only their own language, and no other source reaches them.
NATIVE_ONLY = {"vi"}
VI = [sid for sid, (lang, _layout) in SURFACES.items() if lang == "vi"]
EN_X = [sid for sid, (lang, _layout) in SURFACES.items() if sid != "en_identity" and lang not in NATIVE_ONLY]
# Surfaces whose English rows the page derives from another surface's rows
# instead of loading files (docs/10 §9.7): ETen rows are the Dàqiān rows
# with each key remapped symbol by symbol; Quick rows are the Cangjie rows
# with each unit recoded to its Quick code and re-indexed in the Quick list;
# JIS kana rows are the romaji rows with each unit's kana retyped on the
# kana keys.  Indices, counts and heads are the base rows'.
DERIVED_ROWS = {"zh_eten": "zh_daqian", "zh_quick": "zh_cangjie", "ja_kana": "ja_romaji"}
ALLOWED = {
    "en": [sid for sid, (lang, _layout) in SURFACES.items() if lang not in NATIVE_ONLY],
    "zh": [sid for sid, (lang, _layout) in SURFACES.items() if lang == "zh"],
    "ko": ["ko_dubeolsik"],
    "ru": ["ru_jcuken"],
    "es": ["es_accent"],
    "vi": VI,
    # docs/10 §9.7: Greek from Greek and from English; el→X routes are
    # refused (the lists they read are never shipped, REFUSED_HOPS)
    "el": ["el_greek"],
}
# docs/10 §9.7: hops whose candidate lists the page never ships (the el→en
# lists), so a key that walks one is refused, never guessed
REFUSED_HOPS = ["translate:el>en"]
# The workbench's keyboards (docs/10 §9.7, M14): lookup and type answer for
# the one layout the visitor names, over every surface typed on it (both of
# ko_dubeolsik's: Korean and hanja).  No Japanese.
# M15 adds Vietnamese Telex and VNI; M16 ETen and Jyutping, each placed after
# its twin (Dàqiān, Pinyin) as the page's chips are; M17 Greek, last.
WORKBENCH_LAYOUTS = ["zh_daqian", "zh_eten", "zh_pinyin", "zh_jyutping", "zh_cangjie", "zh_quick", "ko_dubeolsik",
                     "ru_jcuken", "es_accent", "en_identity", "vi_telex", "vi_vni", "el_greek"]

# Examples used by the page (§6); every one is re-encoded and asserted.
HERO = ("welcome home", "en", "zh_daqian", "cj0u/6ru8")
CHIPS = [
    ("welcome home", "en", "zh_daqian", "cj0u/6ru8"),
    ("鍵盤", "zh", "zh_daqian", "ru04q06"),
    ("國家", "zh", "zh_hanja", "rnrrk"),
    ("한국어", "ko", "ko_dubeolsik", "gksrnrdj"),
    ("ёжик", "ru", "ru_jcuken", "`;br"),
    ("mañana", "es", "es_accent", "man1ana"),
    ("tiếng việt", "vi", "vi_telex", "tieesngvieejt"),
    ("καλημέρα", "el", "el_greek", "kalhm;era"),
]
HERO_ALL = {
    "zh_daqian": "cj0u/6ru8", "zh_pinyin": "huan1ying2jia1", "zh_hanja": "ghksdudrk",
    "zh_cangjie": "tgnoyhvljmso", "zh_quick": "toyljo",
    "ko_dubeolsik": "ghksduddkstlrcj", "ru_jcuken": "ghbdtncndjdfnmljvf",
    "ja_romaji": "kanngeikokunai", "es_accent": "bienvenida", "en_identity": "welcomehome",
    "zh_eten": "hx8e-2gea", "zh_jyutping": "fun1jing4gaa1", "ja_kana": "ty'[ebhue",
    "el_greek": "kalvs;orismasp;iti",
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
    # docs/10 §10 M15: Telex and VNI segments alternating
    ("tôi yêu việt nam", "vi", [{"length": 4, "route": "vi", "layout": "vi_telex"},
                                {"length": 4, "route": "vi", "layout": "vi_vni"},
                                {"length": 8, "route": "vi", "layout": "vi_telex"}]),
    ("chúc mừng năm mới", "vi", [{"length": 5, "route": "vi", "layout": "vi_vni"},
                                 {"length": 5, "route": "vi", "layout": "vi_telex"},
                                 {"length": 4, "route": "vi", "layout": "vi_vni"},
                                 {"length": 3, "route": "vi", "layout": "vi_telex"}]),
    # docs/10 §10 M16: Dàqiān and ETen over one text; Pinyin, Jyutping and
    # Cangjie over one text; romaji and JIS kana; kana's backslash (む) right
    # before an ЙЦУКЕН bracket (х)
    ("無所不能明天見", "zh", [{"length": 4, "route": "zh", "layout": "zh_daqian"},
                        {"length": 3, "route": "zh", "layout": "zh_eten"}]),
    ("學而時習之", "zh", [{"length": 2, "route": "zh", "layout": "zh_pinyin"},
                     {"length": 2, "route": "zh", "layout": "zh_jyutping"},
                     {"length": 1, "route": "zh", "layout": "zh_cangjie"}]),
    ("welcome home, thank you", "en", [{"length": 13, "route": "ja", "layout": "ja_romaji"},
                                       {"length": 10, "route": "ja", "layout": "ja_kana"}]),
    ("six good", "en", [{"length": 4, "route": "ja", "layout": "ja_kana"},
                        {"length": 4, "route": "ru", "layout": "ru_jcuken"}]),
    # docs/10 §10 M17: Greek's tonos `;` right after Dàqiān's ㄤ `;` (ej;;hliow)
    ("light sun", "en", [{"length": 6, "route": "zh", "layout": "zh_daqian"},
                         {"length": 3, "route": "el", "layout": "el_greek"}]),
    ("the sea, my friend", "en", [{"length": 8, "route": "el", "layout": "el_greek"},
                                  {"length": 10, "route": "ru", "layout": "ru_jcuken"}]),
]
# the tables edition of KeyPath 2.4, which lists neither Greek table
EDITION_V2_4 = "b31f6b0c5fd8391c1fc7bc1c4a1491152a449308bdd1abe3e53dad8fa80dc55b"
# the tables edition of KeyPath 2.3, which lists none of the M16 tables
EDITION_V2_3 = "ea386152bead693068cebb19c3d09244f19f299afaf9a650846fff2a6f8181af"
# the tables edition of KeyPath 2.1 and 2.2, which lists no Vietnamese table
EDITION_V2_2 = "be6aa0474bc67cec820d7ecf484678918415df21140ec57977883b7b40658732"

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
    # pack II (KeyPath 2.6): each blurb is the key's hint and the README's
    # framing (9's also its line on the standard Traditional forms, since
    # two variants type the same keys); the three hints of each come from
    # its hints.json
    7: ("Easy", "Every Key a Shape",
        "日月金木水火土. Seven characters; every letter on this keyboard stands for a shape.", "One keyboard"),
    8: ("Medium", "A Question from Hanoi",
        "Typed in Hanoi with Telex: a question, and a borrowed phrase. One Vietnamese sentence, but not every "
        "syllable in it is Vietnamese. Keep the borrowed phrase as it was typed: it is part of the answer.",
        "One keyboard"),
    9: ("Medium", "One Handover",
        "The keyboard of #1 has a twin in Taipei. One passed the message to the other, once. The line comes "
        "from a hillside town nearby, and each keyboard typed one of its doubled words. The answer uses the "
        "standard Traditional forms of its characters, not their variants.", "Two keyboards"),
    10: ("Hard", "Metal and Orchids",
         "易經. The second line was typed in a hurry. Two lines, eight characters each.", "Two keyboards"),
    11: ("Expert", "Digits, Three Ways",
         "Greek first. Then three keyboards on which a digit means three different things. An English message: "
         "most of it went through Greek, and each of its last three words through a keyboard of its own.",
         "Four keyboards"),
    12: ("Meta", "The Key You Carried",
         "This one came without a key. You have been carrying it: one number from each of #7 to #11, in order. "
         "Five characters, two keys each, on a keyboard of #10.", "One keyboard"),
}
# challenges with hints.json (pack II): its hints, revealed one per click,
# each in a file of its own so that none is fetched before it is asked for
HINT_COUNT = 3


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
        # docs/10 §3.2: normalized with NFC again after lowercasing
        "recomposedLanguages": sorted(RECOMPOSED_LANGUAGES),
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
        "refusedHops": REFUSED_HOPS,
        # docs/10 §9.7: the keyboards the workbench looks up and types on,
        # each with the surfaces typed on it, in registration order
        "workbench": [
            {"layout": layout, "surfaces": [[s.language, s.layout] for s in registry.surfaces_with_layout(layout)]}
            for layout in WORKBENCH_LAYOUTS
        ],
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
        **vi_layouts_data(),
        **m16_layouts_data(),
        **el_layouts_data(),
    }


# docs/10 §3.2: an el word is a maximal run of these 36 letters
EL_WORD_LETTERS = [chr(cp) for cp in range(0x03B1, 0x03CA)] + list("άέήίόύώϊϋΐΰ")


def el_layouts_data() -> dict[str, Any]:
    """docs/10 §7.1: the Windows Greek key table, el_greek.tsv's 36 rows in
    its order (a letter and its keys: one key, or a dead key `;` `:` `W`
    and the vowel's key).  The page builds E, D and the dead-key rule from
    these, as the table is the one the words of docs/10 §3.2 are typed on."""
    table = el_greek().keys_by_letter
    assert set(table) == set(EL_WORD_LETTERS) == el_language.LETTERS, list(table)
    assert len(table) == len(set(table.values())) == 36
    assert set("".join(table.values())) == set(registry.surface("el", "el_greek").alphabet)
    return {"el_greek": {"letters": [[letter, keys] for letter, keys in table.items()]}}


def m16_layouts_data() -> dict[str, Any]:
    """docs/10 §4.3-§5: the ETen key map (zh_daqian.tsv's symbols and tone
    marks, in its order, on other keys), Jyutping's unit shape (1-6
    letters, then a tone digit), and the JIS kana keys of the 77 kana, in
    ja_kana.tsv's order (a voiced kana is its base key and `[`, a
    semi-voiced one its base key and `]`).  Jyutping also names its six
    tones, for the keyboard picture."""
    dq, et = zh_daqian(), zh_eten()
    assert list(jyutping_layout.TONE_NAMES) == list(jyutping_layout.TONE_DIGITS)
    assert list(et.symbol_to_key) == list(dq.symbol_to_key) and list(et.tone_to_key) == list(dq.tone_to_key)
    keys = [*et.symbol_to_key.values(), *et.tone_to_key.values()]
    assert len(set(keys)) == len(keys) == 41
    kana = ja_kana().keys_by_kana
    assert len(kana) == 77 and list(kana) == sorted(kana)
    # every kana has a key, and so does every kana of the romaji table
    assert set(kana) == {k for reading in ja_romaji().kana_to_romaji for k in reading} | {"っ"}
    return {
        "zh_eten": {"symbolToKey": dict(et.symbol_to_key), "toneToKey": dict(et.tone_to_key)},
        "zh_jyutping": {"toneDigits": jyutping_layout.TONE_DIGITS, "maxLetters": jyutping_layout.MAX_LETTERS,
                        "toneNames": [[digit, name] for digit, name in jyutping_layout.TONE_NAMES.items()]},
        "ja_kana": {"keysByKana": [[k, v] for k, v in kana.items()]},
    }


def vi_layouts_data() -> dict[str, Any]:
    """docs/10 §6.1-§6.2: the syllable grammar's inventories (vi_syllables.tsv,
    "-" = empty), the rule for stop codas, and each key table: the seven
    modified letters with their keys, and the five tones by name with their
    combining marks and keys.  The page builds G, E and D from these."""
    syl = vi_syllables()
    out: dict[str, Any] = {"vi_syllables": {
        "onsets": list(syl.onsets), "nuclei": list(syl.nuclei), "codas": list(syl.codas),
        "tones": [[name, mark] for name, mark in VI_TONE_MARKS.items()],
        "stopCodas": sorted(VI_STOP_CODAS),
        "checkedTones": [name for name, mark in VI_TONE_MARKS.items() if mark in VI_CHECKED_TONES],
    }}
    for layout, table in (("vi_telex", vi_telex()), ("vi_vni", vi_vni())):
        assert list(table.keys_by_name) == [*table.letter_keys, *VI_TONE_MARKS]
        out[layout] = {"letters": [[letter, table.keys_by_name[letter]] for letter in table.letter_keys],
                       "tones": [[name, table.keys_by_name[name]] for name in VI_TONE_MARKS]}
    return out


def legends_fixture(out: Out) -> None:
    """tests/fixtures/legends.json: what each key alone means on every
    registered layout (docs/10 §8.4, `LayoutInfo.legends`, read from the
    tables) and the US keys row by row with their shifted keys.  The page's
    keyboard pictures must draw exactly these legends (docs/10 §9.7), except
    where `pictures` says a key's picture shows something else: the JIS kana
    voicing keys `[` `]`, whose legends are the keys themselves (§8.4's
    default), show the marks ゛ ゜ they add, as `keypath layouts ja_kana`
    draws them."""
    layouts = {layout: dict(registry.layout_info(layout).legends) for layout in registry.registered_layouts()}
    grid = set("".join(US_ROWS)) | set("".join(US_SHIFTED_ROWS))
    assert [len(r) for r in US_ROWS] == [len(r) for r in US_SHIFTED_ROWS]
    for layout, legends in layouts.items():
        assert set(legends) <= grid, (layout, set(legends) - grid)
    # docs/10 §9.7: legends asserted from the tables
    et, kana = zh_eten(), ja_kana().keys_by_kana
    assert layouts["zh_eten"]["7"] == "ㄑ" == next(s for s, k in et.symbol_to_key.items() if k == "7")
    for key, want in (("\\", "む"), (")", "を"), ("V", "ゐ"), ("Z", "っ")):
        assert layouts["ja_kana"][key] == want and kana[want] == key, key
    labels = kana_layout.picture_labels()
    pictures = {"ja_kana": {k: v for k, v in labels.items() if layouts["ja_kana"][k] != v}}
    assert pictures == {"ja_kana": {"[": "゛", "]": "゜"}}, pictures
    assert (layouts["ja_kana"]["["], layouts["ja_kana"]["]"]) == ("[", "]")
    assert kana["が"] == "t[" and kana["ぱ"] == "f]"
    # Greek (docs/10 §7.1, §9.7): each letter's one key, and the three dead
    # keys: ; the tonos, Shift-; (:) the dialytika, Shift-W (W) both; q none
    el = el_greek().keys_by_letter
    assert {k: v for k, v in layouts["el_greek"].items() if k not in ";:W"} == \
        {keys: letter for letter, keys in el.items() if len(keys) == 1}
    assert [layouts["el_greek"][k] for k in ";:W"] == ["\u0384", "\u00a8", "\u0385"]
    assert "q" not in layouts["el_greek"] and el["έ"] == ";e" and el["ϊ"] == ":i" and el["ΐ"] == "Wi"
    out.json("tests/fixtures/legends.json", {"usRows": list(US_ROWS), "usShiftedRows": list(US_SHIFTED_ROWS),
                                             "layouts": layouts, "pictures": pictures})


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


# =============================================================== Jyutping

def jyutping_data(out: Out) -> dict[str, str]:
    """data/jyutping.json: the Jyutping lists {reading: characters}, each in
    the table's candidate order (docs/10 §4.4: one reading per character,
    so a character is in exactly one list).  -> the lists."""
    table = zh_jyutping()
    lists = {r: "".join(cs) for r, cs in table.candidates_by_reading.items()}
    for reading, chars in lists.items():
        assert re.fullmatch("[a-z]{1,6}[1-6]", reading), reading
        assert all(table.reading_by_char[c] == reading for c in chars), reading
    assert sum(len(cs) for cs in table.candidates_by_reading.values()) == len(table.reading_by_char)
    out.json("data/jyutping.json", lists)
    print(f"[jyutping] {len(lists)} readings, {len(table.reading_by_char)} characters")
    return lists


# =============================================================== Japanese

JA_LISTS = "data/ja/lists.json"


def ja_lists_data(out: Out) -> dict[str, list[Any]]:
    """data/ja/lists.json: the whole homophone:ja (SKK) list of each Japanese
    example reading: docs/10 §5's JIS kana goldens, and its `t3` chunk read
    keyed (かあ).  A ja unit left at its kana still carries that reading's
    candidates in its Trace (keypath.trace: count and head), and the page
    ships no SKK table (docs/10 §9.7), so it walks such a unit back only
    over a list it carries, and refuses (notCarried) otherwise.  As list
    slices: {edge: {reading: [count, list]}}; [0, []] for a reading with no
    candidates (its unit is the kana alone).  -> the readings' lists."""
    golden = json.loads((PROJECT / "tests" / "golden" / "vectors_ja_kana.json").read_text(encoding="utf-8"))
    readings = [v["reading"] for v in golden["vectors"]] + [golden["inline_negative"]["keyed"]]
    assert len(set(readings)) == len(readings) == 11, readings
    surface = registry.surface("ja", "ja_kana")
    lists: dict[str, list[Any]] = {}
    for reading in readings:
        parsed = surface.unit_candidates(kana_layout.kana_to_keys(reading), "keyed")
        assert parsed.reading == reading, (reading, parsed.reading)
        lists[reading] = [0, []] if parsed.identity else [len(parsed.candidates), list(parsed.candidates)]
    # docs/10 §5: ありがとう has two SKK candidates; むずかしい none (its
    # SKK entry is okuri-ari, which the table drops); かあ is 母
    assert lists["ありがとう"] == [2, ["有難う", "有り難う"]] and lists["むずかしい"] == [0, []]
    assert lists["かあ"] == [1, ["母"]]
    out.json(JA_LISTS, {"homophone:ja": lists})
    print(f"[ja] {len(lists)} example readings, {sum(n for n, _ in lists.values())} SKK candidates")
    return lists


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


def eten_of_daqian() -> dict[str, str]:
    """Each Dàqiān key -> the ETen key of the same bopomofo symbol or tone
    mark (docs/10 §4.3: the same 41 symbols, on other keys)."""
    dq, et = zh_daqian(), zh_eten()
    out = {dq.symbol_to_key[s]: et.symbol_to_key[s] for s in dq.symbol_to_key}
    out.update({dq.tone_to_key[t]: et.tone_to_key[t] for t in dq.tone_to_key})
    assert len(out) == len(set(out.values())) == 41
    return out


def derive_row(sid: str, row: list[Any] | None, shape: dict[str, dict[str, str]]) -> list[Any] | None:
    """A derived surface's row from its base surface's row (DERIVED_ROWS), as
    the page derives it (docs/10 §9.7):
    - ETen: each Dàqiān key remapped symbol by symbol (lens, indices equal);
    - Quick: each unit's Cangjie code recoded to its Quick code, the index
      the character's place in that Quick list;
    - JIS kana: each unit's romaji read back to its kana and typed on the
      kana keys (lens its new length; index, count and head equal)."""
    assert sid in DERIVED_ROWS, sid
    if row is None:
        return None
    if sid == "zh_eten":
        remap = eten_of_daqian()
        return [*row[:3], "".join(remap[k] for k in row[3]), *row[4:]]
    if sid == "ja_kana":
        target, hop_index, hop_count, keys, lens, *rest = row
        units, pos = [], 0
        for n in lens:
            units.append(kana_layout.kana_to_keys(ja_layout.romaji_to_kana(keys[pos:pos + n])))
            pos += n
        return [target, hop_index, hop_count, "".join(units), [len(u) for u in units], *rest]
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
            "hints": (json.loads((folder / "hints.json").read_text(encoding="utf-8"))
                      if (folder / "hints.json").is_file() else []),
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
    assert [c["n"] for c in shipped] == list(range(1, 13))
    for c in shipped:
        key = json.loads(c["keyText"])
        assert decode(c["ciphertext"], key) == c["plaintext"], c["n"]
        difficulty, title, blurb, keyboards = CHALLENGE_COPY[c["n"]]
        entry = {"n": c["n"], "difficulty": difficulty, "title": title, "blurb": blurb,
                 "keyboards": keyboards, "ciphertext": c["ciphertext"],
                 "hash": sha(answer_norm(c["plaintext"])), "fold": sha(answer_fold(c["plaintext"]))}
        # pack I (1-6) has no hints; pack II (7-12) has exactly three each,
        # and the card knows only how many there are
        hints = c["hints"]
        assert len(hints) == (HINT_COUNT if c["n"] >= 7 else 0), c["n"]
        assert all(isinstance(h, str) and h.strip() == h and h for h in hints), c["n"]
        if hints:
            entry["hints"] = len(hints)
        index.append(entry)
        for i, hint in enumerate(hints, 1):
            out.json(f"data/challenges/hints/{c['n']:02d}-{i}.json", hint)
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
    # file -> {list literal: the name it is kept under}
    wanted = {"test_walk_roundtrip_zh.py": {"CURATED": "CURATED", "OOV_CASES": "OOV_CASES"},
              "test_walk_roundtrip_en.py": {"CORPUS": "CORPUS"},
              "test_walk_roundtrip_ja_es.py": {"ES_CORPUS": "ES_CORPUS", "JA_CORPUS": "JA_CORPUS"},
              "test_walk_roundtrip_vi.py": {"CORPUS": "VI_CORPUS"},
              "test_walk_roundtrip_el.py": {"CORPUS": "EL_CORPUS"},
              # docs/10 §3.2's normalization fixtures (input, normalized) and
              # §10 M17's routes (source, route language, text)
              "test_el.py": {"NORMALIZATION": "EL_NORMALIZATION", "ROUTES": "EL_ROUTES"}}
    found: dict[str, list[Any]] = {}
    for file, names in wanted.items():
        tree = ast.parse((PROJECT / "tests" / file).read_text(encoding="utf-8"))
        for node in tree.body:
            target = node.targets[0] if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                else node.target if isinstance(node, ast.AnnAssign) else None
            if isinstance(target, ast.Name) and target.id in names and node.value is not None:
                found[names[target.id]] = ast.literal_eval(node.value)
    for name in ("CURATED", "OOV_CASES", "CORPUS", "ES_CORPUS", "JA_CORPUS", "VI_CORPUS", "EL_CORPUS",
                 "EL_NORMALIZATION", "EL_ROUTES"):
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

    # Vietnamese (docs/10 §3.2, §6.5): syllables of G (capitalized, upper,
    # decomposed), English words in and out of G (the Telex/English seam),
    # the double-o rhymes and toneless checked syllables G leaves out,
    # letters that are not Vietnamese, a mark NFC cannot compose, digits
    # and punctuation
    grammar = sorted(vi_syllables().grammar)
    seam = ["xoong", "boong", "voọc", "moóc", "coong", "is", "of", "cat", "it", "top", "đắk", "viêt", "hồc",
            "the", "man", "can", "sing", "thing", "long"]

    def vi_token() -> str:
        kind = rng.randrange(12)
        if kind < 4:
            return rng.choice(grammar)
        if kind == 4:
            return rng.choice(grammar).capitalize()
        if kind == 5:
            return rng.choice(grammar).upper()
        if kind == 6:
            return unicodedata.normalize("NFD", rng.choice(grammar))
        if kind == 7:
            return rng.choice(seam)
        if kind == 8:
            return rng.choice(vocab)
        if kind == 9:
            return rng.choice(["ñ", "ç", "ö", "ÿ", "x\u0301", "a\u0301\u0301", "Đ", "ĐƯỜNG", "ﬁ", "ǆ"])
        if kind == 10:
            return rng.choice([",", ".", "!", "?", "2024", "—", "(", ")", "…", "'", "-"])
        return " " * rng.randint(1, 3)

    fvi = ["".join(vi_token() + (" " if rng.random() < 0.7 else "") for _ in range(rng.randint(1, 7))).rstrip()
           for _ in range(400)]
    return {"zh": fz, "ko": fko, "ru": fru, "es": fes, "en": fen, "enx": fx, "oov": foov, "vi": fvi,
            "el": el_fuzz_strings(random.Random(SEED + 17))}


def el_fuzz_strings(rng: random.Random) -> list[str]:
    """Greek (docs/10 §3.2, §7.1): FreeDict ell-eng headwords (every accent),
    capitalized, upper case (a final Σ lowercases to ς, a capital Ϊ/Ϋ with
    U+0301 recomposes to ΐ/ΰ), decomposed, Greek letters outside the 36
    (polytonic ones, ϐ ϑ ϲ …, and capitals such as ϴ Ϲ, which lowercase to θ
    and ϲ), the Greek question mark and ano teleia (NFC folds them to `;`
    and `·`), Latin, digits and punctuation.  Every
    code point is assigned in Unicode 14.0, so Final_Sigma is part of the
    contract here (docs/10 §3.2)."""
    words = sorted(el_en().translations_by_el)
    accented = [w for w in words if any(ch in "ϊϋΐΰ" for ch in w)]
    odd = ["\u1f08θ\u1fc6ναι", "\u1f00", "\u1fe5", "ϐ", "ϑ", "ϕ", "ϖ", "ϰ", "ϱ", "ϲ", "ϳ", "ͻ", "Ϗ", "ϴ", "Ϲ",
           "\u03aa\u0301", "\u03ab\u0301", "ΚΑ\u03aa\u0301ΚΙ", "ε\u0301", "Ε\u0301ΝΑ", "α\u0308", "ι\u0308\u0301"]

    def el_token() -> str:
        kind = rng.randrange(14)
        if kind < 4:
            return rng.choice(words)
        if kind == 4:
            return rng.choice(accented)
        if kind == 5:
            return rng.choice(words).capitalize()
        if kind == 6:
            return rng.choice(words).upper()
        if kind == 7:
            return unicodedata.normalize("NFD", rng.choice(words))
        if kind == 8:
            return rng.choice(odd)
        if kind == 9:
            return rng.choice(["\u037e", "\u0387", ";", ":", "·", "«", "»", ",", ".", "!", "—", "-", "'"])
        if kind == 10:
            return rng.choice(["ΣΑΣ", "Α.Σ.", "ΑΣ1", "Σ", "ΟΔΟΣ", "ΣΟΦΟΣ", "ΣΣ", "Σ.Σ", "ΑΣΑ", "ΑΣ'"])
        if kind == 11:
            return rng.choice(["hello", "cat", "q", "W", "2024", "10", "é", "ñ", "ё"])
        return " " * rng.randint(1, 3)

    out = ["".join(el_token() + (" " if rng.random() < 0.6 else "") for _ in range(rng.randint(1, 7))).rstrip()
           for _ in range(400)]
    for text in out:
        assert all(unicodedata.category(ch) not in ("Cn", "Cs") for ch in text), text
    return out


EDGE_CASES = [
    ("", "en"), (" ", "en"), ("   ", "en"), ("!?,.", "en"), ("\t", "en"), ("a\nb", "en"),
    ("hello\tworld\n", "en"), ("İ", "en"), ("ΟΔΟΣ ΣΑΣ", "en"), ("Straße", "en"),
    ("café", "es"), ("ÉL", "es"), ("ÑANDÚ", "es"), ("   año  ", "es"),
    ("ЁЛКА", "ru"), ("ΣΑΣ привет", "ru"), ("", "zh"), (" ", "zh"), ("   ", "zh"),
    ("\t", "zh"), ("𠀀𠀁𠀂", "zh"), ("𪚲", "zh"), ("豈更", "zh"), ("你好\n世界", "zh"),
    ("각", "ko"), ("ㅋㅋㅋ", "ko"), ("   ", "ko"), ("ㅤ", "ko"),
    ("\U00031350", "zh"), ("hello \U00031350", "en"), ("\ud800", "en"), ("a\udc00b", "zh"),
    ("", "vi"), (" ", "vi"), ("   ", "vi"), ("\t", "vi"), ("VIỆT NAM", "vi"), ("vie\u0323\u0302t", "vi"),
    ("x\u0301", "vi"), ("Đ", "vi"), ("12 34", "vi"), ("ΣΑΣ việt", "vi"), ("việt \U00031350", "vi"),
    # docs/10 §3.2, §7.1: Greek
    ("", "el"), (" ", "el"), ("   ", "el"), ("\t", "el"), (";", "el"), ("\u037e", "el"), ("ΟΔΟΣ", "el"),
    ("ΚΑ\u03aa\u0301ΚΙ", "el"), ("\u03ab\u0301", "el"), ("ς", "el"), ("ΣΣ", "el"), ("Σ1Σ", "el"),
    ("θάλασσα \U00031350", "el"), ("hello κόσμε", "el"), ("12 34", "el"), ("q W ;", "el"),
]


def build_fixtures(out: Out, vocab: list[str], rows: dict[str, dict[str, tuple]],
                   corpora: dict[str, list[str]], shipped: list[dict[str, Any]],
                   ja_lists: dict[str, list[Any]]) -> None:
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
    # Vietnamese (docs/10 §6.6): the goldens on both keyboards, and the
    # Telex/English seam goldens with their words and leakage
    for sid in VI:
        golden = json.loads((PROJECT / "tests" / "golden" / f"vectors_{sid}.json").read_text(encoding="utf-8"))
        for g in golden["vectors"] + golden.get("seam", []):
            vec.add("golden-vi", g["plaintext"], "vi", sid)
            rec = next(r for r in vec.records if (r["text"], r["source"], r["surface"]) == (g["plaintext"], "vi", sid))
            assert rec["expect"]["ciphertext"] == g["ciphertext"], (sid, g, rec["expect"])
            key = json.loads(rec["expect"]["keyText"])
            if "unit_lens" in g:
                lens = [u["len"] for w in key["segments"][0]["words"] for u in w.get("units", [])]
                assert lens == g["unit_lens"], (sid, g, lens)
            else:
                assert key["segments"][0]["words"] == g["words"], (sid, g)
                assert rec["expect"]["leak"] == [g["leaked"], g["chars"]], (sid, g)
    # docs/10 §4.3-§5 goldens: ETen and Jyutping (zh, which the page types
    # and walks back) and JIS kana (ja, which the page does not type; its
    # keys still feed the kp1 fixtures)
    for sid, source in (("zh_eten", "zh"), ("zh_jyutping", "zh"), ("ja_kana", "ja")):
        golden = json.loads((PROJECT / "tests" / "golden" / f"vectors_{sid}.json").read_text(encoding="utf-8"))
        for g in golden["vectors"]:
            vec.add("golden-m16", g["plaintext"], source, sid)
            rec = next(r for r in vec.records if (r["text"], r["source"], r["surface"]) == (g["plaintext"], source, sid))
            assert rec["expect"]["ciphertext"] == g["ciphertext"], (sid, g, rec["expect"])
            units = [u for w in json.loads(rec["expect"]["keyText"])["segments"][0]["words"] for u in w.get("units", [])]
            assert [u["len"] for u in units] == g["unit_lens"], (sid, g)
            indices = [u.get("homophone_index") for u in units]
            assert indices == g.get("homophone_indices", [g.get("homophone_index")]), (sid, g, indices)
            if "zh_daqian_ciphertext" in g:
                vec.add("golden-m16", g["plaintext"], "zh", "zh_daqian")
                twin = next(r for r in vec.records if (r["text"], r["source"], r["surface"]) == (g["plaintext"], "zh", "zh_daqian"))
                assert twin["expect"]["ciphertext"] == g["zh_daqian_ciphertext"], (g, twin["expect"])
    # docs/10 §7.1 and §7.3 (M17): the Greek goldens (hop-free el words, one
    # unit each), and en words that the en>el hop takes onto Greek
    golden_el = json.loads((PROJECT / "tests" / "golden" / "vectors_el_greek.json").read_text(encoding="utf-8"))

    def added(cls: str, text: str, source: str, sid: str) -> dict[str, Any]:
        vec.add(cls, text, source, sid)
        return next(r for r in vec.records if (r["text"], r["source"], r["surface"]) == (text, source, sid))

    for g in golden_el["vectors"]:
        rec = added("golden-el", g["plaintext"], "el", "el_greek")
        assert (rec["text"], rec["expect"]["ciphertext"], rec["expect"]["decoded"]) == \
            (g["plaintext"], g["ciphertext"], g["normalized"]), (g, rec["expect"])
        units = [u for w in json.loads(rec["expect"]["keyText"])["segments"][0]["words"] for u in w.get("units", [])]
        assert units == [{"len": n} for n in g["unit_lens"]], (g, units)
    for g in golden_el["hops"]:
        rec = added("golden-el", g["plaintext"], g["source_language"], "el_greek")
        assert rec["text"] == g["plaintext"] and rec["expect"]["ciphertext"] == g["ciphertext"], (g, rec["expect"])
        key = json.loads(rec["expect"]["keyText"])
        assert key["segments"][0]["route"] == g["route"], key
        assert key["segments"][0]["words"][0]["translation"] == {"tier": 1, "index": g["index"]}, key
        assert len(registry.HOPS[("en", "el")].edge.backward(g["word"])) == g["count"], g
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
        for sid in ALLOWED["en"]:
            vec.add("corpus-en", t, "en", sid)
    for t in corpora["VI_CORPUS"]:
        for sid in VI:
            vec.add("corpus-vi", t, "vi", sid)
    for t in corpora["JA_CORPUS"]:
        for sid in ("ja_romaji", "ja_kana"):
            vec.add("corpus-ja", t, "ja", sid)
    # Greek (docs/10 §3.2): the round-trip corpus and the normalization
    # fixtures (Final_Sigma, the second NFC), typed natively
    for t in corpora["EL_CORPUS"] + [text for text, _normalized in corpora["EL_NORMALIZATION"]]:
        vec.add("corpus-el", t, "el", "el_greek")
    for text, normalized in corpora["EL_NORMALIZATION"]:
        assert normalize(text, "el") == normalized, (text, normalized)
    # routes the page refuses
    vec.add("route", "你好", "zh", "ru_jcuken")
    vec.add("route", "привет", "ru", "zh_daqian")
    # vi is native-only (docs/10 §6.5): no route leaves or reaches it
    vec.add("route", "xin chào", "vi", "zh_daqian")
    vec.add("route", "xin chào", "vi", "en_identity")
    vec.add("route", "welcome home", "en", "vi_telex")
    vec.add("route", "привет", "ru", "vi_vni")
    # docs/10 §9.7, §10 M17: Greek from Greek and English only.  The pivots
    # into Greek (es, ru, zh through en) and every route out of Greek (el→en,
    # el→en→X), which Python encodes, are refused
    for source, route, text in corpora["EL_ROUTES"]:
        if source == route:
            vec.add("corpus-el", text, "el", "el_greek")
        elif source == "en" and route == "el":
            vec.add("corpus-en", text, "en", "el_greek")
        else:
            vec.add("route", text, source, "en_identity" if route == "en" else next(
                sid for sid, (lang, _layout) in SURFACES.items() if lang == route))
    for sid in ("zh_daqian", "ru_jcuken", "ja_romaji", "vi_telex"):
        vec.add("route", "θάλασσα φίλος γάτα", "el", sid)
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
    for t in fz["vi"]:
        for sid in VI:
            vec.add("fuzz-vi", t, "vi", sid)
    for t in fz["el"]:
        vec.add("fuzz-el", t, "el", "el_greek")
    for text, source in EDGE_CASES:
        for sid in ALLOWED[source] if source != "en" else ["en_identity", "zh_daqian", "ja_romaji", "ja_kana"]:
            vec.add("edge", text, source, sid)
    long_zh = "".join(rng.choice(list(zh_phrases().readings_by_word)) for _ in range(120))[:200]
    for sid in ALLOWED["zh"]:
        vec.add("edge", long_zh, "zh", sid)
    long_en = " ".join(rng.choice(vocab) for _ in range(60))[:200].rstrip()
    for sid in ALLOWED["en"]:
        vec.add("edge", long_en, "en", sid)
    grammar = sorted(vi_syllables().grammar)
    long_vi = " ".join(rng.choice(grammar) for _ in range(60))[:200].rstrip()
    for sid in VI:
        vec.add("edge", long_vi, "vi", sid)
    el_words = sorted(el_en().translations_by_el)
    long_el = " ".join(random.Random(SEED + 17).choice(el_words) for _ in range(40))[:200].rstrip()
    vec.add("edge", long_el, "el", "el_greek")

    # traces: site, challenges, sample
    traces = []
    for rec in vec.valid:
        if rec["class"] in ("site", "golden-m16", "golden-el"):
            traces.append({"id": rec["id"], "ciphertext": rec["expect"]["ciphertext"],
                           "keyText": rec["expect"]["keyText"],
                           "trace": site_trace(rec["expect"]["ciphertext"], json.loads(rec["expect"]["keyText"]))})
    for c in shipped:
        traces.append({"id": f"challenge-{c['n']:02d}", "ciphertext": c["ciphertext"], "keyText": c["keyText"],
                       "trace": site_trace(c["ciphertext"], json.loads(c["keyText"]))})
    # docs/10 §5: the JIS kana goldens, their keyed ja_romaji twins and the
    # `t3` chunk read keyed.  The page does not type Japanese, but walks
    # these keys back over data/ja/lists.json: a kana unit left at its kana
    # carries its reading's SKK count and head (ありがとう: 2, 有難う 有り難う)
    ja_golden = json.loads((PROJECT / "tests" / "golden" / "vectors_ja_kana.json").read_text(encoding="utf-8"))
    ja_keys: list[tuple[str, str, dict[str, Any], str]] = []
    for i, g in enumerate(ja_golden["vectors"]):
        for sid in ("ja_kana", "ja_romaji"):
            result = py_encode(g["plaintext"], "ja", sid)
            assert result.ciphertext == (g["ciphertext"] if sid == "ja_kana" else g["romaji"]), (sid, g)
            ja_keys.append((f"golden-ja-{i}-{sid}", result.ciphertext, result.key, g["plaintext"]))
    t3 = ja_golden["inline_negative"]
    ja_keys.append(("golden-ja-t3-keyed", t3["chunk"], {
        "keypath": KEY_VERSION, "tables_sha256": EDITION, "source_language": "ja",
        "segments": [{"language": "ja", "layout": "ja_kana", "route": ["homophone:ja", "keystroke:ja_kana"],
                      "selector_mode": "keyed", "words": [{"units": [dict(t3["unit"])]}]}]}, t3["keyed"]))
    for ident, cipher, key, text in ja_keys:
        assert decode(cipher, key) == text, ident
        trace = site_trace(cipher, key)
        units = [u for seg in trace["segments"] for w in seg["words"] for u in w.get("units", [])]
        assert all(u["reading"] in ja_lists for u in units), ident
        traces.append({"id": ident, "ciphertext": cipher, "keyText": key_text(key), "trace": trace})
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
    # docs/10 §3.2: Final_Sigma next to the two code points whose case
    # properties Unicode 16.0 changed (ʕ, U+1171E).  Added last, after the
    # traces and the tampered keys are drawn, so no earlier vector is
    # renumbered and no sample is redrawn
    for text in SIGMA_DRIFT:
        vec.add("edge", text, "el", "el_greek")
    out.jsonl_gz("tests/fixtures/vectors.jsonl.gz", vec.records)
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
    # Vietnamese (docs/10 §6.5, §2.1): keyed only, no homophone_index, the
    # v2.2 edition lists no Vietnamese table, the other scheme's route tail,
    # and a unit's chunk swapped for keys of the same length that are no
    # unit (a VNI digit with no letter before it, a non-canonical order)
    vi_keys = pick(lambda r: r["surface"] in VI and r["source"] == "vi" and has_units(r, False), 30)

    def vi_bad_chunk(layout: str, chunk: str, digit_first: bool) -> str:
        s = registry.surface("vi", layout)
        cands = (["5" + chunk[1:]] if digit_first else []) + [chunk[::-1]]
        cands += [chunk[:i] + ch + chunk[i + 1:] for i in range(len(chunk)) for ch in sorted(s.alphabet)]
        return next(x for x in cands if x != chunk and not toolkit.lookup_unit(s, x, top=0)["well_formed"])

    assert len(vi_keys) == 30
    for i, (c, k) in enumerate(vi_keys):
        k2 = copy.deepcopy(k)
        seg = k2["segments"][0]
        choice = i % 6
        if choice == 0:
            seg["selector_mode"] = "inline"
            add("vi-inline", c, k2)
        elif choice == 1:
            first_unit(k2, False)["homophone_index"] = 0
            add("vi-index", c, k2)
        elif choice == 2:
            k2["tables_sha256"] = EDITION_V2_2
            add("vi-old-edition", c, k2)
        elif choice == 3:
            seg["route"] = ["keystroke:vi_vni" if seg["layout"] == "vi_telex" else "keystroke:vi_telex"]
            add("vi-route-tail", c, k2)
        else:
            # literals take no keys, so the first unit's chunk starts the ciphertext
            n = first_unit(k2, False)["len"]
            add("vi-not-a-unit", vi_bad_chunk(seg["layout"], c[:n], choice == 4 and seg["layout"] == "vi_vni") + c[n:], k2)
    # docs/10 §2.1 decode-error parity: a zh_cangjie (and a zh_quick) key
    # with selector_mode inline, which both decoders refuse
    for layout in ("zh_cangjie", "zh_quick"):
        c, k = next((c, k) for c, k in shape_keys if k["segments"][0]["layout"] == layout)
        k2 = copy.deepcopy(k)
        k2["segments"][0]["selector_mode"] = "inline"
        add(f"{layout.removeprefix('zh_')}-inline", c, k2)
    # ETen, Jyutping and JIS kana (docs/10 §4.3-§5, §2.1): keyed only, an
    # index past the list, the v2.3 edition (it lists none of their tables),
    # another surface's route tail, and a unit's chunk swapped for keys of
    # the same length that are no unit; kana's `t3` negative golden (§5),
    # ゔ `4[` and a voicing key with nothing to voice
    other_tail = {"zh_eten": ["homophone:zh", "keystroke:zh_daqian"],
                  "zh_jyutping": ["homophone:zh", "keystroke:zh_pinyin"],
                  "ja_kana": ["homophone:ja", "keystroke:ja_romaji"]}

    def m16_bad_chunk(layout: str, chunk: str) -> str:
        s = registry.surface(SURFACES[layout][0], layout)
        alphabet = sorted(s.alphabet)
        cands = [chunk[::-1]] + [chunk[:i] + ch + chunk[i + 1:] for i in range(len(chunk)) for ch in alphabet]
        return next(x for x in cands if x != chunk and not toolkit.lookup_unit(s, x, top=0)["well_formed"])

    for sid in ("zh_eten", "zh_jyutping", "ja_kana"):
        keys = pick(lambda r, sid=sid: r["surface"] == sid and has_units(r, True), 18)
        assert len(keys) == 18, sid
        for i, (c, k) in enumerate(keys):
            k2 = copy.deepcopy(k)
            seg = k2["segments"][0]
            choice = i % 6
            if choice == 0:
                seg["selector_mode"] = "inline"
                add(f"{sid}-inline", c, k2)
            elif choice == 1:
                first_unit(k2, True)["homophone_index"] = unit_count(k, c)
                add(f"{sid}-index-range", c, k2)
            elif choice == 2:
                k2["tables_sha256"] = EDITION_V2_3
                add(f"{sid}-old-edition", c, k2)
            elif choice == 3:
                hops, _tail = registry.split_route(seg["route"])
                seg["route"] = list(hops) + other_tail[sid]
                add(f"{sid}-route-tail", c, k2)
            elif choice == 4:
                n = first_unit(k2, True)["len"]
                add(f"{sid}-not-a-unit", m16_bad_chunk(seg["layout"], c[:n]) + c[n:], k2)
            elif sid == "ja_kana":
                first_unit(k2, True)["homophone_index"] = -1
                add(f"{sid}-index-negative", c, k2)
            else:
                del first_unit(k2, True)["homophone_index"]
                add(f"{sid}-index-missing", c, k2)

    def kana_key(chunk: str, mode: str, unit: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
        return chunk, mode, {"keypath": "1.1", "tables_sha256": EDITION, "source_language": "ja",
                             "segments": [{"language": "ja", "layout": "ja_kana", "route": ["homophone:ja", "keystroke:ja_kana"],
                                           "selector_mode": mode, "words": [{"units": [unit]}]}]}

    for name, (cipher, _mode, key) in (("kana-t3-inline", kana_key("t3", "inline", {"len": 2})),
                                       ("kana-vu", kana_key("4[", "keyed", {"len": 2})),
                                       ("kana-voicing-alone", kana_key("[", "keyed", {"len": 1})),
                                       ("kana-voicing-after-voiced", kana_key("t[[", "keyed", {"len": 3}))):
        add(name, cipher, key)
    # Greek (docs/10 §7.1, §2.1, M17): keyed only, no homophone_index, the
    # v2.4 edition lists no Greek table, another layout's route tail, a
    # unit's chunk made malformed (a dead key before a key it does not
    # accent, a dead key ending the unit, `q`, which types no letter), and
    # an en>el record past its list
    el_keys = pick(lambda r: r["surface"] == "el_greek" and r["source"] == "el" and has_units(r, False), 24)
    assert len(el_keys) == 24

    def el_bad_chunk(chunk: str, kind: int) -> str:
        n = len(chunk)
        if kind == 0:
            return (";b" + chunk[2:]) if n >= 2 else ";"
        if kind == 1:
            return chunk[:-1] + "W"
        if kind == 2:
            return (":a" + chunk[2:]) if n >= 2 else ":"
        return "q" + chunk[1:]

    for i, (c, k) in enumerate(el_keys):
        k2 = copy.deepcopy(k)
        seg = k2["segments"][0]
        choice = i % 6
        if choice == 0:
            seg["selector_mode"] = "inline"
            add("el-inline", c, k2)
        elif choice == 1:
            first_unit(k2, False)["homophone_index"] = 0
            add("el-index", c, k2)
        elif choice == 2:
            k2["tables_sha256"] = EDITION_V2_4
            add("el-old-edition", c, k2)
        elif choice == 3:
            seg["route"] = ["keystroke:ru_jcuken"]
            add("el-route-tail", c, k2)
        else:
            # literals take no keys, so the first unit's chunk starts the ciphertext
            n = first_unit(k2, False)["len"]
            kind = (i // 6) % 4
            bad = el_bad_chunk(c[:n], kind)
            assert len(bad) == n and bad != c[:n]
            add(f"el-dead-key-{kind}", bad + c[n:], k2)
    for c, k in pick(lambda r: r["surface"] == "el_greek" and r["source"] == "en"
                     and '"translation"' in r["expect"]["keyText"], 4):
        k2 = copy.deepcopy(k)
        first_word(k2, True)["translation"]["index"] = 10_000
        add("el-hop-index-range", c, k2)
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
    # the same words on ETen (Dàqiān's readings and indices on other keys,
    # asserted here) and Jyutping
    et, jy = surface_of("zh_eten"), surface_of("zh_jyutping")
    twin_shards: dict[int, list[str]] = {i: [] for i in range(256)}
    remap = eten_of_daqian()
    for w in words:
        e_raw, d_raw = et.encode_word(w, "keyed"), dq.encode_word(w, "keyed")
        assert (e_raw is None) == (d_raw is None), w
        e = fmt(e_raw)
        assert e_raw is None or (e[1:] == fmt(d_raw)[1:] and e[0] == "".join(remap[k] for k in d_raw[1])), w
        j = fmt(jy.encode_word(w, "keyed"))
        twin_shards[ord(w[0]) & 0xFF].append("\t".join([w, *e, *j]) + "\n")
    result["zhEtenJyutping"] = {f"{i:02x}": sha("".join(twin_shards[i])) for i in range(256)}
    m16_digests(result)
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
    vi_digests(result)
    el_digests(result)
    result["readings"] = sha("".join(
        f"{r}\t{daqian_layout.keys_for_reading(r)}\t{pinyin_layout.keys_for_reading(r)}\n"
        for r in sorted(chars.candidates_by_reading)))
    result["eten"] = sha("".join(f"{r}\t{eten_layout.keys_for_reading(r)}\n" for r in sorted(chars.candidates_by_reading)))
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


# docs/10 §9.7 (M16): every chunk of up to KANA_CHUNK_MAX JIS kana keys, and
# every string of up to KANA_READING_MAX kana, with what the layout makes of it
KANA_CHUNK_MAX = 3
KANA_READING_MAX = 3


def m16_digests(result: dict[str, Any]) -> None:
    """docs/10 §9.7 `jyutping`: char<TAB>reading<TAB>idx for every character
    of zh_jyutping.tsv, lines sorted by code point, through the surface's
    own encoder.  `kanaChunks`: every chunk of 1 to KANA_CHUNK_MAX keys over
    ja_kana's alphabet (length, then code-point order) as chunk<TAB>=kana,
    or chunk<TAB>!rule with the layout's error; `kanaReadings`: every string
    of 1 to KANA_READING_MAX of the 77 kana (the same order) as
    reading<TAB>keys, or reading<TAB>!rule."""
    import itertools

    jy = surface_of("zh_jyutping")
    lines = []
    for char, reading in zh_jyutping().reading_by_char.items():
        units, keys = jy.encode_word(char, "keyed")
        assert keys == reading and len(units) == 1, char
        lines.append(f"{char}\t{keys}\t{units[0]['homophone_index']}\n")
    result["jyutping"] = sha("".join(sorted(lines)))
    result["jyutpingCount"] = len(lines)

    def verdict(fn: Callable[[str], str], text: str) -> str:
        try:
            return "=" + fn(text)
        except LayoutError as exc:
            return "!" + str(exc)

    for name, symbols, n_max, fn in (
            ("kanaChunks", sorted(surface_of("ja_kana").alphabet), KANA_CHUNK_MAX, kana_layout.keys_to_kana),
            ("kanaReadings", sorted(ja_kana().keys_by_kana), KANA_READING_MAX, kana_layout.kana_to_keys)):
        body, good = [], 0
        for n in range(1, n_max + 1):
            for parts in itertools.product(symbols, repeat=n):
                text = "".join(parts)
                v = verdict(fn, text)
                good += v.startswith("=")
                body.append(f"{text}\t{v}\n")
        result[name] = {"maxLen": n_max, "count": len(body), "ok": good, "sha256": sha("".join(body))}
    print(f"[kana] chunks: {result['kanaChunks']['ok']} of {result['kanaChunks']['count']} read; "
          f"readings: {result['kanaReadings']['ok']} of {result['kanaReadings']['count']} typed")


# docs/10 §9.7: exhaustive verdicts of every chunk up to these lengths (the
# workbench's and the decoder's reading of a unit), per Vietnamese keyboard
VI_CHUNK_MAX = {"vi_telex": 4, "vi_vni": 3}


def vi_verdict(surface: Any, chunk: str) -> str:
    """`=` and the syllable a chunk reads as, or `!` and lookup's violated rule."""
    entry = toolkit.lookup_unit(surface, chunk, top=0)
    return f"={entry['reading']}" if entry["well_formed"] else f"!{entry['error']}"


def vi_digests(result: dict[str, Any]) -> None:
    """docs/10 §9.7 `vi`: syllable<TAB>telex<TAB>vni over G, lines sorted by
    code point, each keys string from the surface's own encoder; and
    `viChunks`: every chunk over each scheme's alphabet, of length 1 to
    VI_CHUNK_MAX, in length then alphabet order, as chunk<TAB>verdict."""
    import itertools

    grammar = vi_syllables().grammar
    surfaces = [surface_of(sid) for sid in VI]
    lines = []
    for syllable in grammar:
        keys = []
        for s in surfaces:
            units, k = s.encode_word(syllable, "keyed")
            assert units == [{"len": len(k)}] and s.decode_unit(k, units[0], "keyed") == syllable, (s.name, syllable)
            keys.append(k)
        lines.append("\t".join([syllable, *keys]) + "\n")
    for i, sid in enumerate(VI):
        assert len({line.split("\t")[i + 1] for line in lines}) == len(grammar), f"E is not injective on {sid}"
    result["vi"] = sha("".join(sorted(lines)))
    result["viCount"] = len(grammar)
    result["viChunks"] = {}
    for sid, s in zip(VI, surfaces):
        alphabet = sorted(s.alphabet)
        body, count = [], 0
        for n in range(1, VI_CHUNK_MAX[sid] + 1):
            for letters in itertools.product(alphabet, repeat=n):
                chunk = "".join(letters)
                body.append(f"{chunk}\t{vi_verdict(s, chunk)}\n")
                count += 1
        result["viChunks"][sid] = {"maxLen": VI_CHUNK_MAX[sid], "count": count, "sha256": sha("".join(body)),
                                   "wellFormed": sum(line.split("\t")[1].startswith("=") for line in body)}


# docs/10 §9.7 (M17): every chunk of up to EL_CHUNK_MAX keys over el_greek's
# alphabet and the keys that type no letter or need quoting (q, Q, ' " \)
EL_CHUNK_MAX = 3
EL_CHUNK_EXTRA = "q", "Q", "'", '"', "\\"


def el_digests(result: dict[str, Any]) -> None:
    """docs/10 §9.7 `el`: letter<TAB>keys for the 36 letters of el_greek.tsv,
    lines sorted by code point, through the surface's own encoder (each one
    unit that decodes back).  `elChunks`: every chunk of 1 to EL_CHUNK_MAX
    keys over the alphabet and EL_CHUNK_EXTRA (length, then code-point
    order) as chunk<TAB>=word, or chunk<TAB>!rule with the layout's error
    (docs/10 §7.1's dead-key rule); for chunks of the alphabet the rule is
    the one `keypath lookup` prints."""
    import itertools

    s = surface_of("el_greek")
    lines = []
    for letter in el_greek().keys_by_letter:
        units, keys = s.encode_word(letter, "keyed")
        assert units == [{"len": len(keys)}] and s.decode_unit(keys, units[0], "keyed") == letter, letter
        lines.append(f"{letter}\t{keys}\n")
    result["el"] = sha("".join(sorted(lines)))
    result["elCount"] = len(lines)
    symbols = sorted(set(s.alphabet) | set(EL_CHUNK_EXTRA))
    body, good = [], 0
    for n in range(1, EL_CHUNK_MAX + 1):
        for parts in itertools.product(symbols, repeat=n):
            chunk = "".join(parts)
            try:
                verdict = "=" + el_layout.word_for_keys(chunk)
                good += 1
            except LayoutError as exc:
                verdict = "!" + str(exc)
            if set(chunk) <= s.alphabet:
                entry = toolkit.lookup_unit(s, chunk, top=0)
                assert verdict == (f"={entry['reading']}" if entry["well_formed"] else f"!{entry['error']}"), chunk
            body.append(f"{chunk}\t{verdict}\n")
    result["elChunks"] = {"maxLen": EL_CHUNK_MAX, "extra": "".join(EL_CHUNK_EXTRA), "count": len(body), "ok": good,
                          "sha256": sha("".join(body))}
    print(f"[el] chunks: {good} of {len(body)} read")


def vi_chunk_fixture(out: Out) -> None:
    """tests/fixtures/vi-chunks.jsonl.gz: longer chunks near the syllables of
    G, with each one's verdict (vi_verdict): a syllable's keys, and the keys
    with one key inserted, deleted, doubled or swapped with its neighbour,
    or followed by another syllable's keys."""
    rng = random.Random(SEED + 15)
    grammar = sorted(vi_syllables().grammar)
    records, seen = [], set()
    for sid in VI:
        s = surface_of(sid)
        alphabet = sorted(s.alphabet)
        for syllable in rng.sample(grammar, 1200):
            keys = s.encode_word(syllable, "keyed")[1]
            i = rng.randrange(len(keys))
            other = s.encode_word(rng.choice(grammar), "keyed")[1]
            for chunk in (keys, keys[:i] + rng.choice(alphabet) + keys[i:], keys[:i] + keys[i + 1:],
                          keys[:i] + keys[i] + keys[i:], keys[:i] + keys[i + 1:i + 2] + keys[i] + keys[i + 2:],
                          keys + other):
                if chunk and (sid, chunk) not in seen:
                    seen.add((sid, chunk))
                    records.append({"layout": sid, "chunk": chunk, "verdict": vi_verdict(s, chunk)})
    out.jsonl_gz("tests/fixtures/vi-chunks.jsonl.gz", records)
    print(f"[vi] {len(records)} chunks near G, {sum(r['verdict'][0] == '=' for r in records)} of them units")


def el_fixture(out: Out, corpora: dict[str, list[Any]]) -> None:
    """tests/fixtures/el.json (docs/10 §3.2, §9.7, M17): `normalize`, Python's
    normalize(text, "el") of the normalization fixtures (Final_Sigma, the
    second NFC), the el corpus and the §7.1 goldens; and `outward`, keys out
    of Greek (el→en, el→en→X, and a message whose first segment goes out
    and whose second stays Greek) that Python decodes and the page refuses,
    since it never ships the el→en lists."""
    golden = json.loads((PROJECT / "tests" / "golden" / "vectors_el_greek.json").read_text(encoding="utf-8"))
    texts = [t for t, _n in corpora["EL_NORMALIZATION"]] + corpora["EL_CORPUS"] + [g["plaintext"] for g in golden["vectors"]]
    pairs = []
    for text in texts:
        once = normalize(text, "el")
        assert normalize(once, "el") == once, text
        pairs.append([text, once])
    # docs/10 §3.2: Final_Sigma results are part of the contract only when
    # every code point around a Σ is assigned in Unicode 14.0; these are
    # ASCII or assigned Greek and Coptic, whose assignments predate 14.0
    for text, _once in pairs:
        if "Σ" in text:
            assert all(ord(ch) < 0x80 or (0x370 <= ord(ch) <= 0x3FF and unicodedata.category(ch) != "Cn")
                       for ch in text), text
    got = dict(pairs)
    assert " ".join(got[t] for t in ("ΟΔΟΣ", "ΣΟΦΟΣ", "Α.Σ.", "ΑΣ1")) == "οδος σοφος α.ς. ας1"
    assert got["ΚΑ\u03aa\u0301ΚΙ"] == "καΐκι" and got["\u03ab\u0301"] == "ΰ"
    outward = []
    cases: list[tuple[str, str, Any]] = [(text, "el", sid) for text, sid in (
        ("θάλασσα φίλος γάτα", "en_identity"), ("θάλασσα", "zh_daqian"), ("γάτα και θάλασσα", "ru_jcuken"))]
    cases.append(("φως όταν", "el", [{"length": 4, "route": "zh"}, {"length": 4, "route": "el"}]))
    for i, (text, source, how) in enumerate(cases):
        if isinstance(how, str):
            lang, layout = SURFACES[how]
            result = encode(text, source, route_language=lang, layout=layout)
        else:
            result = encode(text, source, segments=how)
        decoded = decode(result.ciphertext, result.key)
        assert decoded == normalize(text, source)
        routes = [seg["route"] for seg in result.key["segments"]]
        assert any(step in REFUSED_HOPS for route in routes for step in route), routes
        outward.append({"id": f"el-out-{i}", "ciphertext": result.ciphertext, "keyText": key_text(result.key),
                        "decoded": decoded})
    assert outward[-1]["ciphertext"] == "ej;;otan", outward[-1]
    out.json("tests/fixtures/el.json", {"normalize": pairs, "outward": outward})


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
    lowers = [[s, s.lower()] for s in ["ΟΔΟΣ ΣΑΣ", "Σ", "ΑΣ.", "İSTANBUL", "ǅemal", "ΣΑΣ", "ABCΣ1", "aΣb",
                                       "ΑʕΣ", "ΑΣʕ", "Α\U0001171eΣ", "ΑΣ\U0001171eΑ", "ΟΔΟΣʕ ΑΣ\U0001171eΑ"]]
    sigma = final_sigma_fixture()
    out.json("tests/fixtures/unicode.json", {"lower": lower, "samples": samples, "lowerStrings": lowers,
                                             "finalSigma": sigma})
    print(f"[unicode] {len(lower)} code points lowercase differently; Final_Sigma: "
          f"{sum(b - a + 1 for a, b in sigma['caseIgnorable'])} case-ignorable, "
          f"{sum(b - a + 1 for a, b in sigma['cased'])} other cased, {sigma['count']} code points in "
          f"{len(sigma['contexts'])} contexts")


# docs/10 §3.2: Final_Sigma's results are part of the contract whenever every
# code point around a Σ is assigned in Unicode 14.0, the Unicode of Python
# 3.11.  The page cannot take Cased and Case_Ignorable from its JS runtime,
# whose Unicode is newer (Unicode 16.0 made U+0295 ʕ Lo, so not cased, and
# U+1171E Mc, so not case-ignorable), so normalize.js carries Unicode 14.0's.
SIGMA_CONTEXTS = ["Α{}Σ", "ΑΣ{}", "ΑΣ{}Α", "{}Σ", "{}ΣΑ"]
SIGMA_DRIFT = ["ΑʕΣ", "ΑΣʕ", "ΑΣ\U0001171eΑ", "ΟΔΟΣʕ ΑΣ\U0001171eΑ"]


def final_sigma_fixture() -> dict[str, Any]:
    """`caseIgnorable` and `cased` (cased and not case-ignorable, the only
    cased code points Final_Sigma's scan ever reads) as [first, last] ranges,
    read off Python's own str.lower: Python exposes neither property, but
    c + "Σ" lowercases to ς exactly when c is cased and not case-ignorable,
    and "ΑΣ" + c + "Α" exactly when c is neither.  And the digest of
    str.lower over every assigned code point c in SIGMA_CONTEXTS: one line
    per c, "hex\\tlower(context)..." in code point order."""
    assert unicodedata.unidata_version == "14.0.0", unicodedata.unidata_version
    ranges: dict[str, list[list[int]]] = {"caseIgnorable": [], "cased": []}
    lines: list[str] = []
    finals = [0] * len(SIGMA_CONTEXTS)
    for first, last in unicode14_ranges():
        for cp in range(first, last + 1):
            ch = chr(cp)
            lowered = [ctx.format(ch).lower() for ctx in SIGMA_CONTEXTS]
            for i, low in enumerate(lowered):
                finals[i] += "ς" in low
            lines.append(f"{cp:x}\t" + "\t".join(lowered) + "\n")
            cased = (ch + "Σ").lower().endswith("ς")
            neither = ("ΑΣ" + ch + "Α").lower()[1] == "ς"
            assert not (cased and neither), hex(cp)
            # the third reading agrees: "Α" + c + "Σ" ends in ς unless c is neither
            assert (("Α" + ch + "Σ").lower().endswith("ς")) == (not neither), hex(cp)
            kind = None if neither else "cased" if cased else "caseIgnorable"
            if kind is None:
                continue
            spans = ranges[kind]
            if spans and spans[-1][1] == cp - 1:
                spans[-1][1] = cp
            else:
                spans.append([cp, cp])
    ignorable = ranges["caseIgnorable"]

    def member(spans: list[list[int]], cp: int) -> bool:
        return any(a <= cp <= b for a, b in spans)

    # Case_Ignorable includes every Mn, Me, Cf, Lm and Sk (UAX #44)
    assert all(member(ignorable, cp) for cp in range(0x110000)
               if unicodedata.category(chr(cp)) in ("Mn", "Me", "Cf", "Lm", "Sk"))
    assert member(ranges["cased"], 0x295) and member(ignorable, 0x1171E)
    return {**ranges, "contexts": SIGMA_CONTEXTS, "count": len(lines), "finals": finals,
            "sha256": sha("".join(lines))}


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


# ============================================================== workbench

# The workbench (docs/10 §9.7): the page's `lookup` must print what
# `keypath lookup --layout L --top N` prints (no --gloss) and its `type`
# what `keypath type --layout L` prints (greedy).  The fixtures run the
# installed CLI itself, in-process, with `--` before the positionals so that
# every chunk is a chunk (the CLI reads `--gloss` or `-h` there as options).
WB_SEED = 20260928
WB_STREAM = "tgnoyhvljmso"          # "welcome home" on Cangjie, unsplit
WB_TOPS = [10, 0, 1, 3, 5, 20, 50, 500]
ASCII_KEYS = "".join(chr(cp) for cp in range(0x21, 0x7F))   # the chunk rule: U+0021-U+007E

# Every violated-rule text lookup can print on a workbench surface, as one
# template each (LIT: a value Python's repr quoted).  A chunk pool (every
# 0-2 key string, the table's own units and mutations of them, random key
# runs) must reach exactly the templates listed for each surface, and the
# fixtures must cover each of them.
_LIT = r"""('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")"""
WB_RULES: dict[str, str] = {
    "alphabet": r"unit LIT contains LIT, which is outside the [a-z_]+ alphabet",
    "empty": r"empty keystroke unit",
    "empty-unit": r"empty unit for (?:ru_jcuken|es_accent|vi_telex|vi_vni|el_greek)",
    "tone-not-final": r"tone key not final in unit LIT",
    "bare-tone": r"unit LIT is a bare tone key",
    "not-syllable": r"unit LIT maps to LIT, which is not a syllable in the reading table",
    "no-tone-digit": r"unit LIT does not end in a tone digit 1-5",
    "bare-digit": r"unit LIT is a bare tone digit",
    "spelling-key": r"key LIT in unit LIT: a spelling is a-z and one tone digit ends the unit",
    "not-spelling": r"LIT is not a pinyin spelling on layout zh_pinyin",
    "too-long": r"unit LIT has \d+ letters; a code on layout zh_(?:cangjie|quick) has 1-\d",
    "not-code": r"unit LIT is not a code on layout zh_(?:cangjie|quick): no character of zh_cangjie\.tsv has it",
    "no-unit": r"LIT types no single syllable or jamo on layout ko_dubeolsik",
    "no-hanja": r"unit LIT: reading LIT has no hanja candidates",
    "no-base": r"digit LIT has no base letter in unit LIT",
    "no-variant": r"no variant LIT for base LIT in unit LIT",
    "not-word": r"unit LIT is not well-formed for en_identity",
    # Jyutping (docs/10 §4.4): the unit shape, then the table's readings
    "jy-no-tone-digit": r"unit LIT does not end in a tone digit 1-6",
    "jy-spelling-key": r"key LIT in unit LIT: a Jyutping syllable is letters a-z, and one tone digit 1-6 ends the unit",
    "jy-too-long": r"unit LIT has \d+ letters; a Jyutping syllable has 1-6",
    "not-reading": r"unit LIT is not a Jyutping reading on layout zh_jyutping: no character of zh_jyutping\.tsv reads LIT",
    # docs/10 §8.2 (a) and (b); (c) cannot fire
    "vi-undefined": r"key LIT at position \d+ cannot follow LIT \(VNI: a digit must follow the letter it marks\)",
    "vi-not-g": r"D\([a-z0-9]+\) = [^ ]+ is not a syllable of G; canonical (?:Telex|VNI) types a vowel's tone key "
                r"right after that vowel and its modifier key \(e\.g\. việt = (?:vieejt|vie65t)\)",
    # docs/10 §7.1: a dead key must be followed by a vowel key it combines with
    "el-dead-key": r"dead key LIT \([΄¨΅]\) at position \d+ of unit LIT is followed by LIT; on el_greek it must be "
                   r"followed by a vowel key it combines with \([a-z](?: [a-z])*\)",
    "el-dead-end": r"dead key LIT \([΄¨΅]\) at position \d+ of unit LIT ends the unit; on el_greek it must be "
                   r"followed by a vowel key it combines with \([a-z](?: [a-z])*\)",
}
WB_RULE_RE = {name: re.compile("^" + pattern.replace("LIT", _LIT) + "$") for name, pattern in WB_RULES.items()}
WB_SURFACE_RULES: dict[str, list[str]] = {
    "(zh, zh_daqian)": ["alphabet", "empty", "tone-not-final", "bare-tone", "not-syllable"],
    "(zh, zh_eten)": ["alphabet", "empty", "tone-not-final", "bare-tone", "not-syllable"],
    "(zh, zh_pinyin)": ["alphabet", "empty", "no-tone-digit", "bare-digit", "spelling-key", "not-spelling",
                        "not-syllable"],
    "(zh, zh_jyutping)": ["alphabet", "empty", "jy-no-tone-digit", "bare-digit", "jy-spelling-key", "jy-too-long",
                          "not-reading"],
    "(zh, zh_cangjie)": ["alphabet", "empty", "too-long", "not-code"],
    "(zh, zh_quick)": ["alphabet", "empty", "too-long", "not-code"],
    "(ko, ko_dubeolsik)": ["alphabet", "empty", "no-unit"],
    "(zh, ko_dubeolsik)": ["alphabet", "empty", "no-unit", "no-hanja"],
    "(ru, ru_jcuken)": ["alphabet", "empty-unit"],
    "(es, es_accent)": ["alphabet", "empty-unit", "no-base", "no-variant"],
    "(en, en_identity)": ["alphabet", "not-word"],
    "(vi, vi_telex)": ["alphabet", "empty-unit", "vi-not-g"],
    "(vi, vi_vni)": ["alphabet", "empty-unit", "vi-undefined", "vi-not-g"],
    # `key 'q' types no letter` cannot fire: q is outside the alphabet
    "(el, el_greek)": ["alphabet", "empty-unit", "el-dead-key", "el-dead-end"],
}
# chunks with ', ", both, and \ (docs/10 §9.7), per surface
QUOTE_CLASSES = {"single": lambda c: "'" in c and '"' not in c, "double": lambda c: '"' in c and "'" not in c,
                 "both": lambda c: "'" in c and '"' in c, "backslash": lambda c: "\\" in c}


def pyrepr(s: str) -> str:
    """docs/10 §9.7's quoting, the rule the page implements: Python's repr of
    a string of U+0020-U+007E and printable non-ASCII.  The delimiter is "
    if s has ' and no ", else '; \\ doubles; a ' delimiter is escaped."""
    assert all(ch.isprintable() for ch in s), f"pyrepr is defined only for printable text: {s!r}"
    quote = '"' if "'" in s and '"' not in s else "'"
    body = s.replace("\\", "\\\\")
    if quote == "'":
        body = body.replace("'", "\\'")
    return quote + body + quote


def cli_text(argv: list[str]) -> tuple[int, str]:
    """Run the installed `keypath` CLI in-process: (exit code, stdout without
    its final newline)."""
    buf, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(err):
        code = keypath_cli.main(argv)
    assert not err.getvalue(), (argv, err.getvalue())
    text = buf.getvalue()
    assert text.endswith("\n"), argv
    return code, text[:-1]


def wb_rule(surface: str, message: str) -> tuple[str, list[str]]:
    """The template a violated-rule text matches (it must be one listed for
    its surface) and the repr'd values in it."""
    found = [(name, m) for name in WB_SURFACE_RULES[surface] if (m := WB_RULE_RE[name].match(message))]
    assert len(found) == 1, (surface, message, [n for n, _ in found])
    name, m = found[0]
    return name, [g for g in m.groups() if g is not None]


def wb_units(layout: str) -> list[str]:
    """Well-formed chunks of `layout`, from its tables."""
    if layout == "zh_daqian":
        return sorted({daqian_layout.keys_for_reading(r) for r in zh_chars().candidates_by_reading})
    if layout == "zh_eten":
        return sorted({eten_layout.keys_for_reading(r) for r in zh_chars().candidates_by_reading})
    if layout == "zh_jyutping":
        return sorted(zh_jyutping().candidates_by_reading)
    if layout == "zh_pinyin":
        return sorted({pinyin_layout.keys_for_reading(r) for r in zh_chars().candidates_by_reading})
    if layout == "zh_cangjie":
        return sorted(zh_cangjie().candidates_by_code)
    if layout == "zh_quick":
        return sorted(zh_quick().candidates_by_code)
    if layout == "ko_dubeolsik":
        return sorted({ko_layout.keys_for_unit(u) for u in ko_layout.units()})
    if layout in VI:
        # every 20th syllable of G, typed (G has 111,003)
        table = vi_telex() if layout == "vi_telex" else vi_vni()
        return sorted(keys for i, keys in enumerate(table.keys_by_syllable.values()) if i % 20 == 0)
    lang = {"ru_jcuken": "ru", "es_accent": "es", "en_identity": "en", "el_greek": "el"}[layout]
    if lang == "ru":
        words = sorted(ru_en().translations_by_ru)
    elif lang == "el":
        words = sorted(el_en().translations_by_el)
    elif lang == "es":
        words = sorted(es_en().translations_by_es)
    else:
        from wordfreq import top_n_list
        words = top_n_list("en", 3000)
    surface = registry.surface(lang, layout)
    out = set()
    for w in words:
        encoded = surface.encode_word(w, "keyed")
        if encoded is not None:
            out.add(encoded[1])
    return sorted(out)


def wb_pool(layout: str, units: list[str], rng: random.Random) -> list[str]:
    """Chunks to classify: every string of 0-2 keys, the layout's units and
    mutations of them, and random runs over its alphabet (quotes and a
    backslash mixed in)."""
    pool = {""} | set(ASCII_KEYS) | {a + b for a in ASCII_KEYS for b in ASCII_KEYS}
    pool |= set(units)
    alpha = sorted(set().union(*(s.alphabet for s in registry.surfaces_with_layout(layout))))
    spice = alpha + ["'", '"', "\\"]
    for _ in range(3000):
        pool.add("".join(rng.choice(alpha) for _ in range(rng.randint(3, 8))))
    for u in rng.sample(units, min(3000, len(units))):
        i = rng.randint(0, len(u))
        pool.add(u[:i] + rng.choice(spice) + u[i:])
        pool.add(u[:-1])
        pool.add(u + rng.choice(units))
    return sorted(pool)


def wb_lookup_fixtures(rng: random.Random) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(layout: str, chunks: list[str], top: int) -> None:
        sig = json.dumps([layout, chunks, top])
        if sig in seen:
            return
        seen.add(sig)
        code, text = cli_text(["lookup", "--layout", layout, "--top", str(top), "--", *chunks])
        assert code in (0, 1), (layout, chunks, code)
        report = toolkit.lookup(chunks, layout, top=top)
        assert toolkit.render(report) == text and (code == 0) == toolkit.all_well_formed(report), (layout, chunks)
        records.append({"id": f"lookup-{len(records)}", "layout": layout, "chunks": chunks, "top": top,
                        "output": text, "wellFormed": code == 0})

    goldens = {
        "zh_daqian": [["su3"], ["cj0", "u/6", "ru8"], ["-"]],
        # docs/10 §4.3 and §8.4: ETen types Dàqiān's readings on other keys
        "zh_eten": [["ne3"], ["ne3", "hz3"], ["=2", ";3"], ["7"], ["su3"], ["1"]],
        "zh_pinyin": [["ni3"], ["huan1", "ying2", "jia1"], ["su3"]],
        # docs/10 §4.4: the goldens and the pun (hou2, si1, nei5 on Pinyin)
        "zh_jyutping": [["nei5", "hou2"], ["si1"], ["hou2"], ["jyu4"], ["ni3"], ["gwong2", "dung1", "waa6"]],
        "zh_cangjie": [["tgno"], ["ykhaf"], ["tgno", "yhvl", "jmso"]],
        "zh_quick": [["of"], ["to", "yl", "jo"], ["ab", "mk"]],
        "ko_dubeolsik": [["gks"], ["rnr"], ["z"], ["ghks", "dud", "rk"]],
        "ru_jcuken": [["ghbdtn"], ["'nj"], ["`;br"], ["[kt,"]],
        "es_accent": [["man1ana"], ["pingu4ino"], ["an1o"], ["can1cio1n"]],
        "en_identity": [["welcome", "home"], ["hello"]],
        "vi_telex": [["vieejt"], ["vieetj"], ["nguwowfi", "dduwowfng"], ["hofa", "hoaf"], ["xoong"],
                     ["tooi", "cos", "gif"], ["the", "cat"]],
        "vi_vni": [["vie65t"], ["vie55"], ["ngu7o72i", "d9u7o72ng"], ["ho2a", "hoa2"], ["xoong"],
                   ["to6i", "co1", "gi2"], ["5a"]],
        # docs/10 §7.1's goldens, and the dead-key rule's refusals
        "el_greek": [["kalhm;era"], ["eyxarist;v", "u;alassa"], ["vra;iow"], ["kaWiki", "cyx;h"], ["sk;ylow"],
                     ["pro:i;on"], ["odow"], ["g;ata"], ["kal;b"], ["ab;"], [":a"], ["W"], [";;a"], ["q"],
                     ["kalhm;era", "q;a"]],
    }
    stats: dict[str, Any] = {}
    for layout in WORKBENCH_LAYOUTS:
        surfaces = registry.surfaces_with_layout(layout)
        units = wb_units(layout)
        by_rule: dict[tuple[str, str], list[str]] = {}
        well_formed: list[str] = []
        for chunk in wb_pool(layout, units, rng):
            ok = False
            for s in surfaces:
                entry = toolkit.lookup_unit(s, chunk, top=0)
                if entry["well_formed"]:
                    ok = True
                    continue
                name, _values = wb_rule(s.name, entry["error"])
                by_rule.setdefault((s.name, name), []).append(chunk)
            if ok and chunk:
                well_formed.append(chunk)
        for s in surfaces:
            reached = sorted(name for (sname, name) in by_rule if sname == s.name)
            assert reached == sorted(WB_SURFACE_RULES[s.name]), (s.name, reached)
        # the §8.2 goldens and a few more, the stream unsplit and split
        for chunks in goldens[layout]:
            add(layout, chunks, 10)
        add(layout, [WB_STREAM], 10)
        add(layout, ["tgno", "yhvl", "jmso"], 10)
        # well-formed chunks, alone and in threes, at every top
        picks = rng.sample(well_formed, 36)
        for i, chunk in enumerate(picks[:24]):
            add(layout, [chunk], WB_TOPS[i % len(WB_TOPS)])
        for i in range(24, 36, 2):
            add(layout, picks[i:i + 2] + [rng.choice(well_formed)], WB_TOPS[i % len(WB_TOPS)])
        # every template of every surface on this layout, and each quote class
        rule_chunks: list[str] = []
        for s in surfaces:
            for name in WB_SURFACE_RULES[s.name]:
                examples = sorted(set(by_rule[(s.name, name)]))
                chosen = rng.sample(examples, min(4, len(examples)))
                for cls, has_cls in QUOTE_CLASSES.items():
                    with_cls = [c for c in examples if has_cls(c)]
                    if with_cls:
                        chosen.append(rng.choice(with_cls))
                for chunk in chosen:
                    add(layout, [chunk], rng.choice(WB_TOPS))
                rule_chunks += chosen
        # random key runs, and mixes of good and bad chunks
        for _ in range(12):
            add(layout, ["".join(rng.choice(ASCII_KEYS) for _ in range(rng.randint(1, 7)))], 10)
        for _ in range(10):
            mix = [rng.choice(well_formed) for _ in range(rng.randint(1, 3))] + \
                  [rng.choice(rule_chunks) for _ in range(rng.randint(1, 2))]
            rng.shuffle(mix)
            add(layout, mix, rng.choice(WB_TOPS))
        stats[layout] = {"pool": sum(len(v) for v in by_rule.values()), "wellFormed": len(well_formed)}
    return records, stats


def wb_blocks(output: str) -> list[tuple[str, str, str | None]]:
    """(chunk, surface, violated rule or None) per block of lookup's text."""
    out = []
    for block in output.split("\n\n"):
        lines = block.split("\n")
        m = re.fullmatch(r"([\x21-\x7e]*) · (\([a-z]+, [a-z_]+\)) · well-formed: (yes|no)", lines[0])
        assert m, lines[0]
        rule = None
        if m.group(3) == "no":
            assert len(lines) == 2 and lines[1].startswith("  violated rule: "), block
            rule = lines[1][len("  violated rule: "):]
        out.append((m.group(1), m.group(2), rule))
    return out


def wb_type_texts(rng: random.Random, corpora: dict[str, list[str]]) -> dict[str, list[str]]:
    common = [
        "", " ", "   ", "\t", "a\nb", "hello world", "Hello, World!", "don't stop", "123 abc",
        "你好世界", "歡迎家", "明天", "國家", "鍵盤", "中文 English", "豈更", "𠀀𠀁", "한국어 공부", "ㅋㅋㅋ",
        "привет мир", "ЁЛКА", "ÑANDÚ año", "mañana", "pingüino", "canción", "ΣΑΣ ΟΔΟΣ", "İstanbul",
        "Straße", "é", "😀 hi", "a\u0001b", 'quote " and \\ backslash', "it's", "tab\there",
        "line sep", "mixed 你好 hello 안녕 привет ñ", "ｶﾞ", "welcome home",
    ]
    zh = corpora["CURATED"] + corpora["OOV_CASES"] + corpora["vectors_zh"] + corpora["vectors_zh_cangjie"]
    phrases = sorted(zh_phrases().readings_by_word)
    long_zh = "".join(rng.choice(phrases) for _ in range(120))[:200]
    texts: dict[str, list[str]] = {}

    def some(items: list[str], n: int) -> list[str]:
        pool = sorted(set(items))
        return rng.sample(pool, min(n, len(pool)))

    for layout in WORKBENCH_LAYOUTS:
        own = list(common)
        if layout.startswith("zh_") or layout == "ko_dubeolsik":
            own += some(zh, 10) + [long_zh]
            own += ["".join(rng.choice(phrases) for _ in range(rng.randint(2, 5))) for _ in range(3)]
        if layout in ("zh_eten", "zh_jyutping"):
            # docs/10 §4.3-§4.4's goldens, and characters with no Jyutping reading
            own += ["你好", "植物學", "無所不能", "明天見", "中國", "兒子", "香港", "銀行", "廣東話", "中文", "倉頡",
                    "我愛你", "歡迎家", "詩", "ㄅㄆㄇ 〇 𢔶"]
        if layout == "ko_dubeolsik":
            own += some(corpora["vectors_ko"], 8) + some(corpora["vectors_ko_hanja"], 4)
        if layout == "ru_jcuken":
            own += some(corpora["vectors_ru"], 10)
        if layout == "es_accent":
            own += some(corpora["ES_CORPUS"], 10)
        if layout == "en_identity":
            own += some(corpora["CORPUS"], 10)
        if layout == "el_greek":
            # docs/10 §7.1's goldens, Final_Sigma and the second NFC (§3.2),
            # polytonic and archaic letters (literals), Greek punctuation
            own += some(corpora["EL_CORPUS"], 10) + [
                "καλημέρα", "ευχαριστώ", "θάλασσα", "ωραίος", "καΐκι", "ψυχή", "σκύλος", "προϊόν", "ΟΔΟΣ",
                "ΣΟΦΟΣ Α.Σ. ΑΣ1", "ΚΑ\u03aa\u0301ΚΙ", "\u03ab\u0301", "Καλημέρα, κόσμε!", "τι κάνεις;",
                "τι κάνεις\u037e", "ἀγάπη", "ϐϑϕ", "γάτα cat", "φίλος · άνθρωπος", "qW;:", *SIGMA_DRIFT]
        if layout in VI:
            own += some(corpora["VI_CORPUS"], 10) + [
                "việt", "Việt Nam", "tôi có gì", "hòa hoà thủy thuỷ", "the man can sing", "the cat sat on the mat",
                "xoong is of", "VIỆT NAM", "vie\u0323\u0302t", "đường về nhà", "x\u0301 ñ ç"]
        texts[layout] = own
    return texts


def wb_type_fixtures(rng: random.Random, corpora: dict[str, list[str]]) -> list[dict[str, Any]]:
    records = []
    for layout, texts in wb_type_texts(rng, corpora).items():
        for text in texts:
            # the page refuses code points Unicode 14 does not assign (and lone
            # surrogates) before typing, so fixtures have none
            assert all(unicodedata.category(ch) not in ("Cn", "Cs") for ch in text), text
            code, out = cli_text(["type", "--layout", layout, "--", text])
            assert code == 0 and out == toolkit.render_typed(toolkit.type_text(text, layout)), (layout, text)
            records.append({"id": f"type-{len(records)}", "layout": layout, "input": text, "output": out})
    return records


def workbench_fixtures(out: Out, corpora: dict[str, list[str]]) -> None:
    """tests/fixtures/workbench-lookup.jsonl.gz and workbench-type.jsonl.gz
    (parity: the CLI's text for each input), workbench-rules.json (the
    violated-rule templates per surface) and pyrepr.json (repr of every value
    those texts quote, and more)."""
    for layout in WORKBENCH_LAYOUTS:
        surfaces = registry.surfaces_with_layout(layout)
        assert surfaces and all((s.language, s.layout) in SITE_ID and s.language != "ja" for s in surfaces), layout
        assert [[s.language, s.layout] for s in surfaces] == [list(p) for p in registry.SURFACES if p[1] == layout]
        assert all(s.selector_modes == ("keyed",) for s in surfaces), layout
    # the page reads a reading's (and syllable's) candidates from these lists:
    # a reading is a syllable of the table iff it has candidates
    chars = zh_chars()
    assert chars.valid_readings == frozenset(chars.candidates_by_reading)
    assert all(chars.candidates_by_reading.values()) and all(ko_hanja().candidates_by_syllable.values())
    rng = random.Random(WB_SEED)
    lookups, stats = wb_lookup_fixtures(rng)
    types = wb_type_fixtures(rng, corpora)
    assert len(lookups) >= 500 and len(types) >= 200, (len(lookups), len(types))

    # the §8.2-§8.3 goldens
    def one(layout: str, chunks: list[str]) -> str:
        return next(r["output"] for r in lookups if r["layout"] == layout and r["chunks"] == chunks and r["top"] == 10)
    assert "  candidates: 3\n  0:歡 1:莰 2:羑" in one("zh_cangjie", ["tgno"])
    assert "  candidates: 6\n" in one("zh_cangjie", ["ykhaf"])
    assert "  candidates: 62\n  0:你 " in one("zh_quick", ["of"])
    typed = {(r["layout"], r["input"]): r["output"] for r in types}
    assert typed[("zh_cangjie", "明天")] == "(zh, zh_cangjie)\n明 ab 0/1\n天 mk 0/1"
    assert typed[("zh_quick", "明天")] == "(zh, zh_quick)\n明 ab 0/14\n天 mk 1/60"
    assert typed[("zh_cangjie", "歡迎家")].split("\n")[1] == "歡 tgno 0/3"
    assert "  violated rule: D(vieetj) = viêtj is not a syllable of G; canonical Telex types a vowel's tone key " \
        "right after that vowel and its modifier key (e.g. việt = vieejt)" in one("vi_telex", ["vieetj"])
    assert "  violated rule: key '5' at position 4 cannot follow 'vie5' (VNI: a digit must follow the letter it " \
        "marks)" in one("vi_vni", ["vie55"])
    assert typed[("vi_telex", "tôi có gì")] == "(vi, vi_telex)\ntôi tooi -\ncó cos -\ngì gif -"
    # docs/10 §4.3-§4.4 and §8.2: ETen reads as Dàqiān does, Jyutping as the syllable
    assert one("zh_eten", ["ne3"]).startswith("ne3 · (zh, zh_eten) · well-formed: yes\n  reading: ㄋㄧˇ / ni3\n"
                                              "  candidates: 32\n  0:你 ")
    assert one("zh_eten", ["7"]).startswith("7 · (zh, zh_eten) · well-formed: yes\n  reading: ㄑ / ")
    assert one("zh_jyutping", ["nei5", "hou2"]).startswith("nei5 · (zh, zh_jyutping) · well-formed: yes\n"
                                                         "  reading: nei5\n  candidates: 14\n  0:你 ")
    assert "\n  candidates: 2\n  0:好 1:" in one("zh_jyutping", ["hou2"])
    assert "\n  candidates: 113\n" in one("zh_jyutping", ["jyu4"])
    assert "\n  candidates: 68\n" in one("zh_jyutping", ["si1"]) and "7:詩" in one("zh_jyutping", ["si1"])
    assert typed[("zh_eten", "你好")] == "(zh, zh_eten)\n你 ne3 0/32\n好 hz3 0/4"
    assert typed[("zh_jyutping", "你好")] == "(zh, zh_jyutping)\n你 nei5 0/14\n好 hou2 0/2"
    assert typed[("zh_jyutping", "銀行")] == "(zh, zh_jyutping)\n銀 ngan4 0/{}\n行 hang4 0/{}".format(
        len(zh_jyutping().candidates_by_reading["ngan4"]), len(zh_jyutping().candidates_by_reading["hang4"]))
    assert typed[("vi_vni", "tôi có gì")] == "(vi, vi_vni)\ntôi to6i -\ncó co1 -\ngì gi2 -"
    # docs/10 §7.1: one unit per word, its keys the letters' (the accent's dead key first)
    assert one("el_greek", ["kalhm;era"]) == ("kalhm;era · (el, el_greek) · well-formed: yes\n  reading: καλημέρα\n"
                                              "  candidates: 1 (identity: the unit is its reading; a key carries no "
                                              "homophone_index)\n  0:καλημέρα")
    assert one("el_greek", ["kal;b"]).endswith("  violated rule: dead key ';' (΄) at position 3 of unit 'kal;b' is "
                                               "followed by 'b'; on el_greek it must be followed by a vowel key it "
                                               "combines with (a e h i o y v)")
    assert one("el_greek", ["W"]).endswith("  violated rule: dead key 'W' (΅) at position 0 of unit 'W' ends the "
                                           "unit; on el_greek it must be followed by a vowel key it combines with "
                                           "(i y)")
    assert one("el_greek", ["q"]).endswith("  violated rule: unit 'q' contains 'q', which is outside the el_greek "
                                           "alphabet")
    assert typed[("el_greek", "ΟΔΟΣ")] == "(el, el_greek)\nοδος odow -"
    assert typed[("el_greek", "ΟΔΟΣʕ ΑΣ\U0001171eΑ")].split("\n")[1] == "οδοσ odos -"
    assert typed[("el_greek", "καΐκι")] == "(el, el_greek)\nκαΐκι kaWiki -"
    assert typed[("el_greek", "προϊόν")] == "(el, el_greek)\nπροϊόν pro:i;on -"

    # coverage: every template of every surface, and each quote class, in a
    # violated rule; every quoted value is repr == pyrepr
    covered: dict[str, set[str]] = {s: set() for s in WB_SURFACE_RULES}
    quoted: dict[str, set[str]] = {s: set() for s in WB_SURFACE_RULES}
    values: set[str] = set()
    for r in lookups:
        for chunk, surface, rule in wb_blocks(r["output"]):
            if rule is None:
                continue
            name, tokens = wb_rule(surface, rule)
            covered[surface].add(name)
            quoted[surface] |= {cls for cls, has_cls in QUOTE_CLASSES.items() if has_cls(chunk)}
            for token in tokens:
                value = ast.literal_eval(token)
                assert isinstance(value, str) and repr(value) == token and pyrepr(value) == token, token
                values.add(value)
    for surface, names in WB_SURFACE_RULES.items():
        assert covered[surface] == set(names), (surface, set(names) - covered[surface])
        assert quoted[surface] == set(QUOTE_CLASSES), (surface, quoted[surface])
    out.jsonl_gz("tests/fixtures/workbench-lookup.jsonl.gz", lookups)
    out.jsonl_gz("tests/fixtures/workbench-type.jsonl.gz", types)
    out.json("tests/fixtures/workbench-rules.json", {
        "layouts": WORKBENCH_LAYOUTS, "stream": WB_STREAM, "lit": _LIT,
        "rules": WB_RULES, "surfaces": WB_SURFACE_RULES,
    })
    # pyrepr: every quoted value, each printable ASCII key alone and next to
    # quotes and backslashes, and printable non-ASCII readings and radicals
    extra = set(" " + ASCII_KEYS)
    for a in "'\"\\ a":
        for b in "'\"\\ a":
            extra.add(a + b)
            for c in "'\"\\a":
                extra.add(a + b + c)
    extra |= {"ㄋㄧˇ", "廿土弓人", "한", "ㅋ", "ёжик", "ñ", "歡", "\U00020000", "a'ㄦ\"", "'ㄦ", "\\ˊ", "ü\"",
              "tgno yhvl jmso", "don't", 'say "hi"', "it's \"x\"", "a\\'b"}
    pairs = [[s, repr(s)] for s in sorted(values | extra)]
    assert all(pyrepr(s) == r for s, r in pairs)
    out.json("tests/fixtures/pyrepr.json", pairs)
    print(f"[workbench] {len(lookups)} lookup fixtures ({sum(not r['wellFormed'] for r in lookups)} not well-formed), "
          f"{len(types)} type fixtures, {len(values)} quoted values; pools: "
          + ", ".join(f"{k} {v['pool']}/{v['wellFormed']}" for k, v in stats.items()))


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
    "ell": ("FreeDict ell-eng", "CC BY-SA 3.0", None, False),
    "wordfreq": ("wordfreq data", "CC BY-SA 4.0", None, False),
    "unihan": ("Unihan", "Unicode-3.0", "LICENSES/Unicode-3.0.txt", False),
    "ucd": ("Unicode Character Database", "Unicode License", "LICENSES/Unicode.txt", False),
    "keypath": ("KeyPath", "MIT", "LICENSE", False),
}
_CHEWING = {"chewing": ("2026-07-10", "2026-09-23", "2026-09-24")}
_CHEWING_SHAPE = {"chewing": ("2026-07-10", "2026-09-28")}   # the Cangjie table's character set and order
_CHEWING_JYUTPING = {"chewing": ("2026-07-10", "2026-09-29")}   # the Jyutping table's character set and order
_SKK = {"skk": ("2026-07-10", "2026-09-24")}
_SKK_JA = {"skk": ("2026-07-10", "2026-09-29")}   # the Japanese example readings' whole lists
_SPA = {"spa": ("2026-07-10", "2026-09-24")}
_KENG = {"keng": ("2026-09-23", "2026-09-24")}
PACK2 = "2026-09-30"   # challenges 7-12 (KeyPath 2.6)
_PACK2_SHAPE = {"chewing": _CHEWING_SHAPE["chewing"] + (PACK2,)}   # a Cangjie or Quick challenge
_ = ()
SOURCES: list[tuple[str, str | None, dict[str, tuple[str, ...]]]] = [
    ("data/registry.json", None, {"keypath": _}),
    ("data/manifest.json", None, {"keypath": _}),
    ("data/unicode14.json", None, {"ucd": _}),
    ("data/hero.json", "data", {"cedict": _, **_CHEWING}),
    ("data/layouts.json", "data", {"keypath": _, **_CHEWING}),
    ("data/quick.json", "data", {"unihan": _, **_CHEWING_SHAPE}),
    ("data/jyutping.json", "data", {"unihan": _, **_CHEWING_JYUTPING}),
    ("data/ja/*.json", "data/ja", {"keypath": _, **_SKK_JA}),
    ("data/zh/core.json", "data/zh", {**_CHEWING}),
    ("data/zh/p/*.txt", "data/zh", {**_CHEWING, "hanja": _}),
    ("data/hanja/core.json", None, {"hanja": _}),
    ("data/cangjie/*.json", "data/cangjie", {"unihan": _, **_CHEWING_SHAPE}),
    ("data/en/vocab/*.json", None, {"wordfreq": _}),
    ("data/en/zh_daqian/*.json", "data/en/zh_daqian", {"cedict": _, **_CHEWING, "wordfreq": _}),
    ("data/en/zh_pinyin/*.json", "data/en/zh_pinyin", {"cedict": _, **_CHEWING, "wordfreq": _}),
    ("data/en/zh_cangjie/*.json", "data/en/zh_cangjie", {"cedict": _, "unihan": _, **_CHEWING_SHAPE, "wordfreq": _}),
    ("data/en/zh_jyutping/*.json", "data/en/zh_jyutping", {"cedict": _, "unihan": _, **_CHEWING_JYUTPING, "wordfreq": _}),
    ("data/en/zh_hanja/*.json", "data/en/zh_hanja", {"cedict": _, **_CHEWING, "hanja": _, "wordfreq": _}),
    ("data/en/ja_romaji/*.json", "data/en/ja_romaji", {"jmdict": _, **_SKK, "wordfreq": _}),
    ("data/en/ko_dubeolsik/*.json", "data/en/ko_dubeolsik", {**_KENG, "wordfreq": _}),
    ("data/en/ru_jcuken/*.json", None, {"rus": _, "wordfreq": _}),
    # docs/10 §9.2: permissive and CC sources only, so no NOTICE
    ("data/en/el_greek/*.json", None, {"ell": _, "wordfreq": _}),
    ("data/en/es_accent/*.json", "data/en/es_accent", {**_SPA, "wordfreq": _}),
    ("data/challenges/02.json", "data/challenges", {"keypath": _, "cedict": _, **_SPA, **_CHEWING, "wordfreq": _}),
    # pack II (2026-09-30): each key's tables, and for 11 the entries it reads
    ("data/challenges/07.json", "data/challenges", {"keypath": _, "unihan": _, **_PACK2_SHAPE}),
    ("data/challenges/08.json", None, {"keypath": _}),
    ("data/challenges/09.json", "data/challenges", {"keypath": _, "chewing": _CHEWING["chewing"] + (PACK2,)}),
    ("data/challenges/10.json", "data/challenges", {"keypath": _, "unihan": _, **_PACK2_SHAPE}),
    ("data/challenges/11.json", "data/challenges",
     {"keypath": _, "cedict": _, "jmdict": _, "skk": _SKK["skk"] + ("2026-09-29", PACK2), "ell": _,
      "chewing": tuple(sorted(set(_CHEWING["chewing"] + _CHEWING_JYUTPING["chewing"]))) + (PACK2,),
      "unihan": _, "wordfreq": _}),
    ("data/challenges/12.json", "data/challenges", {"keypath": _, "unihan": _, **_PACK2_SHAPE}),
    # the hints are the setter's own words
    ("data/challenges/hints/*.json", None, {"keypath": _}),
    ("data/challenges/*.json", "data/challenges",
     {"keypath": _, "cedict": _, "rus": _, **_CHEWING, "hanja": _, "wordfreq": _}),
    # (2026-09-28: Cangjie and Quick; 2026-09-29: Jyutping, and SKK readings
    # typed on the JIS kana keys; 2026-09-30: the keys and walks of challenges 7-12)
    ("tests/fixtures/*", "tests/fixtures",
     {"keypath": _, "cedict": _, "jmdict": _, "skk": _SKK["skk"] + ("2026-09-29", PACK2), **_KENG, "hanja": _,
      "rus": _, "ell": _, **_SPA, "chewing": _CHEWING["chewing"] + ("2026-09-28", "2026-09-29", PACK2), "unihan": _,
      "wordfreq": _, "ucd": _}),
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
    """kp1's ordinal lists (docs/10 §2.2) in the golden's own format, written
    from the registry (languages, then surfaces).  The cipher project's
    tests/golden/kp1-ordinals.jsonl is append-only, so it holds the same
    lines in landing order (M15 appended language vi after the surfaces):
    it must hold exactly these lines, each list in ordinal order."""
    lines = [{"list": "languages", "ordinal": i, "id": lang} for i, lang in enumerate(registry.LANGUAGES)]
    lines += [{"list": "surfaces", "ordinal": i, "id": list(pair)} for i, pair in enumerate(registry.SURFACES)]
    text = [json.dumps(line, ensure_ascii=False) + "\n" for line in lines]
    golden = (PROJECT / "tests" / "golden" / "kp1-ordinals.jsonl").read_text(encoding="utf-8").splitlines(keepends=True)
    assert sorted(golden) == sorted(text), "the registry's ordinals differ from kp1-ordinals.jsonl"
    for name in ("languages", "surfaces"):
        assert [g for g in golden if json.loads(g)["list"] == name] == [t for t in text if json.loads(t)["list"] == name]
    out.write("tests/fixtures/kp1-ordinals.jsonl", "".join(text))


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


# Keys that are valid and decode, yet have no kp1 form (docs/10 §2.2: pack is
# defined only when dumps_key(unpack(pack(K))) == dumps_key(K)).  A literal's
# tier is a bare const 3, so the float 3.0 passes validate_key (3.0 == 3), but
# kp1 carries integers only and the round trip writes 3, not 3.0.
KP1_NO_FORM = [
    ("a literal whose tier is the float 3.0", "3.0"),
    ("a literal whose tier is the float 3e0", "3e0"),
]


def kp1_no_form() -> list[dict[str, str]]:
    """Challenge-01's key with a literal word "a" in front, its tier written
    as a float; each validates and decodes, and pack refuses it."""
    base = (PROJECT / "puzzles" / "challenge-01" / "key.json").read_text(encoding="utf-8")
    cipher = (PROJECT / "puzzles" / "challenge-01" / "ciphertext.txt").read_text(encoding="utf-8").strip()
    rows = []
    for why, tier in KP1_NO_FORM:
        text = base.replace('"words": [', '"words": [{"literal": {"tier": ' + tier + ', "text": "a"}}, ', 1)
        key = json.loads(text)
        assert isinstance(key["segments"][0]["words"][0]["literal"]["tier"], float), why
        validate_key(key)
        decoded = decode(cipher, key)
        try:
            kp1_pack(key)
        except KeyValidationError as exc:
            assert str(exc).startswith("kp1: no kp1 form"), exc
            rows.append({"why": why, "keyText": text, "ciphertext": cipher, "decoded": decoded})
            continue
        raise SystemExit(f"kp1 packed a key with no kp1 form: {why}")
    return rows


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
    no_form = kp1_no_form()
    # docs/10 §2.1, §5: flags bit 0 (inline) on a keyed-only surface, §5's
    # `t3` key among them: the string reads, but its key fails validate_key
    inline = []
    t3 = {"keypath": "1.1", "tables_sha256": EDITION, "source_language": "ja",
          "segments": [{"language": "ja", "layout": "ja_kana", "route": ["homophone:ja", "keystroke:ja_kana"],
                        "selector_mode": "inline", "words": [{"units": [{"len": 2}]}]}]}
    cases = [("the ja_kana chunk t3 as an inline unit (docs/10 §5)", t3)]
    for text, source, sid in (("你好", "zh", "zh_eten"), ("你好", "zh", "zh_jyutping"), ("welcome home", "en", "ja_kana"),
                              ("θάλασσα", "el", "el_greek"), ("sea", "en", "el_greek")):
        key = copy.deepcopy(py_encode(text, source, sid).key)
        key["segments"][0]["selector_mode"] = "inline"
        cases.append((f"{text} on {sid}, inline", key))
    for why, key in cases:
        s = kp1_text(kp1_payload(key))
        try:
            kp1_unpack(s)
        except KeyValidationError:
            inline.append({"why": why, "kp1": s, "keyText": json.dumps(key, ensure_ascii=False, indent=2) + "\n"})
            continue
        raise SystemExit(f"kp1 unpacked an inline key on a keyed-only surface: {why}")
    out.json("tests/fixtures/kp1.json", {"accepted": accepted, "rejected": rejected, "refused": refused,
                                          "markup": markup, "noForm": no_form, "inlineRefused": inline})
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
    jyutping_data(out)
    ja_lists = ja_lists_data(out)
    vocab = vocabulary()
    example_words = set(re.findall("[a-z]+", " ".join([HERO[0]] + [c[0] for c in CHIPS if c[1] == "en"])))
    assert example_words <= set(vocab), example_words - set(vocab)
    rows = english_data(out, vocab, shape)
    shipped = challenges_data(out)
    hero = hero_data(out)
    corpora = load_corpora()
    build_fixtures(out, vocab, rows, corpora, shipped, ja_lists)
    workbench_fixtures(out, corpora)
    legends_fixture(out)
    digests(out, vocab, rows)
    vi_chunk_fixture(out)
    el_fixture(out, corpora)
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
