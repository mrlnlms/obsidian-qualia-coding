---
codes:
  - name: "sidebar-test"
    color: "#4CAF50"
    ranges:
      - [0, 50]
  - name: "click-verify"
    color: "#FF9800"
    ranges:
      - [60, 120]
---

# v31.5 — Label click reveals sidebar

## What's new
- Clicking a code label in the margin panel now always reveals the Code Detail sidebar
- Previously, label clicks could fail to open the sidebar if it was hidden or collapsed
- This ensures consistent navigation: click any label to see its full details

## How to verify
1. Open this note in the demo vault
2. Close the Code Detail sidebar if it's open (right panel)
3. Click on any code label in the margin panel (left gutter area)
4. The Code Detail sidebar should appear and show details for the clicked code
5. Try clicking different labels — each should reveal and update the sidebar

## Test content

This paragraph has the "sidebar-test" code applied. Click its label in the margin to verify that the Code Detail sidebar opens and shows the correct code details.

This second paragraph has the "click-verify" code. After clicking the first label, click this one. The sidebar should update to show this code's information instead.
