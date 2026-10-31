# Stream24 Singapore pilot and 15-stream scale plan

**Status:** Architecture baseline; not a production capacity claim  
**Target region:** Singapore  
**Initial infrastructure budget:** INR 1,500/month  
**Longer-term concurrency objective:** 15 simultaneous streams  
**Current development branch:** `feat/cloud-vps-worker`

## Executive decision

Treat 15 simultaneous streams as a measured scale target, not as the launch capacity of a ₹1,500 Singapore VPS. The ₹1,500 budget can fund a small development/limited pilot if a provider quote fits, but it cannot safely guarantee 15 continuous 1080p streams. At 4.5 Mbps per stream, 15 continuous outputs consume about 67.5 Mbps of sustained outbound bandwidth and 21.87 decimal TB over 30 days, before protocol overhead, retransmissions, health checks, or extra destinations.

The first release should validate one to three streams on one Singapore worker. Increase the advertised concurrency only after sustained tests and a real egress quote support the new limit.

## Current repository baseline

The existing `feat/cloud-vps-worker` branch already contains:

- A Docker image and Compose deployment with a persistent JSON data volume and shared media volume.
- A Linux FFmpeg agent and authenticated browser media uploads.
- A Razorpay billing foundation with one-time ₹30/24-hour (one stream) and ₹99/24-hour (up to five streams) passes, plus configurable monthly plans.
- Signature-verified webhook processing, payment/event deduplication, entitlement records and optional concurrency enforcement.
- PostgreSQL migrations, a JSON-to-PostgreSQL staging exporter, transaction helpers, stream reservation adapters and a transactional stream lifecycle primitive.

Important limitations that must remain explicit:

1. The live server still reads and writes `data/db.json`; PostgreSQL helpers are not wired into HTTP, scheduler, worker-heartbeat, auth or billing paths.
2. The JSON store is single-process and is not safe for a horizontally scaled API or concurrent multi-instance reservations.
3. Razorpay is not live until merchant credentials, test-mode checkout and real webhook delivery are configured and verified.
4. The current agent owns one `FfmpegRunner` and refuses a second simultaneous stream on that agent. The current Compose file defines one worker service using one worker token.
5. Current device/worker records are customer-owned. A shared operator-managed worker fleet requires a deliberate ownership and authorization design; do not expose one customer's media, stream keys or commands to another customer.

Do not enable production billing enforcement or advertise 15 slots based only on the existing mocked PostgreSQL adapter tests.

## Capacity arithmetic

Use decimal units and the actual encoded output bitrate for planning.

| Concurrent streams | Aggregate bitrate at 4.5 Mbps | Approx. outbound traffic / 30 days |
|---:|---:|---:|
| 1 | 4.5 Mbps | 1.458 TB |
| 3 | 13.5 Mbps | 4.374 TB |
| 5 | 22.5 Mbps | 7.290 TB |
| 8 | 36 Mbps | 11.664 TB |
| 15 | 67.5 Mbps | 21.870 TB |

These figures assume every stream runs 24 hours/day for 30 days. Add at least 15% planning headroom for protocol overhead, retransmissions and operational traffic; more headroom may be needed for unstable networks or multiple destinations. One stream sent to three destinations creates three outbound feeds unless the destination topology explicitly shares an upstream.

For a 15-stream continuous target, require a provider plan with at least 25 TB/month of included or contractually affordable outbound transfer and a 1 Gbps port. A 1 Gbps port alone is not evidence of a 25 TB traffic allowance.

## Initial Singapore pilot configuration

The following is a sizing target to compare against provider quotations, not a claim that a specific plan is available for ₹1,500:

| Resource | Pilot target |
|---|---|
| Region | Singapore |
| VM | 2 vCPU shared, 4 GB RAM |
| Disk | 50–80 GB SSD/NVMe |
| OS | Ubuntu 24.04 LTS |
| Runtime | Docker Engine + Compose plugin |
| Video tools | FFmpeg + FFprobe |
| API | Existing Node.js server, loopback-bound behind HTTPS reverse proxy |
| Database | Existing JSON store for single-node pilot only; PostgreSQL work remains a separate blocker |
| Media | Cloudflare R2 for object storage evaluation; current shared volume may be used for a small controlled pilot |
| Initial admission cap | 1 stream; raise to 3 only after benchmark |
| Encoding | Stream-copy only for compatible inputs; transcoding/branding is a separate measured workload |

Indicative ₹1,500 allocation ceiling:

| Cost bucket | Monthly ceiling |
|---|---:|
| Singapore VM | ₹1,000 |
| Storage/API/monitoring allowance | ₹200 |
| Contingency | ₹300 |
| **Total** | **₹1,500** |

This is a budget envelope, not a vendor quote. If no Singapore provider offers the required VM and a useful transfer allowance inside this envelope, reduce the pilot scope or increase the budget; do not hide overage risk in the plan.

## 15-stream production sizing target

Start production benchmarking with one worker node sized around 8 dedicated vCPU, 16 GB RAM, 100–200 GB NVMe, a 1 Gbps network port and at least 25 TB/month outbound transfer. This is only a benchmark starting point. Actual safe stream density depends on source codecs, audio/video mapping, FFmpeg copy versus transcode, overlays, destination count, packet loss and provider CPU/network policies.

The current agent is single-stream-per-agent. Until a multi-runner agent is implemented and tested, model 15 slots as up to 15 independently registered worker agents/containers, each with a unique worker identity/token. Do not scale the existing Compose worker service to 15 replicas while reusing one token: agents would contend for one device identity and could claim or overwrite each other's commands. A proper worker-fleet scheduler and operator-owned worker identities are required before customer-facing pooled allocation.

## Target application architecture

- **Control plane:** Node.js API, customer authentication, tenant authorization, plans, entitlements, usage, stream lifecycle and admin controls.
- **Database:** Managed PostgreSQL with migrations, unique idempotency constraints, transactions, backups and restore drills.
- **Object storage:** Cloudflare R2 (or equivalent) for customer uploads, with per-tenant quotas, signed upload/download URLs and deletion/retention controls.
- **Scheduler:** Durable command queue and transactional worker-slot reservation. Select a worker by region, health, measured free capacity, codec requirements and network budget.
- **Worker fleet:** Operator-managed workers with unique credentials. Each stream has an isolated FFmpeg process, lease, watchdog, logs and telemetry.
- **Observability:** Heartbeat, FFmpeg progress, CPU, memory, disk, outbound bytes, reconnect count, last error and per-tenant usage.
- **Payments:** Razorpay server-created orders/subscriptions, raw-body webhook verification, event/payment idempotency, reconciliation, refunds and expiry enforcement.
- **Destination security:** Encrypt RTMP credentials at rest, redact them from all API/log output, and use RTMPS where supported.

## Pricing proposal

Keep prepaid passes distinct from monthly auto-renewing plans.

### Existing pass catalog in code

| Pass | Price | Validity | Concurrent streams |
|---|---:|---:|---:|
| Day pass single | ₹30 | 24 hours after verified capture | 1 |
| Day pass five | ₹99 | 24 hours after verified capture | 5 |

These are already represented in the current billing implementation. They are not monthly subscriptions.

### Proposed monthly catalog (commercial proposal, not yet activated)

| Plan | Proposed price | Concurrent streams | Storage |
|---|---:|---:|---:|
| Starter | ₹99/month | 1 | 5 GB |
| Creator | ₹149/month | 1 | 20 GB |
| Creator Plus | ₹299/month | 3 | 50 GB |
| Agency | ₹499/month | 5 | 100 GB |

Before enabling monthly billing, create the matching Razorpay plans, configure exact amounts in paise and plan IDs as server secrets, then test checkout, recurring charge, webhook retries, cancellation, refunds and expiry. Enforce bitrate, destination count, storage and fair-use limits in the API. Do not advertise unlimited 24/7 streaming until the contracted egress economics support it.

## Capacity acceptance gates

Run tests with representative customer media and a private/unlisted destination. Record a baseline at 1, then 3, 5, 8 and 15 simultaneous streams. Do not skip levels.

For each level, record:
- Actual output bitrate and outbound GB/hour.
- CPU average/peak, memory, disk I/O and network throughput.
- FFmpeg progress gaps, reconnects, process exits and destination health.
- Worker heartbeat/lease validity and command latency.
- Start/stop correctness and no duplicate assignments.
- Cost per stream-hour and projected 30-day egress cost.

Minimum release gates:
- 1 stream: 24-hour soak.
- 3 streams: 24-hour soak before raising pilot cap.
- 5 and 8 streams: 24-hour soak each on production-like hardware.
- 15 streams: 72-hour soak before marketing a 15-slot plan.
- CPU average below 70%, memory below 80%, no sustained network saturation, no unexplained FFmpeg restart, no duplicate active assignment and successful recovery after worker/API restart.
- Measured traffic allowance has at least 15% headroom above the observed 30-day projection.

A running FFmpeg process alone is not proof of a healthy broadcast. Confirm destination-side live status and continuing progress.

## Implementation phases

### Phase 0 — baseline and cost proof
- Keep work on `feat/cloud-vps-worker` and preserve PR #1 as the review boundary.
- Capture the current single-node behavior and existing tests.
- Add resource/egress telemetry and a repeatable benchmark harness.
- Obtain an actual Singapore provider quote, including monthly transfer allowance and overage pricing.
- Run 1-stream and 3-stream private tests; retain ₹1,500 as a hard pilot ceiling.

### Phase 1 — durable control plane
- Add the PostgreSQL driver and runtime configuration.
- Implement repositories for users/sessions, streams, workers, commands, billing and entitlements.
- Move request paths off direct `store.data` mutation as a cohesive migration.
- Add transactional webhook idempotency and atomic stream-slot reservation.
- Test against a real PostgreSQL instance, including concurrent starts from separate API processes and crash recovery.
- Keep JSON mode as the default until parity, backup/restore and rollback are proven.

### Phase 2 — operator-owned worker fleet
- Separate customer ownership from worker ownership.
- Add worker registrations, capabilities, region, health, measured capacity and network budgets.
- Add durable command delivery, slot reservation, lease renewal and stale-worker reconciliation.
- Use unique worker credentials; never share one agent token across replicas.
- Keep the first release single-stream-per-agent; add multi-runner only as a separately tested optimization.

### Phase 3 — media and usage controls
- Add R2 multipart/resumable uploads and signed media access.
- Enforce per-customer storage, retention and deletion.
- Track stream minutes, outbound bytes, bitrate and destination count.
- Apply plan limits before scheduling and continuously during a stream.

### Phase 4 — payments and customer onboarding
- Add public signup, email verification, account recovery and tenant isolation.
- Configure Razorpay test-mode plans and webhooks.
- Add payment reconciliation, receipts, refund/admin workflows and customer billing history.
- Enable enforcement only after end-to-end test evidence is recorded.

### Phase 5 — reliability and 15-stream scale
- Run staged concurrency and 72-hour soak tests.
- Test worker loss, network interruption, API restart, database failover, duplicate webhooks and entitlement expiry.
- Expand capacity only when measured CPU, memory and egress are within the acceptance gates.
- Reprice or negotiate infrastructure if actual traffic costs make the proposed plans unprofitable.

## Non-negotiable safety rules

- Never commit `.env`, Razorpay credentials, APP_MASTER_KEY, worker tokens or RTMP keys.
- Do not paste secrets into issues, logs or chat.
- Do not expose port 3000 or the worker container directly to the public internet.
- Do not enable billing enforcement against real customers until test-mode end-to-end verification is complete.
- Do not promise 15 simultaneous 24/7 streams on the ₹1,500 pilot budget.
- Do not use customer-owned workers as shared infrastructure without an explicit tenant-isolation and authorization redesign.


## Phase 0 implementation — worker telemetry and capacity reports

The pilot branch now samples host CPU utilization, memory utilization, Node agent RSS/heap, load average and Linux network RX/TX counters. CPU and network rates are calculated from deltas between samples; the first sample intentionally reports null rates until a baseline exists. Non-Linux workers report unavailable network counters rather than fabricating values.

The authenticated worker heartbeat stores the latest metrics and a bounded 30-second history (up to 10,080 samples, approximately 84 hours). The owner-authenticated API endpoint is:

```http
GET /api/devices/:deviceId/metrics?hours=24
```

The endpoint returns `current` and `samples`; it does not expose worker tokens. The normal `GET /api/devices` response omits the history to avoid large dashboard payloads.

### Capacity commands

Calculate expected egress without starting a stream:

```bash
npm run capacity:plan -- --streams 15 --video-kbps 4500 --audio-kbps 128 --hours-per-day 24 --days 30 --headroom-percent 15
```

Export worker telemetry from the authenticated metrics endpoint to a JSON file containing the returned `samples` array, then evaluate it:

```bash
npm run capacity:report -- ./worker-metrics.json --network-mbps 1000 --max-cpu 70 --max-memory 80 --min-hours 24
```

For the 15-stream production acceptance run, use `--min-hours 72`. The report checks p95 CPU, p95 memory, p95 network TX against 80% of the configured port rate, and minimum soak duration. A passing report is only one acceptance input: destination-side live status, FFmpeg progress, restart/reconnect counts and provider transfer allowance must also be verified.

### Current limits

- Metrics are per worker host, not per individual stream or customer.
- Linux `/proc` provides network counters; Windows network rates remain null until a platform-specific counter provider is added.
- The existing worker agent still runs one FFmpeg stream at a time. This phase does not claim multi-stream-per-agent support.
- The current JSON store retains telemetry only on a single server instance; this history is not a substitute for a durable time-series database at larger scale.
- No real Singapore VPS load test has been performed by this code change. The 15-stream target remains unverified.
