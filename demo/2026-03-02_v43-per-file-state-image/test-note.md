---
title: "v43 — Per-file state image + backlog update"
version: 43
date: 2026-03-02
era: 4
type: consolidation
---

# What's new in v43

- **Per-file state persistence for image engine**: zoom level and pan position are now saved per file, so reopening an image restores your exact view
- **Backlog updated**: closed items implemented today

# How to verify

1. Open an image file in the vault (e.g., any PNG/JPG)
2. Zoom in and pan to a specific area
3. Switch to another file and come back — zoom/pan state should be restored
4. Check console for `[Qualia Coding] v43 loaded`
