---
tags: [codemarker-audio, test]
version: "36.4"
---

# v36.4 — File interceptor + zoom guards

## What's new
- ResizeObserver callback now has try-catch for zoom race conditions
- Prevents "No audio loaded" errors when zooming before audio is ready
- Zoom guards protect waveform rendering during rapid state changes

## How to verify
1. Open an audio file (e.g., `Conquerors and The World.mp3`)
2. Rapidly zoom in/out using the zoom slider before audio fully loads
3. Check console — no "No audio loaded" errors should appear
4. Resize the pane while audio is loading — should handle gracefully

## Test content
Open any `.mp3` file in the vault and interact with zoom controls immediately.
