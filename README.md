# TripMate — local travel planner

A compact full stack travel planner for local Windows 11 development. It uses HTML, CSS and vanilla JavaScript in the browser, Node.js and Express on the server, Supabase Auth/PostgreSQL when configured, Leaflet and OpenStreetMap tiles, and a clearly labeled demo hotel booking provider.

## Run locally on Windows 11

Open PowerShell in this folder (or open this folder in VS Code and choose **Terminal → New Terminal**), then run:

```powershell
node --version
npm --version
Copy-Item .env.example .env
npm install
npm start
```

Open **http://localhost:5000** in your browser. The app and API run locally. Internet access is used for Leaflet, map tiles, fonts, destination photos, location search and live weather. Supabase and AI integrations need credentials; the built-in weather integration does not need a key.

### Local demo sign in

Use any email and a password of at least 6 characters. Demo accounts and roles are in memory until the server restarts. Demo itineraries, expenses and bookings are saved to `data/demo.json`.

Admin demo credentials:

- Email: `admin@tripmate.local`
- Password: `ChangeThisAdminPassword123!`

Change `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env` for a private local setup. Demo authentication is for local evaluation only; it is not suitable for internet exposure.

To stop the server, press **Ctrl+C** in PowerShell. For automatic restart while editing, use `npm run dev`.

## Optional Supabase Auth setup

1. Create a Supabase project and open **Project Settings → API**.
2. Copy the project URL into `SUPABASE_URL` and the public anon key into `SUPABASE_ANON_KEY` in `.env`.
3. Set `AUTH_MODE=supabase` in `.env`.
4. Open **SQL Editor** in Supabase and run `database/schema.sql`.
5. Restart the local app with `npm start`. Register and sign in with the Supabase account.
6. To grant the admin role, find the account UUID in **Authentication → Users** and run the commented role update at the bottom of `database/schema.sql` with that UUID.

The Express server verifies each Supabase access token with Supabase Auth `getUser` before protected API access. The secret/service-role key is needed for role lookup and database-backed app data; keep it in `.env` only. It bypasses RLS, so Express checks each signed-in user's ID and scopes user record queries on the server. RLS is enabled for direct authenticated access; users can update only their profile display name, not their role. The included `schema.sql` is the PostgreSQL schema and seed data for a connected Supabase project. In `AUTH_MODE=supabase`, itinerary, expense, booking, discovery, and admin catalog routes use Supabase when `SUPABASE_SERVICE_ROLE_KEY` is configured. Without it, Supabase Auth can still work while app records use the local JSON store and the admin console cannot list Supabase accounts or change the database catalog.

## Included features

- Minimal responsive dashboard with destination cards and trip summary.
- Destination, hotel and attraction sample data for Jaipur, Kyoto and Lisbon.
- Location search backed by Geoapify geocoding and place search (OpenStreetMap-derived data): search a city to find mapped attractions and lodging, see them on the Leaflet map, and get simple itinerary suggestions. Search happens only after the user submits; results are cached for 30 minutes. Live results are listings, not live hotel inventory or rates.
- Leaflet maps with OpenStreetMap tiles and destination markers.
- Itinerary creation, expense tracking and demo booking flow with date/guest validation.
- A provider boundary in `src/providers/bookings.js` for a future contracted hotel API. Current bookings are demonstrations; no live inventory, payment or external reservation is made.
- Authenticated AI assistant API at `/api/assistant`; the provider key stays on the server. Without a key, it displays setup guidance.
- Live current weather for the featured destinations via Open-Meteo, including city lookup, short caching, and source attribution. No weather API key is required.
- Separate user workspace (`/user`) and administrator console (`/admin/`). Sign-in redirects by verified role. Admin APIs manage destination, hotel and attraction listings, account roles, registered accounts and demo bookings.
- Basic input validation, JSON size limit, and security response headers.

## Environment settings

Copy `.env.example` to `.env`. For live location search, create a free Geoapify project, copy its API key to `GEOAPIFY_API_KEY`, and restart the server. The Geoapify key remains server-side; the provider currently documents a free quota of 3,000 credits per day. Without a key, Jaipur, Kyoto and Lisbon use the included sample listings; other locations show setup guidance. Geoapify's place data is based on mapped records, so coverage varies by area and may omit or have stale listings.

`AI_API_KEY` and `AI_MODEL` enable the OpenAI-compatible chat completion endpoint (`AI_PROVIDER_URL` can be changed). Create a key in your OpenAI API Platform project, then put it only in the server-side `.env` as `AI_API_KEY=...`. API use has separate billing from ChatGPT subscriptions; check the API billing page before enabling paid usage. Save `.env`, stop the server with **Ctrl+C**, and run `npm start` again. Keep the key private and never paste it into `public/` or commit `.env`. The assistant responds with setup guidance until a valid key is configured. Open-Meteo supplies the live current weather route without a key; its [forecast API](https://open-meteo.com/en/docs) supports current weather fields and its [geocoding API](https://open-meteo.com/en/docs/geocoding-api) resolves city names. `WEATHER_PROVIDER_URL` and `WEATHER_API_KEY` remain blank placeholders; the built-in Open-Meteo integration does not use them.

## Project structure

```text
TripMate/
├── database/schema.sql
├── public/
│   ├── admin/            # separate administrator console
│   ├── css/styles.css
│   ├── js/app.js
│   └── index.html
├── src/
│   ├── providers/bookings.js
│   ├── auth.js
│   └── store.js
├── data/                 # created at runtime; ignored by Git
├── .env.example
├── package.json
└── server.js
```

## Check and limitations

Run `npm run check` to check JavaScript syntax. `npm install` needs network access to download Express, dotenv and the Supabase client. External images, fonts, maps, live location search and live weather also need network access. If offline, the dashboard and demo data still run but those remote features will be unavailable. This is a local learning/demo project, not a production security review. Password reset, Google OAuth, payments, live hotel availability, and booking cancellation are not implemented.
