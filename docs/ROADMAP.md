# Qualia Coding — Roadmap

> Todas as features planejadas mas ainda não implementadas, organizadas por prioridade e escopo. Items concluídos estão documentados em `HISTORY.md`.

---

## Prioridade Alta — Funcionalidades Core

### ~~1. Code Hierarchy~~ — FEITO (2026-03-22)

Implementado nas Fases A, B, C do Codebook Evolution:

- **Fase C**: `codes: string[]` → `codes: CodeApplication[]` com `codeId` estavel. Rename atomico
- **Fase A**: `parentId`, `childrenOrder`, `mergedFrom` no CodeDefinition. Registry com getRootCodes, getChildren, getAncestors, getDescendants, setParent (com deteccao de ciclo). Codebook Panel com 3 niveis (lista → codigo → segmento), virtual scrolling, drag-drop (reorganizar/merge), context menu, MergeModal com busca fuzzy
- **Fase B**: Pastas virtuais — `folder?` no CodeDefinition, `FolderDefinition` no registry. Pastas sao containers organizacionais SEM significado analitico. Drag-drop em pastas, context menu (Rename, Delete), "New Folder" no toolbar

Spec completo: `docs/superpowers/specs/2026-03-22-codebook-evolution-design.md`

---

### 2. Parquet — Evolução futura

**Status**: Suporte básico já implementado (`hyparquet` + `parseTabularFile()` + `registerExtensions(['csv', 'parquet'])`). Ver `HISTORY.md` para detalhes da implementação.

**Problema atual**: Lê arquivo inteiro pra memória. Datasets grandes (ex: export Qualtrics 2M rows) crasham o Obsidian (~500MB-2GB de memória, main thread bloqueada).

**Arquitetura necessária (lazy loading)**:
1. **Metadata-only open**: hyparquet lê só metadata/schema (~1KB) ao abrir. Primeira visualização instantânea
2. **AG Grid Server-Side Row Model**: virtualiza rows — só renderiza viewport. Datasource adapter mapeia "AG Grid page request" → "hyparquet row group range"
3. **Row group mapping**: Row groups têm tamanho variável (ex: 20 groups de 100k). Adapter precisa calcular offset interno
4. **Column projection**: `hyparquet({ columns: ['col1', 'col2'] })` decodifica só colunas visíveis. Integrar com column toggle existente
5. **Web Worker**: Decodificação de row group (200-500ms pra 100k rows) deve sair da main thread
6. **Cache**: LRU de 2-3 row groups em memória (~50MB total vs 500MB+)

**Limitações conhecidas**:
- Sort/filter global requer ler todos os dados — com Server-Side Row Model, sort ficaria limitado aos dados carregados (hyparquet não tem query engine)
- Coding markers referenciam `row: N` — rows não carregadas precisam de resolução lazy no sidebar

**Estimativa**: 2-3 sessões (POC → datasource adapter → polish + column projection + cache)

**O que falta** (evolução do Parquet existente):
- Lazy loading com `rowStart`/`rowEnd` do hyparquet (row group pagination) para datasets 100k+
- AG Grid Server-Side Row Model for 100k+ rows
- Column-selective loading (only decode visible columns initially)
- Export TO Parquet (via hyparquet-writer or CSV conversion)

---

## Prioridade Média — Enhancements

### 3. Memo Universal (Saldaña Ch.14)

**Status**: Implementado. `memo?: string` está presente em BaseMarker (todos os engines). UI de memo no popover funciona para todos os tipos. O que falta é apenas a integração com Analytic Memo View (analytics) — feature futura separada.

- ~~Adicionar `memo?: string` a `SegmentMarker` e `RowMarker` (CSV)~~ — FEITO
- ~~Áudio e Vídeo já têm memo; Markdown e PDF não~~ — FEITO (todos têm memo agora)
- UI: textarea expandível no popover ou coluna de comentário — FEITO (popover)
- Integração com Analytic Memo View no Analytics — PENDENTE

### 4. Code → Theme Hierarchy (Saldaña Ch.14)

- `theme?: string` on `CodeDefinition` (shared registry)
- Grouping by theme in Code Explorer (extra tree level)
- Filter by theme in CSV coding columns
- Distinct from `parentId` hierarchy — this is a flat grouping tag

### ~~5. FuzzySuggestModal para "Add Existing Code"~~ — FEITO (2026-03-21)

`CodeBrowserModal` migrado de `Modal` + `SearchComponent` para `FuzzySuggestModal<CodeDefinition>` nativo. Fuzzy matching, keyboard navigation, swatch de cor. 22 LOC.

### ~~6. Quick Switcher de Códigos~~ — FEITO (2026-03-21)

Comando `quick-code`: seleciona texto → abre fuzzy modal → aplica código. Reutiliza `CodeBrowserModal` + `addCodeAction`. Hotkey configurável (sugestão: `Cmd+Shift+C`).

### 7. Toggle Visibility por Código

- No Code Explorer, toggle para mostrar/esconder highlights de um código específico no editor
- Resolve o problema de "color soup" com 20+ códigos

### ~~8. Analytics: Cross-source Comparison~~ — FEITO (2026-03-02)

Implementado como `sourceComparisonMode.ts`. Painel comparativo mostra métricas por source type (markdown, PDF, CSV, image, audio, video).

**O que ainda falta** (spin-off):
- Multi-tab spreadsheet export (one tab per source type, summary tab) — relacionado a #15 Export
- Code × Metadata específico (cruzar códigos com variáveis demográficas por source) — depende de #18 Case Variables

### 9. Analytics: Code × Metadata

- Se CSV tem colunas de metadata (gênero, idade, etc.), cruzar com códigos
- Tabelas de contingência por variável demográfica

### ~~10. Code Overlap Analysis~~ — FEITO

Implementado como `overlapMode.ts` em analytics. Heatmap de pares de códigos com span textual compartilhado (distinto de co-occurrence, que é sobre markers no mesmo arquivo).

### 11. Margin Panel Customization

- [ ] Setting left/right (lado da margem) — posição atualmente hardcoded à esquerda
- [ ] Visual customization: espessura da barra, estilo de ticks, opacidade — constantes hardcoded no extension

### 12. Research Board Enhancements

| Feature | Detalhe |
|---------|---------|
| Drag do Code Explorer | Arrastar códigos direto da tree (não só da lista de frequência) |
| Sync com registry | Atualizar cor/nome de code cards em real time |
| Context menu "Refresh" | Atualizar contagem de code cards sob demanda |
| Board templates | Layouts pré-definidos (e.g., 2x2 matrix, timeline) |
| Export board | Imagem/PDF do canvas completo |

---

## Prioridade Baixa — Platform Features

### 13. Projects + Workspace

**Status**: Data model completo proposto, não implementado.

**Reflexão (2026-03-19)**: O data model abaixo reinventa gerenciamento de projetos dentro de um plugin que vive dentro de um app de organização. O Obsidian já tem o core plugin **Workspaces** (salva/restaura layout de panes). A alternativa nativa seria: 1 vault = 1 projeto, ou scoping por pasta (plugin lê só arquivos dentro de uma pasta selecionada). Integrar com Workspaces em vez de criar infraestrutura paralela. Reavaliar o data model quando for atacar — o conceito é válido, a implementação proposta não.

**Conceito original**: Global workspace como "state zero" — usuário codifica livremente. Projetos são criados depois para organizar subsets de dados.

**Data model proposto**:
```typescript
interface Workspace {
  activeProject: string | null;
  codes: CodeDefinition[];        // global codebook
  segments: Segment[];            // global segments
  projects: QDAProject[];
  settings: { /* ... */ };
}

interface Code extends CodeDefinition {
  scope: 'global' | string;
  parentId?: string;
  memo?: string;
  weight?: number;
  createdAt: number;
}

interface Segment {
  id: string;
  fileId: string;
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  codeIds: string[];
  memo?: string;
  weight?: number;
  created: number;
}

interface QDAProject {
  name: string;
  created: string;
  documents: string[];
  codebook: { codes: Code[]; codeGroups: CodeGroup[] };
  segments: Segment[];
  memos: Memo[];
  documentVariables: { fileId: string; variables: Record<string, any> }[];
  savedQueries: SavedQuery[];
}
```

**File structure**:
```
.obsidian/plugins/qualia-coding/
  workspace.json
  codebook.json
  segments-global.json
  projects/
    <name>/
      project.json
      codebook.json    (overrides locais)
      segments.json
```

**Decisão**: Códigos compartilhados por referência (ID). Mudança de cor/nome propaga para todos os projetos. Códigos project-specific são scoped.

**Migration**: Migration de `data.json` necessária ao implementar.

**DOM framework**: Decision open — Obsidian não oferece reactive components nativamente.

### ~~14. Magnitude Coding (Saldaña Ch.14)~~ — FEITO (Fase D, 2026-03-22)

Implementado como parte do Codebook Evolution.

- `CodeDefinition.magnitude?: { type: 'nominal' | 'ordinal' | 'continuous'; values: string[] }` — config por código
- `CodeApplication.magnitude?: string` — valor por aplicação (já existia no schema, agora surfaced na UI)
- Picker fechado no popover: só valores declarados são permitidos; seção colapsável em todos os 6 engines
- Config no Detail View Level 2: toggle de ativação, seletor de tipo, editores por tipo (chips para nominal/ordinal com numeração, range generator para continuous)
- Picker de magnitude no Marker Detail (Level 3)
- Settings toggle `showMagnitudeInPopover` na seção General Settings
- Context menu "Set magnitude..." em todos os engines
- `GeneralSettings` interface + seção `QualiaData.general`

### ~~14b. Relations~~ — FEITO (Fase E, 2026-03-22)

Implementado como parte do Codebook Evolution.

- `CodeDefinition.relations?: Array<{ label, target, directed }>` — relações no nível do código
- `CodeApplication.relations?: Array<{ label, target, directed }>` — relações no nível do segmento
- Label livre com autocomplete de todos os labels já usados
- UI: seções colapsáveis no popover, Detail View Level 2 e Marker Detail Level 3
- Settings toggle `showRelationsInPopover`
- Relations Network: 20ª visualização no Analytics (modo grafo de relações entre códigos)
- Novos arquivos: `relationHelpers.ts`, `relationUI.ts`, `relationsEngine.ts`, `relationsNetworkMode.ts`
- Helpers `getRelations`, `addRelation`, `removeRelation` em `codeApplicationHelpers.ts`
- `renderRelationsSection` em `baseCodingMenu.ts`
- QDPX export inclui relations como `<Link>` elements

### ~~14c. Virtual Folders (Fase B)~~ — FEITO (2026-03-22)

Implementado como parte do Codebook Evolution.

- `folder?: string` no `CodeDefinition` — associa um código a uma pasta organizacional
- `FolderDefinition` no registry — containers organizacionais SEM significado analítico
- Context menu: Rename Folder, Delete Folder (promove códigos para root), New Folder
- Drag-drop: arrastar código para pasta; arrastar entre pastas
- Folder tree rendering no Codebook Panel (nível superior acima dos códigos)
- "New Folder" no toolbar do Codebook Panel

### ~~15. Export~~ — PARCIALMENTE FEITO (2026-03-22)

| Formato | Status |
|---------|--------|
| ~~REFI-QDA Export (QDPX + QDC)~~ | **FEITO** — `qdcExporter.ts` (codebook XML com hierarquia), `qdpxExporter.ts` (codigos + sources + segments + memos + links). Conversao de coordenadas por engine. Modal pre-export com formato e toggle sources |
| ~~REFI-QDA Import (QDC + QDPX)~~ | **FEITO** — `qdcImporter.ts` (codebook XML com hierarquia + NoteRef→description), `qdpxImporter.ts` (ZIP→vault: 5 source types, segments, memos standalone como .md, magnitude via `[Magnitude: X]` Notes, relations via `<Link>`). Modal com preview, conflitos merge/separate, botao analytics. `coordConverters.ts` inversas (offset→lineCh, pdfRect→normalized, pixels→normalized, ms→seconds) |
| ~~CSV por modo Analytics~~ | **FEITO** — Analytics exporta CSV de frequencies, co-occurrence, Doc-Code Matrix |
| JSON full export | PENDENTE |
| PNG/PDF (Dashboard composite) | PENDENTE |

### ~~16. Per-Code Decorations~~ — FEITO (2026-03-02, markdown + PDF)

Implementado nos dois engines de texto que renderizam highlights por range:

- **Markdown** (`src/markdown/cm6/markerStateField.ts:272-295`): quando um marker tem N códigos, emite N `Decoration.mark()` sobrepostas, cada uma com `settings.markerOpacity / N`. Single-code mantém opacidade cheia. `colorOverride` bypassa blending (cor única vence)
- **PDF** (`src/pdf/highlightRenderer.ts:149-180`): N retângulos sobrepostos no DOM overlay, cada um com `BASE_OPACITY / N`. Hover aumenta proporcionalmente
- **Mix-blend-mode**: `multiply` em ambos — cores se compõem visualmente em cor única de "mistura"

**Fórmula documentada** em `docs/pm/product/DESIGN-PRINCIPLES.md §3.2 (Opacity Blending)`.

**Engines sem blending** (decisão intencional, paradigma diferente):
- Image (fabric.js) — regiões são shapes, não ranges
- Audio/Video (wavesurfer) — regiões de waveform
- CSV (AG Grid cells) — chips de tag, não sobreposição

**Toggle Visibility por código** (item #7) é o próximo passo para resolver "color soup" com 20+ códigos em um documento.

### 17. Margin Panel Resize Handle

**POC feita e stashed** (não integrada).

**Conceito**: Drag na borda direita do margin panel para ajustar largura. Double-click reseta para auto.

**Lessons do POC**:
- Handle precisa viver no `scrollDOM` (não no panel) — `innerHTML = ''` no `renderBrackets()` destrói children
- Z-index mínimo 10 para ficar acima de bars/labels
- UX precisa de grip dots ou indicador visual mais forte

**Dependência: scrollDOM stacking context** (audit 2026-03-19):
O `handleOverlayRenderer.ts` já ocupa o `scrollDOM` com z-index 10000+ para drag handles de markers. O resize handle precisa coexistir no mesmo container. Análise completa com escala de z-index proposta e pré-requisitos está em `BACKLOG.md § z-index conflicts + análise de stacking no scrollDOM`. Os dois itens devem ser atacados na mesma sessão.

**Alternativas**:
- CSS native `resize: horizontal` no panel
- Setting numérico no settings tab em vez de drag interativo

### 18. Case Variables por Documento

- Metadados atribuídos a documentos inteiros (gênero do participante, data da entrevista, etc.)
- Cruzamento com códigos no Analytics (Code × Variable)

### 19. Analytical Memos

**Reflexão (2026-03-19)**: Construir sistema de memos dentro de um plugin que vive dentro de um app de notas é irônico. O Obsidian É o app de memos. Alternativa nativa: "Convert to Note" que cria arquivo markdown no vault com template de memo analítico (código referenciado, data, tipo de reflexão). O pesquisador escreve no Obsidian normalmente. Tangencia a ideia de pesquisa de "convert to note" como feature sintética. Reavaliar abordagem quando for atacar.

**Conceito original**:
- Memos em códigos, documentos e relações entre códigos
- Separados dos `memo` de markers — são reflexões analíticas
- ~~View dedicada no sidebar~~ → provavelmente desnecessário

---

## Gaps Identificados na Pesquisa de Mercado

> Ver `docs/research/MARKET-RESEARCH.md` para análise completa de concorrentes, preços, e benchmark de mixed methods.

### Gaps estratégicos (fundamentados em benchmark)

| Gap | Por que importa | Items do roadmap relacionados |
|-----|----------------|-------------------------------|
| **Case/Document Variables** | Sem metadata por documento, não dá pra cruzar codes × demographics — o workflow core de mixed methods "joint display". Todos os concorrentes (NVivo, ATLAS.ti, MAXQDA, Dedoose) têm isso. | #18 Case Variables, #9 Code × Metadata |
| ~~**REFI-QDA (QDPX) Export/Import**~~ | ~~FEITO — Export QDPX/QDC + Import com resolução de conflitos~~ | ~~#15 Export~~ |
| ~~**Export CSV/Excel**~~ | ~~FEITO — Analytics exporta CSV de frequencies, co-occurrence, Doc-Code Matrix~~ | ~~#15 Export~~ |
| **Intercoder Reliability** | Cohen's kappa / Krippendorff's alpha. Esperado por peer reviewers para claims de rigor. NVivo, ATLAS.ti, MAXQDA, Dedoose, QualCoder oferecem. | Novo item (não listado) |

### Diferenciais confirmados pela pesquisa

| Diferencial | Status | Concorrência |
|------------|--------|-------------|
| **20 analytics modes** (incl. MCA, MDS, LSA, Polar, CHAID, Relations Network) | Implementado | Zero concorrentes oferecem built-in |
| **REFI-QDA interoperability** (export + import QDC/QDPX) | Implementado | NVivo, ATLAS.ti, MAXQDA cobram licença; QualCoder tem suporte parcial |
| **Parquet support** | Implementado | Único no mercado CAQDAS |
| **Dentro do Obsidian** (vault = dados, zero lock-in) | Implementado | Só o Quadro (muito mais limitado) |
| **7 formatos + unified analytics** grátis | Implementado | Concorrentes cobram $130-1,005/ano |
| **Research Board** (canvas freeform) | Implementado | Zero concorrentes têm equivalent |
| **Margin bars MAXQDA-style** em open source | Implementado | MAXQDA cobra EUR 600+/3 anos |

---

## Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| 500+ markers/arquivo | Lookup O(n) inviável | Interval tree para busca por range |
| 1000+ decorations/viewport | Scroll degradation | Viewport culling, lazy decoration rebuild |
| `data.json` migration | Perda de dados do usuário | Never lose user data — backward-compatible schemas, migration scripts com rollback |
| Mobile | Sidebar differs on Obsidian mobile | Feature-detect mobile, graceful degradation |
| Onboarding | Empty Code Explorer confunde novos usuários | Empty state com guided action ("Create your first code") |
| Plugin conflicts | Highlighter, Comments, PDF++ | Namespace isolation, document conflitos conhecidos |
| `vault.adapter` vs `loadData` | Concurrency/caching race conditions | Single source of truth via DataManager |
| Leaf view DOM without framework | UI verbose, hard to maintain | Obsidian não oferece reactive components nativamente — avaliar lit-html ou similar |
| "Escopo cresce pra ATLAS.ti" | Months of work, feature creep | Incremental phases — cada item standalone, shippable |

---

## Fontes

Este roadmap consolida (arquivos originais já arquivados):
- `memory/hierarchy-plan.md` — plano de Code Hierarchy
- `docs/csv/TODO.md` — Parquet + features Saldaña
- `docs/analytics/ROADMAP.md` — Analytics enhancements
- `memory/board-roadmap.md` — Research Board open ideas
- `docs/markdown/ARCHITECTURE.md` — Phases 3-5 (per-code decorations, projects, power features)
- `docs/markdown/POC-RESIZE-HANDLE.md` — Resize handle POC
- `docs/markdown/COMPONENTS.md` — FuzzySuggestModal opportunity
- `docs/research/MARKET-RESEARCH.md` — pesquisa de mercado e benchmark mixed methods (março 2026)
