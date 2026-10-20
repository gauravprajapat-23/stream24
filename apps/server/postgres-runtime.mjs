/**
 * Small transaction boundary for PostgreSQL-backed runtime repositories.
 *
 * Pool is injected so importing Stream24 remains compatible with local JSON mode.
 * The caller must provide a pg.Pool-compatible object (connect/query).
 */
export class PostgresRuntime {
  constructor(pool) {
    if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function') {
      throw new TypeError('A PostgreSQL pool with connect() and query() is required.');
    }
    this.pool = pool;
  }

  async ping() {
    const result = await this.pool.query('SELECT 1 AS ok');
    return result.rows?.[0]?.ok === 1;
  }

  async transaction(work, { isolation = 'READ COMMITTED' } = {}) {
    if (typeof work !== 'function') throw new TypeError('Transaction callback is required.');
    const allowed = new Set(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);
    if (!allowed.has(isolation)) throw new RangeError('Unsupported transaction isolation level.');
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query('BEGIN');
      began = true;
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
      const value = await work(client);
      await client.query('COMMIT');
      began = false;
      return value;
    } catch (error) {
      if (began) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) {
          error.rollbackError = rollbackError;
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (typeof this.pool.end === 'function') await this.pool.end();
  }
}
