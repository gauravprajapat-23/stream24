# Phase 7 — YouTube Integration & Health Watchdog

## Added

- Optional Google/YouTube OAuth connection using environment-provided OAuth credentials.
- Channel identity and broadcast listing through YouTube Data API v3.
- Per-stream YouTube broadcast association, title and description fields.
- One-click metadata sync for an associated broadcast.
- Manual RTMP remains fully supported and does not require Google OAuth.
- FFmpeg `-progress` telemetry is reported to the control server.
- Health classifications: IDLE, HEALTHY, DEGRADED, STALE, RECOVERING and ERROR.
- Agent watchdog detects >45 seconds without FFmpeg progress and reconnects the pipeline.
- Manual Force reconnect control for running streams.
- Recovery history continues to feed analytics/logs.

## Optional YouTube OAuth setup

Create an OAuth 2.0 Web application in a Google Cloud project with YouTube Data API v3 enabled, then set:

```powershell
$env:YOUTUBE_CLIENT_ID="..."
$env:YOUTUBE_CLIENT_SECRET="..."
$env:YOUTUBE_REDIRECT_URI="http://localhost:3000/api/youtube/callback"
```

For a public deployment, change the redirect URI to the exact HTTPS callback URL registered with Google.

## Security

Access and refresh tokens are encrypted with `APP_MASTER_KEY` before being saved in `data/db.json`. Stream keys remain encrypted as in previous phases.

## Current limitation

Phase 7 lists and updates existing YouTube live broadcasts. Creation/binding of YouTube ingestion streams is intentionally left for the next phase; manual RTMP keys remain the most reliable zero-cost path.
