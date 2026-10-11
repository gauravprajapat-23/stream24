# Phase 9 — Dual-worker failover

Phase 9 adds free local high availability using two or more Stream24 agents.

## What changed

- Primary + up to four backup workers per stream.
- Server-issued lease ID and monotonically increasing assignment epoch.
- Automatic takeover when the active worker stops heartbeating or stream telemetry remains stale beyond the configured threshold.
- Old workers validate their lease every five seconds and self-stop after lease revocation.
- If the control plane is unreachable beyond the lease grace period, the active worker self-stops to reduce split-brain risk.
- Delayed command completions from an old lease cannot overwrite the state of a newly promoted worker.
- Manual failback to the primary worker from the dashboard.
- Optional automatic failback after the primary is stable again.
- Worker assignment and failover status exposed on the Health page.
- Preflight fans out to primary and backup workers and records per-worker readiness.
- Backup order in the stream editor is takeover priority.

## Media requirement

Backup workers must have the same playlist and branding paths available locally. For example, if a stream uses `D:\\Stream24\\video.mp4`, the backup worker must also be able to read that path. Per-worker path mapping is planned for a later phase.

## Control-plane requirement

All participating workers must be able to reach the Stream24 server URL. For actual primary-PC failover, the control server must remain alive when the primary worker dies; run it on the backup worker or another always-on LAN machine, not only on the primary. On a home LAN, set each agent's `serverUrl` to the IP/hostname of the PC running the Stream24 control server instead of `localhost`.

Example:

```json
{
  "serverUrl": "http://192.168.1.20:3000",
  "agentToken": "..."
}
```

Windows Firewall may need to allow inbound TCP port 3000 on the private network.

## Failover timing

The defaults are:

- takeover after: 30 seconds
- lease validation: every 5 seconds
- lease grace if the control server cannot be reached: 25 seconds
- stream-progress watchdog: 45 seconds

This intentionally favors avoiding duplicate YouTube publishers over instant takeover. Automatic failback waits for the primary to remain online for at least the configured takeover interval before reclaiming the stream.
