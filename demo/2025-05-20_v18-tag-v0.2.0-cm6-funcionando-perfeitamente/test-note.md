---
version: 18
tag: v0.2.0
date: 2025-05-20
title: "CM6 funcionando perfeitamente"
era: 2
source: github (mrlnlms/obsidian-codeMarker @ 63ed3f0)
---

# v18 — TAG v0.2.0: CM6 funcionando perfeitamente

## What's new
- CM6 implementation working perfectly
- posAtCoords working correctly — drag interaction functional
- resizeHandles.ts removed (no longer needed with CM6 approach)
- Breakthrough in coordinate-based interaction model

## How to verify
1. Open console: should see `[CodeMarker] v18 loaded`
2. Select text and run "Criar uma nova marcacao de codigo" command
3. Verify markers render correctly with CM6 decorations
4. Test drag interaction on markers — should work with posAtCoords

## Demo content

Select this paragraph and create a code marker. The CM6 StateField and ViewPlugin
should render highlight decorations correctly. Try dragging marker handles —
posAtCoords now resolves positions accurately.

Another paragraph to test multiple markers. Create markers on different sections
and verify they persist across file switches.
