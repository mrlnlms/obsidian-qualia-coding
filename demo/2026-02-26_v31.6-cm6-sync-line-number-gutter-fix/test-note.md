---
codes:
  - name: "sync-test"
    color: "#4CAF50"
markers:
  - code: "sync-test"
    from: 78
    to: 130
---

# v31.6 — CM6 sync + line number gutter fix

## What's new
- CM6 state synchronization improvements
- Margin panel now correctly respects line number gutters when pushing content
- Fixes layout shift when line numbers are enabled/disabled

## How to verify
1. Open this note and confirm markers render correctly
2. Toggle line numbers on/off in Settings > Editor > Show line number
3. Verify the margin panel does not overlap line number gutters
4. Check that marker decorations stay in sync after toggling

## Test content

This paragraph has a marker applied to test CM6 synchronization. The marker should
render consistently whether line numbers are visible or not. The margin panel should
push content without overlapping the gutter area.

More text here to ensure the layout works with longer documents and multiple paragraphs
of content flowing naturally below the marked region.
