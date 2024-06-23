# Qualitative Coding Plugin

Plugin para Analise de Dados Qualitativos (QDA) no Obsidian.

## v3 — Refactor: imports modulares, moxs-qda (broken stubs)

Refatoracao arquitetural completa. Classe principal renomeada para `MyPlugin`, logica de menus extraida para `src/obsidian_ui_menus/obsidian_menus`, settings para `src/SampleSettingTab`.

### Estrutura

```
main.ts                                      <- plugin principal (MyPlugin)
src/obsidian_ui_menus/obsidian_menus.ts      <- menus editor/file (stubs)
src/SampleSettingTab.ts                      <- aba de settings (stub)
```

### Estado atual

Esta versao representa o refactor "moxs-qda" — uma tentativa de reorganizacao que ficou quebrada. Os modulos importados pelo main.ts nao foram preservados no backup original, entao stubs foram criados para permitir o build.

### Funcionalidades

- **Selection menu** — popup com opcoes ao selecionar texto (mouseup event)
- **Context menu** — itens no editor-menu e file-menu via funcoes modulares
- **Ribbon icons** — plus (add new), check (add existing), trash (remove), x (remove all)
- **Commands** — Add New/Existing Code, Remove Code, Remove All Codes
- **Settings tab** — SampleSettingTab (stub basico)
- **resetMenu()** — logica de reset extraida para modulo separado

### Notas

- Modulos originais (`modals/`, `tooltip/`, `types/`) da v2 foram substituidos
- Stubs em `src/` permitem build mas nao tem a implementacao original
- Menus mostram items mas as acoes sao no-op nos stubs
