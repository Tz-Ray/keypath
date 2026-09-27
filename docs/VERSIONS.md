# tables/VERSIONS.md — provenance and checksums

This file is the pin for everything: the sha256 of THIS FILE is the
`tables_sha256` embedded in every key, and it in turn pins the sha256 of
each processed table, which pins the raw sources.  Regenerate with
`python scripts/fetch_raw.py && python scripts/build_tables.py`
(byte-identical for the pinned raw inputs).

## Source: libchewing-data (zh readings, frequencies, phrases)

- url: https://github.com/chewing/libchewing-data
- commit: c44e81aef24b06f1509f19e1be54c99812d0c43f
- retrieved: 2026-07-10
- license: LGPL-2.1-or-later
- raw sha256 (dict/chewing/word.csv): da55b8e599c1389bc486453554f3410cf9c621d0ffff0ce38855698d26b3892a
- raw sha256 (dict/chewing/tsi.csv): c889a1ac3ae1901b3f8f62748bc41b958f010bf995f7f88dbaf9e3494f341428

## Source: CC-CEDICT via MDBG (zh↔en lexicon)

- url: https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip
- upstream version: 1.0, date=2026-07-10T09:07:50Z, entries=124754
- retrieved: 2026-07-10 (dated daily snapshot; the sha256 below is the pin)
- license: CC BY-SA 4.0
- raw sha256 (cedict_ts.u8): 30d83001458fb039cf2ab985ea834b729e2c2f12ce2cf3103e1814ee72ad2207

## Source: SKK-JISYO.L (ja reading -> word candidates)

- url: https://raw.githubusercontent.com/skk-dev/dict/0a164e6b990c5eb5b59eb7d8789f08865dc2f644/SKK-JISYO.L
- commit: 0a164e6b990c5eb5b59eb7d8789f08865dc2f644
- retrieved: 2026-07-10
- license: GPL-2.0-or-later
- raw sha256 (SKK-JISYO.L, EUC-JP): c791f578d1b4040fce282db29bc22b2cc7ea46f83e269fab2e0fa779e2967e40

## Source: jmdict-simplified (ja↔en)

- url: https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260706150322/jmdict-eng-3.6.2%2B20260706150322.json.zip
- release tag: 3.6.2+20260706150322
- retrieved: 2026-07-10
- license: CC BY-SA 4.0 (JMdict, EDRDG)
- raw sha256 (jmdict-eng-3.6.2.json): 3142064a4d0e6cb57e1a991db53597643e76de3633196f66072324d80d4a7ade

## Source: FreeDict spa-eng (es↔en; en→es derived as reverse index)

- url: https://raw.githubusercontent.com/freedict/fd-dictionaries/5bdceeac8d0dba3298c1bebe734f60d54dad30f7/spa-eng/spa-eng.tei
- commit: 5bdceeac8d0dba3298c1bebe734f60d54dad30f7
- retrieved: 2026-07-10
- license: GPL (FreeDict)
- raw sha256 (spa-eng.tei): d1a48cd5b1fb5111d36243a9ee4a226d2e29b70f0f8a8262b9f334b2b8f6c47c
- ordering: wordfreq==3.1.1 Zipf frequencies, baked at build

## Source: libhangul hanja.txt (hangul -> hanja candidates, glosses)

- url: https://raw.githubusercontent.com/libhangul/libhangul/5094421d9586294b2aad09924b9a54e2e6060f06/data/hanja/hanja.txt
- commit: 5094421d9586294b2aad09924b9a54e2e6060f06
- retrieved: 2026-09-23
- license: BSD-3-Clause
- raw sha256 (hanja.txt): b1004034589f1357daaea3534a6136f6b5ef825afa8779886b20f0b7908bbe3b

## Source: kengdic (ko↔en lexicon)

- url: https://raw.githubusercontent.com/garfieldnate/kengdic/793de2369c9a98b944154eb4695d26854d2de59b/kengdic.tsv
- commit: 793de2369c9a98b944154eb4695d26854d2de59b
- retrieved: 2026-09-23
- license: LGPL-2.0-or-later
- raw sha256 (kengdic.tsv): d23236d5676f506514721e605534647ba4735a85bbb76b9e12d1ec067b8cfdb4
- ordering: wordfreq==3.1.1 get_frequency_dict('ko', 'best'), exact lookup, Zipf baked at build

## Source: FreeDict rus-eng (ru↔en; en→ru derived as reverse index)

- url: https://download.freedict.org/dictionaries/rus-eng/2025.11.23/freedict-rus-eng-2025.11.23.src.tar.xz
- release: 2025.11.23 (TEI source; WikDict, from Wiktionary via DBnary)
- retrieved: 2026-09-23
- license: CC BY-SA 3.0
- tarball sha512 (as published in freedict-database.json): 9adf7a5eda27ccfa3e496b86b2fd575fc0e4af7ac5626a219d44e4ebfd56280deaf67cefd995ab04e9d7ef415e88f8cf0f9cae3252da6221376fd6d0c39012ba
- tarball sha256: 9ab8e1a00c463f631e510899d20d26738b11af7b8cdddf8e44a396ba8349bfd5
- raw sha256 (rus-eng.tei): 294932498ca0e75420565731c8cdfc0737b49c7714e8108f0db61ccdca318d37
- ordering: wordfreq==3.1.1 zipf_frequency, en for the ru→en order and ru for the en→ru order, Zipf baked at build

## Processed tables

- zh_chars.tsv: b9de5dd9a051e35d3cc57647de66af3458f3620a6fb541cbc5dbe3f8d3e72095
- zh_phrases.tsv: 856c26918c8b39d51733ec906fc6c585b6a8ba2baa8d141c086ad98f3e8a2efe
- zh_daqian.tsv: cacfbdb89535eee8cf434c81d9625233ada7a9f63219539c529b24564e23e41b
  (layout pinned by docs/06-build-spec.md §3, not derived from raw data)
- zh_en_cedict.tsv: 8c61bda078b435e5c49ee08ebc051c2906a8a5703a768d2d015d0d4daa4ee19f
- ja_romaji.tsv: eae013009aba24033a62ef29e8bc317ea889e804b85d29a56ebb88ceae00a369
  (layout pinned by docs/06-build-spec.md §4.2)
- es_accent.tsv: cd5d054a8863b95fb3cde13a9b4c4a1e56e10c69f783292d7e70d8cf84639d68
  (layout pinned by docs/06-build-spec.md §4.1)
- ja_skk.tsv: a1ccdad0cb749cf44ebb8f846a182ba1e2a1574e62b593e6f4d67868dabe52cc
- ja_en_jmdict.tsv: e106d072d5b4a8b011d8fec1453dc43cd646d841e33e6d3a5c11760fd33f942f
- es_en_freedict.tsv: 73f748bd7745862f6a0eae027d6d977843233ee7298ea353bee484773741b8ea
- zh_pinyin.tsv: bfc6755fe8d1bcea00386449ee473ebb8ce01022219b3a8a764b16669672b217
  (layout pinned by docs/07-extensions-spec.md §5; derived from zh_chars.tsv)
- ko_dubeolsik.tsv: 5b7ba0a23d9e72ce9d074c7d0f21548d7ae8cd4e2d6dc62bcbfaae53dbfcd2fd
  (layout pinned by docs/07-extensions-spec.md §6, not derived from raw data)
- ko_hanja.tsv: 8d63f7a42d8a706f432561a3171edcd72ee582abc491f0fed2f7cf63bdc1daa2
  (single-character entries of libhangul hanja.txt, file order; docs/07 §6)
- ko_hanja_readings.tsv: 90fc13b4eed3c56d98194c24a4308e37f444b10e92383ee5dcb3306db40d9fec
  (the docs/07 §6 reading choice baked from hanja.txt: primary readings, then the word readings that differ from them)
- ko_en_kengdic.tsv: 7f9cd8188037ddab6e2416c1ad48342cc7221e38ca5cffea423d15cfb24f50f3
  (Zipf(ko) x100 baked with wordfreq==3.1.1 get_frequency_dict('ko', 'best'))
- ru_jcuken.tsv: 4408f1ad850fec7be3de28f5082247a0f4160ac65cbba7491d8c3db81bd3de15
  (layout pinned by docs/07-extensions-spec.md §7 (Windows Russian KLID 00000419), not derived from raw data)
- ru_en_freedict.tsv: 2573032a287765a5673cd597e16ce540f44f907dd7ad4db0d7252d3a8f8de8c1
  (Zipf(ru) millis and the ru→en order baked with wordfreq==3.1.1; the en→ru order is derived at load)
