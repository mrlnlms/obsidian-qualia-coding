---
markers: []
---

# v31.2 — Multi-marker hover partial overlap

## What's new
- Hovering over text where multiple markers partially overlap now shows all markers in the hover tooltip
- Menu is suppressed during hover to avoid UI conflicts
- Improved hit-testing for overlapping marker regions

## How to verify
1. Create two markers that partially overlap (e.g., marker A covers words 1-5, marker B covers words 3-8)
2. Hover over the overlapping region (words 3-5)
3. The hover tooltip should list both markers
4. The selection menu should not appear while hovering

## Test content

This is a sentence where you can create overlapping markers to test the multi-marker hover behavior on partial overlap regions.

Another paragraph with different text to mark. Try creating markers that share some words but not all, then hover over the shared region.
