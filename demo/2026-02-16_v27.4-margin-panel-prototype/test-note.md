---
codes:
  - name: "Theme A"
    color: "#e74c3c"
    markers:
      - from: 45
        to: 120
  - name: "Theme B"
    color: "#3498db"
    markers:
      - from: 80
        to: 200
  - name: "Insight"
    color: "#2ecc71"
    markers:
      - from: 150
        to: 280
---

# What's new in v27.4

## Margin Panel Prototype (MAXQDA-style brackets)

This version introduces a margin panel to the left of the editor that displays
colored vertical brackets alongside coded text, inspired by MAXQDA's margin
coding visualization.

Each bracket shows:
- A vertical colored line spanning the marker's text range
- Small horizontal ticks at top and bottom
- The code name as a label

Overlapping markers from different codes are stacked horizontally in separate
columns so they remain visually distinct.

## How to verify

1. Open this note and check the left margin area for colored brackets
2. Verify brackets span the correct line ranges for each coded segment
3. Check that overlapping codes appear in separate columns (stacked horizontally)
4. Scroll up and down to confirm only visible brackets render (viewport culling)

## Sample coded content

This paragraph contains text that should be coded with Theme A. The red bracket
should appear along the left margin spanning these lines. Notice how the bracket
has small ticks at the top and bottom edges.

This section overlaps with Theme A and introduces Theme B. You should see two
brackets side by side in the margin — red for Theme A and blue for Theme B.
The horizontal stacking keeps them readable even when ranges overlap.

Further down, the Insight code begins. A green bracket should appear here,
overlapping with the tail end of Theme B. Three brackets may be visible
simultaneously in the margin, each in its own column.

This is uncoded text at the end of the note. No brackets should appear here.
