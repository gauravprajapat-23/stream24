import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresStreamReservations } from '../apps/server/postgres-stream-reservations.mjs';

function mockPool(handler) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      return handler(sql, values);
    }
  };
}

test('reserve delegates to the transactional database function using bound parameters', async () => {
  const row = { stream_id: 'str_1', owner_id: 'usr_1', released_at: null };
  const pool = mockPool(async () => ({ rows: [row] }));
  const repository = new PostgresStreamReservations(pool);
  assert.equal(await repository.reserve('usr_1', 'str_1'), row);
  assert.deepEqual(pool.calls[0].values, ['usr_1', 'str_1']);
  assert.match(pool.calls[0].sql, /stream24_reserve_stream\(\$1, \$2\)/);
});

test('renew accepts bounded integer leases and returns the database result', async () => {
  const pool = mockPool(async () => ({ rows: [{ renewed: true }] }));
  const repository = new PostgresStreamReservations(pool);
  assert.equal(await repository.renew('usr_1', 'str_1', 45), true);
  assert.deepEqual(pool.calls[0].values, ['usr_1', 'str_1', 45]);
  assert.equal(await repository.renew('usr_1', 'str_1', 120), true);
});

test('renew rejects invalid lease durations without querying the database', async () => {
  const pool = mockPool(async () => ({ rows: [{ renewed: true }] }));
  const repository = new PostgresStreamReservations(pool);
  for (const seconds of [14, 301, 1.5, NaN]) {
    await assert.rejects(repository.renew('usr_1', 'str_1', seconds), /Lease duration/);
  }
  assert.equal(pool.calls.length, 0);
});

test('release is idempotent and reports whether a reservation was released', async () => {
  const pool = mockPool(async () => ({ rows: [{ released: false }] }));
  const repository = new PostgresStreamReservations(pool);
  assert.equal(await repository.release('usr_1', 'str_1'), false);
  assert.deepEqual(pool.calls[0].values, ['usr_1', 'str_1']);
  assert.match(pool.calls[0].sql, /stream24_release_stream/);
});

test('does not hide database errors', async () => {
  const pool = mockPool(async () => { throw new Error('database unavailable'); });
  const repository = new PostgresStreamReservations(pool);
  await assert.rejects(repository.reserve('usr_1', 'str_1'), /database unavailable/);
});

test('lease renewal migration refuses renewal without an active paid entitlement', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = fs.readFileSync(path.join(root, 'db/migrations/002_stream_lease_renewal.sql'), 'utf8');
  assert.match(sql, /e\.status = 'ACTIVE'/);
  assert.match(sql, /e\.expires_at > now\(\)/);
  assert.match(sql, /r\.released_at IS NULL/);
  assert.match(sql, /make_interval\(secs => p_lease_seconds\)/);
  assert.match(sql, /RETURN false/);
});
