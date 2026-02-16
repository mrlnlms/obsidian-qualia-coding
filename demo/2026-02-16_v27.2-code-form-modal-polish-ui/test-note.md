---
tags: [codemarker, test]
version: "27.2"
---

# v27.2 — Code Form Modal + Polish UI + Hover Fix

## What's new
- **Code Form Modal**: Obsidian-native modal for creating codes with name, color picker, and optional description. Replaces inline code creation for a cleaner workflow.
- **UI polish**: Improved styles for menus and markers — better spacing, hover states, visual consistency.
- **Hover fix**: Resolved hover state desync where highlights would persist after mouse left the marker area.

## How to verify
1. Open console — confirm `[CodeMarker v2] v27.2 loaded` message
2. Select text, use the selection menu to add a code — the new Code Form Modal should open with name, color, and description fields
3. Hover over an existing marker — the hover menu should appear and disappear cleanly without ghost states
4. Check that marker colors and UI elements look polished (no visual glitches)

## Test content

Here is some text that can be selected and coded. Try selecting this sentence and creating a code via the modal.

This paragraph tests hover behavior. After adding a code to the text above, hover over the highlighted region and verify the hover menu appears. Move the mouse away and confirm it disappears without leaving artifacts.

Multiple markers on different paragraphs help verify the polish changes work across the editor view.
