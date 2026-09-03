import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

if (process.env.ALLOW_HOSTED_E2E !== 'true') {
  throw new Error('Refusing hosted writes. Set ALLOW_HOSTED_E2E=true for an intentional disposable test.');
}

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const stamp = Date.now();
const email = `crm-e2e-contracts-${stamp}@example.test`;
const companyName = `CRM E2E Contracts ${stamp}`;
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
  await supabaseAdmin.from('contracts').delete().in('sale_id', [ids.sale].filter(Boolean) as string[]);
  await supabaseAdmin.from('sales').delete().in('id', [ids.sale].filter(Boolean) as string[]);
  await supabaseAdmin.from('quotation_items').delete().in('quotation_id', [ids.quotation].filter(Boolean) as string[]);
  await supabaseAdmin.from('quotations').delete().in('id', [ids.quotation].filter(Boolean) as string[]);
  await supabaseAdmin.from('inquiries').delete().in('id', [ids.inquiry].filter(Boolean) as string[]);
  await supabaseAdmin.from('prospect_clients').delete().in('id', [ids.prospect].filter(Boolean) as string[]);
  if (ids.company && ids.contact) {
    await supabaseAdmin.from('company_contacts').delete().eq('company_id', ids.company).eq('contact_id', ids.contact);
  }
  await supabaseAdmin.from('contacts').delete().in('id', [ids.contact].filter(Boolean) as string[]);
  await supabaseAdmin.from('companies').delete().in('id', [ids.company].filter(Boolean) as string[]);
  // stranger/ops are normally torn down inline mid-run; these are the fallbacks for a
  // mid-test failure, so a crashed run doesn't leak users or their auto-created PICs.
  const users = [ids.user, ids.stranger, ids.ops].filter(Boolean) as string[];
  await supabaseAdmin.from('pics').delete().in('profile_id', users);
  for (const id of users) await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
};

const run = async () => {
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `crm_e2e_contracts_${stamp}`, full_name: 'CRM E2E Contracts Tester' },
  });
  if (createError || !created.user) throw createError ?? new Error('Temporary user was not created');
  ids.user = created.user.id;
  const { error: roleError } = await supabaseAdmin.from('profiles').update({ role: 'sales_manager' }).eq('id', ids.user);
  if (roleError) throw roleError;

  const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw signInError ?? new Error('Temporary user could not sign in');
  const token = signedIn.session.access_token;

  const imported = await request(token, '/data/imports', {
    method: 'POST',
    body: JSON.stringify({
      filename: 'e2e-contracts.xlsx',
      rows: [{ company_name: companyName, contact_person: 'Contracts Tester', email_active: email, category: 'Proceed' }],
    }),
  });
  if (imported.data.importedCount !== 1) throw new Error(`Expected 1 imported row, got ${JSON.stringify(imported.data)}`);

  const list = await request(token, `/leads/prospects?search=${encodeURIComponent(email)}`);
  ids.prospect = list.data[0].id;
  ids.company = list.data[0].company_id;
  ids.contact = list.data[0].contact_id;

  const warm = await request(token, `/leads/prospects/${ids.prospect}/convert-to-warm-lead`, {
    method: 'POST', body: JSON.stringify({ reason: 'Test', channel: 'Email' }),
  });
  ids.warmLead = warm.data.id;

  const sizes = await request(token, '/catalog/sizes');
  const conditions = await request(token, '/catalog/conditions');

  const inquiry = await request(token, `/leads/warm-leads/${ids.warmLead}/create-inquiry`, {
    method: 'POST',
    body: JSON.stringify({ containerSizeId: sizes.data[0].id, containerConditionId: conditions.data[0].id, quantity: 1 }),
  });
  ids.inquiry = inquiry.data.id;

  await supabaseAdmin.rpc('validate_inquiry_ticket', { p_inquiry_id: ids.inquiry, p_actor_id: ids.user, p_approved: true }).single();

  const quotation = await request(token, '/deals/quotations', {
    method: 'POST',
    body: JSON.stringify({ inquiry_id: ids.inquiry, items: [{ description: '40ft E2E contract test container', quantity: 1, unit_price: 5000 }] }),
  });
  ids.quotation = quotation.data.id;

  await request(token, `/deals/quotations/${ids.quotation}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'Accepted' }) });
  const sale = await request(token, `/deals/quotations/${ids.quotation}/convert-to-sale`, {
    method: 'POST', body: JSON.stringify({ total_units: 1, buying_cost: 3000, revenue: 5000 }),
  });
  ids.sale = sale.data.id;

  // Contracts module
  const contract = await request(token, '/contracts', {
    method: 'POST', body: JSON.stringify({ sale_id: ids.sale, pickup_date: '2026-10-01' }),
  });
  ids.contract = contract.data.id;
  if (contract.data.pickup_status !== 'Pending' || !contract.data.contract_number) {
    throw new Error(`Contract was not created with expected defaults: ${JSON.stringify(contract.data)}`);
  }

  const contractsList = await request(token, '/contracts');
  if (!contractsList.data.some((c: any) => c.id === ids.contract)) {
    throw new Error('Newly created contract did not appear in the contracts list');
  }

  const updated = await request(token, `/contracts/${ids.contract}`, {
    method: 'PATCH', body: JSON.stringify({ pickup_status: 'Confirmed' }),
  });
  if (updated.data.pickup_status !== 'Confirmed') {
    throw new Error(`Pickup status update did not persist: ${JSON.stringify(updated.data)}`);
  }

  // A stranger sales_manager with a different PIC must not be able to touch this contract.
  const { data: strangerUser, error: strangerErr } = await supabaseAdmin.auth.admin.createUser({
    email: `crm-e2e-stranger-${stamp}@example.test`, password, email_confirm: true,
    user_metadata: { username: `crm_e2e_stranger_${stamp}` },
  });
  if (strangerErr || !strangerUser.user) throw strangerErr ?? new Error('Stranger user was not created');
  ids.stranger = strangerUser.user.id;
  await supabaseAdmin.from('profiles').update({ role: 'sales_manager' }).eq('id', ids.stranger);
  const { data: strangerSignIn } = await publicClient.auth.signInWithPassword({ email: `crm-e2e-stranger-${stamp}@example.test`, password });
  const strangerToken = strangerSignIn!.session!.access_token;
  const strangerContracts = await request(strangerToken, '/contracts');
  if (strangerContracts.data.some((c: any) => c.id === ids.contract)) {
    throw new Error('A different sales_manager could see another PIC\'s contract');
  }
  const strangerPatch = await fetch(`${apiBase}/contracts/${ids.contract}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${strangerToken}` },
    body: JSON.stringify({ pickup_status: 'Picked Up' }),
  });
  if (strangerPatch.ok) throw new Error('A different sales_manager was able to update another PIC\'s contract');
  await supabaseAdmin.from('pics').delete().eq('profile_id', ids.stranger);
  await supabaseAdmin.auth.admin.deleteUser(ids.stranger);

  // An operations user owns no sales PIC, but Pickup Tracking / Customer Contracts are
  // in its nav and updateContract explicitly authorises it to manage ANY contract. The
  // listing used to filter strictly by pic_id, so operations saw an empty screen for
  // contracts it was allowed to update -- visibility must match that authority.
  const { data: opsUser, error: opsErr } = await supabaseAdmin.auth.admin.createUser({
    email: `crm-e2e-ops-${stamp}@example.test`, password, email_confirm: true,
    user_metadata: { username: `crm_e2e_ops_${stamp}` },
  });
  if (opsErr || !opsUser.user) throw opsErr ?? new Error('Operations user was not created');
  ids.ops = opsUser.user.id;
  await supabaseAdmin.from('profiles').update({ role: 'operations' }).eq('id', ids.ops);
  const { data: opsSignIn } = await publicClient.auth.signInWithPassword({ email: `crm-e2e-ops-${stamp}@example.test`, password });
  const opsToken = opsSignIn!.session!.access_token;

  const opsContracts = await request(opsToken, '/contracts');
  if (!opsContracts.data.some((c: any) => c.id === ids.contract)) {
    throw new Error("An operations user could not see a contract it is authorised to update (listing/update authority mismatch)");
  }

  const opsPatch = await fetch(`${apiBase}/contracts/${ids.contract}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
    body: JSON.stringify({ pickup_status: 'Picked Up' }),
  });
  if (!opsPatch.ok) {
    throw new Error(`An operations user could not update a contract it is authorised to manage: ${opsPatch.status}`);
  }

  // Customer Accounts is in the same operations nav group and must not 403 either.
  const opsCustomers = await request(opsToken, '/customers');
  if (!Array.isArray(opsCustomers.data)) {
    throw new Error('An operations user could not list customers.');
  }

  await supabaseAdmin.from('pics').delete().eq('profile_id', ids.ops);
  await supabaseAdmin.auth.admin.deleteUser(ids.ops);

  // Dashboard analytics RPC
  const dashboard = await request(token, '/analytics/dashboard');
  if (!dashboard.data.charts || !Array.isArray(dashboard.data.charts.profitChartData)) {
    throw new Error(`Dashboard analytics did not return charts: ${JSON.stringify(dashboard.data)}`);
  }

  console.log('PASS hosted contracts + pickup tracking + dashboard analytics: create contract -> list -> update pickup status -> cross-PIC access denied -> operations sees + updates any contract -> dashboard charts present');
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
