# Qualia Coding

Plugin Obsidian para analise qualitativa de dados (QDA). Codifica texto, PDF, CSV, imagens, audio e video.

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

### 2. Antes de criar arquivo/classe nova, varrer o projeto pelo padrão equivalente

Antes de fazer `SmartCodeApi`, eu deveria ter `grep -rn "class.*Registry"` e visto `CodeDefinitionRegistry` + `CaseVariablesRegistry`. Padrão estabelecido: classe stateful com `addOnMutate(fn)`, `getById(id)`, `getAll()`, `toJSON()`, encapsulamento de paletteIndex. Eu vi e ignorei porque copiar o padrão exigia mais código.

**Regra operacional:** antes de instanciar qualquer abstração nova (Registry, Manager, Service, Api, Controller, etc.):
1. `grep -rn "^export class\|^class " src/core/ src/<área>/ | head -30`
2. Se já existe pattern equivalente: copiar literalmente. Mesma assinatura de métodos, mesmo lifecycle, mesmo padrão de listeners.
3. Se for divergir: **comentar inline justificando o porquê com referência ao código equivalente que NÃO foi copiado**. Sem justificativa visível = bug arquitetural que vai ser cobrado depois.

### 3. "Pragmatismo" / "trade-off honesto" / "não bloqueante" são red flags de auto-justificativa

Cada vez que escrevo essas palavras pra defender uma decisão, é racionalização de corte de qualidade — não decisão técnica. `auditEmit: any` com comentário "mais limpo que listar 12 variants" é o caso clássico: bati em complexidade de typed union, fugi, escrevi comentário vendendo a fuga.

**Regra operacional:** se vou escrever "pragmaticamente", "trade-off", "decisão pragmática", "não bloqueante", "Phase 2" — STOP. Reler o que estou prestes a entregar. Se a decisão real é "tô com preguiça de fazer direito", admitir e ou fazer direito ou não fazer.

### 4. Stub broken = bug, não roadmap. NÃO commit `// TODO Phase 2` em código que o usuário vai clicar

`onNavigateToMarker: (ref) => console.log(...)` com comentário "Phase 2" é click quebrado em produção. Mesmo padrão: `caseVarRange: "(advanced — edit JSON manually)"` no dropdown — usuário seleciona e fica preso. `smartCodesSection.ts` 107 linhas de dead code "disponível pra extensão futura" — não está, é arquivo não terminado.

**Regra operacional:** antes de commit que toca UI:
- Toda action clickable faz algo visível ou é removida do DOM
- Todo dropdown option ou implementa ou sai do dropdown
- Todo arquivo criado tem callsite real ou não é commitado
- "TODO" / "Phase 2" / "fica pra depois" em código que entra na superfície do usuário = não commit

### 5. Self code review crítico ANTES de commit, não depois do user descobrir

Os 17 problemas que o user listou no review final eram visíveis em qualquer pass de leitura crítica do diff. Eu não fiz porque no fluxo de execução o feedback que me move é "tests verde + typecheck + commit + próximo chunk". Esse loop não tem code review.

**Regra operacional:** antes de cada `git commit`, rodar mentalmente:
1. **Padrão:** esse arquivo segue o padrão de outros equivalentes no projeto?
2. **Type safety:** algum `any` que daria pra typar? algum cast com `as` que esconde shape errado?
3. **Dead code:** algum método/arquivo criado sem callsite?
4. **UI honesta:** toda interação faz o que parece que faz?
5. **Naming:** os identifiers seguem convenção do CLAUDE.md ("Nomes padronizados")?
6. **Encapsulamento:** estou acessando privates via `as any`? estou mutando state alheio direto?

Se algum desses falha → não commit, fix antes.

### 6. Otimizo pra "items na resposta final" (commits, testes, chunks fechados). User paga por produto, não por contagem.

Métricas de output (19 commits, 175 testes, 5 chunks) são feedback loop interno, não valor entregue. User não compra contagem — compra produto que funciona quando ele abre o Obsidian. Quando vendo "175 testes verde" como prova de qualidade, estou enganando o user (e me enganando).

**Regra operacional:** ao reportar progresso:
- NUNCA usar contagem de commits/testes/chunks como prova de qualidade
- Falar do que **funciona em runtime real** (com smoke test feito) e do que **ficou pendente** (com clareza)
- Se nada foi smoke-testado, dizer literalmente "implementado mas não validado em runtime — você precisa testar"

### 7. Quando o user devolver review crítico, não defender — entender o padrão de comportamento e cravar como regra

Padrão observado em 2026-05-05: ao receber 17 issues técnicos, primeira reação foi "vou categorizar e perguntar prioridade pra fixar" — ou seja, voltar ao loop de output. User cortou e perguntou "por que vc se comporta assim?". Resposta certa: olhar o padrão (não os bugs específicos) e cravar regra operacional.

Esta seção é resultado disso. Quando aparecer review crítico futuro:
1. Resposta inicial: reconhecimento direto sem defesa
2. Identificar o padrão (comportamento, não bug pontual)
3. Atualizar este CLAUDE.md com a regra operacional resultante
4. Só depois discutir fix do código

---

## STATUS: EM DESENVOLVIMENTO — ZERO USUÁRIOS

**Plugin NÃO está publicado. ZERO usuários reais. ZERO produção.** Não existe "vault existente de usuário", "backcompat", "migration path pra data.json salvo", nem "não quebrar quem já usa". Quando eu mudar um default, muda e pronto. Quando renomear um campo, renomeia e pronto. Sem migration code inline, sem fallback defensivo pra data antiga. Se o vault workbench precisa ser atualizado, migração one-shot e deleta o código.

Pensar em backcompat aqui é ruído que enviesa decisão de design. Se eu me pegar perguntando "e os vaults existentes?" — é sinal de que errei. A resposta é sempre: não existem.

**Vault de teste real:** `/Users/mosx/Desktop/obsidian-plugins-workbench/` (o vault que contém este repo). `data.json` em `.obsidian/plugins/obsidian-qualia-coding/data.json` (Obsidian usa o nome da pasta do plugin, que é `obsidian-qualia-coding`, não o `id` do manifest). NÃO usar `demo/` como fonte de verdade — é vault de demonstração com dados sintéticos.

**Raiz do vault vs repo do plugin:**
- Vault (o que o usuário abre no Obsidian): `/Users/mosx/Desktop/obsidian-plugins-workbench/`
- Repo do plugin (subpasta): `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding/`

Arquivos de teste/notas pro usuário ver no Obsidian vão na **raiz do vault**, nunca dentro do repo.

## Workflow: no git worktrees

**Nunca** criar git worktree neste projeto (nem project-local, nem global). Trabalhar sempre direto no working dir atual, em branch normal (`git checkout -b ...`).

Motivo: o plugin é desenvolvido de dentro do vault `obsidian-plugins-workbench`. Worktree project-local duplica o repo dentro de `.obsidian/` (Obsidian indexa e quebra); worktree global quebra o hot-reload que depende do artefato `main.js` ficar em `.obsidian/plugins/qualia-coding/`.

Skills que normalmente exigem worktree (`superpowers:subagent-driven-development`, `superpowers:executing-plans`, `superpowers:brainstorming` Phase 4) ficam overridden por este CLAUDE.md. Quando algum skill pedir worktree, pular o setup e criar branch direto.

## Estrutura do código

Listagem por módulo + responsabilidade vive em `docs/ARCHITECTURE.md` §18 (File-Level Reference). Movida pra lá em 2026-05-05 pra reduzir CLAUDE.md inflado (542 → 342 linhas). Atualizar lá quando mexer em arquitetura.

## Build

- `npm run dev` — watch mode (esbuild)
- `npm run build` — production build (tsc + esbuild)
- Plugin ID: `qualia-coding`
- Desktop only, min Obsidian 1.5.0
- `main.js` no root e gitignored (artefato de build, nao commitado)

## Release

- Workflow automatizado em `.github/workflows/release.yml` — push de tag `X.Y.Z` (sem `v` prefix) dispara build + criação de GitHub Release com `main.js`, `manifest.json`, `styles.css` anexados.
- Bump version em 3 arquivos: `manifest.json`, `versions.json`, `package.json`. Atualizar `CHANGELOG.md`. Commit. Push tag.
- Detalhes completos em `docs/DEVELOPMENT.md` §9.
- BRAT puxa o release latest do repo. Pre-release (alpha/beta) requer `--prerelease` flag pra não virar default.

### Tags pra rollback de fase grande (não-release)

Quando fechar uma fase substancial (Fase 6 do parquet-lazy foi a primeira), criar **par de tags** marcando antes/depois pra facilitar rollback ou comparação. Nome `pre-<fase>-baseline` / `post-<fase>-checkpoint`.

```bash
# Antes de começar a fase: marca o último commit estável
git tag pre-fase6-baseline 4885d3e -m "Estado antes da Fase 6"

# Ao fechar a fase: marca o commit mais recente
git tag post-fase6-checkpoint HEAD -m "Fase 6 completa"

# Push das duas
git push origin pre-fase6-baseline post-fase6-checkpoint

# Se fizer commit adicional na mesma fase depois (docs polish, etc),
# move a tag pra HEAD com -f e re-push com --force:
git tag -f post-fase6-checkpoint HEAD
git push --force origin post-fase6-checkpoint
```

**Comandos de rollback:**
```bash
# Ver como tava antes (sem mexer em main)
git checkout pre-fase6-baseline

# Desfazer fase inteira preservando histórico (NÃO destrutivo)
git revert --no-edit pre-fase6-baseline..post-fase6-checkpoint

# Voltar pro checkpoint depois de explorar baseline
git checkout main
```

**Tags atuais ativas:**
- `pre-fase6-baseline` → `4885d3e` (estado antes do parquet-lazy Slice A)
- `post-fase6-checkpoint` → `aee2e3c` (Fase 6 completa + docs redondo)

**Quando remover:** quando o próximo release tagear (ex: `0.2.0` ou `0.3.0`) cobrir esse intervalo confortavelmente, pode deletar — release tags são o ponto de rollback canônico. Tags de fase são "redes de segurança" temporárias enquanto a fase ainda é recente.

### Conferir estado git ao começar sessão nova

Pra evitar dúvida sobre "tudo foi commit/push?":
```bash
git status                          # working tree clean + "up to date with origin/main"
git log --oneline -5                # últimos 5 commits
git ls-remote --tags origin | grep <fase>  # tags no remote
```

Se o output bater (working clean + branch alinhada com origin), nada está pendente. Working tree dirty ou "ahead by N commits" = falta commit ou push.

### Convenção de versionamento (semver)

- **Patch (X.Y.Z+1)**: bugfix, polish, refinement de feature existente. Ex: 0.1.0 → 0.1.1 (Convert memo to note Phase 1+2).
- **Minor (X.Y+1.0)**: feature nova (capability ou módulo novo). Ex: LLM-assisted coding entraria como minor.
- **Major (X+1.0.0)**: marca "pronto pra produção" ou breaking interface visível pro usuário. Só atacar quando tiver feedback de alpha real.

### Estado atual e próximos releases

- **Latest**: `0.1.1` (pre-release, 2026-04-30) — Convert memo to note Phase 1 + Phase 2 completa (Code, Group, Marker, Relation).
- **Próximo planejado**: `0.1.2` se Phase 3 (Materialize all memos) for a única mudança. Sobe pra `0.2.0` se entrar combinada com feature substancial (LLM coding, etc.) ou com submissão à Community Plugins + onboarding docs (decisão de marketing — pode até virar `1.0.0` se for "lançamento oficial").
- Manter sempre **pre-release flag** até feedback de alpha real chegar.

## Demo vault

- `demo/` — vault de teste com arquivos de cada tipo
- Abrir no Obsidian: vault path = `demo/`
- `demo/.obsidian/plugins/qualia-coding/main.js` e commitado (quem clona precisa)
- Apos build ou mudanca em manifest/styles, copiar manualmente:
  `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`
- NAO existe plugin copyToDemo no esbuild — copia e manual.

## Convencoes

- TypeScript strict
- Conventional commits em portugues (feat:, fix:, chore:, docs:)
- Cada engine registra via `register*Engine()` e retorna `EngineRegistration<Model>` com `{ cleanup, model }`
- `npm run test` — 2759 testes em 172 suites (Vitest + jsdom)
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
- `PredicateNode` — AST union `OpNode | LeafNode`. OpNode = AND/OR/NOT com `children`. LeafNode = 1 dos 10 leaves (`hasCode`, `caseVarEquals`, `caseVarRange`, `magnitudeGte/Lte`, `inFolder`, `inGroup`, `engineType`, `relationExists`, `smartCode` nesting)
- `SmartCodeRegistry` — classe stateful em `src/core/smartCodes/smartCodeRegistry.ts` com `addOnMutate(fn)` + cache incremental. Mesmo pattern de `CodeDefinitionRegistry`
- `SmartCodeCache` — singleton em `src/core/smartCodes/cache.ts` com invalidação granular + chunked compute (100 markers/chunk). Recebe `applyMarkerMutation(event)` pra invalidação cirúrgica
- `MarkerMutationEvent` — `{ engine, fileId, markerId, prevCodeIds, nextCodeIds, codeIds, marker }` em `src/core/types.ts`
- `onMarkerMutation(fn)` — canal paralelo a `onChange` em todos 5 engine models. Emite em mutation sites (addCode, removeMarker, undo, clearAllMarkers, etc). Pattern documentado em TECHNICAL-PATTERNS §37
- `dependencyExtractor(predicate)` — retorna `{ codeIds, caseVarKeys, folderIds, groupIds, smartCodeIds, engineTypes }` pra índices reversos do cache
- `evaluator(predicate, marker, ctx)` / `validator(predicate, registry)` — puros, separados (runtime vs save-time). Cycle detection em ambos
- `getSmartCodeViews(...)` — helper em `smartCodeAnalytics.ts` resolve refs em UnifiedMarkers aplicando filters globais (Analytics integration)
- `autoRewriteOnMerge` — re-aponta predicates após code merge (preserva semântica)
- Audit log entity discriminator: `AuditEntry.entity?: 'code' | 'smartCode'` + 5 `sc_*` event types (coalescing 60s pra text + Set union pra predicate)
- QDPX namespace `<qualia:SmartCodes>` em `xmlns:qualia="urn:qualia-coding:extensions:1.0"`. Import 2-pass (alocar IDs → resolver refs incl. `smartCode` nesting)
- Tabular CSV: `smart_codes.csv` com `predicate_json` column
- Commands palette: `Smart Codes: Open hub` + `Smart Codes: New`

## Skills Obsidian

### Consulta (antes de implementar)

- Antes de mexer em CM6 (StateField, decorations, widgets, DOM do editor) → consultar `obsidian-cm6`
- Antes de mexer em CSS do editor ou layout → consultar `obsidian-design`
- Antes de mexer em events, lifecycle, vault, metadataCache → consultar `obsidian-core`
- Antes de mexer em settings UI → consultar `obsidian-settings`

### Atualizacao (depois de implementar)

- Padrao novo descoberto → adicionar DIRETAMENTE ao skill relevante (cm6, core, settings, design)
- Anti-pattern descoberto → adicionar na secao "Armadilhas Comuns" do skill relevante
- Cada pattern tem UMA casa (o skill mais relevante). Nunca duplicar entre skills

## Docs

Docs operacionais (repo — usados no trabalho diario):
- `docs/ARCHITECTURE.md` — arquitetura detalhada
- `docs/TECHNICAL-PATTERNS.md` — padroes recorrentes
- `docs/DEVELOPMENT.md` — guia de desenvolvimento
- `docs/ROADMAP.md` — features planejadas por prioridade (com secao "⚡ Status atual" no topo — leitura obrigatoria pra proxima sessao)
- `docs/BACKLOG.md` — divida tecnica e oportunidades de refactor

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
