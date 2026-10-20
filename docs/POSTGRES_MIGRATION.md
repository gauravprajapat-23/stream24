# Stream24 PostgreSQL migration preparation

This is Phase 3 groundwork for replacing the single-process JSON store. It **does not switch the running application to PostgreSQL**. The server currently reads and writes `data/db.json`; keep the current store as the source of truth until a later runtime-adapter/cutover phase is completed and tested.

## Included

- `db/migrations/001_postgres_foundation.sql`: creates a JSONB record staging table, billing payment/webhook/entitlement tables, and stream reservations.
- `stream24_reserve_stream(owner_id, stream_id)`: a transaction-scoped per-owner advisory lock, active entitlement check, and atomic concurrent-stream quota reservation for a future PostgreSQL-backed start path.
- `stream24_release_stream(owner_id, stream_id)`: releases a reservation when a stream is stopped.
- `scripts/export-json-to-postgres.mjs`: exports the existing JSON store into repeatable upserts for the staging table.
- `tests/postgres-migration.test.mjs`: checks deterministic export output, quoting, ownership mapping, and malformed input handling.

## Safe pilot workflow

1. Stop Stream24 before taking a consistent backup. Copy `data/db.json` to a secure backup location and protect it as sensitive customer data.
2. Create a PostgreSQL database on your chosen provider. Use a dedicated least-privilege database role and TLS.
3. Apply the schema:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_postgres_foundation.sql
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

The JSON exporter intentionally imports all source collections into `stream24_records` as preserved JSONB payloads. It does not silently guess relational mappings or populate normalized payment/entitlement rows. The migration is repeatable for the same record IDs and updates matching rows; it does not delete rows absent from the snapshot.

## Required before PostgreSQL can be used by the app

- Implement and test a PostgreSQL runtime repository and switch all request handlers/scheduler/agent paths off direct `store.data` access.
- Convert authentication, stream creation/start/stop, billing webhook handling and payment grants to database transactions.
- Use the reservation functions in the same transaction as stream-start state changes, and release/renew leases on stop/heartbeat paths.
- Add transactional webhook idempotency and unique payment constraints in the runtime path; the schema alone does not enforce current app behavior.
- Test concurrent start requests from separate app instances, crash recovery, lease renewal, backups, restore, and JSON-to-PostgreSQL parity.
- Do not set a production `DATABASE_URL` expecting the current server to use it. Runtime cutover is not implemented in this phase.

## Rollback

Until runtime cutover is explicitly implemented, rollback means leaving the server on the JSON store and dropping the unused staging tables only if you are certain they contain no needed migration snapshot. After a future cutover, use a rehearsed database backup/restore plan; do not dual-write or automatically fall back between stores without reconciliation.
