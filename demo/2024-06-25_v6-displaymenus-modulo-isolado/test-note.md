---
version: 6
date: 2024-06-25
title: DisplayMenus modulo isolado
---

# v6 — DisplayMenus modulo isolado: createCodingsMenu, ribbons

## What's new
- DisplayMenus.ts revertido para versao isolada (backup)
- Modulo extraido com createCodingsMenu, ribbon buttons, commands
- Menus contextuais simplificados (file-menu, editor-menu, selection menu)
- Removidos: toggleExample, TextField, DOM menu complexity
- MenuOption interface simplificada (sem isToggle, isEnabled, isTextField)

## How to verify
1. Console: `[menu-editors] v6 loaded`
2. Ribbon buttons: Add New Code, Add Existing Code, Remove Code, Remove All Codes
3. Right-click editor/file -> Code Options submenu
4. Select text -> context menu appears with coding options

## Demo content
Use `Sample 1.md` — select text and right-click to see the coding menu.
