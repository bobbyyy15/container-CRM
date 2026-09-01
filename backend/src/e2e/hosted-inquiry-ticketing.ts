import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

if (process.env.ALLOW_HOSTED_E2E !== 'true') {
  throw new Error('Refusing hosted writes. Set ALLOW_HOSTED_E2E=true for an intentional disposable test.');
}

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const stamp = Date.now();
const salesEmail = `crm-e2e-sales-${stamp}@example.test`;
const procEmail = `crm-e2e-proc-${stamp}@example.test`;
const companyA = `CRM E2E Ticket A ${stamp}`;
const companyB = `CRM E2E Ticket B ${stamp}`;
const password = `E2e-${randomBytes(18).toString('base64url')}!`;
const ids: Record<string, string | undefined> = {};

const publicClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const request = async (token: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`${init.method ?? 'GET'} ${path}: ${body.error?.message ?? response.statusText}`);
  }
  return body;
};

const cleanup = async () => {
  await supabaseAdmin.from('notifications').delete().in('profile_id', [ids.salesUser, ids.procUser].filter(Boolean) as string[]);
  await supabaseAdmin.from('quotation_items').delete().in('quotation_id', [ids.quotationA, ids.quotationB].filter(Boolean) as string[]);
  await supabaseAdmin.from('quotations').delete().in('id', [ids.quotationA, ids.quotationB].filter(Boolean) as string[]);
  await supabaseAdmin.from('inquiries').delete().in('id', [ids.inquiryA, ids.inquiryB].filter(Boolean) as string[]);
  await supabaseAdmin.from('prospect_clients').delete().in('id', [ids.prospectA, ids.prospectB].filter(Boolean) as string[]);
  for (const [companyId, contactId] of [[ids.companyA, ids.contactA], [ids.companyB, ids.contactB]] as const) {
    if (companyId && contactId) await supabaseAdmin.from('company_contacts').delete().eq('company_id', companyId).eq('contact_id', contactId);
  }
  await supabaseAdmin.from('contacts').delete().in('id', [ids.contactA, ids.contactB].filter(Boolean) as string[]);
  await supabaseAdmin.from('companies').delete().in('id', [ids.companyA, ids.companyB].filter(Boolean) as string[]);
  await supabaseAdmin.from('pics').delete().in('profile_id', [ids.salesUser, ids.procUser].filter(Boolean) as string[]);
  if (ids.salesUser) await supabaseAdmin.auth.admin.deleteUser(ids.salesUser);
  if (ids.procUser) await supabaseAdmin.auth.admin.deleteUser(ids.procUser);
};

const run = async () => {
  const { data: salesUser, error: salesErr } = await supabaseAdmin.auth.admin.createUser({
    email: salesEmail, password, email_confirm: true, user_metadata: { username: `crm_e2e_sales_${stamp}` },
  });
  if (salesErr || !salesUser.user) throw salesErr ?? new Error('Sales manager was not created');
  ids.salesUser = salesUser.user.id;
  await supabaseAdmin.from('profiles').update({ role: 'sales_manager' }).eq('id', ids.salesUser);

  const { data: procUser, error: procErr } = await supabaseAdmin.auth.admin.createUser({
    email: procEmail, password, email_confirm: true, user_metadata: { username: `crm_e2e_proc_${stamp}` },
  });
  if (procErr || !procUser.user) throw procErr ?? new Error('Procurement user was not created');
  ids.procUser = procUser.user.id;
  await supabaseAdmin.from('profiles').update({ role: 'procurement' }).eq('id', ids.procUser);

  const { data: salesIn } = await publicClient.auth.signInWithPassword({ email: salesEmail, password });
  const salesToken = salesIn!.session!.access_token;
  const { data: procIn } = await publicClient.auth.signInWithPassword({ email: procEmail, password });
  const procToken = procIn!.session!.access_token;

  const sizes = await request(salesToken, '/catalog/sizes');
  const conditions = await request(salesToken, '/catalog/conditions');

  // --- Ticket A: will be approved ---
  const ticketA = await request(salesToken, '/leads/inquiries', {
    method: 'POST',
    body: JSON.stringify({
      companyName: companyA, contactPerson: 'Ticket A Contact', email: `crm-e2e-a-${stamp}@example.test`,
      stateProvince: 'TX', country: 'US',
      containerSizeId: sizes.data[0].id, containerConditionId: conditions.data[0].id,
      quantity: 2, askingPrice: 4000, requirements: 'Need 2x 20ft for warehouse overflow',
    }),
  });
  ids.inquiryA = ticketA.data.id;
  ids.companyA = ticketA.data.company_id;
  ids.contactA = ticketA.data.contact_id;
  if (ticketA.data.status !== 'Pending Validation') throw new Error(`Ticket A did not start Pending Validation: ${JSON.stringify(ticketA.data)}`);

  // Procurement's queue must show it (cross-silo), and NOT be blocked by pic_id filtering.
  const queue = await request(procToken, '/leads/inquiries/pending-validation');
  if (!queue.data.some((t: any) => t.id === ids.inquiryA)) {
    throw new Error(`Ticket A did not appear in Procurement's validation queue: ${JSON.stringify(queue.data.map((t: any) => t.id))}`);
  }

  // A sales_manager must not be able to see or hit the procurement-only queue/validate routes.
  const queueForbidden = await fetch(`${apiBase}/leads/inquiries/pending-validation`, {
    headers: { Authorization: `Bearer ${salesToken}` },
  });
  if (queueForbidden.ok) throw new Error('Sales manager was able to access the Procurement validation queue');

  // Notification fired to the Procurement user on ticket creation.
  const procNotifs = await request(procToken, '/notifications');
  const createdNotif = procNotifs.data.find((n: any) => n.entity_id === ids.inquiryA && n.type === 'inquiry_pending_validation');
  if (!createdNotif) throw new Error('Procurement was not notified of the new ticket');

  const approve = await request(procToken, `/leads/inquiries/${ids.inquiryA}/validate`, {
    method: 'POST', body: JSON.stringify({ approved: true }),
  });
  if (approve.data.status !== 'Under Review') throw new Error(`Approval did not transition to Under Review: ${JSON.stringify(approve.data)}`);

  // Re-validating an already-decided ticket must be rejected.
  const revalidateRejected = await fetch(`${apiBase}/leads/inquiries/${ids.inquiryA}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${procToken}` },
    body: JSON.stringify({ approved: true }),
  });
  if (revalidateRejected.ok) throw new Error('Re-validating an already-decided ticket was not rejected');

  // The Sales Manager who owns the ticket gets notified of the approval.
  const salesNotifs = await request(salesToken, '/notifications');
  const approvedNotif = salesNotifs.data.find((n: any) => n.entity_id === ids.inquiryA && n.type === 'inquiry_approved');
  if (!approvedNotif) throw new Error('Sales manager was not notified of ticket approval');
  if (approvedNotif.read) throw new Error('New notification was already marked read');

  const marked = await request(salesToken, `/notifications/${approvedNotif.id}/read`, { method: 'PATCH' });
  if (!marked.data.read) throw new Error('Marking a notification read did not persist');

  // Now that it's approved, it can be quoted.
  const quoteAllowed = await request(salesToken, '/deals/quotations', {
    method: 'POST',
    body: JSON.stringify({ inquiry_id: ids.inquiryA, items: [{ description: '20ft ticket-A container', quantity: 2, unit_price: 4000 }] }),
  });
  if (!quoteAllowed.data.id) throw new Error('Approved ticket could not be quoted');
  ids.quotationA = quoteAllowed.data.id;

  // --- Ticket B: will be rejected with a reason + alternative offer ---
  const ticketB = await request(salesToken, '/leads/inquiries', {
    method: 'POST',
    body: JSON.stringify({
      companyName: companyB, contactPerson: 'Ticket B Contact', email: `crm-e2e-b-${stamp}@example.test`,
      stateProvince: 'CA', country: 'US',
      containerSizeId: sizes.data[0].id, containerConditionId: conditions.data[0].id,
      quantity: 1, askingPrice: 500, requirements: 'Extremely low ask, likely below cost',
    }),
  });
  ids.inquiryB = ticketB.data.id;
  ids.companyB = ticketB.data.company_id;
  ids.contactB = ticketB.data.contact_id;

  const rejectNoReason = await fetch(`${apiBase}/leads/inquiries/${ids.inquiryB}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${procToken}` },
    body: JSON.stringify({ approved: false }),
  });
  if (rejectNoReason.ok) throw new Error('Rejecting a ticket with no reason was not rejected');

  const altSize = sizes.data[1] ?? sizes.data[0];
  const altCondition = conditions.data.find((c: any) => c.name === 'WWT') ?? conditions.data[1] ?? conditions.data[0];

  const reject = await request(procToken, `/leads/inquiries/${ids.inquiryB}/validate`, {
    method: 'POST',
    body: JSON.stringify({
      approved: false,
      rejectionReason: 'Asking price is below our minimum margin threshold',
      altContainerSizeId: altSize.id,
      altContainerConditionId: altCondition.id,
      altAskingPrice: 2200,
      altNotes: 'Wind & Watertight units at this size clear our margin floor',
    }),
  });
  if (
    reject.data.status !== 'Validation Rejected' || !reject.data.rejection_reason ||
    reject.data.alt_container_size_id !== altSize.id || reject.data.alt_container_condition_id !== altCondition.id ||
    Number(reject.data.alt_asking_price) !== 2200
  ) {
    throw new Error(`Rejection did not persist reason/structured alternative: ${JSON.stringify(reject.data)}`);
  }

  const quoteAfterRejectBlocked = await fetch(`${apiBase}/deals/quotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${salesToken}` },
    body: JSON.stringify({ inquiry_id: ids.inquiryB, items: [{ description: 'Should be rejected', quantity: 1, unit_price: 1 }] }),
  });
  if (quoteAfterRejectBlocked.ok) throw new Error('A rejected ticket could still be quoted');

  const salesNotifs2 = await request(salesToken, '/notifications');
  const rejectedNotif = salesNotifs2.data.find((n: any) => n.entity_id === ids.inquiryB && n.type === 'inquiry_rejected');
  if (!rejectedNotif || !rejectedNotif.message.includes('below our minimum margin') || !rejectedNotif.message.includes(altCondition.name)) {
    throw new Error(`Rejection notification missing reason/alternative summary: ${JSON.stringify(rejectedNotif)}`);
  }

  // A stranger sales_manager must not be able to apply an alternative on someone else's ticket.
  const strangerApplyForbidden = await fetch(`${apiBase}/leads/inquiries/${ids.inquiryB}/apply-alternative`, {
    method: 'POST', headers: { Authorization: `Bearer ${procToken}` },
  });
  if (strangerApplyForbidden.ok) throw new Error('Procurement (wrong role, and not the ticket owner) was able to apply the alternative');

  const applied = await request(salesToken, `/leads/inquiries/${ids.inquiryB}/apply-alternative`, { method: 'POST' });
  if (
    applied.data.status !== 'Under Review' || applied.data.container_size_id !== altSize.id ||
    applied.data.container_condition_id !== altCondition.id || Number(applied.data.asking_price) !== 2200 ||
    applied.data.alt_container_size_id !== null
  ) {
    throw new Error(`Applying the alternative did not update the ticket in place: ${JSON.stringify(applied.data)}`);
  }

  const quoteAfterApply = await request(salesToken, '/deals/quotations', {
    method: 'POST',
    body: JSON.stringify({ inquiry_id: ids.inquiryB, items: [{ description: 'WWT alternative container', quantity: 1, unit_price: 2200 }] }),
  });
  if (!quoteAfterApply.data.id) throw new Error('Ticket with an applied alternative could not be quoted');
  ids.quotationB = quoteAfterApply.data.id;

  console.log('PASS hosted inquiry ticketing: create -> Procurement queue (cross-silo, role-gated) -> notify on create -> approve -> notify + quotable -> re-validate rejected -> reject requires reason -> structured alternative -> notify -> blocked from quoting -> apply alternative (ownership-checked) -> quotable');
};

void (async () => {
  try {
    await run();
  } finally {
    await cleanup();
  }
})().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
