---
tags: [test, audio, v36-6]
version: "36.6"
engine: codemarker-audio
---

# v36.6 — Colored bars minimap + ruler positioning fixes

## What's new
- Colored bars in the minimap now reflect region codes visually
- Timeline ruler moved below the waveform, above the transport bar
- Ruler rendered in a dedicated container outside the shadow DOM for proper visibility
- Waveform overflow reverted to hidden (no longer needed for timeline ruler)

## How to verify
1. Open an audio file (e.g., `Conquerors and The World.mp3`)
2. Create several coded regions with different codes
3. Check the minimap — colored bars should appear representing each coded region
4. Verify the timeline ruler appears below the waveform, above the transport controls
5. Scroll/zoom the waveform and confirm the ruler stays correctly positioned
