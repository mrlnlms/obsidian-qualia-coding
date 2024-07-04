---
version: 8
date: 2024-07-04
title: "Abertura working: menu open + ToggleComponent"
---

# v8 — Abertura working

## What's new
- Menu flutuante agora suporta ToggleComponent dentro de menu items
- TextField com Enter key handler para adicionar novos items dinamicamente ao menu
- stopPropagation para manter menu aberto ao interagir com toggles
- addItemToEditorCodingMenu: cria DOM elements diretamente para novos items
- backupDisplayMenus.ts como modulo completo (17K) com versoes comentadas mostrando evolucao

## How to verify
1. Console: `[menu-editors] v8 loaded`
2. Selecione texto -> menu flutuante aparece com Toggle Example e campo de texto
3. Toggle Example: clique alterna on/off SEM fechar o menu
4. Campo "New Item": digite texto + Enter -> novo toggle item aparece no menu

## Demo content
Selecione este texto para testar o menu flutuante com ToggleComponent.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
