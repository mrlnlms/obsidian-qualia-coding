---
version: 5
date: 2024-06-24
title: DisplayMenus completo
plugin-id: menu-editors
---

# v5 — DisplayMenus completo: menus DOM, coding modals, reapplyStyles

## What's new
- Full DisplayMenus module with DOM menus (editor-menu, file-menu, coding menu on text selection)
- CodingModals: ApplyCodeModal (color picker + code name), RemoveCodeModal, cleanAllCodes
- Events module: registerEvent for editor-menu, file-menu, contextmenu, mouseup, file-open, DOMContentLoaded
- Coding module: addNewCode, addExistingCode, removeCode, removeAllCodes (separated actions)
- reapplyStyles on file-open and DOMContentLoaded — persists coded text colors via localStorage
- MenuOption interface with isToggle, isTextField support
- Ribbon buttons created from menuOptions array

## How to verify
1. Open DevTools console — look for `[menu-editors] v5 loaded`
2. Select text in this note, a coding menu should appear near the mouse
3. Right-click in editor — custom items in editor-menu and file-menu
4. Use "Add New Code" — modal with text input + color picker should open
5. Check ribbon bar — icons for each menu option

## Demo content
This is a test paragraph for coding. Select any word below to test the coding menu:

**Qualitative coding** is a method of categorizing text segments with descriptive labels.

Select this sentence to test the Add New Code modal with color picker.
