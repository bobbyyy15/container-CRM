import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

if (process.env.ALLOW_HOSTED_E2E !== 'true') {
  throw new Error('Refusing hosted writes. Set ALLOW_HOSTED_E2E=true for an intentional disposable test.');
}

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const stamp = Date.now();
const adminEmail = `crm-e2e-admin-${stamp}@example.test`;
const targetEmail = `crm-e2e-target-${stamp}@example.test`;
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
  await supabaseAdmin.from('pics').delete().in('profile_id', [ids.target].filter(Boolean) as string[]);
  if (ids.admin) await supabaseAdmin.auth.admin.deleteUser(ids.admin);
  if (ids.target) await supabaseAdmin.auth.admin.deleteUser(ids.target);
};

const run = async () => {
  const { data: adminUser, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail, password, email_confirm: true,
    user_metadata: { username: `crm_e2e_admin_${stamp}`, full_name: 'CRM E2E Admin' },
  });
  if (adminErr || !adminUser.user) throw adminErr ?? new Error('Admin user was not created');
  ids.admin = adminUser.user.id;
  const { error: adminRoleErr } = await supabaseAdmin.from('profiles').update({ role: 'admin' }).eq('id', ids.admin);
  if (adminRoleErr) throw adminRoleErr;

  const { data: targetUser, error: targetErr } = await supabaseAdmin.auth.admin.createUser({
    email: targetEmail, password, email_confirm: true,
    user_metadata: { username: `crm_e2e_target_${stamp}`, full_name: 'CRM E2E Target' },
  });
  if (targetErr || !targetUser.user) throw targetErr ?? new Error('Target user was not created');
  ids.target = targetUser.user.id;

  const { data: signedIn, error: signInErr } = await publicClient.auth.signInWithPassword({ email: adminEmail, password });
  if (signInErr || !signedIn.session) throw signInErr ?? new Error('Admin could not sign in');
  const token = signedIn.session.access_token;

  // The freshly created target defaults to sales_manager (021_update_roles.sql) with no PIC.
  const listed = await request(token, '/admin/users');
  const targetRow = listed.data.find((u: any) => u.id === ids.target);
  if (!targetRow || targetRow.role !== 'sales_manager') {
    throw new Error(`New user did not default to sales_manager: ${JSON.stringify(targetRow)}`);
  }

  // A non-admin (denrei's teammate-facing endpoint) must be rejected -- reuse the target's
  // own token once it exists, but first assign a PIC and flip a role as the admin.
  const assigned = await request(token, `/admin/users/${ids.target}/pic`, {
    method: 'POST', body: JSON.stringify({ name: `CRM E2E PIC ${stamp}` }),
  });
  if (!assigned.data?.id) throw new Error(`assignPic did not return a pic row: ${JSON.stringify(assigned)}`);

  const dupePic = await fetch(`${apiBase}/admin/users/${ids.target}/pic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Should be rejected' }),
  });
  if (dupePic.ok) throw new Error('Assigning a second PIC to an already-linked user was not rejected');

  const roleChanged = await request(token, `/admin/users/${ids.target}`, {
    method: 'PATCH', body: JSON.stringify({ role: 'procurement' }),
  });
  if (roleChanged.data.role !== 'procurement') {
    throw new Error(`Role change to procurement did not persist: ${JSON.stringify(roleChanged.data)}`);
  }

  const selfChangeRejected = await fetch(`${apiBase}/admin/users/${ids.admin}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role: 'sales_manager' }),
  });
  if (selfChangeRejected.ok) throw new Error('Admin was allowed to change their own role');

  console.log('PASS hosted admin API: list users -> assign PIC (+ duplicate rejected) -> change role -> self-modification blocked');
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
