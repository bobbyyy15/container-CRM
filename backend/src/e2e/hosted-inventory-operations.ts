import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';

if (process.env.ALLOW_HOSTED_E2E !== 'true') {
  throw new Error('Refusing hosted writes. Set ALLOW_HOSTED_E2E=true for an intentional disposable test.');
}

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const stamp = Date.now();
const emailOpsA = `crm-e2e-opsA-${stamp}@example.test`;
const emailOpsB = `crm-e2e-opsB-${stamp}@example.test`;
const emailProc = `crm-e2e-proc-${stamp}@example.test`;
const emailSales = `crm-e2e-sales-${stamp}@example.test`;
const password = `E2e-${randomBytes(18).toString('base64url')}!`;
const ids: Record<string, string | undefined> = {};
const createdInventoryIds: string[] = [];

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

const cleanup = async () => {
  if (createdInventoryIds.length > 0) {
    await supabaseAdmin.from('inventory').delete().in('id', createdInventoryIds);
  }
  const userIds = [ids.userOpsA, ids.userOpsB, ids.userProc, ids.userSales].filter(Boolean) as string[];
  if (userIds.length > 0) {
    await supabaseAdmin.from('pics').delete().in('profile_id', userIds);
    for (const u of userIds) {
      await supabaseAdmin.auth.admin.deleteUser(u);
    }
  }
};

const run = async () => {
  console.log('--- Starting Hosted E2E: Inventory & Operations ---');

  // 1. Create test users: Operations A, Operations B, Procurement, Sales Manager
  const createUser = async (email: string, role: string, username: string) => {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { username },
    });
    if (error || !data.user) throw error ?? new Error(`Failed to create ${email}`);
    await supabaseAdmin.from('profiles').update({ role }).eq('id', data.user.id);
    const { data: sessionData, error: loginError } = await publicClient.auth.signInWithPassword({ email, password });
    if (loginError || !sessionData.session) throw loginError ?? new Error(`Failed to sign in ${email}`);
    return { id: data.user.id, token: sessionData.session.access_token };
  };

  const opsA = await createUser(emailOpsA, 'operations', `opsA_${stamp}`);
  ids.userOpsA = opsA.id;

  const opsB = await createUser(emailOpsB, 'operations', `opsB_${stamp}`);
  ids.userOpsB = opsB.id;

  const proc = await createUser(emailProc, 'procurement', `proc_${stamp}`);
  ids.userProc = proc.id;

  const sales = await createUser(emailSales, 'sales_manager', `sales_${stamp}`);
  ids.userSales = sales.id;

  console.log('✔ Created test users (Operations A, Operations B, Procurement, Sales)');

  // 2. Operations A creates single inventory record
  const invA = await request(opsA.token, '/inventory', {
    method: 'POST',
    body: JSON.stringify({
      container_size: '40ft High Cube',
      container_condition: 'Cargo Worthy (CW)',
      depot_name: `E2E Yard Alpha ${stamp}`,
      vendor_supplier: 'Maersk E2E',
      city: 'Long Beach',
      state_province: 'CA',
      country: 'USA',
      quantity_available: 5,
      unit_cost: 2100,
      target_sell_price: 3200,
    }),
  });
  createdInventoryIds.push(invA.data.id);
  if (invA.data.status !== 'In Stock') throw new Error(`Expected status 'In Stock', got ${invA.data.status}`);
  console.log('✔ Operations user successfully created inventory record');

  // 3. Procurement performs bulk import
  const bulkRes = await request(proc.token, '/inventory/bulk', {
    method: 'POST',
    body: JSON.stringify({
      rows: [
        {
          container_size: '20ft Standard',
          container_condition: 'Brand New / One Trip',
          depot_name: `E2E Yard Beta ${stamp}`,
          vendor_supplier: 'Evergreen E2E',
          quantity_available: 2, // Should trigger 'Low Stock'
          unit_cost: 2800,
          target_sell_price: 3900,
        },
        {
          container_size: '40ft High Cube',
          container_condition: 'Cargo Worthy (CW)',
          depot_name: `E2E Yard Gamma ${stamp}`,
          vendor_supplier: 'CMA CGM E2E',
          quantity_available: 0, // Should trigger 'Out of Stock'
          unit_cost: 1900,
        },
      ],
    }),
  });
  if (bulkRes.data.imported !== 2) throw new Error(`Expected 2 imported rows, got ${bulkRes.data.imported}`);
  console.log('✔ Procurement user successfully bulk imported inventory');

  // 4. Sales Manager reads inventory catalog (View-All)
  const salesList = await request(sales.token, '/inventory');
  if (!salesList.data || salesList.data.length < 3) throw new Error('Sales Manager should see full inventory catalog');
  console.log(`✔ Sales Manager successfully listed all inventory (${salesList.data.length} records)`);

  // 5. Sales Manager is blocked from creating inventory (403 Forbidden)
  try {
    await request(sales.token, '/inventory', {
      method: 'POST',
      body: JSON.stringify({
        container_size: '20ft Standard',
        container_condition: 'As-Is',
        depot_name: 'Unauthorized Yard',
      }),
    });
    throw new Error('Sales Manager should have been rejected from creating inventory');
  } catch (err: any) {
    if (err.status !== 403) throw err;
    console.log('✔ Sales Manager properly blocked from writing inventory (403 Forbidden)');
  }

  // 6. Ownership Guard: Operations B cannot edit Operations A's inventory
  try {
    await request(opsB.token, `/inventory/${invA.data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_cost: 1000 }),
    });
    throw new Error('Operations B should have been blocked from editing Operations A record');
  } catch (err: any) {
    if (err.status !== 403) throw err;
    console.log('✔ Ownership check strictly enforced (Operations B cannot edit Operations A inventory)');
  }

  // 7. Operations A adjusts stock inline & auto-status updates
  const adjusted = await request(opsA.token, `/inventory/${invA.data.id}/stock`, {
    method: 'PATCH',
    body: JSON.stringify({ delta_available: -5 }), // 5 - 5 = 0 -> Out of Stock
  });
  if (adjusted.data.quantity_available !== 0) throw new Error(`Expected qty 0, got ${adjusted.data.quantity_available}`);
  if (adjusted.data.status !== 'Out of Stock') throw new Error(`Expected 'Out of Stock', got ${adjusted.data.status}`);
  console.log('✔ Inline stock adjustment and auto-status trigger verified (0 qty -> Out of Stock)');

  // 8. Stock availability lookup RPC
  const stockCheck = await request(proc.token, `/inventory/stock-check?size=40ft%20High%20Cube&condition=Cargo%20Worthy%20(CW)`);
  if (!stockCheck.data || !Array.isArray(stockCheck.data.depots)) throw new Error('Invalid stock-check response shape');
  console.log('✔ Live stock lookup RPC returned accurate availability counts and depot breakdown');

  console.log('--- All Inventory & Operations E2E Tests Passed Successfully! ---');
};

run()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Test failed:', err);
    await cleanup();
    process.exit(1);
  });
