# Stream24 cloud VPS (Option A)

This is the first cloud deployment milestone: run the Stream24 control server and a persistent Linux FFmpeg worker on the same VPS. The VPS must remain powered on for a stream to continue after your PC is turned off.

## What this provides

- Linux FFmpeg/FFprobe worker in a restartable container.
- Persistent Stream24 database and a persistent shared media volume.
- Worker restart policy and server health check.
- No dependency on a Windows drive path once media is stored in the VPS media volume.

## Upload-to-live workflow

The cloud branch includes an authenticated browser upload endpoint and a Media-page upload panel. The server writes each upload under the configured persistent `STREAM24_MEDIA_ROOT`, grouped by owner, and the same volume is mounted in the worker container. Use **Upload selected videos**, then **Use uploaded videos in a stream** to add them to a new stream playlist. The API enforces a configurable upload-size limit (default 5 GiB) and only accepts known video extensions. Run Preflight before starting a stream. Large uploads should use HTTPS and a reverse proxy configured for streaming request bodies and an adequate body-size limit.

Do not expect a Windows path such as `C:\\Users\\...\\video.mp4` to work on Linux.

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
6. Keep `STREAM24_ALLOW_REMOTE_SETUP` unset/disabled. From your own PC, open an SSH tunnel with `ssh -L 3000:127.0.0.1:3000 <ssh-user>@<vps-ip>` and visit `http://localhost:3000` to create the owner account; the server sees the setup request as loopback. Keep the tunnel open during setup. Configure the HTTPS reverse proxy before normal remote use.
7. Sign in and create one worker from the Workers/Devices page. Copy the worker token immediately; it is shown only once.
8. Set `STREAM24_AGENT_TOKEN` in `.env` to that token. Protect `.env` from other users.
9. Start the worker: `docker compose up -d worker`.
10. Verify `docker compose ps`, `docker compose logs --tail=100 server worker`, and `GET /api/health` through the HTTPS domain.
11. Open Media, upload a test MP4, choose **Use uploaded videos in a stream**, configure the YouTube destination, and save the stream. Run Preflight before starting a private/unlisted test stream.

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
- [ ] Browser uploads are tested through the actual HTTPS reverse proxy with realistic large files.
- [ ] Disk-full behavior, storage cleanup/retention, and backup/restore of the media volume are validated.
