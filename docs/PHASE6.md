# Phase 6 — Persistent Channel Engine

Phase 6 adds a single-process FFmpeg concat pipeline for compatible playlists, automatic sequential fallback for mixed media, weekly programming blocks, and on-demand local preview snapshots.

## Persistent pipeline

During preflight the worker probes the complete playlist. When stream topology is uniform (video/audio codecs, resolution and audio layout), the worker creates a temporary `ffconcat` manifest and keeps one FFmpeg/RTMP process alive through playlist transitions. This removes the routine RTMP reconnect that happened between every item in earlier phases.

Mixed playlists remain supported: Stream24 automatically selects the safe sequential pipeline instead of forcing an incompatible concat stream.

## Programming calendar

Each stream can define weekly programming blocks using its configured timezone. When the active block changes, the server swaps the playlist and hot-applies the updated stream configuration. If no block is active, the base playlist is restored.

## Preview

The Preview action asks the local worker to extract a JPEG frame with FFmpeg. Only the small JPEG preview is returned to the local control plane; source video files remain on the worker.
