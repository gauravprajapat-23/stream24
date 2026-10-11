import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../apps/server/store.mjs';

test('store persists updates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream24-'));
  const file = path.join(dir, 'db.json');
  const store = new JsonStore(file);
  store.update((db) => db.devices.push({ id: 'dev_1' }));
  const restored = new JsonStore(file);
  assert.equal(restored.data.devices[0].id, 'dev_1');
});
