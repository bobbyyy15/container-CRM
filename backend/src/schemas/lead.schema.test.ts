import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AddInquiryToWarmLeadsSchema,
  CreateManualInquirySchema,
  CreateManualWarmLeadSchema,
  UpdateLeadCellSchema,
} from './lead.schema';

const catalogId = '11111111-1111-4111-8111-111111111111';

test('direct Warm Lead entry requires a usable contact identity', () => {
  assert.equal(CreateManualWarmLeadSchema.safeParse({ companyName: 'Acme' }).success, false);
  assert.equal(CreateManualWarmLeadSchema.safeParse({ companyName: 'Acme', email: 'buyer@example.test' }).success, true);
});

test('direct Inquiry entry works without a Warm Lead when a company is supplied', () => {
  const result = CreateManualInquirySchema.safeParse({
    companyName: 'Direct Buyer',
    contactPerson: 'Buyer One',
    containerSizeId: catalogId,
    containerConditionId: catalogId,
    quantity: 1,
  });
  assert.equal(result.success, true);
});

test('Inquiry to Warm Lead action requires a valid Inquiry identifier', () => {
  assert.equal(AddInquiryToWarmLeadsSchema.safeParse({ inquiryId: catalogId }).success, true);
  assert.equal(AddInquiryToWarmLeadsSchema.safeParse({ inquiryId: 'not-a-uuid' }).success, false);
});

test('lead cell update accepts valid fields and stages', () => {
  assert.equal(UpdateLeadCellSchema.safeParse({
    stage: 'prospect',
    entityId: catalogId,
    field: 'company',
    value: 'Pacific Coast Shipping',
  }).success, true);

  assert.equal(UpdateLeadCellSchema.safeParse({
    stage: 'warm_lead',
    entityId: catalogId,
    field: 'phone',
    value: '(555) 234-5678',
  }).success, true);

  assert.equal(UpdateLeadCellSchema.safeParse({
    stage: 'invalid_stage' as any,
    entityId: catalogId,
    field: 'company',
    value: 'Acme',
  }).success, false);

  assert.equal(UpdateLeadCellSchema.safeParse({
    stage: 'prospect',
    entityId: catalogId,
    field: 'nonexistent_field' as any,
    value: 'Acme',
  }).success, false);

  assert.equal(UpdateLeadCellSchema.safeParse({
    stage: 'warm_lead',
    entityId: catalogId,
    field: 'email',
    value: 'Available',
  }).success, false);
});
