import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptSecret, encryptSecret, normalizeMasterKey } from '../apps/server/crypto.mjs';

test('stream key encryption round-trips', () => {
  const key = normalizeMasterKey('test-master-key');
  const encrypted = encryptSecret('abcd-1234-secret', key);
  assert.notEqual(encrypted, 'abcd-1234-secret');
  assert.equal(decryptSecret(encrypted, key), 'abcd-1234-secret');
});
