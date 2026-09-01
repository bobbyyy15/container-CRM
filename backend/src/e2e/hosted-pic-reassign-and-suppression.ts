import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

if (process.env.ALLOW_HOSTED_E2E !== 'true') {
  throw new Error('Refusing hosted writes. Set ALLOW_HOSTED_E2E=true for an intentional disposable test.');
}

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const stamp = Date.now();
const emailA = `crm-e2e-picA-${stamp}@example.test`;
const emailB = `crm-e2e-picB-${stamp}@example.test`;
const companyName = `CRM E2E PIC Reassign ${stamp}`;
const bouncedEmail = `crm-e2e-bounced-${stamp}@example.test`;
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
  await supabaseAdmin.from('removed_entries').delete().eq('normalized_value', bouncedEmail.toLowerCase());
  await supabaseAdmin.from('prospect_clients').delete().in('id', [ids.prospect].filter(Boolean) as string[]);
  if (ids.company && ids.contact) {
    await supabaseAdmin.from('company_contacts').delete().eq('company_id', ids.company).eq('contact_id', ids.contact);
  }
  await supabaseAdmin.from('contacts').delete().in('id', [ids.contact].filter(Boolean) as string[]);
  await supabaseAdmin.from('companies').delete().in('id', [ids.company].filter(Boolean) as string[]);
  await supabaseAdmin.from('pics').delete().in('profile_id', [ids.userA, ids.userB].filter(Boolean) as string[]);
  if (ids.userA) await supabaseAdmin.auth.admin.deleteUser(ids.userA);
  if (ids.userB) await supabaseAdmin.auth.admin.deleteUser(ids.userB);
};

const run = async () => {
  const { data: userA, error: errA } = await supabaseAdmin.auth.admin.createUser({
    email: emailA, password, email_confirm: true, user_metadata: { username: `crm_e2e_picA_${stamp}` },
  });
  if (errA || !userA.user) throw errA ?? new Error('User A was not created');
  ids.userA = userA.user.id;
  await supabaseAdmin.from('profiles').update({ role: 'sales_manager' }).eq('id', ids.userA);

  const { data: userB, error: errB } = await supabaseAdmin.auth.admin.createUser({
    email: emailB, password, email_confirm: true, user_metadata: { username: `crm_e2e_picB_${stamp}` },
  });
  if (errB || !userB.user) throw errB ?? new Error('User B was not created');
  ids.userB = userB.user.id;
  await supabaseAdmin.from('profiles').update({ role: 'sales_manager' }).eq('id', ids.userB);

  const { data: picB } = await supabaseAdmin.from('pics').select('id').eq('profile_id', ids.userB).single();
  ids.picB = picB!.id;

  const { data: signedIn, error: signInErr } = await publicClient.auth.signInWithPassword({ email: emailA, password });
  if (signInErr || !signedIn.session) throw signInErr ?? new Error('User A could not sign in');
  const token = signedIn.session.access_token;

  // --- Assign PIC (reassignment) ---
  const imported = await request(token, '/data/imports', {
    method: 'POST',
    body: JSON.stringify({
      filename: 'e2e-reassign.xlsx',
      rows: [{ company_name: companyName, contact_person: 'Reassign Tester', email_active: emailA, category: 'Proceed' }],
    }),
  });
  if (imported.data.importedCount !== 1) throw new Error(`Expected 1 imported row, got ${JSON.stringify(imported.data)}`);

  const list = await request(token, `/leads/prospects?search=${encodeURIComponent(emailA)}`);
  ids.prospect = list.data[0].id;
  ids.company = list.data[0].company_id;
  ids.contact = list.data[0].contact_id;

  const reassigned = await request(token, `/leads/prospect/${ids.prospect}/pic`, {
    method: 'PATCH', body: JSON.stringify({ picId: ids.picB }),
  });
  if (reassigned.data.pic_id !== ids.picB) throw new Error(`Reassignment did not persist: ${JSON.stringify(reassigned.data)}`);

  const afterReassign = await request(token, `/leads/prospects?search=${encodeURIComponent(emailA)}`);
  if (afterReassign.data.length !== 0) throw new Error('Reassigned prospect is still visible to the original PIC');

  const reassignAgainRejected = await fetch(`${apiBase}/leads/prospect/${ids.prospect}/pic`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ picId: ids.picB }),
  });
  if (reassignAgainRejected.ok) throw new Error('Reassigning a record no longer owned by the actor was not rejected');

  // --- Bulk suppression (Deliverability paste-and-remove) ---
  const bulk = await request(token, '/leads/removed/bulk', {
    method: 'POST',
    body: JSON.stringify({ text: `${bouncedEmail}\n${bouncedEmail}`, reason: 'e2e hard bounce test' }),
  });
  if (bulk.data.length !== 2 || bulk.data[0].was_new !== true || bulk.data[1].was_new !== false) {
    throw new Error(`Bulk suppression did not dedupe correctly: ${JSON.stringify(bulk.data)}`);
  }
  const { data: suppressed } = await supabaseAdmin.from('removed_entries').select('*').eq('normalized_value', bouncedEmail.toLowerCase());
  if (!suppressed || suppressed.length !== 1) throw new Error('Bulk suppression did not create exactly one removed_entries row');

  console.log('PASS hosted PIC reassignment + suppression: reassign prospect PIC -> old owner loses visibility -> re-reassign rejected -> bulk paste-and-suppress dedupes');
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
