---
version: 38.5
engine: codemarker-analytics
date: 2026-02-19
---

# v38.5 — Audio + Video source integration + navigate

## What's new
- Analytics engine now reads audio and video source data via `readAudioData` and `readVideoData`
- Consolidated data pipeline includes all 6 source types: markdown, CSV, image, PDF, audio, video
- Navigate-to-source support for audio and video entries in the analytics view

## How to verify
1. Open the command palette and run "Open CodeMarker Analytics"
2. Run "Refresh Analytics Data" — confirm audio (.mp3) and video (.mp4) files are included in the consolidated view
3. Click on an audio or video entry in the analytics view — verify it navigates to the source file
4. Check console for: `[codemarker-analytics] v38.5 loaded`
