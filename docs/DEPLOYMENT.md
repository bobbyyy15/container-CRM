# Deployment — Read This Before Shipping to Vercel

Written 2026-09-03. The frontend is a static Vite build (Vercel is a natural fit as-is).
The backend is a **long-running Express server** (`app.listen()` in `backend/src/index.ts`) —
Vercel does not run that model directly, so there's a real decision to make before deploying,
not just "push to Vercel and it works."

## 1. Pick a backend hosting model

**Option A — convert the HTTP API to Vercel serverless (realtime requires a separate service)**
- Pro: no CORS to configure — the frontend already calls a relative `/api/v1`
  (`frontend/vite.config.ts` sets `VITE_API_BASE_URL` to `/api/v1` by default), so if both
  live under the same Vercel domain it just works.
- Con: Vercel functions have a request timeout — **10s on the free Hobby tier, 60s on Pro**.
  The bulk Excel/CSV import endpoints (`backend/src/routes/import.routes.ts`,
  `inventory.routes.ts` `/bulk`) process a whole file server-side and could exceed that on a
  large file. Cold starts also add latency to the first request after idle.
- Con: request-only serverless functions cannot retain this app's Socket.IO connections. This
  option therefore needs a separate long-running Socket.IO service (and routing for
  `/socket.io`) or a redesign around a managed realtime provider.
- Requires: an `api/` entry point that imports `{ app }` and wraps it for Vercel's Node runtime,
  plus separate realtime hosting. Neither split-host adapter is implemented in this repo.

**Option B — frontend on Vercel, backend on an always-on host (Railway/Render/Fly/etc.)**
- Pro: no timeout ceiling and supports the shared Express + Socket.IO HTTP server exactly like
  local dev (`npm run build && npm start` — see §2). This is the recommended model.
- Con: two URLs. Requires `CORS_ORIGINS` on the backend to include the deployed frontend's
  origin, and the frontend's `VITE_API_BASE_URL` to point at the deployed backend's full URL
  instead of the relative default.

Whoever deploys should pick one explicitly — don't let it default by accident.

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

The Socket.IO client derives its origin from `VITE_API_BASE_URL`. The reverse proxy/load
balancer must forward both HTTP and WebSocket traffic at `/socket.io`. More than one backend
instance also requires a shared Socket.IO adapter before events can cross instances.

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
