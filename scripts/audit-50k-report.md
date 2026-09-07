# 50k Parser Audit Report

Generated: 2026-09-07

Scope: first 50,000 cached Yargitay rows from `hamzabagirsakci/turkish-court-decisions`.

Input cache: `/tmp/hf-metadata-audit-50k/yargitay-0-50000.ndjson`

Detailed output: `/tmp/hf-metadata-audit-50k/results.ndjson`

Summary output: `/tmp/hf-metadata-audit-50k/summary.json`

Row coverage output: `/tmp/hf-metadata-audit-50k/row-coverage.json`

## Row-Level Coverage

- Rows: 50,000
- HF-tagged rows: 22,933 / 50,000 = 45.87%
- Rule-parser tagged rows: 34,069 / 50,000 = 68.14%
- Rows tagged by both: 22,933 / 50,000 = 45.87%
- HF-only rows: 0 / 50,000 = 0.00%
- Rule-only rows: 11,136 / 50,000 = 22.27%
- Neither tagged: 15,931 / 50,000 = 31.86%

Interpretation: the local parser covers substantially more article-level statute citations than the HF `mevzuat_atif` tags. At row level, every row with an HF statute tag now has at least one local parser statute tag in this 50k sample.

## Citation-Level Audit

- HF refs: 41,726
- Rule refs: 95,350
- Exact HF-rule canonical matches: 34,027
- HF refs without exact rule match: 7,699
- Rule refs without exact HF match: 61,323

Audit flags:

- `granularity_mismatch`: 11,531
- `hf_less_specific_than_rule_parser`: 4,208
- `hf_more_specific_than_rule_parser`: 7,323
- `missing_from_hf_tag`: 54,000
- `not_found_by_rule_parser`: 3,491
- `legacy_tck_ambiguity`: 3,407
- `same_law_anaphora`: 1,844
- `tmk_medeni_terror_ambiguity`: 87
- `possible_decision_number_confusion`: 5
- `continuation_article_reference`: 1

## Latest Parser Additions

- Added unnumbered `İş Kanunu` resolution with conservative historical handling: article 73 maps to 1475, while modern/post-2003 references map to 4857.
- Added `İcra İflas Kanunu/Yasası` aliases for common missing-`ve` text.
- Added `HUMY` support as an OCR/legacy variant of HUMK.
- Added long endpoint range handling such as `HUMK.m.253-274`, recording the start and end articles without expanding the whole range.
- Added support for principal-law amendment references with intervening text, such as `2004 sayılı İcra ve İflas Kanunu'nun ... 4949 sayılı Yasa ile değişik 303. maddesi`.
- Added `TKHK` support for 4077 references.
- Added typo/OCR-tolerant numbered-law forms such as `6831 Sayılı Yasının 2. madde`.
- Added dated amendment support after full law aliases, such as `Hukuk Usulü Muhakemeleri Kanununun 23.6.1996 gün 4146 sayılı kanun ile değişik 440/III-1 maddesi`.
- Added split numbered-law handling for legal pairs such as `2547 Sayılı Yasanın 56/b ve 492 sayılı yasının 13/1 maddesi`.

Remaining zero-citation examples are mostly not statute citations under the current `law_no/article` model: private contracts, specifications, tariffs, regulations, budget-law fragments without reliable law number, and international conventions. These should be modeled as separate source types before indexing, rather than forced into the statute parser.

## Metadata Parser

- Court extraction: 49,791 / 50,000 = 99.58%
- Court agreement among comparable rows: 100%
- Decision date extraction: 49,358 / 50,000 = 98.72%
- Decision date agreement among comparable rows: 97.83%

Date flags:

- `not_found_in_text`: 423
- `decision_year_conflict`: 325
- `conflicting_candidates`: 219
- `multiple_deliberation_dates`: 1

## Caveat

These are HF-agreement and parser-coverage metrics, not independently labelled accuracy. The first 50,000 Yargitay rows are also not guaranteed to be a random sample.
