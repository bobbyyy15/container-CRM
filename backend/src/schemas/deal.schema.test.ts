import assert from 'node:assert/strict';
import test from 'node:test';
import { UpdateSaleStatusSchema } from './deal.schema';

test('sale status updates accept only supported lifecycle values', () => {
  for (const status of ['Pending', 'Won', 'Cancelled']) {
    assert.equal(UpdateSaleStatusSchema.safeParse({ status }).success, true);
  }
  assert.equal(UpdateSaleStatusSchema.safeParse({ status: 'Anything' }).success, false);
  assert.equal(UpdateSaleStatusSchema.safeParse({ status: '' }).success, false);
});
