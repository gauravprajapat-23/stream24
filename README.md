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

- Node.js 20+
- Windows for the provided worker scripts (the Node agent itself is portable)
- FFmpeg + FFprobe
- A YouTube Live stream key

## Run

```powershell
npm run keygen
$env:APP_MASTER_KEY="PASTE_THE_GENERATED_KEY"
npm run server
```

Open `http://localhost:3000`, create the local owner account, then create a worker.

Configure the agent:

```powershell
Copy-Item .\apps\agent\config.example.json .\apps\agent\config.json
notepad .\apps\agent\config.json
npm run agent
```

If FFmpeg is missing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-ffmpeg.ps1
```

## Phase 14 quick install (Windows)

Double-click `INSTALL-STREAM24.cmd`, or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-stream24.ps1 -Mode Both -InstallStartupTasks
```

This copies Stream24 to `%LOCALAPPDATA%\Stream24`, generates a production master key if needed, writes worker configuration, and can install resilient Task Scheduler startup jobs. See `docs/PHASE14.md`.
