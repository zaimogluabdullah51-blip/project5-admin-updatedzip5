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
- **Schema** (four tables):
  - `cases` — id (TEXT PK), title, summary, incident, dossier, date, status, plus additional fields (case_number, court_name, judge, prosecutor, etc.)
  - `people` — profile details including name, role, charges, evidence, photo URL, etc.
  - `case_people` — junction table linking people to cases (many-to-many)
  - `actions` — id (TEXT PK), case_id, person_id, action_num, title, claim, evidence, defense, tck_codes (JSON array)
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
│   ├── tck.html       # TCK analysis page
│   ├── tck.js         # TCK page logic
│   ├── tck.css        # TCK page styles
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
- Redesigned Profil Ekle section with structured layout:
  - Separate fields: İsim Soyad (editable), Kurum (editable), Ünvan (editable)
  - Savcılık Suçlamaları (editable, was İddianame Özeti)
  - Toplam Talep Edilen Ceza (editable)
  - Suçlanılan Kanun Maddeleri: chip-based input, each TCK code saved separately
  - Suçlanan Eylemler: chip-based input, each action number saved separately (stored as plain numbers, displayed as "Eylem X")
  - Per-accusation cards: Suçlama başlığı, İddia (numbered), Deliller (numbered), Savunma (numbered), Eylem numaraları, TCK maddeleri
- Parser extracts: name, organization (kurum), title (ünvan) from parentheses (comma or dash separated), role keywords, action numbers, sentence demand
- DB: `people` table has organization, title, sentence_demand, action_numbers columns
- `actions` table with sentence_demand column for storing parsed eylemler per person per case
- Each action stores: action_num, title, claim, evidence, defense, tck_codes (JSON), sentence_demand
- POST /api/actions and GET /api/actions endpoints (GET supports filtering by caseId/personId)
- Profile form submit saves person (with organization, title, tck_articles, action_numbers, sentence_demand, charge/summary) + links case + creates action records
- "Ayrıştır" fills form only; "Kaydet" saves to server and localStorage
- İddia/Deliller/Savunma in accusation cards formatted with 1), 2), 3) numbering
- Admin panel uses localStorage with camelCase field names; server/DB uses snake_case
- Map view: Dava Bilgileri panel uses red gradient background (matching site accent #8b1e1e), with close (X) button and reopen toggle
- Map view: Dava özeti shown at top of panel, all info visible without clicking
- Map view: Eylem band boxes colored red (rgba(139, 30, 30, 0.55))
- Map view: Role-based profile border colors: defendant=white, informant=yellow, witness=blue, secretWitness=light white, victim=purple, fugitive=red, detained=gray
- Map view: PUT /api/people/:id endpoint for inline profile editing from map modal
- English map.html (public/en/map.html) synced with Turkish version
- Parser: `extractNamesFromText()` extracts Turkish person names from each accusation block (İddia/Deliller/Savunma text)
- DB: `actions` table has `mentioned_names` column (JSON array of {name, role} objects) for storing names found in each action's text
- Admin: Accusation cards display "Geçen İsimler" with per-name role dropdown (Bilinmiyor, Sanık, İtirafçı, Tanık, Gizli Tanık, Mağdur, Firari, Tutuklu); saved to server with action records
- Map: Mentioned names with role → dashed edges colored by role (defendant=gray, informant=yellow, witness=blue, victim=purple, etc.)
- Map: Ghost nodes created for mentioned names not matching existing profiles — semi-transparent, smaller, role-based border color
- Map: Ghost node click opens simple info card showing name + role + "not registered" message
- Map: Person modal action cards show "Geçen İsimler" with role labels (e.g., "Ahmet Yılmaz (İtirafçı)")
- English map.html (public/en/map.html) synced with ghost modal and script reference fixed to /en/map.js
- Homepage: Removed "Dava Seç" button, updated 3 feature cards (İlişki Haritası, Dava Arşivi, TCK Kümeleri) with accent red styling and clickable links
- Homepage: İlişki Haritası links to #preview-section, Dava Arşivi links to #case-grid, TCK Kümeleri links to /tck.html
- Homepage: Preview map section blurred by default with "Tam sayfa için tıklayınız" overlay on hover
- Homepage: X (Twitter) social media link added to header and footer (@Istanbul_Dava)
- New TCK Analysis page (tck.html): Searchable accordion list of TCK articles with profiles, claims, evidence, defense, sentence demands
- API: GET /api/tck-summary endpoint aggregates TCK articles from actions.tck_codes and people.tck_articles
- TCK page: Each article card expandable, showing official description, per-profile detail boxes (Suçlama, Deliller, Savunma), sentence demand, and "Haritada Gör" link
- TCK page: XSS protection via HTML escaping of all user-provided data
- DB: `tck_definitions` table (code TEXT PK, short_desc TEXT, full_text TEXT) for editable TCK article descriptions
- API: GET /api/tck-definitions (public), PUT/POST/DELETE /api/tck-definitions/:code (admin-only)
- TCK page: Admin login/logout button at top-left, edit (✎) button on each article when admin is logged in
- TCK page: Modal dialog for inline editing of short description and full legal text
- TCK page: "Yasal karşılığı henüz eklenmemiş + Ekle" prompt for articles without definitions (admin only)
- TCK page: Definitions loaded from database instead of hardcoded JS
- Homepage: Mail icon (info@davatakibi.com) added to header top-right with mailto: link
- Homepage: "Siz de belge paylaşın" encouragement section added below case grid with document icon, mailto: link, and copy-to-clipboard button
- Homepage: Footer redesigned with İletişim section (mail address + copy button) and X social link
- Layout: Homepage and TCK page content constrained to max-width 1200px with auto centering for a narrower, more readable layout
- Layout: Admin page unchanged (already has sidebar layout constraining content naturally)