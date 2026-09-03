# Customers Module — Current State, Intended Flow & RBAC

> **STATUS 2026-09-03 — the "fake data" claim below is OUT OF DATE.** Customer Accounts is now
> backed by real data: `customer_accounts_view` (migration
> `20260828003000_023_customer_accounts_view.sql`) derives customers from companies with
> confirmed purchase history, served by `GET /customers`
> (`backend/src/controllers/customer.controller.ts`) and rendered by `CustomerAccounts` in
> `frontend/src/App.tsx`. The RBAC role referred to below as "Inventory/Inquiry" shipped as two
> separate roles — `procurement` (inquiry validation) and `operations` (inventory) — see
> `docs/OPERATIONS_MODULE.md`. The rest of this doc is retained for the design reasoning.

Verified against the code directly as of 2026-08-27. The short version: **Customer Accounts is
currently 100% fake data** — it's a real page with a real nav entry, but every row is a
hand-written mock array, not a database query. This doc explains what it's supposed to do, where
it plugs into the rest of the system, and the two-role access model (Sales Manager vs.
Inventory/Inquiry) that needs to gate it once it's real.

---

## 1. Current state — confirmed, not assumed

`frontend/src/App.tsx`, `CustomerAccounts` component (~line 2028):
```ts
const customers = [
  { co: 'NorthStar Construction LLC', contact: 'Tom Erikson', ... status: 'Active' },
  { co: 'Great Lakes Storage Solutions', ... status: 'Active' },
  ... // 5 hardcoded rows total
]
```
No `useEffect`, no `api.get(...)`, nothing. The Active/Floating tabs filter this static array.
"Add Customer" button has no `onClick` — it does nothing.

There is **zero backend support**: no `customers` table, no SQL view, no `GET /customers`
route, no controller, no service. Grepped the whole backend — the only files mentioning
"customer" at all are `lead.schema.ts` (unrelated string, "Existing Contact/Customer" comment)
and the hosted e2e test (unrelated). Confirmed nothing else exists.

Two related things are in the same state, worth fixing together since they're the same shape
of problem:
- **Best Clients** (`frontend/src/App.tsx`, `const BEST_CLIENTS: BestClientRow[] = []`) — hardcoded
  empty array, renders nothing.
- **`analytics.controller.ts`'s `active_clients` metric** (used on the main dashboard) —
  computes "active clients" as a **naive distinct-`company_id` count from all `sales` rows with
  `status = 'Won'`**, with no time window at all. This is a *different, wrong* definition from
  the real business rule (see §2) — once a real Customer Accounts view exists, this dashboard
  metric needs to be rewired to use it instead, or the dashboard will keep showing a number that
  doesn't match the Customer Accounts page. This is exactly the "inconsistent metrics" risk the
  original project spec calls out as a non-negotiable to avoid.

## 2. The business rule (from the original project spec — this part was always well-defined,
just never implemented)

A **Customer** is not its own table — it's a **derived view** of companies with completed
purchase history. It's computed, not manually maintained.

- **Active**: at least one qualifying `sales` row (`status = 'Won'`) with `created_at` within
  the last 3 months.
- **Floating**: has qualifying sale history, but the *most recent* qualifying sale is older
  than 3 months.
- **Neither**: a company with zero `Won` sales isn't a customer at all — it shouldn't appear on
  this page. (Compare: it might still appear elsewhere as a Prospect/Warm Lead/Inquiry — those
  are separate record types, see `docs/PROJECT_STATUS.md` §2.)

Per-customer aggregates, all computed from `sales` grouped by `company_id`:
- Sales count = number of `Won` sales rows.
- Units = `SUM(total_units)`.
- Revenue = `SUM(revenue)`.
- Gross Profit = `SUM(gross_profit)`.
- Last Purchase = `MAX(created_at)` among `Won` sales.
- Company/Contact/State/Country = from `companies` (+ the primary contact via
  `company_contacts.is_primary = true`).
- PIC = there's a judgment call here the original spec doesn't resolve: most recent sale's
  `pic_id`, or the PIC on the *most* sales for that company? Pick one and document it in the
  code comment when you build this — don't leave it implicit.

## 3. Where this connects in the system

```
Quotation → convert_quotation_to_sale ──┐
                                          ├──► sales (status='Won') ──► Customer Accounts (derived)
Manual Sale entry ───────────────────────┘                                    │
                                                                                ├──► Best Clients (rank by qty/revenue/profit)
                                                                                └──► Dashboard "Active Clients" metric
                                                                                       (currently computed wrong, see §1)
```

- **Upstream**: `sales` table is the only real source of truth — both the quotation-driven path
  (`convert_quotation_to_sale`) and the manual-sale path (`create_manual_sale`, added recently —
  see `docs/PROJECT_STATUS.md` §7) already write to it correctly. **No changes needed upstream**
  — the data this module needs already exists and is correct today. This is purely a "build the
  read side" task.
- **Downstream, also unbuilt** (don't confuse with this task, but know they're related):
  **Contracts** (`customer_contracts` table doesn't exist) and **Pickups** (`pickups` table
  doesn't exist) — both referenced in the original spec as post-sale, per-customer records.
  They're Phase 9 in the original roadmap, out of scope here, but they'd hang off whatever
  `company_id` this module resolves as "the customer," so keep that in mind if you build them
  next.

## 4. What to actually build

1. A SQL function or view (`customer_accounts` view, or a `get_customer_accounts()` function —
   view is simpler and sufficient here, this doesn't need transaction logic) that does the
   aggregation in §2. Compute `status` (`'Active'` / `'Floating'`) in the view itself using
   `NOW() - INTERVAL '3 months'` against `MAX(created_at)`, so the frontend doesn't have to
   re-derive it.
2. `GET /api/v1/customers` (new route/controller — there's no `customer.routes.ts` yet, add one)
   reading from that view, with the same search/filter/pagination pattern already used in
   `lead.controller.ts`'s `listActiveLeads` (search, country, state, PIC).
3. Wire `CustomerAccounts` in `App.tsx` to fetch from it instead of the hardcoded array — same
   `useEffect` + `api.get` pattern as `useProspects`/`useSales` elsewhere in that file.
4. Fix `analytics.controller.ts`'s `active_clients` to query the same view instead of its current
   naive distinct-count, so the dashboard and this page never disagree.
5. Wire `BEST_CLIENTS` the same way, sorted by whichever of quantity/revenue/profit the UI
   already has a toggle for (check the existing dashboard code for what sort options are already
   drawn but unfed).
6. **RBAC gate this route** — see §5 below before building it, since the intended access rules
   affect whether this needs role-based row filtering or just an all-or-nothing gate.

## 5. RBAC — two roles, current reality vs. what's being asked for

### Current reality (confirmed against the live database and code)

`profiles.role` is constrained to exactly three values today:
`CHECK (role IN ('admin', 'manager', 'pic'))` (migration
`20260826010000_007_security_foundation.sql`). There is **no `inventory_inquiry` role yet** — it
doesn't exist in the database or in code. Adding it means updating **all four** of these
(confirmed by grep — it's genuinely four separate spots, easy to miss one):
1. The `profiles_role_check` CHECK constraint (new migration).
2. `type OperationalRole = 'admin' | 'manager' | 'pic'` in `backend/src/middleware/auth.middleware.ts` (line 4).
3. The `role: 'admin' | 'manager' | 'pic'` literal type in `backend/src/types/express.d.ts` (line 11) — a separate declaration from #2, both need the same new value or TypeScript will only catch one of them.
4. `requireAuth`'s role-normalization/validation logic (same file as #2) — currently only accepts the three existing values.

**More important finding**: almost every write route in this app currently calls
`requireRoles('admin', 'manager', 'pic')` — all three roles, uniformly. Grep any route file
(`lead.routes.ts`, `deal.routes.ts`, `import.routes.ts`) and you'll see the same three-role list
repeated everywhere. **In practice, there is no real permission difference between `manager` and
`pic` today** — a `pic` account can already do everything a `manager` account can, at the API
level. Read routes (`GET`) mostly have no role check at all beyond being logged in. If you're
picking this up expecting some existing role-based restriction to build on, there isn't one —
you're building the first real RBAC boundary in this app.

### The two-role model being asked for

| Role | Sees | Can edit |
|---|---|---|
| **Sales Manager** | Everything — Prospects, Warm Leads, Inquiries, Quotations, Sales, Customers, Analytics, Settings | Everything in the sales pipeline |
| **Inventory/Inquiry** | Inventory (all of it, view-only for entries they don't own), Inquiries | Their **own** Inventory entries; whatever ticket-handling actions their role needs on Inquiries (exact scope still open — see below) |

**Decision needed before implementing**: should "Sales Manager" be the existing `manager` role
(simplest — just start actually differentiating `pic` from `manager` in `requireRoles` calls
instead of listing all three everywhere), or a new, more explicit role name? Reusing `manager`
is the lower-effort path and matches "sees everything" naturally since `admin` already implies
that scope too. Recommend reusing `manager`/`admin` for this and only adding one genuinely new
role value (`inventory_inquiry`) — but this is a naming/scope decision, not a technical
constraint, so confirm it with whoever owns the product decision before writing the migration.

**What "Inventory/Inquiry" needs is not fully specified yet.** This role is the same one
described in `docs/PROJECT_STATUS.md` §8 ("Explicitly NOT built yet — Inventory module +
Inquiry ticketing"), and the same open questions there block finishing this RBAC design, not
just the Inventory module itself:
- Does this role see the *entire* Inquiry record (customer contact info, PIC, pricing) or only
  the container-requirement fields relevant to checking availability?
- "View all, edit own" for Inventory — own by user, or own by some other grouping (location,
  category)? This determines whether the RLS/backend filter is `WHERE created_by = auth.uid()`
  or something more structural.
- Can this role take an action that changes an Inquiry's status (e.g. "confirmed available" /
  "not available"), or is their output purely informational, read by a Sales Manager who then
  updates the Inquiry themselves?

**Don't implement the Inventory/Inquiry role's permissions in detail until those are answered**
— the Customer Accounts gate itself is simple regardless (see below), but the *rest* of this
role's access needs that scoping decision first.

### What IS clear and buildable now, independent of the open questions above

The Customer Accounts module itself has an unambiguous answer: it's sales-pipeline data, so it
should be **Sales Manager only** — an Inventory/Inquiry role has no reason to see customer
revenue/profit history. Concretely, once the role exists:
```ts
router.get('/', requireRoles('admin', 'manager'), CustomerController.getCustomers)
```
(excluding `pic` too, if the reuse-`manager`-as-"Sales Manager" decision above is confirmed —
or including `pic` if PICs should still see their own customers; that's the one piece of this
specific route that also depends on a product decision, not a technical one).

## 6. Summary checklist for whoever picks this up

- [ ] Decide: does "Sales Manager" reuse the existing `manager` role, or is it a new role name?
- [ ] Add `inventory_inquiry` (or chosen name) to the `profiles_role_check` CHECK constraint,
      the backend `OperationalRole` type, and `requireAuth`'s allowed-role list.
- [ ] Answer the open Inventory/ticketing questions in `docs/PROJECT_STATUS.md` §8 — needed for
      the Inventory/Inquiry role's actual permission scope, not for Customer Accounts itself.
- [ ] Build the `customer_accounts` SQL view per §2/§4.
- [ ] Add `GET /api/v1/customers` gated to Sales Manager roles only.
- [ ] Wire `CustomerAccounts`, `BEST_CLIENTS`, and `analytics.controller.ts`'s `active_clients`
      to the same view so all three agree with each other.
- [ ] Start actually differentiating roles in `requireRoles(...)` calls across existing routes
      instead of listing all three roles everywhere — this RBAC work doesn't mean anything if
      every route still grants blanket access regardless of role.
