# Qualia Coding

Plugin Obsidian para analise qualitativa de dados (QDA). Codifica texto, PDF, CSV, imagens, audio e video.

---

## Communication Style
- Personal/solo project — NÃO injetar risk analysis, stakeholder concerns, ou enterprise-framing sem ser pedido.
- Brainstorm/alinhamento conceitual ≠ execução. NÃO pular pra escrever novos docs quando o user quer discutir.

(Tom geral: `~/.claude/CLAUDE.md` §Vocabulário banido + §Detector de frustração.)

## Grounding Rules
- Após context compaction, re-verificar que edits recentes persistiram antes de continuar.

(Não fabricar fatos + estimativas via git: `~/.claude/CLAUDE.md` §Não fabricar fatos + §Estimativas vêm SEMPRE do histórico.)

---


## ⛔ TOP PRIORITY — Comportamento exigido (não negociável)

Esta seção fica em primeiro lugar porque, sem ela, todo o resto vira teatro de progresso. Origem: review do user em 2026-05-05 sobre Smart Codes Tier 3 — 17 problemas técnicos que se acumularam por eu otimizar pra "parecer progredir" em vez de "entregar valor". Ler todo turno.

### 1. Tests verde ≠ feito. Smoke no Obsidian real é checkpoint OBRIGATÓRIO a CADA chunk

Vitest + jsdom validam contrato (input → output). Não validam: integração com runtime do Obsidian, padrão arquitetural do projeto, UX final, persistência cross-session. CLAUDE.md global tem isso cravado em "Furos sistemáticos" mas eu pulei toda sessão. Resultado: usuário descobre desastre cumulativo no fim.

**Regra operacional:** ao fechar cada chunk de implementação:
1. `npm run build` (produção, não dev)
2. Reload no Obsidian de teste (workbench)
3. Rodar AO MENOS UM cenário do que acabou de implementar
4. Capturar screenshot/comportamento observado
5. **Só depois** marcar chunk como done

Se pulou o smoke, o chunk não fechou. Não importa que testes verde. Não importa que typecheck passou. Não importa que reviewer aprovou.

### 2-7. Comportamento crítico — versões genéricas no global

Regras gerais agora em `~/.claude/CLAUDE.md` §Furos sistemáticos:
- §Antes de criar abstração nova, varrer projeto pelo padrão equivalente
- §"Pragmatismo"/"trade-off"/"não bloqueante" são red flags → STOP, reler (overlap com §Vocabulário banido)
- §Stub broken = bug, não roadmap
- §Self code review antes de commit (checklist de 6)
- §Reportar runtime real, não contagem
- §Quando user devolver review crítico, identificar padrão — não defender bug-a-bug

**Incidente Qualia que cravou (2026-05-05, Smart Codes Tier 3 review):** 17 issues técnicos acumulados por otimizar pra "parecer progredir" (19 commits, 175 testes) em vez de "entregar valor". User cortou: "por que vc se comporta assim?". Resposta certa = identificar **padrão de comportamento**, não bugs específicos. Esta seção (§TOP PRIORITY) é resultado disso.

**Refinement Qualia-específico:**
- Naming convention deste projeto: ver §Convencoes "Nomes padronizados" abaixo
- Antes de criar `Registry`/`Manager`/`Service`: grep em `src/core/` pelos equivalentes (`CodeDefinitionRegistry`, `CaseVariablesRegistry`, `SmartCodeRegistry`)
- Padrão Registry deste projeto: classe stateful com `addOnMutate(fn)`, `getById(id)`, `getAll()`, `toJSON()`, encapsulamento de `paletteIndex`

### 8. Antes de tocar cache/scope/algoritmo central — LER `TECHNICAL-PATTERNS.md §35-§46` ANTES do primeiro edit

Padrão recorrente (4+ sessões 2026-05): mexo em ICR/Smart Codes/Analytics, perf cai. Furo = não ler antes de editar.

**§46 é a regra cara:** `state.filters.visibleCoderIds` NUNCA entra no `scope.coderIds` que vai pra `extractInputsFromScope`. Filtros visuais aplicam DEPOIS via `filterInputsByCoders`; filtros de universo (inclusion/exclusion) aplicam ANTES.

**Releitura obrigatória por símbolo:**

| Vou mexer em… | Releitura |
|---|---|
| `extractInputsFromScope`, `cacheKeyForScope`, `reportKappa(Async)`, `reportPairwiseAsync` | §46 + §45 |
| `collectContestedRegions`, `categorizeRegionsByStatus`, `regionDerivation.*` | §46 + §40 |
| `MarkerMutationEvent`, `addOnMutate`, `applyMarkerMutation` | §37 + §39 |
| `SmartCodeCache`, `dependencyExtractor`, leaves de predicate | §38 + §39 |
| `markerTextCache`, `populateMarkerTextCacheForFile`, `RowProvider.batchGetMarkerText` | §35 + §36 |
| `bboxAdapter`, `bboxKappaInput`, `bboxMatcher`, Hungarian | §40 + §42 |
| Qualquer cache derivado novo | §39 + §35 |

**Checklist antes do commit:**
1. Filtro visual NÃO contamina cache key
2. Cache invalidation cirúrgica via `dependencyExtractor`/`MarkerMutationEvent` — nunca rebuild full
3. Compute pesado tem path async via Worker (§45)
4. Smoke real com corpus de tamanho real — trava 100ms+ = regrediu

**Sintoma:** "vou só meter este filtro aqui pra deixar mais limpo" — STOP, regressão §46.

---

## STATUS: EM DESENVOLVIMENTO — ZERO USUÁRIOS

**Plugin NÃO publicado, zero usuários, zero produção.** Sem backcompat, sem migration path, sem "não quebrar quem já usa" — não existem. Mudar default = muda direto. Renomear campo = renomeia direto. Migração one-shot e deleta o código. Se eu perguntar "e os vaults existentes?", errei a premissa.

**Vault de teste real:** `/Users/mosx/Desktop/obsidian-plugins-workbench/`. `data.json` em `.obsidian/plugins/obsidian-qualia-coding/data.json` (Obsidian usa o nome da pasta, não o `id` do manifest). NÃO usar `demo/` — é vault de demonstração.

**Repo do plugin:** `.obsidian/plugins/obsidian-qualia-coding/` (dentro do vault). Arquivos de teste pro usuário ver no Obsidian vão na **raiz do vault**, nunca dentro do repo.

## Workflow: no git worktrees

Movido pro vault Obsidian (aplica a todos plugins). Ver `obsidian-plugins-workbench/.claude/CLAUDE.md` §Workflow: no git worktrees.

## Estrutura do código

Listagem por módulo + responsabilidade vive em `docs/ARCHITECTURE.md` §18 (File-Level Reference). Movida pra lá em 2026-05-05 pra reduzir CLAUDE.md inflado (542 → 342 linhas). Atualizar lá quando mexer em arquitetura.

## Build

- `npm run dev` — watch mode (esbuild)
- `npm run build` — production build (tsc + esbuild)
- Plugin ID: `qualia-coding`
- Desktop only, min Obsidian 1.5.0
- `main.js` no root e gitignored (artefato de build, nao commitado)

## Release

**⛔ NUNCA fazer release sem confirmação literal do user.** Decisão de release (bump version + tag + push) é prerrogativa do user — sempre. Mesmo quando o plano cravado mencionar "bump versão / tag / push" como passo de finalização, PARAR antes de executar e perguntar: "fechar 0.X.Y agora?" com diff de mudanças. Custo de perguntar = 1 turno; custo de release prematuro = changelog publicado errado + tag que vira histórico imutável + BRAT puxando coisa não-pronta.

Sintoma de recaída: estou prestes a rodar `git tag X.Y.Z` ou alterar `manifest.json` version sem ter pergunta explícita "fechar release agora?" respondida. STOP. Mesmo em sessão "automática" pós-task. Mesmo se o user listou release no plano dele — plano é roteiro, não autorização de execução.

Origem da regra: sessão 2026-05-13 emitiu release 0.6.1 sem perguntar (user havia listado bump/tag/push como passo final do plano, eu interpretei como autorização). User: "não era pra virar 0.6.0, mas ok". Decisão metodológica de release fica na conta do user, não em automação.

### Mecânica (quando autorizado)

- Workflow automatizado em `.github/workflows/release.yml` — push de tag `X.Y.Z` (sem `v` prefix) dispara build + criação de GitHub Release com `main.js`, `manifest.json`, `styles.css` anexados.
- Bump version em 3 arquivos: `manifest.json`, `versions.json`, `package.json`. Atualizar `CHANGELOG.md`. Commit. Push tag.
- Detalhes completos em `docs/DEVELOPMENT.md` §9.
- BRAT puxa o release latest do repo. Pre-release (alpha/beta) requer `--prerelease` flag pra não virar default.

### Tags pra rollback de fase grande (não-release)

Pattern: `pre-<fase>-baseline` (commit estável antes da fase) + `post-<fase>-checkpoint` (commit final). Vida útil curta — release tags futuras cobrem o intervalo.

```bash
# Início: marca último commit estável
git tag pre-<fase>-baseline <sha> -m "Estado antes da <fase>"

# Fim: marca commit atual
git tag post-<fase>-checkpoint HEAD -m "<fase> completa"

# Push das duas
git push origin pre-<fase>-baseline post-<fase>-checkpoint

# Commit extra depois (docs polish, fix): move tag final e re-push
git tag -f post-<fase>-checkpoint HEAD
git push --force origin post-<fase>-checkpoint

# Rollback não-destrutivo
git revert --no-edit pre-<fase>-baseline..post-<fase>-checkpoint

# Ver baseline sem mexer em main
git checkout pre-<fase>-baseline

# Limpar tags antigas (após release cobrir o intervalo)
git tag -d <tag> && git push origin :refs/tags/<tag>
```

### Versionamento (semver)

Patch = bugfix/polish · Minor = feature nova · Major = pronto pra produção (só com alpha feedback). Detalhes: `docs/DEVELOPMENT.md` §9.

## Demo vault

- `demo/` — vault de teste com arquivos de cada tipo
- Abrir no Obsidian: vault path = `demo/`
- `demo/.obsidian/plugins/qualia-coding/main.js` e commitado (quem clona precisa)
- Apos build ou mudanca em manifest/styles, copiar manualmente:
  `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`
- NAO existe plugin copyToDemo no esbuild — copia e manual.

## Backups de dados sintéticos (`.bak` / `.backup`)

Backups gerados automaticamente pelo plugin (qualquer padrão: `data.json.bak-*`, `data.json.backup-*`, `data.json.pre-fase-*.bak`, etc.) NÃO ficam no repo do plugin. Vão pra pasta-irmã `obsidian-qualia-coding/data_synthetic_bak/` (workspace externo, fora do repo).

**Fluxo:**
1. Quando precisa de massa pra teste de performance ou debug, copia o `.bak` necessário de `data_synthetic_bak/` pra raiz do repo (ou onde o teste exige)
2. Renomeia/usa conforme necessário
3. Quando termina, deleta a cópia local — o original fica preservado em `data_synthetic_bak/`

Evita regenerar dados sintéticos toda vez. Quando o plugin gera `.bak` novo durante operação, mover pra `data_synthetic_bak/` pra preservar.

## Convencoes

- TypeScript strict
- Conventional commits em portugues (feat:, fix:, chore:, docs:)
- Cada engine registra via `register*Engine()` e retorna `EngineRegistration<Model>` com `{ cleanup, model }`
- `npm run test` — 3580 testes em 254 suites (Vitest + jsdom)
- `bash scripts/smoke-roundtrip.sh` — prepara vault temp em `~/Desktop/temp-roundtrip/` com plugin instalado pra smoke test manual do QDPX round-trip
- `npm run test:e2e` — 66 testes e2e em 19 specs (wdio + Obsidian real)
- Sidebar adapters herdam de `BaseSidebarAdapter` (core) ou `MediaSidebarAdapter` (audio/video)
- Views compartilhadas: UnifiedCodeExplorerView, UnifiedCodeDetailView
- Type guards compartilhados em `markerResolvers.ts`

### Nomes padronizados (todos os engines)

- `fileId` — identificador do arquivo no marker (nunca `file`)
- `memo` — campo de reflexão analítica processual (nunca `note`). Presente em `BaseMarker`, `CodeDefinition`, `GroupDefinition`, `CodeRelation` (#25). Distinto de `description?` (definição operacional, sai no codebook export)
- `removeMarker()` — metodo de remocao no model (nunca `deleteMarker`)
- `colorOverride` — cor custom por marker (presente em todos os tipos)
- `codeId` — referencia estavel ao CodeDefinition.id nos markers (nunca nome direto)
- `codes: CodeApplication[]` — array de `{ codeId, magnitude?, relations? }` em todos os markers (nunca `string[]`)
- Helpers em `codeApplicationHelpers.ts`: `hasCode`, `getCodeIds`, `addCodeApplication`, `removeCodeApplication`, `getMagnitude`, `setMagnitude`, `getRelations`, `addRelation`, `removeRelation`
- Popover adapters resolvem name→id na borda UI; models so recebem codeId
- `parentId` — referencia ao CodeDefinition pai (nunca `parent`)
- `childrenOrder` — array ordenado de ids filhos (nunca `children`)
- `mergedFrom` — ids dos codigos fundidos neste (audit trail)
- `folder` — id da pasta virtual (nunca path). Pastas nao tem significado analitico
- `FolderDefinition` — `{ id, name, createdAt }` no registry. Pastas nao afetam analytics
- `createFolder` / `deleteFolder` / `renameFolder` / `setCodeFolder` — CRUD de pastas no registry
- `groups` — array de groupIds em CodeDefinition (camada flat N:N ortogonal a parentId/folder). Afeta Analytics filter e export
- `GroupDefinition` — `{ id (g_*), name, color, description?, memo?, paletteIndex, parentId? schema-ready, createdAt }` no registry
- `GROUP_PALETTE` — 8 cores pastéis distintas do `DEFAULT_PALETTE`. Auto-assign round-robin com `nextGroupPaletteIndex` (nunca decrementa)
- `createGroup` / `renameGroup` / `deleteGroup` (ripple) / `addCodeToGroup` / `removeCodeFromGroup` / `setGroupColor` / `setGroupDescription` / `setGroupMemo` / `setGroupOrder` — API do registry
- `getCodesInGroup` / `getGroupsForCode` / `getGroupMemberCount` — queries
- Merge preserva **union** dos groups (target + sources, snapshot pré-delete)
- QDPX export: `<Sets>` em `<CodeBook>` com namespace `xmlns:qualia="urn:qualia-coding:extensions:1.0"` pra `qualia:color`
- Tabular CSV: coluna `groups` (`;`-separated names) em `codes.csv` + `groups.csv` standalone
- `FlatTreeNode = FlatCodeNode | FlatFolderNode` — union discriminada em hierarchyHelpers.ts
- `rootOrder` — array ordenado de IDs root no registry. Controla ordem de exibicao
- `magnitude` — config no CodeDefinition `{ type, values }`, valor no CodeApplication. Picker fechado
- `relations` — array de `{ label, target, directed, memo? }` em CodeDefinition (codigo-level) e CodeApplication (segmento-level). Label livre com autocomplete. `memo` editável só no code-level (UI 1.0); app-level é schema-ready (round-trip QDPX/CSV preserva)
- `setRelationMemo(codeId, label, target, memo)` — atualiza memo de relation code-level por tupla (label, target). Se houver duplicatas com mesma tupla, atualiza só primeira (mesmo limite do delete em `baseCodingMenu.ts:585`)
- `setParent(id, parentId)` — metodo de reparentar com deteccao de ciclo
- `executeMerge()` — funcao de merge em `mergeModal.ts` (reassigna markers, reparenta filhos, deleta sources)
- Hierarchy helpers puros em `hierarchyHelpers.ts`: `buildFlatTree`, `buildCountIndex`, `getDirectCount`, `getAggregateCount`
- `smartCodes` — array de `SmartCodeDefinition` no registry (camada de "saved queries" sobre o codebook). Schema: `{ id: 'sc_*', name, color, predicate: PredicateNode, memo?, paletteIndex, createdAt }`
- `PredicateNode` — AST union `OpNode | LeafNode`. OpNode = AND/OR/NOT com `children`. LeafNode = 1 dos 11 leaves (`hasCode`, `caseVarEquals`, `caseVarRange`, `magnitudeGte/Lte`, `inFolder`, `inGroup`, `engineType`, `relationExists`, `textContains`, `smartCode` nesting)
- `SmartCodeRegistry` — classe stateful em `src/core/smartCodes/smartCodeRegistry.ts` com `addOnMutate(fn)` + cache incremental. Mesmo pattern de `CodeDefinitionRegistry`
- `SmartCodeCache` — singleton em `src/core/smartCodes/cache.ts` com invalidação granular + chunked compute (100 markers/chunk). Recebe `applyMarkerMutation(event)` pra invalidação cirúrgica
- `MarkerMutationEvent` — `{ engine, fileId, markerId, prevCodeIds, nextCodeIds, codeIds, marker }` em `src/core/types.ts`
- `onMarkerMutation(fn)` — canal paralelo a `onChange` em todos 5 engine models. Emite em mutation sites (addCode, removeMarker, clearAllMarkers, etc). Pattern documentado em TECHNICAL-PATTERNS §37
- `markerPreviewHydrator` — orchestrator stateful em `src/csv/markerPreviewHydrator.ts` que popula `markerTextCache` em background pra arquivos lazy não hidratados. Trigger per-file via `requestHydration(fileId)` idempotente (dedup `seen + inflight`). Consumers: `BaseCodeExplorerView.buildCodeIndex`, `detailCodeRenderer`, `detailRelationRenderer`, `detailSmartCodeRenderer`, `smartCodeListModal`, `memoViewMode`. Spec em `docs/superpowers/specs/20260506-sidebar-markertext-preview-lazy-design.md`
- `dependencyExtractor(predicate)` — retorna `{ codeIds, caseVarKeys, folderIds, groupIds, smartCodeIds, engineTypes }` pra índices reversos do cache
- `evaluator(predicate, marker, ctx)` / `validator(predicate, registry)` — puros, separados (runtime vs save-time). Cycle detection em ambos
- `getSmartCodeViews(...)` — helper em `smartCodeAnalytics.ts` resolve refs em UnifiedMarkers aplicando filters globais (Analytics integration)
- `autoRewriteOnMerge` — re-aponta predicates após code merge (preserva semântica)
- Audit log entity discriminator: `AuditEntry.entity?: 'code' | 'smartCode'` + 5 `sc_*` event types (coalescing 60s pra text + Set union pra predicate)
- QDPX namespace `<qualia:SmartCodes>` em `xmlns:qualia="urn:qualia-coding:extensions:1.0"`. Import 2-pass (alocar IDs → resolver refs incl. `smartCode` nesting)
- Tabular CSV: `smart_codes.csv` com `predicate_json` column
- Commands palette: `Smart Codes: Open hub` + `Smart Codes: New`

## Skills Obsidian

Pattern de consulta e atualização movido pro vault Obsidian (aplica a todos plugins do vault). Ver `obsidian-plugins-workbench/.claude/CLAUDE.md` §Skills Obsidian.

## Docs

Docs operacionais (repo — usados no trabalho diario):
- `docs/ARCHITECTURE.md` — arquitetura detalhada
- `docs/TECHNICAL-PATTERNS.md` — padroes recorrentes
- `docs/DEVELOPMENT.md` — guia de desenvolvimento
- `docs/ROADMAP.md` — features planejadas por prioridade (com secao "🔜 Próximo passo" no topo — leitura obrigatoria pra proxima sessao; §📅 Contexto do release vigente abaixo guarda conquistas, não consultar pra "o que tem pra trabalhar")
- `docs/BACKLOG.md` — divida tecnica e oportunidades de refactor

Docs de methodology user-facing (audiência: pesquisador citando o plugin em paper):
- `docs/ICR-MULTIMODAL-METHODOLOGY.md` — framework cross-modalidade (Camada 1/2/3, agregação, LLM como faceta). **Entry point pra entender posicionamento metodológico do plugin.**
- `docs/ICR-METHODOLOGY.md` — ICR pra coding espacial 2D (bbox)
- `docs/ICR-LINEAR-METHODOLOGY.md` — texto (markdown + PDF text + CSV segment)
- `docs/ICR-TEMPORAL-METHODOLOGY.md` — áudio + vídeo
- `docs/ICR-CATEGORICAL-METHODOLOGY.md` — CSV row
- `docs/ICR-SET-VALUED-METHODOLOGY.md` — multi-código por marker (transversal)

Docs de design/pesquisa (consultar antes de iniciar sessoes em features grandes):
- `docs/parquet-lazy-design.md` — design doc autoritativo Parquet/CSV lazy loading (DuckDB-Wasm + OPFS, 7 fases, 13-15 sessões). Revisado por Codex+Gemini. **Sempre consultar antes de virar spec/plan.**
- `docs/_study/llm-coding/` — pesquisa de mercado profunda (40 ferramentas + 5 patterns, 41 arquivos). Pontos de entrada: `index.md` (TOC), `comparison.md` (sintese cross-tool), `qualia-fit.md` (cruzamento arquitetura Qualia × patterns mercado), `methodology.md`. **Consultar antes de qualquer brainstorm sobre LLM.**

Docs narrativos/historicos (fora do repo, em `obsidian-qualia-coding/plugin-docs/`):
- `HISTORY.md`, `PREHISTORY.md` — historia e pre-historia
- `DESIGN-PRINCIPLES.md` — principios de design (narrativo, audiencia externa)
- `DESIGN-STORY.md` — fundamentacao teorica do design
- `archive/` — plans arquivados, roadmaps antigos, vision docs
- `superpowers/` — specs e plans gerados por skills
- `pm/`, `research/`, `ORG ANTIGOS/` — material de PM, research, historico

### Atualizacao de docs apos feature/fase

**Quando acionar:**
- Apos conclusao de feature, fase de plano, ou refactor significativo
- NAO em commits WIP, experimentos, ou bugfixes triviais

**Escopo:** so docs do repo (`docs/`). Arquivos no workspace externo (`obsidian-qualia-coding/plugin-docs/`) NAO fazem parte desse fluxo — atualizacao de HISTORY, archive, etc. e ad-hoc.

**Ordem sugerida** (do mais obrigatorio ao mais opcional):

1. `ROADMAP.md` — marcar item como FEITO (riscar + anotar data). Se a feature gerou sub-items nao planejados, adicionar como novos items.
2. `ARCHITECTURE.md` — novos modulos, fluxos, decisoes arquiteturais
3. `TECHNICAL-PATTERNS.md` — padroes/gotchas descobertos durante a implementacao
4. `DEVELOPMENT.md` — novos commands, settings, fluxos de teste
5. `BACKLOG.md` — nova divida tecnica surgida, marcar resolvidos
6. `CLAUDE.md` — so se estrutura de arquivos, convencoes ou contagem de testes mudaram. Nao atualizar por mudanca menor.

**Triggers por tipo de mudanca:**
- Feature nova → 1, 2, 4 (+ 3 se descobriu pattern)
- Refactor → 2, 5 (marca resolvido)
- Bug fix significativo → 3 se revelou padrao
- Padrao tecnico novo isolado → 3
- Novo modulo/arquivo → 2, 6

### Manutenção de docs vivos + Onde cada regra vive

Patterns genéricos: `~/.claude/CLAUDE.md` §Manutenção de docs vivos vs históricos + §Onde cada regra vive (sistema 4 níveis).

**Específico Qualia Coding:**
- Início de sessão: ler `ROADMAP.md §🔜 Próximo passo` — obrigatório. NÃO trazer §📅 Contexto do release vigente pra resposta de "o que tem pra trabalhar"
- Trigger cleanup: `ROADMAP.md` > 400 linhas OU `BACKLOG.md` > 150 linhas
- Archives separados: `ROADMAP-HISTORY.md` (narrativa) + `BACKLOG-HISTORY.md` (one-liners por mês) + `CHANGELOG.md` (por release)
- BACKLOG.md tem §📌 Memória técnica no fim (won't-fix + permanente) — não consultar pra planejar

## Consultar base de interacoes AI (cross-projeto)

Quando o Marlon pedir "procura conversa sobre X", "o que falamos sobre Y", "tem discussao anterior sobre Z" — qualquer historico que possa estar em ChatGPT, Claude.ai, Gemini, NotebookLM, Claude Code, Codex, Gemini CLI, Qwen, DeepSeek ou Perplexity — consultar a base unified do projeto analise.

**Localizacao:** `~/Desktop/AI Interaction Analysis/data/unified/` (parquets DuckDB), wrapper CLI em `scripts/search-conversations.py`.

**Interface principal — wrapper CLI:**

```bash
PY=~/Desktop/AI\ Interaction\ Analysis/.venv/bin/python
SCRIPT=~/Desktop/AI\ Interaction\ Analysis/scripts/search-conversations.py

# Buscar termo full-text em messages (todas as fontes)
$PY $SCRIPT --query "kappa"

# Filtrar por fonte
$PY $SCRIPT --query "kappa" --source claude_ai
# fontes validas: claude_ai, chatgpt, qwen, deepseek, perplexity, gemini,
#                 notebooklm, claude_code, codex, gemini_cli

# Filtrar por projeto (entity/sub_entity da curated layer)
$PY $SCRIPT --query "kappa" --entity "Obsidian Qualia Coding"

# Excluir subagents Claude Code e stubs orfaos (analise de conteudo)
$PY $SCRIPT --query "kappa" --source claude_code --exclude-subagents

# Imprimir conversa inteira (passa conversation_id)
$PY $SCRIPT --show ca9f15d1-6304-490c-a68a-6e354be52c3b

# Listar entities disponiveis pra filtrar
$PY $SCRIPT --list-entities

# Schema completo das views DuckDB + curated layer
$PY $SCRIPT --schema
```

**Saida do search:** uma linha por conversa — `conversation_id  [source, data, N msgs]  titulo` + URL na linha seguinte (quando disponivel). Use `--show <id>` pra puxar conteudo.

**Workflow tipico** (usuario: "procura conversa sobre kappa"):
1. `$PY $SCRIPT --query "kappa" --source claude_ai --limit 10` — lista candidatos
2. Identificar a conv pelo titulo + data + msg_count
3. `$PY $SCRIPT --show <id>` — puxar conteudo, ler, resumir pro usuario

**Quando o usuario pedir contexto deste projeto especificamente:** combinar `--query` com `--entity "Obsidian Qualia Coding"` (748+ convs marcadas).

**Casos avancados** (DuckDB direto): se o wrapper nao cobrir, ler `~/Desktop/AI\ Interaction\ Analysis/CLAUDE.md` secao "Dissecacao das orfas — nb 15" pra schema completo das views (conversations, messages, events, conversation_projects) e padroes DuckDB. Em ultimo caso, `cd` no projeto e rodar Python com `from src.db import DuckDBManager`.

**NAO atualizar a base.** Esse projeto eh consumer read-only — nunca rodar nada que modifique parquets em `data/unified/` ou `data/curated/`.

## Plugins paralelos / spike / PoC

Quando sessão gerar necessidade de plugin novo no vault — ver `obsidian-plugins-workbench/.claude/CLAUDE.md` §Layout de plugins.
