# Obsidian UI Components Reference

Componentes nativos disponiveis na API do Obsidian para uso no plugin. Preferir estes a criacoes custom em CSS/HTML.

---

## Inputs & Controles

| Componente | Renderiza | Metodos-chave |
|---|---|---|
| **TextComponent** | `<input type="text">` | `setValue()`, `setPlaceholder()`, `onChange()` |
| **TextAreaComponent** | `<textarea>` | Mesmo que TextComponent, multi-linha |
| **SearchComponent** | Input com botao clear (X) | `setPlaceholder()`, `onChanged()` |
| **ToggleComponent** | Toggle switch on/off | `getValue()`, `setValue(bool)`, `onChange()` |
| **ButtonComponent** | `<button>` | `setButtonText()`, `setIcon()`, `setCta()`, `setWarning()`, `onClick()` |
| **ExtraButtonComponent** | Botao pequeno so com icone | `setIcon()`, `setTooltip()`, `onClick()` |
| **SliderComponent** | Range slider | `setLimits(min, max, step)`, `setValue(n)` |
| **DropdownComponent** | `<select>` dropdown | `addOption(value, display)`, `addOptions()` |
| **ColorComponent** | Color picker | `getValue()` retorna hex, `setValue()` |
| **ProgressBarComponent** | Barra de progresso 0-100 | `setValue(0-100)` |
| **MomentFormatComponent** | Input com preview de formato data | `setDefaultFormat()`, `setSampleEl()` |

Todos herdam de `BaseComponent` (tem `setDisabled()`) ou `ValueComponent<T>` (tem `getValue()`/`setValue()`).

Construtor padrao: `new XxxComponent(containerEl: HTMLElement)`.

---

## Layout

| Componente | Renderiza | Uso |
|---|---|---|
| **Setting** | Linha: nome + descricao + controles | Fluent API: `.setName()`, `.setDesc()`, `.addToggle()`, `.addButton()`, `.addText()`, `.addDropdown()`, `.addColorPicker()`, `.addSlider()`, `.addProgressBar()`, `.addSearch()`, `.addTextArea()`, `.addExtraButton()` |
| **Setting.setHeading()** | Transforma Setting em header de secao | Separar grupos de settings |

```typescript
new Setting(containerEl)
  .setName('Opacity')
  .setDesc('Marker background opacity')
  .addSlider(slider => slider
    .setLimits(0, 1, 0.1)
    .setValue(0.3)
    .onChange(value => { /* ... */ })
  );
```

---

## Menus

| Componente | Renderiza | Uso |
|---|---|---|
| **Menu** | Context menu (nativo ou DOM) | `.addItem()`, `.addSeparator()`, `.showAtPosition()`, `.showAtMouseEvent()` |
| **MenuItem** | Item dentro do Menu | `.setTitle()`, `.setIcon()`, `.setChecked()`, `.setDisabled()`, `.setWarning()`, `.onClick()`, `.setSection()` |

```typescript
const menu = new Menu();
menu.addItem(item => item
  .setTitle('Remove Code')
  .setIcon('trash')
  .onClick(() => removeCode())
);
menu.addSeparator();
menu.showAtMouseEvent(evt);
```

---

## Modais & Dialogs

| Componente | Renderiza | Uso |
|---|---|---|
| **Modal** | Dialog overlay com titulo + conteudo | `open()`, `close()`, `setTitle()`, usa `contentEl` pra montar UI |
| **SuggestModal\<T\>** | Modal com input de busca + lista filtrada | Implementar `getSuggestions()`, `renderSuggestion()`, `onChooseSuggestion()` |
| **FuzzySuggestModal\<T\>** | Modal com busca fuzzy built-in | So implementar `getItems()` e `getItemText()` — fuzzy matching gratis |

```typescript
// FuzzySuggestModal — ideal para "Add Existing Code"
class CodeSuggestModal extends FuzzySuggestModal<CodeDefinition> {
  getItems(): CodeDefinition[] {
    return this.model.getAllCodes();
  }
  getItemText(item: CodeDefinition): string {
    return item.name;
  }
  onChooseItem(item: CodeDefinition, evt: MouseEvent | KeyboardEvent) {
    addCodeAction(this.model, this.snapshot, item.name);
  }
}
```

---

## Notificacoes & Popovers

| Componente | Renderiza | Uso |
|---|---|---|
| **Notice** | Toast notification (some sozinho) | `new Notice('msg', duration?)` — duration=0 fica permanente |
| **HoverPopover** | Popover no hover de um elemento | `new HoverPopover(parent, targetEl, waitTime?)` |
| **PopoverSuggest\<T\>** | Popover inline com sugestoes (nao modal) | Para autocomplete inline, extender e implementar `renderSuggestion()` + `selectSuggestion()` |

---

## Views (paineis no workspace)

| Componente | Renderiza | Uso |
|---|---|---|
| **ItemView** | Painel customizado (sidebar, tab, etc) | Extender, implementar `getViewType()`, `getDisplayText()`, usar `contentEl` |
| **TextFileView** | Editor de texto com auto-save | Para formatos customizados de arquivo |
| **MarkdownView** | Editor markdown completo | Referencia — nao extender, mas acessar via `workspace.getActiveViewOfType()` |

```typescript
// ItemView — base para Code Explorer / Leaf View
class CodeExplorerView extends ItemView {
  getViewType() { return 'codemarker-explorer'; }
  getDisplayText() { return 'Code Explorer'; }

  async onOpen() {
    const { contentEl } = this;
    this.addAction('refresh-cw', 'Refresh', () => this.render());
    // Montar UI com componentes nativos dentro de contentEl
  }
}

// Registrar no main.ts:
this.registerView(VIEW_TYPE, (leaf) => new CodeExplorerView(leaf, this.model));

// Abrir:
const leaf = this.app.workspace.getRightLeaf(false);
await leaf.setViewState({ type: VIEW_TYPE, active: true });
this.app.workspace.revealLeaf(leaf);
```

---

## Tree Items & Search Results (padrao CSS nativo)

Nao sao componentes exportados da API, mas **classes CSS** usadas pelo Search, Backlinks, Outline, File Explorer. Ao usar essas classes no seu DOM, voce herda o visual nativo (spacing, font, hover, collapse animation) do tema ativo.

### Estrutura basica

```
.search-results-container
  .tree-item.is-collapsed              ← container colapsavel
    .tree-item-self.is-clickable       ← linha clicavel (header)
      .tree-item-icon.collapse-icon    ← seta ▶/▼
      .tree-item-inner                 ← conteudo (titulo)
      .tree-item-flair                 ← badge (contagem)
    .tree-item-children                ← area colapsavel (filhos)
      .search-result-file-match        ← cada resultado/trecho
```

### Funcoes utilitarias de busca

| Funcao | O que faz |
|---|---|
| `prepareFuzzySearch(query)` | Retorna callback de fuzzy search → `SearchResult` |
| `prepareSimpleSearch(query)` | Busca exata por palavras |
| `renderMatches(el, text, matches)` | Renderiza texto com matches destacados (bold) |
| `renderResults(el, text, result)` | Idem, recebe `SearchResult` direto |
| `sortSearchResults(results)` | Ordena por score |

### Exemplo completo (implementado em `codeExplorerView.ts`)

```typescript
const resultsEl = container.createDiv({ cls: 'search-results-container' });

for (const [codeName, markers] of codeIndex) {
  const treeItem = resultsEl.createDiv({ cls: 'tree-item' });

  // Header clicavel
  const self = treeItem.createDiv({ cls: 'tree-item-self is-clickable' });
  const icon = self.createDiv({ cls: 'tree-item-icon collapse-icon' });
  setIcon(icon, 'right-triangle');
  self.createDiv({ cls: 'tree-item-inner', text: codeName });
  self.createDiv({ cls: 'tree-item-flair', text: String(markers.length) });

  // Children (comeca colapsado)
  const children = treeItem.createDiv({ cls: 'tree-item-children' });
  children.style.display = 'none';

  for (const marker of markers) {
    const matchEl = children.createDiv({ cls: 'search-result-file-match' });
    matchEl.createSpan({ cls: 'search-result-file-title', text: fileName });
    matchEl.createDiv({ text: previewText });
    matchEl.addEventListener('click', () => navigateToMarker(marker));
  }

  // Toggle collapse
  self.addEventListener('click', () => {
    const collapsed = children.style.display === 'none';
    children.style.display = collapsed ? '' : 'none';
    treeItem.toggleClass('is-collapsed', !collapsed);
  });

  treeItem.addClass('is-collapsed');
}
```

### Render de markdown inline

```typescript
// Renderiza markdown dentro de um elemento (preview de trechos)
await MarkdownRenderer.render(app, '**bold** text', el, sourcePath, component);
```

---

## Helpers de DOM

| Funcao | O que faz |
|---|---|
| `createEl('tag', { cls, text, attr, title, href })` | Cria qualquer elemento HTML |
| `createDiv({ cls, text })` | Shorthand `<div>` |
| `createSpan({ cls, text })` | Shorthand `<span>` |
| `createFragment(cb)` | DocumentFragment pra batch DOM |
| `setIcon(el, 'icon-name')` | Injeta icone SVG (Lucide icons) |
| `el.createEl(...)` | Mesmo que createEl mas ja appenda no parent |
| `el.createDiv(...)` | Mesmo que createDiv mas ja appenda |
| `el.empty()` | Remove todos os filhos |
| `el.addClass('cls')` / `el.removeClass('cls')` | Manipulacao de classes |

**DomElementInfo** (opcoes pra createEl):
```typescript
{
  cls?: string | string[]      // classes CSS
  text?: string                // textContent
  attr?: Record<string, any>   // atributos HTML
  title?: string               // tooltip hover
  placeholder?: string         // input placeholder
  href?: string                // link
  type?: string                // input type
  value?: string               // input value
  prepend?: boolean            // inserir no inicio ao inves do final
  parent?: Node                // parent element
}
```

---

## Uso no CodeMarker v2

### Ja usa
- TextComponent, ToggleComponent, ColorComponent (tooltip + modal)
- Setting (settingsTab, codeFormModal)
- Modal (codeFormModal)
- Menu (obsidianMenu.ts)
- Notice, setIcon, createEl/createDiv

### Oportunidades

| Componente | Onde usar | Impacto |
|---|---|---|
| **FuzzySuggestModal** | "Add Existing Code" (stub atual) | Resolve o stub com ~30 LOC |
| **ItemView** | Code Explorer / Leaf View (Fase 2) | Base pra sidebar de analise |
| **SearchComponent** | Filtro no Code Explorer | Input com clear button nativo |
| **ButtonComponent** | Substituir `<button>` manual no codeFormModal | `.setCta()` pra estilo nativo |
| **DropdownComponent** | Seletor de projeto (Fase 4) | Dropdown nativo |
| **ExtraButtonComponent** | Header actions na Leaf View | Botoes pequenos com icone |
| **Setting.setHeading()** | Agrupar secoes no settingsTab | Headers nativos |
| **HoverPopover** | Alternativa ao hover tooltip custom | Popover nativo do Obsidian |

---

## Referencia

Tipo definitions: `node_modules/obsidian/obsidian.d.ts`
Icones disponiveis: Lucide icons (https://lucide.dev/icons/)
