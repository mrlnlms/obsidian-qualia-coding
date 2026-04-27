# Qualia Coding — Roadmap

> Features planejadas por prioridade. Items concluídos ficam no registro ao final.
> Última atualização: 2026-04-24.

---

## 📍 Próximos a atacar (frente)

**Próxima sessão (decidida 2026-04-27):** Coding Management onda 2 — **Bulk rename via regex/find-replace** + **Code stability tracking (audit log)** juntos. Ver §2c abaixo pra detalhes de escopo travado no brainstorm informal.

> Em 2026-04-27 4 features grandes mergeadas no dia: Code × Metadata (#24), Memos em todas entidades (#25), Analytic Memo View, Click-to-edit refactor (mata virtual scroll do BACKLOG §17). Plugin em 2367 tests passing.
>
> **Code Groups (#2a)** concluído 2026-04-24 — Tier 1.5 estendido.
>
> **Toggle Visibility por Código** saiu da frente 2026-04-24 (feature completa nos 6 engines).
>
> **Import/Export — sessão agrupada** saiu 2026-04-24 (tabular export + Board SVG/PNG + PDF anchors).
>
> **Parquet lazy loading** fora da frente — contingente à decisão sobre LLM-assisted coding.

---

## 🔜 Roadmap pós-frente-limpa (sequência narrativa)

Ordem motivada pelo uso: organizar codebook → analisar → polir.

| Ordem | Item | Motivação |
|-------|------|-----------|
| 2 | **[Coding management](#2-coding-management)** (Tier 2: Bulk rename + Audit log próxima sessão; Tier 1: Multi-select + Bulk ops + Drag-drop inter-groups; Tier 3: Smart Codes bloqueado por LLM) | Continua sendo foco grande do projeto |
| 3 | **[Analytics — melhorias](#3-analytics--melhorias)** (Multi-tab spreadsheet export — Relations Network polish + Code×Metadata + Analytic Memo View já concluídos 2026-04-27) | Consequência natural de #2 |
| 4 | **[Margin Panel — melhorias](#4-margin-panel--melhorias)** (Customization + Resize Handle) | Polish visual. **Dependência externa**: aguarda decisão em outro plugin não-mexido |

---

## ❓ Decisão de produto aberta

Sem ordem de execução — precisam validar **se** e **como** existem antes de virar sessão.

- **[LLM-assisted coding](#llm-assisted-coding)** — batch coding via LLM (local/API) sobre células tabulares. Destrava "parquet gigante" como caso de uso legítimo. **Amarra a decisão sobre Parquet lazy loading**
- **[Intercoder Reliability (kappa/alpha)](#intercoder-reliability)** — gap estratégico, complexidade alta pro contexto atual
- **[Projects + Workspace](#projects--workspace)** — reinventa gerência de projetos dentro de app de organização
- **[Research Board Enhancements](#research-board-enhancements)** — escopo amplo, decidir subset
- **[Analytical Memos](#analytical-memos)** — Obsidian já É o app de memos
- **Tabular round-trip (import)** — reimportar o zip de CSVs exportado. Use cases possíveis: editar codes/case_variables em Excel em bulk, colaborar via CSV, merge de codings externos. Viabilidade incerta: text anchors de PDF/markdown podem não casar se arquivo fonte mudou; estratégia de conflito (novos vs editados vs deletados) precisa definição. Se virar concreto, brainstorming próprio

---

## Detalhes — frente

_Vazia — ver registro abaixo._

<a id="parquet-lazy-loading-contingente"></a>
### Parquet lazy loading (contingente — fora da frente)

**Status em 2026-04-24**: saiu da frente. Suporte básico já implementado (`hyparquet` + `parseTabularFile()` + `registerExtensions(['csv', 'parquet'])`). A extensão pra lazy loading completo depende da decisão sobre [LLM-assisted coding](#llm-assisted-coding) — sem ela, o caso "parquet 500MB com humano codificando sequencialmente" não existe no workflow QDA real.

**Decisão preservada**: se LLM coding entrar no roadmap → Parquet lazy vira pré-requisito (revisar resultado de batch LLM num grid navegável). Se não → opção D (preview + aviso em arquivo grande, 1 sessão) resolve o caso de crash sem comprometer 5-7 sessões de trabalho.

**Problema atual**: Lê arquivo inteiro pra memória. Datasets grandes (ex: export Qualtrics 2M rows) crasham o Obsidian (~500MB-2GB de memória, main thread bloqueada).

#### Constraint crítico: AG Grid Community

O projeto usa `ag-grid-community`. **Server-Side Row Model é Enterprise-only** (~$999/dev/ano). A alternativa viável é **Infinite Row Model** (Community), que oferece lazy por páginas mas com menos features (sem grouping/pivot lazy).

#### Acoplamentos existentes que lazy loading precisa quebrar

1. **`rowDataCache: Map<string, Record[]>`** em `CsvCodingModel` assume cache completo. Consumidores:
   - `CsvCodingView.navigateToRow` → AG Grid
   - `CsvCodingModel.getMarkerText()` → sidebar code explorer, detail views
   - `QdpxExporter` → export precisa texto de cada cell marker
2. **Markers referenciam `row: N`** como índice posicional. Rows não carregadas → `getMarkerText()` retorna `null` → sidebar quebra.
3. **Sort/filter hoje é client-side** (AG Grid client-side row model). Lazy loading inviabiliza sort/filter nativos sem query engine.

Solução: camada de abstração `RowProvider { getRow(n): Promise<Record> }` com duas implementações (eager pra arquivos pequenos, lazy pra grandes). Todos os consumidores viram async.

#### Arquitetura proposta

1. **Metadata-only open**: hyparquet lê só schema (~1KB). Visualização instantânea.
2. **Infinite Row Model** (AG Grid Community): datasource adapter mapeia "AG Grid page request" → "hyparquet row group range". Row groups têm tamanho variável — adapter calcula offset interno.
3. **Column projection**: `hyparquet({ columns })` decodifica só colunas visíveis. Integrar com `columnToggleModal`.
4. **Web Worker**: decodificação (200-500ms pra 100k rows) sai da main thread. Validar compatibilidade de `hyparquet-compressors` (Snappy/ZSTD via WASM) dentro de worker.
5. **LRU cache**: 2-3 row groups em memória (~50MB vs 500MB+).
6. **`RowProvider` abstraction**: substitui `rowDataCache` direto. Consumidores ficam async.
7. **Threshold automático**: `navigator.deviceMemory` + `file.stat.size` decidem eager vs lazy. Setting override manual (ex: "forçar lazy acima de X MB" — default: file > 100MB OU deviceMemory < 4GB).

#### Decisão de produto pendente — sort/filter em lazy mode

Três opções:

| Opção | Custo extra | Resultado |
|-------|-------------|-----------|
| Sort/filter só no buffer carregado | 0 | Funciona mas só enxerga subset |
| Desabilitar sort/filter em lazy mode | 0 | UX honesta ("arquivo grande = só visualização") |
| **DuckDB-Wasm** como query engine | +1 sessão, ~6MB bundle | Sort/filter real sobre parquet direto, viabiliza também aggregations pesadas |

DuckDB-Wasm lê parquet direto do ArrayBuffer e executa SQL. Não é pré-requisito, é upgrade considerável.

#### Estimativa

| Fase | Esforço |
|------|---------|
| POC: metadata-only + Infinite Row Model + hyparquet page range | 1 sessão |
| `RowProvider` abstraction + consumidores async | 1-2 sessões |
| Web Worker | 1 sessão |
| Column projection + LRU | 0.5-1 sessão |
| Sidebar resolve async + UX loading | 1 sessão |
| Threshold automático + settings | 0.3 sessão |
| **Total (sem DuckDB-Wasm)** | **5-7 sessões** |
| +DuckDB-Wasm se adotado | +1 sessão |

#### Riscos

- **Markers órfãos** em caso de re-sort externo do parquet. Risco já existe hoje (usar índice posicional); lazy loading não muda a natureza do risco. **Mitigação opcional futura** (não pré-requisito): ancorar markers a hash/primary-key de row em vez de índice.
- **Sort/filter global** requer ou query engine (DuckDB-Wasm) ou aceitar limitação ao buffer.
- **Export QDPX** em parquet grande: batch de rows com marker por row group é obrigatório (sem isso vira N requests I/O).
- **Web Worker + hyparquet-compressors**: verificar WASM load em worker context.

#### Evolução adicional

- Export TO Parquet (via hyparquet-writer ou CSV conversion)

---

## Detalhes — pós-frente-limpa

### 2. Coding management

Usabilidade do codebook com corpus grande. Dois sub-itens:

#### 2a. Code Groups (renomeado de "Theme Hierarchy") — ✅ FEITO 2026-04-24

**Status:** Tier 1.5 estendido implementado. Ver registro #22 abaixo.

> **⚠️ Leitura obrigatória antes de planejar/brainstorm esta feature:**
> - `docs/ARCHITECTURE.md` §5.1 — explica por que `parentId` já É theme hierarchy (não re-propor isso)
> - `memory/project_code_groups_decision.md` — decisões já travadas (flat, não nested; tier 1 primeiro)

**Nome antigo enganava.** Theme hierarchy o plugin JÁ TEM via `parentId` (NVivo-style: parent code sem aplicações diretas age como theme, aggregate counts incluem filhos, Braun & Clarke method map direto). O que falta é outra coisa: **Code Groups** (padrão Atlas.ti/MAXQDA), uma **camada flat N:N cross-cutting** pra agregar análise em dimensões que não são hierárquicas.

**Motivação:** usuário quer tagear códigos com dimensões analíticas ortogonais à taxonomia (ex: "Afetivo/Cognitivo", "RQ1/RQ2", "Onda 1/Onda 2") e filtrar Analytics por essas dimensões, sem refatorar a hierarquia.

**Padrão da indústria (pesquisado 2026-04-24):**
- Atlas.ti: Code Groups flat + Smart Codes (query engine)
- MAXQDA: Code Sets flat + hierarquia principal de até 10 níveis
- NVivo: Parent/child + Sets flat
- **Nenhuma plataforma consolidada nesteia a camada flat** — hierarquia fica no tree principal

**Distinção com `folder` (feature existente):**

| | Folder (hoje) | Group (novo) |
|---|---|---|
| 1 código em N? | 1 só | **N ao mesmo tempo** |
| Afeta Analytics? | ❌ | ✅ |
| Finalidade | Cosmética visual | **Dimensão analítica** |

**Onde aparece na UI (não vira view nova — camada em cima do existente):**
1. **Code Explorer** — painel "Groups" no topo da sidebar (estilo tags do Obsidian) + chips opcionais nas rows
2. **Code Detail** — nova seção "Groups: 🏷️ X 🏷️ Y [+]" pra editar membership
3. **Analytics config** — filtro + opção "Group by: code / parent / group"
4. **Settings** — subsection de gestão (criar/renomear/deletar/bulk)
5. **Export** — coluna `groups` nos CSVs tabulares + `<CodeSet>` no QDPX

**Schema:**
```ts
// CodeDefinition ganha:
groups?: string[];  // array de groupIds

// QualiaData ganha:
codeGroups: Record<string, { id, name, createdAt, parentId?, color?, description? }>;
```

**Tiered scope (decidir na hora de planejar):**

| Tier | O que entra | Custo | Quando fazer |
|---|---|---|---|
| **1 MVP** | Flat groups + Settings-only management + Analytics filter single-select + export column | ~1-2 sessões | Primeira iteração |
| **2 Normal** | + chips nas rows + right-click "Add to group" + `/` no nome vira nested visual (convenção Obsidian, zero schema) + multi-select filter | +1 sessão | Quando codebook crescer |
| **3 Avançado** | + nested real com `parentId` em group + metadata rica (cor/desc/memo) + boolean filter (AND/OR/NOT) + exclusive groups + multi-select operations | +3-4 sessões | Quando corpus grande E dimensões realmente complexas |
| **5 Query** | Smart Codes (query engine, composicional) | fora de escopo | Só se tier 3 não der conta (provavelmente nunca) |

**Recomendação ao planejar:** tier 1 primeiro, medir uso real, subir tier quando dor aparecer. Não pular pra tier 3 de cara.

**Detalhamento conceitual completo da discussão de design (nested via `/`, tradeoffs, exemplo com codebook de IA no trabalho, comparação com Atlas.ti/MAXQDA/NVivo/Dedoose, porque flat é consenso na indústria): este bloco é o resumo; a discussão viva acontece no plano quando for implementar.**

#### 2b. ~~Pastas nested (folder dentro de folder)~~ — ✅ FEITO 2026-04-26

Descoberto 2026-04-23 durante §12 K2 do BACKLOG.

- Hoje `FolderDefinition` não tem `parentId`; folder rows não são `draggable`
- Mudanças necessárias:
  - Schema do registry (adicionar `parentId?` em `FolderDefinition`)
  - Drag-drop callbacks (folder como dragSource + dropTarget)
  - `buildFlatTree` (recursão em níveis aninhados)
  - Validação de ciclo (mesma lógica do `setParent` pra códigos)
- Sem backward-compat (zero users)
- Estimativa: 2-3h

#### 2c. Coding Management — próxima onda (2026-04-27 →)

**Contexto:** após 4 ondas entregues (Code Groups, Code × Metadata, Memos em todas entidades, Analytic Memo View), Marlon sinalizou que gestão de códigos continua sendo foco grande do projeto. Esta seção mapeia as features candidatas pra próximas sessões — algumas vieram de menção genérica do Marlon em 24/04 ("bulk operations, multi-select, drag-drop inter-groups, smart codes"), outras foram expandidas em 2026-04-27 baseadas em padrões Atlas.ti/MAXQDA/NVivo + research practices (merging avançado, bulk rename, audit log).

**Tier 1 — UX moderna pra escalar codebook:**

| Feature | O que faz | Pré-req |
|---|---|---|
| **Multi-select no codebook** | Cmd/Shift+click pra selecionar múltiplos | — |
| **Bulk operations** | Aplicar ação em N códigos selecionados (move folder, add group, recolor, delete) | Multi-select |
| **Drag-drop inter-groups** | Arrastar código de um group pra outro (ou pra "no group") direto no painel Groups | — |

**Tier 2 — polish do codebook como artefato vivo:**

| Feature | O que faz | Notas |
|---|---|---|
| **Bulk rename via regex/find-replace** | Modal "Find & Replace" com filtros (folder, prefixo) + preview de matches + apply em lote | Inclinação: começar com versão simples (find/replace + checkbox regex), expandir conforme dor real |
| **Code stability tracking** (audit log) | Log de operações por código (created, renamed_from→to, merged_with, deleted_at) com timeline visual + export markdown pra paper | Inclinação: foco em "defender escolhas analíticas" (ler depois pra justificar codebook), não em undo. Persistência: estende `CodeDefinition` com `history: AuditEntry[]` |
| **Code merging avançado** | Merge interativo: preview de impacto (markers/groups afetados), escolher nome/cor mantido, manter ou descartar memos dos sources | Hoje merge é simples — em codebook grande precisa preview consciente |

**Tier 3 — bloqueado por LLM:**

| Feature | O que faz | Por que bloqueado |
|---|---|---|
| **Smart Codes (saved queries)** | Código "virtual" definido por query (ex: `frustacao` E `senioridade=junior` E magnitude≥3). Re-avaliado a cada chamada. Padrão Atlas.ti. | Diferencial competitivo grande, mas escopo de projeto à parte. Faz mais sentido depois de LLM-assisted coding entrar (ver §LLM-assisted coding nas decisões abertas) — DSL de query + sugestão LLM combinam bem |

**Próxima sessão (decidida 2026-04-27):** Tier 2 — **Bulk rename via regex** + **Code stability tracking (audit log)** juntos, pq sinergia (bulk rename gera N rename events, audit captura).

**Inclinações de escopo travadas no brainstorm informal:**
- **Bulk rename:** versão simples primeiro (find+replace+regex toggle, lista preview, apply). Sem split-merge avançado.
- **Audit log:** foco em "defender escolhas" (timeline + export markdown), não em undo histórico. Schema: `CodeDefinition.history: AuditEntry[]`.
- **Atacar juntos** numa sessão (não separadas).

Quando começar a sessão: brainstorm formal pra travar UX (modal de bulk rename, onde aparece a timeline do audit), schema, edge cases (rename quebra audit?).

### 3. Analytics — melhorias

Itens menores que se somam a uma camada de polish analítico. Ordem sugerida do mais barato ao mais caro:

| Item | Esforço | Detalhe |
|------|---------|---------|
| ~~**Relations Network — hover-focus**~~ ✅ 2026-04-27 | ~45 min | Ao passar cursor sobre um nó, destacar edges que entram/saem dele e escurecer o resto. No loop de draw do `relationsNetworkMode.ts`: dividir opacity por 3 pras edges que não tocam `hoveredNodeIdx` |
| ~~**Relations Network — filtro "N+ aplicações"**~~ ✅ 2026-04-27 | ~30 min | Slider ou input no painel de config: só renderiza edges com `weight >= N`. Threshold no `extractRelationEdges` ou no loop de draw |
| ~~**Analytic Memo View**~~ ✅ 2026-04-27 | Médio | Mode `memo-view` no Analytics agrega memos de codes/groups/relations/markers. Edição inline via `dataManager.findMarker` + `markDirty`. Toggle by-code/by-file. Export CSV + Markdown |
| ~~**Code × Metadata** (ex-#9)~~ ✅ 2026-04-27 | 2-3h | Tabelas de contingência código × variável demográfica. Depende de Case Variables (FEITO). Reusa `inferentialEngine` base |
| **Multi-tab spreadsheet export** | Médio | Export das análises do Analytics como .xlsx com uma aba por modo (frequency, cooccurrence, doc-matrix). Herdado do ex-§17 do BACKLOG |
| **Relations Network — edge bundling FDEB/HEB** | 3-4h MVP | Só atacar quando grafo realista tiver 50+ edges densos — curvas de Bézier atuais cobrem até isso. FDEB adiciona 150-300 LOC ou lib externa (`d3-force-bundling`). Não prioritário |

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

## Detalhes — decisão de produto aberta

### LLM-assisted coding

Batch coding via LLM (local ou API) sobre células tabulares (ou markdown, PDF, etc.). Fluxo proposto:

```
1. Usuário configura prompt + colunas alvo
2. Background job itera o source em chunks (100-1000 rows)
3. Cada chunk → LLM → retorna codes por row
4. Markers gravados em data.json incrementalmente
5. Humano revisa via grid/sidebar, ajusta o que LLM errou
```

**Por que importa pro roadmap agora**: destrava "parquet gigante" como caso de uso legítimo. Sem LLM, codificar 500k rows sequencialmente é fora do escopo humano — com LLM, vira o caso central de mixed methods (Qualtrics + open-ended text).

**Amarra a decisão sobre Parquet lazy loading**:
- Se LLM coding entra → Parquet lazy completo vira pré-requisito pra revisão em grid navegável
- Se não entra → opção D (preview + aviso) resolve o caso de crash sem compromisso grande

**Concorrência**: ATLAS.ti tem AI Coding, NVivo tem summarize/AI, MAXQDA tem AI Assist, Dedoose tem AI features. Todos pagos. Oportunidade clara em open source.

**Escopo mínimo (MVP)**:
- Provider config (OpenAI/Anthropic API + local via Ollama)
- Prompt builder com codebook existente injetado
- Batch scheduler (rate-limit, retry)
- Confidence score + revisão humana first-class
- Funcionar pra markdown + CSV/parquet inicialmente

**Escopo completo**: todos os engines (PDF, image, audio, video via transcription).

**Estimativa (MVP)**: 10-15 sessões. Feature própria, não sub-item.

**Decisão pendente**: priorizar isso acima de "Coding management" e "Analytics polish" no pós-frente-limpa?

### Intercoder Reliability

Cohen's kappa / Krippendorff's alpha. Esperado por peer reviewers para claims de rigor acadêmico. NVivo, ATLAS.ti, MAXQDA, Dedoose e QualCoder oferecem.

**Status**: existem ideias via git-like workflow, mas a complexidade de implementação no contexto atual do plugin (single-user Obsidian) é alta. Requer modelagem de "coders" como primeira classe, reconciliação de discordâncias, agregação estatística. **Decidir antes se faz sentido atacar.**

### Projects + Workspace

**Reflexão (2026-03-19)**: O data model proposto reinventa gerenciamento de projetos dentro de um plugin que vive dentro de um app de organização. O Obsidian já tem o core plugin **Workspaces** (salva/restaura layout de panes). A alternativa nativa seria:
- 1 vault = 1 projeto, ou
- Scoping por pasta (plugin lê só arquivos dentro de uma pasta selecionada)
- Integrar com Workspaces em vez de criar infraestrutura paralela

**Conceito original**: Global workspace como "state zero" — usuário codifica livremente. Projetos criados depois para organizar subsets.

**Data model proposto** (preservado para referência — revisar antes de implementar):
```typescript
interface Workspace {
  activeProject: string | null;
  codes: CodeDefinition[];        // global codebook
  segments: Segment[];            // global segments
  projects: QDAProject[];
  settings: { /* ... */ };
}

interface Code extends CodeDefinition {
  scope: 'global' | string;
  parentId?: string;
  memo?: string;
  weight?: number;
  createdAt: number;
}

interface Segment {
  id: string;
  fileId: string;
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  codeIds: string[];
  memo?: string;
  weight?: number;
  created: number;
}

interface QDAProject {
  name: string;
  created: string;
  documents: string[];
  codebook: { codes: Code[]; codeGroups: CodeGroup[] };
  segments: Segment[];
  memos: Memo[];
  documentVariables: { fileId: string; variables: Record<string, any> }[];
  savedQueries: SavedQuery[];
}
```

**File structure proposta**:
```
.obsidian/plugins/qualia-coding/
  workspace.json
  codebook.json
  segments-global.json
  projects/
    <name>/
      project.json
      codebook.json    (overrides locais)
      segments.json
```

**Decisão original**: Códigos compartilhados por referência (ID). Mudança de cor/nome propaga para todos os projetos. Códigos project-specific são scoped.

**Migration**: Migration de `data.json` necessária ao implementar.

**DOM framework**: decision open — Obsidian não oferece reactive components nativamente.

### Research Board Enhancements

Escopo amplo — decidir subset antes de atacar:

| Feature | Detalhe |
|---------|---------|
| Drag do Code Explorer | Arrastar códigos direto da tree (não só da lista de frequência) |
| Sync com registry | Atualizar cor/nome de code cards em real time |
| Context menu "Refresh" | Atualizar contagem de code cards sob demanda |
| Board templates | Layouts pré-definidos (e.g., 2x2 matrix, timeline) |
| Export board | Imagem/PDF do canvas completo |

### Analytical Memos

**Reflexão (2026-03-19)**: Construir sistema de memos dentro de um plugin que vive dentro de um app de notas é irônico. **O Obsidian É o app de memos**. Alternativa nativa: "Convert to Note" que cria arquivo markdown no vault com template de memo analítico (código referenciado, data, tipo de reflexão). O pesquisador escreve no Obsidian normalmente.

Tangencia a ideia de pesquisa de "convert to note" como feature sintética. **Reavaliar abordagem antes de implementar.**

**Conceito original**:
- Memos em códigos, documentos e relações entre códigos
- Separados dos `memo` de markers — são reflexões analíticas
- ~~View dedicada no sidebar~~ → provavelmente desnecessário

---

## Gaps identificados na pesquisa de mercado

### Gaps estratégicos (fundamentados em benchmark)

| Gap | Por que importa | Status |
|-----|----------------|--------|
| ~~**Case/Document Variables**~~ | ~~FEITO — Registry central, popover em todos file types, painel lateral, filter analytics, QDPX round-trip, rename/delete hooks~~ | ✅ 2026-04-21 |
| ~~**REFI-QDA (QDPX) Export/Import**~~ | ~~FEITO — Export QDPX/QDC + Import com resolução de conflitos~~ | ✅ 2026-03-22 |
| ~~**Export CSV/Excel**~~ | ~~FEITO — Analytics exporta CSV de frequencies, co-occurrence, Doc-Code Matrix~~ | ✅ 2026-03-22 |
| **Intercoder Reliability** | Cohen's kappa / Krippendorff's alpha. Esperado por peer reviewers. | [❓ Decisão de produto aberta](#intercoder-reliability) |

### Diferenciais confirmados pela pesquisa

| Diferencial | Status | Concorrência |
|------------|--------|-------------|
| **20 analytics modes** (incl. MCA, MDS, LSA, Polar, CHAID, Relations Network) | Implementado | Zero concorrentes oferecem built-in |
| **REFI-QDA interoperability** (export + import QDC/QDPX) | Implementado | NVivo, ATLAS.ti, MAXQDA cobram licença; QualCoder tem suporte parcial |
| **Parquet support** | Implementado | Único no mercado CAQDAS |
| **Dentro do Obsidian** (vault = dados, zero lock-in) | Implementado | Só o Quadro (muito mais limitado) |
| **7 formatos + unified analytics** grátis | Implementado | Concorrentes cobram $130-1,005/ano |
| **Research Board** (canvas freeform) | Implementado | Zero concorrentes têm equivalent |
| **Margin bars MAXQDA-style** em open source | Implementado | MAXQDA cobra EUR 600+/3 anos |

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

## Items permanentes (ineliminaveis)

| Item | Razão |
|------|-------|
| 3 `as any` PDF viewer | API interna Obsidian não exporta tipos |
| 3 `as any` dataManager deepMerge | Type gymnastics genérica |
| fflate bundled (~8KB gzip) | Dependência do QDPX export — sem alternativa nativa |

---

## ✅ Implementados (registro)

Histórico de features entregues. Mantido como registro, não reabrir.

- **#1 Code Hierarchy** (Fases A/B/C) — 2026-03-22. `codes: CodeApplication[]`, `parentId`/`childrenOrder`/`mergedFrom`, Codebook Panel 3-níveis, MergeModal com busca fuzzy, pastas virtuais (`FolderDefinition`, sem significado analítico), drag-drop, context menu, "New Folder"
- **#5 FuzzySuggestModal para "Add Existing Code"** — 2026-03-21. `CodeBrowserModal` migrado pra `FuzzySuggestModal<CodeDefinition>` nativo. 22 LOC
- **#6 Quick Switcher de Códigos** — 2026-03-21. Command `quick-code`: seleciona texto → fuzzy modal → aplica. Reutiliza `CodeBrowserModal` + `addCodeAction`
- **#8 Analytics Cross-source Comparison** — 2026-03-02. `sourceComparisonMode.ts`. Métricas por source type (markdown, PDF, CSV, image, audio, video)
- **#10 Code Overlap Analysis** — implementado como `overlapMode.ts`. Heatmap de pares com span textual compartilhado
- **#14 Magnitude Coding** (Fase D) — 2026-03-22. `CodeDefinition.magnitude` (nominal/ordinal/continuous), picker fechado, Settings toggle
- **#14b Relations** (Fase E) — 2026-03-22. Label livre com autocomplete, seções colapsáveis, 20ª visualização Analytics (Relations Network), QDPX export como `<Link>`
- **#14c Virtual Folders** (Fase B) — 2026-03-22. `folder?` em CodeDefinition, `FolderDefinition` no registry, drag-drop, context menu, "New Folder"
- **#15 REFI-QDA Export + Import + CSV por modo Analytics** — 2026-03-22. `qdcExporter.ts`, `qdpxExporter.ts`, `qdpxImporter.ts`, modal pre-export/import, conversão de coordenadas por engine, CSV de frequencies/co-occurrence/Doc-Code Matrix
- **#16 Per-Code Decorations** — 2026-03-02. Markdown (CM6) + PDF. N decorations sobrepostas com `opacity / N`, `mix-blend-mode: multiply`
- **#18 Case Variables** — 2026-04-21. Registry central, storage 3-caminhos (frontmatter md + data.json binários), type inference, popover/painel lateral, Analytics filter, QDPX round-trip
- **#19 Tabular export pra análise externa** — 2026-04-24. Branch `feat/tabular-export`. 8 módulos em `src/export/tabular/` (csvWriter, readmeBuilder, buildSegmentsTable, buildCodeApplicationsTable, buildCodesTable, buildCaseVariablesTable, buildRelationsTable, tabularExporter). ExportModal 3ª opção "Tabular (CSV zip)" com toggles `Include relations` / `Include shape coords`. Zip contém 4-5 CSVs (segments, code_applications, codes, case_variables, relations opcional) + README.md com schema e snippets R/tidyverse (dplyr joins) e Python (pandas merge). Consumidor: pesquisador que prefere stats em R/Python em vez de Analytics nativo. RFC 4180 CSV com UTF-8 BOM (Excel auto-detect)
- **#20 Board Export SVG/PNG** — 2026-04-24. Branch `feat/board-export`. `src/analytics/board/boardExport.ts` com `canvas.toSVG({ viewBox })` nativo do Fabric (vetorial) + `canvas.toDataURL` com multiplier 2 (retina). Botões "Export SVG" / "Export PNG" no `boardToolbar`. Bbox scene-coord dos objetos (grid dots ficam de fora — não são Fabric objects). PDF dispensado (SVG cobre caso vetorial melhor sem dep). Chart snapshots saem raster embutidos no SVG (Chart.js não exporta nativo — fora do escopo). Fix pós-smoke test: reset de `viewportTransform` pra identidade dentro do PNG export pra respeitar zoom do viewport — documentado em TECHNICAL-PATTERNS §23
- **#21 Toggle Visibility por Código** — 2026-04-24. Branch `feat/toggle-visibility`. Duas camadas: global (`CodeDefinition.hidden`, toggle pelo eye icon no Code Explorer) + per-doc override (`visibilityOverrides[fileId][codeId]` em `QualiaData`, toggle pelo popover `view.addAction('eye')` no header de cada engine). Semântica B (self-cleaning): overrides só existem enquanto divergem do global — `cleanOverridesAfterGlobalChange` + `shouldStoreOverride` garantem JSON enxuto. Helpers puros em `src/core/codeVisibility.ts` compõem `isCodeVisibleInFile(codeId, fileId)`. Event bus com rAF coalescing (`src/core/visibilityEventBus.ts`) notifica os 6 engines que refrescam pontual (DOM-based: CSV/PDF/Image/Audio/Video) ou rebuild filtrado (CM6 markdown — decorations atômicas). Popover compartilhado em `src/core/codeVisibilityPopover.ts` (blueprint Case Variables). Vault events: `migrateFilePathForOverrides` em rename, `clearFilePathForOverrides` em delete; cleanup de overrides em `registry.delete` cobre merge transitivamente. Analytics e export não são afetados por design (filter só no render layer). 21 novos testes unitários (+8 da baseline → 2108 total).
- **#22 Code Groups (Tier 1.5 estendido)** — 2026-04-24. Branch `feat/code-groups`. Camada flat N:N ortogonal a `parentId` e `folder`. Schema aditivo: `CodeDefinition.groups?: string[]` + `GroupDefinition` (`id, name, color, description?, paletteIndex, parentId?` schema-ready), `QualiaData.registry.groups/groupOrder/nextGroupPaletteIndex`, `GROUP_PALETTE` (8 cores pastéis distintas do `DEFAULT_PALETTE`). Registry API completa em `codeDefinitionRegistry.ts` — CRUD (`createGroup/renameGroup/deleteGroup` com ripple), membership (`addCodeToGroup/removeCodeFromGroup` idempotentes), queries (`getCodesInGroup/getGroupsForCode/getGroupMemberCount`), cor/desc/order (`setGroupColor/setGroupDescription/setGroupOrder`), serialização tolerante a legacy. UI: painel "Groups" collapsible no topo do codebook (`codeGroupsPanel.ts` — chips com dot/name/count, `[+]` PromptModal, right-click menu Rename/Color/Desc/Delete, description editável inline com placeholder "Add description..."), chip contador `🏷N` em code rows (`computeGroupChipLabel`), filter contextual quando group selected (`applyGroupFilterToRowClasses` — borda accent nos membros, fade nos não-membros via `:not(.qc-code-row-hidden)`), seção Groups no Code Detail (chips removíveis + `[+]` FuzzySuggestModal de candidates + descriptions inline), right-click código → "Add to group..." reusa picker, merge preserva union dos groups (audit trail analítico). Analytics: `FilterConfig.groupFilter` com `memberCodeIds` pre-computed em `buildFilterConfig` (evita passar registry em 9 callers de `applyFilters`), `renderGroupsFilter` com chips single-select + fallback dropdown >10 groups, toggle DOM inline (sem re-render do config panel pra preservar event handlers). Export/Import: QDPX `<Sets>` dentro de `<CodeBook>` com custom namespace `xmlns:qualia="urn:qualia-coding:extensions:1.0"` pra `qualia:color`, `<Description>`, `<MemberCode targetGUID>`; `parseSetsFromXml` regex-based pure function (testável isolada) com flag `hadExplicitColor` pra round-robin do GROUP_PALETTE quando QDPX externo (Atlas.ti/MAXQDA) não tem `qualia:color`; `<MemberSource>` ignorado com warning. Tabular CSV: `codes.csv` ganha coluna `groups` (`;`-separated names), novo `groups.csv` standalone, README atualizado com snippets R (separate_rows + left_join) e Python (str.split + explode + merge). 72 novos testes (+~3% baseline). 2108 → 2180 tests.
- **#23 Pastas nested** — 2026-04-26. Branch `feat/nested-folders`. `FolderDefinition` ganhou `parentId?` + `subfolderOrder?`; registry ganhou `folderOrder` mandatório, `setFolderParent` (cycle detection via walk-up + idempotent early-return + reuso de `_insertInList`), `getRootFolders/getChildFolders/getFolderAncestors/getFolderDescendants` (com cycle protection via Set), `createFolder` aceita `parentId?` (dedup parent-scoped, fallback root se inválido), `deleteFolder` cascade (deleta self + descendants + códigos via `_deleteCodeNoEmit`, fires onMutate 1x). `buildFlatTree` recursivo via `visitFolders` simétrico a `visitCodes`, `FlatFolderNode.depth` dinâmico, search auto-expande folder ancestors. Drag-drop folder full (nest/reorder/promote, cycle silent return em `onDragOver`), gated em mode='reorganize'. Context menu "New subfolder" + ConfirmModal cascade preview com count subfolders + códigos + warning "markers will become orphans". Helper `collectAllCodesUnderFolder` em `hierarchyHelpers.ts`. CSS: `white-space: pre-line` em `.codemarker-dialog-message` pra preservar multi-line messages, `padding-left` baseado em depth no folder row. 24 novos tests (folder hierarchy + folder tree depth-3 + drag-drop logic + cascade collect). 2220 tests total.
- **#25 Memos em todas entidades** — 2026-04-27. Branch `feat/memos-todas-entidades`. Schema aditivo: `CodeDefinition.memo`, `GroupDefinition.memo`, `CodeRelation.memo` (compartilhado entre code-level e application-level). Registry: estende `update()` com `'memo'` (Code), `setGroupMemo` dedicado, `setRelationMemo(codeId, label, target, memo)` por tupla (mesmo limite do delete em `baseCodingMenu.ts:585` — duplicates updatam só primeira). UI: plain textarea em Code Detail (`renderCodeMemo` análoga a `renderCodeDescription`, save debounced 500ms + suspendRefresh/resumeRefresh), surface "memo" no painel de group selected + PromptModal via `editGroupMemo` análoga a `editGroupDescription` + item "Edit memo"/"Clear memo" no context menu, ✎ button em existing relation rows do Code Detail (~`detailCodeRenderer.ts:670-733`) abrindo PromptModal — surfaces application-level (`baseCodingMenu.ts`, `detailMarkerRenderer.ts`, `relationUI.renderAddRelationRow`) intocadas conforme decisão #14 (popover de coding aplicação já é denso). Export QDPX: `<MemoText>` em Code, Set, Link com element-form switch (self-closing → open/close); pipeline marker memo via `<NoteRef>` mantido intocado. CSV tabular: coluna `memo` em codes.csv, groups.csv (após description), relations.csv (no fim — code-level populada, app-level vazia até UI lander). Import: `mergeMemos` análoga a `mergeDescriptions` (`existing\n\n--- Imported memo ---\nimported`) pra conflito; parser de `<MemoText>` em Code/Set/Link adicionado sem mexer no pipeline `<NoteRef>` existente. Round-trip schema-ready de `CodeApplication.relations.memo` (test: parseLinks + applyLinks preservam memo de application-level mesmo sem UI escrever). 43 novos testes (15 registry + 6 qdcExporter + 4 qdpxExporter + 6 qdcImporter + 2 qdpxImporter + 1 buildRelationsTable + 4 buildGroupsTable + 5 buildCodesTable). 2264 → 2307 tests.
- **#24 Code × Metadata (Analytics)** — 2026-04-27. Branch `feat/code-metadata`. Modo novo cruzando códigos × Case Variables. 3 arquivos novos: `src/analytics/data/binning.ts` (helpers puros — quartis pra number ≥5 uniques / categórico ≤4 / 1 bin se constante; granularidade auto pra date — UTC, range >2y → ano, 1mo–2y → mês, <1mo → dia; explode multitext em string flat), `src/analytics/data/codeMetadata.ts` (função pura matriz [code × value] + chi² por código), `src/analytics/views/modes/codeMetadataMode.ts` (heatmap canvas 2D + coluna stats + sort interativo + tooltip + CSV). Refactor: `chiSquareFromContingency(observed: number[][])` extraído de `inferential.ts` como helper genérico R×C reutilizável; regression bit-idêntica protegida por testes (Cramér's V usa `min(R-1, C-1)`, equivalente ao legado quando C=2). UI: dropdown Variable + radios Display (Count / % row / % col, com row-click handler) + checkbox Hide missing + banner condicional quando dimensão = variável filtrada. Sort dividido em 2 headers: coluna Code cicla `total desc → total asc → name asc → name desc`, coluna χ²·p cicla `χ² desc → χ² asc → p asc → p desc`. Tooltip de hover (count + % row + % col por célula). Multitext: chi² desabilitado (`—`) por sobreposição de categorias. CSV export com 4 colunas estatísticas vazias pra linhas multitext (R/Python parse-friendly). 25 novos testes unitários (8 helper genérico + 2 regression locks + 16 binning + 9 codeMetadata). Sem persistência de UI state — `cmVariable/cmDisplay/cmHideMissing/cmSort` resetam ao reabrir view (mesmo pattern de `chiGroupBy/chiSort`).

### Bug fixes e dívidas resolvidas

- **§14 Analytics engine (codeId vs name)** — 2026-04-21 (commit `1422bb7`) + normalização canônica (commit `cf09894`, 2026-04-22). UnifiedCode ganhou `id`, markers normalizados no load via `normalizeCodeApplications`. Workbench vault: 241/241 canônico
- **§11.1 Round-trip integrity** — 2026-04-21. 4 bugs críticos no export/import QDPX corrigidos (GUID mismatch, frontmatter duplicado, `vault.create` não persistindo, models sem sync pós-import)
- **§16 Audio/Video scroll persistence** — 2026-04-22 (merge `8d38939`). Mirror `lastKnownScroll` + `setAutoCenter(false)` durante restore
- **§10 Toggle Media Coding** — 2026-04-23. 4 mídias (Image/Audio/Video/PDF) com `autoOpen` + `showButton` simétricos, toggle per-`(leaf, arquivo)` via `pinnedFileByLeaf`, PDF usa instrument/deinstrument in-place. Higiene cosmética (file-menu rename, showButton live, detach actions no onunload) incluída
- **§11 QDPX PDF round-trip** — 2026-04-23 / 2026-04-24. Branch `feat/pdf-text-anchoring`. Export de text markers usa plainText consolidado via pdfjs (`pdfPlainText.buildPlainText`) + `resolveMarkerOffsets` (indexOf com fallback whitespace-normalize). Import cria marker com `{text, page}` + indices placeholder; `resolvePendingIndices` popula indices via DOM text-search no primeiro render. Shape dims reais via `loadPdfExportData` tanto no export (E2) quanto no import (I1, `createMarkersForSource` chama 1x quando a source tem PDFSelection; fallback 612x792 + warning se load falha). Bug latente `PdfCodingModel.save()` sem settings também fixado. Round-trip validado manualmente com `scripts/smoke-roundtrip.sh`. **Pós-validação (2026-04-24, `3202a45`+`cc25439`):** (a) `ensurePdfJsLoaded` abre PDF em leaf escondida pra carregar `window.pdfjsLib` em vault novo — sem isso o importer caía em fallback 612x792 e shapes ficavam deslocados; (b) shape coords renomeadas de `NormalizedShapeCoords` pra `PercentShapeCoords` (escala 0-100, match do viewBox SVG) — XML do export agora sai dentro da spec REFI-QDA em vez de valores gigantes fora de escala
- **§12 Codebook Panel polish (K1-K3)** — 2026-04-22/23. K1 autoReveal removido (órfão), K2 drag-drop visual completo, K3 virtual scroll com row recycling
- **§15 Case Variables edge cases** — 2026-04-22. Emoji/unicode, valor vazio, hot-reload com popover, multi-pane sync
- **§13 Migração Image/Audio/Video para `FileView`** — 2026-04-22. Lifecycle limpo via `onLoadFile`/`onUnloadFile`. `registerFileIntercept` mantido (core-native extensions rejeitam `registerExtensions`)

---

## Fontes

Este roadmap consolida (arquivos originais já arquivados):
- `memory/hierarchy-plan.md` — plano de Code Hierarchy
- `docs/csv/TODO.md` — Parquet + features Saldaña
- `docs/analytics/ROADMAP.md` — Analytics enhancements
- `memory/board-roadmap.md` — Research Board open ideas
- `docs/markdown/ARCHITECTURE.md` — Phases 3-5 (per-code decorations, projects, power features)
- `docs/markdown/POC-RESIZE-HANDLE.md` — Resize handle POC
- `docs/markdown/COMPONENTS.md` — FuzzySuggestModal opportunity
