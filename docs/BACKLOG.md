# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Won't-fix mantém razão pra não reabrir.
> Última atualização: 2026-05-08.

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

### Mecânicos atacáveis (fila — pendentes)

Levantamento de hardening 2026-05-08. **9 itens da rodada inicial fechados em 2026-05-08** (ver BACKLOG-HISTORY). Os 3 abaixo precisam de refactor maior do que "leve" — saíram da fila atacável.

| # | Path:linha | Por que não foi atacado em 1 sessão | Tamanho real |
|---|------------|--------------------------------------|--------------|
| 1 | `src/analytics/data/codeMetadata.ts:155` | Detectar tautologia exige walk recursivo no `PredicateNode` (kinds AND/OR/NOT + 10 leaf types) pra checar se `caseVarEquals` referencia a `variableName` sendo plotada. Sem isso, banner ou é genérico demais (qualquer SC dispara) ou não dispara nos casos certos. | refactor (1-2h) |
| 2 | `src/analytics/views/modes/dendrogramMode.ts:20-28` | Computar K em real-time durante drag do slider exige rodar clustering (Jaccard matrix + linkage) síncrono — caro em codebooks grandes. Mostrar count "post-render" exigiria armazenar último resultado em `ctx`, fora do escopo de UI patch. | refactor leve (30-60min) |
| 3 | `src/analytics/views/modes/cooccurrenceMode.ts:82-100` | `reorderCooccurrence` é função síncrona dentro de render flow. Tornar async muda contrato dos callers + propaga `await`. Notice + `setTimeout(0)` exige refactor pra função async. | refactor (45-90min) |

**Padrão raiz comum aos 3:** todos exigem refactor além do trivial — não cabem em "1 string isolada" ou "1 condicional defensivo". Atacar quando o hardening real rodar (pós-ICR), provavelmente como parte do componente shared `<EmptyState>`/`<LoadingState>`/`<ErrorState>` que resolve cluster maior do levantamento.

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
| 6 `as any` (3 PDF internal + 3 deepMerge) | APIs externas sem tipos |
| 3 `@ts-ignore` (wavesurfer) | Module resolution |
| !important 66 instâncias | Maioria AG Grid defensivos |
| Inline styles ~15 estáticos | Migrar quando tocar nos arquivos |
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
