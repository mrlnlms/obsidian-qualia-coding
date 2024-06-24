# menu-editors

Plugin para Analise de Dados Qualitativos (QDA) no Obsidian.

## v5 — DisplayMenus completo: menus DOM, coding modals, reapplyStyles

Arquitetura modular completa com 5 modulos: main.ts orquestra, DisplayMenus cria ribbons/commands/menus, Events registra todos os event handlers, CodingModals implementa modais de aplicacao/remocao de codigos, e Coding separa as acoes.

### Estrutura

```
main.ts                    <- plugin principal (MyPlugin) — MenuOption interface, menuOptions array
src/DisplayMenus.ts        <- createCodingsMenu, ribbons, commands, editor/file menus, coding menu DOM
src/Events.ts              <- createRegisterEvents: editor-menu, file-menu, contextmenu, mouseup, file-open, DOMContentLoaded
src/CodingModals.ts        <- ApplyCodeModal, RemoveCodeModal, cleanAllCodes, reapplyStyles, localStorage persistence
src/Coding.ts              <- addNewCode, addExistingCode, removeCode, removeAllCodes
src/SampleSettingTab.ts    <- aba de settings (vazia, comentada)
obsidian-ex.d.ts           <- type declarations extras
```

### Estado atual

- Plugin ID: `menu-editors`
- MenuOption interface com isToggle, isTextField, isEnabled
- Ribbon buttons gerados dinamicamente do array menuOptions
- Selecao de texto abre coding menu com opcoes
- Context menu (editor-menu, file-menu) com items QDA
- CodingModals: modal com input de texto + color picker para aplicar codigos
- reapplyStyles() persiste cores de codigos via localStorage entre sessoes
- Events centralizado: file-open reaplica estilos, DOMContentLoaded carrega CSS

### Funcionalidades

- **Coding menu** — popup ao selecionar texto com Add New/Existing Code, Remove Code/All
- **ApplyCodeModal** — modal com campo de texto e color picker para nomear e colorir codigos
- **RemoveCodeModal** — modal para remover spans de coded-text
- **Ribbon buttons** — icones para cada MenuOption no ribbon bar
- **Style persistence** — localStorage guarda estilos, reapplyStyles() restaura ao abrir arquivo
- **Event architecture** — Events.ts centraliza todos os registerEvent e registerDomEvent

### Notas

- DisplayMenus.ts com ~500+ LOC (menus DOM complexos)
- Events.ts usa `this` em closures do registerDomEvent (bug potencial herdado da era 1)
- toggleExample e toggleQueue indicam experimentos com toggles no menu
