# menu-editors

Plugin para Analise de Dados Qualitativos (QDA) no Obsidian.

## v6 — DisplayMenus modulo isolado: createCodingsMenu, ribbons

Backup do DisplayMenus.ts em estado simplificado — modulo isolado com apenas as funcoes essenciais de menu, sem os experimentos DOM (toggles, text fields, menu stay-open logic).

### Estrutura

```
main.ts                    <- plugin principal (MyPlugin) — MenuOption interface simplificada
src/DisplayMenus.ts        <- createCodingsMenu, ribbons, commands, file/editor/coding menus
src/Events.ts              <- createRegisterEvents: editor-menu, file-menu, contextmenu, mouseup, file-open, DOMContentLoaded
src/CodingModals.ts        <- ApplyCodeModal, RemoveCodeModal, cleanAllCodes, reapplyStyles, localStorage persistence
src/Coding.ts              <- addNewCode, addExistingCode, removeCode, removeAllCodes
src/SampleSettingTab.ts    <- aba de settings (vazia, comentada)
obsidian-ex.d.ts           <- type declarations extras
```

### Estado atual

- Plugin ID: `menu-editors`
- MenuOption interface simplificada (title, icon, action — sem isToggle/isTextField/isEnabled)
- Ribbon buttons e commands gerados dinamicamente do array menuOptions
- Selecao de texto abre coding menu com opcoes basicas
- Context menu (editor-menu, file-menu) com submenu Code Options
- DisplayMenus.ts com blocos comentados mostrando versoes anteriores das funcoes
- CodingModals e Events continuam inalterados

### Funcionalidades

- **Coding menu** — popup ao selecionar texto com Add New/Existing Code, Remove Code/All
- **File/editor menus** — submenu Code Options com createFileMenu e createEditorMenu
- **Ribbon buttons** — icones para cada MenuOption no ribbon bar
- **Commands** — cada MenuOption vira um command no palette
- **resetMenu()** — limpa menu e flags de estado

### Notas

- DisplayMenus.ts contem versoes comentadas das funcoes (pre-refactor com hardcoded items)
- Imports de Coding module (addNewCode, addExistingCode, removeCode, removeAllCodes)
- Sem toggleExample, sem TextField, sem DOM menu complexity
