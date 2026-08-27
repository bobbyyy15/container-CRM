# Container CRM — Project Status & Roadmap

Living document. Tracks what's actually built and verified (not aspirational), the current
business rules as clarified by the team, and what's planned next. Update this whenever the
flow changes — don't let it drift from the real code the way the original spec doc did.

Last updated: 2026-08-27.

---

## 1. The pipeline, as it actually works today

```
Prospect Client → Warm Lead → Inquiry → Quotation → Sale
```

Every arrow above is now **optional to walk automatically** — each stage also supports
**manual entry**, so a record doesn't have to originate from the stage before it:

- Manual Warm Lead (no source Prospect) — for older contacts with no prospect record on file.
- Manual Inquiry, either linked to a Warm Lead or fully standalone (an existing
  customer/contact calling in with a fresh request).
- Manual Sale (no source Quotation) — for a sale that didn't go through a quotation.
- Manual Prospect — for adding a prospect outside of a spreadsheet import.

**Key rule: a Warm Lead never disappears when it gets an Inquiry.** Converting a Warm Lead to
an Inquiry used to mark it `converted` and hide it from the Warm Leads list. That's gone — a
Warm Lead now stays in the active Warm Leads list permanently (unless explicitly removed), and
**can have multiple Inquiries over time**. The link back is `inquiries.source_warm_lead_id`;
nothing about the Warm Lead record is hidden or lost when a new Inquiry is created from it.

Prospect → Warm Lead is different on purpose: converting a Prospect **does** remove it from the
active Prospect Clients list (the record is preserved with `lifecycle_status = 'converted'`,
`converted_at`, `conversion_reason`, `conversion_channel` — visible via the status filter, see
§3). That's the intended behavior: a Prospect that replied is no longer "un-contacted," so it
shouldn't clutter the working list of prospects still needing outreach. A Warm Lead getting a
new Inquiry doesn't carry the same "no longer needs attention" meaning, hence the different rule.

## 2. Domain model clarification

Prospect Client, Warm Lead, and Inquiry are three different record types, not the same thing
with different labels:

| Entity | Represents |
|---|---|
| **Prospect Client** | A company/contact that hasn't meaningfully engaged yet. |
| **Warm Lead** | A company/contact that has shown interest, replied, or previously inquired. |
| **Inquiry** | A specific request for container units or related services. One Warm Lead can have several Inquiries. |

Company and Contact records stay shared/authoritative across all of this (see
`find_or_create_company_contact` in migration 016/019) — manual entry on any stage
matches-or-creates the same underlying `companies`/`contacts` rows the automated pipeline uses,
so the same company doesn't end up duplicated depending on which door it came in through.

## 3. Prospect Client status filter

`GET /leads/prospects?status=active|converted|removed|all` (frontend: a dropdown next to the
other Prospect filters). Default is `active`. The Prospect Clients module still shows
un-converted prospects by default, matching the "primarily shows prospects who haven't
converted" rule — Converted/Removed/All are opt-in views for when you need them.

## 4. Manual entry fields, by module

**Prospect Client** (`POST /leads/prospects`) — Company, Contact person, Phone, Email, PIC,
Category (dropdown: Proceed/Removed), SMS Deliverability (dropdown: Call/Text, Calls Only, Text
Only), Industry (dropdown: Containers, Farms, Construction, Trucking, Logistics, Storage,
Others-with-specify — **not required**), Service Location (free text), Country, State/Province,
City, Date Added (manual, defaults to now if omitted).

**Warm Lead** (`POST /leads/warm-leads`) — Company, Contact person, Phone, Email, State/Province,
Country, PIC, Notes, Previous-inquiry indicator (checkbox, for "they inquired before but we don't
have the record"), Source (free text), Follow-up date, Follow-up notes. At least one of Contact
person / Phone / Email is required (a Warm Lead needs *some* way to reach the person — see §6).

**Inquiry** (`POST /leads/inquiries`, or `POST /leads/warm-leads/:id/create-inquiry` when
starting from a Warm Lead) — Company, Contact person, Phone, Email, PIC, State/Province, Country,
Container size, Container condition (both dropdowns off the real catalog), Quantity, Asking
price (optional), Inquiry details, Special requirements, Remarks, Follow-up date, Needed-by date,
Status (server-managed), Source Warm Lead (when applicable — omit for a standalone inquiry).
State/Province/Country default to the linked Warm Lead's values when not given explicitly, but
can be overridden per inquiry — a delivery location isn't always the company's registered address.

**Sale** (`POST /deals/sales`, manual — separate from the existing
`POST /deals/quotations/:id/convert-to-sale`) — Company, Contact person, Phone, Email, PIC,
Units, Buying cost, Revenue, State/Province, Country. `quotation_id` is left `NULL` for a manual
sale; `gross_profit` is still computed server-side the same way as a quotation-sourced sale.

## 5. Shared removal / deliverability system

One shared system, not per-module: `removed_entries` (suppression by company/contact/normalized
email/normalized phone) and the deliverability mapping both apply uniformly regardless of which
screen triggered the removal. `remove_pipeline_entry(stage, entity_id, actor_id, reason)` now
covers `prospect`, `warm_lead`, `inquiry`, **and `quotation`** (added this round — see §6 for the
one open question about this). Sale intentionally isn't part of this: "remove" there would mean
suppressing a company from all future outreach, which doesn't follow from voiding one sale
record — if you need to correct/void a bad Sale entry, that's a different, not-yet-built feature
(flag it if you want it).

Removed Sheet and Deliverability are explicitly **not** touched by this round of work — confirmed
working as-is.

## 6. One interpretation call worth double-checking

The instruction *"remove module must be added"* was ambiguous — it wasn't clear whether it meant
a new top-level module, a bulk-remove action, or extending the existing shared remove system to a
stage that didn't have it yet. Given the surrounding context (a full stage-by-stage flow
description, and "removed list is shared"), I extended `remove_pipeline_entry` to also cover
**Quotations** (a "Remove" action now appears on non-Converted quotations, marking them Rejected
and adding the company/contact to the shared suppression list). If that's not what was meant,
say so and I'll adjust — this was a judgment call under genuine ambiguity, not a confirmed spec.

## 7. What's built and verified this round

All of the following were verified directly against the hosted Supabase project (temporary
records created and cleaned up), not just locally:

- Manual Prospect creation, including the Category/SMS/Industry dropdowns and manual date.
- Manual Warm Lead creation, including the case where only an email/phone is given and no name
  (previously a hard bug — `warm_leads.contact_id` is `NOT NULL` but the contact-matching helper
  only created a contact when a name was supplied; fixed with a fallback name derived from the
  email/phone, matching the same pattern `handle_new_user` already uses for usernames).
- Manual standalone Inquiry creation (existing customer, no Warm Lead).
- Manual Inquiry linked to a Warm Lead, inheriting its state/country by default.
- Warm Lead staying `active` (visible) after an Inquiry is created from it.
- A Warm Lead successfully getting a **second** Inquiry (the old unique index that capped this
  at one was found and dropped — migration 018).
- Manual Sale creation with a `NULL` quotation_id and correct gross-profit math.
- Quotation removal (marks `Rejected`, writes to the shared suppression list; blocked on already
  `Converted` quotations).
- Username login and the false-success signup message (see backend commit history — unrelated
  to this batch of work but fixed the same day).

## 8. Explicitly NOT built yet — Inventory module + Inquiry ticketing

This was described in the same conversation but is a distinct subsystem large enough that it
wasn't guess-built. Recorded here so the shape isn't lost before it's picked up.

**What was described:**
- A new **Inventory** module. Read access is shared (everyone can view all inventory), but each
  user can only **edit their own** list/entries — view-all, edit-own.
- A new **inquiry/inventory user role**, distinct from admin/manager/pic, responsible for
  uploading and editing inventory.
- Every Inquiry the sales team (PICs) creates should route to this inventory/inquiry person
  **as a ticket** — "should work like a ticketing system."

**Open questions that need answers before this gets built** (guessing wrong here means
rebuilding a whole subsystem, so these are worth getting from the team directly rather than
assumed):

1. **Inventory item shape** — what fields does one inventory record actually have? (Container
   size/condition/location/quantity-on-hand/status? Something else entirely?)
2. **Ticket trigger** — does *every* Inquiry automatically become a ticket for the
   inventory/inquiry person, or only ones that need an inventory check (e.g. a specific
   size/condition combination)?
3. **Ticket lifecycle** — does the inventory/inquiry person *claim* tickets from a shared queue,
   or are they auto-assigned? What actions can they take (confirm availability, reject,
   reserve units against a specific inquiry)? What state does a ticket end in, and does that
   state feed back into the Inquiry's own status?
4. **Ownership boundary** — "edit your list but view-only in others' data": is "your list" scoped
   per-user, per-PIC, per-territory, or something else? Can an admin/manager edit anyone's
   inventory, or is it strictly per-owner even for them?
5. **Role permissions** — should this new role be able to see the sales pipeline (Prospects/Warm
   Leads/Inquiries/Quotations/Sales) at all, or only the ticket queue and inventory?
6. **Relationship to the existing Container Catalog** — the app already has
   `container_categories`/`sizes`/`conditions`/`availability` tables (see spec §12 in the original
   project doc). Is "Inventory" the same thing as `container_availability`, a superset of it, or
   a genuinely separate concept (e.g. tracking specific physical units by serial/unit number
   rather than aggregate quantity)?

**Do not start building this without the above answered** — the risk of guessing wrong on the
ticket-routing model in particular is a rebuild, not a patch.

## 9. Also still pending (from earlier in this project, unrelated to today's batch)

- **Spreadsheet/Excel-style grid behavior** (Tab/Enter navigation, multi-cell selection,
  vertical/horizontal paste-fill, column resize, sticky headers, frozen columns, sort, filter)
  across Prospects/Warm Leads/Inquiries. Scoped and deferred earlier in favor of the data-model
  work in this document — `react-data-grid` is already in `frontend/package.json` (added on the
  `denrei` branch, unused so far) and AG Grid Community was the chosen direction when this was
  last discussed. Neither has been wired up yet.
- Customer Accounts (Active/Floating classification), Best Clients analytics, Contracts/Pickups —
  still Phase 8/9 per the original roadmap, not part of this round.

## 10. Migration log for this round

| Migration | What it did |
|---|---|
| `20260827010000_017` | Warm Lead stays active after Inquiry creation; `create_manual_prospect`; `create_manual_sale`; extended `remove_pipeline_entry` to Quotations. |
| `20260827011000_018` | Dropped the leftover unique index that still capped a Warm Lead at one Inquiry despite 017's logic change. |
| `20260827012000_019` | Fixed `find_or_create_company_contact` to fall back to an email/phone-derived name instead of leaving `contact_id` NULL when no name is given; added a clear error to `create_manual_warm_lead` for the case where nothing identifying is given at all. |
