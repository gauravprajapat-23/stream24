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
