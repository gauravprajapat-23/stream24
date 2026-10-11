import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMasterKey } from '../apps/server/crypto.mjs';
import { createEncryptedBackup, openEncryptedBackup, sanitizeRestoredDb } from '../apps/server/backup.mjs';

test('encrypted backup roundtrip preserves database without plaintext secrets',()=>{
  const key=normalizeMasterKey('phase13-test-key');
  const db={users:[{id:'u1'}],streams:[{encryptedStreamKey:'TOP-SECRET'}]};
  const bundle=createEncryptedBackup(db,key,{version:'0.13.0'});
  assert.equal(JSON.stringify(bundle).includes('TOP-SECRET'),false);
  const restored=openEncryptedBackup(bundle,key);
  assert.equal(restored.version,'0.13.0');
  assert.deepEqual(restored.data,db);
});

test('backup cannot be opened with a different key',()=>{
  const bundle=createEncryptedBackup({users:[]},normalizeMasterKey('key-a'));
  assert.throws(()=>openEncryptedBackup(bundle,normalizeMasterKey('key-b')),/cannot be decrypted/i);
});

test('restore sanitizer keeps only known database arrays',()=>{
  const out=sanitizeRestoredDb({users:[1],evil:[2]},['users','streams']);
  assert.deepEqual(out,{users:[1],streams:[]});
});
