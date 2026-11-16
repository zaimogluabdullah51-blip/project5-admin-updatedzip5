# Structured search release

This is the current release plan. Earlier SQLite/Oracle/full-keyword rollout
checklists are historical and are not prerequisites for this release.

## Scope

Court, date range, statute/article and exact case/decision number searches over
the existing Supabase catalog. Keyword ingestion is deferred, not restarted.
Keep existing pilot vectors and source artifacts. No database or billing changes.

## Verified 2026-11-16

- [x] Public live options report 11,045,085 catalog records; each of five sources
  has matching expected/imported/citation-complete counts.
- [x] Public live court/date filters, disjoint pagination, exact numbers, TCK 125,
  empty results, invalid dates and disabled keywords passed bounded GET checks.
  Observed searches took 378-1,013 ms; not a load or cold-start guarantee.
- [x] Local candidate shows a disabled keyword tab with "Henüz kullanılamıyor"
  or "Not available yet" based on the page language, preserves browser Find,
  skips unavailable keyboard tabs and stops pagination at the backend offset cap.
- [x] Local candidate rejects keyword API requests and legacy deep-search job
  creation by default, before calling a backend or writing a job.
- [x] 24 focused tests and desktop/mobile browser workflows passed. Browser tests
  use fixtures, while the separate live smoke checks use actual public responses.
- [x] Production build and diff whitespace checks pass.

## Remaining release gates

- [ ] Decision text: catalog results have source/document IDs but empty previews.
  The existing detail prototype uses local source files, not a deployable Render
  detail service. Implement bounded source retrieval with verified identity,
  timeout and explicit unavailable states. Do not advertise full text yet.
- [ ] Validate real decision retrieval across all five sources and test the
  complete deployed search-to-detail journey.
- [ ] Verify production admin credentials/auth secret are not code defaults;
  verify previously disclosed database/API credentials have been rotated.
- [ ] Bounded production concurrency test and cold-start behavior.
- [ ] Review and commit ONLY release files, deploy to Render, then rerun smoke
  checks. No commit, push or deployment was performed in this preparation step.

## Configuration and rollback

- Keep `LEGAL_SEARCH_BACKEND=supabase-v2` on Render.
- Leave `LEGAL_KEYWORD_SEARCH_ENABLED` absent or `false`.
- Keep `DEEP_SEARCH_WORKER_ENABLED` absent or `false`.
- Keyword opt-in is reserved for a later validated release; it is not permission
  to start an import or enable an incomplete corpus.
- Roll back the Render application deployment if release smoke checks fail.
  This candidate has no database migrations to reverse.

## Checks and preview

`node scripts/smoke-structured-search.mjs https://www.davatakibi.com`

`node --test scripts/structured-search-release.test.mjs scripts/search-feedback.test.mjs scripts/legal-search-v2.test.mjs scripts/local-search-output.test.mjs scripts/local-search-readiness.test.mjs`

`node --test scripts/structured-search-ui.test.mjs` (requires Playwright;
`PLAYWRIGHT_MODULE_PATH` and `CHROME_EXECUTABLE` may point to installed tooling).

`node scripts/preview-structured-search.mjs` serves the local candidate on
127.0.0.1:5055/tck.html and proxies only allowlisted public GET endpoints.
It does not open or modify local/Supabase databases and is not a production server.
