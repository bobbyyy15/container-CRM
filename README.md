# Container CRM

Container CRM is a React, Express, and Supabase application for the connected sales pipeline:

`Prospect -> Warm Lead -> Inquiry -> Validation -> Quotation -> Sale -> Customer -> Contract -> Pickup`

Four roles: **admin**, **sales_manager**, **procurement** (inquiry validation), and
**operations** (inventory, contracts, pickups). Supporting modules: inventory, outreach logging,
daily targets, service territories, monthly reporting, notifications, imports, and a shared
outreach suppression list.

See [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) for current business rules and what's been
built and verified. The Inventory module and Inquiry ticketing are both **built and covered by
hosted e2e tests** (see §8 there).

See [`docs/ACCOUNT_MODULE.md`](docs/ACCOUNT_MODULE.md) for the signup/login/roles/Google-OAuth
flow, its known bugs, and what to pick up next there.

See [`docs/CUSTOMERS_MODULE.md`](docs/CUSTOMERS_MODULE.md) for the Customer Accounts module —
now backed by real data via the `customer_accounts_view` (companies with confirmed purchase
history), not mock data — plus the PIC data-silo / RBAC model.

See [`docs/OPERATIONS_MODULE.md`](docs/OPERATIONS_MODULE.md) for the Operations role and the
shipped Inventory module.

## Local setup

1. Install both locked dependency sets:

   ```powershell
   npm run install:all
   ```

2. Copy `backend/.env.example` to `backend/.env` and provide real local credentials. Never commit `.env` files.

3. Start both applications from the repository root:

   ```powershell
   npm run dev
   ```

   - Frontend: <http://localhost:8443>
   - Backend health: <http://localhost:3001/api/health>

4. Run the complete local code quality gate:

   ```powershell
   npm run check
   ```

## Database development

Database changes are migration-driven. Migrations `007` through `011` introduce the security foundation, transactional pipeline conversions through Sale, active-stage lifecycle rules, suppression records, audited duplicate-safe imports, and explicit backend service-role privileges.

Before applying anything to hosted Supabase:

1. Install and start Docker Desktop.
2. Run `npx supabase start`.
3. Run `npx supabase db reset`.
4. Run database, RLS, transaction, API, and application tests.
5. Review the resulting schema and generated types.

Do not run `supabase db push` against the hosted project until those local checks pass and the team explicitly approves the migration set.

## Gmail outreach

Gmail is optional and disabled until these backend variables are configured:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `FRONTEND_URL`

The Google Cloud OAuth client must include the exact redirect URI from `GOOGLE_REDIRECT_URI`. Gmail connection status and controls are available under **System Settings**.

OAuth refresh tokens and authorization states are backend-only. They must never be added to frontend environment variables or public profile data.

## Local database validation

Migrations `007` through `011` have been applied and linted against local Supabase. The rollback-only lifecycle test in `supabase/tests/deal_lifecycle_smoke.sql` verifies idempotent Inquiry -> Quotation -> Sale transitions without leaving test data behind.

## Spreadsheet imports

The Prospect screen accepts `.xls`, `.xlsx`, and `.csv` files, plus data copied from Excel or Google Sheets. It scans every worksheet, recognizes common header aliases below title rows, accepts shuffled columns, Standard A-Q order, and transposed/vertical prospect layouts. Files are previewed in the browser, then processed by one audited database transaction with duplicate, conflict, and removed-identity outcomes. Files that describe a different entity type are rejected instead of being converted into false prospects.

## Temporary remote client demo

The Vite development server proxies `/api` to the local backend, so one HTTPS tunnel can expose both the frontend and API for a short client test.

1. Start the CRM with `npm run dev` and verify both local health checks above.
2. Install `cloudflared` from the official Cloudflare download.
3. In another terminal, run `cloudflared tunnel --url http://localhost:8443`.
4. Share the generated `https://...trycloudflare.com` URL only with the intended tester.

Quick tunnels are temporary development previews: the computer and both CRM processes must remain running, the URL changes when the tunnel restarts, and this is not a production deployment.
