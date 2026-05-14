# Backlog — Qualia Coding

> **Estado vivo = §🟢 Estado atual + §🪶 Polish curto + §🔍 Sintomas.** §📌 Memória técnica no fim (won't-fix + permanente) é consulta direcionada — não apresentar ao responder "como tá o backlog?".
>
> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Última atualização: 2026-05-13 (release **0.7.0** — bloco Image engine fechado + Gap #1c/1d + 3 UX gaps + cluster.worker async + canvas refresh cor cross-engine + colorOverride cross-engine + audit log defensive fix + `!important` podado 68 → 46: 7 cursor overrides + 39 handles SVG = Permanente; 18 AG Grid cells + 2 SVG stroke + 2 isolados removidos via especificidade). Bloco ICR + Image + canvas refresh cor zerados antes da próxima frente prática (LLM coding + Camada 2 BHM).

---

## 🟢 Estado atual

**Bloco ICR fechado por inteiro** (release 0.6.0 arquitetura + 0.7.0 gaps intra-modality, 2026-05-13). Camadas 2 e 3 do framework multifaceta viraram peças do bloco LLM (ver `ROADMAP.md §"Framework Unificado ICR + LLM"`).

**Próxima frente prática:** LLM-assisted coding com Camada 2 BHM como par natural. Precede brainstorm dedicado — ver `ROADMAP.md §"Frente 2"` + `docs/ICR-MULTIMODAL-METHODOLOGY.md`.

### 🔍 Sintomas observados sem repro confiável

Sem nenhum sintoma aberto no momento. Quando aparecer, capturar `data.json` + screenshot + steps — diagnóstico fica trivial.

---

## 🪶 Polish curto

- [x] **[Smart Code Phase 2] Invalidação granular em field updates** — Modelos de PDF, Image, CSV e Media agora emitem `MarkerMutationEvent` no `updateMarkerFields`.
- [x] **[Smart Code Phase 2] Suporte em Analytics Stats** — `calculateDocumentCodeMatrix`, `calculateSourceComparison`, `calculateOverlap` e `calculateTextStats` atualizados para suportar Smart Codes.
- [x] **[Smart Code Phase 2] Suporte em Analytics Views** — Integrado em `dashboard`, `doc-matrix`, `source-comparison`, `overlap`, `text-retrieval`, `word-cloud` e `text-stats`.
- [ ] **[Smart Code Phase 2] Dimensionality Reduction Stats** — Estender `calculateChiSquare`, `calculateACM`, etc. para Smart Codes (prioridade baixa).

---

## 📌 Memória técnica — não consultar pra planejar

> Consultar SÓ pra pergunta direta ("isso foi decidido?", "tem invariante em X?"). Não trazer pra resposta sobre status/backlog vivo.

### 🔒 Won't-fix (não reabrir)

Lista canônica de decisões registradas. Cada uma tem razão explícita pra não voltar a virar tarefa.

#### §4 C6 — `marginPanelExtension.ts` 548 LOC sem refactor
Layout algorithm já foi extraído em `marginPanelLayout.ts` (puro, testável). O restante do arquivo grande não tem bug associado — refactor seria estética sem ganho de manutenibilidade. Reabrir só se aparecer bug específico.

#### §8b CB3 — Search só por nome de código (não busca pasta)
`hierarchyHelpers.buildFlatTree` busca só nomes de códigos. **Decisão correta**: pastas são organizacionais (sem significado analítico, confirmado em CLAUDE.md). Usuário conhece suas pastas e navega direto; quando um código casa, a pasta que o contém já é auto-revelada e expandida. Buscar por nome de pasta resolveria problema inexistente.

#### §10b — Magnitude popover sem empty state
Seção de magnitude some inteiramente quando nenhum código aplicado tem magnitude configurada. **Decisão UX intencional** — não exibir mensagem é mais limpo que poluir o popover com placeholder.

#### §11 E3 — Markers CSV não exportáveis via REFI-QDA
Limitação do **formato REFI-QDA**, não do plugin: o spec não comporta segmentos de célula tabular. Documentado no disclaimer do modal de export. Workaround pro usuário: usar Tabular CSV zip (#19) que cobre o caso analítico.

#### §11 E5 — HEIC / TIFF / HEIF não suportados
Electron não decodifica esses formatos nativamente. **Tentativas rejeitadas:**
- `heic2any`/libheif em runtime — intercept falho + artefatos de decode + memory leak do WASM + 1.3MB de bundle
- Command one-shot de conversão — quebra o fluxo natural "abre e codifica"

**Workaround pro usuário:** converter externamente (Preview do macOS → Export As PNG) antes de trazer pro vault.

**Reabrir se:** aparecer demanda consistente em produção. Avaliar decoder via worker thread separado.

#### §15 — Case Variables multi-popover racing
Arquitetura atual só permite um popover por vez (single `activePopoverClose` field). Race condition entre dois popovers simultâneos não é problema porque é arquiteturalmente impossível hoje. Revisar **só se** um dia decidir suportar multi-popover.

#### Delay ms em virtual cells durante filter (parquet/CSV lazy)

Cells virtuais (cod-frow/cod-seg/comment) têm delay ms-pequeno no swap visual após filter no lazy mode — efeito direto do mecanismo `refreshInfiniteCache` que mantém DOM visível durante re-fetch (vs `purgeInfiniteCache` que limpa sync e causava o flash branco). Cells reais atualizam imediato porque o value muda (parquet entrega dado novo); cells virtuais usam cellRenderer custom + `field` apontando pra coluna inexistente no parquet, então só atualizam após `refreshCells({ force: true })` no listener `modelUpdated`. **Trade aceito** em 0.4.2 sobre voltar a `purgeInfiniteCache`. Reabrir só se AG Grid Community ganhar mecanismo render-while-fetch nativo. Documentado no CHANGELOG 0.4.2.

#### §17 — Memo View virtual scroll
Suspeita inicial: >500 marker memos visíveis trava scroll por peso de DOM. **Morto em 2026-04-27** pelo click-to-edit refactor (commit `18676b4`): cada memo agora é `<p>` simples e só vira `<textarea>` quando clicado. Validação empírica em corpus de 50 codes + 527 markers + ~500 memos: fluido em by-file e by-code com `markerLimit="all"`. Corpus preservado via `scripts/seed-memo-corpus.mjs` se precisar re-medir.

---

### ⚓ Permanente (ineliminável)

| Item | Razão |
|------|-------|
| 13 `as any` em `pdf/index.ts` + `pdf/pdfExportData.ts` | Obsidian/pdfjs internals (`leaf.tabHeaderEl`, `view.viewer.child`, `window.pdfjsLib`) sem tipos públicos |
| 5 `as any` em `core/memoMigration.ts` | Migração one-shot lê shape legado pré-`MemoRecord`. Zero usuários atuais — código será deletado quando workbench rodar uma vez |
| 3 `@ts-ignore` (wavesurfer) | Module resolution `.esm.js` subpath não resolve com `moduleResolution: 'node'`; esbuild lida em runtime |
| 2 `@ts-expect-error` (`csv/duckdb/wasmAssets.ts`) | Custom esbuild loaders retornam `Uint8Array`/`string`; TS não tem visibilidade |
| 7 `!important` cursor body overrides (linhas 496, 803-804, 929-930, 934, 938, 4399) | Uso canônico: `body.codemarker-dragging *` precisa pisar em cima de `cursor: pointer` dos botões/rows durante drag/draw. Sem `!important`, hover sobre botão durante drag mostraria cursor errado. Categoria A da recategorização 2026-05-13. |
| 39 `!important` handles SVG transparency (linhas 833-987 + 1151) | Defesa contra `.codemarker-highlight` ter `background-color` inline da cor do código; handles SVG (drag handles dos markers em markdown) vivem dentro do highlight e herdariam o background. `background: none !important` força transparência. Categoria B da recategorização 2026-05-13. Re-arquitetura possível mas sem ganho funcional. |
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
