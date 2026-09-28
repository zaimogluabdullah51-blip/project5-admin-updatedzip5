# Install a prepared release

The current package directory is data/legal-index-release-20260926-optimized.
Transfer its manifest.json and both .sqlite.gz files to the host. Keep the
previous installed release intact until the new release passes live checks.

Run once before starting the web service (paths below are deployment examples):

```sh
python3 scripts/install-legal-release.py /srv/davatakibi/incoming/legal-index-release-20260926-optimized /srv/davatakibi/releases/20260926
```

The installer checks archive and SQLite SHA256 separately, verifies both SQLite
files, compares population counts, and publishes the new directory only after
all checks pass. Failure removes only its newly created staging directory.
It will not overwrite an existing release. Allow about 28 GB free for staging
in addition to the package, existing release, OS and application files.

The output paths.json contains the absolute index paths. Configure the service:

```sh
export LEGAL_INDEX_DB_PATH=/srv/davatakibi/releases/20260926/legal-index-production.sqlite
export LEGAL_FULLTEXT_DB_PATH=/srv/davatakibi/releases/20260926/legal-index-fulltext.sqlite
export PORT=3000
npm run serve
```

Set ADMIN_USER, ADMIN_PASSWORD and AUTH_SECRET using the host's protected
configuration before exposing the app; the repository includes development
defaults. Retain the application's existing data/cases.db and its own backup.
This installer manages only the two search indexes, not the application's
case-management database or authentication configuration.

Use `npm run serve` for a preinstalled release. It starts server.js directly
and does not invoke the old startup download script. The app still initializes
its case database before binding the port; it no longer waits for a multi-GB
index transfer in this workflow. TLS, service management and firewall setup
remain host-specific deployment tasks.

After starting: verify /tck.html, /api/legal-index/search-options, and queries
covering court/date, citations, and full-text snippets. Then switch traffic.
Rollback means restoring the prior two index paths together and restarting the
service. Do not combine a main index from one release with another full-text
index merely because their row counts happen to match.

Tests: `python3 scripts/test_install_legal_release.py` exercises successful
installation, overwrite refusal, corrupt second archive, population mismatch,
and incomplete manifest. Host capacity and actual server installation have
not yet been verified.
