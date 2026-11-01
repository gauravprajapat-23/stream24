import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStreamLifecycle } from '../apps/server/postgres-stream-lifecycle.mjs';

function mockRuntime(resultRows = []) {
  const calls = [];
  return {
    calls,
    async transaction(work) {
      calls.push({ type: 'begin' });
      try {
        const value = await work({
          async query(sql, values) {
            calls.push({ type: 'query', sql, values });
            if (/stream24_reserve_stream/.test(sql)) return { rows: [resultRows[0] || { stream_id: 'str_1' }] };
            if (/stream24_release_stream/.test(sql)) return { rows: [{ released: true }] };
            return { rows: [] };
          }
        });
        calls.push({ type: 'commit' });
        return value;
      } catch (error) {
        calls.push({ type: 'rollback' });
        throw error;
      }
    }
  };
}

const stream = (desiredRunning) => ({
  id: 'str_1', ownerId: 'usr_1', name: 'Test stream', desiredRunning,
  status: desiredRunning ? 'STARTING' : 'STOPPING'
});

test('start reserves concurrency and persists desired-running state inside one transaction', async () => {
  const runtime = mockRuntime([{ stream_id: 'str_1', owner_id: 'usr_1' }]);
  const lifecycle = new PostgresStreamLifecycle(runtime);
  const result = await lifecycle.start(stream(true));
  assert.equal(result.reservation.stream_id, 'str_1');
  assert.equal(runtime.calls[0].type, 'begin');
  assert.match(runtime.calls[1].sql, /stream24_reserve_stream/);
  assert.match(runtime.calls[2].sql, /INSERT INTO stream24_records/);
  assert.deepEqual(runtime.calls[2].values.slice(0, 2), ['str_1', 'usr_1']);
  assert.equal(JSON.parse(runtime.calls[2].values[2]).desiredRunning, true);
  assert.equal(runtime.calls.at(-1).type, 'commit');
});

test('stop serializes by owner, releases reservation and persists stopped state transactionally', async () => {
  const runtime = mockRuntime();
  const lifecycle = new PostgresStreamLifecycle(runtime);
  const result = await lifecycle.stop(stream(false));
  assert.equal(result.released, true);
  assert.match(runtime.calls[1].sql, /pg_advisory_xact_lock/);
  assert.match(runtime.calls[2].sql, /stream24_release_stream/);
  assert.match(runtime.calls[3].sql, /INSERT INTO stream24_records/);
  assert.equal(JSON.parse(runtime.calls[3].values[2]).desiredRunning, false);
  assert.equal(runtime.calls.at(-1).type, 'commit');
});

test('start and stop reject incomplete or contradictory stream state before opening a transaction', async () => {
  const runtime = mockRuntime();
  const lifecycle = new PostgresStreamLifecycle(runtime);
  await assert.rejects(lifecycle.start(stream(false)), /desiredRunning=true/);
  await assert.rejects(lifecycle.stop(stream(true)), /desiredRunning=false/);
  await assert.rejects(lifecycle.start({ id: 'str_1', desiredRunning: true }), /ownerId and id/);
  assert.deepEqual(runtime.calls, []);
});

test('database errors abort the transaction instead of returning partial success', async () => {
  const runtime = mockRuntime();
  runtime.transaction = async (work) => work({
    async query(sql) {
      if (/stream24_reserve_stream/.test(sql)) throw new Error('quota exceeded');
      return { rows: [] };
    }
  });
  const lifecycle = new PostgresStreamLifecycle(runtime);
  await assert.rejects(lifecycle.start(stream(true)), /quota exceeded/);
});
