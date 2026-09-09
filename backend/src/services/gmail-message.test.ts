import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGmailRawMessage } from './gmail-message';

test('buildGmailRawMessage creates a base64url MIME message with UTF-8 content', () => {
  const raw = buildGmailRawMessage(
    'sender@example.com',
    'recipient@example.com',
    'Container availability — Montréal',
    '<p>Hello, José.</p>',
  );

  assert.match(raw, /^[A-Za-z0-9_-]+$/);

  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /^From: sender@example\.com\r\nTo: recipient@example\.com\r\n/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?.+\?=/);
  assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);

  const encodedBody = mime.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(Buffer.from(encodedBody, 'base64').toString('utf8'), '<p>Hello, José.</p>');
});
