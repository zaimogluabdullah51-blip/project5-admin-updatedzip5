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

Hugging Face hosts the raw dataset, but its live search endpoint may return `ResponseNotReady` for large queries. For reliable search, index legal citations into Supabase and let the app read from that local index.

Required environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` for read-only lookup, or `SUPABASE_SERVICE_ROLE_KEY` for read/write indexing

Indexer command:
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

## Data model
- `cases` table: case metadata
- `people` table: profile details
- `case_people` table: links people to cases

Sample data is seeded on first run. Edit or replace it in `db.js`.
