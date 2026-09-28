# Local index release

Scope: existing Yargitay snapshot, 9,820,145 decisions. Newer data and other
courts are subsequent incremental releases, not prerequisites for this snapshot.

- [x] Build full-text index and compressed result excerpts.
- [x] Establish metadata audit sidecar with parser/text hashes and HF originals.
- [x] Review metadata conflicts across a corpus-wide random sample (5,000).
- [x] Integrate conservative metadata policy into the index builder; verify on a separate DB.
- [ ] Apply metadata audit to the production copy (existing source DB remains unchanged).
- [x] Build a compact production copy and verify counts/search equivalence.
- [x] Optimize broad court/citation-state filters; tested queries now below 8 ms locally.
- [x] Package both databases with checksums and measure archive sizes (optimized release: 13.03 GB total).
- [x] Assess hosting against measured size; Oracle Always Free is the zero-cost candidate.
- [ ] Confirm eligible account/region capacity before provisioning a host.
- [x] Add tested two-artifact installer for use before web-service startup.
- [ ] Verify preinstalled startup and readiness on the target host.
- [x] Verify desktop/mobile UI, combined filters, paging, empty results, date validation, and stale-request handling locally.
- [x] Verify missing-index state, local server outage, retry and recovery without page reload.
- [x] Isolate full-text reads; bound their queue and verify cancellation/overload recovery locally.
- [ ] Verify target-host concurrency and resource limits.
- [ ] Commit scoped code changes, publish artifacts, deploy, and smoke-test.
- [x] Document backup, rollback, and incremental-update prerequisites; test snapshot restore.
- [ ] Implement and test safe incremental updates (existing builders are not sufficient).
- [x] Replace per-decision citations transactionally; test replay, zero transitions and rollback on insertion failure.
- [x] Bind main-builder checkpoints to source/code/target; skip unchanged input rows with transactional fingerprints.
- [x] Add offline bounded add/update synchronization for preview, full-text postings and compressed excerpts; test rollback and replay.
- [x] Validate a 12-real-decision isolated delta copy through the actual API; fix and regression-test chunk-count metadata.

Metadata policy: preserve original values, retain parser evidence and version,
propose missing-field fills only for high-confidence unflagged results, and
review conflicting values before changing search metadata. Nonempty fields are
not evidence of accuracy. HF agreement is not an independent accuracy measure.

Source databases must remain intact while building the production copy.
