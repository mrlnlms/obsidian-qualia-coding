---
tags: [codemarker-test, v27-9]
---

# v27.9 — Code Detail Side Panel (ItemView)

## What's new
- **Code Detail View**: New side panel (ItemView) that displays details about a selected code/marker
- Click a code label in the margin panel to open the detail view in a side leaf
- Panel shows code name, marked text excerpt, and marker metadata
- Uses Obsidian's native `ItemView` API for proper workspace integration

## How to verify
1. Open this note and create some markers with codes
2. Click on a code label in the margin panel
3. A side panel should open showing the code's details (name, text, metadata)
4. Check console for: `[CodeMarker v2] v27.9 loaded`

## Test content

This paragraph can be marked with a code to test the detail panel. Select this text and assign a code like "methodology" or "finding" to see it appear in the margin, then click the label to open the detail view.

Another paragraph here for additional markers. Try overlapping codes to verify the panel updates correctly when switching between different code labels.
