import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPhoneNumber } from './formatters';

test('universal phone formatter converts 10-digit raw strings to (XXX) XXX-XXXX', () => {
  assert.equal(formatPhoneNumber('1234567890'), '(123) 456-7890');
  assert.equal(formatPhoneNumber('5552345678'), '(555) 234-5678');
  assert.equal(formatPhoneNumber('123-456-7890'), '(123) 456-7890');
  assert.equal(formatPhoneNumber('123.456.7890'), '(123) 456-7890');
  assert.equal(formatPhoneNumber('123 456 7890'), '(123) 456-7890');
  assert.equal(formatPhoneNumber('(123)456-7890'), '(123) 456-7890');
  assert.equal(formatPhoneNumber('(123) 456-7890'), '(123) 456-7890');
});

test('universal phone formatter handles 11-digit numbers with leading 1', () => {
  assert.equal(formatPhoneNumber('11234567890'), '(123) 456-7890');
  assert.equal(formatPhoneNumber('+11234567890'), '(123) 456-7890');
  assert.equal(formatPhoneNumber('+1 (123) 456-7890'), '(123) 456-7890');
});

test('universal phone formatter preserves numbers that do not fill 10 digits', () => {
  assert.equal(formatPhoneNumber('12345'), '12345');
  assert.equal(formatPhoneNumber('555-1234'), '555-1234');
  assert.equal(formatPhoneNumber(''), '');
  assert.equal(formatPhoneNumber(null), '');
  assert.equal(formatPhoneNumber(undefined), '');
  assert.equal(formatPhoneNumber('—'), '—');
});
