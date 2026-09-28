# Real-data delta smoke test

Date: 2026-09-28. Source production/full-text indexes opened in read-only mode.
Selected 12 evenly spaced map row IDs across the current corpus and extracted
their metadata and stored full texts into a NEW isolated build pair.

Test directory: `data/legal-index-e2e-20260928-verified`.
Machine-readable result: `report.json` in that directory.
Reproducible harness: `scripts/verify-real-search-delta.py` (requires Node/Python
and permission to bind a temporary localhost port). Pass source main, source
full-text and a new destination directory. Existing destinations are refused.

Checks completed:

- Baseline indexing of 12 real texts, preview FTS build and queue synchronization.
- A marker appended to ONE test copy and ONE clearly labeled synthetic ID added.
- Both markers found under their expected IDs through the actual HTTP API.
- Full-text snippets contain the appended markers beyond the initial preview.
- Court/date combined filtering returns the expected decision.
- Main/map/FTS/content counts all equal 13; four compressed content chunks.
- Independent index checker and preview FTS integrity check pass.
- Replaying synchronization consumes zero jobs; queue is empty.
- Temporary server stopped; case-management DB isolated through its working
  directory, not the real application's `data/cases.db`.

The first run (`data/legal-index-e2e-20260928`) exposed a stale `content_chunks`
metadata value after appending a new chunk. Synchronization now updates that
counter in the same transaction. A unit regression assertion covers it; the
fresh second run passed the independent checker and API checks.

No source corpus or live deployment was changed. Test JSONL files contain
synthetic modifications and must NEVER be imported into the real corpus.
These directories are excluded from Git. This is a workflow correctness smoke
test, not parser accuracy evaluation or production-scale performance testing.
