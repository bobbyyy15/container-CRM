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
const password = `E2e-${randomBytes(18).toString('base64url')}!`;
const batchIds = [randomUUID(), randomUUID()];
const ids: Record<string, string | undefined> = {};

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
  await deleteWhereIn('domain_events', 'entity_id', [ids.prospect, ids.warmLead, ids.inquiry, ids.rejectedQuotation, ids.quotation, ids.sale]);
  await deleteWhereIn('sales', 'id', [ids.sale]);
  await deleteWhereIn('quotation_items', 'quotation_id', [ids.rejectedQuotation, ids.quotation]);
  await deleteWhereIn('quotations', 'id', [ids.rejectedQuotation, ids.quotation]);
  await deleteWhereIn('inquiries', 'id', [ids.inquiry]);
  await deleteWhereIn('warm_leads', 'id', [ids.warmLead]);
  await deleteWhereIn('prospect_clients', 'id', [ids.prospect]);
  await deleteWhereIn('import_staging_conflicts', 'batch_id', batchIds);
  await deleteWhereIn('import_rows', 'batch_id', batchIds);
  await deleteWhereIn('import_batches', 'id', batchIds);
  if (ids.company && ids.contact) {
    const { error } = await supabaseAdmin.from('company_contacts').delete()
      .eq('company_id', ids.company).eq('contact_id', ids.contact);
    if (error) throw new Error(`Cleanup company_contacts: ${error.message}`);
  }
  await deleteWhereIn('contacts', 'id', [ids.contact]);
  await deleteWhereIn('companies', 'id', [ids.company]);
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

  const { error: roleError } = await supabaseAdmin.from('profiles').update({ role: 'manager' }).eq('id', ids.user);
  if (roleError) throw roleError;

  const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw signInError ?? new Error('Temporary user could not sign in');
  const token = signedIn.session.access_token;

  const importBody = (batchId: string) => JSON.stringify({
    batch_id: batchId,
    filename: 'hosted-e2e.xlsx',
    rows: [{
      company_name: companyName,
      contact_person: 'CRM E2E Contact',
      email_active: email,
      category: 'Proceed',
      industry: 'Automated Test',
    }],
  });

  await request(token, '/data/imports', { method: 'POST', body: importBody(batchIds[0]) });
  await request(token, '/data/imports', { method: 'POST', body: importBody(batchIds[1]) });

  let list = await request(token, `/leads/prospects?search=${encodeURIComponent(email)}`);
  if (list.data.length !== 1) throw new Error(`Duplicate-safe import expected 1 prospect, found ${list.data.length}`);
  ids.prospect = list.data[0].id;
  ids.company = list.data[0].company_id;
  ids.contact = list.data[0].contact_id;

  const warm = await request(token, `/leads/prospects/${ids.prospect}/convert-to-warm-lead`, { method: 'POST' });
  ids.warmLead = warm.data.id;
  list = await request(token, `/leads/prospects?search=${encodeURIComponent(email)}`);
  if (list.data.length) throw new Error('Converted prospect remained in the active prospect list');

  const sizes = await request(token, '/catalog/sizes');
  const conditions = await request(token, '/catalog/conditions');
  if (!sizes.data.length || !conditions.data.length) throw new Error('Container catalog is not seeded');

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

  console.log('PASS hosted API: auth -> duplicate-safe import -> prospect -> warm lead -> inquiry -> reject+requote -> accepted -> sale -> immutability guards');
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
