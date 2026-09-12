import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreateManualSaleSchema,
  UpdateSaleSchema,
  UpdateSaleStatusSchema,
  ImportSalesSchema,
  WAVE_SALE_NUMBER,
  SALE_STATUSES,
} from './deal.schema';
import { DealService } from '../services/deal.service';

test('a sale number must be in the client WAVE format', () => {
  for (const good of ['WAVE-10317', 'WAVE-10321', 'WAVE-10330', 'WAVE-999', 'WAVE-1234567890']) {
    assert.ok(WAVE_SALE_NUMBER.test(good), good);
  }
  for (const bad of ['SAL-CF0C7B82', 'WAVE-', 'WAVE-ABC', 'WAVE 10317', '10317', 'WAVE-12', 'wave-10317']) {
    assert.ok(!WAVE_SALE_NUMBER.test(bad), bad);
  }
});

test('a typed sale number is accepted and upper-cased', () => {
  const parsed = CreateManualSaleSchema.parse({
    companyName: 'K & T Bowman Trucking', totalUnits: 1, buyingCost: 100, revenue: 200, saleNumber: 'wave-10317',
  });
  assert.equal(parsed.saleNumber, 'WAVE-10317');
});

test('the old SAL- style number is refused', () => {
  const result = CreateManualSaleSchema.safeParse({
    companyName: 'Acme', totalUnits: 1, buyingCost: 1, revenue: 2, saleNumber: 'SAL-CF0C7B82',
  });
  assert.equal(result.success, false);
  assert.match(result.error!.issues[0].message, /WAVE-10317/);
});

test('a sale number is optional, so the database can allocate the next one', () => {
  const parsed = CreateManualSaleSchema.parse({ companyName: 'Acme', totalUnits: 1, buyingCost: 1, revenue: 2 });
  assert.equal(parsed.saleNumber, undefined);
});

test('invoice number is its own field and is not derived from the sale number', () => {
  const parsed = CreateManualSaleSchema.parse({
    companyName: 'Acme', totalUnits: 1, buyingCost: 1, revenue: 2,
    saleNumber: 'WAVE-10317', invoiceNumber: 'INV-2026-881',
  });
  assert.equal(parsed.saleNumber, 'WAVE-10317');
  assert.equal(parsed.invoiceNumber, 'INV-2026-881');
  assert.notEqual(parsed.invoiceNumber, parsed.saleNumber);
});

test('Cancelled is a status a sale may have', () => {
  assert.deepEqual([...SALE_STATUSES], ['Pending', 'Won', 'Cancelled']);
  assert.equal(UpdateSaleStatusSchema.parse({ status: 'Cancelled' }).status, 'Cancelled');
  assert.equal(UpdateSaleSchema.parse({ status: 'Cancelled' }).status, 'Cancelled');
  assert.equal(UpdateSaleSchema.safeParse({ status: 'Refunded' }).success, false);
});

test('an edit may name any editable field, and must name at least one', () => {
  const parsed = UpdateSaleSchema.parse({
    saleNumber: 'WAVE-10321', invoiceNumber: 'INV-9', saleDate: '2026-08-14',
    totalUnits: 4, buyingRate: 1000, sellingPrice: 2500, status: 'Won',
  });
  assert.equal(parsed.totalUnits, 4);
  assert.equal(UpdateSaleSchema.safeParse({}).success, false, 'an empty edit is refused');
});

test('an edit cannot supply revenue or profit directly', () => {
  const parsed = UpdateSaleSchema.parse({ totalUnits: 2, revenue: 999_999, grossProfit: 999_999 } as never);
  assert.equal((parsed as Record<string, unknown>).revenue, undefined);
  assert.equal((parsed as Record<string, unknown>).grossProfit, undefined);
});

test('totals are recalculated from quantity and the two rates', () => {
  assert.deepEqual(DealService.recalculate(5, 1000, 2500), { revenue: 12_500, buying_cost: 5_000, gross_profit: 7_500 });
  assert.deepEqual(DealService.recalculate(1, 0, 0), { revenue: 0, buying_cost: 0, gross_profit: 0 });
  // A sale at a loss stays a loss rather than being clamped.
  assert.deepEqual(DealService.recalculate(2, 900, 400), { revenue: 800, buying_cost: 1_800, gross_profit: -1_000 });
});

test('an import defaults to a preview, so nothing is written unasked', () => {
  const parsed = ImportSalesSchema.parse({ rows: [{ 'Company Name': 'Acme' }] });
  assert.equal(parsed.dryRun, true);
  assert.equal(ImportSalesSchema.parse({ rows: [{ a: 1 }], dryRun: false }).dryRun, false);
  assert.equal(ImportSalesSchema.safeParse({ rows: [] }).success, false, 'an empty file is refused');
});
