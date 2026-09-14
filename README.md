# CourtCase Clarity

Production-ready starter for a court case intelligence site with profile cards and a live connection map.

## What you get
- Case docket with filters and search
- Profile cards showing charges, claims, and evidence
- Profile photos with a default avatar fallback
- Connection map for shared cases, incidents, and dossiers
- Simple data entry for new cases and people
- SQLite storage for case/admin data
- Optional Supabase legal-citation index for court-decision search

## Run locally
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy on Replit
1. Create a new Replit project from this folder.
2. In the Replit shell, run:
   ```bash
   npm install
   npm run start
   ```
3. Replit will expose the web preview URL automatically.

## Admin login
The admin dashboard is at `/admin`. By default:
- Username: `admin`
- Password: `admin135`

Set these environment variables in Render/Replit for production:
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `AUTH_SECRET` (use a long random string)

## Legal citation index

Supabase should stay small and transactional. The large court-decision corpus can be stored as a local SQLite artifact instead of pushing millions of rows into Supabase.

Build a local legal index from cached Hugging Face parquet shards:
```bash
HF_TOKEN=... \
HF_PARQUET_CACHE_DIR=/private/tmp/hf-parquet-cache \
npm run hf:cache

HF_PARQUET_CACHE_DIR=/private/tmp/hf-parquet-cache \
LEGAL_INDEX_DB_PATH=data/legal-index.sqlite \
HF_INDEX_LIMIT=1000000 \
npm run index:local
```

`npm start` runs `npm run index:prepare` first. In production, upload `legal-index.sqlite` or `legal-index.sqlite.gz` to object storage and set:
- `LEGAL_INDEX_DB_URL`
- `LEGAL_INDEX_DB_PATH` (optional, defaults to `data/legal-index.sqlite`)
- `LEGAL_INDEX_DB_SHA256` (optional but recommended)
- `LEGAL_INDEX_DB_GZIP=true` if the URL does not end with `.gz`
- `LEGAL_INDEX_REQUIRED=true` if the app should fail startup when the artifact is missing

When `data/legal-index.sqlite` exists, `/api/legal-references` reads from it before Supabase. Set `LEGAL_INDEX_SUPABASE_FALLBACK=true` to also query Supabase after local matches.

Legacy Supabase indexer command:
```bash
INDEXER_BASE_URL=https://davatakibi.onrender.com \
INDEXER_ADMIN_USER=admin \
INDEXER_ADMIN_PASSWORD=admin135 \
INDEXER_BATCHES=20 \
npm run index:hf
```

Targeted indexing example:
```bash
INDEXER_BASE_URL=https://davatakibi.onrender.com \
INDEXER_LEGAL_REF="TCK 204" \
npm run index:hf
```

Dry-run a batch without writing to Supabase:
```bash
INDEXER_BASE_URL=https://davatakibi.onrender.com \
INDEXER_LEGAL_REF="TCK 32" \
INDEXER_DRY_RUN=true \
npm run index:hf
```

## Data model
- `cases` table: case metadata
- `people` table: profile details
- `case_people` table: links people to cases

Sample data is seeded on first run. Edit or replace it in `db.js`.
