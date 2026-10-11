# Phase 13 — Production hardening, security, backup and disaster recovery

Phase 13 hardens the local Stream24 control plane without introducing any paid cloud dependency.

## Security changes

- New worker tokens are stored only as SHA-256 hashes in `data/db.json`.
- Worker tokens can be rotated from the Workers page. Rotation invalidates the old token immediately.
- Browser mutation requests are restricted to same-origin requests.
- Login/setup endpoints have in-memory rate limiting.
- Security response headers include CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Session cookies remain HttpOnly + SameSite=Strict; set `STREAM24_HTTPS=1` only when the control plane is actually behind HTTPS so the Secure cookie flag is enabled.
- The dashboard warns when `APP_MASTER_KEY` is not explicitly configured.

## Encrypted backup

`Security & Backup -> Download encrypted backup` exports the complete local Stream24 database as a `STREAM24_BACKUP_V1` AES-256-GCM envelope. Stream keys and YouTube OAuth credentials are never present in plaintext in the exported JSON.

The backup requires the same `APP_MASTER_KEY` for restore. Keep the backup and key separately.

## Restore

Choose the encrypted JSON backup, type `RESTORE`, and confirm. Restore replaces the current local database. After a restore, reload Stream24 and confirm every worker is connected before restarting production streams.

## Disaster recovery recommendation

Keep three items separately:

1. the latest Stream24 ZIP/application folder,
2. periodic encrypted Stream24 backup JSON files,
3. the production `APP_MASTER_KEY` in an offline password manager or secure removable storage.

Do not store all three only on the streaming PC.
