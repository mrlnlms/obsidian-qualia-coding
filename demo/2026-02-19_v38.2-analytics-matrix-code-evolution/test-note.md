---
version: "38.2"
engine: codemarker-analytics
date: 2026-02-19
---

# v38.2 — Analytics: Matrix + Code Evolution

## What's new

- **Document-Code Matrix**: Tabular view showing which codes appear in which documents, with frequency counts and sorting (alphabetical or by total)
- **Code Evolution**: Timeline visualization showing how coding activity changes over time, with per-file filtering
- **Stats engine**: New `calculateDocumentCodeMatrix` and `calculateEvolution` functions in the stats engine
- **View mode tabs**: Analytics view now has 5 modes: Frequency, Co-occurrence, Network Graph, Document-Code Matrix, Code Evolution

## How to verify

1. Open Command Palette > "Open CodeMarker Analytics"
2. Switch to "Document-Code Matrix" tab — verify the matrix renders with documents as rows and codes as columns
3. Try sorting by "alpha" vs "total" using the sort controls
4. Switch to "Code Evolution" tab — verify the timeline chart renders
5. Try the file selector dropdown to filter evolution data by file
6. Console should show: `[codemarker-analytics] v38.2 loaded — Matrix + Code Evolution`
