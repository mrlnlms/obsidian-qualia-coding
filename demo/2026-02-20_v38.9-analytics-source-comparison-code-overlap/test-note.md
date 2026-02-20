---
version: "38.9"
date: 2026-02-20
engine: codemarker-analytics
---

# What's new in v38.9

Two new analytics view modes added to CodeMarker Analytics:

- **Source Comparison**: Compares coding patterns across different source types (markdown, CSV, image, PDF, audio, video). Displays as a grouped bar chart or table showing how codes distribute across source types.
- **Code Overlap**: Analyzes spatial overlap between codes — identifies which codes co-occur on the same text passages or regions, revealing coding patterns and potential redundancy.

Total view modes: **18** (Frequency, Co-occurrence Matrix, Network Graph, Document-Code Matrix, Code Evolution, Text Retrieval, Word Cloud, MCA, MDS, Jaccard, Text Statistics, Dendrogram, Lag Sequential, Polar, Chi-squared, Decision Tree, Source Comparison, Code Overlap).

# How to verify

1. Open CodeMarker Analytics from the command palette
2. In the view mode dropdown, select **Source Comparison**
   - Verify chart/table renders showing code distribution by source type
   - Try toggling between chart and table display
3. Select **Code Overlap** from the dropdown
   - Verify the overlap visualization renders
4. Check the dashboard — both new modes should have mini-thumbnail previews
5. Console should show: `[codemarker-analytics] v38.9 loaded`
