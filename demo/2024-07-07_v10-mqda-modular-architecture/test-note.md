---
version: 10
date: 2024-07-07
title: "MQDA: MenuOption, CodingMenuManager, EventManager, FindAndReplace"
plugin-id: mqda
---

# v10 — MQDA: Arquitetura modular com EventManager + FindAndReplace

## O que mudou

- Plugin renomeado para **MQDA** (Marlon QDA) — novo ID `mqda`
- Arquitetura modular: MenuOption interface, CodingMenuManager, EventManager, StandardMenus, customMenus
- Novos modulos: FindAndReplace (CM5), Highlights (span-based), Utils, Comps
- EventManager centraliza todos os eventos (click, file-open, DOMContentLoaded)
- customMenus com createEditorCodingMenu completo (toggles, textfields, separators)
- Highlight class com apply/remove de coded-text spans + dynamic styles
- FindAndReplace usando CodeMirror 5 API diretamente
- 1467 LOC total

## Como verificar

1. Console: `[Marlon QDA] v10 loaded -- MQDA: MenuOption, CodingMenuManager, EventManager, FindAndReplace`
2. Selecionar texto -> menu flutuante com TextField, Toggles e Actions
3. Enter no TextField cria novo toggle item dinamicamente
4. Add New Code abre modal com color picker

## Demo

Selecione este texto para testar o menu flutuante. O menu deve aparecer com campo de texto no topo, seguido de toggles de codigos e botoes de acao.
