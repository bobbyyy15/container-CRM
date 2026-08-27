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
  ]);
  await deleteWhereIn('sales', 'id', [ids.sale]);
  await deleteWhereIn('quotation_items', 'quotation_id', [ids.rejectedQuotation, ids.quotation]);
  await deleteWhereIn('quotations', 'id', [ids.rejectedQuotation, ids.quotation]);
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
  if (manualWarm.data.state_province !== 'CO' || manualWarm.data.source !== 'Referral' || manualWarm.data.previous_inquiry_indicator !== true) {
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
  if (standaloneInquiry.data.source_warm_lead_id || standaloneInquiry.data.state_province !== 'TX' || standaloneInquiry.data.quantity !== 3) {
    throw new Error(`Standalone manual inquiry did not persist expected fields: ${JSON.stringify(standaloneInquiry.data)}`);
  }

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
  list = await request(token, `/leads/warm-leads?search=${encodeURIComponent(email)}`);
  if (list.data.length) throw new Error('Converted warm lead remained in the active warm-lead list');

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

  const quotes = await request(token, '/deals/quotations');
  if (quotes.data.some((row: any) => row.id === ids.quotation)) {
    throw new Error('Converted quotation remained in the active quotation list');
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

  console.log('PASS hosted API: auth -> duplicate-safe import -> prospect -> warm lead (+reason/channel, status filter) -> manual warm lead -> manual inquiries (linked + standalone) -> inquiry -> reject+requote -> accepted -> sale -> immutability guards');
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
