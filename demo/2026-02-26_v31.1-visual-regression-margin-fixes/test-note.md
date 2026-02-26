---
codes:
  - name: "visual-test"
    color: "#e74c3c"
    markers:
      - from: 45
        to: 120
  - name: "margin-fix"
    color: "#3498db"
    markers:
      - from: 130
        to: 200
  - name: "regression-check"
    color: "#2ecc71"
    markers:
      - from: 80
        to: 160
---

# What's new in v31.1

Visual regression testing infrastructure and margin panel fixes.

This sub-commit combines three changes from the main codemarker-v2 plugin:
1. **Visual regression testing** - diagnostic margin bar analysis for catching visual regressions
2. **posToOffset clamping** - prevents bar height overflow in the margin panel when positions exceed document bounds
3. **Margin panel precision** - visual-line precision for margin bars, label truncation for long code names, and DOM-based hover instead of state-based

## How to verify

1. Open this note in the demo vault
2. Check that margin panel bars render correctly without overflow
3. Hover over margin bars - hover should feel responsive (DOM-based, not state-driven)
4. Long code names in margin labels should truncate with ellipsis
5. Look at the console for `[CodeMarker v2] v31.1 loaded`

## Test content

This paragraph exists to provide enough text for the coded markers above to display properly in the margin panel. The margin bars should align precisely with the visual lines of text, not with character offsets that might cause misalignment.

Here is more text to push the document length and verify that the posToOffset clamping works correctly. Previously, if a marker referenced a position beyond the visible document range, the bar height could overflow the panel. This fix ensures bars are clamped to valid ranges.

Additional content for testing overlapping markers. The "visual-test" and "regression-check" codes overlap in the 80-120 range, which should render as adjacent colored bars in the margin panel without visual artifacts.
