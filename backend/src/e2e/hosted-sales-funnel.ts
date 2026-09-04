import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

if (process.env.ALLOW_HOSTED_E2E !== 'true') {
  throw new Error('Refusing hosted writes. Set ALLOW_HOSTED_E2E=true for an intentional disposable test.');
}

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const stamp = Date.now();
const email = `crm-e2e-${stamp}@example.test`;
const companyName = `CRM E2E ${stamp}`;
const noContactEmail = `crm-e2e-nocontact-${stamp}@example.test`;
const noContactCompanyName = `CRM E2E No Contact ${stamp}`;
const password = `E2e-${randomBytes(18).toString('base64url')}!`;
const strangerEmail = `crm-e2e-stranger-${stamp}@example.test`;
const strangerPassword = `E2e-Stranger-${randomBytes(18).toString('base64url')}!`;
const batchIds = [randomUUID(), randomUUID()];
const ids: Record<string, string | undefined> = {};
const manualWarmLeadCompany = `CRM E2E Manual WL ${stamp}`;
const manualInquiryStandaloneCompany = `CRM E2E Standalone Inquiry ${stamp}`;

const publicClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const request = async (token: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`${init.method ?? 'GET'} ${path}: ${body.error?.message ?? response.statusText}`);
  }
  return body;
};

const deleteWhereIn = async (table: string, column: string, values: (string | undefined)[]) => {
  const present = values.filter((value): value is string => Boolean(value));
  if (!present.length) return;
  const { error } = await supabaseAdmin.from(table).delete().in(column, present);
  if (error) throw new Error(`Cleanup ${table}: ${error.message}`);
};

const cleanup = async () => {
  await deleteWhereIn('domain_events', 'entity_id', [
    ids.prospect, ids.warmLead, ids.inquiry, ids.rejectedQuotation, ids.quotation, ids.sale,
    ids.manualWarmLead, ids.manualInquiry, ids.standaloneInquiry,
    ids.backfilledWarmLead,
  ]);
  await deleteWhereIn('sales', 'id', [ids.sale]);
  await deleteWhereIn('quotation_items', 'quotation_id', [ids.rejectedQuotation, ids.quotation]);
  await deleteWhereIn('quotations', 'id', [ids.rejectedQuotation, ids.quotation]);
  // A backfilled Warm Lead points to its source Inquiry, while ordinary Inquiries point
  // to their source Warm Lead, so clean the two directions in dependency order.
  await deleteWhereIn('warm_leads', 'id', [ids.backfilledWarmLead]);
  await deleteWhereIn('inquiries', 'id', [ids.inquiry, ids.manualInquiry, ids.standaloneInquiry]);
  await deleteWhereIn('warm_leads', 'id', [ids.warmLead, ids.manualWarmLead]);
  await deleteWhereIn('prospect_clients', 'id', [ids.prospect, ids.noContactProspect]);
  await deleteWhereIn('import_staging_conflicts', 'batch_id', batchIds);
  await deleteWhereIn('import_rows', 'batch_id', batchIds);
  await deleteWhereIn('import_batches', 'id', batchIds);
  if (ids.company && ids.contact) {
    const { error } = await supabaseAdmin.from('company_contacts').delete()
      .eq('company_id', ids.company).eq('contact_id', ids.contact);
    if (error) throw new Error(`Cleanup company_contacts: ${error.message}`);
  }
  await deleteWhereIn('contacts', 'id', [ids.contact, ids.manualWarmLeadContact, ids.standaloneContact]);
  await deleteWhereIn('companies', 'id', [ids.company, ids.noContactCompany, ids.manualWarmLeadCompanyId, ids.standaloneCompanyId]);
  await deleteWhereIn('pics', 'id', [ids.pic, ids.strangerPic]);
  if (ids.strangerUser) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(ids.strangerUser);
    if (error) throw new Error(`Cleanup stranger auth user: ${error.message}`);
  }
  if (ids.user) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(ids.user);
    if (error) throw new Error(`Cleanup auth user: ${error.message}`);
  }
};

const run = async () => {
  const health = await fetch(apiBase.replace(/\/api\/v1$/, '/api/health'));
  if (!health.ok) throw new Error(`Backend health check failed: ${health.status}`);

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `crm_e2e_${stamp}`, full_name: 'CRM E2E Tester' },
  });
  if (createError || !created.user) throw createError ?? new Error('Temporary user was not created');
  ids.user = created.user.id;

  const { error: roleError } = await supabaseAdmin.from('profiles').update({ role: 'sales_manager' }).eq('id', ids.user);
  if (roleError) throw roleError;

  // Data-silos identity chain (see docs/ACCOUNT_MODULE.md): a profile owns nothing in the
  // pipeline until it has a PIC identity. handle_new_user() (025_auto_pic_creation.sql)
  // creates one automatically on signup -- inserting a second one here would violate the
  // one-active-PIC-per-profile constraint (028_unique_active_pic_per_profile.sql), so just
  // read back the auto-created row (needed below for cleanup).
  const { data: pic, error: picError } = await supabaseAdmin
    .from('pics')
    .select('id')
    .eq('profile_id', ids.user)
    .eq('status', 'active')
    .single();
  if (picError || !pic) throw picError ?? new Error('Signup did not auto-create a PIC identity');
  ids.pic = pic.id;

  const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw signInError ?? new Error('Temporary user could not sign in');
  const token = signedIn.session.access_token;

  const importBody = (batchId: string) => JSON.stringify({
    batch_id: batchId,
    filename: 'hosted-e2e.xlsx',
    rows: [
      {
        company_name: companyName,
        contact_person: 'CRM E2E Contact',
        email_active: email,
        category: 'Proceed',
        industry: 'Automated Test',
      },
      // A row with a company name but no named contact (common in raw source data like
      // carrier registries) must create the company alone, not get rejected outright.
      {
        company_name: noContactCompanyName,
        email_active: noContactEmail,
        category: 'Proceed',
        industry: 'Automated Test',
      },
      // A row with NO company name at all (e.g. an incomplete FMCSA record with only fleet/
      // insurance data) must not be silently discarded -- it should be recorded in import
      // history with a specific reason and its raw data preserved, not create a company.
      {
        address: `${stamp} No Company Rd`,
        city: 'Nowhere',
      },
    ],
  });

  const firstImport = await request(token, '/data/imports', { method: 'POST', body: importBody(batchIds[0]) });
  if (firstImport.data.importedCount !== 2 || firstImport.data.withoutContactCount !== 1 || firstImport.data.errorCount !== 1) {
    throw new Error(`Expected 2 imported (1 missing a contact) and 1 recorded error, got ${JSON.stringify(firstImport.data)}`);
  }
  const conflicts = await request(token, '/data/imports/conflicts');
  const noNameRow = conflicts.data.find((row: any) => row.raw_data?.address === `${stamp} No Company Rd`);
  if (!noNameRow || noNameRow.status !== 'error' || !/company name/i.test(noNameRow.reason ?? '')) {
    throw new Error(`Missing-company-name row was not preserved in import history: ${JSON.stringify(noNameRow)}`);
  }

  const secondImport = await request(token, '/data/imports', { method: 'POST', body: importBody(batchIds[1]) });
  if (secondImport.data.importedCount !== 0 || secondImport.data.duplicateCount !== 2 || secondImport.data.errorCount !== 1) {
    throw new Error(`Re-import expected both real rows flagged as duplicates and the no-name row recorded again, got ${JSON.stringify(secondImport.data)}`);
  }

  let list = await request(token, `/leads/prospects?search=${encodeURIComponent(email)}`);
  if (list.data.length !== 1) throw new Error(`Duplicate-safe import expected 1 prospect, found ${list.data.length}`);
  ids.prospect = list.data[0].id;
  ids.company = list.data[0].company_id;
  ids.contact = list.data[0].contact_id;

  const noContactList = await request(token, `/leads/prospects?search=${encodeURIComponent(noContactCompanyName)}`);
  if (noContactList.data.length !== 1 || noContactList.data[0].contact_id) {
    throw new Error('Company-only prospect (no named contact) was not created correctly');
  }
  ids.noContactProspect = noContactList.data[0].id;
  ids.noContactCompany = noContactList.data[0].company_id;

  const warm = await request(token, `/leads/prospects/${ids.prospect}/convert-to-warm-lead`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Replied positively to outreach email', channel: 'Email' }),
  });
  ids.warmLead = warm.data.id;
  list = await request(token, `/leads/prospects?search=${encodeURIComponent(email)}`);
  if (list.data.length) throw new Error('Converted prospect remained in the active prospect list');

  const convertedList = await request(token, `/leads/prospects?status=converted&search=${encodeURIComponent(email)}`);
  const convertedRow = convertedList.data[0];
  if (convertedRow?.id !== ids.prospect || convertedRow?.conversion_reason !== 'Replied positively to outreach email' || convertedRow?.conversion_channel !== 'Email') {
    throw new Error(`status=converted did not surface the conversion reason/channel: ${JSON.stringify(convertedRow)}`);
  }
  const allList = await request(token, `/leads/prospects?status=all&search=${encodeURIComponent(email)}`);
  if (!allList.data.some((row: any) => row.id === ids.prospect)) {
    throw new Error('status=all did not include the converted prospect');
  }

  const manualWarm = await request(token, '/leads/warm-leads', {
    method: 'POST',
    body: JSON.stringify({
      companyName: manualWarmLeadCompany,
      contactPerson: 'Old Contact Person',
      phone: '3035550199',
      stateProvince: 'CO',
      country: 'US',
      notes: 'Called years ago, no inquiry record on file',
      previousInquiryIndicator: true,
      source: 'Referral',
      followUpNotes: 'Call back next quarter',
    }),
  });
  ids.manualWarmLead = manualWarm.data.id;
  ids.manualWarmLeadCompanyId = manualWarm.data.company_id;
  ids.manualWarmLeadContact = manualWarm.data.contact_id;
  if (manualWarm.data.state_province !== 'CO' || manualWarm.data.source !== 'Referral' || manualWarm.data.previous_inquiry_indicator !== true || manualWarm.data.entry_origin !== 'direct') {
    throw new Error(`Manual warm lead did not persist expected fields: ${JSON.stringify(manualWarm.data)}`);
  }

  const sizes = await request(token, '/catalog/sizes');
  const conditions = await request(token, '/catalog/conditions');
  if (!sizes.data.length || !conditions.data.length) throw new Error('Container catalog is not seeded');

  // Manual Warm Lead -> Inquiry: no source Prospect anywhere in this chain, and the
  // inquiry should inherit the warm lead's state/country since none is given explicitly.
  const manualInquiry = await request(token, '/leads/inquiries', {
    method: 'POST',
    body: JSON.stringify({
      warmLeadId: ids.manualWarmLead,
      containerSizeId: sizes.data[0].id,
      containerConditionId: conditions.data[0].id,
      quantity: 1,
      askingPrice: 4200,
      requirements: 'One 20ft container',
      specialRequirements: 'Needs liftgate delivery',
      remarks: 'Called from a referral list',
      followUpDate: '2026-10-01',
    }),
  });
  ids.manualInquiry = manualInquiry.data.id;
  if (
    manualInquiry.data.source_warm_lead_id !== ids.manualWarmLead
    || manualInquiry.data.entry_origin !== 'warm_lead_conversion'
    || Number(manualInquiry.data.asking_price) !== 4200
    || manualInquiry.data.special_requirements !== 'Needs liftgate delivery'
    || manualInquiry.data.state_province !== 'CO'
  ) {
    throw new Error(`Manual-warm-lead inquiry did not persist expected fields: ${JSON.stringify(manualInquiry.data)}`);
  }

  // Existing Contact/Customer -> Manual Inquiry: fully standalone, no Warm Lead at all.
  const standaloneInquiry = await request(token, '/leads/inquiries', {
    method: 'POST',
    body: JSON.stringify({
      companyName: manualInquiryStandaloneCompany,
      contactPerson: 'Standalone Contact',
      email: `crm-e2e-standalone-${stamp}@example.test`,
      stateProvince: 'TX',
      country: 'US',
      containerSizeId: sizes.data[0].id,
      containerConditionId: conditions.data[0].id,
      quantity: 3,
      remarks: 'Existing customer calling in directly',
    }),
  });
  ids.standaloneInquiry = standaloneInquiry.data.id;
  ids.standaloneCompanyId = standaloneInquiry.data.company_id;
  ids.standaloneContact = standaloneInquiry.data.contact_id;
  if (standaloneInquiry.data.source_warm_lead_id || standaloneInquiry.data.entry_origin !== 'direct' || standaloneInquiry.data.state_province !== 'TX' || standaloneInquiry.data.quantity !== 3) {
    throw new Error(`Standalone manual inquiry did not persist expected fields: ${JSON.stringify(standaloneInquiry.data)}`);
  }

  // A different Sales Manager may see only their own silo and cannot backfill this PIC's
  // direct Inquiry even if they know its UUID.
  const { data: strangerCreated, error: strangerCreateError } = await supabaseAdmin.auth.admin.createUser({
    email: strangerEmail,
    password: strangerPassword,
    email_confirm: true,
    user_metadata: { username: `crm_e2e_stranger_${stamp}`, full_name: 'CRM E2E Stranger' },
  });
  if (strangerCreateError || !strangerCreated.user) throw strangerCreateError ?? new Error('Temporary stranger user was not created');
  ids.strangerUser = strangerCreated.user.id;
  const { error: strangerRoleError } = await supabaseAdmin.from('profiles').update({ role: 'sales_manager' }).eq('id', ids.strangerUser);
  if (strangerRoleError) throw strangerRoleError;
  const { data: strangerPic, error: strangerPicError } = await supabaseAdmin.from('pics').select('id').eq('profile_id', ids.strangerUser).eq('status', 'active').single();
  if (strangerPicError || !strangerPic) throw strangerPicError ?? new Error('Stranger PIC was not created');
  ids.strangerPic = strangerPic.id;
  const { data: strangerSignedIn, error: strangerSignInError } = await publicClient.auth.signInWithPassword({ email: strangerEmail, password: strangerPassword });
  if (strangerSignInError || !strangerSignedIn.session) throw strangerSignInError ?? new Error('Stranger could not sign in');

  const crossPicBackfill = await fetch(`${apiBase}/leads/inquiries/${ids.standaloneInquiry}/add-to-warm-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${strangerSignedIn.session.access_token}` },
  });
  // Assert the specific code, not just "not 2xx" -- a 500 from an unexpected crash would
  // have satisfied a bare !ok check while hiding a real failure. Owning the wrong PIC is
  // an authorization failure and must read as one.
  if (crossPicBackfill.status !== 403) {
    throw new Error(`Cross-PIC Inquiry backfill should return 403, got ${crossPicBackfill.status}`);
  }

  // A missing Inquiry is a 404, not a malformed request.
  const missingInquiryBackfill = await fetch(`${apiBase}/leads/inquiries/${randomUUID()}/add-to-warm-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (missingInquiryBackfill.status !== 404) {
    throw new Error(`Backfill of an unknown Inquiry should return 404, got ${missingInquiryBackfill.status}`);
  }

  // A malformed id must return one readable message, not a serialised ZodError.
  const malformedBackfill = await fetch(`${apiBase}/leads/inquiries/not-a-uuid/add-to-warm-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const malformedBody = await malformedBackfill.json().catch(() => ({} as any));
  if (malformedBackfill.status !== 400 || typeof malformedBody?.error?.message !== 'string' || malformedBody.error.message.trim().startsWith('[')) {
    throw new Error(`Malformed Inquiry id should return a 400 with a readable message, got ${malformedBackfill.status}: ${JSON.stringify(malformedBody)}`);
  }

  const backfilled = await request(token, `/leads/inquiries/${ids.standaloneInquiry}/add-to-warm-leads`, { method: 'POST' });
  ids.backfilledWarmLead = backfilled.data.id;
  if (backfilled.data.source_inquiry_id !== ids.standaloneInquiry || backfilled.data.entry_origin !== 'inquiry_backfill' || backfilled.data.company_id !== ids.standaloneCompanyId) {
    throw new Error(`Inquiry backfill did not preserve identity and origin: ${JSON.stringify(backfilled.data)}`);
  }

  const repeatedBackfill = await request(token, `/leads/inquiries/${ids.standaloneInquiry}/add-to-warm-leads`, { method: 'POST' });
  if (repeatedBackfill.data.id !== ids.backfilledWarmLead) throw new Error('Repeated Inquiry backfill created a duplicate Warm Lead');

  const directInquiryList = await request(token, `/leads/inquiries?search=${encodeURIComponent(`crm-e2e-standalone-${stamp}@example.test`)}`);
  const directInquiryRow = directInquiryList.data.find((row: any) => row.id === ids.standaloneInquiry);
  const linkedBackfill = Array.isArray(directInquiryRow?.backfilled_warm_leads)
    ? directInquiryRow.backfilled_warm_leads[0]
    : directInquiryRow?.backfilled_warm_leads;
  if (directInquiryRow?.entry_origin !== 'direct' || linkedBackfill?.id !== ids.backfilledWarmLead || directInquiryRow?.status !== 'Pending Validation') {
    throw new Error(`Backfill changed the Inquiry or failed to expose its relationship: ${JSON.stringify(directInquiryRow)}`);
  }

  const quoteDirectWhilePending = await fetch(`${apiBase}/deals/quotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ inquiry_id: ids.standaloneInquiry, items: [{ description: 'Must remain blocked', quantity: 1, unit_price: 1 }] }),
  });
  if (quoteDirectWhilePending.ok) throw new Error('Direct Inquiry bypassed Procurement validation after Warm Lead backfill');

  const inquiry = await request(token, `/leads/warm-leads/${ids.warmLead}/create-inquiry`, {
    method: 'POST',
    body: JSON.stringify({
      containerSizeId: sizes.data[0].id,
      containerConditionId: conditions.data[0].id,
      quantity: 2,
      neededByDate: '2026-09-15',
      requirements: 'Two 40ft E2E test containers',
    }),
  });
  ids.inquiry = inquiry.data.id;
  // Business rule (see 031_inquiry_ticketing_and_notifications.sql): every new inquiry is a
  // ticket that starts unquotable until Procurement approves it.
  if (inquiry.data.status !== 'Pending Validation') {
    throw new Error(`New inquiry ticket did not start at Pending Validation: ${JSON.stringify(inquiry.data)}`);
  }
  const quoteWhilePendingRejected = await fetch(`${apiBase}/deals/quotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ inquiry_id: ids.inquiry, items: [{ description: 'Should be rejected', quantity: 1, unit_price: 1 }] }),
  });
  if (quoteWhilePendingRejected.ok) throw new Error('Quoting an inquiry still Pending Validation was not rejected');

  const { data: approved, error: approveError } = await supabaseAdmin
    .rpc('validate_inquiry_ticket', { p_inquiry_id: ids.inquiry, p_actor_id: ids.user, p_approved: true })
    .single();
  if (approveError || (approved as any)?.status !== 'Under Review') {
    throw new Error(`Ticket approval did not transition to Under Review: ${JSON.stringify(approveError ?? approved)}`);
  }

  // Business rule (see 017_manual_prospect_sale_and_flow_fixes.sql): creating an inquiry from
  // a warm lead does NOT remove it from the active Warm Leads list -- it stays visible and
  // can generate further inquiries later.
  list = await request(token, `/leads/warm-leads?search=${encodeURIComponent(email)}`);
  if (list.data.length !== 1 || list.data[0].id !== ids.warmLead) {
    throw new Error('Warm lead did not stay visible in the active list after creating an inquiry');
  }

  const inquiryList = await request(token, `/leads/inquiries?search=${encodeURIComponent(email)}`);
  const inquiryRow = inquiryList.data[0];
  if (
    inquiryRow?.quantity !== 2
    || inquiryRow?.container_sizes?.id !== sizes.data[0].id
    || inquiryRow?.container_conditions?.id !== conditions.data[0].id
    || inquiryRow?.needed_by_date !== '2026-09-15'
  ) {
    throw new Error('Inquiry did not persist container size/condition/quantity/needed-by date');
  }

  const rejectedQuotation = await request(token, '/deals/quotations', {
    method: 'POST',
    body: JSON.stringify({
      inquiry_id: ids.inquiry,
      items: [{ description: '40ft E2E test container (first offer)', quantity: 2, unit_price: 5500 }],
    }),
  });
  ids.rejectedQuotation = rejectedQuotation.data.id;
  list = await request(token, `/leads/inquiries?search=${encodeURIComponent(email)}`);
  if (list.data.length) throw new Error('Quoted inquiry remained in the active inquiry list');

  await request(token, `/deals/quotations/${ids.rejectedQuotation}/status`, {
    method: 'PATCH', body: JSON.stringify({ status: 'Rejected' }),
  });
  list = await request(token, `/leads/inquiries?search=${encodeURIComponent(email)}`);
  if (list.data.length !== 1 || list.data[0].id !== ids.inquiry) {
    throw new Error('Inquiry did not become re-quotable after quotation rejection');
  }

  const quotation = await request(token, '/deals/quotations', {
    method: 'POST',
    body: JSON.stringify({
      inquiry_id: ids.inquiry,
      items: [{ description: '40ft E2E test container', quantity: 2, unit_price: 5000 }],
    }),
  });
  ids.quotation = quotation.data.id;
  if (ids.quotation === ids.rejectedQuotation) {
    throw new Error('Requoting returned the rejected quotation instead of creating a new one');
  }
  list = await request(token, `/leads/inquiries?search=${encodeURIComponent(email)}`);
  if (list.data.length) throw new Error('Re-quoted inquiry remained in the active inquiry list');

  const convertedStatusRejected = await fetch(`${apiBase}/deals/quotations/${ids.quotation}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'Converted' }),
  });
  if (convertedStatusRejected.ok) {
    throw new Error('PATCH status accepted an illegal direct transition to Converted');
  }

  await request(token, `/deals/quotations/${ids.quotation}/status`, {
    method: 'PATCH', body: JSON.stringify({ status: 'Accepted' }),
  });
  const sale = await request(token, `/deals/quotations/${ids.quotation}/convert-to-sale`, {
    method: 'POST', body: JSON.stringify({ total_units: 2, buying_cost: 7000, revenue: 10000 }),
  });
  ids.sale = sale.data.id;

  // The quotation list intentionally returns every status, including Converted and
  // Rejected -- the Quotations screen has a "Converted" summary card and a Converted
  // filter option, both of which would always read zero if the API hid them. So assert
  // the status actually transitioned rather than that the row disappeared.
  const quotes = await request(token, '/deals/quotations');
  const convertedQuote = quotes.data.find((row: any) => row.id === ids.quotation);
  if (!convertedQuote) {
    throw new Error('Converted quotation is missing from the quotation list');
  }
  if (convertedQuote.status !== 'Converted') {
    throw new Error(`Quotation status after conversion should be Converted, got ${convertedQuote.status}`);
  }
  const sales = await request(token, '/deals/sales');
  const recorded = sales.data.find((row: any) => row.id === ids.sale);
  if (!recorded || Number(recorded.gross_profit) !== 3000 || recorded.status !== 'Won') {
    throw new Error('Recorded sale totals or status are incorrect');
  }

  const modifyConvertedRejected = await fetch(`${apiBase}/deals/quotations/${ids.quotation}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'Sent' }),
  });
  if (modifyConvertedRejected.ok) {
    throw new Error('PATCH status allowed modifying an already-Converted quotation');
  }

  console.log('PASS hosted API: auth -> duplicate-safe import -> prospect -> direct/converted warm leads -> linked/direct inquiries -> idempotent inquiry backfill + PIC guard -> validation -> quotation -> sale -> immutability guards');
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
