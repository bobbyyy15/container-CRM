import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AddInquiryToWarmLeadsSchema,
  CreateManualInquirySchema,
  CreateManualWarmLeadSchema,
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
