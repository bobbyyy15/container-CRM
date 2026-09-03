# Deployment — Read This Before Shipping to Vercel

Updated 2026-09-04. Both halves can go on Vercel.

**This changed on 2026-09-04.** The app previously ran its own Socket.IO server attached to
the Express HTTP server, which required an always-on host and ruled Vercel out for the API.
Live updates now run on **Supabase Realtime** (`frontend/src/lib/realtime.ts` +
`supabase/migrations/..._039_realtime_publication.sql`), so the backend holds no long-lived
connections and is fully stateless. There is no longer a websocket to host.

## 1. Hosting

Two Vercel projects from the same repo (both fit the free Hobby tier):

| Project | Root directory | Notes |
|---|---|---|
| Frontend | `frontend` | Static Vite build; `frontend/vercel.json` pins the settings |
| Backend | `backend` | Serverless functions; needs an `api/` entry point exporting the Express `app` |

Set the frontend's `VITE_API_BASE_URL` to the backend project's URL + `/api/v1`, and the
backend's `CORS_ORIGINS` to the frontend project's URL. (A single combined project is possible
via rewrites but is fiddlier with this repo's `frontend/` + `backend/` layout.)

**The one real constraint that remains:** Vercel functions have a request timeout — **10s on
the free Hobby tier, 60s on Pro**. The bulk Excel/CSV import endpoints
(`backend/src/routes/import.routes.ts`, `inventory.routes.ts` `/bulk`) process a whole file
in one request and could exceed that on a large upload. If that becomes a problem, either
chunk the import client-side or move just the backend to an always-on host (Render/Fly free
tiers work, but they sleep after ~15 min idle and cold-start in ~50s).

**Still viable alternative:** frontend on Vercel, backend on an always-on host. Nothing about
the code prevents this — `npm run build && npm start` works (see §2). It's just no longer
*required*.

## 2. Backend is now ready for an always-on host

Previously there was no way to run a production build — only `npm run dev` (`tsx watch`,
not meant for production). Fixed:

```
npm run build   # tsc -> backend/dist
npm start       # node dist/index.js
```

Verified locally: build succeeds, `npm start` serves `/api/health` correctly.

## 3. Every environment variable the backend needs (`backend/src/config/env.ts`)

| Variable | Required? | Local default | Must be set for production |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Set to `production` |
| `PORT` | No | `3001` | Whatever the host assigns/expects |
| `CORS_ORIGINS` | No | `http://localhost:8443` | **Yes** — comma-separated list including the real deployed frontend origin. Wrong value = every request blocked by CORS with no obvious error in the browser network tab beyond "CORS error." |
| `SUPABASE_URL` | **Yes** | — | Same value as local (same project) unless you're pointing at a different Supabase project for prod |
| `SUPABASE_PUBLISHABLE_KEY` | No | — | Same as above |
| `SUPABASE_SECRET_KEY` | **Yes** | — | Same as above. **Never expose this to the frontend or commit it** — it bypasses RLS |
| `DATABASE_URL` | No | — | Only used by local dev tooling / migrations, not required at runtime |
| `GOOGLE_CLIENT_ID` | No* | — | Required if Gmail outreach or the Google Sheets export is used |
| `GOOGLE_CLIENT_SECRET` | No* | — | Same as above |
| `GOOGLE_REDIRECT_URI` | No | `http://localhost:3001/api/v1/auth/google/callback` | **Must be changed to the production backend URL**, and that exact URL must also be added as an authorized redirect URI in the Google Cloud OAuth client config, or every Google connection attempt fails |
| `FRONTEND_URL` | No | `http://localhost:8443` | **Must be changed to the production frontend URL** — used to redirect back after Google OAuth completes |

\* Google OAuth is optional at the env-var level (the app boots without it), but Gmail
outreach and Google Sheets export throw a clear error at call time if unset — see
`getGoogleOAuthConfig()` in `backend/src/config/env.ts`.

**The frontend** needs, at build time (`frontend/vite.config.ts` reads these from the backend's
`.env` via `loadEnv`, or set them directly as Vercel project env vars for the frontend build):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Same Supabase project |
| `SUPABASE_PUBLISHABLE_KEY` | Public/anon key — safe to expose |
| `VITE_API_BASE_URL` | `/api/v1` if same-origin (Option A above); the full backend URL if separate (Option B) |

Realtime needs no extra configuration: the client connects straight to Supabase over its own
websocket using `SUPABASE_URL` and the user's session token, so there is no `/socket.io` route
to proxy and no sticky-session or multi-instance adapter concern. Scaling the backend to
several instances is now safe.

## 4. Everyone reconnects Google once

The OAuth scope list changed today (`drive.file` was added for the Sheets export — see
`backend/src/services/google-oauth.service.ts`). Every account that connected Google before
that change has a token scoped only to `gmail.send` and will get a clear "reconnect to grant
access" error the first time they try to export to Google Sheets. Not a deploy blocker, just
expected — mention it so it doesn't read as a bug during first testing.

## 5. Before inviting employees to test

- [ ] Decide and implement Option A or B above
- [ ] Set every "must be set for production" env var in the table
- [ ] Add the production `GOOGLE_REDIRECT_URI` to the Google Cloud OAuth client's authorized
      redirect URIs (separate from setting the env var — both are required)
- [ ] Run the migrations against whichever Supabase project production points at
      (`npx supabase db push --linked` — confirm `npx supabase migration list --linked` shows
      no pending migrations first)
- [ ] Click through the app once end-to-end in the deployed environment — nothing changed
      today has been seen in a real browser yet, only typechecked/built
- [ ] Set real values on the Daily Targets screen — they're currently all zero, so dashboards
      and the Monthly Report will look empty otherwise
- [ ] Test each export (PDF, Excel, Google Sheets) once for real
