# Stream24 Free — Phase 12

A zero-cloud-cost 24/7 YouTube streaming control plane that uses your own Windows PC as the FFmpeg worker.

## Core features

- Local owner account and encrypted stream-key storage
- Windows FFmpeg worker with watchdog/recovery
- Multi-video playlists and looping
- Daily/weekly timezone-aware scheduling
- Media scanning and normalization
- Worker health, logs and analytics
- Drag-and-drop playlist builder
- Add scanned Media Library items directly to a playlist
- Reusable stream templates (stream keys are never stored in templates)
- Local logo/watermark overlay with position, width and opacity
- Cleaner timestamp handling and faster playlist handoff

## Requirements

- Node.js 20.19+ (Node.js 22 LTS recommended)
- Windows for the provided worker scripts (the Node agent itself is portable)
- FFmpeg + FFprobe
- A YouTube Live stream key

## Run (Windows / PowerShell)

Use Node.js 20.19+ (Node.js 22 LTS recommended). Configure the server master key in a root `.env` file beside `package.json`. The server scripts load this file automatically; do not commit it.

```powershell
$key = node .\scripts\generate-master-key.mjs | Select-Object -Last 1
"APP_MASTER_KEY=$($key.Trim())" | Set-Content -Encoding ascii .env
npm run doctor
npm run server
```

Open `http://localhost:3000`, create the local owner account, then create a worker in **Workers** and copy its token.

Install FFmpeg and FFprobe (no winget required):

```powershell
npm run install:ffmpeg
# Close and reopen PowerShell, then verify:
ffmpeg -version
ffprobe -version
npm run doctor
```

Configure the agent using the token copied from the dashboard:

```powershell
Copy-Item .\apps\agent\config.example.json .\apps\agent\config.json
notepad .\apps\agent\config.json
npm run agent
```

Replace `PASTE_WORKER_TOKEN_HERE` with the worker token. Keep `serverUrl` as `http://localhost:3000` for a worker running on the same PC. For another PC, use the server's HTTPS URL or explicitly enable `allowInsecureLan` only on a trusted LAN. The agent validates its JSON config and reports missing FFmpeg/FFprobe in its startup output and heartbeat.

If port 3000 is already in use, run `npm run doctor` to identify the owning PID. Do not terminate an unknown process; stop it only after confirming it is an old Stream24 server, or set a different `PORT` in `.env`.

The root `.env`, `apps/agent/config.json`, database, and generated logs contain secrets or private runtime data and must never be committed.

## Playlist workflow

1. Open **Media** and scan local files on your worker.
2. Click **Add to playlist** on media items, or open **Create stream** and use the path editor.
3. Drag playlist rows to reorder them.
4. Save the stream and run **Preflight** before Start.

## Templates

Open an existing stream, click **Save as template**, give it a name, then use it from the **Templates** page. The template stores reusable configuration but deliberately excludes the YouTube stream key.

## Branding

In the stream editor enable **Logo overlay / branding** and enter a local path such as:

```text
D:\Stream24\brand\logo.png
```

Choose position, width and opacity. The logo stays on the worker PC. Branding requires video encoding, so CPU usage will be higher than pure stream-copy.

See `docs/PHASE5.md` for implementation notes and current limitations.

## Phase 6 additions

- Persistent single-FFmpeg playlist pipeline for compatible media
- Automatic safe sequential fallback for mixed playlists
- Weekly programming calendar with timezone-aware content blocks
- Automatic return to the base playlist outside programming blocks
- On-demand local preview snapshots
- Preflight reports which playback engine will be used

See `docs/PHASE6.md`.

## Phase 7 additions

- Optional YouTube OAuth / Data API v3 connection
- Existing live broadcast discovery and metadata sync
- FFmpeg progress telemetry and stream-health dashboard
- Automatic 45-second stall watchdog recovery
- Manual Force reconnect control
- Manual RTMP remains available with no Google OAuth setup

See `docs/PHASE7.md`.

## Phase 8 additions

- Full optional YouTube Live provisioning: creates a YouTube liveStream, creates a liveBroadcast, binds them, and returns the RTMP ingest credentials.
- Multi-destination RTMP configuration with a primary destination plus up to four extra secondary/failover destinations.
- FFmpeg tee output for simultaneous RTMP delivery from one local media pipeline.
- Secondary destination failures use `onfail=ignore` so an individual extra target does not immediately terminate the main FFmpeg pipeline.
- Stream keys for every destination remain encrypted at rest and are redacted from browser/API responses.
- Manual RTMP remains fully supported when Google OAuth/API is not configured.

### YouTube provisioning

After connecting YouTube on the YouTube page, use **Create + bind live**. Stream24 creates the YouTube ingest stream and broadcast and binds them. Copy the returned ingest URL/key into a Stream24 stream, or keep using your manually created YouTube stream key.

### Multi-destination format

In Create/Edit stream, extra outputs use one line each:

```text
Backup | rtmp://backup.example/live | secret-key | FAILOVER
Twitch | rtmp://live.twitch.tv/app | secret-key | SECONDARY
```

Enable **Simulcast all enabled destinations** to send the same local pipeline to every configured target.

## Phase 12 — free dual-PC failover

Phase 12 adds local high availability with a primary worker and up to four ordered backup workers. Each running stream receives a server-issued lease ID plus a monotonically increasing assignment epoch. If the active worker stops heartbeating or its stream telemetry becomes stale, Stream24 promotes the highest-priority online backup and revokes the previous lease.

The agent validates its lease every five seconds. If the server revokes ownership, the old worker stops FFmpeg. If the control plane itself cannot be reached beyond the configured lease-grace period, the active agent self-stops to reduce duplicate publishing risk.

**Important:** for real primary-PC failover, do not run the Stream24 control server only on the primary streaming PC. Run the server on the backup PC or another always-on local machine and point every agent at that LAN address.

Run **Preflight** after configuring backups. Phase 12 sends the media preflight to every assigned worker, and the Health page reports each backup as `ready`, `failed`, or `unchecked`. Backup PCs currently need the same local media/branding paths as the primary.

See `docs/PHASE9.md`.

## Phase 12 — per-worker media mapping and LAN replication

Phase 12 removes the identical-drive-letter requirement for failover workers. A stream keeps canonical media paths, while each worker can translate a canonical root to its own local root. Backup mappings can also define a Windows/LAN share source.

Example backup mapping:

```text
D:\Stream24\media | E:\S24\media | \\\\PRIMARY-PC\\Stream24\\media
```

Use **Workers → Media path mappings** to configure mappings. With a stream stopped, use **Replicate media** to queue verified copies to configured backup workers. Copies use a temporary file and SHA-256 verification before becoming active. Run Preflight afterward to certify each backup against its translated local paths.

## Phase 12 additions

- Automatic recursive watch-folder catalog
- SHA-256 change detection
- Incremental backup replication for changed playlist media
- Replication byte progress in the dashboard
- Backup disk free-space telemetry and guard rails
- Dedicated Sync page

Configure `watchFolders` and `watchScanIntervalMs` in each worker's `apps/agent/config.json`. See `docs/PHASE11.md`.

## Phase 12 additions

- Backup health score (0-100)
- Automatic reconciliation/repair of missing or checksum-stale backup media
- Safe retention preview and worker-side cleanup of unreferenced old files
- Cleanup is restricted to configured watch folders and blocked while the worker is streaming

## Phase 13 security and disaster recovery

Phase 13 adds hashed-at-rest worker tokens, safe token rotation, login rate limiting, same-origin mutation protection, security response headers, an in-dashboard security posture view, and AES-256-GCM encrypted backup/restore.

For production use, always generate and persist a strong master key:

```powershell
npm run keygen
$env:APP_MASTER_KEY="PASTE_GENERATED_KEY"
npm run server
```

Backups are available under **Security & Backup**. The same `APP_MASTER_KEY` is required to restore them.

## Phase 14 quick install (Windows)

Double-click `INSTALL-STREAM24.cmd`, or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-stream24.ps1 -Mode Both -InstallStartupTasks
```

This copies Stream24 to `%LOCALAPPDATA%\Stream24`, generates a production master key if needed, writes worker configuration, and can install resilient Task Scheduler startup jobs. See `docs/PHASE14.md`.

## LAN transport security

For workers on another PC, Stream24 now refuses plain `http://` LAN control URLs by default because worker tokens and RTMP credentials would otherwise travel in plaintext. Prefer native HTTPS by setting `STREAM24_TLS_CERT_PATH` and `STREAM24_TLS_KEY_PATH` to PEM certificate/key files on the server, then use an `https://...` worker URL. If you intentionally accept plaintext on a trusted LAN, set `allowInsecureLan: true` in that worker's `config.json` (or pass `-AllowInsecureLan` to the Windows setup script).

First-run owner creation is restricted to the server PC by default. `STREAM24_ALLOW_REMOTE_SETUP=1` is an explicit escape hatch and should normally remain disabled.

### Free local HTTPS setup

On the server PC you can generate a local CA and server certificate with the included script (it uses OpenSSL, including the copy bundled with Git for Windows):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\generate-lan-tls.ps1
```

Or install server + local worker with TLS in one step:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-stream24.ps1 -Mode Both -EnableLanTls -InstallStartupTasks
```

For a second worker PC, copy only `data\tls\ca-cert.pem` from the server PC and pass its path as `-CaCertPath`; do not copy the CA private key.

## Cloud VPS mode (Option A)

The `feat/cloud-vps-worker` branch adds a single-VPS deployment with Docker Compose, a persistent Linux FFmpeg worker, shared video storage, and authenticated browser uploads. This lets a stream continue after your own PC is switched off, provided the VPS and its worker remain running.

See [Cloud VPS deployment](docs/CLOUD_VPS_DEPLOYMENT.md) for deployment, HTTPS, worker-token setup, upload limits, and production acceptance checks. The cloud upload UI requires `STREAM24_MEDIA_ROOT` to be configured and mounted into both the server and worker containers. Test with a private/unlisted YouTube broadcast before public use.

A zero-monthly-fee trial path using an eligible Oracle Cloud Always Free VM is documented in [Free cloud VM deployment](docs/CLOUD_FREE_VM_DEPLOYMENT.md). Free-tier capacity and billing eligibility must be verified in the Oracle console; test one stream before attempting two or three.

## SaaS subscriptions and scale plan

The SaaS billing foundation now includes the ₹30/24-hour single-stream and ₹99/24-hour five-stream pass catalog, configurable monthly Razorpay plans, server-created checkout requests, signature-verified/idempotent webhooks, server-side entitlement enforcement, and a basic Billing view. Setup and limitations are documented in [SaaS subscriptions and scaling](docs/SAAS_SUBSCRIPTIONS_AND_SCALING.md) and [Cloud VPS deployment](docs/CLOUD_VPS_DEPLOYMENT.md). PostgreSQL migration preparation (schema, atomic reservation functions, and JSON export tooling) is documented in [PostgreSQL migration preparation](docs/POSTGRES_MIGRATION.md); the running server still uses JSON and has not cut over. Payments are **not live** until merchant credentials and webhook delivery are configured and tested; PostgreSQL runtime cutover, public SaaS onboarding, and scalable worker infrastructure remain production blockers.

The Singapore pilot budget, 15-stream capacity calculations, worker-fleet requirements, proposed monthly pricing and production acceptance gates are documented in [Singapore pilot and 15-stream scale plan](docs/SINGAPORE_PILOT_15_STREAM_PLAN.md).

Worker capacity telemetry now includes CPU, memory and Linux network counters. Use `npm run capacity:plan -- --streams 15` to estimate egress, and `GET /api/devices/:deviceId/metrics?hours=24` plus `npm run capacity:report -- ./worker-metrics.json` to evaluate exported worker samples. See the Phase 0 section in the scale plan for limitations and the 72-hour production soak requirements.
