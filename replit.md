# CourtCase Clarity

## Overview

CourtCase Clarity is a court case intelligence web application that provides case tracking, profile management, and an interactive connection map for visualizing relationships between people, cases, and evidence. The UI is primarily in Turkish. Users can browse cases from a landing page, drill into a visual network map (powered by vis-network), and view detailed profile cards. An admin dashboard allows authenticated users to create cases, add people, and link them together.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Static HTML/CSS/JS** served from the `public/` directory. No frontend framework (React, Vue, etc.) is used — it's vanilla JavaScript with direct DOM manipulation.
- **Three main views:**
  1. **Home page** (`public/index.html`) — case selection grid with search/filter
  2. **Map view** (`public/map.html`) — interactive network graph using [vis-network](https://visjs.github.io/vis-network/) to visualize case relationships
  3. **Admin panel** (`public/admin/`) — login page and dashboard for CRUD operations on cases and people
- **Styling** uses custom CSS with CSS variables for a dark theme. Fonts loaded from Google Fonts (Libre Baskerville, Inter, JetBrains Mono, Fraunces, Space Grotesk).
- **Build tool:** Vite is configured for dev server and preview, but there's no build step transforming the frontend — it's essentially a static file server with HMR in dev mode.

### Backend
- **Express.js** (`server.js`) serves as the API server with JSON endpoints under `/api/`.
- **Authentication:** Cookie-based admin auth using HMAC-signed tokens. Login validates against `ADMIN_USER` and `ADMIN_PASSWORD` environment variables (defaults: `admin` / `admin123`). The token is signed with `AUTH_SECRET`.
- **API endpoints** handle CRUD for cases, people, and case-person links. The frontend fetches data via `fetch()` calls to these endpoints.

### Important Architectural Note
The current `package.json` scripts use Vite for both dev and production (`vite preview`), but the Express server in `server.js` is a separate process. **These two servers need to be coordinated** — either Vite proxies API requests to Express, or the app needs to be restructured so Express serves both the API and static files. Currently, the Vite config (`vite.config.js`) does not include a proxy configuration for `/api` routes, which means the app likely needs Express running alongside Vite, or the start script should run `server.js` directly (using Express to serve static files) rather than `vite preview`.

When making changes, prefer running Express as the primary server (`node server.js`) and having it serve static files from `public/`. If Vite is needed for development, add a proxy configuration in `vite.config.js` to forward `/api` requests to the Express server.

### Data Layer
- **SQLite** via the `sqlite3` npm package, with the database file stored at `data/cases.db`.
- **Database helper functions** in `db.js` wrap SQLite operations in Promises (`run`, `get`, `all`).
- **Schema** (three tables):
  - `cases` — id (TEXT PK), title, summary, incident, dossier, date, status, plus additional fields (case_number, court_name, judge, prosecutor, etc.)
  - `people` — profile details including name, role, charges, evidence, photo URL, etc.
  - `case_people` — junction table linking people to cases (many-to-many)
- **Sample data** is seeded on first run via the `init()` function in `db.js`.
- The `data/` directory is created automatically if it doesn't exist.

### File Structure
```
├── server.js          # Express API server
├── db.js              # SQLite database layer
├── vite.config.js     # Vite configuration
├── package.json       # Dependencies and scripts
├── index.html         # Root HTML (Vite entry point, duplicates public/index.html)
├── public/
│   ├── index.html     # Home page
│   ├── app.js         # Home page logic
│   ├── styles.css     # Global styles
│   ├── map.html       # Network map view
│   ├── map.js         # Map logic (vis-network)
│   ├── map.css        # Map styles
│   └── admin/
│       ├── index.html # Admin dashboard
│       ├── admin.js   # Admin logic
│       ├── admin.css  # Admin styles
│       ├── login.html # Login page
│       └── login.js   # Login logic
```

## External Dependencies

- **Express v4** — HTTP server and API routing
- **sqlite3 v5** — SQLite database driver (native addon, requires node-gyp build)
- **nanoid v5** — Generates unique IDs for database records
- **Vite v7** — Dev server and build tool (dev dependency)
- **vis-network** — Loaded via CDN (`unpkg.com`) for the interactive network graph visualization
- **Google Fonts** — Loaded via CDN for typography (Libre Baskerville, Inter, JetBrains Mono, Fraunces, Space Grotesk)
- No external database service — SQLite stores everything locally in `data/cases.db`
- No third-party auth service — custom cookie-based authentication

## Recent Changes

### 2026-02-07
- Added "Dava Bilgileri" (Case Info) tab to admin panel sidebar — displays read-only case metadata (Mahkeme, Savcı, Hakim, Heyet, Tarih, Durum) that cannot be changed after creation
- Fixed main page case cards to properly show separate Hakim and Heyet fields, added Durum row
- Fixed missing `run` import in server.js for delete endpoints
- Admin panel uses localStorage with camelCase field names; server/DB uses snake_case — these are separate data models