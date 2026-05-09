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

## 🧱 ICR — Hash consumers fora do Slice 2

Slice 2 (planejado 2026-05-09) entrega a **primitiva** de hash por source + 3 consumers iniciais (`markerTextCache` invalidation, `vault.on('rename')`/`('modify')` rename detection, QDPX import dedup). Os consumers abaixo dependem da MESMA primitiva — escopo recortado pra Slice 2 não inflar. Cada um vira slice próprio sobre primitiva já existente.

### Smart Code cache hash-based invalidation

**Estado atual:** invalidação granular via `MarkerMutationEvent` (por marker mutation). Não detecta source mutation externa (ex: tool fora do Obsidian editou arquivo).

**Impacto sem fazer:** predicates Smart Code que dependem de texto do source (ex: `caseVarEquals` cruzado com texto, futuro `textContains` se vier) podem servir matches stale após edição externa. Risco baixo no uso típico (single-user no Obsidian) mas degrada quando workflow inclui pipeline externo.

**Quando atacar:** quando uso real revelar staleness OU junto de "Provenance audit field" (compartilham mecanismo de hash check).

### Provenance audit field nos markers (snapshot do hash)

**Estado atual:** markers referenciam fileId (path) sem snapshot do estado do source no momento do coding.

**Impacto sem fazer:** edição posterior do source pode quebrar offsets dos markers (line/ch ou char-index ficam apontando pra texto que mudou) sem aviso ao user. User não sabe quando confiar nos bounds vs revisar — inferência manual via mtime/diff.

**Quando atacar:** quando provenance virar requirement explícito (paper publishing rigoroso, compliance regulatório, ICR multi-coder remoto onde lead precisa saber se source mudou desde coder enviar contribuição).

### Backup integrity validation

**Estado atual:** backups em `obsidian-qualia-coding/data_synthetic_bak/` validados só por path/timestamp. Restore re-aponta markers pros sources atuais sem checar se mudaram desde backup.

**Impacto sem fazer:** restore silencioso pode reapontar markers sobre source modificado, criando markers com bounds desalinhados. Perda invisível de fidelidade analítica.

**Quando atacar:** quando rotina de backup/restore virar fluxo crítico (hoje é manual e raro).

### Cross-vault remap (CRÍTICO pra Fase C — P2 transport multi-coder remoto)

**Estado atual:** import QDPX cria sources locais por path. Conflito de path com sources existentes do vault não é detectado por conteúdo.

**Impacto sem fazer:** **bloqueia Fase C** (transport multi-coder remoto, ver `docs/ROADMAP.md §"Infra compartilhada"`). Lead recebe contribuição de coder remoto e não consegue casar markers com sources locais quando paths divergem entre vaults (caso comum quando equipes não compartilham raiz idêntica). Sem hash, lead vê "source diferente" mesmo quando conteúdo é idêntico.

**Quando atacar:** **antes ou junto da Fase C**. Não pode ser depois — é pré-requisito estrutural pra P2 funcionar.

### Resumo do impacto cumulativo

Sem esses 4 consumers, a primitiva entregue no Slice 2 cobre os 3 casos mais frequentes (cache invalidation, rename detection, import dedup) mas deixa em aberto: detecção de edição externa pra Smart Codes, integridade temporal dos markers, integridade de backup, e — crucialmente — o pré-requisito de Fase C. Os 3 primeiros são otimizações de robustez progressiva; o último (cross-vault remap) é gating pra próximo grande marco do roadmap ICR.

**Atualização 2026-05-09:** cross-vault remap **entra como pedaço de `mergeCoderContribution`** no Slice 3 (Fase C P0). Não vai ficar isolado — é integrado direto no algoritmo de merge multi-coder. Resolve o gating descrito acima.

---

## 🧱 ICR — Fase C P1 (UX layer, fora do Slice 3)

Slice 3 (planejado 2026-05-09) entrega **Fase C P0** — funções puras de transport multi-coder remoto sem UI: `extractCoderContribution`, `mergeCoderContribution` (com cross-vault remap embutido), payload JSON format, codebook divergence detection. Testável via script. **Sem UI.** UX layer fica em P1, dependente de brainstorm com user (7 perguntas em aberto + 2 eixos ortogonais — ver `ROADMAP.md §"Infra compartilhada — Fase C"` e `obsidian-qualia-coding/plugin-docs/research/ICR-MATERIA-2026-05-08.md §7.1`).

### Comando/menu pra exportar contribuição

**Estado após Slice 3:** função `extractCoderContribution(data, coderId)` existe e é chamável via console/script. Sem comando palette, sem item de menu, sem botão.

**Impacto sem fazer:** export só via dev tools. Não-dev users não conseguem usar. **Bloqueia adoção real do workflow multi-coder.**

**Decisão pendente (brainstorm):** comando palette? item de menu na sidebar? botão em settings? trigger automático on certain events? — pergunta 1 do brainstorm Fase C.

### Modal preview de import + side-by-side compare + cherry-pick

**Estado após Slice 3:** `mergeCoderContribution(localData, payload, hashRegistry)` aplica TODO o payload. Caller decide se aplica ou não. Sem preview, sem comparação visual, sem seleção marker-por-marker.

**Impacto sem fazer:** lead aceita o batch inteiro sem revisar. Errors silenciosos (marker fora de range, código não-bate) só aparecem depois.

**Decisão pendente (brainstorm):** modal preview com diff? side-by-side com markers do lead vs incoming? cherry-pick por marker (overhead alto)? batch confirm com warnings highlighted? — perguntas 2-4 do brainstorm.

### Conflict resolution UX

**Estado após Slice 3:** função pura emite `conflicts: ConflictRecord[]` mas não resolve — caller decide. mergePolicies.ts existing já tem políticas pra code-level merge, mas multi-coder marker collision (mesmo segment, codes diferentes entre coders) não tem policy default.

**Impacto sem fazer:** conflitos viram warnings que o caller tem que tratar manualmente. Sem fluxo guiado.

**Decisão pendente (brainstorm):** policy default (last-write-wins / local-wins / incoming-wins / manual)? UI de resolução marker-por-marker? — pergunta 4 do brainstorm.

### Multi-import staging

**Estado após Slice 3:** import é destrutivo — aplica payload no `data.json` master direto. Sem area de staging.

**Impacto sem fazer:** lead que recebe contribuições de 3 coders e quer comparar antes de mergear precisa de 3 vaults separados ou backup manual.

**Decisão pendente (brainstorm):** staging area dedicada? branch model (git-like)? snapshot rollback? — pergunta 5-6 do brainstorm (adicionadas 2026-05-09).

### Codebook divergence resolution UX

**Estado após Slice 3:** função pura detecta `codebookHashMismatch: true` em payload se codebook local diverge do que estava quando coder exportou. Emite warning estruturado. **Não bloqueia merge.**

**Impacto sem fazer:** lead vê warning mas não tem fluxo guiado pra resolver. Pode aceitar merge silencioso com codes inconsistentes.

**Decisão pendente (brainstorm):** auto-rebase (incoming codes ganham IDs locais)? staging com diff? rejection com mensagem? — pergunta 7 do brainstorm.

### Source divergente alert (hash não bate entre vaults)

**Estado após Slice 3:** cross-vault remap procura match por hash. **Se source com mesmo path existe local mas hash diverge** (= source foi editado em algum dos lados), função emite warning `sourceHashMismatch` mas não bloqueia. Caller decide: merge incoming ignorando local? trust local? marcar markers como "potencialmente desalinhados"?

**Impacto sem fazer:** decisão silenciosa do caller (que vai ser o programador, não o pesquisador). Sem fluxo claro.

**Decisão pendente (brainstorm):** UI de alerta com diff visual? batch summary numérico? por arquivo ou agregado? — pergunta adicional do brainstorm 2026-05-09.

### Resumo do impacto cumulativo

Sem essas 6 frentes de UX, Slice 3 entrega motor de transport completo mas usável **só via console/script** — útil pra dev/testing, não pra workflow real de pesquisador. UX brainstorm dedicado precede primeira spec de UI; sem isso, qualquer interface seria especulação.

---

## 🧱 ICR — Adapters fora do Slice 4

Slice 4 (planejado 2026-05-09) adiciona adapters **cod row** (CSV categórico) e **áudio/vídeo** (overlap temporal em segundos) sobre o motor κ paramétrico existente. Restam adapters fora do Slice 4:

### Adapter PDF shape + imagem (bbox IoU — terreno aberto)

**Estado atual:** motor κ assume overlap 1D (intervalo `from` → `to`). PDF shape (`PdfShapeMarker`) e Image (`ImageMarker`) têm coordenadas espaciais 2D — retângulo, elipse, polígono.

**Impacto sem fazer:** ICR não cobre coding de regiões em PDFs/imagens. Markers desses engines existem mas ficam fora do Compare Coders.

**Quando atacar:** após **brainstorm metodológico dedicado**. Decisões em aberto na literatura QDA:
- Threshold de "match" (IoU ≥ 0.5? ≥ 0.7? configurável?)
- Como bbox match vira input do κ (binário matched/unmatched? ranking? ponderado pelo IoU?)
- Bounds não-retangulares (elipse, polígono) — IoU geral funciona mas custo computacional cresce
- Sobreposição parcial M:N entre coders — caso ambíguo
- Chance agreement pra área 2D — Krippendorff α tem precedente nominal mas não pra geometria espacial

**Não há receita pronta no mercado:** ATLAS.ti 25 só faz áudio/vídeo. NVivo Coding Comparison opera sobre "regiões" sem métrica espacial dedicada. Diferenciador potencial mas requer pesquisa metodológica.

### Resolução sub-segundo pra áudio/vídeo

**Estado após Slice 4:** áudio/vídeo arredondam `from`/`to` pra inteiros de segundo (`Math.floor`/`Math.ceil`). Alinhado com ATLAS.ti 25.

**Impacto sem fazer:** discordâncias sub-segundo (ex: Carla marcou 12.3-18.7s, Joana marcou 12.5-18.5s) viram match perfeito após arredondamento (12-19 vs 12-19). Em pesquisa fonética ou microanalysis conversacional, isso pode importar.

**Quando atacar:** quando alguém puxar uso real que justifique. Implementação: configurar resolução por engine (ms ou décimos de segundo), com performance trade-off documentado.

### Pre-warm de durações de media files

**Estado após Slice 4:** caller passa `totalUnits` (= duração em segundos) ao montar input do reporter. Runtime usa `HTMLMediaElement.duration` (precisa abrir o file). Em batch sobre vault grande, abrir cada arquivo só pra durar é caro.

**Impacto sem fazer:** Compare Coders cross-file precisa abrir cada media file pra obter duração. Latência inicial alta.

**Quando atacar:** quando Compare Coders UI entrar e o user reportar latência. Cache de durações em `data.mediaDurations: Record<fileId, number>` populado lazy on file open.

### Resumo do impacto cumulativo

Slice 4 entrega 5 das 6 engines do plugin (markdown + PDF text + CSV cod segment ✅ Slice 1; áudio + vídeo ✅ Slice 4; CSV cod row ✅ Slice 4). Falta apenas PDF shape + imagem — terreno aberto que requer pesquisa metodológica antes. Sub-segundo e pre-warm são otimizações conhecidas que entram quando uso real puxar.

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
