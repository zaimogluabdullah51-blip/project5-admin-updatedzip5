# Local search concurrency check

Date: 2026-09-26. Local server, production SQLite and complete full-text SQLite.
Thirty HTTP requests per run: five search cases, twice each, at concurrency 1, 2 and 4.
Cases cover court/date, untagged decisions, citations, rare text and common text.

Baseline: `data/legal-index-load-repeat.json`. All 30 requests passed, but at
concurrency 4 non-text requests took up to 4769 ms behind full-text queries.
The earlier `legal-index-load-baseline.json` had an anomalous 900-second timer
delay and is not used as an SQL performance measurement.

After isolation: `data/legal-index-load-isolated.json`. All 30 requests passed.
At concurrency 4 non-text requests took 1-4 ms. Full-text requests took up to
7549 ms including queue time. Heavy searches are serialized on one dedicated
read-only connection; waiting searches do not enter SQLite's worker pool.
This protects metadata searches, not the latency of concurrent text searches.
SQL ranking, filters and corpus files were not changed.

Five reader/readiness regression tests pass, including write rejection on both
databases, missing attachment protection, retry and concurrent initialization.

These small, cache-sensitive local runs are not a hosting capacity guarantee.
Remaining: target-host CPU/RAM measurements and sustained load. Hosting and
deployment remain deferred; these changes have not been published.

## Queue and cancellation, 2026-09-27

The full-text reader accepts one running query and at most eight waiting queries.
An extra request receives HTTP 503 and Retry-After: 5, with a readable UI error.
The reader deadline is 30 seconds including queue time (not a deadline for the
entire HTTP response). Expiry returns HTTP 504. A disconnected HTTP client removes
its queued query or interrupts its running SQLite query. The next job starts only
after the interrupted query's callback, so interruption cannot spill into it.
Court/date and citation-only queries do not enter this full-text queue.

Seven reader/readiness tests pass, including overload, queued cancellation,
active interruption, timeout and successful reads after interruption.
A local HTTP burst of 12 common-text requests produced three 503 responses;
the other nine were aborted after two seconds. A subsequent rare-text request
returned 20 results in 603 ms. No corpus files were modified.

Normal-load repeat: `data/legal-index-load-bounded.json`, 30/30 successful.
At concurrency four, non-text reads took 1-6 ms; text reads reached 9363 ms
including queue time. This remains a small local measurement, not a service SLA.
