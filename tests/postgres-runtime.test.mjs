import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresRuntime } from '../apps/server/postgres-runtime.mjs';

function fakePool({ failAt = null } = {}) {
  const calls = [];
  let released = 0;
  let ended = 0;
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === failAt) throw new Error('database failure at ' + sql);
      if (sql === 'SELECT 1 AS ok') return { rows: [{ ok: 1 }] };
      return { rows: [] };
    },
    release() { released += 1; }
  };
  return {
    calls, client,
    get released() { return released; },
    get ended() { return ended; },
    async connect() { return client; },
    async query(sql) { calls.push(sql); if (sql === failAt) throw new Error('database failure at ' + sql); return { rows: [{ ok: 1 }] }; },
    async end() { ended += 1; }
  };
}

test('transaction commits successful work and always releases the client', async () => {
  const pool = fakePool();
  const runtime = new PostgresRuntime(pool);
  const value = await runtime.transaction(async client => {
    await client.query('SELECT 42');
    return 'saved';
  });
  assert.equal(value, 'saved');
  assert.deepEqual(pool.calls, ['BEGIN', 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED', 'SELECT 42', 'COMMIT']);
  assert.equal(pool.released, 1);
});

test('transaction rolls back failed work and rethrows the original error', async () => {
  const pool = fakePool();
  const runtime = new PostgresRuntime(pool);
  await assert.rejects(runtime.transaction(async client => {
    await client.query('UPDATE stream24_records SET payload = payload');
    throw new Error('abort');
  }), /abort/);
  assert.equal(pool.calls.at(-1), 'ROLLBACK');
  assert.equal(pool.released, 1);
});

test('database errors during transaction setup roll back when possible and release', async () => {
  const pool = fakePool({ failAt: 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE' });
  const runtime = new PostgresRuntime(pool);
  await assert.rejects(runtime.transaction(async () => 'unused', { isolation: 'SERIALIZABLE' }), /database failure/);
  assert.equal(pool.calls.at(-1), 'ROLLBACK');
  assert.equal(pool.released, 1);
});

test('rejects invalid isolation values before opening a connection', async () => {
  const pool = fakePool();
  const runtime = new PostgresRuntime(pool);
  await assert.rejects(runtime.transaction(async () => {}, { isolation: 'READ UNCOMMITTED' }), /Unsupported transaction/);
  assert.equal(pool.released, 0);
});

test('ping and close delegate to the pool', async () => {
  const pool = fakePool();
  const runtime = new PostgresRuntime(pool);
  assert.equal(await runtime.ping(), true);
  await runtime.close();
  assert.equal(pool.ended, 1);
});
