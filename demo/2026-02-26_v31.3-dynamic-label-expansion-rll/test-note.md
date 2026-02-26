---
tags: [codemarker-test, v31-3]
version: "31.3"
feature: dynamic-label-expansion-rll
---

# v31.3 — Dynamic Label Expansion RLL

## What's new
- Margin panel labels now expand dynamically using Right-to-Left Layout (RLL) positioning
- Labels that would otherwise be truncated expand on hover/interaction
- Improved readability for long code names in the margin panel

## How to verify
1. Open this note and apply several codes with long names to different text segments
2. Check the margin panel on the right — labels should appear truncated initially
3. Hover or interact with a label — it should expand to show the full code name
4. Multiple overlapping labels should position correctly without collisions

## Test content

This paragraph has some text that can be marked with a code. Try applying a code with a long name like "Theoretical Framework Analysis" to see the label expansion in the margin panel.

Another paragraph here for testing multiple markers. Apply a different code such as "Participant Response Pattern" to compare how labels stack and expand in the margin.

A third segment for overlap testing. Mark this with yet another code to verify the RLL positioning handles multiple labels correctly.
