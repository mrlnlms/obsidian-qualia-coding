---
version: 4
date: 2024-06-24
plugin: menu-editors
description: "Svelte branch (mosxqda) + menuitens: DisplayMenus completo"
---

# v4 — Svelte branch (mosxqda) + menuitens: DisplayMenus completo

## O que mudou

- Plugin renomeado de `qualitative-coding-plugin` para `menu-editors` (menuitens como main path)
- Removido ribbons/commands/settings da v3 — foco no fluxo de selecao de texto
- DisplayMenus.ts extraido como modulo real (nao mais stub)
- Event handling completo: mouseup, contextmenu, right-click com logica de estado
- Svelte branch (mosxqda) existia em paralelo mas foi abandonada depois

## Como verificar

1. Console: `[menu-editors] v4 loaded`
2. Selecione texto no editor — popup menu aparece com Add New Code, Add Existing Code, Remove Code, Remove All Codes
3. Right-click no editor — itens QDA no context menu
4. Right-click em arquivo no file explorer — itens QDA no file menu

## Backup files em _historico/

- `finalmente.ts` — versao final/limpa do main.ts (usada como source)
- `backup.ts` — versao intermediaria com ribbons, commands, settings, mouseup comentado
- `backup-mara.ts` — versao anterior com multiplas tentativas de mouseup logic
