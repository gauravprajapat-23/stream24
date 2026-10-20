import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePostgresImportSql } from '../scripts/export-json-to-postgres.mjs';

test('exports each JSON collection as repeatable PostgreSQL upserts', () => {
  const sql = generatePostgresImportSql({
    users: [{ id: 'usr_1', email: "owner@example.com", name: "Owner's account" }],
    streams: [{ id: 'str_1', ownerId: 'usr_1', name: 'Demo' }],
    ignored: 'not a collection'
  });
  assert.match(sql, /^-- Generated/m);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /INSERT INTO stream24_records/);
  assert.match(sql, /ON CONFLICT \(collection, record_id\) DO UPDATE/);
  assert.match(sql, /Owner''s account/);
  assert.match(sql, /'usr_1'/);
  assert.match(sql, /-- Imported 2 records across JSON collections\./);
  assert.match(sql, /COMMIT;/);
});

test('generates stable IDs for legacy rows without an explicit ID', () => {
  const a = generatePostgresImportSql({ logs: [{ message: 'legacy row' }] });
  const b = generatePostgresImportSql({ logs: [{ message: 'legacy row' }] });
  assert.equal(a, b);
  assert.match(a, /legacy_[a-f0-9]{32}/);
});

test('rejects malformed database shapes and non-object records', () => {
  assert.throws(() => generatePostgresImportSql([]), /JSON object/);
  assert.throws(() => generatePostgresImportSql({ streams: ['not a row'] }), /non-object record/);
  assert.throws(() => generatePostgresImportSql({ 'bad;drop table': [] }), /Invalid collection name/);
});

test('preserves tenant ownership from ownerId or userId and safely escapes quotes in JSON', () => {
  const sql = generatePostgresImportSql({
    sessions: [{ id: 'ses_1', userId: 'usr_1', userAgent: "Browser's test" }],
    users: [{ id: 'usr_1', ownerId: null }]
  });
  assert.match(sql, /'usr_1', '\{.*Browser''s test.*\}'::jsonb/s);
  assert.match(sql, /'users', 'usr_1', NULL,/);
});
