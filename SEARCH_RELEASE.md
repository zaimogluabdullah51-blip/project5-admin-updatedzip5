# Structured search release

## Scope

Supabase v2 serves indexed court, date, case number, decision number and statute
reference filters. The validated catalog contains 11,045,085 records. Full-corpus
keyword search remains unavailable and must not be advertised as complete.
Reference extraction is automated, not manual legal verification.

## Render configuration

Deploy the release code together with these server-only environment values:

- `LEGAL_SEARCH_BACKEND=supabase-v2`
- `SUPABASE_URL=https://crgqjwlwkqzskjzectmk.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: current server secret, never committed or shared
- `DEEP_SEARCH_WORKER_ENABLED=false`

Rotate any chat-shared secret and update Render before release. Preserve unrelated
environment values. Do not enable legacy corpus imports or expose `legal_search`
through the Data API. Data API must be enabled with public search RPCs callable
only by service_role. Keep the Free plan; this release needs no persistent disk
or local full-text download.

## Verification

Run after deployment:

```sh
node scripts/check-search-release.mjs https://www.davatakibi.com
```

This checks catalog coverage, citation coverage, 2026 date results, combined exact
filters and TCK 86 results through the application HTTP routes. It reports keyword
readiness separately. Also check the browser search page and cancellation/error
states. A successful database query alone is not a successful deployment.

## Rollback

Prefer retaining this code and correcting configuration if possible. Reverting
to the old backend restores its limited corpus, not equivalent search coverage.
If rolling back code to `1b92dcb`, remove `LEGAL_SEARCH_BACKEND=supabase-v2`
alongside that rollback and verify the old configuration and storage requirements.
Do not remove or truncate the new Supabase catalog as part of application rollback.
