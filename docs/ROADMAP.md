# Qualia Coding — Roadmap

> **Estado vivo = §⚡ Status atual + frentes ativas + §Decisões de produto abertas.** §⛔ Decisões fechadas + §Frentes encerradas + §Riscos = referência cravada, não apresentar ao responder "como tá o roadmap?".
>
> Features planejadas por prioridade. Items concluídos ficam no registro ao final.
> Última atualização: 2026-05-13 (release **0.7.0** — bloco Image engine fechado por inteiro + Gap #1c/1d (SourceSizeProvider PDF + CSV segment) + 3 UX gaps ICR + cluster.worker async (cooccurrence/overlap/dendrogram) + canvas refresh cor cross-engine + colorOverride cross-engine + audit log defensive fix + `!important` podado 68 → 46 (18 AG Grid cells + 2 SVG stroke + 2 isolados removidos via especificidade; 7 cursor body + 39 handles SVG transparency reclassificados como Permanente). Polish ICR/Image/cross-engine zerados. Próxima frente prática = **LLM coding + ICR Camada 2 BHM** como par natural — precede brainstorm dedicado).

## ⚡ Status atual (próxima sessão lê isso primeiro)

> **🎯 BLOCO ICR FECHADO ARQUITETURALMENTE (release 0.7.0, 2026-05-13).** Motor κ multimodal (6 engines × geometria de overlap), Reconciliação UI (P2 cards + P3 workflow queue), Compare Coders (3 modes + drill-downs + perCode breakdown), Saved Comparisons hub, coder picker live, transport multi-coder remoto, CSV cross-coder isolation, set-valued labels (Jaccard/MASI), per-modality enforcement (Camada 1). Total: ICR Slices 1-6 + E1-E5b + Fase C P0/P1 + refactor C + B4 Camada 1 entregues entre 2026-05-08 e 2026-05-13. 3580 tests verde. **Camadas 2 e 3** do framework ICR multifaceta (Bayesian annotation model + G-theory/MFRM) movidas pro bloco LLM — são peças do Framework Unificado ICR + LLM, não fazem sentido sem LLM coding ativo no plugin.
>
> **✅ 4 gaps intra-modality fechados 2026-05-13.** Todos resolvidos no release 0.7.0 (ver `BACKLOG.md §"ICR — Gaps descobertos em revisão de docs methodology"` pra detalhe). Listagem do que foi feito:
> 1. ✅ **`totalUnits` por engine** — `SourceSizeProvider` interface + Media (HTMLMediaElement.duration) + PDF (page char count via pdf.js) + CSV segment (cell text via DuckDB) + Composite delegating por engine. Fallback `max(range.to)` quando provider null. Possível absorção natural em Camada 2 BHM documentada nos headers.
> 2. ✅ **Resolução temporal parametrizável** — chip group `[1s][100ms][10ms]` no toolbar do Compare Coders, persiste em SavedComparison. Snap-to-int absorve ruído FP.
> 3. ✅ **Validação canônica α nominal contra Krippendorff 2018 cap. 11** — bateria de 5 testes canônicos. Descoberta colateral: pra δ_jaccard/δ_MASI a fórmula da literatura é δ² (não δ linear); migração aplicada, characterization tests recalibrados.
> 4. ✅ **`fromMs`/`from` renomeado** — `ReconciliationBounds.temporal` agora usa `from`/`to` em segundos (display `'1.5s–3.2s'`). `formatMs` consertado.
>
> **Status técnico real do bloco ICR:** arquitetura completa + apresentação correta + agregação metodologicamente fundamentada + cálculo interno alinhado à literatura canônica. Pronto pra Camada 2.

> **▶️ PRÓXIMO PASSO PRÁTICO** (não atacar sem brainstorm dedicado precedendo): **LLM-assisted coding com Camada 2 ICR como par natural**. Ordem cravada (ver §"Framework Unificado ICR + LLM" abaixo): primeiro item LLM = **`generateCodebook`** (era último, foi invertido — feature mais transversal exercita motor de ponta a ponta e gera massa pra Camada 2 treinar). LLM coding **não entra sem Camada 2** (Bayesian annotation model — Dawid-Skene/MACE/Paun et al. 2018). Decisão metodológica não-negociável documentada em `docs/ICR-MULTIMODAL-METHODOLOGY.md` (user-facing) e Research em `docs/_research/icr-multimodal-heterogeneous-units.md` (pesquisa autoritativa).

> **🔬 Virada conceitual 2026-05-13 — Framework Unificado ICR Multifaceta + LLM:** heterogeneidade de modalidade (B4 original) e heterogeneidade de coder (humano vs LLMs) **são o mesmo problema estrutural** — facetas no desenho de medida. Frame matemático único cobre os dois (G-theory multivariate, MFRM, Bayesian hierarchical annotation). Plugin posiciona-se como **bench de avaliação rigorosa de LLM como coder em QDA multimodal** — categoria que não existe no mercado. Pesquisa autoritativa em `docs/_research/icr-multimodal-heterogeneous-units.md` (395 linhas, 30+ refs); síntese user-facing em `docs/ICR-MULTIMODAL-METHODOLOGY.md`. Detalhe operacional em §"Framework Unificado ICR + LLM" abaixo.

> **📘 Entry point pra análise externa:** `docs/PROJECT-OVERVIEW.md` — tour profundo por 3 camadas (produto, método, implementação) com ordem de leitura prescrita. Criado 2026-05-13 pra evitar análise superficial de LLMs externas via GitHub.

> **📄 Visão integrada de produto (2026-05-08, navegação fragmentada):** entry point é `obsidian-qualia-coding/plugin-docs/research/INDEX-2026-05-08.md`. Docs filhos focados: `ICR-MATERIA-2026-05-08.md` (caminhos materializados), `LLM-MATERIA-2026-05-08.md` (em movimento — não cravado), `RELACOES-ICR-LLM-2026-05-08.md` (interdependências), `QUALIA-CORE-VISION-2026-05-08.md` (vision separada do plugin). Ordem cravada: **ICR → LLM → Analytics**; pitch **plugin = QDAS standalone**, **plugin + Qualia Core = QDMMAS sério**.

> **🔧 Infra compartilhada — caminhos cravados (2026-05-09):** ICR é **infra compartilhada primeiro** — base estrutural que destrava simultaneamente ICR multi-coder, merge de projetos, multi-coder live, handoff com procedência, audit estruturado. Decisões cravadas: schema híbrido `Coder` + `CoderRun`; hash por source como primitiva arquitetural transversal; ICR multimodal **como destino arquitetural** (função pura κ paramétrica por geometria de overlap — recebe adapters por engine sem refactor); sequência **Fase B (in-plugin) → Fase C (P2 transport remoto)**. Detalhe completo em §"Decisões de produto abertas" abaixo.

**Versão atual:** **0.7.0** (2026-05-13) — bloco Image engine fechado + 4 gaps intra-modality ICR + canvas refresh cor cross-engine + cluster.worker async + `!important` podado 68→46. **0.6.0** (2026-05-13) — ICR fechado arquiteturalmente (B4 Camada 1 per-modality + vacuous fixes). **0.5.0** (2026-05-13) — Refactor C set-valued labels (Jaccard/MASI + Cohen caminho A + Fleiss fallback). **0.4.2** (2026-05-08) — LazyTextFilter sem flash branco + MCA Biplot fix.

**Infra que a Fase 6 estabeleceu (não é só "abrir parquet grande"):**
- DuckDB-Wasm + Worker + Blob URLs → reusável pra LLM provider (Ollama/OpenAI/Anthropic) e Whisper transcription
- OPFS streaming → cache local pra modelos ML baixados
- `getFilteredSourceRowIds` + predicate builder tabular → prompt-target pra LLM tabular
- `sourceRowId` estável → anchoring de LLM em tabular sobrevive a sort/filter
- Audit log central + memo schema cross-entidade → "AI source" tracking + "memo-as-prompt" sem schema novo
- Bundle 14MB → distribuição via Community Plugins viável
- `mergePolicies` puro → merge LLM batch em codebook existente

**Ordem cravada (visão integrada 2026-05-13): ICR ✅ → LLM (+ ICR Camada 2 par natural) → Analytics.**

Estado das três frentes em 2026-05-13 (release 0.7.0):

### Frente 1 — ICR ✅ FECHADA (2026-05-13, release 0.6.0 arquitetura + 0.7.0 gaps intra-modality)

Motor κ multimodal (6 engines × geometria de overlap), Reconciliação UI (P2 cards + P3 workflow queue + κ pré/pós + export), Compare Coders View (3 modes + drill-downs + perCode breakdown), Saved Comparisons hub, coder picker live, transport multi-coder remoto, CSV cross-coder isolation, set-valued labels (Jaccard/MASI distance + Cohen κ caminho A + Fleiss fallback), per-modality enforcement (Camada 1 framework multifaceta). **Zero itens em aberto.** Lista canônica abaixo (§"🧱 ICR — Itens em aberto") tem todos os items marcados ✅. **Camadas 2 e 3 do framework multifaceta** (Bayesian annotation model + G-theory/MFRM) movidas pro bloco Framework Unificado ICR + LLM — fazem sentido só quando LLM coding entrar.

### Frente 2 — LLM-assisted coding ▶ PRÓXIMA PRIORIDADE (com ICR Camada 2 como par natural)

Pesquisa de mercado em `docs/_study/llm-coding/` (40 ferramentas + 5 patterns analisados). **Pesquisa metodológica complementar** em `docs/_research/icr-multimodal-heterogeneous-units.md` (2026-05-13, 30+ refs) cravou LLM como coder = problema de heterogeneidade de coder, estruturalmente idêntico à heterogeneidade de modalidade — Bayesian annotation model (Dawid-Skene 1979 / MACE / Paun et al. 2018) é a tradição matemática que resolve. **Doc autoritativo de design:** `obsidian-qualia-coding/plugin-docs/research/LLM-MATERIA-2026-05-08.md` (caminhos materializados) — releitura gera ideias novas (em movimento), mas decisões abaixo cravadas.

**Decisões cravadas (LLM-MATERIA §2 + §4 + ICR-MULTIMODAL-METHODOLOGY 2026-05-13):**
- **Posicionamento:** plugin = bench de avaliação rigorosa de LLM como coder em QDA multimodal. Categoria nova (não existe no mercado). "Qual das 5 escolas filosóficas" é **não-decisão** — operações primitivas substituem framework de escolas (pesquisador intercambia escolas mid-workflow). Não competir com NVivo/ATLAS.ti via "tem AI também".
- **Camada 2 BHM não-negociável.** LLM coding não entra sem fundamento Bayesiano.
- **Plugin não embute LLM.** Config aberta do user. Sem default. Plugin funciona sem provider — features AI invisíveis sem config.
- **Use case primário:** texto fluido (markdown + PDF) + tabular (CSV/Parquet) em paralelo. Mídias (image/audio/video) V2.
- **Provider strategy generalizada (3 canais):** LLM provider (Ollama/OpenAI/Anthropic) + Qualia Core (backend Python local) + Whisper/sentiment. Pattern uniforme: detect via settings.
- **Granularidade revisão humana:** opções na UI (per-segment / per-batch / per-run) — user escolhe.
- **Schema:** `codedBy` unificado já existe (do ICR). `coderId` display + `coderRun` config completa no audit. Sem schema novo.
- **Memo-as-prompt:** consequência arquitetural do schema #25 (description + memo em todas entidades). Sem feature nova.
- **Verbatim verification:** não-negociável. Pure helper `verifyQuoteInSource(quote, fileId, engine)` reusando `pdfPlainText` + `vault.read`. Defesa contra hallucination.
- **5 operações primitivas de coding cravadas:** `suggestCode` (segment + contexto → 1-3 sugestões inline), `generateCodebook` (corpus → codes + segments + memos bottom-up), `applyBatch` (codebook + corpus → CodeApplication[] em staging), `searchSemantic` (NL query → embedding → segments, sem LLM no caminho de resposta), `searchAndSuggest` (RAG: pergunta NL → segments + codes na mesma resposta).
- **Ordem invertida:** gerador (`generateCodebook`) primeiro (era último). Exercita motor end-to-end + gera massa pra Camada 2.
- **Text Retrieval = casa do retrieval semântico.** View Analytics atual ganha toggle `Literal | Semântico | Q&A`. Smart Codes vira ponte entre predicate AST (determinístico) e retrieval (semântico).
- **AI Lab Nível 1 (multi-LLM compare):** pesquisador roda Gemini + GPT + Claude sobre mesmo corpus, compara via indicadores (cosine + Fleiss + pairwise + self-consistency). Reusa P1 do ICR. Nível 2 (LLM-as-judge) + Nível 3 (LLM orquestrador) = especulação registrada, não cravado.

**Ainda em aberto (não bloqueia início):**
- Quais das 5 operações entram primeiro (decisão editorial — ordem cravou `generateCodebook` primeiro, mas sequência das outras é discutível)
- Como cada operação se manifesta na UI (Margin Panel inline vs Text Retrieval expandido vs comando palette)
- Visibilidade de AI features sem provider (invisível / grayed out com tooltip / híbrido)
- Operacionalização da Camada 2 BHM (qual modelo Bayesiano específico, qual lib JS, computação onde — main thread / worker / Qualia Core)
- Forma concreta do AI Lab Nível 1 (view dedicada? extensão do Compare Coders?)

**Brainstorm dedicado precede spec.** Pesquisa de mercado em `qualia-fit.md` informa; LLM-MATERIA tem os caminhos materializados; brainstorm cravas as ordens e UX antes de virar plano de implementação.

### Frente 3 — Analytics (extensões + redesign)

Cobertura atual = **25 modes ativos** em `src/analytics/views/modes/` (frequência, cooccurrence, code evolution, temporal, lag sequential, MCA biplot, dendrogram códigos, files dendrogram, file similarity, MDS files, source comparison, code × metadata, codebook timeline, memo view, doc-code matrix, network graph, chi-square, decision tree, overlap, polar, relations network, text retrieval, text stats, word cloud, dashboard KPI). Q-mode 100% coberto. **Gap aberto:** Routledge Tier 1/2/3 (catalogado em `CONSOLIDACAO-PRODUTO-2026-05-08.md §2.3, §6.2, §6.3`) + redesign UI pesado. Atacar **depois** de LLM coding (que vai exercitar Analytics como consumer de markers gerados — Text Retrieval mode em particular vira casa do retrieval semântico).

### Outras frentes em decisão de produto

- **Projects** — isolar determinados arquivos do vault como escopo de análise (não vault inteiro). Em pensamento, precisa brainstorm antes — ver §Projects nos detalhes.
- **Margin Panel customization** — bloqueado por decisão em plugin externo.

**Frentes encerradas recentemente:** Coding Management Tier 1+2 ✅ (2026-04-28) · Tier 3 Smart Codes ✅ (2026-05-04) · Analytics enhancements ✅ · Research Board Enhancements ✅ (2026-04-29) · Memos Phase 1+2+3 ✅ (2026-04-30) · **Parquet-lazy Fases 0-6 ✅ (2026-05-03/04)** · **Q-mode gaps S0+S1+S2+S3 ✅ (2026-05-04)** · **ICR Slices 1-6 motor κ multimodal ✅ (2026-05-09)** · **ICR Slices E1+E2+E3a+E3b+E4+E5a+E5b ✅ (2026-05-10/11)** · **Fase C P1 UX layer ✅ (2026-05-10)** · **Coder picker live ✅ (2026-05-11)** · **CSV cross-coder ✅ (2026-05-12)** · **ICR mecânico (A1-A4 + B1-B3 + D + dedup motor) ✅ (2026-05-12)** · **Smart Codes leaf `textContains` ✅ (2026-05-12)** · **Refactor C set-valued labels ✅ release 0.5.0 (2026-05-13)** · **B4 Camada 1 per-modality enforcement ✅ release 0.6.0 (2026-05-13)**.

**Bloqueadores no `BACKLOG.md`:** zero.

---

## 🧱 ICR — Itens em aberto

**Zero itens em aberto.** Lista canônica zerou 2026-05-13 com a entrega de B4 (Camada 1) + Refactor C (set-valued labels) + Slice D (Tabular ZIP coder). Detalhe historiográfico das slices (A1-A4, B1-B4, C, D + slices 1-6 motor + E1-E5b UI + Fase C P0/P1) preservado em **[ROADMAP-HISTORY.md](ROADMAP-HISTORY.md)**.

Próximas frentes ICR = **Camada 2 (Bayesian annotation model) + Camada 3 (G-theory/MFRM)** — viraram peças do bloco LLM/Framework Unificado (ver §"Framework Unificado ICR + LLM" abaixo).

**Quando atacar item futuro que toque scope/cache/extract, releitura obrigatória de TECHNICAL-PATTERNS §35-§46 — ver CLAUDE.md §8.**

---

## 🗺️ Áreas de trabalho

Sem ordem imposta — agrupamento temático pra varredura. Decisões de execução ficam com o user.

| Área | O que tem aberto |
|------|------------------|
| **[Analytics](#3-analytics--melhorias)** | Routledge Tier 1/2/3 + redesign UI pesado. Atacar **depois** de LLM (ver Frente 3 acima) |
| **[Margin Panel](#4-margin-panel--melhorias)** | Customization · Resize Handle. **Bloqueado** por decisão em plugin externo |

---

## ❓ Decisões de produto abertas

Sem ordem — precisam validar **se** e **como** existem antes de virar sessão.

- ~~**Parquet/CSV lazy loading**~~ ✅ **FEITO 2026-05-04** — todas as 7 fases entregues. Stack final: DuckDB-Wasm + OPFS + AG Grid Infinite. Doc autoritativo `docs/parquet-lazy-design.md` preservado como referência arquitetural / post-mortem. Estendido em 2026-05-07 com tabular virtual cols (release 0.4.0) + 2026-05-08 com Code Explorer perf + Export multi-file fallback
- **[LLM-assisted coding](#llm-assisted-coding)** — decisões fundacionais cravadas (ver Frente 2 acima + `LLM-MATERIA-2026-05-08.md §2 + §4` + virada 2026-05-13). Posicionamento = bench rigoroso de LLM como coder em QDA multimodal. "Qual escola filosófica" virou não-decisão. Próximo passo prático = brainstorm dedicado pra cravar ordem das operações + manifestação UI + operacionalização Camada 2 BHM. Pesquisa de mercado em `docs/_study/llm-coding/` (40 tools + 5 patterns) preservada como repertório.
- ~~**Infra compartilhada — ICR + merge + multi-coder + handoff**~~ ✅ **TODOS ENTREGUES 2026-05-09 → 2026-05-13.** 13 slices: motor κ multimodal (Slices 1-6), Compare Coders UI (Slices E1-E5b), Fase C P0/P1 transport remoto + UX, coder picker live, CSV cross-coder, set-valued labels (Refactor C), Camada 1 per-modality (B4). 8 das 8 engines cobertas. 3580 tests verde. Detalhe completo das 13 slices + decisões cravadas em **[ROADMAP-HISTORY.md](ROADMAP-HISTORY.md)**.
- ~~**Sync e colaboração multi-coder**~~ ✅ **ENTREGUE 2026-05-10** — Fase C P0 (transport puro, Slice 3) + Fase C P1 (UX layer com ItemView `qc-icr-import`). Pesquisa de infraestrutura (Obsidian Sync, GDrive, GitHub, ad-hoc) fora do plugin — escolha do pesquisador. Doc: `plugin-docs/research/Sync — Caminhos de infraestrutura.md`.
- **[Projects](#projects)** — isolar **determinados arquivos do vault** como escopo de análise (não vault inteiro). Em pensamento, não cravado — vault pessoal pode misturar journals/notas com parte analítica.
- ~~**Research Board Enhancements**~~ ✅ todos 4 sub-items resolvidos (Sync com registry, Refresh, Export PNG/SVG, Drag do Code Explorer).
- ~~**Tabular round-trip (import)**~~ ✅ fechado 2026-04-30, ver "Decisões fechadas sem implementar".
- ~~**Convert memo to note**~~ ✅ **TUDO ENTREGUE 2026-04-30** — Phase 1 (Code) + Phase 2 (Group + Marker + Relation) + Phase 3 (command "Materialize all memos"). 4/4 tipos materializam memo.

---

## Detalhes — roadmap

### 2. Coding Management

**Contexto:** 4 ondas já entregues (Code Groups, Code × Metadata, Memos em todas entidades, Analytic Memo View). Gestão de códigos é foco grande do projeto.

**Tier 1 — UX moderna pra escalar codebook:**

| Feature | O que faz | Pré-req |
|---|---|---|
| ~~**Multi-select no codebook**~~ | ~~Cmd/Shift+click + bulk delete via Delete key ou right-click~~ | ✅ FEITO 2026-04-28 — ver registro #27 |
| ~~**Bulk operations**~~ | ~~Move folder, add group, recolor, **rename** (Add before / Add after)~~ | ✅ FEITO 2026-04-28 — ver registro #28 |
| ~~**Drag-drop inter-groups**~~ | ~~Arrastar código → chip do group adiciona membership; drag pra zona vazia da árvore com filter ativo remove do group ativo~~ | ✅ FEITO 2026-04-28 — ver registro #26 |

> **Nota — Bulk rename (UX discutida 2026-04-27):** seleciona N códigos no codebook → modal com 2 campos ("Add before" + "Add after") + preview da lista antes/depois + apply. Sem regex, sem find/replace. Caso de uso típico: codebook iterativo onde 30 códigos `theme:X` viram `Wellbeing > X` por adicionar prefixo em lote. Versão regex/find-replace foi descartada como overkill — UX simples cobre o caso real.

**Tier 2 — polish do codebook como artefato vivo:**

| Feature | O que faz | Notas |
|---|---|---|
| ~~**Code stability tracking** (audit log)~~ | ~~Log central de operações por código com timeline + export markdown + soft delete por entry~~ | ✅ FEITO 2026-04-28 — ver registro #29. Storage central (Opção B), coalescing 60s pra description/memo, soft-delete reversível, export inclui hidden (curadoria visual ≠ documento exportado) |
| ~~**Code merging avançado**~~ | ~~Merge interativo: preview rico, escolher nome+cor mantido, política explícita pra memos/descriptions~~ | ✅ FEITO 2026-04-28 — ver registro #30. MergeModal expandido com 4 seções reativas (Name, Color, Description, Memo) + preview rico + pre-flight collision check; helpers puros em `mergePolicies.ts`. Tier 2 fechado. |

**Tier 3 — Smart Codes** ✅ **FEITO 2026-05-04** (branch `feat/smart-codes`):

| Feature | Estado |
|---|---|
| ~~**Smart Codes (saved queries)**~~ | ✅ FEITO 2026-05-04 — branch `feat/smart-codes`, 19 commits, 107 testes novos. Spec em `plugin-docs/archive/claude_sources/specs/20260504-smart-codes-design.md`, plan em `plugin-docs/archive/claude_sources/plans/20260504-smart-codes.md` (workspace externo). |

**Implementação:** schema completo (PredicateNode AST com 10 leaves: hasCode, caseVarEquals, caseVarRange, magnitudeGte/Lte, inFolder, inGroup, engineType, relationExists, smartCode nesting), evaluator puro com short-circuit + cycle detection (`src/core/smartCodes/evaluator.ts`), SmartCodeCache singleton com invalidação granular + computePreview + chunked compute (`cache.ts` + `matcher.ts`), SmartCodeApi CRUD + autoRewriteOnMerge + diffPredicateLeaves + rewriteCodeRef (`smartCodeRegistryApi.ts`), builder modal row-based linear com preview live <300ms + Smart Code Detail + List hub modal acessível via command palette (`Smart Codes: Open hub` + `Smart Codes: New`), audit log estendido com `entity?: 'code' | 'smartCode'` discriminator + 5 sc_* event types com coalescing (60s text edits + Set union pra predicate edits), ⚡ icon na Codebook Timeline, export QDPX bloco `<qualia:SmartCodes>` namespace custom + import 2-pass (alocar IDs → resolver refs incl. nesting), CSV tabular `smart_codes.csv` com `predicate_json` + README R/Python snippets condicionais. **Stress:** 10k markers + 100 smart codes em <1s.

**Pendente (Phase 2, não bloqueante):** integração em Analytics modes (frequency/cooccurrence/etc) + sidebar adapters por engine + emit granular `qualia:markers-changed` em modelos pra invalidação cirúrgica do cache. Funcionalidade core está acessível via SmartCodeListModal sem essas integrações.

### 3. Analytics — melhorias

| Item | Esforço | Detalhe |
|------|---------|---------|
| ~~**Multi-tab spreadsheet export**~~ | Médio | ✅ FEITO 2026-04-28 — ver registro #32. Export `qualia-analytics-YYYY-MM-DD.xlsx` com até 20 abas (1 por mode). |
| ~~**Codebook timeline central**~~ | 4-5h MVP / 7-9h full | ✅ FEITO 2026-04-28 — ver registro #31. Full version (stacked bar + lista + filters + export) implementada. |

> **Nota — Relations Network edge bundling (FDEB/HEB):** cogitado e descartado. Curvas de Bézier atuais cobrem grafos típicos; só faria sentido se grafo realista virasse muito denso (50+ edges). Reabrir só se a dor visual aparecer.

### 4. Margin Panel — melhorias

**⚠️ Dependência externa**: aguarda decisão em outro plugin (não-mexido). Só atacar depois de definir tratamento lá.

Dois sub-itens com dívida técnica compartilhada (`scrollDOM stacking context` — `handleOverlayRenderer.ts` já ocupa scrollDOM com z-index 10000+ pra drag handles de markers; os dois itens precisam coexistir no mesmo container):

#### 4a. Margin Panel Customization (ex-#11)

- Setting `margin.side: 'left' | 'right'` (posição hoje hardcoded à esquerda)
- Visual: espessura da barra, estilo de ticks, opacidade — constantes hardcoded hoje em `marginPanelExtension.ts`
- Estimativa: 1-2h

#### 4b. Margin Panel Resize Handle (ex-#17)

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

## Detalhes — frente viva

### Histórico movido pra ROADMAP-HISTORY.md (2026-05-13)

Seções condensadas em **[ROADMAP-HISTORY.md](ROADMAP-HISTORY.md)** após cleanup pareado 2026-05-13:
- **Parquet/CSV lazy loading** (post-mortem das 7 fases entregues 2026-05-03/04) — doc autoritativo permanece em `docs/parquet-lazy-design.md`
- **LLM-assisted coding detalhada** (repertório 2026-05-01: 5 escolas filosóficas, S/M/L/XL patterns, 5 perguntas brainstorm — todas processadas pela virada 2026-05-13, ver Frente 2 acima)
- **Intercoder Reliability detalhada** (repertório 2026-05-04: Ângulo A clássico Kappa/α vs Ângulo B auditabilidade interpretativa — postura substituída pelo Framework Unificado abaixo)
- **Q-mode / P-mode analytics** (era frente #1 em 2026-05-04, absorvida em Frente 3 Analytics — gaps S0+S1+S2+S3 ✅)
- **Analytical Memos design A/B/C/D** (todas Phase 1+2+3 entregues 2026-04-30 com Design D Hybrid)
- **§Implementados registro** (linha-a-linha de #1-#36 entregues — CHANGELOG.md cobre por release)
- **§ICR Itens em aberto** historiografia das 13 slices (Slices 1-6 + E1-E5b + Fase C P0/P1)

### Framework Unificado ICR + LLM (cravado 2026-05-13)

**Origem:** pesquisa em `obsidian-qualia-coding/Research/ICR Multimodal - Unidades Heterogeneas.md`. Heterogeneidade de modalidade e heterogeneidade de coder são o mesmo problema estrutural — facetas no desenho de medida. Frame matemático único (G-theory multivariate; MFRM; Bayesian hierarchical annotation models) cobre ambos.

**Camadas, em ordem de adoção:**

1. **Camada 1 — per-modality enforcement** (B4, correção pequena, hoje sem LLM): nunca pooled cross-engine como métrica primária. Tabela κ/α por modalidade é fonte de verdade. Já tem chip per-engine; falta enforce explícito.

2. **Camada 2 — Bayesian annotation model** (Dawid-Skene 1979, MACE 2013, Paun et al. 2018): entra **JUNTO** com a primeira implementação de LLM. Razão cravada: LLM sem Camada 2 é "auto-code button" sem fundamento — exatamente o uso que rebaixa o plugin a commodity AI. Com Camada 2, LLM vira coder com competência estimada, identificação de spammer/hallucination via fit statistics, e comparação rigorosa humano vs LLM. **Não-negociável: LLM coding não entra no plugin sem Camada 2.**

3. **Camada 3 — G-theory multivariate ou MFRM** (Brennan 2001 cap. 9; Eckes 2015): refactor sério, opt-in research-grade. Decomposição completa de variância em facetas (rater, modalidade, tipo de coder, item). Diagnóstico — não só métrica. Atacar quando houver corpus real com humano + N LLMs + 2+ modalidades pra exercitar.

**Posicionamento de produto que isso destrava:** plugin não compete com NVivo/ATLAS.ti via "tem AI também" (commodity em 12-24 meses). Compete via **rigor metodológico pra estudar AI em coding** — categoria que não existe no mercado. Audiência ampliada: pesquisador QDA mixed methods + comunidade NLP de LLM evaluation (campo crescente 2023+).

**Ordem do roadmap LLM invertida vs versão anterior:** gerador de código/segmento (era item por último) **vira primeiro**. Razão: feature mais transversal — exercita motor de coding em texto/PDF/CSV/audio, gera output que passa por todo o pipeline (popover → registry → analytics → ICR Compare Coders), e dá massa real pra Camada 2 (sem LLM rodando, Bayesian annotation model não tem corpus pra treinar). Sub-features mais pontuais (memo-as-prompt, sugestão inline, etc.) ficam depois.

**Referências centrais** (todas em `obsidian-qualia-coding/Research/ICR Multimodal - Unidades Heterogeneas.md`):
- Dawid & Skene (1979) — EM iterativo pra estimar competência por anotador
- Hovy et al. (2013) MACE — Bayesiano, identifica spammers
- Paun et al. (2018) — survey comparando Dawid-Skene/MACE/multinomial/hierarchical (leitura de entrada)
- Vispoel et al. (2018) — Bayesian G-theory explícito
- Brennan (2001) — G-theory frequentista, cap. 9 multivariate
- Eckes (2015) — MFRM intro com modalidade como faceta

---

### Projects

**Em pensamento — não atacar sem brainstorm.**

Pergunta motriz: faz sentido isolar **determinados arquivos do vault** como escopo de análise (vs vault inteiro)? Hoje o plugin opera sobre vault inteiro — todos arquivos compatíveis viram fonte potencial. O vault do pesquisador pode ter notas pessoais / journals / refs de leitura misturadas com a parte sob análise.

**A verificar antes de virar feature:**
- Como exports (QDPX, Tabular CSV) lidam com escopo hoje — vault inteiro ou aceitam seleção?
- Code Explorer "Filter by file" + Analytics filters já chegam perto disso sem schema novo?
- Scoping por pasta resolve se o pesquisador organizar análise em subfolder?
- Vale schema explícito (`projects/<name>/`, frontmatter, codes compartilhados por ID) ou é redundância com o que já existe?

Não claro se faz sentido como feature explícita ou se a arquitetura atual já cobre.

### Research Board Enhancements

✅ **Todos 4 sub-items feitos.** Frase "3 abertos" era stale.

| Feature | Status |
|---------|--------|
| ~~**Sync com registry**~~ | ✅ FEITO — `boardReconciler.ts` (cor/nome/contagens em real time) |
| ~~**Context menu "Refresh"**~~ | ✅ FEITO — `reconcileBoard()` exposto via "Refresh on open" |
| ~~**Export board (PNG/SVG)**~~ | ✅ FEITO — `boardExport.ts` (PNG + SVG + bbox scene-coord) |
| ~~**Drag do Code Explorer pro board**~~ | ✅ FEITO 2026-04-29 — `handleDrop` em `boardView.ts:536` estendido pra aceitar raw codeId. Async reconcile preenche count/sources após drop. |

> **Export PDF dispensado** em #20 (2026-04-24) — SVG cobre o caso vetorial melhor sem adicionar dependência externa.
> **Templates pré-definidos** movido pra "Decisões fechadas sem implementar" em 2026-04-29 — board é canvas livre.

### Analytical Memos

> **⚠️ STATUS REAL (2026-05-13):** **Tudo entregue.** Phase 1 (#33 Code, 2026-04-30) + Phase 2 (#34 Group, #35 Marker, #36 Relation, 2026-04-30) + Phase 3 ("Materialize all memos" command, 2026-04-30). Design D (Hybrid) cravado e implementado. Conteúdo abaixo é repertório histórico do design A/B/C/D + custos + audiência. Sem item em aberto aqui.

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

## ⛔ Decisões fechadas sem implementar

Items que foram considerados, discutidos e **conscientemente dispensados**. Razão registrada pra evitar re-debate.

- **Full export do projeto (Parquet/JSON)** (fechado 2026-04-29) — coberto pela combinação atual: Tabular CSV zip pra análise externa (R/Python/BI) + REFI-QDA (QDPX) pra interop com Atlas.ti/NVivo/MAXQDA + `data.json` pra backup/restore. Não há caso de uso identificado que ficou fora dessa combinação.
- **Board export PDF** (fechado 2026-04-24, ver #20) — SVG nativo do Fabric cobre o caso vetorial melhor sem adicionar dependência externa de PDF lib (~100KB+).
- **Board templates pré-definidos** (2x2 matrix, timeline, affinity diagram) (fechado 2026-04-29) — board é canvas livre; user recria qualquer layout em <1min com sticky notes. Inflexibilidade do template > economia de tempo. Manter biblioteca de templates é overhead.
- **Tabular round-trip (import)** (fechado 2026-04-30) — reimportar zip de CSVs do tabular export. Registrado como decisão aberta junto com a spec do export (2026-04-22) e listado nos "Não-objetivos" da spec original (export-only foi decisão deliberada, não esquecimento). Os 3 use cases hipotéticos (Excel bulk edit / colaboração CSV / merge de codings externos) cada um redefine o shape do import — atacar antes de uma decisão pai cravar = trabalho especulativo. Excel bulk edit já coberto pelo Codebook UI (rename/recolor/move/group em bulk). Colaboração entre vaults coberta por QDPX (schema com sources embutidas, round-trip integrity validada). Merge de codings externos amarra na decisão de **LLM-assisted coding** (que define o shape de "trazer applications novos sobre segments existentes") e potencialmente em **Intercoder Reliability** (que define se o shape é merge incremental ou import paralelo como snapshot). Tabular zip foi feito explicitamente como ramo de **análise externa** (R/Python/BI), não interop interno — não há fluxo claro de "o que volta de R pro plugin". Reabrir só quando LLM-assisted coding ou Intercoder Reliability decidirem entrar e o shape do import ficar definido por eles.


## Fontes

Este roadmap consolida (arquivos originais já arquivados):
- `memory/hierarchy-plan.md` — plano de Code Hierarchy
- `docs/csv/TODO.md` — Parquet + features Saldaña
- `docs/analytics/ROADMAP.md` — Analytics enhancements
- `memory/board-roadmap.md` — Research Board open ideas
- `docs/markdown/ARCHITECTURE.md` — Phases 3-5 (per-code decorations, projects, power features)
- `docs/markdown/POC-RESIZE-HANDLE.md` — Resize handle POC
- `docs/markdown/COMPONENTS.md` — FuzzySuggestModal opportunity
