export class PostgresStreamReservations {
  constructor(pool) {
    if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required.');
    this.pool = pool;
  }

  async reserve(ownerId, streamId) {
    const result = await this.pool.query('SELECT (stream24_reserve_stream($1, $2)).*', [String(ownerId || ''), String(streamId || '')]);
    return result.rows?.[0] || null;
  }

  async renew(ownerId, streamId, seconds = 120) {
    if (!Number.isInteger(seconds) || seconds < 15 || seconds > 300) throw new RangeError('Lease duration must be 15–300 seconds.');
    const result = await this.pool.query('SELECT stream24_renew_stream($1, $2, $3) AS renewed', [String(ownerId || ''), String(streamId || ''), seconds]);
    return result.rows?.[0]?.renewed === true;
  }

  async release(ownerId, streamId) {
    const result = await this.pool.query('SELECT stream24_release_stream($1, $2) AS released', [String(ownerId || ''), String(streamId || '')]);
    return result.rows?.[0]?.released === true;
  }
}
