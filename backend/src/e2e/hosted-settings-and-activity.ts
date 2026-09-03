import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

if (process.env.ALLOW_HOSTED_E2E !== 'true') {
  throw new Error('Refusing hosted writes. Set ALLOW_HOSTED_E2E=true for an intentional disposable test.');
}

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const stamp = Date.now();
const emailAdmin = `crm-e2e-setadmin-${stamp}@example.test`;
const emailSales = `crm-e2e-setsales-${stamp}@example.test`;
const password = `E2e-${randomBytes(18).toString('base64url')}!`;
const userIds: string[] = [];
const picIds: string[] = [];

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
    const err: any = new Error(`${init.method ?? 'GET'} ${path}: ${body.error?.message ?? response.statusText}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
};

// Targets are a singleton shared by the whole org, so the test has to put the
// original values back rather than leaving its own numbers behind.
let originalTargets: any = null;

const cleanup = async () => {
  if (originalTargets) {
    await supabaseAdmin.from('daily_targets').update({
      monthly_gross_profit_target: originalTargets.monthly_gross_profit_target,
      working_days_per_month:      originalTargets.working_days_per_month,
      daily_email_target:          originalTargets.daily_email_target,
      daily_call_target_min:       originalTargets.daily_call_target_min,
      daily_call_target_preferred: originalTargets.daily_call_target_preferred,
      daily_text_target:           originalTargets.daily_text_target,
    }).eq('id', true);
  }
  // Territory enabled-flags are also shared state; restore everything to enabled,
  // which is the seeded default.
  await supabaseAdmin.from('service_territories').update({ enabled: true }).neq('enabled', true);

  if (picIds.length) {
    await supabaseAdmin.from('daily_activity').delete().in('pic_id', picIds);
    // pics.profile_id is ON DELETE SET NULL, so deleting the auth user leaves the PIC
    // row behind -- remove it explicitly or every run leaks two rows into pics.
    await supabaseAdmin.from('pics').delete().in('id', picIds);
  }
  for (const id of userIds) await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
};

const run = async () => {
  console.log('--- Starting Hosted E2E: Settings, Targets & Daily Activity ---');

  const createUser = async (email: string, role: string, username: string) => {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { username },
    });
    if (error || !data.user) throw error ?? new Error(`Failed to create ${email}`);
    await supabaseAdmin.from('profiles').update({ role }).eq('id', data.user.id);
    const { data: sessionData, error: loginError } = await publicClient.auth.signInWithPassword({ email, password });
    if (loginError || !sessionData.session) throw loginError ?? new Error(`Failed to sign in ${email}`);
    userIds.push(data.user.id);
    return { id: data.user.id, token: sessionData.session.access_token };
  };

  const admin = await createUser(emailAdmin, 'admin', `setadmin_${stamp}`);
  const sales = await createUser(emailSales, 'sales_manager', `setsales_${stamp}`);
  console.log('✔ Created test users (admin, sales_manager)');

  // ── Targets ───────────────────────────────────────────────────────────────
  const before = await request(admin.token, '/settings/targets');
  originalTargets = before.data;
  if (typeof before.data.working_days_per_month !== 'number') {
    throw new Error('GET /settings/targets did not return the singleton config row.');
  }
  console.log('✔ GET /settings/targets returns the singleton row');

  const updated = await request(admin.token, '/settings/targets', {
    method: 'PATCH',
    body: JSON.stringify({
      monthly_gross_profit_target: 75000,
      working_days_per_month: 21,
      daily_email_target: 40,
      daily_call_target_min: 10,
      daily_call_target_preferred: 25,
      daily_text_target: 15,
    }),
  });
  if (Number(updated.data.daily_call_target_preferred) !== 25) {
    throw new Error(`PATCH /settings/targets did not persist: ${JSON.stringify(updated.data)}`);
  }
  console.log('✔ PATCH /settings/targets persists new values');

  // A non-admin must not be able to reconfigure org-wide targets.
  let targetsForbidden = false;
  try {
    await request(sales.token, '/settings/targets', {
      method: 'PATCH', body: JSON.stringify({ daily_email_target: 999 }),
    });
  } catch (err: any) {
    targetsForbidden = err.status === 403;
  }
  if (!targetsForbidden) throw new Error('A sales_manager was allowed to PATCH /settings/targets.');
  console.log('✔ Non-admin is blocked from editing targets (403)');

  // ── Territories ───────────────────────────────────────────────────────────
  const territories = await request(sales.token, '/settings/territories');
  if (!Array.isArray(territories.data) || territories.data.length === 0) {
    throw new Error('GET /settings/territories returned nothing -- the seed did not land.');
  }
  const regions = [...new Set(territories.data.map((t: any) => t.region))];
  if (!regions.includes('Northern United States') || !regions.includes('Canadian Provinces')) {
    throw new Error(`Seeded regions missing. Got: ${JSON.stringify(regions)}`);
  }
  console.log(`✔ GET /settings/territories returns ${territories.data.length} seeded rows across ${regions.length} regions`);

  const victim = territories.data.find((t: any) => t.name === 'Montana');
  if (!victim) throw new Error('Expected a seeded "Montana" territory.');
  const toggled = await request(admin.token, '/settings/territories', {
    method: 'PATCH',
    body: JSON.stringify({ territories: [{ id: victim.id, enabled: false }] }),
  });
  const montanaAfter = toggled.data.find((t: any) => t.id === victim.id);
  if (montanaAfter.enabled !== false) throw new Error('Disabling a territory did not persist.');
  console.log('✔ PATCH /settings/territories toggles a territory off');

  // ── Daily activity ────────────────────────────────────────────────────────
  // Every profile already gets an active PIC via the auto-PIC trigger (migration 025),
  // and pics_one_active_per_profile forbids a second one -- so adopt the existing one
  // and rename it so this run's rows are identifiable in PIC_DATA.
  const { data: pic, error: picErr } = await supabaseAdmin.from('pics')
    .update({ name: `E2E PIC ${stamp}` })
    .eq('profile_id', sales.id).eq('status', 'active')
    .select('id').single();
  if (picErr || !pic) throw picErr ?? new Error('Expected an auto-created PIC for the sales user.');
  picIds.push(pic.id);

  const salesToken = sales.token;

  const today = new Date().toISOString().slice(0, 10);
  await request(salesToken, '/settings/daily-activity', {
    method: 'POST',
    body: JSON.stringify({
      pic_id: pic.id, entry_date: today,
      emails_completed: 12, email_replies: 3, emails_bounced: 1,
      calls_completed: 8, calls_answered: 5, calls_unanswered: 3,
      texts_completed: 6, text_replies: 2, texts_opted_out: 0,
      notes: 'E2E entry',
    }),
  });
  console.log('✔ POST /settings/daily-activity records an entry');

  // Saving the same day again must edit, not duplicate -- the table is keyed on
  // (pic_id, entry_date) and the screen re-saves freely.
  await request(salesToken, '/settings/daily-activity', {
    method: 'POST',
    body: JSON.stringify({
      pic_id: pic.id, entry_date: today,
      emails_completed: 20, email_replies: 3, emails_bounced: 1,
      calls_completed: 8, calls_answered: 5, calls_unanswered: 3,
      texts_completed: 6, text_replies: 2, texts_opted_out: 0,
      notes: 'E2E entry (revised)',
    }),
  });
  const { data: dupRows } = await supabaseAdmin.from('daily_activity')
    .select('id, emails_completed').eq('pic_id', pic.id).eq('entry_date', today);
  if (!dupRows || dupRows.length !== 1) {
    throw new Error(`Re-saving the same day duplicated the row (${dupRows?.length} rows).`);
  }
  if (dupRows[0].emails_completed !== 20) {
    throw new Error(`Re-save did not update the row: emails_completed=${dupRows[0].emails_completed}`);
  }
  console.log('✔ Re-saving the same PIC/date edits in place instead of duplicating');

  const scoped = await request(salesToken, `/settings/daily-activity?pic_id=${pic.id}&entry_date=${today}`);
  if (scoped.data.activity?.emails_completed !== 20) {
    throw new Error('GET /settings/daily-activity did not return the saved entry.');
  }
  if (typeof scoped.data.results?.inquiries !== 'number') {
    throw new Error('GET /settings/daily-activity did not return derived pipeline results.');
  }
  console.log('✔ GET /settings/daily-activity returns the entry plus derived pipeline counts');

  // A sales_manager must not log activity against someone else's PIC.
  const { data: otherPic } = await supabaseAdmin.from('pics')
    .insert({ name: `E2E Other PIC ${stamp}`, status: 'active' }).select('id').single();
  if (otherPic) picIds.push(otherPic.id);
  let activityForbidden = false;
  try {
    await request(salesToken, '/settings/daily-activity', {
      method: 'POST',
      body: JSON.stringify({ pic_id: otherPic!.id, entry_date: today, emails_completed: 5 }),
    });
  } catch (err: any) {
    activityForbidden = err.status === 403;
  }
  if (!activityForbidden) throw new Error("A sales_manager logged activity against another PIC's identity.");
  console.log("✔ Non-admin is blocked from logging activity for another PIC (403)");

  // ── The whole point: analytics must now reflect the recorded activity ──────
  const analytics = await request(admin.token, '/analytics/dashboard');
  const outreach = analytics.data.outreach;
  if (!outreach || typeof outreach.emails !== 'number') {
    throw new Error('GET /analytics/dashboard did not return the outreach block.');
  }
  if (outreach.emails < 20) {
    throw new Error(`Month-to-date outreach did not include the recorded entry (emails=${outreach.emails}).`);
  }
  if (Number(analytics.data.targets?.daily_call_target_preferred) !== 25) {
    throw new Error('GET /analytics/dashboard did not return the configured targets.');
  }
  console.log(`✔ Analytics reports real outreach (emails=${outreach.emails}, calls=${outreach.calls}) and live targets`);

  const picRow = (analytics.data.charts?.PIC_DATA ?? []).find((p: any) => p.name === `E2E PIC ${stamp}`);
  if (!picRow) {
    throw new Error('The PIC with recorded activity is missing from PIC_DATA -- the LEFT JOIN rewrite regressed.');
  }
  if (picRow.emails !== 20) {
    throw new Error(`PIC_DATA emails is ${picRow.emails}, expected the recorded 20 (was hardcoded 0 before).`);
  }
  for (const key of ['leads', 'inquiries', 'quotes', 'revenue']) {
    if (typeof picRow[key] !== 'number') {
      throw new Error(`PIC_DATA is missing the "${key}" field the frontend table renders.`);
    }
  }
  console.log('✔ PIC_DATA carries real calls/emails/texts and the leads/inquiries/quotes/revenue fields');

  console.log('\n--- Hosted E2E PASSED: Settings, Targets & Daily Activity ---');
};

run()
  .catch(err => { console.error('\n✖ E2E FAILED:', err.message); process.exitCode = 1; })
  .finally(async () => {
    await cleanup();
    console.log('✔ Cleaned up test users, PICs, activity, targets, and territory flags');
  });
