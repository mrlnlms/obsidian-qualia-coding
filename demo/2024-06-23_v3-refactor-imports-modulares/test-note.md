---
version: 3
date: 2024-06-23
title: "Refactor: imports modulares, moxs-qda (broken stubs)"
---

# v3 — Refactor: imports modulares

## What's new
- Complete architectural shift from v2: new class `MyPlugin` replaces `QualitativeCodingPlugin`
- Modular imports from `./src/obsidian_ui_menus/obsidian_menus` (createEditorMenu, createFileMenu, resetMenu)
- Settings tab extracted to `./src/SampleSettingTab`
- Selection-based context menu with mouseup/contextmenu event handling
- Ribbon icons: Add New Code, Add Existing Code, Remove Code, Remove All Codes
- Old v2 modules (modals/, tooltip/, types/) removed — completely different architecture

## How to verify
1. Open Obsidian developer console — look for `[qualitative-coding-plugin] v3 loaded`
2. Right-click in editor — should see QDA menu items (from stubs)
3. Select text and release mouse — should see selection menu popup
4. Check Settings tab — "Qualitative Coding Settings" should appear

## Notes
- This version represents the "moxs-qda" refactor attempt
- Original imported modules were not preserved — stubs were created to allow build
- The build notes confirm this was a broken/experimental state

## Demo content

Select this text and release the mouse button to trigger the selection menu.

Some **coded content** to test with the context menu items.
