# Release preparation review

Date: 2026-09-28. Scope: local search UI/API, parser regression coverage,
offline index generation/synchronization, installation and recovery tooling.
This is a focused release-preparation review, not a complete security audit.

## Findings fixed

- Pending/failed main indexes could still be queried directly through the new
  search endpoint even when the options UI reported unavailable. Both options
  and search now require main status `ready`; search returns 503 otherwise.
  The real-data API harness verifies pending rejection and subsequent recovery.
- The result date was escaped as text but interpolated into an HTML attribute;
  quotes could break the datetime attribute. Attribute escaping is now explicit
  and a malicious-date/excerpt regression test covers the output.

## Verification

- `node --test scripts/*.test.mjs`: 56 passed.
- `python3 -m unittest discover -s scripts -p 'test_*.py'`: 12 passed.
- `npm run build`: passed; Vite only transforms one module, so this alone is
  not comprehensive coverage of the static TCK frontend.
- Actual isolated API test: 12 real decision copies plus one synthetic added
  ID; full-text/snippets, court/date, empty queue replay and readiness checks
  passed. Report: `data/legal-index-e2e-release-review/report.json`.
- Focused credential-pattern scan of scripts/search code found no token matches;
  this does not guarantee the absence of all possible secrets.

## Commit boundary

Stage explicit code/test/documentation paths only. Keep `data/cases.db`, all
SQLite artifacts, compressed releases, backups and test data OUT of the commit.
Do not use the existing `push:main` npm script: it runs `git add .` and can stage
the already-tracked case database despite ignore rules.
Leave older analysis utilities/reports and the by-ID exporter changes unstaged;
they are not necessary for this serving/maintenance release. Do not revert them.

No commit, push, artifact upload or deployment is performed in this step.
Staged code depends on the added helper modules/tests; commit the reviewed set
together rather than only server.js.

## Remaining release gates

- Target host, storage capacity, protected authentication settings and HTTPS
  still need provisioning/verification; local timings are not host guarantees.
- Apply/review production metadata audit separately; do not imply parser
  agreement is independent accuracy or rewrite the corpus without review.
- Incremental explicit deletions and change-feed discovery are not implemented.
- Offline delta crash/power-loss fault injection and scale testing remain.
- Preinstalled startup, rollback and live smoke tests on the chosen host remain.
- Check the staged diff once more before creating a commit; do not combine
  unrelated unstaged work or private data with this release.
