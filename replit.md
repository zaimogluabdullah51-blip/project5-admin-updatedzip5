# CourtCase Clarity

## Overview

CourtCase Clarity is a web application designed to provide intelligence on court cases, primarily targeting Turkish users. It offers features such as case tracking, detailed profile management for individuals involved, and an interactive network map to visualize the complex relationships between people, cases, and evidence. The platform aims to serve as a comprehensive tool for analyzing judicial proceedings, making complex case data more accessible and understandable through its visual and data management capabilities. Its key capabilities include browsing cases, dynamic relationship mapping, and an administrative interface for data entry and management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built using static HTML, CSS, and vanilla JavaScript, leveraging direct DOM manipulation without any modern frameworks. It features three main views: a home page for case selection, a map view utilizing `vis-network` for relationship visualization, and an admin panel for authenticated users to manage data. The styling incorporates a dark theme with CSS variables and uses Google Fonts for typography. Vite is configured for development, but the application is served primarily by an Express server, which is intended to also serve static files.

### Backend
The backend is an Express.js server providing a RESTful API for data operations. It implements cookie-based authentication for administrative users using HMAC-signed tokens. The API supports CRUD operations for cases, people, and their interconnections.

### Data Layer
The application uses SQLite for data persistence, with the database file located at `data/cases.db`. Database interactions are managed through helper functions in `db.js`. The schema includes tables for `cases`, `people`, `case_people` (junction table), `actions` (detailing actions within cases for individuals), `officials`, `case_officials`, and `tck_definitions` (Turkish Penal Code article definitions). Sample data is seeded upon the first run.

### File Structure
The project is structured with `server.js` and `db.js` at the root, alongside `vite.config.js` and `package.json`. The `public/` directory contains all frontend assets, including `index.html`, `app.js`, `styles.css`, `map.html`, `map.js`, `map.css`, `tck.html`, `tck.js`, `tck.css`, and an `admin/` subdirectory with its own HTML, JS, and CSS files for the administrative interface.

## External Dependencies

- **Express v4**: For the HTTP server and API routing.
- **sqlite3 v5**: The SQLite database driver.
- **nanoid v5**: Used for generating unique IDs.
- **Vite v7**: Utilized as a development server and build tool.
- **vis-network**: Integrated via CDN for interactive network graph visualizations.
- **Google Fonts**: Loaded via CDN for custom typography.
- **No external database service**: SQLite is used for local data storage.
- **No third-party authentication service**: A custom cookie-based authentication system is implemented.

## Recent Changes

### 2026-02-07
- Admin: Autocomplete on profile name input — suggests existing people from DB, selecting loads their profile for editing/adding actions
- Admin: Autocomplete on TCK article input — suggests from tck_definitions table and existing profiles' tck_articles
- Admin: Autocomplete on Eylem/Action number input — suggests from all existing action_numbers across profiles
- Admin: Autocomplete on accusation card TCK/Eylem chip inputs — same suggestions within each card
- Admin: Autocomplete on mentioned names input — suggests existing people, auto-sets role dropdown to match
- Admin: Reusable setupAutocomplete() utility with keyboard navigation (ArrowUp/Down/Enter/Escape), CSS dropdown styling
- Map: Octopus layout — ghost nodes (mentioned names) radiate around their parent person node in circular distribution
- Map: Both TR and EN versions updated with octopus layout for ghost nodes
- Admin: Mentioned names now have "olayla dahili" (context/involvement) text field — describes how the person is involved (e.g., "para transferi yapılan kişi")
- Map: Ghost node modal enriched — shows all actions where the person is mentioned, including parent person name, eylem number, and context description
- Map: Person modal mentioned names now show context alongside name and role
- Data flow: context field stored in mentioned_names JSON (no schema change needed), flows admin → API → map modal automatically
- Admin: Parser enhanced — now recognizes structured emoji format (📂 SANIK KARTI, 👤 SANIK KİMLİĞİ, 🚨 SUÇLAMA, 👥 GEÇEN İSİMLER)
- Admin: parseSanikKimligi extracts name, organization (from "bünyesinde"), title (from "olarak görev"), multiple roles ([Sanık][Tutuklu]), sentence demand, eylem numbers, TCK codes
- Admin: parseMentionedNames extracts name [Role]: context from 👥 section, auto-maps Turkish roles to English, stops at emoji boundaries
- Admin: Multiple roles preserved through full chain (parser → form → API → map)
- Admin: Parser now extracts ⚖️ SAVCILIK SUÇLAMALARI section → fills "Savcılık Suçlamaları" textarea in form
- Admin: Parser extracts 🖼️ FOTOĞRAF link → fills photo URL field
- Admin: Eylem range format (e.g., "Eylem 39-43") now expanded to individual numbers [39,40,41,42,43]
- Admin: 📂 line parsing works with or without [SANIK KARTI] prefix
- Admin: parseSanikKimligi boundary improved — stops at ⚖️, 🖼️ emojis to prevent content bleed
- Map: Dynamic lane heights — each eylem band auto-sizes based on profile count (rows × rowHeight), cumulative Y offsets prevent overflow
- Admin: Case-filtered autocomplete — profile name and mentioned names inputs prioritize people already in the active case with green "Bu dava" tag
- Map: Person modal header shows TCK article tags (red) and eylem number tags (blue) — both TR and EN versions
- Map: Tag CSS classes added (.tag.small, .tag.eylem-tag, .person-tags)

### 2026-02-08
- Admin: EYLEM regex in accusation parser fixed — stops at TCK: boundary to prevent TCK article numbers being captured as eylem numbers
- Map: Person modal now shows "Bahsedildiği Eylemler" section — lists all actions where this person is mentioned by other profiles, with parent person name, eylem number, and context
- Map: EN version shows "Mentioned In Actions" with "Referenced By" and "Involvement" labels
- Map: mentioned-in-card CSS styling with orange accent border to distinguish from own actions