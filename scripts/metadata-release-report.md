# Metadata release audit

Population: 9,820,145 local Yargitay decisions. Selected 5,000 distinct rowids
uniformly without replacement using Python Random seed 260926. Text came from
the compressed full-text DB and metadata was joined by hf_id from the main DB.
Both databases were opened read-only. Sample spans 2005-2026 and 49 court names;
rare years/courts are not guaranteed representation by this design.

Sample SHA256: `321e3d927e1408b871bb86379a7c6eca8bee950e59539d554fa8ccc46d1b987a`
Final parser SHA256: `8320714c721afbb8fd0554a6ceed1abfb89068228bbcbfa2bac8a0401e8daeb4`
Policy: `preserve-source-fill-high-v1`.

| Field/status | Before changes | After changes |
| --- | ---: | ---: |
| Court agrees with source | 4,991 | 5,000 |
| Court unresolved | 9 | 0 |
| Date agrees with source | 4,654 | 4,662 |
| Date conflicts with source | 62 | 62 |
| Date unresolved | 270 | 262 |
| Date needs review | 14 | 14 |

General fixes: recognize chamber presidents board headings; allow a valid
four-digit year immediately followed by gunu/gununde/tarihinde while rejecting
extra year digits. No decision IDs are used in parsing rules.

The 62 date conflicts have explicit dates in closing decision language. Many
involve transfer decisions in 2011 and differences of one day or several weeks.
These could originate in source metadata or document templates; text extraction
alone cannot establish the authoritative decision date. Preserve both values.
Unresolved examples include malformed dates, dates before long dissent sections,
and competing historical dates near the closing sentence. Do not guess repairs.

These are HF agreement/coverage results, not independently labelled accuracy.
The sample was used for improvements and is now a development sample; use a new
seed for a future held-out evaluation.

The builder now writes legal_index_metadata_audit in the same transaction as
each decision, including original values, candidates, flags, text hash, parser
hash and policy version. Only missing source values with high-confidence,
unflagged candidates may be filled. Conflicts retain the original search value.
An isolated 200-decision build produced 200 audit records. The 9.82M source DB
has not been reprocessed or modified, and these changes are not deployed.

Reproduce sample and audit with new output paths:

```sh
python3 scripts/sample-metadata-release.py data/legal-index-all.sqlite data/legal-index-fulltext.sqlite /private/tmp/metadata-sample-new.jsonl
node scripts/audit-metadata-release.mjs /private/tmp/metadata-audit-new /private/tmp/metadata-sample-new.jsonl
node --test scripts/decision-metadata-parser.test.mjs scripts/decision-metadata-policy.test.mjs scripts/legal-parser.test.mjs
```
