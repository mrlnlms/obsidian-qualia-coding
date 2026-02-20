---
version: 38.12
engine: codemarker-analytics
date: 2026-02-20
---

# v38.12 — Board fixes + right-click + drag & drop

## What's new
- Board bug fixes for node rendering and layout
- Right-click context menu on board nodes
- Drag & drop codes onto the board with cluster grouping visual

## How to verify
1. Open the Analytics plugin via the command palette (CodeMarker Analytics)
2. Switch to Board view
3. Right-click on a board node — context menu should appear
4. Drag a code from the sidebar and drop it onto the board — it should group into a cluster
5. Check console for `[codemarker-analytics] v38.12 loaded`

## Final sub-commit
This is the last sub-commit (12/12) for the Analytics engine (v38).
All analytics features are now complete: network graph, matrix, dashboard,
text retrieval, wordcloud, MCA/MDS, Jaccard, dendrograms, lag-seq,
polar charts, chi-squared, decision tree, source comparison, code overlap,
research board with canvas, and drag & drop interaction.
