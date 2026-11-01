# Stream24 on a free Oracle Cloud VM (trial deployment)

This is the zero-monthly-fee trial path for the `feat/cloud-vps-worker` branch. It is not a guarantee of account approval, VM capacity, or uninterrupted service. Oracle may require a payment card for identity verification; do not upgrade to a paid account unless you understand the billing implications.

## Can it run 2–3 YouTube streams?

Oracle currently documents Always Free Ampere A1 capacity for eligible free tenancies of up to **2 OCPUs and 12 GB RAM**, plus **10 TB/month outbound data transfer**. Compute must be created in the tenancy's home region. Capacity may be unavailable, and quotas/pricing can change: verify the current console labels and official terms before creating resources.

Use this as an initial test target, not a promise of production capacity:

- Start with **one stream**, then test two and three.
- Use compatible media and **stream copy** (no video re-encoding) where the Stream24 pipeline supports it.
- Do not enable logo overlays, scaling, frame-rate conversion, or other filters for the first test; those require encoding and can exceed the CPU budget.
- Keep each stream's total bitrate around 4 Mbps or lower for the first bandwidth test. Approximate monthly egress for continuous 30-day streaming is 0.324 TB per Mbps: three 4 Mbps streams use about 3.9 TB/month; three 6 Mbps streams about 5.8 TB/month; three 8 Mbps streams about 7.8 TB/month. Add overhead, dashboard traffic, and other egress. Monitor Oracle usage.
- YouTube's ingest requirements, your source media, the actual Stream24 pipeline, and the VM's performance can still limit concurrent streams. Do not advertise three-stream support until it passes a sustained test.

Official references:
- [Oracle Always Free resource limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
- [Oracle Linux instance creation guide](https://docs.oracle.com/en-us/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm)

## 1. Create the VM

1. Create/sign in to an Oracle Cloud account and finish any verification. Choose the free/Always Free route; do not select a paid upgrade just to bypass capacity limits.
2. Note the **home region** shown for your tenancy. Create the VM in that region.
3. Create an instance using an **Always Free eligible** Ampere A1 Flex shape. For a new free tenancy, target **2 OCPUs / 12 GB RAM** or a smaller shape if the console shows a smaller free allowance. Select a current Ubuntu ARM64 image if available, assign a public IPv4 address, and add your own SSH public key.
4. If creation reports out of host capacity, retry later or try another availability domain in the same home region. Do not create a paid resource as an automatic workaround.
5. In the VM's VCN security list or Network Security Group, allow inbound TCP 22 from your own public IP, and TCP 80/443 for the public HTTPS dashboard. Do not open TCP 3000 or the worker's internal ports to the internet.
6. Reserve/record the public IP. For browser uploads and HTTPS, point a domain's DNS A record to this IP. If you do not own a domain, first validate server setup via SSH tunnel; normal browser uploads should only be exposed over HTTPS.

## 2. Install Docker on Ubuntu ARM64

SSH into the VM as the default Ubuntu user. Check architecture and disk before installing:

```bash
uname -m
df -h
```

For an ARM VM, `uname -m` should report `aarch64`. Install Docker Engine and the Docker Compose plugin using Docker's official Ubuntu instructions:
[Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

After installation, verify:

```bash
sudo docker version
sudo docker compose version
```

Use `sudo docker` in the steps below unless you intentionally configure non-root Docker access. Membership in the Docker group is effectively root-level access.

## 3. Deploy Stream24

```bash
git clone https://github.com/gauravprajapat-23/stream24.git
cd stream24
git switch feat/cloud-vps-worker
cp .env.cloud-vps.example .env
```

Edit `.env` and replace every placeholder. Generate a 64-hex-character master key:

```bash
openssl rand -hex 32
nano .env
```

Set `APP_MASTER_KEY` to the generated value. Keep `STREAM24_AGENT_TOKEN` as a placeholder for now. Leave remote setup disabled. Protect this file:

```bash
chmod 600 .env
sudo docker compose build
sudo docker compose up -d server
sudo docker compose ps
sudo docker compose logs --tail=100 server
```

The compose file binds port 3000 to loopback only. Create the first owner account through an SSH tunnel from your own computer (PowerShell or terminal):

```bash
ssh -L 3000:127.0.0.1:3000 ubuntu@YOUR_VM_PUBLIC_IP
```

Keep the SSH session open and visit `http://localhost:3000` in your local browser. Create the owner account. Do not enable remote setup as a shortcut.

## 4. Configure HTTPS before normal use

For a public dashboard and large browser uploads, use a domain with HTTPS. Install Caddy using its official Ubuntu repository instructions:
[Caddy installation](https://caddyserver.com/docs/install).

Create a Caddy site for your domain (replace `stream24.example.com` with your DNS name):

```caddyfile
stream24.example.com {
    reverse_proxy 127.0.0.1:3000
    request_body {
        max_size 5GB
    }
}
```

Validate/reload Caddy using the service commands for your installation. Ensure DNS points to the VM and inbound TCP 80/443 is allowed. Caddy obtains and renews certificates automatically when DNS and ports are correct. The request-body limit must be at least as large as `STREAM24_MAX_UPLOAD_BYTES`; check the installed Caddy version's syntax if the directive is rejected. Do not expose port 3000 publicly.

## 5. Create the worker and start it

1. Sign in to Stream24 over HTTPS.
2. Open **Workers/Devices** and create one worker. Copy its token immediately; it may only be displayed once.
3. On the VM, edit `.env` and set `STREAM24_AGENT_TOKEN` to that token. Keep `APP_MASTER_KEY` unchanged and private.
4. Start the worker:

```bash
sudo docker compose up -d worker
sudo docker compose ps
sudo docker compose logs --tail=100 worker
```

5. Confirm `/api/health` reports healthy, and the worker is online. If it is not, inspect both server and worker logs before proceeding.

## 6. Upload and test a stream

1. Open **Media**, upload one small MP4, and select **Use uploaded videos in a stream**.
2. Configure the YouTube destination and save the stream. Run **Preflight**.
3. Start a **private or unlisted** test stream and verify the YouTube preview, telemetry, and clean stop.
4. Confirm it remains live after closing your browser and shutting down your PC. The cloud VM must stay running.
5. Only then repeat with two streams, and finally three. Monitor CPU, RAM, disk, network throughput, and Oracle outbound data transfer throughout a sustained test.

Useful commands:

```bash
sudo docker compose ps
sudo docker stats
sudo docker compose logs --since=15m server worker
df -h
```

## Cost and safety guardrails

- Always Free eligibility is shown in the Oracle console; do not assume every shape, disk, IP, or add-on is free. Check each resource's cost label and your tenancy limits before provisioning.
- Set a budget/usage alert if available, and review Cost Analysis regularly. A budget alert may notify you but does not necessarily stop paid resources.
- Do not click **Upgrade** or provision paid resources to bypass a free-capacity error unless you accept possible charges.
- Keep the VM and its data backed up. Free-tier capacity is not a service-level agreement.
- Never commit `.env`, the master key, worker token, login credentials, or YouTube stream key.
- Rotate any stream key previously exposed in logs, screenshots, terminal output, or chat.
- Do not use a free cloud VM to transcode three streams until measurements prove it can sustain that workload. Start with compatible source files and stream copy.
- This deployment branch remains a draft PR until actual integration checks pass. Do not treat documentation or a green syntax/unit-test workflow as proof that live streaming works.

## Acceptance checklist

- [ ] VM is explicitly marked Always Free eligible in the console.
- [ ] SSH works and public inbound rules expose only intended ports.
- [ ] Docker and Compose work on ARM64.
- [ ] Server survives restart and `/api/health` is healthy.
- [ ] HTTPS dashboard loads with a valid certificate.
- [ ] Owner account is created through the SSH tunnel with remote setup disabled.
- [ ] Worker is online and detects FFmpeg/FFprobe.
- [ ] Uploaded media is visible to both server and worker via the persistent media volume.
- [ ] One private/unlisted stream survives PC shutdown.
- [ ] Two-stream and three-stream tests pass for a sustained period without overload.
- [ ] Outbound data, disk use, and billing/usage dashboard are checked.
