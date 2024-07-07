# MQDA (Marlon QDA)

Plugin para Analise de Dados Qualitativos (QDA) no Obsidian.

## v10 — MQDA: MenuOption, CodingMenuManager, EventManager, FindAndReplace (1467 LOC)

Rewrite modular completo. Plugin renomeado de menu-editors para MQDA. Arquitetura baseada em managers: EventManager centraliza eventos, StandardMenus gera ribbon/commands/menus, customMenus cria o menu flutuante com toggles e textfields. Novos modulos: FindAndReplace (CM5 API), Highlights (spans com dynamic styles), Utils, Comps.

### Estrutura

```
main.ts                        <- plugin principal (MyPlugin) — MenuOption interface, menuInput/menuCodes/menuOptions
src/standardMenus.ts           <- StandardMenus: ribbon buttons, commands, editor-menu, file-menu
src/customMenus.ts             <- customMenus: menu flutuante com toggles, textfields, separators, addItem dinamico
src/Events.ts                  <- EventManager: click handler + coding events (file-open, DOMContentLoaded)
src/CodingModals.ts            <- ApplyCodeModal, RemoveCodeModal, cleanAllCodes, localStorage persistence
src/Codings.ts                 <- addNewCode, addExistingCode, removeCode, removeAllCodes
src/Highlights.ts              <- Highlight class: apply/remove coded-text spans + dynamic styles
src/FindAndReplace.ts          <- FindAndReplace: CM5 CodeMirror API (find/replace in selection)
src/Utils.ts                   <- Utils: activeFileEditor helper
src/Comps.ts                   <- toggleExample
src/backup/DisplayMenu.ts      <- CodingMenuManager (versao anterior do menu, usada como backup)
src/backup/backup.ts           <- arquivo vazio de backup
```

### Estado atual

- Plugin ID: `mqda`
- Plugin name: Marlon QDA
- Arquitetura modular com managers separados
- EventManager centraliza click + coding events
- customMenus com menu flutuante completo (TextField, Toggles, Actions, Separators)
- addItemToEditorCodingMenu via menuCodes.unshift + menu reopen
- Highlight class para apply/remove de coded-text spans com dynamic CSS
- FindAndReplace usando CodeMirror 5 API (getDoc, somethingSelected, etc.)
- removeHtmlTags com logica complexa de cursor positioning

### Funcionalidades

- **Menu flutuante** — popup ao clicar com toggles, textfields e actions
- **ToggleComponent** — toggle items dentro do menu que nao fecham ao clicar
- **TextComponent** — campo de texto no menu, Enter cria novo toggle item
- **addItemToEditorCodingMenu** — adicao dinamica de items com menu reopen
- **File/editor menus** — submenu Code Options com createFileMenu e createEditorMenu
- **Ribbon buttons** — icones para cada MenuOption no ribbon bar
- **Commands** — cada MenuOption vira um command no palette
- **Highlight** — apply/remove de spans com dynamic styles + color picker
- **FindAndReplace** — busca e substituicao via CM5 API
- **Code persistence** — localStorage para codeData e dynamicStyles

### Notas

- Milestone visual: MQDA — arquitetura modular com EventManager + FindAndReplace
- Primeiro uso de CodeMirror 5 API diretamente (import * as CodeMirror)
- Dead repo no GitHub (boilerplate only)
