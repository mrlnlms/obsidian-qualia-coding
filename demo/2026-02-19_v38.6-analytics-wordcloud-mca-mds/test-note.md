---
version: "38.6"
engine: codemarker-analytics
date: 2026-02-19
---

# v38.6 — Word Cloud + MCA + MDS

## What's new

Three new visualization modes added to the Analytics engine:

- **Word Cloud**: Visual representation of code frequency as a word cloud — larger words indicate more frequent codes
- **MCA (Multiple Correspondence Analysis)**: Statistical technique that maps codes and documents into a 2D space based on co-occurrence patterns, revealing hidden groupings
- **MDS (Multidimensional Scaling)**: Proximity map that places codes in 2D space based on their similarity — codes that co-occur frequently appear closer together

## How to verify

1. Open CodeMarker Analytics via command palette
2. Refresh data if needed
3. Check the view mode selector — should now include Word Cloud, MCA, and MDS options
4. Switch to Word Cloud: codes should render as differently sized text based on frequency
5. Switch to MCA: should show a scatter plot with codes and documents positioned by correspondence
6. Switch to MDS: should show a proximity map with codes positioned by similarity
