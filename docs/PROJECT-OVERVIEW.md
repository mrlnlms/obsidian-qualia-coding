# Qualia Coding — Tour profundo do projeto

> **Audiência:** analista externo (humano ou LLM) que precisa entender o projeto em profundidade real, não em skim. Cobre 3 camadas — produto, método, implementação — com referências cruzadas pros docs detalhados.
>
> **Instrução de leitura (importante):** este doc é o **entry point único**. Leia inteiro antes de abrir outros arquivos. A ordem cravada de aprofundamento está no fim — siga ela. Não pule pra docs específicos antes de internalizar os 3 níveis abaixo.

---

## Camada 1 — Produto

**O que é.** Qualia Coding é um plugin Obsidian de análise qualitativa de dados (QDA) multimodal. Roda local no vault do pesquisador (Mac/Windows), open source MIT. Cobre 6 modalidades de coding (markdown, PDF text, PDF shape, imagem, audio, video, CSV segment, CSV row, Parquet read-only) com codebook unificado e analytics próprios. Status: release `0.5.0` (2026-05-13), zero usuários, pré-publicação na Obsidian Community Store.

**Audiências reais (3 públicos distintos).**

1. **QDA acadêmico tradicional** — pesquisador de mixed methods, content analysis, behavioral observation, conversation analysis. Quer alternativa local-first e open source a NVivo ($600/ano), ATLAS.ti, MAXQDA. Plugin atende isso com 16+ analytics modes nativos, REFI-QDA round-trip verificado, e ICR rigoroso.

2. **UX research / product research** — quem analisa export de Hotjar, comments de usuários, categorização de problemas em CSV. Audiência **3-4× maior em volume** que QDA acadêmico. Dor concreta: Excel/Sheets exigem one-hot encoding manual pra códigos múltiplos por row; ferramenta especializada local não existe (Dovetail é SaaS caro, NVivo/ATLAS.ti tratam tabular mal). Plugin com `codes per cell` + Smart Codes (saved queries com AST) + analytics próprios cobre essa dor desatendida.

3. **Multimodal analysis** (linguistics, conversation analysis, behavioral observation) — nicho rigoroso, poucos competidores capazes. ELAN/ANVIL têm estrutura técnica madura mas zero epistemologia QDA; NVivo/ATLAS.ti têm epistemologia mas estrutura técnica fraca em modalidades não-textuais. Plugin opera no cruzamento.

**Posicionamento de produto cravado (2026-05-13).** Plugin não compete via "tem AI também" — commodity em 12-24 meses. Posiciona-se como **híbrido de NLP/speech multimodal annotation + epistemologia QDA**: estrutura de dados tipo AMI/MUMIN/ELAN combinada com memo + relations + magnitudes + audit trail + open coding característicos de QDA. Categoria que não existe no mercado.

**Diferenciadores estabelecidos** (validados via deep research em 40 ferramentas, ver `docs/_study/llm-coding/`):
- Único CAQDAS que cobre os 6 formatos com motor κ unificado
- Citation-anchoring nativo em todos os formatos (offsets/markers persistentes)
- Vault-as-git (versionamento, audit trail, privacy local)
- Parquet/DuckDB-Wasm em escala (297MB load instantâneo) — único CAQDAS com isso
- REFI-QDA round-trip verificado (não só export, importa de volta de NVivo/ATLAS.ti/MAXQDA/Dedoose)
- Memo (reflexão analítica processual) cross-entidade — base pra "memo-as-prompt" quando LLM coding entrar

---

## Camada 2 — Método (a parte que diferencia em paper)

**A virada conceitual de 2026-05-13.** Pesquisa em metodologia de Inter-Coder Reliability (ICR) cravou que o plugin opera em território de fronteira: ICR multimodal completo + LLM como coder dentro do framework matemático. **Heterogeneidade de modalidade e heterogeneidade de coder (humano vs LLMs) são o mesmo problema estrutural** — facetas no desenho de medida. Tradição matemática que resolve: Generalizability Theory (Brennan 2001), Many-Facet Rasch Measurement (Linacre, Eckes), Bayesian hierarchical annotation models (Dawid-Skene 1979 / MACE / Paun et al. 2018). **Documentação user-facing completa em `docs/ICR-MULTIMODAL-METHODOLOGY.md` — entry point conceitual.**

**Framework de 3 camadas (sequência de adoção):**

1. **Camada 1 — per-modality enforcement** (em implementação, branch `b4-camada-1-per-modality`). Plugin nunca renderiza κ pooled cross-modality como métrica primária. Reporta tabela κ/α por modalidade, alinhado com prática consolidada de AMI Corpus, MUMIN, NEUROGES, ELAN. Fundamentação: Krippendorff (2018), Artstein & Poesio (2008), Mathet et al. (2015) — pool entre δ heterogêneas não é definido na literatura.

2. **Camada 2 — Bayesian annotation model com LLM como faceta** (planejada, par natural com LLM coding). Quando o plugin oferecer LLM coding, LLM entra como **coder no framework Bayesian** (Dawid-Skene + MACE), não como "AI feature". Modelo estima competência por coder por modalidade, identifica LLM em modo hallucination via fit statistics, e produz comparação rigorosa humano vs LLMs. **Decisão cravada não-negociável: LLM coding não entra no plugin sem Camada 2.** Razão: LLM sem fundamento Bayesiano vira "auto-code button" sem rigor — exatamente o uso comoditizado que rebaixa o produto.

3. **Camada 3 — G-theory multivariate ou MFRM** (research-grade opcional). Decomposição completa de variância em facetas (rater × modalidade × tipo de coder × item). Diagnóstico de fontes de unreliability, não só métrica.

**Implementações já entregues que sustentam o método:**
- Motor κ multimodal (6 engines × geometria de overlap apropriada — char-range, bbox 2D via IoU+Hungarian, intervalo temporal, categorical)
- 5 coeficientes (Cohen κ caminho A, Fleiss κ com fallback, Krippendorff α paramétrico em δ, cu-α, α-binary)
- Set-valued labels (refactor C, release 0.5.0) — multi-código por marker com δ Jaccard/MASI
- Compare Coders View com 3 modes (matriz, tabela, heatmap) + drill-downs
- Reconciliação UI completa (P2 cards + P3 workflow queue + κ pré/pós)
- Transport multi-coder remoto com cross-vault remap

**Origens disciplinares.** QDA estrito (Strauss, Charmaz, Saldaña) é cético de reliability quanti e historicamente não produziu nada disso. Métodos são importados de **5 tradições adjacentes**: educational measurement (G-theory, MFRM), content analysis (Krippendorff α), computational linguistics (γ de Mathet, Artstein & Poesio), speech/HCI (AMI Corpus, MUMIN), clinical observation (ICC). Posição defensável em paper: plugin opera **num cruzamento de tradições importadas**, não numa tradição QDA estrita.

---

## Camada 3 — Implementação real (o que está construído)

**Stack.** TypeScript strict, build via esbuild 0.25, plugin Obsidian (min 1.5.0, desktop only). Vitest + jsdom pra testes unitários (3537+ tests, 252 suites). WebdriverIO + Obsidian real pra e2e (66 tests, 19 specs). DuckDB-Wasm + OPFS pra Parquet lazy. Web Worker inline (bundled via plugin esbuild + Blob URL) pra compute pesado de κ. CodeMirror 6 pra decorations no editor markdown.

**Arquitetura (alto nível, detalhe em `docs/ARCHITECTURE.md`).**
- `src/core/` — motor: registries (CodeDefinitionRegistry, SmartCodeRegistry, comparisonRegistry, sourceHashRegistry), tipos, helpers puros
- `src/core/icr/` — motor κ multimodal (8 coeficientes, 6 adapters per-engine, Web Worker, reconciliação)
- `src/markdown/`, `src/pdf/`, `src/image/`, `src/csv/`, `src/audio/`, `src/video/` — engines per-formato, padrão `EngineRegistration<Model>`
- `src/analytics/` — 16+ analytics modes (Frequency, Cooccurrence, MCA, MDS, Dendrogram, etc.)
- `src/smartCodes/` — saved queries com AST (11 predicate leaves + boolean operators), cache incremental
- `src/researchBoard/` — canvas espacial pra investigação visual

**Padrões técnicos cravados (regras de operação).**
- Caches granulares com `dependencyExtractor` pra invalidação cirúrgica (ver `docs/TECHNICAL-PATTERNS.md` §35-§46)
- Cross-coder isolation via `codedBy` em todo marker; filtros visuais NUNCA contaminam scope key (§46 — regra que regrediu 4× antes de ser cravada)
- Mutation events (`MarkerMutationEvent` + `onMarkerMutation`) como canal granular além de `onChange`
- Web Worker pattern pra compute pesado (κ multimodal cross-engine roda off-main-thread)

**Estado entregue (release 0.5.0 + working tree atual):**
- 3537+ tests verdes
- 6 release tags publicadas (0.1.0 → 0.5.0)
- ICR Slices 1-6 (motor κ multimodal) + E1-E5b (Compare Coders UI) + Fase C P0/P1 (transport multi-coder) + refactor C (set-valued labels) ✅
- Smart Codes Tier 1+2+3 ✅
- Parquet lazy Fases 0-6 ✅
- Q-mode analytics 100% cobertura ✅
- B4 Camada 1 em implementação ativa (branch `b4-camada-1-per-modality`)

**Dívida técnica conhecida (`docs/BACKLOG.md`).** Bloco ICR + Image + canvas refresh cor + `!important` poda — todos zerados em 2026-05-13 (release 0.7.0). BACKLOG hoje só tem won't-fix documentado + itens permanentes. Histórico de dívida resolvida em `docs/BACKLOG-HISTORY.md`. Nenhum bloqueador aberto.

**Filosofia operacional (CLAUDE.md do projeto).**
- "Expor funcionalidade primeiro, design de interação forte depois" — UI MVP por escolha, refactor de design fica pra fase dedicada quando capability estiver completa
- Zero usuários significa "muda default e pronto" — sem migration code, sem backcompat
- Smoke real no Obsidian a cada chunk de implementação (tests verde ≠ feito)
- LLM coding sem Camada 2 ICR é "auto-code button comoditizado" — não-negociável

---

## Ordem de leitura cravada (siga sequencialmente, não pule)

Esta sequência leva 30-45 min de leitura cuidadosa. Pular passos = análise superficial.

1. **`README.md`** — pitch externo, diferenciadores em uma página
2. **Este doc (`PROJECT-OVERVIEW.md`)** — você já leu até aqui ✓
3. **`CLAUDE.md`** — regras operacionais, status de produção zero usuários, princípios cravados (top priority section é leitura obrigatória)
4. **`docs/ROADMAP.md`** — ⚡ status atual no topo + §"Framework Unificado ICR + LLM" (a virada de 2026-05-13) + Frentes 1/2/3. Doc enxuto (309 linhas); arqueologia em `docs/ROADMAP-HISTORY.md`
5. **`docs/ICR-MULTIMODAL-METHODOLOGY.md`** — virada conceitual completa, Camadas 1/2/3, frase pronta pra paper, 30+ refs bibliográficas
6. **`docs/ARCHITECTURE.md`** — visão técnica, módulos, decisões arquiteturais
7. **`docs/TECHNICAL-PATTERNS.md`** — §35-§46 é onde estão os gotchas caros (4 regressões consecutivas viraram regra cravada)
8. **`docs/BACKLOG.md`** — dívida técnica organizada por tema, gaps reconhecidos
9. **Methodology docs específicos** (na ordem que o caso de análise exigir): `ICR-METHODOLOGY.md` (bbox), `ICR-SET-VALUED-METHODOLOGY.md`, `ICR-LINEAR-METHODOLOGY.md`, `ICR-TEMPORAL-METHODOLOGY.md`, `ICR-CATEGORICAL-METHODOLOGY.md`
10. **`docs/_research/icr-multimodal-heterogeneous-units.md`** — **pesquisa bruta** que cravou a virada conceitual; 30+ refs, análise das tradições importadas, unificação multimodal × multi-coder. Leitura obrigatória pra análise metodológica profunda
11. **`docs/_study/llm-coding/comparison.md` + `qualia-fit.md`** — pesquisa de mercado profunda (40 ferramentas + 5 patterns), só se for análise de produto/posicionamento
12. **`CHANGELOG.md`** — historiografia dos releases, contexto do que entregou quando

## Anti-padrões em análise externa (o que evitar)

- **Ler só README e responder.** README é pitch — perde a profundidade metodológica e o estado técnico real.
- **Saltar pros methodology docs sem o overview.** Sem entender as 3 audiências e o framework de 3 camadas, methodology fica descontextualizada.
- **Ignorar CLAUDE.md.** Tem decisões cravadas sobre o estado de produção (zero usuários, sem backcompat, paradigma expor-primeiro) que mudam o que faz sentido sugerir.
- **Confundir "MVP de UI" com "produto imaturo".** UI é MVP por escolha deliberada — capability tá completa, refactor de design é fase dedicada futura.
- **Tratar LLM coding como feature pendente isolada.** É par natural com ICR Camada 2 — análise que ignora essa relação propõe direções que o projeto já descartou explicitamente.

## Material complementar (workspace externo, gap parcial)

A pesquisa bruta que cravou a virada conceitual de 2026-05-13 agora está no repo público: [`docs/_research/icr-multimodal-heterogeneous-units.md`](_research/icr-multimodal-heterogeneous-units.md). 395 linhas com 30+ referências bibliográficas, análise crítica das tradições importadas, unificação multimodal × multi-coder, cubo 3D cenário × modalidade × indicador, e caminho operacional de 3 camadas. **Leitura obrigatória pra análise metodológica profunda.**

Continuam fora do repo público (workspace externo `obsidian-qualia-coding/`):
- `plugin-docs/research/CONSOLIDACAO-PRODUTO-2026-05-08.md` — visão consolidada de produto (Routledge Tier 1/2/3, gaps universais)
- `plugin-docs/archive/` — specs e plans arquivados pós-release
- `plugin-docs/research/INDEX-2026-05-08.md` — entry point pra pesquisa fragmentada

Se a análise precisar dessas peças, devem ser fornecidas separadamente.
