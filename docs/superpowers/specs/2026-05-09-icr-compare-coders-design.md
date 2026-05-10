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
- `src/core/marginPanelExtension.ts` (base do P1 spatial)
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
- Motor κ (`src/core/icr/motor.ts` + adapters por engine — slices 1+4)
- Reporter (`src/core/icr/reporter.ts` — slice 4)
- `CoderRegistry` (slice 1)
- `CodeDefinitionRegistry`
- `auditLog.ts`
- Engines existentes pra render do P1 (não cria render novo na Fase 1)

**Lifecycle:**
- `onOpen()` carrega scope default ou último saved comparison ativo (`loadedFromSavedId`)
- `onClose()` salva `lastUsed` em `data.json` se config não vem de saved
- Re-render reativo a mudanças no `auditLog`/`registry` via listeners existentes (`addOnMutate`)

---

## 2. Mudanças no data model

### 2.1 AuditEntry — 3 event types novos

Em `src/core/types.ts`, append no union `AuditEntry`:

```typescript
| (BaseAuditEntry & {
    type: 'reconciliation_opened';
    region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds };
    coderIds: CoderId[];
    candidateCodeIds: string[];
  })
| (BaseAuditEntry & {
    type: 'reconciliation_decided';
    region: { fileId: string; engine: EngineId; bounds: ReconciliationBounds };
    coderIds: CoderId[];
    decision: ReconciliationDecision;
    consensusMarkerId?: string;
    memoOfReconciliation: string;
  })
| (BaseAuditEntry & {
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

### 2.2 Coder type — `'consensus'` adicional

Em `src/core/icr/types.ts` (ou onde `CoderKind` mora):

```typescript
type CoderKind = 'human' | 'llm' | 'consensus';
```

`CoderId` continua sendo `${kind}:${slug}`. Convenção: 1 vault → 1 consensus coder default (`'consensus:default'`); múltiplos permitidos pra workflows com waves de reconciliação (`'consensus:wave-1'`, `'consensus:final'`).

**Bloqueio em coding ativo:** UI dos engines bloqueia "codificar como consensus:*" — o coder só recebe markers via `executeReconciliationDecision`. Validação no submit dos popovers de coding.

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

**Render:** grade `N × N` onde `N = scope.coderIds.length`. Diagonal cinza com "—". Célula `(i, j)` (`i ≠ j`) pinta com `primaryCoefficient` calculado entre `coderI` e `coderJ` via reporter `byCoderPair` agregado.

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

## 5. Reconciliação — função pura

`executeReconciliationDecision(params)` em `src/core/icr/reconciliation.ts` (novo arquivo). Padrão de `executeMerge` (`src/core/mergeModal.ts`).

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
  data: QualiaData;
  log: AuditEntry[];
}

interface ReconciliationResult {
  ok: boolean;
  reason?: 'invalid-region' | 'consensus-coder-creation-failed' | 'code-not-found';
  consensusMarkerId?: string;
  newCodeId?: string;          // se decision.kind === 'split'
  preStateSnapshot?: MarkerSnapshot[];
}

function executeReconciliationDecision(params: ReconciliationParams): ReconciliationResult;
function executeReconciliationRevert(originalEntryId: string, params: ...): ReconciliationResult;
```

**Pipeline (ações `adopt` / `split`):**
1. Valida region (engine válida, bounds parseáveis)
2. Garante consensus coder no registry (cria se ausente)
3. Se `mode === 'overwrite-originals'`: snapshot dos markers dos coders perdedores em `preStateSnapshot`; mutate `codes` via `removeCodeApplication` + `addCodeApplication`
4. Cria consensus marker via engine model (`addMarker` ou equivalente do MarkerInterface). Se `kind === 'split'`, antes cria CodeDefinition nova
5. Emite `reconciliation_decided` no audit log com todos os campos preenchidos
6. Retorna `ReconciliationResult`

**Pipeline (ação `accept-divergence`):**
1. Valida region
2. Emite `reconciliation_decided{ kind: 'accept-divergence' }` no audit
3. Retorna `{ ok: true }`

**Pipeline (revert):**
1. Procura `originalEntryId` no audit
2. Branch por `decision.kind`:
   - `adopt/consensus-marker` ou `split/consensus-marker`: deleta consensus marker pelo `consensusMarkerId`
   - `adopt/overwrite-originals` ou `split/overwrite-originals`: pra cada `MarkerSnapshot`, restaura marker via deserialize
   - `accept-divergence`: nada
3. Emite `reconciliation_reverted{ originalEntryId, restoredMarkerIds }`

**Função pura?** Recebe `data`, `log` por referência. Mutates in-place (igual a `executeMerge`). Caller dispara via `dataManager.commit()` pra persistir.

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

**Warning de escopo grande:** se `<estimateMarkerCount(scope)>` excede `10_000`, mostra notice "Escopo grande, considerar filtrar antes de calcular κ" mas **não bloqueia**. Pesquisador escolhe.

---

## 9. Slice plan

### Slice E1 — Skeleton + Mode A + P1 spatial

**Entrega:** "vc consegue ver onde os coders divergem"

**Escopo:**
- `UnifiedCompareCodersView` (ItemView + estado central + toolbar + 2 mode pickers)
- Overview Mode A (matriz coder × coder) com Cohen κ default
- Drill-down P1 (spatial lanes) pra markdown + pdf-text + csv-segment
- CSV row: lane simples (linha colorida)
- Filter chips: liga/desliga coders + "destacar conflitos"
- Entry point: command palette `Compare Coders: Open`
- Read-only (sem reconciliação)
- Sem saved comparisons, sem modal, sem ribbon

**Smoke real obrigatório:**
1. Abre view via palette
2. Vê matriz 4x4 com κ entre coders sintéticos
3. Clica numa célula com κ < 0.5
4. Drill-down P1 mostra lanes do par no source
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

### Slice E3 — Reconciliação UI (P2 + P3)

**Entrega:** "negotiated agreement com audit trail"

**Escopo:**
- Schema: 3 audit types `reconciliation_*` + Coder type `'consensus'`
- `executeReconciliationDecision` (função pura) + `executeReconciliationRevert`
- Drill-down P2 (cards lado a lado + 4 ações + memo de reconciliação)
- Drill-down P3 (queue 4 colunas + revert + export relatório)
- Consensus marker creation + overwrite-mode com snapshot
- κ pré vs pós (toggle `excludeConsensusCoders`)
- Audit entries aparecem na Code Stability Timeline existente

**Smoke real obrigatório:**
1. Em P1, click numa região contestada → drill-down troca pra P2
2. P2 mostra 3 cards (1 por coder)
3. Click `Adotar Frustração` → consensus marker criado, P3 atualiza coluna `Resolvidos`
4. Toggle `excludeConsensusCoders` → κ recalcula
5. Click `Reverter` em P3 → consensus marker some, card volta pra `Abertos`
6. Repete com `Adotar X (substituir originais)` → markers originais mudam, snapshot preservado
7. Reverter restaura snapshot
8. `Manter divergência` registra no audit sem mudar markers

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

**Estimativa de testes:** ~80-120 testes novos no total dos 4 slices, em linha com slices ICR anteriores (Slice 1 = 62, Slice 2 = 24, Slice 3 = 26, Slice 4 = 23, Slice 5 = 10).

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
