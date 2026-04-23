# Qualia Coding — Roadmap

> Features planejadas por prioridade. Items concluídos ficam no registro ao final.
> Última atualização: 2026-04-23.

---

## 📍 Próximos a atacar (frente)

Ordem de execução — livrar a frente antes de abrir novas features:

| Ordem | Item | Esforço | Complexidade |
|-------|------|---------|--------------|
| 1 | **[Toggle Visibility por Código](#1-toggle-visibility-por-código)** | 150-250 LOC | Média |
| 2 | **[Import/Export — sessão agrupada](#2-importexport--sessão-agrupada)** | 1 dia dedicado | Média |
| 3 | **[Parquet lazy loading](#3-parquet-lazy-loading)** | 2-3 sessões | Alta |

---

## 🔜 Roadmap pós-frente-limpa (sequência narrativa)

Ordem motivada pelo uso: organizar codebook → analisar → polir.

| Ordem | Item | Motivação |
|-------|------|-----------|
| 4 | **[Coding management](#4-coding-management)** (Code→Theme + Pastas nested) | Usar decentemente com corpus grande |
| 5 | **[Analytics — melhorias](#5-analytics--melhorias)** (Relations Network polish + Code×Metadata + Analytic Memo View) | Consequência natural de #4 |
| 6 | **[Margin Panel — melhorias](#6-margin-panel--melhorias)** (Customization + Resize Handle) | Polish visual. **Dependência externa**: aguarda decisão em outro plugin não-mexido |

---

## ❓ Decisão de produto aberta

Sem ordem de execução — precisam validar **se** e **como** existem antes de virar sessão.

- **[Intercoder Reliability (kappa/alpha)](#intercoder-reliability)** — gap estratégico, complexidade alta pro contexto atual
- **[Projects + Workspace](#projects--workspace)** — reinventa gerência de projetos dentro de app de organização
- **[Research Board Enhancements](#research-board-enhancements)** — escopo amplo, decidir subset
- **[Analytical Memos](#analytical-memos)** — Obsidian já É o app de memos

---

## Detalhes — frente

### 1. Toggle Visibility por Código

- No Code Explorer, toggle para mostrar/esconder highlights de um código específico no editor
- Resolve o problema de "color soup" com 20+ códigos
- Decisões em aberto (brainstorming antes de implementar):
  - Persistente vs sessão?
  - Global vs por arquivo?
  - Filtra Analytics ou só render?
  - Campo `hidden?: boolean` em `CodeDefinition` ou tracking separado?
- Ajusta os 6 engines (filtrar markers hidden antes de renderizar)

### 2. Import/Export — sessão agrupada

Sessão única pra matar dívidas de export e itens do ROADMAP no mesmo contexto. Round-trip QDPX entre vaults Obsidian **já funciona** (commit `1422bb7` + resolução dos 4 bugs críticos em §11.1 do BACKLOG).

**Itens agrupados:**

| Origem | Item | Detalhe |
|--------|------|---------|
| ROADMAP #15 | JSON full export | PENDENTE |
| ROADMAP #15 | PNG/PDF Dashboard composite | PENDENTE |
| ~~BACKLOG §11 E1~~ | ~~QDPX offsets de texto PDF aproximados~~ | ✅ **FEITO 2026-04-23** — `resolveMarkerOffsets` usa plainText consolidado via pdfjs + indexOf (com fallback whitespace-normalize). Offsets absolutos em codepoints |
| ~~BACKLOG §11 E2~~ | ~~Shape markers PDF ignorados no export~~ | ✅ **FEITO 2026-04-23** — `loadPdfExportData` extrai dims via pdfjs headless no momento do export |
| ~~BACKLOG §11 I1~~ | ~~PDF shape selections no import usam 612x792 (US Letter)~~ | ✅ **FEITO 2026-04-23** — `createMarkersForSource` carrega `loadPdfExportData` 1x quando a source tem PDFSelection; `createPdfMarker` aplica `pdfDims[sel.page]` com fallback 612x792 + warning se load falha |
| ~~BACKLOG §11 I2~~ | ~~PDF text selections (PlainTextSelection) ignoradas no import~~ | ✅ **FEITO 2026-04-23** — `extractAnchorFromPlainText` cria marker com `{text, page}` + indices placeholder. `resolvePendingIndices` popula indices via DOM text-search no primeiro render |
| BACKLOG §17 | Multi-tab spreadsheet export (spin-off #8 Source Comparison) | Export Analytics com sheet por source type (markdown, pdf, csv, image, audio, video) + sheet summary. Usa `xlsx` ou múltiplos CSVs zipados. ~1-2h |

**Dependência compartilhada**: ~~cache de dimensões de página PDF~~ resolvido — `loadPdfExportData` usa pdfjs headless direto do vault, sem cache persistido.

### 3. Parquet lazy loading

**Status**: Suporte básico já implementado (`hyparquet` + `parseTabularFile()` + `registerExtensions(['csv', 'parquet'])`).

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

**Evolução adicional**:
- Export TO Parquet (via hyparquet-writer ou CSV conversion)

---

## Detalhes — pós-frente-limpa

### 4. Coding management

Usabilidade do codebook com corpus grande. Dois sub-itens:

#### 4a. Code → Theme Hierarchy

- `theme?: string` em `CodeDefinition` (shared registry)
- Grouping by theme no Code Explorer (nível extra na tree)
- Filter by theme nas colunas de CSV coding
- **Distinto de `parentId` hierarchy** — é uma flat grouping tag

#### 4b. Pastas nested (folder dentro de folder)

Descoberto 2026-04-23 durante §12 K2 do BACKLOG.

- Hoje `FolderDefinition` não tem `parentId`; folder rows não são `draggable`
- Mudanças necessárias:
  - Schema do registry (adicionar `parentId?` em `FolderDefinition`)
  - Drag-drop callbacks (folder como dragSource + dropTarget)
  - `buildFlatTree` (recursão em níveis aninhados)
  - Validação de ciclo (mesma lógica do `setParent` pra códigos)
- Sem backward-compat (zero users)
- Estimativa: 2-3h

### 5. Analytics — melhorias

Itens menores que se somam a uma camada de polish analítico. Ordem sugerida do mais barato ao mais caro:

| Item | Esforço | Detalhe |
|------|---------|---------|
| **Relations Network — hover-focus** | ~45 min | Ao passar cursor sobre um nó, destacar edges que entram/saem dele e escurecer o resto. No loop de draw do `relationsNetworkMode.ts`: dividir opacity por 3 pras edges que não tocam `hoveredNodeIdx` |
| **Relations Network — filtro "N+ aplicações"** | ~30 min | Slider ou input no painel de config: só renderiza edges com `weight >= N`. Threshold no `extractRelationEdges` ou no loop de draw |
| **Analytic Memo View** (ex-#3) | Médio | `memo?: string` já existe em todos os engines — só falta consumir no Analytics. Visualização dedicada agregando memos de markers por código/source |
| **Code × Metadata** (ex-#9) | 2-3h | Tabelas de contingência código × variável demográfica. Depende de Case Variables (FEITO). Reusa `inferentialEngine` base |
| **Relations Network — edge bundling FDEB/HEB** | 3-4h MVP | Só atacar quando grafo realista tiver 50+ edges densos — curvas de Bézier atuais cobrem até isso. FDEB adiciona 150-300 LOC ou lib externa (`d3-force-bundling`). Não prioritário |

### 6. Margin Panel — melhorias

**⚠️ Dependência externa**: aguarda decisão em outro plugin (não-mexido). Só atacar depois de definir tratamento lá.

Dois sub-itens com dívida técnica compartilhada (`scrollDOM stacking context` — `handleOverlayRenderer.ts` já ocupa scrollDOM com z-index 10000+ pra drag handles de markers; os dois itens precisam coexistir no mesmo container):

#### 6a. Margin Panel Customization (ex-#11)

- Setting `margin.side: 'left' | 'right'` (posição hoje hardcoded à esquerda)
- Visual: espessura da barra, estilo de ticks, opacidade — constantes hardcoded hoje em `marginPanelExtension.ts`
- Estimativa: 1-2h

#### 6b. Margin Panel Resize Handle (ex-#17)

**POC feita e stashed** (não integrada).

- Conceito: Drag na borda direita do margin panel para ajustar largura. Double-click reseta para auto
- **Lessons do POC**:
  - Handle precisa viver no `scrollDOM` (não no panel) — `innerHTML = ''` no `renderBrackets()` destrói children
  - Z-index mínimo 10 para ficar acima de bars/labels
  - UX precisa de grip dots ou indicador visual mais forte
- **Alternativas a considerar**:
  - CSS native `resize: horizontal` no panel
  - Setting numérico no settings tab em vez de drag interativo

---

## Detalhes — decisão de produto aberta

### Intercoder Reliability

Cohen's kappa / Krippendorff's alpha. Esperado por peer reviewers para claims de rigor acadêmico. NVivo, ATLAS.ti, MAXQDA, Dedoose e QualCoder oferecem.

**Status**: existem ideias via git-like workflow, mas a complexidade de implementação no contexto atual do plugin (single-user Obsidian) é alta. Requer modelagem de "coders" como primeira classe, reconciliação de discordâncias, agregação estatística. **Decidir antes se faz sentido atacar.**

### Projects + Workspace

**Reflexão (2026-03-19)**: O data model proposto reinventa gerenciamento de projetos dentro de um plugin que vive dentro de um app de organização. O Obsidian já tem o core plugin **Workspaces** (salva/restaura layout de panes). A alternativa nativa seria:
- 1 vault = 1 projeto, ou
- Scoping por pasta (plugin lê só arquivos dentro de uma pasta selecionada)
- Integrar com Workspaces em vez de criar infraestrutura paralela

**Conceito original**: Global workspace como "state zero" — usuário codifica livremente. Projetos criados depois para organizar subsets.

**Data model proposto** (preservado para referência — revisar antes de implementar):
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

**File structure proposta**:
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

**Decisão original**: Códigos compartilhados por referência (ID). Mudança de cor/nome propaga para todos os projetos. Códigos project-specific são scoped.

**Migration**: Migration de `data.json` necessária ao implementar.

**DOM framework**: decision open — Obsidian não oferece reactive components nativamente.

### Research Board Enhancements

Escopo amplo — decidir subset antes de atacar:

| Feature | Detalhe |
|---------|---------|
| Drag do Code Explorer | Arrastar códigos direto da tree (não só da lista de frequência) |
| Sync com registry | Atualizar cor/nome de code cards em real time |
| Context menu "Refresh" | Atualizar contagem de code cards sob demanda |
| Board templates | Layouts pré-definidos (e.g., 2x2 matrix, timeline) |
| Export board | Imagem/PDF do canvas completo |

### Analytical Memos

**Reflexão (2026-03-19)**: Construir sistema de memos dentro de um plugin que vive dentro de um app de notas é irônico. **O Obsidian É o app de memos**. Alternativa nativa: "Convert to Note" que cria arquivo markdown no vault com template de memo analítico (código referenciado, data, tipo de reflexão). O pesquisador escreve no Obsidian normalmente.

Tangencia a ideia de pesquisa de "convert to note" como feature sintética. **Reavaliar abordagem antes de implementar.**

**Conceito original**:
- Memos em códigos, documentos e relações entre códigos
- Separados dos `memo` de markers — são reflexões analíticas
- ~~View dedicada no sidebar~~ → provavelmente desnecessário

---

## Gaps identificados na pesquisa de mercado

### Gaps estratégicos (fundamentados em benchmark)

| Gap | Por que importa | Status |
|-----|----------------|--------|
| ~~**Case/Document Variables**~~ | ~~FEITO — Registry central, popover em todos file types, painel lateral, filter analytics, QDPX round-trip, rename/delete hooks~~ | ✅ 2026-04-21 |
| ~~**REFI-QDA (QDPX) Export/Import**~~ | ~~FEITO — Export QDPX/QDC + Import com resolução de conflitos~~ | ✅ 2026-03-22 |
| ~~**Export CSV/Excel**~~ | ~~FEITO — Analytics exporta CSV de frequencies, co-occurrence, Doc-Code Matrix~~ | ✅ 2026-03-22 |
| **Intercoder Reliability** | Cohen's kappa / Krippendorff's alpha. Esperado por peer reviewers. | [❓ Decisão de produto aberta](#intercoder-reliability) |

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

## Items permanentes (ineliminaveis)

| Item | Razão |
|------|-------|
| 3 `as any` PDF viewer | API interna Obsidian não exporta tipos |
| 3 `as any` dataManager deepMerge | Type gymnastics genérica |
| fflate bundled (~8KB gzip) | Dependência do QDPX export — sem alternativa nativa |

---

## ✅ Implementados (registro)

Histórico de features entregues. Mantido como registro, não reabrir.

- **#1 Code Hierarchy** (Fases A/B/C) — 2026-03-22. `codes: CodeApplication[]`, `parentId`/`childrenOrder`/`mergedFrom`, Codebook Panel 3-níveis, MergeModal com busca fuzzy, pastas virtuais (`FolderDefinition`, sem significado analítico), drag-drop, context menu, "New Folder"
- **#5 FuzzySuggestModal para "Add Existing Code"** — 2026-03-21. `CodeBrowserModal` migrado pra `FuzzySuggestModal<CodeDefinition>` nativo. 22 LOC
- **#6 Quick Switcher de Códigos** — 2026-03-21. Command `quick-code`: seleciona texto → fuzzy modal → aplica. Reutiliza `CodeBrowserModal` + `addCodeAction`
- **#8 Analytics Cross-source Comparison** — 2026-03-02. `sourceComparisonMode.ts`. Métricas por source type (markdown, PDF, CSV, image, audio, video)
- **#10 Code Overlap Analysis** — implementado como `overlapMode.ts`. Heatmap de pares com span textual compartilhado
- **#14 Magnitude Coding** (Fase D) — 2026-03-22. `CodeDefinition.magnitude` (nominal/ordinal/continuous), picker fechado, Settings toggle
- **#14b Relations** (Fase E) — 2026-03-22. Label livre com autocomplete, seções colapsáveis, 20ª visualização Analytics (Relations Network), QDPX export como `<Link>`
- **#14c Virtual Folders** (Fase B) — 2026-03-22. `folder?` em CodeDefinition, `FolderDefinition` no registry, drag-drop, context menu, "New Folder"
- **#15 REFI-QDA Export + Import + CSV por modo Analytics** — 2026-03-22. `qdcExporter.ts`, `qdpxExporter.ts`, `qdpxImporter.ts`, modal pre-export/import, conversão de coordenadas por engine, CSV de frequencies/co-occurrence/Doc-Code Matrix
- **#16 Per-Code Decorations** — 2026-03-02. Markdown (CM6) + PDF. N decorations sobrepostas com `opacity / N`, `mix-blend-mode: multiply`
- **#18 Case Variables** — 2026-04-21. Registry central, storage 3-caminhos (frontmatter md + data.json binários), type inference, popover/painel lateral, Analytics filter, QDPX round-trip

### Bug fixes e dívidas resolvidas

- **§14 Analytics engine (codeId vs name)** — 2026-04-21 (commit `1422bb7`) + normalização canônica (commit `cf09894`, 2026-04-22). UnifiedCode ganhou `id`, markers normalizados no load via `normalizeCodeApplications`. Workbench vault: 241/241 canônico
- **§11.1 Round-trip integrity** — 2026-04-21. 4 bugs críticos no export/import QDPX corrigidos (GUID mismatch, frontmatter duplicado, `vault.create` não persistindo, models sem sync pós-import)
- **§16 Audio/Video scroll persistence** — 2026-04-22 (merge `8d38939`). Mirror `lastKnownScroll` + `setAutoCenter(false)` durante restore
- **§10 Toggle Media Coding** — 2026-04-23. 4 mídias (Image/Audio/Video/PDF) com `autoOpen` + `showButton` simétricos, toggle per-`(leaf, arquivo)` via `pinnedFileByLeaf`, PDF usa instrument/deinstrument in-place. Higiene cosmética (file-menu rename, showButton live, detach actions no onunload) incluída
- **§11 QDPX PDF round-trip** — 2026-04-23. Branch `feat/pdf-text-anchoring`. Export de text markers usa plainText consolidado via pdfjs (`pdfPlainText.buildPlainText`) + `resolveMarkerOffsets` (indexOf com fallback whitespace-normalize). Import cria marker com `{text, page}` + indices placeholder; `resolvePendingIndices` popula indices via DOM text-search no primeiro render. Shape dims reais via `loadPdfExportData` tanto no export (E2) quanto no import (I1, `createMarkersForSource` chama 1x quando a source tem PDFSelection; fallback 612x792 + warning se load falha). Bug latente `PdfCodingModel.save()` sem settings também fixado
- **§12 Codebook Panel polish (K1-K3)** — 2026-04-22/23. K1 autoReveal removido (órfão), K2 drag-drop visual completo, K3 virtual scroll com row recycling
- **§15 Case Variables edge cases** — 2026-04-22. Emoji/unicode, valor vazio, hot-reload com popover, multi-pane sync
- **§13 Migração Image/Audio/Video para `FileView`** — 2026-04-22. Lifecycle limpo via `onLoadFile`/`onUnloadFile`. `registerFileIntercept` mantido (core-native extensions rejeitam `registerExtensions`)

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
