# ICR Compare Coders + Reconciliação UI (design)

**Data:** 2026-05-09
**Escopo:** UI ICR completa sobre os motores entregues nos slices 1-5. Entrega "View Compare Coders" + "Reconciliação UI" — dois itens listados em `docs/ROADMAP.md > Infra compartilhada > Slices fora do escopo entregue (pendentes)`. Brainstorm consolidou: não são duas features, são três perspectivas do mesmo view + um modal nativo.
**Status:** spec aprovado em brainstorm 2026-05-09. Pronto pra writing-plans.
**Companion docs:**
- `docs/ARCHITECTURE.md §19` (motor ICR — adapters por engine + reporter)
- `docs/ROADMAP.md > Infra compartilhada` (frente ICR — slices 1-5 entregues)
- `obsidian-qualia-coding/plugin-docs/research/ICR — Cenários cobertos e descobertos.md §2.1, §2.2, §5` (gaps in-plugin: ICR completo + negotiated agreement + diferenciador de mercado)
- `obsidian-qualia-coding/plugin-docs/research/Deep Research Report - ICR Qualitative.md §3` (gap multimodal de mercado QDA)
- `src/core/auditLog.ts` (audit log central — base do P3 e da reconciliação)
- `src/core/icr/reporter.ts` + `src/core/icr/coefficients/` (motor κ entregue nos slices 1+4)
- `src/core/icr/coderRegistry.ts` + `src/core/icr/coderTypes.ts` (Coder/CoderRun do slice 1)
- `src/markdown/cm6/marginPanelExtension.ts` (base do P1 spatial)
- `src/core/mergeModal.ts` (referência de pattern Modal + executeMerge)
- `src/core/smartCodes/smartCodeRegistryApi.ts` + `smartCodeListModal.ts` (referência de pattern saved entity hub)

---

## Resumo executivo

`UnifiedCompareCodersView` é um `ItemView` dedicado no workspace do Obsidian. Tem dois andares verticais com mode picker próprio em cada:

- **Overview** — 3 modes coexistindo: Matriz coder × coder · Tabela por código · Heatmap código × engine
- **Drill-down** — 3 perspectivas: P1 espacial (lanes no source) · P2 caso-a-caso (cards de leitura cruzada) · P3 workflow (queue de reconciliação)

Modal nativo `CompareCoderCoefficientsModal` ("ver lado a lado") complementa com tabela completa de coeficientes pra reportar no paper. Saved comparisons (schema novo `comparisons[]`) seguem o pattern do Smart Codes hub.

Reconciliação registrada via 3 audit event types novos (`reconciliation_opened` / `_decided` / `_reverted`) + Coder type estendido com `'consensus'`. 4 ações em P2: `Adotar X` (consensus marker additive, default), `Adotar X (substituir originais)` (overwrite com snapshot pré-state), `Manter divergência` (audit-only, pra "duas leituras válidas"), `Split em código novo`.

Princípio fundador: **toda reconciliação é não-destrutiva no nível do audit**. "Destrutiva" significa apenas no nível dos markers visíveis — `preStateSnapshot` no audit entry preserva reverter.

Decisões cravadas no brainstorm:
- **Q1 (escopo Fase 1):** texto-likes (markdown · pdf-text · csv-segment) + csv-row. Audio/vídeo Fase 2 dessa frente. PDF shape + imagem fora (bbox IoU brainstorm metodológico precede — spec separada `2026-05-09-icr-bbox-adapter-design.md`)
- **Q2 (container):** view dedicada (não mode em Analytics, não modal global)
- **Q3 (overview):** 3 modes coexistindo, sharing filtros e seleção
- **Q4 (drill-down):** 3 perspectivas, cada uma com pergunta visível
- **Q5 (reconciliação):** híbrido audit + memo sempre obrigatório; consensus marker opcional; overwrite opt-in com snapshot
- **Q6 (coeficientes):** picker global (1 ativo) + Modal "ver lado a lado" sob demanda
- **Q7 (entry+estado):** maximalista — ribbon + palette + atalho contextual; default tudo-no-escopo + warning se gigante; saved comparisons como Smart Codes; persistência dentro de cada saved

---

## 1. Arquitetura da view

`UnifiedCompareCodersView` herda de `ItemView` (Obsidian API). Layout interno:

```
┌─ Toolbar sticky ──────────────────────────────────────┐
│ overview-mode · coefficient-picker · filtros · export │
├───────────────────────────────────────────────────────┤
│                                                       │
│  OVERVIEW (modes A · B · C)                           │
│  matriz / tabela / heatmap                            │
│  + label da pergunta que cada mode responde           │
│                                                       │
├───── splitter (drag pra ajustar altura) ──────────────┤
│                                                       │
│  DRILL-DOWN (modes P1 · P2 · P3)                      │
│  lanes / cards / queue                                │
│  + label da pergunta que cada perspectiva responde    │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**Estado central** (`CompareCodersViewState`):

```typescript
interface CompareCodersViewState {
  scope: {
    coderIds: CoderId[];
    codeIds?: string[];      // undefined = todos
    groupIds?: string[];
    folderIds?: string[];
    engineIds?: EngineId[];
    fileIds?: string[];
  };
  overviewMode: 'matrix' | 'table' | 'heatmap';
  drilldownMode: 'spatial' | 'cards' | 'workflow';
  primaryCoefficient: 'cohen' | 'fleiss' | 'alpha' | 'alpha-binary' | 'cu-alpha';
  filters: {
    hideAgreementTotal: boolean;
    highlightConflicts: boolean;
    excludeConsensusCoders: boolean;  // pra κ pré vs pós
  };
  currentSelection:
    | { kind: 'pair'; value: [CoderId, CoderId] }
    | { kind: 'code'; value: string }
    | { kind: 'codeEngine'; value: { codeId: string; engineId: EngineId } }
    | { kind: 'region'; value: { fileId: string; engine: EngineId; bounds: ReconciliationBounds; coderIds: CoderId[] } }
    | { kind: 'none' };
  loadedFromSavedId?: string;  // se aberto de saved comparison
  isDirty: boolean;            // estado divergiu do saved
}
```

**Escrita do estado:** overview escreve `currentSelection`; drill-down lê. Modal "ver lado a lado" lê tudo mas não escreve. Toolbar escreve `overviewMode`/`drilldownMode`/`primaryCoefficient`/`filters`. Filter chips escrevem `filters`/`scope`.

**Dependências de runtime:**
- Reporter (`src/core/icr/reporter.ts`) + coefficients (`src/core/icr/coefficients/`) — slices 1+4
- Adapters per engine (`src/core/icr/textRange.ts`, adapters em `src/core/icr/`) — slices 1+4
- `CoderRegistry` (`src/core/icr/coderRegistry.ts`) — slice 1
- `CodeDefinitionRegistry`
- `auditLog.ts` (helpers puros — append + soft-delete)
- DataManager (pra commit das mutations + listener de re-render)
- Engines existentes pra render do P1 (não cria render novo na Fase 1)

**Helper novo no reporter** (parte do Slice E1): `reportPairwise(inputs, pairs)` em `src/core/icr/reporter.ts` que recebe lista de pares e retorna `{ pair, report }[]` com cada par tendo seu próprio `KappaInput` restrito (filter dos coders fora do par). Necessário porque Cohen κ é o único intrinsecamente pair-keyed; Fleiss/α/α-binary/cu-α são scalar over cohort — pra matriz coder×coder de qualquer coeficiente, calcula-se restrito ao par. Mode A consome este helper.

**EngineId vs EngineType:** spec usa `EngineId` (de `reporter.ts`: `'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'audio' | 'video'`) consistentemente. NÃO usar `EngineType` (de `types.ts`, valores diferentes — `'markdown' | 'pdf' | 'csv' | 'image' | 'audio' | 'video'`). Choice: `EngineId` é a granularidade que o motor ICR opera (segment/row separados em CSV); UI Compare Coders herda essa granularidade.

**Lifecycle:**
- `onOpen()` carrega scope default ou último saved comparison ativo (`loadedFromSavedId`)
- `onClose()` salva `lastUsed` em `data.json` se config não vem de saved
- **Re-render reativo:** `CodeDefinitionRegistry` + `CoderRegistry` + `ComparisonRegistry` já têm `addOnMutate`. Audit log NÃO tem listener nativo (helpers puros) — solução: subscrever ao `DataManager.onSave` (ou criar hook explícito `auditLog.onAppend(fn)` na implementação do E3). Sempre que reconciliação ou nova decisão é commitada, view re-renderiza P3 + recalcula κ exibido

---

## 2. Mudanças no data model

### 2.1 AuditEntry — 3 event types novos sob discriminator `'reconciliation'`

Em `src/core/types.ts`, estender `BaseAuditEntry.entity?` com `'reconciliation'` e append no union `AuditEntry`. Pattern espelha `'smartCode'` — discriminator separa escopo do `codeId` e dos filtros.

`BaseAuditEntry.entity` fica:
```typescript
entity?: 'code' | 'smartCode' | 'reconciliation';
```

Para `entity: 'reconciliation'`, `BaseAuditEntry.codeId` carrega um **anchor code** que define em qual Code Stability Timeline a entry aparece:
- `reconciliation_decided{kind:'adopt'}`: `codeId = decision.codeId` (target code adotado)
- `reconciliation_decided{kind:'split'}`: `codeId = decision.newCodeId` (code novo criado)
- `reconciliation_decided{kind:'accept-divergence'}`: `codeId = candidateCodeIds[0]` (anchor arbitrário — entry aparece no timeline do primeiro candidato; se não houver candidatos, `codeId = ''` e entry só aparece na queue P3)
- `reconciliation_opened`: `codeId = candidateCodeIds[0]` (mesmo critério)
- `reconciliation_reverted`: `codeId` herda do `originalEntryId` referenciado

Append:

```typescript
| (BaseAuditEntry & {
    entity: 'reconciliation';
    type: 'reconciliation_opened';
    region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds };
    coderIds: CoderId[];
    candidateCodeIds: string[];
  })
| (BaseAuditEntry & {
    entity: 'reconciliation';
    type: 'reconciliation_decided';
    region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds };
    coderIds: CoderId[];
    decision: ReconciliationDecision;
    consensusMarkerId?: string;
    memoOfReconciliation: string;
  })
| (BaseAuditEntry & {
    entity: 'reconciliation';
    type: 'reconciliation_reverted';
    originalEntryId: string;
    restoredMarkerIds: string[];
  })

type ReconciliationDecision =
  | { kind: 'adopt'; codeId: string; mode: 'consensus-marker' | 'overwrite-originals'; preStateSnapshot?: MarkerSnapshot[] }
  | { kind: 'split'; newCodeId: string; mode: 'consensus-marker' | 'overwrite-originals'; preStateSnapshot?: MarkerSnapshot[] }
  | { kind: 'accept-divergence' }
  | { kind: 'reject' };

type ReconciliationBounds =
  | { kind: 'text'; from: number; to: number }                          // markdown / pdf-text / csv-segment
  | { kind: 'csvRow'; rowIndex: number; column?: string }                // csv-row
  | { kind: 'temporal'; fromMs: number; toMs: number };                  // audio/vídeo (Fase 2)

interface MarkerSnapshot {
  markerId: string;
  engine: EngineId;
  fileId: string;
  serialized: unknown;  // JSON do marker antes da mutação (round-trip via JSON.parse(JSON.stringify))
}
```

`codeId` no `BaseAuditEntry` carrega o **target code** da decisão (pra appearance no Code Stability Timeline existente). Soft-delete via `hidden` continua funcionando igual aos outros types.

**Coalescing:** nenhum. Cada decisão de reconciliação é atômica. Sem janela de 60s (ao contrário de `description_edited`/`memo_edited`).

**Extensão de `renderEntryMarkdown`** (work item explícito do Slice E3): o switch em `src/core/auditLog.ts` (linha ~118) precisa lidar com os 3 types novos. Sem isso, TS narrowing exhaustiveness quebra build OU entries caem no fallback silencioso e somem do export. Format sugerido:
```
- 2026-05-09 14:30  Reconciliation opened: 3 coders on "trecho..."
- 2026-05-09 14:32  Reconciliation decided: adopted "Frustração" (consensus marker)
- 2026-05-09 14:35  Reconciliation reverted (entry: audit_xyz)
```
Soft-delete (`hidden`) e filter functions (`getEntriesForCode`) tratam reconciliação como qualquer outra entry — anchor `codeId` decide em qual timeline aparece.

### 2.2 Coder type — `'consensus'` adicional

Em `src/core/icr/coderTypes.ts`:

```typescript
type CoderKind = 'human' | 'llm' | 'consensus';
```

`CoderId` continua `${kind}:${slug}`. Convenção: 1 vault → 1 consensus coder default (`'consensus:default'`); múltiplos permitidos pra workflows com waves de reconciliação (`'consensus:wave-1'`, `'consensus:final'`).

**Método novo no `CoderRegistry`** (`src/core/icr/coderRegistry.ts`): `createConsensus(slug: string, displayName?: string): Coder`. Retorna `Coder` com `id: 'consensus:${slug}'`, `name: displayName ?? 'Consensus (${slug})'`, `type: 'consensus'`, `createdAt: Date.now()`. Idempotente — se já existe, retorna o existente.

`fromJSON` round-trip: já é genérico (itera array de `Coder` e re-popula Map). Aceita `'consensus'` automático sem mudança no método. Validar via teste.

**Bloqueio em coding ativo:** UI bloqueia codificar como `consensus:*`. Pontos de entrada (callsites de marker creation):
- `src/markdown/cm6/codingPopover.ts` (popover de seleção de código no markdown)
- `src/core/baseCodingMenu.ts` (menu compartilhado de coding)
- Equivalentes em PDF / CSV / image / audio / video

Helper novo no registry: `getCodableCoders(): Coder[]` — retorna `coders.filter(c => c.type !== 'consensus')`. UI lista só esses no picker. Tentativa de submit com `codedBy: 'consensus:*'` via API direta (testes / scripts) é permitido — bloqueio é só UX layer.

### 2.3 SavedComparison schema

Em `src/core/types.ts` (`QualiaData`):

```typescript
interface SavedComparison {
  id: string;          // sc_cmp_*
  name: string;
  scope: ComparisonScope;
  view: {
    overviewMode: 'matrix' | 'table' | 'heatmap';
    drilldownMode: 'spatial' | 'cards' | 'workflow';
    primaryCoefficient: 'cohen' | 'fleiss' | 'alpha' | 'alpha-binary' | 'cu-alpha';
  };
  filters: ComparisonFilters;
  createdAt: number;
  updatedAt: number;
}

// QualiaData ganha:
comparisons: { definitions: Record<string, SavedComparison>; order: string[] };

// E persistence ephemeral (fora de saved comparisons):
lastCompareCodersUsed?: { scope: ComparisonScope; view: ...; filters: ... };
```

Pattern espelha `smartCodes` (`{ definitions, order, nextPaletteIndex? }`). Sem palette index — saved comparisons não têm cor visível.

### 2.4 Marker — `codedBy: 'consensus:*'` já cabe

Schema atual de `BaseMarker.codedBy?: CoderId` (slice 1) recebe consensus IDs sem mudança. Markers de consensus são criados por `executeReconciliationDecision`, não por UI de coding.

### 2.5 Migration

Zero. Todos os campos novos são opcionais/aditivos:
- `comparisons` ausente → inicializa `{ definitions: {}, order: [] }`
- `lastCompareCodersUsed` ausente → comportamento default
- Audit entries antigos não têm os novos types — TS narrowing continua válido
- Coders antigos sem `'consensus'` → válidos; consensus é criado on-demand quando primeira reconciliação com `mode:'consensus-marker'` dispara

---

## 3. Overview modes (3 modes coexistindo)

### 3.1 Mode A — Matriz coder × coder

**Pergunta visível:** `qual par de coders diverge mais?`

**Render:** grade `N × N` onde `N = scope.coderIds.length`. Diagonal cinza com "—". Célula `(i, j)` (`i ≠ j`) pinta com `primaryCoefficient` calculado entre `coderI` e `coderJ` via `reportPairwise(inputs, [[coderI, coderJ]])` (helper novo descrito em §1). Para Cohen κ pareado, lê direto de `reportKappa(inputs).aggregate.cohenKappa[`${coderI}|${coderJ}`]` (já é per-pair). Para Fleiss/α/α-binary/cu-α que são scalar over cohort, `reportPairwise` filtra `KappaInput` pra incluir só os 2 coders do par e roda `reportKappa` reduzido — resultado vai pra célula.

**Color scale (não-configurável):**
- `< 0.4` vermelho (`#c1352e`)
- `0.4 – 0.6` laranja (`#d68c45`)
- `0.6 – 0.8` verde claro (`#52b788`)
- `> 0.8` verde escuro (`#2d6a4f`)
- n/a cinza (`#444`)

**Interação:**
- Click célula → `currentSelection = { kind: 'pair', value: [coderI, coderJ] }`
- Drill-down recebe seleção e mostra os markers comuns desse par (P1) ou cards do trecho selecionado (P2 não auto-abre, requer cell click do P1)

**Limites:**
- `N = 8` ainda lê confortavelmente; `N ≥ 10` adverte "matriz grande, considerar filtrar coders" mas renderiza
- Par com zero markers comuns → "—" cinza com tooltip `sem markers em comum no escopo`

### 3.2 Mode B — Tabela por código

**Pergunta visível:** `qual código está frágil?`

**Render:** linhas = códigos no `scope.codeIds` (ou todos se undefined); colunas = 5 coeficientes texto-likes (`Cohen κ pareado` · `Fleiss κ` · `Krippendorff α` · `α-binary` · `cu-α`). Para CSV row mostra 3 categóricos (Cohen · Fleiss · α). Coluna extra `# markers` antes dos coeficientes.

**Default sort:** pior κ no topo (sort por `Cohen κ` ascendente; n/a pro fim).

**Cohen κ vs Fleiss κ:** Cohen κ aparece se `scope.coderIds.length === 2`; Fleiss aparece se `≥ 3`. O outro fica "—" (não n/a — apenas inaplicável pro tamanho do escopo).

**Interação:**
- Click linha → `currentSelection = { kind: 'code', value: codeId }`
- Drill-down mostra markers desse código de todos os coders no escopo

### 3.3 Mode C — Heatmap código × engine

**Pergunta visível:** `em qual modalidade mora a discordância?`

**Render:** grade `codes × engines`. Linhas = códigos; colunas = engines no `scope.engineIds` (Fase 1: markdown · pdf-text · csv-segment · csv-row). Célula = `primaryCoefficient` do código naquela engine. Cinza translúcido se código não aparece nessa engine.

**Default sort:** pior κ médio cross-engines no topo.

**Interação:**
- Click célula → `currentSelection = { kind: 'codeEngine', value: { codeId, engineId } }`
- Drill-down filtra markers daquele código + daquela engine

### 3.4 Filter chips no toolbar

```
[esconder agreement total] [destacar conflitos]
```

- `esconder agreement total` — filtra células/linhas com κ > 0.8. Útil pra focar em discordância
- `destacar conflitos` — adiciona borda vermelha em células < 0.4

Ambos são `filters.*` no estado. Aplicáveis em todos 3 modes.

### 3.5 Compartilhamento de estado entre modes

Trocar de mode preserva seleção quando faz sentido:
- A → B: se seleção era `pair`, vira `none` (mode B não tem conceito de par); se era `code` ou `region`, mantém
- A → C: se seleção era `pair`, vira `none`; se era `code`, mantém (heatmap mostra esse code em todas engines)
- B → A: se seleção era `code`, vira `none` (matriz não filtra por código)
- B → C: se seleção era `code`, mantém
- C → A: se seleção era `codeEngine`, vira `none`
- C → B: se seleção era `codeEngine`, vira `code` com `codeId` correspondente

### 3.6 Pergunta visível abaixo do mode name

Subtítulo persistente pra o usuário não se perder no significado do mode atual:

```
[▦ Matriz] · qual par de coders diverge mais?
[▤ Tabela] · qual código está frágil?
[▥ Heatmap] · em qual modalidade mora a discordância?
```

Implementação: texto small abaixo do label do chip ativo. UX cheap, refatora se virar redundante.

---

## 4. Drill-down — 3 perspectivas

### 4.1 P1 — Espacial · "onde, no source?"

**Pergunta visível:** `#1 onde discordamos? · #2 que tipo?`

**Render por engine:**

**markdown · pdf-text · csv-segment** (texto-likes, Fase 1):
- Reaproveita `marginPanelExtension.ts`. Cada coder no escopo vira uma sub-coluna no margin panel
- Cada marker do coder fica como `[ code-label ]` colorido com a cor do código (preserva pattern atual)
- Stripe vertical à direita das colunas = `agreement intensity` por linha de texto:
  - Verde: todos coders concordam (mesmo código + bounds próximos)
  - Laranja: boundary disagreement (concordam que tem código, divergem em bounds)
  - Vermelho: code disagreement (mesma região, códigos diferentes)
  - Cinza: nenhum coder marcou
- Limit prático: 4-5 coders renderizam confortável; 6+ vira fallback (lanes finas sem label, label só on hover) — registrado em backlog

**csv-row** (Fase 1):
- Linha do CSV recebe N background colors empilhados (1 por coder, com transparência)
- Border-left por coder no header da row
- Tooltip por hover mostra `[ coder | code | memo ]` por marker
- Plug-in point: `src/csv/csvCodingView.ts` (renderer da grid AG Grid Infinite). Marker styling existente já usa `cellStyle` callback — extensão recebe N coders e gera gradient de N cores. Header injection via `src/csv/csvHeaderInjection.ts` pra border-left por coder

**audio · vídeo** (Fase 2):
- Timeline horizontal com lanes verticais por coder
- Segmentos coloridos por código
- Caminho conhecido (alinhado com ATLAS.ti 25)

**Filter chips do P1** (no topo do P1, complementam os do toolbar):
- Liga/desliga coders individualmente
- "destacar conflitos" replica o do toolbar mas escopado ao file aberto

**Interação:**
- Click numa região contestada (qualquer marker de qualquer coder) → `currentSelection = { kind: 'region', value: { fileId, engine, bounds, coderIds } }`
- Drill-down troca pra P2 automaticamente (ou usuário escolhe trocar via picker)

### 4.2 P2 — Caso-a-caso · "o que cada um disse aqui?"

**Pergunta visível:** `#3 o que cada um leu? · #4 por que diferimos?`

**Render:**
- Header: preview do trecho contestado + `fileId` + `engine` + bounds (formatados por engine: chars X-Y, ms X-Y, row Z)
- Grid de cards (1 por coder no `region.coderIds`)
- Cada card mostra:
  - Nome do coder + chip de tipo (`human` / `llm` / `consensus`)
  - Código aplicado (chip colorido com a cor do código) — ou "∅ não codificou" se ausente
  - Magnitude (se config existe pro código)
  - Memo do marker (texto livre, render markdown)
  - Bounds específicos do marker desse coder

**Footer — 4 ações de reconciliação:**

#### `Adotar [código X]` (additive default)

- Dropdown lista códigos candidatos (todos que aparecem nos cards)
- Cria 1 marker `{ codedBy: 'consensus:default', codes: [{ codeId: X }], bounds: <decididos>, fileId, engine }`
- Markers originais intactos
- Emite `reconciliation_decided{ kind:'adopt', mode:'consensus-marker', codeId:X, consensusMarkerId, region, coderIds, memoOfReconciliation }`

**Bounds do consensus marker:** default = união dos bounds dos coders que tinham marker na região (boundary mais inclusiva). Override: usuário edita bounds via handles antes de confirmar.

#### `Adotar [código X] (substituir originais)` (overwrite, opt-in)

- Acessível via toggle no confirm dialog do `Adotar X`
- Para cada `markerOriginal` dos coders perdedores:
  1. Snapshot pra `preStateSnapshot[]` (`{ markerId, engine, fileId, serialized }`)
  2. `removeCodeApplication(srcCodeId)` + `addCodeApplication(X)`
- Markers do coder vencedor já com X intactos
- Emite `reconciliation_decided{ kind:'adopt', mode:'overwrite-originals', codeId:X, preStateSnapshot, region, coderIds, memo }`

**UX warning no confirm:** "Markers originais serão modificados. Reverter restaura via audit. Continuar?"

#### `Manter divergência` (audit-only)

- Zero mudança em markers
- Emite `reconciliation_decided{ kind:'accept-divergence', region, coderIds, memo }`
- Card do P3 vai pra coluna "Divergência aceita"

#### `Split em código novo`

- Abre mini-modal pra criar code novo (nome + cor + opcional description/memo)
- Cria CodeDefinition (audit `created` automático via registry)
- Cria consensus marker no novo code (mesmo padrão de `Adotar X` additive, mas no `newCodeId`)
- Emite `reconciliation_decided{ kind:'split', newCodeId, mode:'consensus-marker', consensusMarkerId, region, coderIds, memo }`

#### Memo de reconciliação

- Campo de texto livre persistente acima das ações
- Salva no `AuditEntry.memoOfReconciliation: string` quando confirma
- **Soft-required:** UI avisa "memo vazio dificulta reabrir essa decisão" mas permite confirmar
- V1 = string simples; V1+1 vira `MemoRecord` se aparecer demanda de markdown linkado

#### Estado pós-decisão

- Região marcada como "decidida" em P3
- P1 marca a região com badge `✓ resolvido` (verde claro), persistente até reverter
- Outras regiões contestadas ainda visíveis no P1

### 4.3 P3 — Workflow · "qual o status do trabalho?"

**Pergunta visível:** `#5 como reconcilio? · #6 como fica registrado?`

**Render:** queue/kanban-light com 4 colunas:

#### Abertos

- Regiões contestadas no escopo que ainda não têm `reconciliation_decided` no audit
- Source de verdade: derivado computando regiões com κ < 1.0 entre os coders no escopo, menos as já decididas
- Cada card mostra: trecho · pares de códigos divergentes · # coders envolvidos
- Click → carrega P2 com a região

#### Em discussão

- Estado intermediário emit por `reconciliation_opened`
- Disparado quando usuário "abre" P2 sem decidir (user pode marcar como `Em discussão` explicitamente, ou inferimos automático via timeout? — escolho **explícito** via botão `Marcar pra revisão`)
- **Decisão V1:** incluir mas opcional. Default: usuário não interage com `reconciliation_opened` — abre P2 e decide ou fecha. Se quiser anotar "olhei, mas vou voltar depois", clica `Marcar pra revisão` no P2

#### Resolvidos

- Regiões com `reconciliation_decided{ kind: 'adopt' | 'split' }`
- Card mostra: trecho · decisão · código adotado · timestamp · linka audit entry + P2

#### Divergência aceita

- Regiões com `reconciliation_decided{ kind: 'accept-divergence' }`
- Card destacado em cor diferente (roxo)

**Interação:**
- Click em qualquer card → carrega região no P2 (revisar / reverter)
- Filter no header de cada coluna: mostrar só X coluna

**Reverter** (botão no card de Resolvidos / Divergência aceita):
- Emite `reconciliation_reverted{ originalEntryId, restoredMarkerIds }`
- Se decisão foi `adopt/consensus-marker` ou `split/consensus-marker`: deleta o consensus marker
- Se decisão foi `adopt/overwrite-originals`: restaura cada marker do `preStateSnapshot`
- Se decisão foi `accept-divergence`: nada pra restaurar nos markers; só marca audit como reverted
- Se decisão foi `split`: deleta consensus marker mas **NÃO deleta o code criado** (pode ter sido reusado)
- Card volta pra "Abertos"

**Export do P3** — botão `Exportar relatório de reconciliação` no header:
- Markdown estruturado com timeline de decisões + memos + κ pré e pós (quando `excludeConsensusCoders` está disponível)
- Esta é a feature que entrega "negotiated agreement com audit trail" — gap de mercado documentado em `Deep Research Report - ICR Qualitative.md §3`

**Performance:** queue de "Abertos" pode ter muitos itens em vault grande. Render virtualizado seguindo pattern de `tabularView` (AG Grid Infinite já usado).

### 4.4 Pergunta visível em cada perspectiva

Mesma técnica do overview — subtítulo persistente abaixo do mode name no picker do drill-down. Sem decoração; texto puro.

### 4.5 κ pré vs pós reconciliação

Reporter ganha flag `excludeConsensusCoders: boolean` (default `false`):
- `false` (default): inclui consensus coders no cálculo. Útil pra ver "quanto cada coder se aproxima do consensus"
- `true`: exclui consensus coders. Mostra κ entre coders humanos/originais — útil pra reportar ICR sem viés de consensus

Toggle no toolbar (`filters.excludeConsensusCoders`). Modal "ver lado a lado" mostra **as duas colunas** (com e sem) quando há consensus coders no escopo.

---

## 5. Reconciliação — função orquestradora + adapter de markers

`executeReconciliationDecision(params)` em `src/core/icr/reconciliation.ts` (novo arquivo). Diferença com `executeMerge` (`src/core/mergeModal.ts`): `executeMerge` opera sobre 1 array `BaseMarker[]` injetado pelo caller — é puro sobre 1 engine de cada vez, e o caller (em `baseCodeDetailView.ts`) sabe qual engine. Reconciliação **opera cross-engine** (decisão pode envolver markers de markdown + pdf + csv simultaneamente em casos M:N) e precisa de creation/deletion/update genérico — então NÃO segue o pattern direto de `executeMerge`. Em vez disso, recebe um adapter `IcrMarkerOps` que abstrai as 5 engines.

### 5.1 IcrMarkerOps — façade per-engine

Interface nova em `src/core/icr/markerOps.ts`:

```typescript
interface IcrMarkerOps {
  /** Cria marker novo na engine indicada. Retorna o marker criado (com id alocado). */
  createMarker(engine: EngineId, spec: { fileId: string; bounds: ReconciliationBounds; codeIds: string[]; codedBy: CoderId }): { markerId: string };

  /** Remove marker por id. No-op se não existir. */
  removeMarker(engine: EngineId, fileId: string, markerId: string): void;

  /** Update mutable fields. Re-aplicável (mesmo que o registry pattern). */
  updateMarker(engine: EngineId, fileId: string, markerId: string, fields: { codes?: CodeApplication[] }): void;

  /** Snapshot serializável do marker pra revert. */
  serializeMarker(engine: EngineId, fileId: string, markerId: string): MarkerSnapshot;

  /** Restore marker via snapshot. Engine-specific: markdown re-insere; PDF re-attach a fileMetadata; CSV reconstrói row anchor. */
  restoreMarker(snapshot: MarkerSnapshot): void;

  /** Encontra markers que sobrepõem uma região. Pra coletar coders perdedores no overwrite-mode. */
  findMarkersInRegion(region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds }): { markerId: string; codedBy: CoderId; codes: CodeApplication[] }[];
}
```

Implementação concreta `IcrMarkerOpsImpl` no `main.ts` da plugin instance, wrappando os 5 engine models existentes (markdown via `codeMarkerModel`, PDF via `pdfModel`, CSV via `csvModel`, áudio/vídeo via seus models). Mapping engine → método específico fica em uma única tabela. Detalhe per-engine fica pro plan; spec garante que as 5 engines têm operações equivalentes (`createMarker`/`removeMarker`/etc) — verificável grep'ando os models.

### 5.2 Função orquestradora

```typescript
interface ReconciliationParams {
  region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds };
  coderIds: CoderId[];
  decision: ReconciliationDecision;
  memoOfReconciliation: string;
  consensusBounds?: ReconciliationBounds;  // override pra union default
  consensusCoderId?: CoderId;              // default 'consensus:default'

  // dependências injetadas
  registry: CodeDefinitionRegistry;
  coderRegistry: CoderRegistry;
  log: AuditEntry[];
  markerOps: IcrMarkerOps;
}

interface ReconciliationResult {
  ok: boolean;
  reason?: 'invalid-region' | 'consensus-coder-creation-failed' | 'code-not-found';
  consensusMarkerId?: string;
  newCodeId?: string;          // se decision.kind === 'split'
  preStateSnapshot?: MarkerSnapshot[];
  auditEntryId: string;        // id da entry emitida
}

function executeReconciliationDecision(params: ReconciliationParams): ReconciliationResult;
function executeReconciliationRevert(originalEntryId: string, params: Omit<ReconciliationParams, 'region' | 'coderIds' | 'decision' | 'memoOfReconciliation' | 'consensusBounds' | 'consensusCoderId'>): ReconciliationResult;
```

### 5.3 Pipeline

**Pipeline (ações `adopt` / `split`):**
1. Valida region (engine válida, bounds parseáveis)
2. Garante consensus coder no registry (`coderRegistry.createConsensus(slug)` — idempotente)
3. Se `decision.kind === 'split'`, cria CodeDefinition nova via `registry.create(...)` e captura `newCodeId`
4. Determina `targetCodeId`: `decision.kind === 'adopt' ? decision.codeId : newCodeId`
5. Se `mode === 'overwrite-originals'`: `markerOps.findMarkersInRegion(region)` → para cada marker dos coders perdedores: `serializeMarker` pra `preStateSnapshot[]`; `markerOps.updateMarker` trocando o code original pelo `targetCodeId`
6. Cria consensus marker: `markerOps.createMarker(engine, { fileId, bounds: consensusBounds ?? unionOfCoderBounds, codeIds: [targetCodeId], codedBy: consensusCoderId ?? 'consensus:default' })`
7. Emite `reconciliation_decided` no audit log via `appendEntry(log, { entity: 'reconciliation', type: 'reconciliation_decided', codeId: targetCodeId, region, coderIds, decision: { ...decision, preStateSnapshot, ... }, consensusMarkerId, memoOfReconciliation, at: Date.now() })`
8. Retorna `ReconciliationResult`

**Pipeline (ação `accept-divergence`):**
1. Valida region
2. Emite `reconciliation_decided{ kind: 'accept-divergence' }` no audit (codeId = `candidateCodeIds[0]` ou `''`)
3. Retorna `{ ok: true, auditEntryId }`

**Pipeline (revert):**
1. Procura `originalEntryId` no audit (helper pequeno que filtra por id)
2. Branch por `decision.kind` + `mode`:
   - `adopt/consensus-marker` ou `split/consensus-marker`: `markerOps.removeMarker(engine, fileId, consensusMarkerId)`. `restoredMarkerIds = [consensusMarkerId]`
   - `adopt/overwrite-originals` ou `split/overwrite-originals`: pra cada `MarkerSnapshot`, `markerOps.restoreMarker(snapshot)`. `restoredMarkerIds = snapshots.map(s => s.markerId)`
   - `accept-divergence`: nada. `restoredMarkerIds = []`
3. Emite `reconciliation_reverted{ originalEntryId, restoredMarkerIds }` no audit (codeId herda do original)

**Pure-ish?** Recebe `log` + `markerOps` por referência. `log` mutates via `appendEntry` (in-place, idempotente). `markerOps` é side-effecting (dispara mutations nos engine models). Caller dispara `dataManager.commit()` pra persistir. Padrão alinhado com `executeMerge` pattern indireto (registry mutations dentro do pipeline disparam audit + persistência via DataManager).

---

## 6. Modal "ver lado a lado"

`CompareCoderCoefficientsModal extends Modal` em `src/core/icr/compareCoderCoefficientsModal.ts`.

**Estados iniciais:**
- **Par único:** vem de cell click em Mode A. Filtra pelo par `[coderI, coderJ]`. Mostra `agregado + breakdown per-engine × 5 coeficientes`
- **Todos os pares:** vem do botão `↗ ver lado a lado` no toolbar sem cell selecionada. Mostra `pares × 5 coeficientes` (sem per-engine breakdown por padrão; expand por linha pra revelar)

Toggle no header pra alternar sem fechar modal:

```
[par único] [todos os pares]
```

**Coeficientes "n/a":**
- α-binary / cu-α em CSV row → cinza com tooltip "categórico, sem boundary"
- Cohen κ em escopo com 3+ coders → "—" (use Fleiss)
- Fleiss κ em par → "—" (use Cohen)

**Diagnóstico narrativo** (caixa amarela opcional, V1 ativo, dismissable):
- Padrões reconhecíveis surge automático:
  - `Cohen κ baixo + α-binary alto` → "discordam de qual código aplicar, mas concordam que tem código no trecho. Reconciliação por escolha de código mais útil que ajuste de bounds."
  - `Cohen κ baixo + α-binary baixo` → "boundary disagreement substancial — coders divergem em onde marcar. Reconciliação por ajuste de bounds antes de discutir código."
  - `cu-α << κ` → "concordância em boundary mas com código diferente — code-within-boundary é um sub-fenômeno relevante."
- Configurável via setting `icr.showNarrativeDiagnosis` (default `true`)

**Footer:**
- `↧ exportar markdown` (do conteúdo atual do modal — par único OU todos os pares)
- `Fechar` (ou Esc / click fora)

**Format do export markdown:**
```markdown
# Coeficientes ICR · <scope summary>

**Data:** <timestamp>
**Coders:** <names>
**Markers comuns no escopo:** <count>

| par / engine | Cohen κ | Fleiss | α | α-binary | cu-α |
|---|---|---|---|---|---|
...

**Warnings:**
- <aggregateWarnings se houver>
```

---

## 7. Saved Comparisons hub

`CompareComparisonsListModal extends Modal` em `src/core/icr/compareComparisonsListModal.ts`. Pattern espelha `SmartCodeListModal`.

**UI:**
- Header: `Saved Comparisons` + search input + botão `+ Nova`
- Lista cards:
  - Nome da comparison (bold)
  - Summary do escopo: "marlon, joana · 12 codes · markdown only"
  - Timestamp `updatedAt` formatado
  - Kebab menu: `Rename · Duplicate · Delete`
- Click card → abre `UnifiedCompareCodersView` configurada com aquela comparison (via `view.loadFromSaved(comparisonId)`)

**`CreateComparisonModal extends Modal`:**
- Form: nome (text input) + scope picker (4 chips de domínio: coders / codes / engines / files; cada um expand pra multiselect) + view defaults (3 modes selectables) + filters defaults
- Submit cria saved + abre view nessa config

**API do registry** em `src/core/icr/comparisonRegistry.ts`:
```typescript
class ComparisonRegistry {
  create(name: string, scope, view, filters): SavedComparison;
  rename(id: string, newName: string): boolean;
  delete(id: string): void;
  duplicate(id: string): SavedComparison;
  getById(id: string): SavedComparison | undefined;
  getAll(): SavedComparison[];
  toJSON() / fromJSON();
  addOnMutate(fn);  // pattern padrão
}
```

**Audit pra mutations de saved comparisons?** Não. Saved comparisons são preferência de UX, não decisão analítica. Sem audit entry types pra `comparison_created`/`renamed`/`deleted`.

**Estado "dirty" no toolbar:** quando `loadedFromSavedId` está setado e estado divergiu do saved:
- Indicador visual: `●` antes do nome da comparison no toolbar
- Botão `Salvar mudanças` aparece — atualiza saved com estado atual
- Botão `Salvar como nova` aparece — abre `CreateComparisonModal` pré-preenchido

**Persistência sem saved:** se `loadedFromSavedId` é undefined, `onClose()` salva `lastCompareCodersUsed` em `data.json`. `onOpen()` próximo carrega esse estado se nenhum saved for explicitamente aberto.

---

## 8. Entry points

### 8.1 Ribbon icon

- Ícone novo: `users-2` (lucide) — disponível na API do Obsidian
- `setIcon(ribbonEl, 'users-2')` no `onload` do plugin
- Click → executa command `Compare Coders: Open` (mesmo callback)

### 8.2 Command palette

3 comandos novos em `main.ts`:

```typescript
this.addCommand({
  id: 'compare-coders-open',
  name: 'Compare Coders: Open',
  callback: () => openCompareCodersView(this.app, /* default scope */),
});

this.addCommand({
  id: 'compare-coders-open-hub',
  name: 'Compare Coders: Open hub',
  callback: () => new CompareComparisonsListModal(this.app, this.comparisonRegistry).open(),
});

this.addCommand({
  id: 'compare-coders-new',
  name: 'Compare Coders: New comparison',
  callback: () => new CreateComparisonModal(this.app, this.comparisonRegistry).open(),
});
```

### 8.3 Atalho contextual no codebook

Em `unifiedCodeExplorerView.ts`, no `Menu.addItem` do contexto de um code:

```typescript
menu.addItem(item => {
  item.setTitle('Ver κ deste código entre coders')
      .setIcon('users-2')
      .onClick(() => openCompareCodersView(this.app, {
        scope: { codeIds: [thisCodeId], coderIds: getAllCoderIds() },
        view: { overviewMode: 'table' /* foco no código */, drilldownMode: 'spatial', primaryCoefficient: 'cohen' },
      }));
});
```

Estado **ephemeral** (não cria saved). Pattern de "atalho contextual" já existe no plugin (bulk operations no codebook).

### 8.4 Estado default ao abrir sem saved

- `scope`: `{ coderIds: <todos>, codeIds: undefined, engineIds: undefined }` (tudo)
- `overviewMode`: `'matrix'`
- `drilldownMode`: `'spatial'`
- `primaryCoefficient`: `'cohen'`

**Warning de escopo grande:** **fora da V1.** Default sempre calcula com escopo completo; pesquisador filtra manualmente se ficar lento. Otimização "warning + estimate count" entra em backlog (§11) — depende de helper `estimateMarkerCount` que ainda não existe e adicionar agora seria specing pra cenário hipotético.

---

## 9. Slice plan

### Slice E1 — Skeleton + Mode A + P1 spatial

**Entrega:** "vc consegue ver onde os coders divergem"

**Escopo:**
- `UnifiedCompareCodersView` (ItemView + estado central + toolbar + 2 mode pickers)
- Helper novo `reportPairwise` em `src/core/icr/reporter.ts`
- Overview Mode A (matriz coder × coder) com **Cohen κ hardcoded** (sem coefficient picker — entra no E2)
- Drill-down P1 (spatial lanes) pra markdown + pdf-text + csv-segment
- CSV row: lane simples (linha colorida) com `cellStyle` callback no AG Grid
- Filter chips: liga/desliga coders + "destacar conflitos"
- Entry point: command palette `Compare Coders: Open`
- Read-only (sem reconciliação)
- Sem saved comparisons, sem modal, sem ribbon

**Smoke real obrigatório:**
1. Abre view via palette
2. Vê matriz 4x4 com Cohen κ entre coders sintéticos
3. Clica numa célula com κ < 0.5
4. Drill-down P1 mostra lanes do par no source (markdown + csv segment)
5. Filter chip "destacar conflitos" funciona

### Slice E2 — Modes B/C + Modal "ver lado a lado"

**Entrega:** "pronto pra paper"

**Escopo:**
- Overview Mode B (tabela por código com 5 coeficientes)
- Overview Mode C (heatmap código × engine)
- Coefficient picker funcional (5 chips, disabled apropriado)
- Modal `CompareCoderCoefficientsModal` (par único + todos os pares + breakdown per-engine + export markdown + diagnóstico narrativo)
- Filter chip "esconder agreement total"

**Smoke real obrigatório:**
1. Abre view, troca pra Mode B, vê tabela ordenada por κ
2. Troca pra Mode C, vê heatmap
3. Clica `↗ ver lado a lado` → modal abre
4. Toggle entre par único / todos os pares
5. Click `↧ exportar markdown` → arquivo gerado
6. Caixa de diagnóstico aparece quando padrão reconhecível

### Slice E3a — Schema + executeReconciliationDecision + P2 cards

**Entrega:** "consigo fazer 1 decisão de reconciliação e ela fica registrada"

**Escopo:**
- Schema: extensão `entity?: 'reconciliation'` + 3 audit types `reconciliation_*` + extensão de `renderEntryMarkdown`
- Coder type `'consensus'` em `coderTypes.ts` + `createConsensus` em `coderRegistry.ts` + `getCodableCoders()` helper
- UI bloqueio em coding ativo (filtro `getCodableCoders()` em popovers das 5 engines)
- `IcrMarkerOps` interface + `IcrMarkerOpsImpl` no main.ts wrappando os 5 engine models
- `executeReconciliationDecision` + `executeReconciliationRevert` (função orquestradora)
- Drill-down P2 (cards lado a lado + 4 ações + memo de reconciliação)
- Audit entries aparecem na Code Stability Timeline existente do anchor code

**Smoke real obrigatório:**
1. Em P1, click numa região contestada → drill-down troca pra P2
2. P2 mostra cards dos coders com código, magnitude, memo
3. Click `Adotar Frustração` → consensus marker criado em vault, audit entry visível na Timeline do código `Frustração`
4. Click `Reverter` no audit timeline → consensus marker some
5. Repete com `Adotar X (substituir originais)` → markers originais mudam, snapshot preservado em audit
6. Reverter restaura markers originais via snapshot
7. `Manter divergência` registra no audit sem mudar markers
8. `Split em código novo` cria code novo + consensus marker no novo code
9. `Manter divergência` com `candidateCodeIds = []` resulta em entry com `codeId = ''` — verifica que aparece em P3 (E3b) mas não polui Code Stability Timeline de nenhum code (corner case)

### Slice E3b — P3 queue + κ pré/pós + export relatório

**Entrega:** "consigo ver o pipeline de reconciliação e exportar relatório pro paper"

**Escopo:**
- Drill-down P3 (queue 4 colunas: Abertos / Em discussão / Resolvidos / Divergência aceita)
- Lógica derivada do "Abertos" — computa regiões com κ < 1.0 entre coders no escopo, menos as decididas
- Reverter via P3 (botão no card)
- Export relatório markdown estruturado (timeline + memos + κ pré e pós)
- Toggle `excludeConsensusCoders` no toolbar + reporter flag correspondente
- Modal "ver lado a lado" mostra coluna pré + pós quando há consensus coders

**Smoke real obrigatório:**
1. Após várias decisões em E3a, abre P3
2. Vê cards distribuídos nas 4 colunas
3. Click card de `Resolvidos` → carrega P2 com a região
4. Click `Reverter` no card → card volta pra `Abertos`
5. Toggle `excludeConsensusCoders` no toolbar → matriz/heatmap recalculam
6. Click `Exportar relatório de reconciliação` → markdown gerado com timeline completa

### Slice E4 — Saved Comparisons + ribbon + contextual

**Entrega:** maximalista da Q7

**Escopo:**
- Schema `comparisons[]` em `QualiaData` + `lastCompareCodersUsed`
- `ComparisonRegistry` + `CompareComparisonsListModal` + `CreateComparisonModal`
- Comandos: `Open hub` + `New comparison`
- Estado dirty no toolbar + `Salvar mudanças` / `Salvar como nova`
- Ribbon icon
- Atalho contextual no codebook (`Ver κ deste código entre coders`)
- Persistência da `lastUsed` quando não vem de saved

**Smoke real obrigatório:**
1. Abre via ribbon, ajusta filtros, fecha view
2. Reabre → última config carregada
3. Click `+ Nova` → cria saved "Piloto 2026"
4. Fecha view, reabre via hub → saved carregado
5. Mexe nos filtros → `●` aparece, botão `Salvar mudanças` visível
6. Click `Salvar mudanças` → saved atualizado
7. No codebook, right-click num code → `Ver κ deste código entre coders` abre view com escopo filtrado

---

## 10. Testing strategy

**Vitest + jsdom** (regra do projeto):

| Tipo | Coverage |
|---|---|
| **Unit puro** | `executeReconciliationDecision` (4 ações × 2 modes = 8 cases), `executeReconciliationRevert` (cada decision kind), filter logic do scope, propagação de seleção overview→drill-down, `ComparisonRegistry` CRUD + roundtrip JSON, audit entry shape validation |
| **Component (jsdom)** | Render matrix/tabela/heatmap com 4 coders fictícios, coefficient picker re-renderiza células, modal "ver lado a lado" abre filtrado, hub modal lista comparisons, P2 cards renderizam corretamente por região, P3 queue agrupa por status |
| **Synthetic data** | Estende `ICR-test/` (slice 1) com 4-coder scenarios incluindo 1 consensus pré-criado em alguns casos, csv-row markers, regiões com diferentes tipos de discordância (boundary / code / existência) |
| **Smoke real obrigatório** | Cada slice (E1-E4) tem checklist de smoke explícito acima |

**Estimativa de testes:** ~80-120 testes novos no total dos 5 slices (E1, E2, E3a, E3b, E4), em linha com slices ICR anteriores (Slice 1 = 62, Slice 2 = 24, Slice 3 = 26, Slice 4 = 23, Slice 5 = 10).

**Test fixtures pra diagnóstico narrativo (§6):** as regras hardcoded que disparam as caixas amarelas precisam de testes que validem trigger correto pra cada padrão (`κ<X + α-binary>Y` etc). Listar fixtures com valores limítrofes pra confirmar não disparar em cenários adjacentes.

**Test file structure:**
```
tests/icr/
  reconciliation.test.ts        // executeReconciliationDecision + revert
  comparisonRegistry.test.ts    // saved comparisons CRUD
  compareCodersView.test.ts     // view state + selection propagation
  compareCoderCoefficientsModal.test.ts
  drilldownP1.test.ts           // lanes rendering
  drilldownP2.test.ts           // cards + actions
  drilldownP3.test.ts           // queue + revert
  overviewMatrix.test.ts        // mode A
  overviewTable.test.ts         // mode B
  overviewHeatmap.test.ts       // mode C
```

---

## 11. Backlog / out of scope

Registrar em `docs/BACKLOG.md` quando frente fechar:

- **Audio/vídeo adapters em P1** — timeline lanes (Fase 2 dessa frente, decidida em Q1)
- **PDF shape + imagem em P1** — bbox IoU. Brainstorm metodológico precede; spec separada `2026-05-09-icr-bbox-adapter-design.md`
- **Wizard B2** — empty state + scope picker antes de calcular. Reentra se aparecer demanda de "tô perdido, me guie"; default agora é tudo-no-escopo
- **Lanes finas pra 6+ coders em P1** — fallback quando colunas viram apertadas; label só on hover
- **Estado "Em discussão" no P3 automático** — V1 só explícito (botão); auto-detect via timeout pode entrar se workflow real demandar
- **`memoOfReconciliation` como `MemoRecord`** — V1 string simples; subir pra MemoRecord se quiser markdown linkado / cross-entity links
- **Diagnóstico narrativo configurável** — V1 default ativo; setting `icr.showNarrativeDiagnosis` se virar ruído pra power-user
- **Audit pra mutations de saved comparisons** — V1 sem audit (preferência de UX). Reentra se for útil ter trace
- **Multi-vault saved comparisons sync** — fora de escopo dessa frente
- **Re-cálculo incremental do reporter** — V1 recalcula full byEngine quando seleção/scope muda. Reporter granular (só recalcula o que mudou) entra se latência reportar
- **Pre-warm de durações de media files** — já registrado em backlog ICR Slice 4; bate aqui se Compare Coders abrir scope grande de áudio/vídeo na Fase 2
- **`estimateMarkerCount(scope)` + warning de escopo grande** — V1 sempre calcula full; pesquisador filtra manualmente se ficar lento. Otimização entra se latência reportar em vault grande

---

## 12. Decisões assentadas — sumário

| # | Decisão | Onde virou regra |
|---|---|---|
| Q1 | Escopo Fase 1 = texto-likes + csv-row | Slice E1 (P1 só esses 4 engines) |
| Q2 | View dedicada `UnifiedCompareCodersView` (não mode em Analytics) | §1 Arquitetura |
| Q3 | 3 overview modes coexistindo | §3 |
| Q4 | 3 drill-down perspectivas com pergunta visível | §4 |
| Q5 | Híbrido D — audit + memo sempre + consensus marker opcional + overwrite opt-in com snapshot | §2.1 + §5 |
| Q6 | Picker global de coeficiente + Modal "ver lado a lado" sob demanda | §3.4 + §6 |
| Q7 | Maximalista — ribbon + palette + contextual; default tudo-no-escopo + warning grande; saved comparisons como Smart Codes | §7 + §8 |

**Princípios fundadores** (citáveis em discussões futuras):
- Toda reconciliação é **não-destrutiva no nível do audit**. "Destrutiva" só pra markers visíveis; snapshot preserva reverter
- **Compare Coders + Reconciliação UI = mesma view**. ROADMAP listava como 2 features; brainstorm consolidou como P2+P3 do drill-down
- **3 perspectivas no drill-down respondem 6 perguntas analíticas distintas**. P1 = onde+tipo; P2 = leitura cruzada+por que; P3 = como+como fica registrado
- **Pergunta visível em cada mode**. UX cheap; refatora se virar redundante
- **Reuso máximo de infra existente**: marginPanel, auditLog, memoHelpers, executeMerge pattern, Modal pattern, smartCodes-style hub
- **Saved comparisons sem audit**: UX preference, não decisão analítica
