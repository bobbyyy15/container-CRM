import assert from 'node:assert/strict';
import test from 'node:test';
import { BulkImportPayloadSchema, ImportRowSchema } from './import.schema';

test('prospect import accepts the required company and contact identity', () => {
  const row = ImportRowSchema.parse({
    company_name: 'Northwind Containers',
    contact_person: 'Taylor Morgan',
    email_active: 'taylor@example.com',
  });

  assert.equal(row.company_name, 'Northwind Containers');
  assert.equal(row.contact_person, 'Taylor Morgan');
});

test('prospect import schema no longer blocks rows missing a company name', () => {
  // The database layer (process_prospect_import_batch) is the authority on rejecting these --
  // it records a specific per-row reason in import history instead of failing the whole batch.
  assert.equal(ImportRowSchema.safeParse({ email_active: 'nobody@example.com' }).success, true);
});

test('prospect import accepts a company with no named contact yet', () => {
  const result = ImportRowSchema.safeParse({
    company_name: 'Northwind Containers',
    email_active: 'info@example.com',
  });
  assert.equal(result.success, true);
});

test('bulk import rejects an invalid batch identifier', () => {
  const result = BulkImportPayloadSchema.safeParse({
    batch_id: 'not-a-uuid',
    rows: [{ company_name: 'Northwind', contact_person: 'Taylor' }],
  });

  assert.equal(result.success, false);
});

test('prospect import schema no longer blocks rows missing a contact channel', () => {
  const result = ImportRowSchema.safeParse({
    company_name: 'Northwind',
    contact_person: 'Taylor Morgan',
  });
  assert.equal(result.success, true);
});

test('prospect import accepts empty strings, whitespace, and nulls without throwing', () => {
  const result = ImportRowSchema.safeParse({
    company_name: 'Acme Corp',
    contact_person: '',
    email_active: '   ',
    email_2: null,
    contact_number_direct: 5551234,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.company_name, 'Acme Corp');
    assert.equal(result.data.contact_person, undefined);
    assert.equal(result.data.email_active, undefined);
    assert.equal(result.data.email_2, undefined);
    assert.equal(result.data.contact_number_direct, '5551234');
  }
});

