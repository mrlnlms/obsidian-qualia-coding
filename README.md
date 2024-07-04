# menu-editors

Plugin para Analise de Dados Qualitativos (QDA) no Obsidian.

## v8 — Abertura working: menu open + ToggleComponent, backupDisplayMenus (17K)

DisplayMenus.ts completo (17K) com ToggleComponent e TextComponent dentro do menu flutuante. Menu permanece aberto ao interagir com toggles (stopPropagation). TextField com Enter key handler adiciona novos items dinamicamente ao menu.

### Estrutura

```
main.ts                    <- plugin principal (MyPlugin) — MenuOption com isToggle/isTextField/isEnabled
src/DisplayMenus.ts        <- backupDisplayMenus completo (17K): toggles, textfields, DOM menu items
src/Events.ts              <- createRegisterEvents: editor-menu, file-menu, contextmenu, mouseup, file-open, DOMContentLoaded
src/CodingModals.ts        <- ApplyCodeModal, RemoveCodeModal, cleanAllCodes, reapplyStyles, localStorage persistence
src/Coding.ts              <- addNewCode, addExistingCode, removeCode, removeAllCodes
src/SampleSettingTab.ts    <- aba de settings (vazia, comentada)
```

### Estado atual

- Plugin ID: `menu-editors`
- MenuOption interface expandida (title, icon, action, isToggle?, isTextField?, isEnabled?)
- ToggleComponent dentro de menu items — toggle on/off sem fechar o menu
- TextComponent com Enter handler — adiciona novos toggle items dinamicamente
- addItemToEditorCodingMenu: cria DOM elements (div.menu-item) diretamente no menu
- Ribbon buttons e commands gerados dinamicamente do array menuOptions
- Context menu (editor-menu, file-menu) com submenu Code Options
- DisplayMenus.ts com 3 versoes comentadas de createEditorCodingMenu mostrando evolucao

### Funcionalidades

- **Menu flutuante** — popup ao selecionar texto com toggles, textfields e actions
- **ToggleComponent** — toggle items dentro do menu que nao fecham ao clicar
- **TextComponent** — campo de texto no menu, Enter cria novo toggle item
- **addItemToEditorCodingMenu** — adicao dinamica de items via DOM manipulation
- **File/editor menus** — submenu Code Options com createFileMenu e createEditorMenu
- **Ribbon buttons** — icones para cada MenuOption no ribbon bar
- **Commands** — cada MenuOption vira um command no palette
- **toggleExample()** — funcao exportada para toggle state management

### Notas

- backupDisplayMenus.ts e o modulo mais completo ate agora (17K)
- 3 versoes comentadas de createEditorCodingMenu documentam a evolucao do menu
- Override de submenu.hide() para impedir fechamento durante Enter no TextField
- Event listeners (window/element) com cleanup no onHide
