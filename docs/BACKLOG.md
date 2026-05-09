# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Won't-fix mantém razão pra não reabrir.
> Última atualização: 2026-05-09.

---

## 🟢 Estado atual

Único bloqueador legado: §11 E3 (limitação de formato, won't-fix documentado). Polish ativo abaixo.

### 🔍 Sintomas observados sem repro confiável

Quando aparecer, capturar `data.json` + screenshot + steps na hora — diagnóstico fica trivial com forensic data. Sem nenhum sintoma aberto no momento.

---

## 🪶 Polish curto

### Filter active indicator perdido em `LazyTextFilter` (regressão 0.4.2)

**Sintoma:** AG Grid `agTextColumnFilter` padrão renderiza um dot/badge roxo no header da coluna quando o filtro está ativo. O custom `LazyTextFilter` (`src/csv/duckdb/lazyTextFilter.ts`, introduzido em 0.4.2 pra eliminar flash branco no refresh) perdeu esse indicador. Usuário não tem feedback visual de quais colunas estão filtradas — quebra usabilidade e quebra consistência com colunas não-lazy.

**Severidade:** média. Não impede usar; impede saber que filtro está ativo.

**Investigar:** AG Grid expõe `isFilterActive(): boolean` no contrato do filter component — ele consome essa flag pra decidir mostrar o indicator no header. Verificar se `LazyTextFilter` implementa `isFilterActive` retornando `true` quando há `filterModel`. Possíveis causas:
- Método não implementado / sempre retorna `false` → indicator nunca aparece
- AG Grid Community talvez só rendere indicator built-in pra filters nativos; pode precisar render manual via `headerComponent` custom ou CSS targeting `.ag-header-cell-filter-active`

**Caminho rápido:** se for só `isFilterActive` faltando, fix é uma linha. Se AG Grid não rendera pra custom filter, adicionar pseudo-element CSS via `.ag-header-cell-filtered::after` ou hook no `headerComponentParams`.

### Image engine (sessão dedicada)

8 itens do raio-x de hardening 2026-05-08. **Atacar como sessão dedicada com vault aberto** — image é o engine menos polido do plugin (construído por dor, não design coeso). Mistura mecânico, refactor, UX call e debug runtime; ataque pontual fora da sessão fica caro/arriscado. Decisão B (`colorOverride`) é a única explicitamente deferida pelo user em 2026-05-08.

| # | Path:linha | Sintoma | Tipo |
|---|-----------|---------|------|
| 1 | `src/image/regionLabels.ts:120-126` | Labels desacoplam de regions em pan/zoom (transform inversion na fórmula de viewport) | **debug runtime** — exige reproduzir em vault real |
| 2 | `src/image/imageCodingMenu.ts:127` | Menu pisca/reposiciona em rajada quando codes editados rápido — `onRebuild` re-chama `open()` sem debounce | **mecânico c/ risco** — debounce ~150ms muda timing de interaction patterns; valida com smoke |
| 3 | `src/image/canvas/regionManager.ts:114-128` | `marker.colorOverride` no schema sem callsite — `getStyleForMarker()` ignora silenciosamente | **decisão B deferida** (2026-05-08) — wirar (~10 linhas) ou remover do `BaseMarker` type |
| 4 | `src/image/regionHighlight.ts:37-40` | `suppressModelHover` frágil (bidirectional sync com canvas hover) + WeakMap `origValues` sem cleanup pós-delete | **refactor** — rever sync canvas↔model hover state |
| 5 | `src/image/views/imageView.ts:144-146` | Menu auto-close em `selection:cleared` sem validação de multi-select rápido — popover fecha antes de permitir code assignment em 2 shapes | **decisão UX** — fechar em 2 selects ou esperar click fora? |
| 6 | `src/image/views/imageView.ts:156,169` | `refreshAll()` em todo `viewChanged` (zoom, pan) — em imagens com 100+ regions, cada pan dispara 100+ label repaint cycles | **mecânico c/ risco** — debounce/rAF; valida que não atrasa pan/zoom visivelmente |
| 7 | `src/image/views/imageView.ts:252-266` | Visibility toggle aplica `obj.visible = anyVisible` mas não hidra fill/stroke opacity — região fica visível mas "ghost-like" se código invisível | **decisão visual** — como deve parecer região com código invisível? |
| 8 | `src/image/canvas/regionDrawing.ts:139,155` | Threshold mínimo assimétrico (rect: w<3 AND h<3; ellipse: rx<2 AND ry<2). User pode criar shapes 1px intencionais → fantasmas no canvas | **mecânico** — padronizar threshold + validação pré-criação |

### Cross-cutting pendente (pós-rodada 2026-05-09)

Da fila cross-cutting do hardening, 4 frentes atacadas em 2026-05-09 (parseInt validation, CI e2e suite completa, χ² walk recursivo, dendrogram cluster preview). 2 ficaram pendentes:

| Item | Por que não couber em rodada mecânica |
|------|----------------------------------------|
| **`styles.css` 68 `!important`** — clusters em 833-863 (handles SVG drag), 870-987 (mais handles), 1239-1287 (csv-comment-cell + csv-cod-seg-cell `display: flex` overrides) | Cada `!important` é override defensivo de defaults AG Grid (especificidade alta dos selectors `.ag-cell *`). Auditar exige testar runtime cada um — remover sem teste quebra render. Trabalho pra hardening real com vault aberto, não diff de código. |
| **`cooccurrenceMode.ts:82-100` reorder async** | Ataca trava de UI em codebooks grandes durante hierarchical cluster. Refactor exige tornar `ModeEntry.render` `void \| Promise<void>` (contrato compartilhado por 25 modes) + `analyticsView.ts:506` await + race com `savedData` restoration. Refactor invasivo, não cabe em mecânico leve. |

---

## 🔒 Won't-fix (não reabrir)

Lista canônica de decisões registradas. Cada uma tem razão explícita pra não voltar a virar tarefa.

### §4 C6 — `marginPanelExtension.ts` 548 LOC sem refactor
Layout algorithm já foi extraído em `marginPanelLayout.ts` (puro, testável). O restante do arquivo grande não tem bug associado — refactor seria estética sem ganho de manutenibilidade. Reabrir só se aparecer bug específico.

### §8b CB3 — Search só por nome de código (não busca pasta)
`hierarchyHelpers.buildFlatTree` busca só nomes de códigos. **Decisão correta**: pastas são organizacionais (sem significado analítico, confirmado em CLAUDE.md). Usuário conhece suas pastas e navega direto; quando um código casa, a pasta que o contém já é auto-revelada e expandida. Buscar por nome de pasta resolveria problema inexistente.

### §10b — Magnitude popover sem empty state
Seção de magnitude some inteiramente quando nenhum código aplicado tem magnitude configurada. **Decisão UX intencional** — não exibir mensagem é mais limpo que poluir o popover com placeholder.

### §11 E3 — Markers CSV não exportáveis via REFI-QDA
Limitação do **formato REFI-QDA**, não do plugin: o spec não comporta segmentos de célula tabular. Documentado no disclaimer do modal de export. Workaround pro usuário: usar Tabular CSV zip (#19) que cobre o caso analítico.

### §11 E5 — HEIC / TIFF / HEIF não suportados
Electron não decodifica esses formatos nativamente. **Tentativas rejeitadas:**
- `heic2any`/libheif em runtime — intercept falho + artefatos de decode + memory leak do WASM + 1.3MB de bundle
- Command one-shot de conversão — quebra o fluxo natural "abre e codifica"

**Workaround pro usuário:** converter externamente (Preview do macOS → Export As PNG) antes de trazer pro vault.

**Reabrir se:** aparecer demanda consistente em produção. Avaliar decoder via worker thread separado.

### §15 — Case Variables multi-popover racing
Arquitetura atual só permite um popover por vez (single `activePopoverClose` field). Race condition entre dois popovers simultâneos não é problema porque é arquiteturalmente impossível hoje. Revisar **só se** um dia decidir suportar multi-popover.

### Delay ms em virtual cells durante filter (parquet/CSV lazy)

Cells virtuais (cod-frow/cod-seg/comment) têm delay ms-pequeno no swap visual após filter no lazy mode — efeito direto do mecanismo `refreshInfiniteCache` que mantém DOM visível durante re-fetch (vs `purgeInfiniteCache` que limpa sync e causava o flash branco). Cells reais atualizam imediato porque o value muda (parquet entrega dado novo); cells virtuais usam cellRenderer custom + `field` apontando pra coluna inexistente no parquet, então só atualizam após `refreshCells({ force: true })` no listener `modelUpdated`. **Trade aceito** em 0.4.2 sobre voltar a `purgeInfiniteCache`. Reabrir só se AG Grid Community ganhar mecanismo render-while-fetch nativo. Documentado no CHANGELOG 0.4.2.

### §17 — Memo View virtual scroll
Suspeita inicial: >500 marker memos visíveis trava scroll por peso de DOM. **Morto em 2026-04-27** pelo click-to-edit refactor (commit `18676b4`): cada memo agora é `<p>` simples e só vira `<textarea>` quando clicado. Validação empírica em corpus de 50 codes + 527 markers + ~500 memos: fluido em by-file e by-code com `markerLimit="all"`. Corpus preservado via `scripts/seed-memo-corpus.mjs` se precisar re-medir.

---

## ⚓ Permanente (ineliminável)

| Item | Razão |
|------|-------|
| 13 `as any` em `pdf/index.ts` + `pdf/pdfExportData.ts` | Obsidian/pdfjs internals (`leaf.tabHeaderEl`, `view.viewer.child`, `window.pdfjsLib`) sem tipos públicos |
| 5 `as any` em `core/memoMigration.ts` | Migração one-shot lê shape legado pré-`MemoRecord`. Zero usuários atuais — código será deletado quando workbench rodar uma vez |
| 3 `@ts-ignore` (wavesurfer) | Module resolution `.esm.js` subpath não resolve com `moduleResolution: 'node'`; esbuild lida em runtime |
| 2 `@ts-expect-error` (`csv/duckdb/wasmAssets.ts`) | Custom esbuild loaders retornam `Uint8Array`/`string`; TS não tem visibilidade |
| !important 68 instâncias | Maioria override defensivo de AG Grid (`.ag-cell *` selectors com especificidade alta) |
| Inline styles dinâmicos remanescentes | `style.display = 'none'/''` toggles, position/zIndex em popovers — refactor pra classe é boilerplate por boilerplate |
| fflate bundled (~8KB gzip) | Dependência do QDPX export — sem alternativa nativa no Obsidian |

---

## 📚 Histórico

Registro completo de débitos resolvidos em arquivo separado: **[BACKLOG-HISTORY.md](BACKLOG-HISTORY.md)**.

Separado pra reduzir overhead em sessões LLM — agentes não precisam ler histórico salvo quando a pergunta for "já resolvemos X?" ou similar.

---

## Como usar este arquivo

- **Abrir item novo:** criar entrada (won't-fix com razão, ou aberto com severidade + arquivo + problema)
- **Resolver item:** mover one-liner com data + raiz pro `BACKLOG-HISTORY.md` (seção do mês). Não deixar aqui.
- **Item de polish curto sem guarda-chuva:** adicionar na seção "🪶 Polish curto" deste arquivo. Se passar de "curto" pra "refactor grande" (>4h), abrir plan dedicado
