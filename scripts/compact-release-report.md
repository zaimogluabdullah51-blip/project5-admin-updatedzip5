# Compact serving artifact

The initial build figures below are historical. See the optimized revision at
the end for the current production file and package directory.

Source: data/legal-index-all.sqlite (19,469,946,880 bytes).
Output: data/legal-index-production.sqlite (15,300,493,312 bytes).
Reduction: 4,169,453,568 bytes, about 21.4 percent.

The production copy retains all 9,820,145 decisions and all 27,917,901 citations.
Six repeated citation attributes are stored in 4,385 dictionary entries.
legal_index_citations is a compatibility view over citation_records and
citation_attributes. The redundant write-time uniqueness constraint is omitted
from this read-only serving format. Do not run the ingestion builder on it.

Every citation field was compared with the original snapshot before replacing
the copied table. No differing fields were found. Decisions, previews, metadata,
court counts, and the preview FTS were preserved by SQLite backup. quick_check
returned ok after VACUUM. The separate full-text database remains unchanged.

Eleven serving queries matched exactly, including all returned fields and
ordering: court/date, untagged, tagged, citation detail, law/article, combined
citation filters, court options, three full-text searches, and preview fallback.
Full-text ranking therefore remains unchanged for the tested queries.

Broad court filters still take approximately 6-7 seconds on the production copy
in this sequential local check. This is not a controlled benchmark (source ran
first, caching differs). A composite/partial-index performance pass remains
necessary before publication. This artifact has no new metadata backfill;
that task remains separate and is recorded in release-checklist.md.

Generated manifests beside the database contain sizes, counts and validation
results. scripts/build-compact-legal-index.py and
scripts/check-compact-legal-index.py reproduce the build and query checks.

## Verified packages

Directory: data/legal-index-release-20260926.

| Artifact | SQLite bytes | Gzip bytes |
| --- | ---: | ---: |
| Main production index | 15,300,493,312 | 4,113,167,100 |
| Full-text index | 11,800,186,880 | 8,843,066,550 |
| Total | 27,100,680,192 | 12,956,233,650 |

Both gzip streams were decompressed and hashed, matching their source SQLite
hashes. manifest.json distinguishes sqlite_sha256 from gzip_sha256 to avoid
the previous compressed/uncompressed checksum confusion. The existing prepare
script was exercised with a small packaged fixture and the SQLite checksum.
These are local artifacts, not uploaded or deployed. Full-text payloads already
contain compressed document chunks, limiting additional gzip savings.

## Optimized revision

Added idx_decisions_court_date(court, karar_tarihi DESC, hf_id DESC,
citation_count) and removed the old court-only index. This avoids sorting all
matching decisions and allows citation-state filtering inside the index.
The source database remains unchanged. Current production file: 15,615,090,688
bytes; combined with full-text: 27,415,277,568 bytes. quick_check passed.

All eleven query comparisons passed again, including complete returned fields
and ordering. Local timings for the optimized artifact:

| Query | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Court/date | 74.19 | 1.06 |
| Court/untagged | 6749.88 | 0.64 |
| Court/tagged | 6367.96 | 0.15 |
| Court/date/citation | 7496.07 | 7.35 |

These are single local measurements with differing cache states, not latency
guarantees. EXPLAIN QUERY PLAN confirms removal of the temporary ORDER BY tree.
Server concurrency and target-host performance remain untested.

Current release directory: data/legal-index-release-20260926-optimized.
The older package is retained as a rollback artifact and does not contain the
new browsing index. Full-text is reused only after checking both its source and
archive hashes; hard-link reuse avoids another 8.84 GB local copy.

Optimized gzip sizes: main 4,184,867,004 bytes; full-text 8,843,066,550 bytes;
total 13,027,933,554 bytes. Both artifacts are verified in the optimized release
manifest. Main SQLite SHA256 is
f37f8ef189fb3d33b8c0c19486899e3d1357ad9ca58b6e12d4f467a8b7066d8b.
