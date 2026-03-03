# Qualia Coding — Pré-História

> A jornada desde o primeiro plugin Obsidian até o nascimento do CodeMarker. Este documento preserva a história anterior ao que está em `HISTORY.md` (que começa em fev/2026 com o `obsidian-codemarker-v2`).

---

## Origem: Do Notion ao Obsidian (2023)

Tudo começou com a migração de dados estruturados do Notion para o Obsidian. O problema central:

> Como manter tabelas com metadados padronizados (propriedades de registros, tipos, relações) no formato Obsidian, sem perder a visualização e UX que o Notion oferece?

### O Gap identificado

- YAML é bom para padronização mas feio de visualizar/editar
- MetaBind resolve edição mas transforma a nota num formulário
- Templates via `dataview.load.io()` funcionam mas poluem o conteúdo com 3 linhas de código em toda nota
- **Gap**: Exibir YAML formatado via templates "virtuais" que não existem no arquivo — são apenas renderização visual dos dados

### Primeiro Plugin: RenderYAML (2023-2024)

**Local**: `local-workbench/dev/obsidian/plugins/Lab/2023_MOSxFirstPlugin/`

Plugin que renderiza YAML do frontmatter como display formatado no editor. Introdução ao ecossistema de desenvolvimento:
- Setup Node.js, TypeScript, esbuild
- Obsidian API, `Plugin` class, `manifest.json`
- Dataview e Templater como base de scripts
- VS Code como editor, terminal Mac

**Aprendizado principal**: A diferença entre live-preview (editável com MetaBind) e preview-mode (leitura limpa). Templates separados por modo resolvem o problema.

---

## Pivô: Análise Qualitativa (Junho 2024)

### A Motivação

> "Pesquisas qualitativas são em grande maioria compostas por conteúdo textual. O ambiente principal do Obsidian é o editor. Faz sentido que análise qualitativa aconteça aqui."

Ferramentas existentes (NVivo, MAXQDA, ATLAS.ti) são proprietárias e caras. A visão:

> **Criar uma ferramenta open-source para codificação qualitativa de texto com UX excelente, integrada ao ecossistema Obsidian.**

### Conceitos de QDA que guiaram o design

- **Códigos**: unidades de significado aplicadas a trechos de texto (entrevistas, transcrições, documentos)
- **Multi-código**: um trecho pode receber múltiplos códigos
- **Cross-document**: mesmos códigos aplicados entre documentos de diferentes participantes
- **Trechos highlightados**: cor e interatividade (hover, click, edição de tags)
- **Metodologias suportadas**: Análise Temática, Grounded Theory, Content Analysis, Discourse Analysis

### Referências de mercado

| Tool | Modelo | Ponto forte |
|------|--------|-------------|
| NVivo | Proprietário | Analytics avançadas |
| MAXQDA | Proprietário | Margin bars, visual coding |
| ATLAS.ti | Proprietário | Network analysis |
| Dedoose | SaaS | Colaboração |
| Taguette | Open-source | Simplicidade |

---

## Iterações de Protótipo (Junho-Julho 2024)

Múltiplos plugins foram criados como experimentos, cada um explorando uma abordagem técnica diferente. Datas exatas preservadas:

### Timeline de protótipos

| Plugin | Período | Abordagem técnica | Evolução |
|--------|---------|-------------------|----------|
| `moxs-qda` | 23/06/2024 (1 dia) | Fork do sample plugin, estrutura base de menus e comandos. Placeholder actions sem implementação real. | Definiu a estrutura modular (commands, menu handlers, settings em arquivos separados) |
| `qualitative-coding-plugin` | 18-22/06/2024 | Tooltip com nome/cor do código e "x" para remoção rápida. `<span class="coded-text">` + `data-code` attribute. localStorage para persistência. | Primeiro protótipo funcional com UX de codificação |
| `mosxqda` | 17/06 - 25/06/2024 | Svelte component para modal. Hover-based remove button dinâmico. Highlight sempre amarelo (customizável). | Experimentou Svelte dentro do Obsidian |
| `menuitens` | 23/06 - 06/07/2024 | Menu system avançado com código aplicado via `<span>` HTML inline. CSS dinâmico gerado em runtime. localStorage com `dynamicStyles: { [code]: color }`. | Resolveu o problema de persistência de estilos |
| `mqda` | 07-17/07/2024 | "Marlon QDA" — a iteração mais completa. 6 classes (MyPlugin, CodingMenuManager, customMenus, ApplyCodeModal, RemoveCodeModal, EventManager). Fluxo de 5 passos. Reapply automático de estilos ao abrir arquivo. | **A base conceitual do CodeMarker**: menu → modal → span → persistência → reapply |
| `editorqda` | 14-19/07/2024 | "Editor Playground" — lab de testes. Monitoramento de eventos globais (layout-change, active-leaf-change, editor-change). Acesso direto ao CodeMirror. Custom markdown post-processor para `<coded-text>`. | Explorou os limites do editor e APIs disponíveis |
| `managecodes` | 16/07/2024 (1 dia) | Gestão de códigos em CSV. Modal para adicionar, sidebar para listar, persistência em arquivo `.csv`. | Separou a gestão de códigos da codificação em si |

### O que cada protótipo realmente implementou (do código-fonte)

**`moxs-qda`** (23/06, 1 dia) — O esqueleto. 4 comandos registrados (Add New Code, Add Existing, Remove, Remove All), mas todo handler é só `new Notice('...')`. A contribuição real: `mouseup` listener que detecta seleção e mostra `Menu.showAtPosition()` — o primeiro menu flutuante no selection. `obsidian-ex.d.ts` estende types do Obsidian pra acessar `setSubmenu()`.

**`qualitative-coding-plugin`** (18-22/06) — Primeiro que efetivamente codifica texto. `ApplyCodeModal` com text input + color picker. Seleção wrappada em `<span class="coded-text {code}" data-code="{code}">`. Estilos dinâmicos via `<style>` no `<head>`. `CodeTooltip`: div flutuante no `document.body` com `getBoundingClientRect()` para posicionamento. Remoção via regex: `/<span\b[^>]*?\bclass="[^"]*\bcoded-text\b[^"]*"[^>]*?>(.*?)<\/span>/gis`. Persistência em `localStorage` (chave `dynamicStyles` + `codeData`).

**`mosxqda`** (17-25/06) — Experimento com Svelte. `CodingModal.svelte` montado dentro de `Modal.contentEl` via `new CodingModal({ target: contentEl })`. Destaque: **botão global flutuante de remoção** — um único `<button>` com `position: absolute; z-index: 9999` reposicionado no `mouseover` de qualquer `.coded-text`. Sentinel class `hover-listeners-added` para evitar listeners duplicados. `component.$destroy()` no close.

**`editorqda`** (14-19/07) — Spike de pesquisa, não plugin funcional. Acesso direto a `editor.cm` via `@ts-ignore` para testar `coordsChar` (CM5 API). `registerMarkdownPostProcessor` para interceptar `<coded-text>` no rendered content. Settings copiados do Templater: `TextInputSuggest` abstract class com keyboard nav + `@popperjs/core`. `FolderSuggester` e `FileSuggester` reutilizáveis.

**`mqda`** (07-17/07) — **O breakthrough arquitetural.** 12 arquivos fonte. Menu data-driven: arrays `MenuOption[]` com `isToggle`, `isTextField`, `isEnabled` geram toda a UI automaticamente. `StandardMenus` auto-cria ribbon, commands, editor-menu, file-menu a partir dos arrays. `customMenus` constrói menu flutuante no `click` com `ToggleComponent` e `TextComponent` embutidos via `(item as any).dom` — padrão que persiste até hoje. Usuário digita nome no text field, Enter cria toggle novo no menu e aplica o código. `EventManager` centraliza registro de eventos. `Highlight` wrappa texto. **O problema central**: `removeHtmlTags()` em `customMenus.ts` tem ~470 linhas tentando gerenciar cursor após inserção/remoção de `<span>`. Conversores `indexToPos`/`posToIndex` manuais. Código repleto de debugging comentado — claramente o ponto de dor que motivou a migração para CM6 decorations.

**`managecodes`** (16/07, 1 dia) — Completamente diferente. **Primeiro `ItemView` na sidebar.** `registerView('csv-view')` + `getRightLeaf(false)?.setViewState()`. Lê/escreve `items.csv` via Node.js `fs/promises` (não Obsidian API). `InputModal` com `TextComponent`. Sem codificação de texto — só gestão de lista de códigos. Conceito de sidebar para códigos nasce aqui.

**`settingsPlugin`** (19/07-05/08) — Não é QDA. É o plugin "Mirror Notes": renderiza conteúdo de uma nota dentro de outra via `MarkdownRenderer.render()`. Mas a contribuição para o Qualia é a **UI de settings mais sofisticada** de todos: `CustomMirror[]` array com sub-filters, cards colapsáveis, drag-to-reorder, `FileSuggest`/`FolderSuggest`/`YamlPropertySuggest`, banner dismissível, generic TypeScript binding `addToggleHeader<K extends keyof Settings>()`. 3 iterações do mesmo settings UI (`SettingModel1.ts` → `SettingModel2.ts` → `finalmente.ts` → `Settings.ts`).

### Evolução técnica resumida

| Plugin | Marking | Persistence | UI Innovation | LOC (aprox.) |
|--------|---------|-------------|---------------|-------------|
| `moxs-qda` | Nenhum | Nenhuma | Menu flutuante no selection | ~200 |
| `qualitative-coding-plugin` | `<span>` HTML inline | localStorage | Modal + color picker + hover tooltip | ~400 |
| `mosxqda` | `<span>` inline style | Nenhuma | Svelte modal + botão flutuante global | ~300 |
| `editorqda` | Nenhum (research) | Obsidian saveData | Suggesters do Templater, CM5 spike | ~600 |
| `mqda` | `<span>` HTML inline | localStorage | **Data-driven menus + toggles embutidos** | ~1.500 |
| `managecodes` | Nenhum | CSV via fs/promises | **Primeiro ItemView sidebar** | ~150 |
| `settingsPlugin` | N/A (outro plugin) | Obsidian saveData | **Settings UI avançada**, suggesters | ~1.200 |

### O problema que motivou tudo

O maior ponto de dor visível no código dos protótipos 2, 3 e 5 é o **cursor management após inserção/remoção de HTML spans**. As ~470 linhas de debugging em `mqda/customMenus.ts` mostram a luta: inserir `<span>` tags no markdown muda os offsets de todo o texto, e gerenciar a posição do cursor depois é um pesadelo.

**Esta foi a motivação central** para abandonar inline HTML spans e migrar para CM6 decorations no CodeMarker v1 — decorations são visuais, não modificam o documento, e o cursor management é handled pelo CM6.

### Linhagem para o Qualia Coding

```
moxs-qda        → Menu flutuante no selection (conceito)
qualitative-c.  → Primeira codificação funcional (span + tooltip + modal)
mosxqda          → Hover interaction (botão global flutuante)
editorqda        → CodeMirror knowledge + suggesters
mqda             → Arquitetura (managers, data-driven menus, toggles in menu)
managecodes      → Sidebar view (ItemView concept)
settingsPlugin   → Settings UI patterns (cards, suggesters, generics)
                        ↓
              CodeMarker v1 (CM6 decorations, data.json, multi-code markers)
                        ↓
              CodeMarker v2 (overlay handles, Approach C, sidebar)
                        ↓
              7 plugins separados (PDF, CSV, Image, Audio, Video, Analytics)
                        ↓
              Qualia Coding (consolidação)
```

### Coding Interface (Lab)

**Local**: `local-workbench/dev/obsidian/plugins/Lab/Coding Interfaces/`

Protótipo focado em entender:
- Como selecionar texto e abrir menu contextual
- Como criar highlights sem alterar o arquivo
- CodeMirror 6: decorations, state fields, event handling
- Posicionamento de mouse → posição no texto

---

## CodeMarker v1 — O Primeiro Plugin Real (Maio-Setembro 2024)

**Local**: `local-workbench/dev/obsidian/plugins/Main/.obsidian/plugins/obsidian-codemarker/`
**Repo**: `https://github.com/mrlnlms/obsidian-codeMarker/`
**Autor**: m4rlon (Marlon Lemes)

### Decisões fundamentais (que persistem até hoje)

1. **"Marcações não alteram o documento"** — Dados em `data.json`, não no markdown. Decorações CM6 para visualização. Esta decisão NUNCA mudou.

2. **`Map<fileId, Marker[]>`** — Estrutura de armazenamento por arquivo. Ainda é a base do DataManager.

3. **Marker com múltiplos códigos** — `codes: string[]` no marker. Um trecho = N códigos. Design core do sistema.

4. **Separação modelo/visualização** — `CodeMarkerModel` (lógica + persistência) vs `StateField` + `ViewPlugin` (decorações + interação). Padrão mantido em todos os 7 engines.

5. **Abordagem via CM6 Extensions** — StateField para state, ViewPlugin para DOM, Effects para comunicação. Base de toda a arquitetura atual.

### Implementação técnica

**Handles via `Decoration.widget` (WidgetType)**:
- SVG handles com dimensões proporcionais ao font size
- `calculatePaddingRatio()` para padding dinâmico
- `HandleWidget extends WidgetType` com `toDOM()` e `ignoreEvent()`
- Zero-width containers para não deslocar texto (teoria — na prática causava reflow)

**Detecção de mudança de fonte**:
- Zoom: `WheelEvent` com `ctrlKey` → `requestAnimationFrame` → `checkFontChange()`
- Settings: `MutationObserver` no DOM
- Layout: `ResizeObserver` no editor

**Menu de codificação**:
- Campo de texto para criação rápida de tags
- Toggle list com ON/OFF por tag
- Limitado a 5 items visíveis
- Botões: Add New Tag (modal com cor/descrição), Add Existing Tags, Remove Tags, Remove All

### Bugs conhecidos do v1

1. **Multi-viewport direction bug**: Ao marcar viewports da esquerda pra direita, click+seleção não funcionava no viewport da direita. Da direita pra esquerda funcionava. (Resolvido no v2 com overlay handles)

2. **Texto empurrado pra baixo**: `Decoration.widget` inline causava reflow em vários cenários. (Resolvido no v2 com overlay no `scrollDOM`)

3. **Seleção desmarcada ao acionar comando**: Obsidian desmarca texto selecionado ao abrir menu. Fix: `stopPropagation()` nos eventos.

4. **Usabilidade dos drag handles**: Deletar marcação clicando no handle era fácil demais acidentalmente. UX precisava de polish.

### Visão documentada (2024)

O README do v1 já planejava tudo que veio a existir:

- Códigos hierárquicos (parentId) ← **ainda pendente no ROADMAP**
- MDS (Multidimensional Scaling) ← **implementado no Analytics**
- Tabelas de contingência ← **implementado (chi-square)**
- Co-occurrence analysis ← **implementado**
- Network graph ← **implementado (force-directed)**
- Export para R, SPSS, Gephi, ATLAS.ti ← **parcialmente (CSV/PNG, QDPX pendente)**
- IA assistida para sugestão de códigos ← **não implementado**
- Colaboração multi-usuário ← **não implementado**

### Marker interface do v1 (proposta original)

```typescript
interface Marker {
  id: string;
  fileId: string;
  range: { from: Position; to: Position };
  codes: string[];
  hierarchy: string;           // "main.sub.specific" — nunca implementado
  properties: Record<string, any>;  // metadados custom — evoluiu para memo
  relationships: string[];     // IDs relacionados — nunca implementado
  confidence: number;          // nível de certeza — nunca implementado
  created: timestamp;
  updated: timestamp;
}
```

Comparando com o `BaseMarker` atual:
```typescript
interface BaseMarker {
  id: string;
  fileId: string;
  codes: string[];
  colorOverride?: string;      // adicionado no v2
  memo?: string;               // simplificação de properties
  createdAt: number;
  updatedAt: number;
}
```

`hierarchy`, `properties`, `relationships`, `confidence` foram descartados em favor de simplicidade. `memo` cobriu o caso de uso de `properties`. Hierarquia será via `parentId` no `CodeDefinition`, não no marker.

---

## Aprendizados Técnicos da Era v1

### CM6 — Primeiras lições (que persistem)

1. **Estado imutável**: CM6 requer recriação completa de decorações a cada mudança. Não dá pra "editar" uma decoration in-place.
2. **Transações atômicas**: Todas as mudanças de state passam por transactions. Efeitos devem ser batched.
3. **`posAtCoords()`**: Converte pixel → offset de texto. Mas **snapa pro char mais próximo** — hover em espaço vazio retorna posição válida.
4. **`posToOffset()` / `offsetToPos()`**: Conversões bidirecionais. `posToOffset` NÃO clampeia (aprendido com dor no v2).
5. **Z-index layering**: Decorations marcadas com z-index -1 ficam atrás do texto. Handles precisam de z-index positivo.
6. **`stopPropagation()`** nos event handlers de elementos interativos dentro do editor — resolve o problema de seleção desmarcada.

### Obsidian Plugin Basics

1. `Plugin` class com `onload()` / `onunload()` lifecycle
2. `manifest.json` com id, name, version, minAppVersion
3. esbuild para bundling (não webpack, não rollup)
4. `data.json` via `loadData()` / `saveData()` — API simples mas funcional
5. Commands via `addCommand()` — integram com command palette
6. Settings via `SettingTab` — UI nativa com `Setting` components

---

## O Ressurgimento (Maio-Julho 2025)

Após meses parado, o projeto ressurgiu por um caminho inesperado.

### A Engenharia Reversa (14-15 Maio 2025)

Tudo começou com uma engenharia reversa de um plano de pesquisa e codificação sintética (projeto Sicredi). Isso reacendeu o interesse em codificação qualitativa e levou a repensar o CodeMirror — que havia sido um bloqueio no v1.

> "15 de maio, às 18h, pedi um prompt para ajudar a desenvolver minha ideia de plugin. Voltei pro Claude à meia-noite do dia 16... fiquei direto fazendo isso. Aqui foi quando levei o role pro Cursor e implementei. Foi fantástico!"

### CodeMarker v1 no Cursor (15-25 Maio 2025)

**`obsidian-codemarker` — 15/05/2025 a 25/05/2025**

Com o Cursor como ferramenta de desenvolvimento (AI-assisted), o CodeMarker v1 tomou forma rapidamente. É aqui que o CM6 foi finalmente domado — decorations, state fields, handles SVG, persistência via `data.json`.

### O Arco Intelectual (Maio-Julho 2025)

A partir do CodeMarker, uma cadeia de descobertas:

```
Engenharia reversa (Sicredi)
  → Repensar CodeMirror
    → Pesquisa de métodos que usam codificação
      → Quantitização e Qualitização como transformação de dados
        → Métodos Mistos: integração no nível da análise (não do fundamento)
          → Transcript Analyzer (protótipo de views analíticas)
            → "Bare-metal" architecture (espaço aberto de transformações)
              → Qualia framework
```

### Timeline detalhada

| Período | Projeto | O que foi |
|---------|---------|-----------|
| 14-15/05/2025 | Engenharia reversa Sicredi | Reacendeu interesse em codificação |
| 15-25/05/2025 | `obsidian-codemarker` | CodeMarker v1 com CM6 (Cursor + Claude) |
| 27/05 - 06/06/2025 | Mixed Methods - Data Transformation | Pesquisa sobre quantitização/qualitização |
| 07-10/06/2025 | `transcript-analyser-prototype` | Protótipo de views analíticas sobre texto |
| 07-09/06/2025 | `transcript-analyser` | Versão mais estruturada |
| 11-12/06/2025 | `qualia` | Primeiro framework conceitual |
| 24/06/2025 | `mirror-notes` | Plugin auxiliar |
| 08/07/2025 | Reflexão e documentação | Arqueologia do processo, journaling |

### O Insight do Transcript Analyzer

O Transcript Analyzer foi o protótipo que mostrou o caminho para o Analytics engine:

> "Testei essas views e análises em cima do texto em si, e achei espetacular. A unidade de análise sai do participante ou texto completo para os códigos, que NÃO são independentes."

Isso virou os 17 ViewModes do Analytics: frequency, co-occurrence, network graphs, MDS, MCA — tudo testado primeiro no Transcript Analyzer.

### O Conceito "Bare-Metal"

> "Outro conceito muito foda que parece ter uma relação forte com a ideia de um espaço aberto de transformações... a sacada real de uma arquitetura disposta a esperar o que o método recebe por padrão e entrega o que quer."

Esse pensamento influenciou a arquitetura do Qualia: engines independentes que recebem dados em qualquer formato e produzem análises — sem impor uma metodologia específica.

---

## Da v1 para a v2 (Transição, ~Fevereiro 2026)

O CodeMarker v1 provou o conceito mas tinha limitações fundamentais:

1. **Handles via `Decoration.widget`** causavam reflow — precisavam migrar para overlay
2. **Menu era básico** — precisava de toggle list com cores, hover menu, selection preview
3. **Sem sidebar** — sem Code Explorer, sem Code Detail, sem forma de navegar entre markers
4. **Sem registry** — códigos não tinham identidade persistente (cor, descrição)
5. **Single-file** — sem cross-file analysis, sem analytics

Essas limitações motivaram a reescrita como `obsidian-codemarker-v2`, que é onde `HISTORY.md` começa (fev/2026). A v2 resolveu handles (overlay), menu (Approach C), sidebar (Explorer + Detail), registry (12-color palette), e eventualmente evoluiu para os 7 engines e o Qualia Coding.

---

## Fontes

Este documento consolida:
- `local-workbench/dev/obsidian/plugins/Main/00_META/Assuntos tratados.md` — narrativa de desenvolvimento original (2024-07-09)
- `local-workbench/dev/obsidian/plugins/Main/.obsidian/plugins/obsidian-codemarker/README.md` — documentação técnica do v1
- `local-workbench/dev/obsidian/plugins/Lab/` — protótipos experimentais
- Manifests de 7 plugins protótipo (editorqda, mosxqda, moxs-qda, mqda, qualitative-coding-plugin, managecodes, obsidian-codemarker)
- `iCloud/Workbench/WW_Obsidian Codemaker/Projeto CodeMarker - Aprendizados.md` — lições iniciais
- `iCloud/MOSx/Últimos desenvolvimentos projetos pessoais.md` — timeline de todos os projetos com datas exatas
- `iCloud/MOSx/Areas/00_META/databases/Daily Notes/2025-07-08.md` — reflexão sobre o arco intelectual
- `Google Drive/Consolidade QDA/README-*.md` (8 arquivos) — docs consolidados de cada protótipo
