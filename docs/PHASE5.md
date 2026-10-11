# Phase 5 — Playlist workflow, templates and branding

Phase 5 turns the Phase 4 streaming core into a more reusable channel-management workflow while keeping media and streaming local.

## Added

- Media Library → playlist workflow from the browser.
- Drag-and-drop playlist ordering in the stream editor.
- Manual path editor remains available for files not yet scanned.
- Reusable stream templates. Templates copy worker, playlist, destination URL, encoding, schedule and branding settings, but never copy the YouTube stream key.
- Local logo/watermark overlays with top-left, top-right, bottom-left and bottom-right positioning, width and opacity controls.
- Branding images remain on the worker PC.
- Overlay-enabled streams automatically use H.264/AAC encoding because video filters cannot be used with stream-copy.
- Branding preflight checks for a configured and existing image file.
- FFmpeg timestamp normalization (`+genpts`, `avoid_negative_ts`) and reduced inter-item respawn delay for cleaner playlist handoff.
- Agent/server version 0.5.0.

## Current playback limitation

Playlist item changes still use a controlled FFmpeg process handoff. Phase 5 reduces the handoff delay, but it is not guaranteed to be frame-perfect/gapless on every YouTube ingest connection. A later channel pipeline can use a persistent filter/concat graph or prebuilt transport stream for stricter gapless requirements.

## Zero-cost model

The control plane, metadata and dashboard remain self-hosted locally. Video files, logos and FFmpeg processing stay on the user's worker PC. No VPS, paid object storage or card-backed cloud service is required.
