# Phase 12 — Retention, health scoring, reconciliation, and repair

Phase 12 makes local failover storage self-healing while keeping deletion conservative.

## Backup health score
Each assigned backup gets a 0–100 score based on: worker online (25), fresh catalog (20), storage reserve (15), and verified referenced replicas (40). A backup is READY only at >=80 with every referenced playlist item checksum-matched.

## Automatic reconciliation
Once per minute the control server compares the primary catalog with every assigned backup. Missing or checksum-mismatched referenced files are queued as `AUTO_REPAIR` replication jobs when no repair is already active.

## Safe retention
`GET /api/media/reconciliation` exposes orphan candidates. `POST /api/media/cleanup` previews candidates by default. Physical cleanup requires `{ "apply": true }` and is executed by the owning worker. The agent refuses to delete outside configured watch folders, refuses temporary `.stream24-copying` paths, and refuses cleanup while that worker is streaming.
