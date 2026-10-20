# Stream24 PostgreSQL migration preparation

This is migration groundwork for replacing the single-process JSON store. It **does not switch the running application to PostgreSQL**. The server currently reads and writes `data/db.json`; keep the current store as the source of truth until a later runtime cutover is completed and tested.

## Included

- `db/migrations/001_postgres_foundation.sql`: JSONB staging table, billing payment/webhook/entitlement tables, and stream reservations.
- `db/migrations/002_stream_lease_renewal.sql`: lease renewal that requires a matching unreleased reservation and active entitlement.
- `apps/server/postgres-runtime.mjs`: injected-pool transaction boundary with commit/rollback, isolation-level allowlisting, health ping, and pool shutdown.
- `apps/server/postgres-stream-reservations.mjs`: an injected-pool adapter for reserve, renew, and release calls. Neither module is wired into the running HTTP server yet.
- `scripts/export-json-to-postgres.mjs`: exports the existing JSON store into repeatable upserts for the staging table.
- `tests/postgres-migration.test.mjs`, `tests/postgres-stream-reservations.test.mjs`, and `tests/postgres-runtime.test.mjs`: export/schema checks and mocked adapter/transaction behavior tests.

## Safe pilot workflow

1. Stop Stream24 before taking a consistent backup. Copy `data/db.json` to a secure backup location and protect it as sensitive customer data.
2. Create a PostgreSQL database on your chosen provider. Use a dedicated least-privilege database role and TLS.
3. Apply both migrations in order:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_postgres_foundation.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_stream_lease_renewal.sql
   ```

4. Generate a SQL snapshot from the backed-up JSON file:

   ```sh
   node scripts/export-json-to-postgres.mjs ./backup/db.json ./data/postgres-import.sql
   ```

5. Review the generated SQL and its record count. The export file can contain account records and other private data; do not commit it or share it publicly.
6. Import the snapshot:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ./data/postgres-import.sql
   ```

7. Verify counts before any future cutover:

   ```sql
   SELECT collection, count(*) FROM stream24_records GROUP BY collection ORDER BY collection;
   SELECT count(*) FROM stream24_billing_payments;
   SELECT count(*) FROM stream24_entitlements;
   SELECT count(*) FROM stream24_stream_reservations;
   ```

The JSON exporter intentionally imports all source collections into `stream24_records` as preserved JSONB payloads. It does not guess relational mappings or populate normalized payment/entitlement rows. The migration is repeatable for the same record IDs and updates matching rows; it does not delete rows absent from the snapshot.

## Adapter contract and limits

The runtime boundary accepts a `pg.Pool`-compatible object but does not import or install the `pg` package itself. `transaction()` checks out a dedicated client, begins a transaction, applies an allowlisted isolation level, commits on success, rolls back on failure, and releases the client in all cases. `ping()` and `close()` expose health and shutdown hooks. The reservation adapter calls SQL functions using bound parameters; lease duration is limited to 15–300 seconds.

The adapter is **not production enforcement** yet. The HTTP server, scheduler, worker heartbeat, billing webhook, and authentication code still use the JSON store. A successful unit test against a mock pool does not prove the SQL has been applied or that PostgreSQL concurrency behavior has been integration-tested.

## Required before PostgreSQL can be used by the app

- Install/configure the PostgreSQL driver and wire the runtime transaction boundary into a cohesive repository and request path, then migrate every request handler, scheduler and agent path away from direct `store.data` access.
- Convert authentication, stream creation/start/stop, webhook handling and payment grants to transactions.
- Use reservation functions in the same transaction as stream-start state changes, and renew/release leases on heartbeat and stop.
- Add transactional webhook idempotency and unique payment constraints in the runtime path; the schema alone does not enforce current app behavior.
- Test concurrent starts from separate app instances, crash recovery, lease renewal, backups, restore, and JSON-to-PostgreSQL parity against a real PostgreSQL instance.
- Do not set a production `DATABASE_URL` expecting the current server to use it. Runtime cutover is not implemented.

## Rollback

Until runtime cutover is explicitly implemented, rollback means leaving the server on the JSON store and dropping unused staging tables only if you are certain they contain no needed migration snapshot. After a future cutover, use a rehearsed database backup/restore plan; do not dual-write or automatically fall back between stores without reconciliation.
