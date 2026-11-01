# Phase 14 — Windows Setup, Service Mode, Update Channel, Production QA

Phase 14 makes Stream24 installable without editing JSON by hand. Native PowerShell scripts install the server/agent under `%LOCALAPPDATA%\Stream24`, create a production master key, optionally register resilient Task Scheduler jobs, and expose a setup checklist in the dashboard.

## One-click setup

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-stream24.ps1 -Mode Both -InstallStartupTasks
```

For a worker on another PC, create the worker in the dashboard and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-stream24.ps1 -Mode Worker -ServerUrl http://SERVER-PC:3000 -AgentToken YOUR_TOKEN -InstallStartupTasks
```

## Service mode

No third-party service wrapper is required. Stream24 uses native Task Scheduler jobs with unlimited execution time and restart-on-failure settings. Tasks run at Windows logon.

## Updates

Set `STREAM24_UPDATE_MANIFEST_URL` to an HTTP(S) JSON manifest containing `version`, `url`, `sha256`, optional `notes`, and `publishedAt`. The dashboard only checks availability. Applying an update is explicit via `update-stream24.ps1`, which verifies SHA-256 and keeps a rollback directory.

## First-run checks and media tools

Use Node.js 20.19+ (Node.js 22 LTS recommended). The `npm run server` and `npm run dev` commands load an optional root `.env` file automatically. Keep the generated `APP_MASTER_KEY` in that file and never commit it.

Run the diagnostics from the repository root:

```powershell
npm run doctor
```

The doctor checks the Node runtime, FFmpeg, FFprobe, worker config/token, master-key configuration, database initialization, and whether port 3000 is already occupied. Warnings are non-fatal for a fresh installation; missing Node or invalid configuration is reported as a failure.

Install both FFmpeg and FFprobe without requiring Windows Package Manager:

```powershell
npm run install:ffmpeg
```

The installer downloads the Gyan.dev FFmpeg essentials ZIP, installs the executables under `%LOCALAPPDATA%\\Stream24\\tools\\ffmpeg`, and adds that directory to the current user's PATH. Open a new PowerShell window after installation, then run `ffmpeg -version`, `ffprobe -version`, and `npm run doctor`.

The worker agent validates its JSON config and refuses to start with a missing placeholder token or invalid server URL. If FFmpeg or FFprobe is missing, it prints a clear warning and reports the availability state to the dashboard; stream preflight still blocks starting media until both tools are present.

