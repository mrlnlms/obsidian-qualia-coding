---
version: 11
date: 2024-07-14
plugin: editor-playground
description: "CM5 experiments + Popper.js + Settings suggesters"
---

# v11 — Editor Playground: CM5 experiments + Popper.js + Settings suggesters

## What's new

- Plugin renomeado para "Editor Playground" (ID: editor-playground)
- Estrutura completamente diferente: main.ts root + settings/ + utils/
- CM5 experiments: CodeMirror import direto, workspace events (layout-change, active-leaf-change, editor-change)
- Popper.js integration: settings suggesters usam createPopper para dropdown positioning
- Settings Tab com FolderSuggest e template folder location
- Utils: Error wrapper, Log notices, arraymove helper
- registerMarkdownPostProcessor para coded-text elements
- registerInterval para periodic logging

## How to verify

1. Console: `[Editor Playground] v11 loaded`
2. Settings tab aparece com "Template folder location" e folder suggester
3. Eventos de workspace disparam notices (layout-change, active-leaf-change)
4. Editor-change loga cursor position no console

## Demo content

Este e um teste para o Editor Playground. O plugin monitora eventos do workspace
e experimenta com CodeMirror 5 API diretamente.

Teste de texto para observar editor-change events no console.
