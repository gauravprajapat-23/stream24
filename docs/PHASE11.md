# Phase 11 — Automatic Media Synchronization

Phase 11 keeps backup workers synchronized without cloud storage.

## Features

- Worker watch folders configured in `apps/agent/config.json`
- Recursive media discovery for MP4/MOV/MKV/WebM/M4V/TS files
- SHA-256 checksum catalog with size and modification time
- Unchanged files reuse their previous checksum to reduce disk reads
- Primary checksum changes automatically queue only affected playlist files to configured backup workers
- Per-worker canonical/local/LAN path mapping from Phase 10 remains the source of path translation
- Replication jobs report byte progress to the control plane
- Copied files are written to a `.stream24-copying` temporary file and atomically promoted only after checksum verification
- Backup storage telemetry reports free/total disk space
- Replication is blocked when expected bytes would breach the storage reserve (1 GiB or 5%, whichever is larger)
- Dashboard Sync page shows watch folders, last catalog scan, free space, and replication jobs

## Agent configuration

```json
{
  "watchFolders": ["D:\\Stream24\\media"],
  "watchScanIntervalMs": 60000
}
```

The first scan catalogs existing media. Later scans hash only files whose size or modification time changed.

## Automatic replication flow

1. Primary worker detects a changed watched file.
2. Worker reports its canonical checksum catalog to Stream24.
3. Stream24 checks which failover-enabled streams reference that canonical path.
4. For each idle backup, Stream24 maps the canonical path to its LAN source and local target.
5. Storage guard verifies sufficient free space.
6. A `SYNC_MEDIA` job copies only the changed file.
7. Worker reports byte progress.
8. SHA-256 verification completes before the target file is promoted.

This remains LAN/local-only; no media is uploaded to the Stream24 control server.
