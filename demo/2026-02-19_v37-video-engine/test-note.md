---
tags: [codemarker, video, test]
---

# v37 — Video Engine

CodeMarker Video: fork of the Audio engine adapted for video files (mp4, webm, ogv).

## What's new in v37

- New **CodeMarker Video** plugin — fork of the Audio engine
- Video player with waveform visualization (via wavesurfer.js)
- Qualitative coding on video timeline regions
- Code Explorer and Code Detail views for video annotations
- Speed control (0.5x - 2x), zoom, volume
- ~2680 LOC TypeScript

## How to verify

1. Open `let.mp4` in the vault — it should open in the CodeMarker Video view
2. Check the waveform visualization renders below the video
3. Try creating a coding region on the timeline
4. Open the Video Code Explorer from the command palette
5. Test playback speed controls (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
