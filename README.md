# menu-editors

Plugin para Analise de Dados Qualitativos (QDA) no Obsidian.

## v4 — Svelte branch (mosxqda) + menuitens: DisplayMenus completo

Transicao para o plugin "menuitens" como main path. A classe principal volta ao padrao minimalista focado em event handling para selecao de texto e menus contextuais. DisplayMenus extraido como modulo real.

### Estrutura

```
main.ts                    <- plugin principal (MyPlugin) — event handling completo
src/DisplayMenus.ts        <- menus editor/file + resetMenu
src/SampleSettingTab.ts    <- aba de settings (vazia, comentada)
```

### Estado atual

- Plugin renomeado para `menu-editors` (era "qualitative-coding-plugin")
- Selecao de texto abre popup menu com opcoes de coding
- Context menu (editor-menu, file-menu) com items QDA
- Logica de estado completa: selectionTriggeredMenu, contextMenuOpened, codingMenuOpened
- Sem ribbons ou commands nesta versao
- Svelte branch (mosxqda) existia em paralelo mas foi abandonada

### Funcionalidades

- **Selection menu** — popup com Add New/Existing Code, Remove Code/All ao selecionar texto
- **Context menu** — items QDA no editor-menu e file-menu
- **State management** — controle de multiplos cliques e interacoes entre menus
- **resetMenu()** — funcao extraida em DisplayMenus para limpar estado

### Notas

- Backups em `_historico/`: finalmente.ts (source), backup.ts, backup-mara.ts
- Iteracoes de mouseup logic mostram a evolucao do event handling
