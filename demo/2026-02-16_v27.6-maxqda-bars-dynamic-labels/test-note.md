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
  - name: "Category C"
    color: "#2ecc71"
    ranges:
      - start: 200
        end: 280
---

# v27.6 — MAXQDA bars + dynamic labels + align + RLL fix

## What's new
- MAXQDA-style colored bars in the margin panel showing code distribution
- Dynamic labels that adjust based on available space
- Alignment improvements for margin elements
- Fix for panel overlap when Right-to-Left Layout (RLL) is off, with label left margin correction

## How to verify
1. Open this note in Obsidian
2. Check the margin panel — colored bars should appear next to coded segments
3. Labels should resize dynamically based on panel width
4. Toggle RLL off in settings — panel should not overlap content
5. Verify label alignment is consistent across different code densities

## Test content

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
