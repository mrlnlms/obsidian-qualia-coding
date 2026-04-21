# Qualia Coding — Proximos Passos

> Visao organizada por area de design do que esta pendente (features, debt, gaps). Para detalhes de implementacao, ver `ROADMAP.md` (features) e `BACKLOG.md` (debt tecnica).
>
> Ultima atualizacao: 2026-04-21 (apos Codebook Evolution completo).

---

## Features prioritarias (proximas a atacar)

| Item | Complexidade | Ref | Motivacao |
|------|-------------|-----|-----------|
| **Toggle Visibility por Codigo** | Media | ROADMAP #7 | Resolve "color soup" com 20+ codigos — proximo passo natural apos per-code blending |
| **Case Variables por Documento** | Alta | ROADMAP #18 | Core de mixed methods — cruza codigos com metadata demografica. Todos os concorrentes tem |
| **Intercoder Reliability (kappa/alpha)** | Alta | ROADMAP §Gaps | Credibilidade academica — blocker pra pesquisa em equipe |

---

## Editor Markdown (CM6)

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Margin Panel Customization (left/right, espessura) | Feature | Baixa-Media | ROADMAP #11 |
| Margin Panel Resize Handle | Feature | Media | ROADMAP #17 (POC stashed) |
| `marginPanelExtension.ts` 548 LOC | Debt | Split futuro | BACKLOG §Arquivos grandes |

---

## Codebook e Codificacao

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Toggle Visibility por Codigo | Feature | Media | ROADMAP #7 |
| Code → Theme Hierarchy (tag agrupador) | Feature | Media | ROADMAP #4 |
| Analytic Memo View (integracao analytics) | Feature | Media | ROADMAP #3 (resto pendente) |

---

## Analytics e Visualizacoes

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Code × Metadata | Feature | Media | ROADMAP #9 (depende de #18 Case Variables) |
| Analytical Memos (reflexoes) | Feature | Media | ROADMAP #19 |

---

## Research Board

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Drag do Explorer, sync, templates, export | Feature | Media | ROADMAP #12 |

---

## Data e Media Engines

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Parquet lazy loading (pagination, server-side row model) | Feature | Media-Alta | ROADMAP #2 |
| Case Variables por Documento | Feature | Alta | ROADMAP #18 |

---

## Plataforma e Interop

| Item | Tipo | Complexidade | Ref |
|------|------|-------------|-----|
| Projects + Workspace | Feature | Alta | ROADMAP #13 (reavaliar data model) |
| Export JSON full / PNG Dashboard composite | Feature | Baixa-Media | ROADMAP #15 |
| Intercoder Reliability (kappa/alpha) | Gap estrategico | Alta | ROADMAP §Gaps |
| AI-Assisted Coding (local-first, Ollama) | Gap estrategico | Alta | docs/pm/gaps/2026-03-03-analysis.md |
| Community plugin listing | Gap estrategico | Media | docs/pm/gaps/2026-03-03-analysis.md |

---

## Debt tecnico prioritario

| Item | Razao | Ref |
|------|------|-----|
| z-index scrollDOM stacking (ataca junto com #17 Resize Handle) | Duas features tocam o mesmo container | BACKLOG §z-index |
| Codebook Panel polish (K1-K3) | Virtual scroll, drag-drop feedback, autoReveal toggle orfao | BACKLOG §Codebook Panel polish |
| Export/Import REFI-QDA refinements | Offsets PDF aproximados, shape markers PDF ignorados | BACKLOG §11 Export/Import |

---

## Permanente (ineliminavel)

| Item | Razao |
|------|-------|
| 3 `as any` PDF viewer | API interna Obsidian nao exporta tipos |
| 3 `as any` dataManager deepMerge | Type gymnastics generica |
| fflate bundled (~8KB gzip) | Dependencia do QDPX export — sem alternativa nativa |
