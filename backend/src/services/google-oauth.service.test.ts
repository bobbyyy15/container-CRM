import assert from 'node:assert/strict';
import test from 'node:test';
import { createOAuthState, hashOAuthState } from './google-oauth.service';

test('OAuth state tokens are random and URL-safe', () => {
  const first = createOAuthState();
  const second = createOAuthState();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
});

test('OAuth states are stored as deterministic SHA-256 hashes', () => {
  const state = 'example-state';
  const hash = hashOAuthState(state);

  assert.equal(hash, hashOAuthState(state));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, state);
});
