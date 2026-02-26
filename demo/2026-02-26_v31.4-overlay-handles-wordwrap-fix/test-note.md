---
tags: [codemarker, v31-4, overlay, handles, word-wrap]
---

# v31.4 — Move Handles to Overlay (Word-Wrap Fix)

## What's new in v31.4

Resize handles have been moved from CM6 `Decoration.widget` to the overlay panel. Previously, handles were inline CM6 widgets that disrupted word-wrap calculations — the editor would reflow text around the handle elements, causing visual jitter and incorrect line breaks. By rendering handles in the overlay (absolutely positioned), they no longer affect text layout.

## How to verify

1. Open this note in the demo vault
2. Create a marker on a long paragraph that wraps across multiple lines
3. Hover over the marker — resize handles should appear at the edges
4. Confirm that text does NOT reflow or jump when handles appear/disappear
5. Resize a marker by dragging a handle — the text should stay stable
6. Try with multiple markers on wrapped lines to confirm no layout shifts

## Test content

This is a long paragraph intended to test word-wrap behavior with resize handles. When you hover over a coded passage, the resize handles should appear without causing any text to reflow or jump to a new line. The handles are now rendered as overlay elements positioned absolutely over the text, rather than as inline CM6 widgets that participate in the document flow. This means the editor's line-wrapping algorithm no longer needs to account for handle width, eliminating the visual jitter that occurred in previous versions when hovering over markers near line-break boundaries.

Another paragraph for testing: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
