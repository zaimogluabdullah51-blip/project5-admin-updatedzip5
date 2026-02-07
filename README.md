# CourtCase Clarity

Production-ready starter for a court case intelligence site with profile cards and a live connection map.

## What you get
- Case docket with filters and search
- Profile cards showing charges, claims, and evidence
- Profile photos with a default avatar fallback
- Connection map for shared cases, incidents, and dossiers
- Simple data entry for new cases and people
- SQLite storage (ready for production hosting)

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
- Password: `admin123`

Set these environment variables in Replit for production:
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `AUTH_SECRET` (use a long random string)

## Data model
- `cases` table: case metadata
- `people` table: profile details
- `case_people` table: links people to cases

Sample data is seeded on first run. Edit or replace it in `db.js`.
