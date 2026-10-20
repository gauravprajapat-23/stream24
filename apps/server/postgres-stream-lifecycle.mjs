/**
 * Transactional PostgreSQL stream-state/reservation boundary.
 *
 * This is an opt-in repository primitive only. The HTTP server still uses JsonStore
 * until all request, worker, scheduler and billing paths are migrated together.
 */
export class PostgresStreamLifecycle {
  constructor(runtime) {
    if (!runtime || typeof runtime.transaction !== 'function') {
      throw new TypeError('A PostgresRuntime-compatible transaction boundary is required.');
    }
    this.runtime = runtime;
  }

  async start(stream) {
    const { ownerId, id } = stream || {};
    if (!ownerId || !id) throw new TypeError('Stream ownerId and id are required.');
    if (stream.desiredRunning !== true) throw new TypeError('Starting stream state must set desiredRunning=true.');
    return this.runtime.transaction(async (client) => {
      const reservation = await client.query(
        'SELECT (stream24_reserve_stream($1, $2)).*',
        [String(ownerId), String(id)]
      );
      const row = reservation.rows?.[0];
      if (!row) throw new Error('PostgreSQL did not return a stream reservation.');
      await this.#saveStream(client, stream);
      return { reservation: row, stream };
    });
  }

  async stop(stream) {
    const { ownerId, id } = stream || {};
    if (!ownerId || !id) throw new TypeError('Stream ownerId and id are required.');
    if (stream.desiredRunning !== false) throw new TypeError('Stopped stream state must set desiredRunning=false.');
    return this.runtime.transaction(async (client) => {
      // Serialize stop against concurrent starts for the same owner.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [String(ownerId)]
      );
      const released = await client.query(
        'SELECT stream24_release_stream($1, $2) AS released',
        [String(ownerId), String(id)]
      );
      await this.#saveStream(client, stream);
      return { released: released.rows?.[0]?.released === true, stream };
    });
  }

  async #saveStream(client, stream) {
    await client.query(
      `INSERT INTO stream24_records (collection, record_id, owner_id, payload, updated_at)
       VALUES ('streams', $1, $2, $3::jsonb, now())
       ON CONFLICT (collection, record_id) DO UPDATE
         SET owner_id = EXCLUDED.owner_id,
             payload = EXCLUDED.payload,
             updated_at = now()`,
      [String(stream.id), String(stream.ownerId), JSON.stringify(stream)]
    );
  }
}
