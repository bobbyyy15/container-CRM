# Account Module — Current State, Flow & What To Do Next

Everything in this doc was verified directly against the code and the live hosted database as
of 2026-08-27 (including one item confirmed by dumping the actual hosted RLS policies/grants —
not just read from migration files, since the migration history alone was ambiguous on that
point). Where something is a known bug, it's marked **BUG**, not a maybe.

---

## 1. What "Account module" covers

- Signup / login (Supabase Auth), including username-as-login-credential support.
- Session handling (frontend Supabase client + backend JWT verification).
- `profiles` table — the CRM-side user record (role, status, username, full name).
- Role-based access (`admin` / `manager` / `pic`).
- The Account Settings page (`/profile-settings`).
- Google OAuth — **two separate systems**, explained in §5, don't conflate them.
- PIC (Person In Charge) linkage — currently unbuilt, see §7.

## 2. Signup flow

`frontend/src/Login.tsx`, registration branch:

1. User fills Email, Username, Password, (optional) Full Name.
2. Frontend calls `supabase.auth.signUp({ email, password, options: { data: { username, full_name } } })` — this goes straight to Supabase Auth, not through the backend.
3. A Postgres trigger (`handle_new_user`, defined in `supabase/migrations/20260825223100_003_auth_profiles.sql`, fires `AFTER INSERT ON auth.users`) reads `username`/`full_name` back out of `raw_user_meta_data` and inserts the matching `profiles` row. If no username was supplied, it falls back to the email's local-part (`split_part(email, '@', 1)`). If the derived username collides with an existing one, it retries once with a random 4-character suffix appended.
   - **This trigger is designed to never fail auth signup even if profile creation fails** — it has a catch-all `EXCEPTION WHEN OTHERS THEN RAISE WARNING ... RETURN NEW`. That means it's *possible* (if rare) for a Supabase Auth user to exist with **no** matching `profiles` row. If that happens, the account can authenticate with Supabase but every backend API call will 403 with `PROFILE_NOT_FOUND` (see §4). If you're debugging "user says they signed up but can't do anything," check for this first: `SELECT * FROM profiles WHERE id = '<their auth.users id>'`.
4. **Email confirmation**: if your Supabase project has email confirmation turned on (check Supabase Dashboard → Authentication → Providers → Email), `signUp()` returns no session. The frontend already handles this correctly — it does **not** treat this as a successful login; it shows a "check your email" message and switches to the login form with the email pre-filled. (This used to be a real bug — `onLogin()` was called unconditionally — it's fixed. Don't reintroduce it.)
5. New profiles default to `role = 'pic'`, `status = 'active'` (the `role` column's DB-level default was changed to `'pic'` in migration 007 — before that it defaulted to a legacy `'user'` value, see §4).

## 3. Login flow

Same file, login branch. One field, labeled "Email or Username" — **not** an `<input type="email">` anymore (that was a bug: it silently blocked username entry at the browser validation level; now it's `type="text"`).

1. If the typed value contains `@`, it's used directly as the email.
2. If not, the frontend calls the backend: `POST /api/v1/auth/resolve-login { identifier }` (`backend/src/controllers/auth.controller.ts`). This endpoint requires **no auth** (it's mounted before the global `requireAuth` gate, since the user isn't logged in yet) and uses the **service-role** Supabase client to do a case-insensitive `profiles.username` lookup — it has to use service-role because `profiles` reads are locked to `authenticated`-only (see §4), and an anonymous browser can't read that table directly.
   - Found → returns `{ email }`.
   - Not found → `404 { message: 'No account found for that username.' }`.
3. Either way, the frontend now has a real email and calls `supabase.auth.signInWithPassword({ email, password })` as normal.

**No forgot-password flow exists anywhere in the UI.** Supabase Auth supports
`resetPasswordForEmail()` natively and the local Supabase config even has password-reset email
settings sitting there unused, but nothing in the frontend calls it and there's no "Forgot
password?" link. If a user forgets their password today, there's no self-service recovery path.
**This is the most user-facing gap in the whole module — probably the first thing to build.**

## 4. Sessions, roles, and the backend auth gate

`backend/src/middleware/auth.middleware.ts` — `requireAuth` runs on every `/api/v1/*` route
except `/api/v1/auth/*` (see `backend/src/index.ts`: the auth routes are mounted *before* the
global `app.use('/api/v1', requireAuth)` line).

Per request:
1. Reads the `Authorization: Bearer <token>` header → 401 if missing.
2. Verifies the token against Supabase Auth (`supabaseAdmin.auth.getUser(token)`) → 401 if invalid/expired.
3. Looks up the matching `profiles` row (service-role, bypasses RLS) → **403 `PROFILE_NOT_FOUND`** if there isn't one (see the signup-trigger caveat in §2).
4. → **403 `PROFILE_INACTIVE`** if `status !== 'active'`.
5. Normalizes role: `role === 'user' ? 'pic' : role` — a backward-compatibility shim for rows that still have the old pre-migration-007 default. **Once you're confident no `profiles` row has `role = 'user'` anymore (`SELECT count(*) FROM profiles WHERE role = 'user'` should be 0), this line can be deleted.**
6. → **403 `ROLE_INVALID`** if the (normalized) role isn't one of `admin`/`manager`/`pic`.
7. Sets `req.auth = { user, profile }` for the route handler.

`requireRoles('admin', 'manager', ...)` is a second middleware layered on top of specific
routes to restrict by role (e.g. only admin/manager/pic can POST — some routes are open to any
authenticated role, some aren't; check each route file).

**There is currently no way to change a user's role from the UI or API.** No admin page, no
`PATCH /profiles/:id` endpoint, nothing. The only way to promote someone from `pic` to
`manager`/`admin` today is a direct database update:
```sql
UPDATE profiles SET role = 'manager' WHERE email = 'someone@example.com';
```
**If you're picking up this module, building a real "manage users" admin screen (list users,
change role, activate/deactivate) is probably the highest-value next task** — right now it's a
manual DB operation only whoever has Supabase dashboard/DB access can do.

## 5. Google OAuth — two completely separate systems, don't mix them up

**A. "Sign in with Google" button (`Login.tsx`)** — calls
`supabase.auth.signInWithOAuth({ provider: 'google', ... })` directly. This is Supabase Auth's
own Google identity provider. It authenticates the browser session (creates/logs into a
Supabase Auth user → triggers `handle_new_user` → creates a `profiles` row, same as any other
signup). It requests Gmail scopes on the OAuth consent screen, but **Supabase's own sign-in flow
does not hand your backend a usable, persisted Gmail-sending refresh token** — it's just for
authenticating the login.

**B. The backend's own Gmail OAuth flow (`google.controller.ts` + `google-oauth.service.ts`)** —
a fully separate, custom-built OAuth dance for connecting a Gmail account specifically for
**sending outreach email**, independent of which identity you logged in with:
- `GET /api/v1/auth/google` → builds a Google consent URL, stores a CSRF state token (hashed, single-use, 10-minute expiry) in `google_oauth_states`.
- `GET /api/v1/auth/google/callback` → Google redirects here (no JWT, so this route skips `requireAuth`); exchanges the code for tokens, fetches the connected Gmail address, and upserts `{ user_id, google_email, refresh_token }` into `google_oauth_credentials`.
- `GET /api/v1/auth/google/status` → `{ configured, connected, email }`.
- `DELETE /api/v1/auth/google` → disconnects (deletes the credential row).
- `POST /api/v1/auth/google/sync-provider` → **correction: this IS wired up.** `App.tsx`'s session effect (on initial load and on every `onAuthStateChange` event) checks `session?.provider_refresh_token` and, when present, POSTs it here automatically to register that refresh token for outreach sending. So flow A and flow B are bridged for the case where a user signs in via the Google OAuth login button and the browser happens to capture a refresh token from that flow. It's not dead code — an earlier pass of this doc missed the caller in `App.tsx`.

Where you actually connect Gmail for sending today is **System Settings → Integrations**
(referenced by label in `UserProfileSettings.tsx`, not audited in this pass — check that page
directly if you're working on this).

## 6. Account Settings page (`/profile-settings`) — **has real bugs, don't trust it as-is**

`frontend/src/features/settings/UserProfileSettings.tsx`. Reads and writes the `profiles` table
**directly via the Supabase browser client** — not through the backend API (everything else in
this app goes through the backend; this page is the exception, worth knowing).

**BUG — the Save button is broken for the username field.** The form lets the user edit
"Display Name" (which is actually the `username` column) and "Full Legal Name" (`full_name`),
both required, and submits both in one `update()` call. But migration 007
(`20260826010000_007_security_foundation.sql`) only ever granted:
```sql
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
```
No `UPDATE` grant on `username` exists anywhere in the migration history — **confirmed by
dumping the actual live grants from hosted**, not just reading migration files:
```
GRANT SELECT("username") ON TABLE "public"."profiles" TO "authenticated";   -- read-only
GRANT SELECT("full_name"),UPDATE("full_name") ON TABLE "public"."profiles" TO "authenticated";
```
Postgres checks privileges on *every* column named in an `UPDATE ... SET` clause — since
`username` is in that clause and there's no UPDATE grant on it, **the whole statement fails**,
even though `full_name` alone would have been fine. The row-level RLS policy
(`"Users can update own profile" USING (auth.uid() = id)`) is fine and still active — it's
purely the column-level grant that's missing. The user will see the raw Postgres permission
error via the page's `alert(...)`, not a clean message.

**Fix options** (pick one, don't guess — decide which matches the product intent):
1. If users *should* be able to change their own username: add a migration granting
   `UPDATE (username)` too, and add a uniqueness-conflict error message in the UI (username has
   a `UNIQUE` constraint — a collision will currently also just show as a raw Postgres error).
2. If username should be **admin-only** / fixed at signup: remove the username field from this
   form entirely and make it a read-only display like the email field already is.

**BUG — "Connected Google Account" always shows "Not connected".** The form reads
`profile?.google_email`, but that column was **dropped from `profiles` in migration 007** and
moved to `google_oauth_credentials` (see §5). This field will never show real data no matter
what's actually connected. Either remove this display from the page (the note already correctly
points users to System Settings → Integrations for the real thing) or fetch
`GET /api/v1/auth/google/status` and show the real connection state here instead.

## 7. PIC linkage — schema exists, nothing uses it

`pics.profile_id` (a nullable FK to `profiles.id`, `ON DELETE SET NULL`) has existed since the
very first migration. **It is never read or written anywhere in the codebase** — not by the
signup trigger, not by any controller, not by any SQL function. There is no UI to link a logged-
in user to a PIC record. If "this user IS this PIC" needs to matter anywhere (e.g. a PIC seeing
only their own assigned prospects/leads), that's entirely unbuilt — don't assume it works.

(Don't confuse `pics.profile_id` with `prospect_clients.pic_id` /
`warm_leads.pic_id` / `inquiries.pic_id` — those are a different, already-working concept: which
PIC is *assigned to* a given record. That part works fine and is unrelated to this gap.)

## 8. Summary — bug list

| # | What | Where | Fix effort |
|---|---|---|---|
| 1 | ✅ Fixed — No forgot-password flow anywhere in the UI | `Login.tsx` | Added: "Forgot password?" link → `resetPasswordForEmail()` → new `ResetPassword.tsx` screen driven off the `PASSWORD_RECOVERY` auth event in `App.tsx` |
| 2 | ✅ Fixed — No admin UI/API to change a user's role | Whole module | Added `GET/PATCH /api/v1/admin/users` (admin-only, self-modification blocked) + new `UserManagement.tsx` page under Administration in the sidebar (admin role only) |
| 3 | ✅ Fixed — Account Settings "Save" fails when the username field is included | `UserProfileSettings.tsx` | Username is now shown read-only (it's a login credential, not user-editable) instead of being submitted in the save payload |
| 4 | ✅ Fixed — Account Settings shows "Not connected" for Google regardless of actual state | `UserProfileSettings.tsx` | Now calls `/auth/google/status` live instead of reading the dropped column |
| 5 | ~~`POST /auth/google/sync-provider` is dead code~~ — **misdiagnosed, not a bug.** `App.tsx`'s session effect calls it automatically whenever a session carries a `provider_refresh_token`. | `google.controller.ts` | None — no action needed |
| 6 | `pics.profile_id` is a schema-only placeholder, never used | schema-wide | Not fixed here — this needs a product decision on what "a user IS a PIC" should actually do, not a code guess |
| 7 | ✅ Fixed — `role === 'user' ? 'pic' : role` shim in `requireAuth` | `auth.middleware.ts` | Confirmed 0 legacy rows on hosted, then deleted the shim |

Item 6 is the one still open — it needs a product decision (see §7 above) before anyone should
pick it up.

## 9. Reference — file map

```
frontend/src/Login.tsx                                  signup + login UI/logic
frontend/src/features/settings/UserProfileSettings.tsx  Account Settings page (has bugs, §6)
frontend/src/config/supabase.ts                         browser Supabase client (publishable key)

backend/src/controllers/auth.controller.ts               POST /auth/resolve-login
backend/src/controllers/google.controller.ts              Gmail OAuth flow (send-outreach credential)
backend/src/services/google-oauth.service.ts              Gmail OAuth token exchange/storage
backend/src/routes/auth.routes.ts                         route wiring for the above
backend/src/middleware/auth.middleware.ts                 requireAuth / requireRoles
backend/src/config/supabase.ts                            supabaseAdmin (service-role key)
backend/src/controllers/pic.controller.ts                 GET /pics (unrelated to profile_id gap)

supabase/migrations/20260825113841_001_initial_schema.sql        profiles + pics first created
supabase/migrations/20260825223100_003_auth_profiles.sql         handle_new_user trigger, username/full_name
supabase/migrations/20260825223101_004_auth_fix.sql               column reconciliation, public SELECT (superseded)
supabase/migrations/20260826010000_007_security_foundation.sql    RLS lockdown, google_oauth_credentials split-out,
                                                                    role default -> 'pic', the column-grant bug (§6)
```

No migration after 007 touches `profiles` except as a plain FK target elsewhere — everything
about its current RLS/grant posture comes from 007 and is confirmed still live today.
