# menu-editors

Plugin para Analise de Dados Qualitativos (QDA) no Obsidian.

## v9 — Clique milestone: click post create item funcionando

addItemToEditorCodingMenu agora funciona corretamente usando a Menu API do Obsidian (submenu.addItem) em vez de manipulacao direta do DOM. Ao pressionar Enter no TextField, um novo toggle item e criado e o menu reabre automaticamente na mesma posicao.

### Estrutura

```
main.ts                    <- plugin principal (MyPlugin) — MenuOption com isToggle/isTextField/isEnabled
src/DisplayMenus.ts        <- createEditorCodingMenu limpo + addItemToEditorCodingMenu via Menu API
src/Events.ts              <- createRegisterEvents: editor-menu, file-menu, contextmenu, mouseup, file-open, DOMContentLoaded
src/CodingModals.ts        <- ApplyCodeModal, RemoveCodeModal, cleanAllCodes, reapplyStyles, localStorage persistence
src/Coding.ts              <- addNewCode, addExistingCode, removeCode, removeAllCodes
src/SampleSettingTab.ts    <- aba de settings (vazia, comentada)
```

### Estado atual

- Plugin ID: `menu-editors`
- addItemToEditorCodingMenu usa submenu.addItem() (Menu API) em vez de DOM direto
- Apos criar item, submenu.hide() + submenu.showAtPosition() reexibe o menu atualizado
- Toggle onChange seta selectionTriggeredMenu = true para manter menu aberto
- Removidos debug console.logs do Enter handler
- Removido override hack de submenu.hide() — codigo mais limpo
- DisplayMenus.ts sem versoes comentadas — apenas a versao funcional

### Funcionalidades

- **Menu flutuante** — popup ao selecionar texto com toggles, textfields e actions
- **ToggleComponent** — toggle items dentro do menu que nao fecham ao clicar
- **TextComponent** — campo de texto no menu, Enter cria novo toggle item
- **addItemToEditorCodingMenu** — adicao dinamica de items via Menu API com reexibicao
- **File/editor menus** — submenu Code Options com createFileMenu e createEditorMenu
- **Ribbon buttons** — icones para cada MenuOption no ribbon bar
- **Commands** — cada MenuOption vira um command no palette

### Notas

- Milestone: click post create item funcionando pela primeira vez
- Event listeners (window/element) com cleanup no onHide
