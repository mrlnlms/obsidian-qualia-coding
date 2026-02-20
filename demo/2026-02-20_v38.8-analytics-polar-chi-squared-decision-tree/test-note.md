---
version: "38.8"
engine: codemarker-analytics
date: 2026-02-20
---

# v38.8 — Polar + Chi-squared + Decision Tree

## What's new

Three new statistical visualization modes added to CodeMarker Analytics:

1. **Polar Chart**: Radial visualization of code frequencies — each code is a spoke with length proportional to its count
2. **Chi-squared Test**: Statistical independence test between codes and documents — highlights statistically significant associations
3. **Decision Tree**: Classification tree that identifies which document features predict code application, with configurable minNodeSize (lowered to 2)

## How to verify

1. Open the CodeMarker Analytics view via command palette ("Open CodeMarker Analytics")
2. Check that the dashboard shows new mini-thumbnails for Polar, Chi-squared, and Decision Tree
3. Switch to **Polar** view — codes should display as a radial chart
4. Switch to **Chi-squared** view — should show a matrix with p-values and significance indicators
5. Switch to **Decision Tree** view — should render a tree structure with node statistics (formatting fix applied)
6. Verify that nodes with as few as 2 items are shown (minNodeSize = 2)
