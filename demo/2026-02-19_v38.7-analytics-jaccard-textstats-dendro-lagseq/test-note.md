---
version: 38.7
date: 2026-02-19
engine: codemarker-analytics
---

# What's new in v38.7

Four new analysis modules added to CodeMarker Analytics:

1. **Jaccard Similarity** — pairwise code co-occurrence matrix using Jaccard index
2. **Text Statistics** — word count, sentence count, readability metrics per code/document
3. **Dendrogram + Silhouette** — hierarchical clustering visualization with quality measure
4. **Lag Sequential Analysis** — temporal patterns in code application sequences

## How to verify

1. Open CodeMarker Analytics view (Cmd+P > "Open CodeMarker Analytics")
2. Check for Jaccard Similarity tab/section — should show a matrix of code pairs
3. Check for Text Statistics — should display per-document metrics
4. Check for Dendrogram — should render a tree-like clustering diagram
5. Check for Lag Sequential Analysis — should show sequential transition patterns
