# Backup, rollback and updates

## What must be retained

There are two independent data lifecycles:

- Search release: main index, full-text index, their manifest and matching code
  revision. Treat the two index files as one immutable release.
- Case-management data: `data/cases.db`, which changes while the app runs.
  It is NOT included in search release packages.

Keep the last known-good search release and code until the replacement passes
checks. Retain the raw/build source separately. Never run builders against the
serving files. Store credentials in protected configuration, not in a manifest
or Git. A local backup on the same disk is not disaster recovery: keep another
verified copy on an encrypted external disk or approved private backup storage.
Do not upload case data to public artifact hosting.

Suggested retention: seven daily case snapshots and four weekly snapshots,
plus a snapshot before each app/schema deployment. No scheduler or automatic
deletion is configured by this document. Verify off-device restore before
deleting older backups; never delete the only known-good release.

## Case snapshot

Run from the repository directory, choosing a NEW destination each time:

```sh
python3 scripts/backup-sqlite.py data/cases.db data/backups/cases-YYYYMMDD-HHMMSS
```

This uses SQLite's online backup API, including committed WAL data, then checks
integrity and writes a SHA256 manifest. The directory is private (0700), the
snapshot is 0600. Missing/corrupt sources and existing destinations are rejected.
Only a fully verified snapshot directory is published. Disk errors leave the
source unchanged. Ensure free space for at least the database plus headroom;
large databases and sustained writes can make a backup slow.

To restore, first stop every app/worker writing `cases.db`. Take a fresh snapshot
of the current state if readable, verify the selected backup's SHA256 against
its manifest and run SQLite `PRAGMA integrity_check` on it. Restore into a NEW
private staging directory, never over a live database. Open it read-only to
verify expected tables/counts before proceeding. Preserve the old DB and any
`-wal`/`-shm` files together in a separate rollback directory while writers are
stopped; do not mix old sidecars with a restored DB. Install the verified
snapshot as `data/cases.db`, restrict permissions, and restart the compatible
app version from the same working directory. Smoke-test case read/write flows.
Restoring an older snapshot loses changes since that snapshot; obtain explicit
approval for that loss before replacing current case data.

## Search release promotion and rollback

1. Preserve the current code revision, both configured index paths and the
   matching manifest. Snapshot case data before any application/schema change.
2. Install the candidate into a new versioned directory using
   `install-legal-release.py`; see `install-release-guide.md`. Never overwrite
   the previous release. The installer verifies both compressed/uncompressed
   hashes, SQLite integrity and population counts.
3. Start a candidate on a separate port using BOTH candidate paths and
   `npm run serve`. Note that the app initializes `data/cases.db` relative to its
   working directory: use an isolated case snapshot for candidate testing if
   the code/schema changed, not the live case DB.
4. Check readiness, court/date results, tagged and untagged searches, citation
   results, full-text snippets, paging, cancellation and overload behavior.
   Compare known decision IDs with the expected release, not just row counts.
5. Switch traffic only after checks pass. Record revision, paths, hashes,
   counts and time. Keep the old release available.
6. On failure, stop the candidate, restore BOTH old index paths with the
   compatible code/configuration, restart and repeat the same smoke tests.
   Index rollback does not require restoring case data. If schema compatibility
   is uncertain, resolve it before changing app versions.

Current optimized search pair is about 27.42 GB unpacked and 13.03 GB archived.
Keeping old and new pairs plus one package requires roughly 67.86 GB before
OS, source/build copies and temporary work. Confirm free space before staging.
Checksums detect corruption, not authenticity: use a trusted manifest.

## Incremental updates: not production-ready yet

The existing builders are not a safe incremental release mechanism:

- `build-local-legal-index.mjs` now replaces each decision's citations inside
  the existing batch transaction. A failed replacement rolls back metadata,
  audit evidence and citations together. Replays preserve semantic results,
  though citation row IDs and processing timestamps can change. This does not
  yet provide a complete incremental release.
- `build-local-fulltext-index.py` resumes by source offset. This is valid only
  for the same pinned source ordering, not arbitrary changed/deleted decisions.
- The compact production citation table is a view; it is a serving artifact,
  not an ingestion target. Full-text map, FTS postings and compressed chunks
  must remain consistent with the main index.

Required implementation before an incremental run:

1. Pin source revision/shard hashes and parser/policy hashes. Build a delta by
   stable `hf_id` and text hash: new, changed, unchanged and explicit deletions.
   A partial source listing must never imply deletion.
2. Work on a separate writable build generation. Transactional citation
   replacement and transitions to zero are implemented and tested in the main
   builder. Source fingerprints and per-decision input/processing fingerprints
   now prevent unrelated checkpoint reuse and skip unchanged decisions. Still
   use the bounded offline synchronization described below to finish search updates.
3. Update preview FTS, full-text postings/map and compressed text consistently;
   preserve or explicitly rebuild row-ID/chunk mappings. Publish neither file
   until the entire pair is complete. Record progress per source generation.
4. Test add/change/delete, zero-citation transitions, crash/resume and replay.
   Verify matching ID populations, content coverage and citation counts, then
   create a new compact pair and validate representative searches.
5. Package/install/promote as a new immutable release using the steps above.

For parser-only improvements, target affected IDs/rules in the build copy;
do not blindly re-import the entire corpus. No incremental import or production
metadata backfill was performed as part of this backup/documentation step.

## Main-builder generation checks (2026-09-28)

Checkpoint v2 binds source SHA256 (JSONL or ordered cached shard hashes), code
hashes, compact/config options, range, real target path and file identity.
Remote Parquet requires a full HF commit hash, not a moving branch. Sources
must remain immutable during a run; only one builder may operate on a target.
Local shard hashing is an additional full read before processing starts.

Legacy/unmatched checkpoints fail before the target DB is opened. For a new
source/parser generation, choose a NEW checkpoint path and replay the intended
range on a separate writable build copy. Do not manually advance its offset.
After restoring/moving a DB, start a new checkpoint; do not overwrite a DB in
place while retaining its old checkpoint. File identity is not a content hash.

`legal_index_processing_state` stores canonical input-row and processing hashes
in the same transaction as decisions/citations/audit. Identical rows retain their
existing IDs/timestamps; metadata-only or code changes force reprocessing.
Older rows without fingerprints are processed once, not assumed unchanged.
Missing stable decision IDs or missing text are rejected rather than silently
using positional IDs or clearing citations from an incomplete input record.
An explicit empty text string is allowed. Missing IDs in a partial input never
imply deletion. This still reads the supplied input; it is not a change-feed
fetcher and does not promote a release. Search synchronization requires the
explicit offline delta workflow below.

## Bounded offline search updates (2026-09-28)

Use TWO separate, writable offline copies of a matching main/full-text build.
Never point these commands at the live service, its configured files, or the
compact serving artifact. Stop all builders/readers for these offline copies
before synchronization. Source files remain unchanged. A baseline preview FTS,
if present, must already be valid; this is not a repair tool for stale indexes.

From the repository, with prepared files and a new checkpoint (example paths):

```sh
LEGAL_INDEX_DB_PATH=/work/candidate/main.sqlite HF_INDEX_INPUT_JSONL=/work/delta.jsonl HF_INDEX_CHECKPOINT=/work/candidate/delta-checkpoint.json HF_INDEX_LIMIT=100 HF_INDEX_TRACK_SEARCH_UPDATES=true node scripts/build-local-legal-index.mjs
python3 scripts/sync-search-delta.py /work/candidate/main.sqlite /work/candidate/fulltext.sqlite --offline-copy
```

Set HF_INDEX_LIMIT to the actual delta row count (100 above is only an example).
The builder installs preview FTS triggers when that index exists and records
changed full text in `legal_index_search_updates` in the decision transaction.
Pending updates set main status to `pending_search_sync`, not ready. Do not
disable tracking for a paired delta. Unchanged inputs do not add new queue rows.

The synchronization tool refuses more than 1,000 queued IDs by default. It uses
DELETE journals and FULL synchronization with one attached-database transaction
to update postings, compressed chunks, mappings, court/date options and queue
acknowledgements together. Old posting deletion uses the actual stored text;
new IDs append without renumbering existing rows. A missing preview index is
built once, which can be expensive. ID-population and integrity validation may
scan the entire offline corpus even for a small delta; benchmark before scale.

On failure, both files roll back and pending updates remain. Fix the cause and
rerun; a consumed queue is safe to replay. `--offline-copy` is an operator
acknowledgement, not automatic detection of whether a file is in live use.
Source and candidate must remain separate. After success, compact/package and
verify the pair before promotion. Do not resume the original offset-based
full-text builder on a delta-modified file: its source offsets are historical.

Supported now: add/change decisions, metadata-only changes, preview refresh and
compressed excerpts. Not supported yet: explicit deletions, source change-feed
discovery, crash/power-loss fault injection, or production-scale delta timings.
No real corpus delta has been applied by this implementation step.
