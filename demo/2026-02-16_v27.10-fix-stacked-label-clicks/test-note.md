---
codes:
  - name: "Theme A"
    color: "#e74c3c"
    ranges:
      - start: 50
        end: 120
  - name: "Theme B"
    color: "#3498db"
    ranges:
      - start: 80
        end: 150
  - name: "Theme C"
    color: "#2ecc71"
    ranges:
      - start: 100
        end: 180
---

# v27.10 — Fix stacked label clicks

## What's new
- Fixed: clicking on stacked (overlapping) labels now correctly selects the intended code
- Previously, when multiple labels were stacked on the same line, clicks could target the wrong label or fail to register
- This fix ensures proper hit-testing for overlapping marker labels

## How to verify
1. Open this note in the demo vault
2. Check the console for `[CodeMarker v2] v27.10 loaded`
3. Notice the three overlapping code ranges above (Theme A, B, C all overlap between chars 80-120)
4. Click on each stacked label in the margin — each should select only its own code
5. Verify that clicking the bottom-most label in a stack still works correctly

## Test content for overlapping markers

This paragraph has multiple codes applied to overlapping regions. When labels stack vertically in the margin panel, each one should be independently clickable. The fix ensures that z-index and hit-testing logic correctly identifies which label the user intended to click, even when multiple labels occupy nearby vertical positions.
