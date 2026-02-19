---
tags: [codemarker-audio, test]
version: "36.2"
---

# v36.2 — Audio: Fase 5 hover, resize, analytics, settings

## What's new
- Bidirectional hover: hovering a region highlights it in both waveform and sidebar
- Region resize: drag region edges to adjust start/end times
- Analytics seek: click a code in analytics to seek audio to that region
- Settings tab: configurable defaults (zoom, waveform colors, region opacity)

## How to verify
1. Open an audio file (e.g., `Conquerors and The World.mp3`)
2. Create a region by dragging on the waveform, assign a code
3. Hover the region — observe highlight in sidebar explorer
4. Hover a code in the sidebar — observe region highlight in waveform
5. Drag a region edge to resize it — verify the marker bounds update
6. Open Settings > CodeMarker Audio — verify settings tab appears
7. Change default zoom or region opacity in settings — verify changes apply
