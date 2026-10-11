# Phase 8 — YouTube Provisioning & Multi-Destination RTMP

Phase 8 adds full optional YouTube live resource provisioning and a generic multi-destination output model.

## Delivered

- `liveStreams.insert` support
- `liveBroadcasts.insert` support
- `liveBroadcasts.bind` support
- Ingest URL/key extraction
- Primary + secondary/failover destinations
- Encrypted destination keys
- FFmpeg tee muxer simulcast path
- Browser provisioning form
- Multi-destination editor
- Backward-compatible manual RTMP
- Automated provisioning test

## Safety/reliability notes

YouTube API integration is optional. The local worker remains the only component transmitting video. Secondary tee outputs are configured with `onfail=ignore`; this is output isolation, not a second independent encoder process. A later phase can add true active/passive independent failover workers.
