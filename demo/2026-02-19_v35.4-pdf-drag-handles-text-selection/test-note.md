---
version: "35.4"
engine: codemarker-pdf
date: 2026-02-19
---

# v35.4 — Drag handles + text selection

## What's new

- **Drag handles** on PDF highlights let you resize marker boundaries directly in the viewer
- **Text selection over highlights** works without interference — you can select text that overlaps with existing coded passages
- **Cross-page selection** flows seamlessly across page boundaries

## How to verify

1. Open a PDF file in the vault (e.g., `User Research Study.pdf`)
2. Create a coded highlight on some text
3. Hover over the highlight — drag handles should appear at the edges
4. Drag a handle to resize the marker boundary
5. Try selecting text that overlaps with an existing highlight — it should work naturally
6. Try selecting text across two pages — cross-page selection should be detected
