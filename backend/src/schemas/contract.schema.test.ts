import assert from 'node:assert/strict';
import test from 'node:test';
import { CreateContractSchema, UpdateContractSchema } from './contract.schema';

const id = '123e4567-e89b-12d3-a456-426614174000';

test('contract creation requires a sale, inventory batch, and positive quantity', () => {
  assert.equal(CreateContractSchema.safeParse({ sale_id: id }).success, false);
  assert.equal(CreateContractSchema.safeParse({ sale_id: id, inventory_id: id, allocation_quantity: 0 }).success, false);
  assert.equal(CreateContractSchema.safeParse({ sale_id: id, inventory_id: id, allocation_quantity: 2 }).success, true);
});

test('contract updates accept only supported lifecycle values', () => {
  assert.equal(UpdateContractSchema.safeParse({ status: 'Active' }).success, true);
  assert.equal(UpdateContractSchema.safeParse({ pickup_status: 'Overdue' }).success, false);
  assert.equal(UpdateContractSchema.safeParse({ status: 'Anything' }).success, false);
  assert.equal(UpdateContractSchema.safeParse({}).success, false);
});
