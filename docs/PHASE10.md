# Phase 10 — Per-worker media mapping + LAN replication

- Canonical playlist paths remain stored on the stream.
- Each worker can map canonical roots to independent local roots.
- Backup mappings can include an optional LAN/UNC sync source root.
- Replication copies to a temporary file, verifies SHA-256, then atomically renames.
- Existing identical files are hash-verified and skipped.
- Preflight runs with worker-translated paths.
- Replication status is shown alongside backup readiness in Health.

This keeps the system free: media moves directly over the user's LAN, not through cloud storage.
