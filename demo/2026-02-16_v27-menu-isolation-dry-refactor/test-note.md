---
codes:
  - name: "isolation-test"
    color: "#e74c3c"
  - name: "dry-refactor"
    color: "#3498db"
---

# v27.1 — Menu isolation + fix double-toggle + DRY refactor

## What's new
- Menu operations now isolated to target marker (no cross-marker interference)
- Fixed double-toggle bug where clicking a code would toggle twice
- DRY refactor: `findOrCreateMarkerAtSelection` extracted as shared utility
- Empty marker cleanup deferred to menu close (prevents premature removal)

## How to verify
1. Open this note and select some text — the code menu should appear
2. Apply a code, then click the same code again — it should toggle OFF once (not twice)
3. Select text that overlaps an existing marker — menu should operate on the correct marker
4. Close the menu without applying codes — empty markers should be cleaned up

## Test content

This paragraph is for testing marker isolation. Select part of it and apply a code.

This second paragraph tests that menu operations don't leak to markers in other paragraphs.

Try selecting across both paragraphs to test boundary behavior.
