# Operations Role — BUILT (spec kept for history)

> **STATUS as of 2026-09-03: this is built, merged, and covered by hosted e2e tests.**
> The sections below were the pre-build spec and are kept only as a record of the reasoning.
> Everything in §2 that says "needs a real answer" has since been answered by the shipped
> implementation — see "What actually shipped" immediately below before reading further.

## What actually shipped

The `operations` role now has real permissions and dedicated screens:

| Capability | Where |
|---|---|
| `inventory` table (size/condition/category, depot, city/state/country, qty available + reserved, unit cost, target sell price, serial numbers, auto-managed status) | `supabase/migrations/20260903010000_033_inventory_module.sql` |
| Full CRUD + bulk Excel import + stock adjust | `backend/src/{routes,controllers,services}/inventory.*` |
| Ownership model: **view-all, edit-own, admin-delete** | RLS policies in migration 033 |
| Inventory Management screen | `frontend/src/App.tsx` — `InventoryManagement` |
| Live stock lookup on an inquiry ticket | `get_stock_for_spec` RPC + `LiveStockWidget` |
| Pickup Tracking / Customer Contracts / Customer Accounts | `operations` is in the `roles` allowlist on those NAV entries; routes gated in `contract.routes.ts` / `customer.routes.ts` |

Answers to the §2 open questions, as implemented:

1. **Item shape** — size/condition/category, vendor, depot + location, quantity available and
   reserved, unit cost, target sell price, optional per-unit serial numbers, auto-derived status
   (`Out of Stock` / `Low Stock` / `In Stock` via trigger).
2. **Ownership boundary** — per-user (`created_by`). Everyone reads all inventory; you may only
   update rows you created; only admins delete.
3. **Relationship to inquiries** — decoupled maintenance, plus a read-only cross-reference:
   Procurement's ticket detail shows a live stock check for the ticket's size/condition. Inventory
   vocabulary is therefore bound to the real `container_sizes` / `container_conditions` /
   `container_categories` catalog, not free text — this was a real bug caught in review.
4. **Pipeline visibility** — Operations sees Pickup Tracking, Customer Contracts, Customer
   Accounts, Inventory, and Container Catalog. It does **not** see Prospects/Warm Leads/
   Inquiries/Quotations/Sales.

Ticket approval remains with `procurement`, as anticipated below — Operations did not get a
parallel ticketing system.

---

## 1. Where this idea came from

Earlier in the project (see `docs/PROJECT_STATUS.md` §8 and `docs/CUSTOMERS_MODULE.md` §5,
written 2026-08-27) the team described a 4th role responsible for **Inventory**: uploading and
editing container inventory, with "view all, edit own" access — anyone can see the full
inventory list, but can only edit the entries they own.

That earlier writeup also described inquiries routing to this role **as tickets**. That part is
now **already built, but landed on `procurement`, not this role** — see
`docs/PROJECT_STATUS.md` and the `031_inquiry_ticketing_and_notifications.sql` /
`032_structured_inquiry_alternative.sql` migrations: every inquiry a Sales Manager creates
already goes to Procurement's validation queue (`/leads/inquiries/pending-validation`) for
approve/reject-with-alternative before it's quotable, with in-app notifications both ways.

**So `operations`'s scope is now narrower than originally described**: it's the Inventory half
of the original idea, not the ticket-approval half — that's spoken for. Confirm this reading
with the team before building; don't assume it silently.

## 2. What "Inventory" means here — needs a real answer, not a guess

> **Superseded** — the `inventory` table now exists (migration 033); see "What actually shipped".
> Original text follows.

There is currently **no inventory table, no inventory data, at all** in this system. The
Container Catalog page (`container_sizes` / `container_conditions`) is just a dropdown option
list used on quotations/inquiries — it has no quantity, location, or ownership concept. Whatever
gets built here is new, not a repaint of something that exists.

Get real answers to these before writing code — guessing wrong here means a rebuild, not a
patch:

1. **Item shape** — what fields does one inventory record actually have? Container size,
   condition, location, quantity-on-hand, status (available/reserved/sold), a physical
   unit/serial number? Something else?
2. **Ownership boundary for "edit own"** — scoped per-user, per-PIC, per-territory/location? Can
   an admin edit anyone's inventory?
3. **Relationship to Inquiries** — now that Procurement (not this role) validates inquiry
   tickets, does Operations need to see inquiries at all? A plausible answer: Procurement
   checks inventory availability as part of deciding approve/reject, meaning Operations needs to
   keep the inventory numbers Procurement is looking at accurate and current — but that's an
   assumption, not a confirmed design. Could also be entirely decoupled (Operations just
   maintains stock counts; nobody's told to cross-reference them yet).
4. **Does Operations need pipeline visibility at all** — Prospects/Warm Leads/Quotations/Sales?
   Default assumption should be no (same reasoning as Procurement's silo carve-out being
   deliberately narrow — see `docs/CUSTOMERS_MODULE.md`), but confirm.

## 3. Suggested minimum first build (once §2 is answered)

Mirrors the pattern already used for the Procurement validation queue — copy that, don't
reinvent the plumbing:

1. **Migration**: new `inventory` table (columns per the answered item shape above), RLS/silo
   filtering by whatever ownership boundary was confirmed. Look at
   `031_inquiry_ticketing_and_notifications.sql` for the RLS + notification pattern already
   established.
2. **Backend**: `GET /inventory` (view-all — no pic_id/owner filter on read), `POST /inventory`
   and `PATCH /inventory/:id` (owner-checked, same ownership-check pattern as
   `LeadService.assignPic` / `LeadService.applyInquiryAlternative` in
   `backend/src/services/lead.service.ts` — fetch the row, compare its owner field to the
   actor's, reject if they don't match).
3. **Role gate**: `requireRoles('admin', 'operations')` on the write routes, matching how
   `backend/src/routes/lead.routes.ts` gates the validation queue to
   `requireRoles('admin', 'procurement')`.
4. **Frontend**: a new nav item gated the same way `Inquiry Validation` is gated in
   `frontend/src/App.tsx` — see the `roles: ['admin', 'procurement']` field on that `NavItem`
   and copy the pattern for `roles: ['admin', 'operations']`. Sidebar filtering (search
   `visibleGroups` in the `Sidebar` component) already respects per-item `roles`, nothing else
   to change there.
5. **Do not** build a new ticket-routing/approval system for this — that concept is already
   built and lives with Procurement. If the team decides Operations should also see or act on
   inquiry tickets, extend the existing `inquiries` workflow (add `operations` to a route's
   `requireRoles(...)`, don't build a parallel one.

## 4. Quick reference — where things live

| What | File |
|---|---|
| Role list (backend validation) | `backend/src/middleware/auth.middleware.ts`, `backend/src/types/express.d.ts` |
| Role list (admin role-change UI) | `backend/src/schemas/admin.schema.ts`, `frontend/src/features/settings/UserManagement.tsx` |
| Worked example of a role-gated queue + ownership-checked actions | `backend/src/controllers/lead.controller.ts` (`getPendingValidationTickets`, `validateTicket`), `backend/src/services/lead.service.ts` (`getPendingValidationTickets`, `validateInquiryTicket`) |
| Worked example of a role-gated nav item + page | `frontend/src/App.tsx` — search `inquiry-validation` (NAV entry, `Screen` type, `SCREEN_LABELS`, `renderScreen` case, and the `InquiryValidation` component itself) |
| In-app notifications (reuse, don't rebuild) | `backend/src/controllers/notification.controller.ts`, insert pattern in `031_inquiry_ticketing_and_notifications.sql`'s `validate_inquiry_ticket` function |
| PIC/data-silo ownership model | `docs/CUSTOMERS_MODULE.md` §4 |

## 5. Don't start building without §2 answered

Same warning as the original writeup carried: the risk of guessing wrong on the inventory shape
or ownership model is a rebuild. Get the answers from the team first.
