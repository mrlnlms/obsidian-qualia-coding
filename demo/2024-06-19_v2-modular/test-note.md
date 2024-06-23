---
version: 2
date: 2024-06-19
description: "Modular: modals/, tooltip/, types/"
---

# v2 — Modular: modals/, tooltip/, types/

## O que mudou

- **Estrutura modular** — main.ts refatorado, logica extraida para modulos separados
- **modals/ApplyCodeModal.ts** — modal de aplicar codigo, agora com `storeStyle()` para persistir cores no localStorage
- **modals/RemoveCodeModal.ts** — modal de remover codigo
- **tooltip/CodeTooltip.ts** — tooltip exportado como modulo separado
- **types/obsidian-ex.d.ts** — type augmentations para Menu e MenuItem
- **Clean All Codes** — novo comando + ribbon icon (trash) para limpar todos os codigos do documento
- **editor-menu** — context menu agora usa `editor-menu` ao inves de `file-menu`
- **reapplyStyles()** — estilos dinamicos recarregados no file-open
- **Cores via localStorage** — `data-color` removido do span, cor persistida via `dynamicStyles` no localStorage

## Como verificar

1. Console: `[qualitative-coding-plugin] v2 loaded`
2. Abra `editor-playground-coded-sample.md` — texto ja tem spans codificados
3. Hover sobre texto codificado — tooltip aparece com cor e nome
4. Teste o comando "Clean All Codes" — remove todos os spans
5. Context menu (botao direito) — itens de Qualitative Coding aparecem
