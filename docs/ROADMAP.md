# Qualia Coding — Roadmap

> Todas as features planejadas mas ainda não implementadas, organizadas por prioridade e escopo. Items concluídos estão documentados em `HISTORY.md`.

---

## Prioridade Alta — Funcionalidades Core

### 1. Code Hierarchy (parentId)

**Status**: Plano completo, pronto para executar (~200 LOC total).
**Blocked on**: Design de interação (como o usuário cria/gerencia hierarquia na UI).

**Data model**:
- `parentId?: string` opcional em `CodeDefinition` — zero migration necessária
- 7 novos métodos no registry: `getRootCodes`, `getChildren`, `getAncestors`, `getDescendants`, `getDepth`, `getHierarchicalList`, `setParent`

**7 fases de implementação**:

| Fase | Arquivo | LOC | O que muda |
|------|---------|-----|-----------|
| 1. Data Model | `types.ts`, `codeDefinitionRegistry.ts` | ~60 | `parentId` field + 7 métodos |
| 2. Code Form Modal | `codeFormModal.ts` | ~25 | Dropdown "Parent code" + anti-cycle validation (~25 LOC) |
| 3. Popover indent | `codingPopover.ts` | ~15 | `paddingLeft: depth * 16px` (indentation driven by `getHierarchicalList()` output) |
| 4. Code Browser Modal | `codeBrowserModal.ts` | ~10 | Tree indentation |
| 5. Explorer 4-level tree | `baseCodeExplorerView.ts` | ~50 | Category → Code → File → Segment |
| 6. Detail breadcrumbs | `baseCodeDetailView.ts` | ~20 | "Category > Code" header |
| 7. CSS | `styles.css` | ~15 | Indent + visual hierarchy |

**O que NÃO muda**: `BaseMarker.codes` (markers armazenam nomes, não IDs), engine models, Analytics, `cm6TooltipMenu.ts`, `obsidianMenu.ts`, serialização.

**Migration**: Old data becomes root codes (migration zero — optional field, existing = root).

**Ref. metodológica**: Saldaña Ch.14 — code→theme hierarchy é padrão em QDA.

---

### 2. Parquet — Evolução futura

**Status**: Suporte básico já implementado (`hyparquet` + `parseTabularFile()` + `registerExtensions(['csv', 'parquet'])`). Ver `HISTORY.md` para detalhes da implementação.

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

### 5. FuzzySuggestModal para "Add Existing Code"

**Status**: Stub existente nos action buttons do menu ("coming soon").

**Implementação**: ~30 LOC usando `FuzzySuggestModal<CodeDefinition>` do Obsidian API.
- Busca fuzzy por nome de código
- Mostra cor como swatch ao lado do nome
- Complementa o popover de toggle — para quando há muitos códigos

### 6. Quick Switcher de Códigos

**Comando**: `Cmd+Shift+C` — abre `SuggestModal<CodeDefinition>` para aplicar código rapidamente à seleção atual.

### 7. Toggle Visibility por Código

- No Code Explorer, toggle para mostrar/esconder highlights de um código específico no editor
- Resolve o problema de "color soup" com 20+ códigos

### 8. Analytics: Cross-source Comparison

- Painel comparativo: como os mesmos códigos se comportam em markdown vs CSV vs PDF
- Métricas por source type
- Code × Metadata: cruzamento de códigos com variáveis demográficas por source
- Multi-tab spreadsheet export (one tab per source type, summary tab)

### 9. Analytics: Code × Metadata

- Se CSV tem colunas de metadata (gênero, idade, etc.), cruzar com códigos
- Tabelas de contingência por variável demográfica

### 10. Code Overlap Analysis

- Which codes share textual regions (not just co-occur on same marker)
- Distinct from co-occurrence — about shared text spans
- Analytics enhancement: heatmap of overlapping code pairs by character count

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

### 14. Magnitude Coding (Saldaña Ch.14)

- `magnitude?: string` no marker (intensidade/direção/avaliação)
- Chip visual diferenciado (e.g., badge "HIGH" ao lado do código)
- Filtro no Analytics por magnitude dentro de um código

### 15. Export

| Formato | Escopo |
|---------|--------|
| CSV | Dados codificados com colunas de código incluídas |
| JSON | Full data export |
| REFI-QDA (QDPX) | Interoperabilidade com ATLAS.ti, NVivo, MAXQDA |
| PNG/PDF (Dashboard) | Composite de todas as visualizações |

### 16. Per-Code Decorations (Phase 3 original)

**Conceito**: 1 `Decoration.mark()` por **código** no marker (não por marker). Marker com 3 códigos = 3 decorations overlapping com opacity blending.

**Riscos**: Com 20+ códigos, palette management se torna crítico. Algoritmo de contraste mínimo necessário.

**Status**: Parcialmente implementado (opacity blending no markdown), mas não expandido para N decorations por marker.

**Gutter bars**: Optional companion — vertical color bars in the gutter per code.

**4 visual approaches** (combinatorial analysis reference):
- **A**: Background highlight only (current)
- **B**: Gutter bars only
- **C**: Background + gutter bars combined
- **D**: Per-code `Decoration.mark()` with opacity blending

**D alone is most pragmatic starting point** — already partially implemented, minimal UI surface.

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
| **REFI-QDA (QDPX) Export/Import** | Padrão XML de interoperabilidade entre CAQDAS tools. Crítico para credibilidade acadêmica e portabilidade. NVivo, ATLAS.ti, MAXQDA, Dedoose, Quirkos, Taguette suportam. | #15 Export |
| **Export CSV/Excel** | Pesquisadores esperam exportar code frequencies, co-occurrence, Doc-Code Matrix pra rodar stats próprias. Todos os concorrentes exportam pra Excel/SPSS. | #15 Export |
| **Intercoder Reliability** | Cohen's kappa / Krippendorff's alpha. Esperado por peer reviewers para claims de rigor. NVivo, ATLAS.ti, MAXQDA, Dedoose, QualCoder oferecem. | Novo item (não listado) |

### Diferenciais confirmados pela pesquisa

| Diferencial | Status | Concorrência |
|------------|--------|-------------|
| **5 analytics views exclusivas** (MCA, MDS, LSA, Polar, CHAID) | Implementado | Zero concorrentes oferecem built-in |
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
