---
codes:
  - name: "Interaction"
    color: "#e74c3c"
  - name: "Feedback"
    color: "#2ecc71"
  - name: "UX Pattern"
    color: "#3498db"
---

# v27.8 — Fix hover flickering + click handler

## What's new
- **Hover flickering fix**: Mutation observer is suppressed for 150ms after hover dispatch, preventing decoration rebuilds from destroying and recreating panel elements under the cursor.
- **Label click handler**: Clicking a code label in the margin panel now shows a Notice with the code name. This is the first interactive action on margin panel elements.

## How to verify

1. Open this note and create markers with codes on the text below
2. Hover over margin panel labels — should be smooth, no flickering
3. Click a code label in the margin panel — expect a Notice popup showing the code name
4. Check console for `[CodeMarker] label click:` log entries

## Test content

This paragraph discusses user interaction patterns in qualitative research tools. The hover behavior should feel responsive and stable.

Feedback from initial testing showed that the margin panel was flickering on hover because mutation observers were re-rendering the panel mid-hover. This fix addresses that.

UX patterns for code-based annotation tools typically require both hover previews and click actions on the same elements. This version adds the click handler foundation.
