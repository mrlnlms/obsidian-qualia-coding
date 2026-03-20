# Qualia Coding — Proximos Passos

> Visao organizada por area de design de tudo que esta pendente (features, debt, gaps). Para detalhes de implementacao, ver ROADMAP.md (features) e BACKLOG.md (debt tecnica).

---

## Editor Markdown (CM6)

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Per-Code Decorations (N highlights por marker) | Feature | Media | ROADMAP #16 |
| Margin Panel Customization (left/right, espessura) | Feature | Baixa-Media | ROADMAP #11 |
| Margin Panel Resize Handle | Feature | Media | ROADMAP #17 |
| z-index scrollDOM stacking | Debt | Atacar com #16/#17 | BACKLOG §z-index |
| `markerViewPlugin.ts` 706 LOC | Debt | Split futuro | BACKLOG §Arquivos grandes |
| `marginPanelExtension.ts` 548 LOC | Debt | Split futuro | BACKLOG §Arquivos grandes |

---

## Codebook e Codificacao

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| **Code Hierarchy (parentId)** | Feature | **Alta — prioridade #1** | ROADMAP #1 |
| Code → Theme Hierarchy (tag agrupador) | Feature | Media | ROADMAP #4 |
| FuzzySuggestModal "Add Existing Code" | Feature | **~30 LOC** | ROADMAP #5 |
| Quick Switcher (Cmd+Shift+C) | Feature | **~30 LOC** | ROADMAP #6 |
| Toggle Visibility por Codigo | Feature | Media | ROADMAP #7 |
| Magnitude Coding | Feature | Baixa | ROADMAP #14 |

---

## Analytics e Visualizacoes

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Cross-source Comparison | Feature | Media | ROADMAP #8 |
| Code × Metadata | Feature | Media | ROADMAP #9 |
| Code Overlap Analysis (textual) | Feature | Media | ROADMAP #10 |
| Analytic Memo View (integracao) | Feature | Media | ROADMAP #3 |
| Analytical Memos (reflexoes) | Feature | Media | ROADMAP #19 |

---

## Research Board

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Drag do Explorer, sync, templates, export | Feature | Media | ROADMAP #12 |
| Board refresh on open (stale data) | Enhancement | Media | BACKLOG §Board snapshot |

---

## Data e Media Engines

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Parquet evolucao (lazy loading, pagination) | Feature | Media | ROADMAP #2 |
| Case Variables por Documento | Feature | Media | ROADMAP #18 |

---

## Plataforma e Interop

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Projects + Workspace | Feature | **Alta** | ROADMAP #13 |
| Export (CSV, JSON, QDPX, PNG) | Feature | Media-Alta | ROADMAP #15 |
| Intercoder Reliability (kappa/alpha) | Gap estrategico | Media | BACKLOG §Gaps |

---

## Permanente (ineliminavel)

| Item | Razao |
|------|-------|
| 3 `as any` PDF viewer | API interna Obsidian nao exporta tipos |
| 3 `as any` dataManager deepMerge | Type gymnastics generica |
