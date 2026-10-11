# Phase 4 — Local Accounts, Analytics, Media Library & Worker Health

## Added
- First-run local owner account setup and login.
- Passwords protected with Node.js scrypt; browser sessions are HttpOnly/SameSite cookies.
- Owner scoping for streams, workers, logs, events and media.
- Local media catalog populated by worker FFprobe scans.
- Stream preflight/normalization automatically updates the media catalog.
- Per-stream live-time, starts, reconnects, failures and estimated outbound data analytics.
- Worker hostname/platform/architecture/memory/uptime health telemetry.
- Dashboard pages for Media and Analytics.

## Zero-cost design
The control plane remains self-hostable on the user's PC. Videos remain local to worker PCs. No paid authentication, object storage, VPS, Docker, Cloudflare, or payment card is required.

## Security note
Set APP_MASTER_KEY before storing a real YouTube stream key. `development-only-change-me` is only a development fallback.
