# Stream24 cloud VPS (Option A)

This is the first cloud deployment milestone: run the Stream24 control server and a persistent Linux FFmpeg worker on the same VPS. The VPS must remain powered on for a stream to continue after your PC is turned off.

## What this provides

- Linux FFmpeg/FFprobe worker in a restartable container.
- Persistent Stream24 database and a persistent shared media volume.
- Worker restart policy and server health check.
- No dependency on a Windows drive path once media is stored in the VPS media volume.

## Important current limitation

This infrastructure change does **not by itself add browser video uploads**. The current dashboard media workflow is based on worker-scanned paths. Until the upload API/UI is implemented, files must be copied to the VPS media volume by an administrator and streams must reference the path visible inside the worker container (normally `/data/media/filename.mp4`). Do not expect a Windows path such as `C:\\Users\\...\\video.mp4` to work on Linux.

## VPS prerequisites

- Ubuntu 22.04/24.04 or another supported Linux distribution.
- Docker Engine and the Docker Compose plugin.
- At least 2 vCPU and 4 GB RAM as a starting point; transcoding and high-bitrate streams may require more CPU, RAM, and bandwidth.
- Persistent disk sized for uploaded media plus operating-system and database overhead.
- A domain name and HTTPS reverse proxy for public access. Do not expose port 3000 directly to the internet.

## Deploy

1. Clone the repository on the VPS and check out the cloud branch.
2. Copy `.env.cloud-vps.example` to `.env`.
3. Generate a strong `APP_MASTER_KEY` and store it in a password manager/secure secret store. Back it up separately; encrypted Stream24 secrets cannot be recovered without it.
4. Build the image: `docker compose build`.
5. Start the server only: `docker compose up -d server`.
6. Put Stream24 behind HTTPS before creating the owner account. The first-run setup route is loopback-restricted by default. If remote setup must be temporarily enabled, enable `STREAM24_ALLOW_REMOTE_SETUP=1` only for the initial setup, create the owner, then remove the setting and recreate the server container immediately.
7. Sign in and create one worker from the Workers/Devices page. Copy the worker token immediately; it is shown only once.
8. Set `STREAM24_AGENT_TOKEN` in `.env` to that token. Protect `.env` from other users.
9. Start the worker: `docker compose up -d worker`.
10. Verify `docker compose ps`, `docker compose logs --tail=100 server worker`, and `GET /api/health` through the HTTPS domain.
11. Copy a test MP4 into the persistent media volume using an administrator-only method, then create a stream using its Linux path. Run Preflight before starting a private/unlisted test stream.

## Upload path (current infrastructure)

The shared Docker volume is mounted at `/data/media` inside both containers. Keep video paths within this root. Do not mount the Docker socket or expose the worker container as a public service.

## Security and operations

- Configure HTTPS at a reverse proxy such as Caddy or Nginx. The compose server port binds to loopback only.
- Do not publish the worker container port.
- Never commit `.env`, owner credentials, worker tokens, or YouTube stream keys.
- Rotate any YouTube stream key that has been exposed in logs, terminal output, screenshots, or chat.
- Back up the database volume and keep `APP_MASTER_KEY` separately. Test restoration before production use.
- Monitor disk usage; video files can fill a VPS disk quickly.
- Use private/unlisted streams until upload, preflight, and stop/start recovery are validated.
- The worker's plain HTTP control connection is confined to the private Docker network. Do not copy this configuration to a public network.

## Acceptance checklist

- [ ] Server health endpoint reports `ok: true`.
- [ ] Dashboard login survives a container restart.
- [ ] Worker shows online after the token is configured.
- [ ] FFmpeg and FFprobe are detected by the worker.
- [ ] A media file stored in `/data/media` passes Preflight.
- [ ] A private/unlisted test stream starts, reports live telemetry, and stops cleanly.
- [ ] The VPS worker continues after the user's PC is shut down.
- [ ] Browser upload UI/API, upload limits, storage cleanup, and disk-full errors are implemented before calling the product fully upload-to-live ready.
