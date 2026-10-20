# Stream24 SaaS subscriptions and scale architecture

## Executive decision

Stream24 can become a multi-tenant SaaS with one account per customer, self-serve payments, a per-account dashboard, and an automatically scheduled shared worker pool. Customers should not need to create or manage worker devices themselves.

**Do not launch a 1,000-customer/5,000–10,000-concurrent-stream promise on the current JSON-store + single-stream-agent design or on a free VM.** The existing cloud branch is a single-node deployment foundation and proof of concept, not a production multi-tenant streaming fleet.

## Current implementation status on `feat/cloud-vps-worker`

The first server-side billing phase is implemented as an opt-in integration on the existing single-node JSON store. It includes the fixed ₹30/₹99 day-pass catalog, configurable monthly plan IDs/prices, server-created Razorpay orders/subscriptions, raw-body HMAC-SHA256 webhook verification, event-ID and payment-ID idempotency, entitlement records, account-wide concurrent-stream checks, and periodic expiry/limit enforcement. Tests cover these core billing rules.

**This is not a live payment integration or a production multi-tenant billing launch.** No merchant credentials have been supplied/configured, no real Razorpay webhook has been received, and a basic Billing view that launches Razorpay Checkout is now present. Public SaaS signup/email verification, receipt/refund UI, full reconciliation/admin tooling, and a production-grade billing interface remain outstanding. The JSON store is still single-process and is not safe for horizontally scaled SaaS; migrate billing and stream reservations to transactional PostgreSQL before multi-instance or high-concurrency production use.

### Billing API surface

- `GET /api/billing/plans` — public pass catalog and configured monthly plans.
- `GET /api/billing/summary` — authenticated account entitlements, orders and subscriptions.
- `POST /api/billing/orders` — authenticated; accepts `{ "planId": "pass-single" }` or `pass-five`, creates the Razorpay order server-side, and records the expected amount/owner locally.
- `POST /api/billing/subscriptions` — authenticated; accepts `monthly-single` or `monthly-five` after matching Razorpay plan IDs and amounts are configured.
- `POST /api/billing/webhooks/razorpay` — provider callback; validates `X-Razorpay-Signature` against the exact raw request body, requires `x-razorpay-event-id`, and grants access only for matching captured payments.

The start endpoint checks entitlements on the server when `STREAM24_SAAS_BILLING_ENFORCED=true`. A periodic server scheduler marks expired entitlements and queues stops for streams over the remaining concurrency limit. For backward compatibility, billing enforcement defaults off until explicitly enabled. **Do not enable it for customers until test-mode payments, webhook delivery, checkout, and stop-on-expiry have been validated.**

Required server environment:
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET`.
- `RAZORPAY_PLAN_MONTHLY_SINGLE` plus `STREAM24_MONTHLY_SINGLE_AMOUNT_PAISE`.
- `RAZORPAY_PLAN_MONTHLY_FIVE` plus `STREAM24_MONTHLY_FIVE_AMOUNT_PAISE`.
- `STREAM24_SAAS_BILLING_ENFORCED=true` only for the controlled billing test/pilot after the above is configured.

Create the monthly plans in Razorpay Dashboard and use the exact configured amount in paise. Never commit secrets. Configure webhook events `order.paid`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`, and `subscription.completed`. Razorpay may retry and deliver events out of order, so event and payment IDs are both deduplicated.

## Product model

The requested offers are best represented as prepaid 24-hour passes (one-time purchases), rather than automatically recurring subscriptions:

| Offer | Price | Validity after verified payment | Concurrent streams |
|---|---:|---:|---:|
| Basic day pass | ₹30 | 24 hours | 1 |
| 5-stream day pass | ₹99 | 24 hours | 5 |

The concurrency limit applies across the customer's entire account, not per worker or per browser tab. Creating multiple stream definitions must not increase the allowed number of running streams. If the pass expires, reject new starts and stop any running streams owned by that pass, with a clear warning before expiration.

Monthly auto-renewing plans are a separate product and lifecycle. The first billing API supports a one-stream monthly plan and a five-stream monthly plan, but each remains unavailable until its monthly amount and Razorpay dashboard plan ID are configured. Do not call a 24-hour one-time pass an auto-renewing subscription.

Before launch, decide whether the 24-hour window begins at payment success or first stream start. Recommended initial rule: start at successful payment capture, display the exact expiry time, and do not pause the timer when a stream is stopped.

## Critical capacity and unit economics

Outbound streaming traffic is the primary cost driver because each worker sends a separate RTMP/RTMPS feed to the destination platform.

Approximate continuous traffic for one stream:

- 1 Mbps: 10.8 GB/day and 324 GB per 30 days.
- 4 Mbps: 43.2 GB/day and 1.296 TB per 30 days.
- 6 Mbps: 64.8 GB/day and 1.944 TB per 30 days.

These estimates are decimal GB/TB and exclude protocol overhead, retries, monitoring, and any additional destinations.

| Simultaneous streams | At 4 Mbps each | Approx. outbound per 30 days |
|---:|---:|---:|
| 5 | 20 Mbps | 6.48 TB |
| 100 | 400 Mbps | 129.6 TB |
| 1,000 | 4 Gbps | 1.296 PB |
| 5,000 | 20 Gbps | 6.48 PB |
| 10,000 | 40 Gbps | 12.96 PB |

The 5,000-stream example is 1,000 customers each using five streams simultaneously; 10,000 is 1,000 customers using ten simultaneously. This is a high-scale infrastructure business, not a workload that can be hosted reliably on one free VM.

At 4 Mbps, the ₹30/one-stream/24-hour offer can use about 43.2 GB of outbound data; the ₹99/five-stream/24-hour offer can use about 216 GB. That is approximately ₹0.69 and ₹0.46 of gross revenue per GB respectively, before payment processing, compute, storage, support, tax, and profit. Validate real provider egress pricing and realistic average bitrate/usage before finalizing price. Enforce bitrate and destination limits as part of each plan.

Oracle Always Free currently documents up to 10 TB/month outbound data for eligible accounts; that amount is only enough for roughly 7.7 continuous 4 Mbps streams for a full 30 days, before overhead. Free compute is useful for development and a small pilot, not the planned scale. Verify the current terms in the [Oracle Always Free documentation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## Target architecture

### 1. Customer and billing control plane

- Public sign-up/login, email verification, account recovery, account deletion and tenant isolation.
- Customer connects their own YouTube account or securely supplies an RTMP destination key. Never expose or log stream keys.
- Plans and entitlements are stored centrally and enforced server-side for every create/start/schedule operation.
- Payment provider (Razorpay is a candidate for India) creates orders/subscriptions server-side; payment is activated only after a verified provider signature/webhook and captured/paid status.
- Idempotent webhook handling prevents duplicate entitlement grants. Keep an immutable payment/event record for reconciliation, refunds, and disputes.
- A billing page displays active plan, concurrent stream limit, remaining pass time, renewal/expiry, receipts and upgrade actions.
- Admin console supports customer lookup, payment/entitlement audit, abuse suspension, stream stop, usage, and worker health.

Razorpay documents recurring plans, subscription webhooks, retries, and fixed/quantity/usage-based models: [Razorpay Subscriptions](https://razorpay.com/subscriptions/). Provider credentials and merchant activation are required before payment integration can go live.

### 2. Database and durable scheduling

Replace the JSON file database before multi-instance deployment. The current store rewrites one JSON file per update and has no distributed transaction/locking model.

Use managed PostgreSQL (Neon or Supabase are possible candidates) with migrations and backups. Core tables should include:

- `users`, `sessions`, `tenants` (if team accounts are needed)
- `plans`, `orders`, `payments`, `subscriptions`, `entitlements`
- `streams`, `stream_destinations`, `stream_schedules`
- `workers`, `worker_slots`, `stream_assignments`, `worker_heartbeats`
- `commands`, `stream_events`, `usage_minutes`, `audit_events`

Use transactions and database constraints to reserve a concurrent slot atomically. The same entitlement must never be consumed twice by simultaneous start requests. Do not use the JSON store for a horizontally scaled API.

### 3. Worker fleet

- Separate the customer-facing API from streaming workers.
- A scheduler/dispatcher reserves an available worker slot and assigns a stream based on capacity, region, health, bitrate and stream-copy/transcode requirements.
- Workers poll a durable queue or use a durable message broker; commands must survive API restarts and be idempotent.
- Each stream needs an isolated FFmpeg process, restart policy, watchdog, telemetry and lease. A worker node must advertise measured safe capacity rather than an assumed number.
- Start with stream-copy for compatible source media. Transcoding, overlays, scaling and multiple destinations consume more CPU and bandwidth.
- Add autoscaling only after per-stream CPU/RAM/network benchmarks exist. Use admission control so a paid start is queued/rejected cleanly instead of overloading the fleet.
- Store uploaded video in object storage, not on one API container's local disk. Use signed uploads/downloads, per-user storage quotas, retention rules and deletion.
- Stream output to YouTube via RTMPS where supported; monitor YouTube stream health as well as FFmpeg process state.

### 4. Subscription/entitlement enforcement

For each start request, enforce all of the following on the server:

1. User is active and not suspended.
2. A valid, paid entitlement is active and not expired.
3. Current active stream count plus reserved/pending starts does not exceed the entitlement's concurrent-stream limit.
4. The requested stream and destination belong to the authenticated user.
5. A worker slot is reserved atomically before dispatch.
6. On stop/failure/expiry, release the slot exactly once.
7. Scheduler checks entitlement expiry independently of browser presence and stops active streams when the pass expires.
8. Webhook retries and repeated start clicks cannot create duplicate streams or grant extra time.

Do not rely on a UI-only limit. API checks, database transactions, worker leases, and expiry enforcement are mandatory.

## Rollout phases

### Phase 0 — prove demand and costs
- Deploy the existing cloud branch to one eligible VM for internal tests only.
- Measure one stream at 720p/1080p stream-copy and transcode modes.
- Record egress GB/hour, CPU, memory, reconnects, storage per hour and failure rate.
- Verify one stream survives browser/PC shutdown; then test two and three.
- Confirm actual cloud price per GB and calculate margin for both day passes.

### Phase 1 — SaaS foundation
- Migrate persistence to PostgreSQL and introduce schema migrations.
- Add public registration, email verification, tenant-scoped authorization and admin access.
- Add plans, orders, entitlement records, webhook verification and the billing UI.
- Enforce concurrent-stream quotas and expiry with automated tests.
- Keep payment integration in test mode until webhook/reconciliation tests pass.

### Phase 2 — pooled workers
- Extract a worker interface and durable queue.
- Support multiple isolated stream runners per worker with measured slot capacity.
- Add object storage, worker provisioning, health dashboards, alerts and operator controls.
- Pilot with a small group and hard concurrency cap.

### Phase 3 — controlled scale
- Raise caps gradually (e.g. 10, then 25, then 100 simultaneous streams) only after sustained load tests.
- Test queue recovery, database failover, worker loss, payment webhook retries, expiry stops, and noisy-neighbor isolation.
- Scale outbound network capacity and worker fleet based on actual paid demand. Do not claim 5,000–10,000 streams until the fleet and egress contracts have been tested at that level.

## Launch blockers

- [ ] Payment provider merchant account and API/webhook secrets are configured securely.
- [ ] PostgreSQL migration and recovery are proven.
- [ ] Public sign-up and tenant isolation pass security tests.
- [ ] Billing webhook signatures, idempotency, refunds and expiry are tested.
- [ ] Concurrent stream quota is transaction-safe.
- [ ] Worker slot reservation, command durability and automatic stop on expiry work.
- [ ] Object storage and per-user storage/retention limits are implemented.
- [ ] Actual cost/margin model is validated at target bitrates.
- [ ] Load tests and alerting support the advertised concurrency.

## Useful official references

- [Oracle Always Free limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Razorpay Subscriptions](https://razorpay.com/subscriptions/)
- [YouTube live encoder and bitrate guidance](https://support.google.com/youtube/answer/2853702)
