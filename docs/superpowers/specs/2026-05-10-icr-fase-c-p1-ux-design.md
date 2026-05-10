# ICR Fase C P1 — UX layer (Import/Export)

**Data:** 2026-05-10
**Status:** Design (pré-spec-review)
**Depende de:** Slice 3 (Fase C P0 transport puro — `extractCoderContribution`, `mergeCoderContribution`, PayloadV1, ConflictRecord)

## 1. Visão geral

Camada UX sobre o motor de transport multi-coder remoto (Slice 3, já entregue). Slice 3 expõe funções puras chamáveis via console DevTools — sem comando, sem menu, sem UI. Esta spec preenche a lacuna.

**Decisão arquitetural cravada:** uma única ItemView "ICR Import" agnóstica ao N de contribuições. Single-coder, multi-coder humano, LLM batch — todos passam pelo mesmo fluxo. Reusa pattern `qc-cc-mode-chip` (`unifiedCompareCodersView.ts:67-114`, `compareCoderCoefficientsModal.ts:78`, `analyticsView.ts viewMode`) pra trocar perspectiva sobre a mesma contribuição.

**Decisão derivada:** sem modal paralelo, sem setting global de merge mode, sem dialog de entrada perguntando "como você quer revisar". O cenário é do user — sistema é agnóstico.

### 1.1. Out of scope nesta spec

- **Persistência da rail** — rail é session-only. Fechou Obsidian, dropa de novo. Arquivo .json no disco é source of truth.
- **Document Cloning estilo Dedoose** (blind coding sem transport offline serializado).
- **Merge driver via git.**
- **Conflict policy configurável** — default = incoming-wins (atual do motor) com override per-item via UI (manter local). Sem setting global.
- **Marker collision como conflito do motor** — markers de coders diferentes coexistem (mesmo segment com codes diferentes não é conflito; cada um tem seu `codedBy`). Revisão é interpretativa, não merge. Sem dedup automática.
- **Conflitos de `description`, `memo`, `group_overwritten`** — `ConflictRecord` union em `payloadTypes.ts:47-53` lista `code_overwritten` field=`description|memo` e `memo_overwritten` mas o motor **não emite** esses (schema-ready, never emitted — verificado em `mergeCoderContribution.ts:60-92`). UI desta spec só renderiza o que o motor emite hoje: `code_overwritten` field=`name|color`, `source_*`, `codebook_diverged`. Group merge é "skip se já existe" (motor §5, linha 81-92) — sem overwrite, sem conflict.
- **Engines fora do PayloadV1** — Slice 3 cobre só `markdown`, `pdf`, `csvSegment` (`payloadTypes.ts:31-35`). Audio/video/csvRow/pdfShape/image **não entram em export nem import** nesta spec. Markers desses engines no vault local ficam intactos; markers desses engines no coder remoto ficam fora do payload.

## 2. Surface única: ItemView "ICR Import"

**View type:** `qc-icr-import`
**Display:** "ICR Import"
**Ícone:** `git-pull-request` (ou similar — confirma com obsidian-design)

### 2.1. Layout

```
┌────────────────────────────────────────────────────────────────┐
│ [rail 200px]    │  [toolbar: chips + meta + sub-pergunta]      │
│ Pending (N)     │  ─────────────────────────────────────       │
│  ▸ Carla        │  [body: renderiza chip ativo]                │
│  ▸ Bruno        │                                              │
│  ▸ llm:gpt-4    │                                              │
│  [drop zone]    │                                              │
└────────────────────────────────────────────────────────────────┘
```

### 2.2. Rail esquerda

- Lista de contribuições pendentes (in-memory, session-only)
- Cada item: nome do coder + meta (count markers, badge se tem divergência)
- Click seleciona → re-renderiza body
- Drop zone abaixo da lista (drop .json carrega + adiciona à rail; rejeita se não bater PayloadV1 schema)
- Estado vazio: drop zone ocupa o espaço todo + texto "drop arquivo .json ou Cmd P → ICR: Open import"

### 2.3. State

```ts
interface IcrImportViewState {
  pending: PendingContribution[];
  activeId: string | null;
  activeChip: 'overview' | 'side-by-side' | 'by-code';
}

interface PendingContribution {
  id: string;                    // uuid local
  payload: PayloadV1;
  sourcePath: string;            // path do .json no filesystem (display)
  mergePreview: MergeResult;     // roda mergeCoderContribution numa COPY do data pra computar conflicts sem aplicar
  overrides: ResolutionOverrides; // user choices (manter local / accept / skip)
}

interface ResolutionOverrides {
  codebookOverrides: Map<string /* codeId */, 'local' | 'incoming' | 'add-as-new'>;
  sourceOverrides: Map<string /* payloadFileId */, 'trust-local' | 'skip-source' | { kind: 'map-manual'; localFileId: string }>;
  perMarkerSkip: Set<string /* markerId */>;
  perCodeSkip: Set<string /* codeId */>;
}
```

`mergePreview` é computado via **dry-run no motor** (NÃO via clone do `localData` — clonar `QualiaData` é não-trivial: registries com métodos, marker arrays cross-engine, `SourceHashRegistry` instance methods).

**Pré-requisito P0 desta spec:** estender `mergeCoderContribution` com parâmetro `options?: { dryRun?: boolean }` que, quando `true`, computa `MergeResult` (conflicts + counts + remap) **sem** mutar `localData`. Mudança pequena: guardar todas as mutações sob `if (!options?.dryRun)`, retornar accumulated conflicts/counts. Sem isso, P1 não fecha.

`mergePreview` recomputado a cada mudança de overrides (re-roda dry-run). Otimização incremental fica pra plan se ficar lento.

## 3. Chips e perguntas-âncora

3 chips no toolbar (pattern `qc-cc-mode-chip`) + sub-pergunta itálica embaixo (igual `modeQuestion` do `unifiedCompareCodersView.ts:108-114`):

| Chip | Pergunta-âncora | Quando usar |
|---|---|---|
| ▦ **Visão geral** | *"o batch como um todo bate? (resolve divergências, depois apply)"* | Default. High-trust = resumo + Apply. Tem divergência? Expande seções inline. |
| ▤ **Lado a lado** | *"esse marker bate com o que eu codificaria? (accept/skip por marker)"* | Audit/rigor. Navega marker-by-marker. Filter chip secundário: [todos] [só sobrepondo local] [só novos]. |
| ▥ **Por código** | *"qual código tá divergindo mais? (revisão temática, til pra LLM batch)"* | Spot-check temático. Agrupa markers da contribuição por code, mostra contagem local vs incoming + overlap. Batch actions per code. |

## 4. Visão geral (chip default) — seções inline

Em vez de um chip "Divergências" separado, todas as ações de resolução vivem dentro do chip Visão geral como seções colapsáveis. Lead vê tudo numa tela; Apply na mesma tela.

### 4.1. Seções (em ordem)

1. **⚠ Codebook divergiu** (border laranja, expanded por default se houver) — uma diff row por code afetado:
   - `code_overwritten` field=`name` → "code_42 · name: 'ANSIEDADE' (local) ↔ 'ANSIEDADE-ESCOLAR' (Carla)" + botões `[Manter local]` `[Aceitar Carla (default)]`
   - `code_overwritten` field=`color` → mostra swatches lado a lado, mesma escolha
   - Code novo (existe em payload, não em local) → `[Skip (não importa)]` `[Adicionar ao codebook]`
   - **Não renderizado:** `code_overwritten` field=`description|memo` e `memo_overwritten` (motor não emite — ver §1.1).

2. **⚠ Sources com problemas** (border vermelho, expanded por default) — uma row por source affetada:
   - `source_hash_mismatch` → "P03.md · 45 markers · você editou esse arquivo depois" + `[Trust local (offsets podem desalinhar)]` `[Skip source]`
   - `source_not_found` → "P11.md · 42 markers · arquivo não existe local" + `[Map manual...]` `[Skip source]`
   - `multiple_hash_matches` → "X.md · N markers · 2 arquivos local com mesmo hash" + dropdown pra escolher

3. **✓ Pronto pra importar** (border verde, collapsed por default) — counts limpos: "113 markers · 5 codes · 0 conflitos"

### 4.2. Footer

```
[Apply (N_in markers — N_out ficam fora)]  [Discard contribution]
N_out = N_pending + N_skipSource + N_skipCode + N_skipMarker
```

Onde:
- `N_pending` = `MergeResult.pendingMarkers` após overrides (markers cujo source remap falhou E user não escolheu `trust-local` ou `map-manual`)
- `N_skipSource` = Σ markers cujo `payloadFileId` tem `sourceOverrides[fid] = 'skip-source'`
- `N_skipCode` = Σ markers cujo `codeId` ∈ `perCodeSkip`
- `N_skipMarker` = `|perMarkerSkip|`
- `N_in` = total markers do payload − N_out (sem dupla contagem; ordem de aplicação dos filtros: skipSource ⊃ skipCode ⊃ skipMarker ⊃ pending)

Subtitle: `"resolva os N_out pendentes acima ou pula eles"` (sumido se N_out=0).

- "Apply" chama `mergeCoderContribution(localData, payload, hashRegistry, { dryRun: false, overrides })` aplicando os `overrides` (motor estendido, ver §2.3).
- "Discard contribution" remove da rail (não toca data.json).

### 4.3. Edge case — codebook + source perfeitos

Se a contribution não tem nenhuma divergência, seções 1-2 não aparecem. Seção 3 fica expanded. Footer = `[Apply (200)]` direto. Caminho high-trust = 1 click.

## 5. Lado a lado (chip)

Marker-by-marker. Filter chip secundário (segunda linha do toolbar):
- `[todos]` (default)
- `[só sobrepondo local]` — predicate por engine:
  - **markdown:** mesmo `fileId` (após remap) + ranges overlap (`incoming.range.from < local.range.to && local.range.from < incoming.range.to`)
  - **pdf:** mesmo `fileId` + mesma `page` + ranges overlap (mesma fórmula)
  - **csvSegment:** mesmo `fileId` + row ranges overlap (`incoming.fromRow ≤ local.toRow && local.fromRow ≤ incoming.toRow`)
  - Reusar helpers de overlap existentes em `src/core/icr/overlap.ts` (kappa motor já tem range overlap puro).
- `[só novos]` — markers em segments sem nada local (negação do predicate acima)

Card de marker:
```
"...quando ela falou que não conseguia mais ir pra escola..."
┌─────────────────────────┬─────────────────────────┐
│ Local (você)            │ Carla                   │
│  [— sem marker —]       │  [ANSIEDADE-ESCOLAR]    │
│                         │  memo: "boundary começa │
│                         │  antes, na fala do pai" │
└─────────────────────────┴─────────────────────────┘
[Accept (mantém Carla)]  [Skip (não importa esse)]
```

- Header: "marker 17/200 · ⌨ ←/→ navega"
- Source: "P03.md · range 245-318"
- Skip adiciona marker.id ao `overrides.perMarkerSkip`. Accept = noop (default é importar).
- Atalho: `←` `→` navega; `S` skip; `A` accept (= próximo).

**Linkagem ao segment:** clicar no texto do marker abre o arquivo no Obsidian na posição correta (reusa pattern de drilldown do Compare Coders).

## 6. Por código (chip)

Agrupa markers da contribuição por code. Cada code = um bloco:

```
ANSIEDADE-ESCOLAR · Carla aplicou 47x · você 12x · overlap 8
─────────────────────────────────────────────────────────
47 markers da Carla (12 que você também marcou, 35 só dela).
[Accept all 47]  [Skip all]  [Revisar 1-a-1 →]
```

- "Revisar 1-a-1 →" muda chip pra Lado a lado com filter aplicado (só markers desse code).
- "Accept all" = noop (default).
- "Skip all" adiciona codeId ao `overrides.perCodeSkip` → todos markers desse code da contribuição ficam fora do Apply. **Comportamento adicional:** se o code é novo (não existe local ainda), "Skip all" também adiciona ao `codebookOverrides[codeId] = 'add-as-new' → 'skip'` pra que a definição **não** seja adicionada ao codebook local — evita poluir codebook com codes sem markers. Se o code já existia local, "Skip all" só skipa markers (definição local intocada).

Ordenação: codes com mais markers da contribuição primeiro. Codes que existem só na contribuição (não local) marcados "novo".

## 7. Triggers

### 7.1. Export

**Botão no toolbar do Compare Coders View** (modificar `unifiedCompareCodersView.ts:91`, adjacente ao `↗ ver lado a lado`):

```
[↗ exportar contribuição]
```

Fluxo:
1. Filtra `coderRegistry.getAll()` por `type === 'human'` (definição em `coderTypes.ts:15`).
2. Se 0 humanos → Notice "Nenhum coder humano registrado" + abort.
3. Se 1 humano → skip seleção, usa esse coder.
4. Se >1 humano → abre `Modal` pequeno (Obsidian `Modal`, não large) com radio list de coders + botão Confirm/Cancel.
5. Roda `extractCoderContribution(data, coderId, hashRegistry)`.
6. Pasta destino: salva em `vault.adapter.basePath/icr-exports/` (cria se não existe — vault-relative). Nome: `<coder.name slug>-<exportedAt ISO>.json`. Sem file picker do OS (mantém vault-relative — Obsidian-friendly).
7. Notice de sucesso com path relativo.

**Comando palette (sempre):** `ICR: Export my contribution` — mesmo fluxo (passos 1-7).

### 7.2. Import

**Item ribbon (barra esquerda):** ícone `git-pull-request` → label "ICR Import" → click abre/foca a ItemView.

**Comando palette (sempre):** `ICR: Open import` (mesmo).

**Drop arquivo:** registrar `dragenter` / `dragover` / `drop` via `view.registerDomEvent(dropZoneEl, 'drop', handler)` no elemento drop zone da rail (NÃO no contentEl inteiro — evita capturar drops de notas/links do próprio Obsidian). Handler:
1. `event.preventDefault()` em todos 3.
2. Lê `event.dataTransfer.files` — array de File.
3. Filter por extensão `.json`. Não-json → Notice "só arquivos .json" + abort.
4. Pra cada arquivo: `await file.text()` → `contributionLoader.parse()` → se válido, push em `pending`; se inválido, Notice com erro específico (não bloqueia outros arquivos do mesmo drop).
5. Após processar todos: seleciona o último válido (`activeId = lastValid.id`).

Drop fora da drop zone → comportamento default do Obsidian (sem captura).

## 8. Componentes / módulos novos

Tudo em `src/core/icr/contributions/` (nome cobre import + export — `import/` seria contraditório com `exportTrigger.ts`):

```
src/core/icr/contributions/
  contributionViewTypes.ts — IcrImportViewState, PendingContribution, ResolutionOverrides
  unifiedIcrImportView.ts  — ItemView (rail + toolbar + body re-render)
  importToolbar.ts         — chips + sub-pergunta + meta header
  overviewChip.ts          — Visão geral: seções inline (codebook + sources + ok + footer Apply)
  sideBySideChip.ts        — Lado a lado: marker-by-marker, accept/skip, navegação ←/→
  byCodeChip.ts            — Por código: agrupa, batch actions
  divergenceResolver.ts    — função pura: dado MergeResult + ResolutionOverrides, computa contagens efetivas pro footer (N_in, N_out, decomposição) — espelha §4.2
  contributionLoader.ts    — parse + valida arquivo .json como PayloadV1 (rejeita formato inválido com Notice)
  rail.ts                  — lista lateral + drop zone (componente UI)
  exportTrigger.ts         — orquestra export: filter coders, modal seleção (>1), chama extractCoderContribution, escreve arquivo
```

**Modificações em arquivos existentes:**
- `src/core/icr/transport/mergeCoderContribution.ts` — adicionar parâmetro `options?: { dryRun?: boolean; overrides?: ResolutionOverrides }`. `dryRun` skipa mutações (computa só conflicts/counts); `overrides` aplica skip/manter durante a aplicação. Patch P0 pré-requisito (ver §2.3).
- `src/core/icr/transport/payloadTypes.ts` — adicionar `ResolutionOverrides` ao export (compartilhado entre motor e UI).
- `src/core/icr/ui/unifiedCompareCodersView.ts:91` — adicionar segundo botão `↗ exportar contribuição` chamando `exportTrigger.ts`.
- `src/main.ts onload()`:
  - `addRibbonIcon('git-pull-request', 'ICR Import', () => openIcrImportView())`
  - Register view type `qc-icr-import`
  - Register commands: `ICR: Open import` + `ICR: Export my contribution`

## 9. Reuso de patterns existentes

| Pattern | Origem | Reuso aqui |
|---|---|---|
| `qc-cc-mode-chip` (chip toolbar) | `unifiedCompareCodersView.ts:67-78` | Chips Visão geral / Lado a lado / Por código |
| `modeQuestion` (sub-pergunta itálica) | `unifiedCompareCodersView.ts:108-114` | Pergunta-âncora abaixo dos chips |
| Filter chips secundários | `filterChips.ts` (Compare Coders) | "todos / só sobrepondo / só novos" no Lado a lado |
| ItemView com `updateState({...})` re-render | `unifiedCompareCodersView.ts:55-61` | Mesmo shape pra import view |
| Modal grande pra "ver lado a lado" | `compareCoderCoefficientsModal.ts` | NÃO reusado aqui (decisão: tudo na view) |

## 10. Slicing

**1 slice único.** Justificativa:
- ItemView com 3 chips compartilha state e re-render — quebrar em "P1.1 só Visão geral, P1.2 Lado a lado depois" exige refactor do state shape entre slices.
- Motor (Slice 3) já entrega quase tudo; P1 é UI + 1 patch P0 (parâmetro `options` no merge — ver §2.3).
- Lado a lado não é luxo — é o caminho audit, sem ele a ferramenta não cobre o cenário paper-rigor.

**Estimativa de testes:** sem comparável idêntico no projeto (ICR slices anteriores: Slice 3 = 26 testes só de transport puro sem UI; Slice E2 ≈ 60+ testes de UI Compare Coders). Esta spec mistura motor patch (pequeno) + UI (~3 chips + rail). Plan vai cravar o número via decomposição em chunks; não estimar agora.

## 11. Testing

### 11.1. Unit (vitest + jsdom)

**`contributionLoader.parse()`:**
- Payload v1.0 válido → retorna `{ payload, errors: [] }`
- Payload com `version: '2.0'` → erro "version não suportada"
- Json malformado → erro "parse"
- Faltando campos required (`coder`, `markers`, etc) → erro detalhando o que falta

**`mergeCoderContribution(..., { dryRun: true })`** (motor patch):
- Roda dry-run → retorna mesmo `MergeResult.conflicts`/`pendingMarkers`/`fileIdRemap` que apply real
- `localData` não muta (verificar registries inalterados após chamada)
- `dryRun: false` (ou ausente) → comportamento atual mantido (regression)
- Com `overrides`: `codebookOverrides[code_42] = 'local'` skipa overwrite desse code · `sourceOverrides[fid] = 'skip-source'` skipa todos markers do source · `perCodeSkip` / `perMarkerSkip` skipam respectivos · combinação ordem-independente

**`divergenceResolver` (puro, espelha §4.2):**
- Dado `MergeResult` + `ResolutionOverrides` + `PayloadV1`, retorna `{ N_in, N_out, breakdown: { pending, skipSource, skipCode, skipMarker } }`
- Sem dupla contagem (markers em skipSource não contam de novo em skipCode mesmo se code também tá em perCodeSkip)
- Idempotente

**Render snapshot dos 3 chips:**
- Payload mock com 1 codebook diff + 1 source mismatch + 1 source not found + 50 markers limpos
- Visão geral: 3 seções renderizadas, counts corretos no footer
- Lado a lado: marker 1/50 renderizado com local + incoming, navegação muda índice
- Por código: blocos por code, ordenados por count desc

**Rail:**
- Drop arquivo válido → adiciona à `pending` + seleciona auto
- Drop inválido → Notice de erro, não adiciona
- Click muda `activeId` + re-render
- Apply remove da rail
- Discard remove da rail

### 11.2. Integration smoke (manual no vault — checkpoint obrigatório)

Cravado em `CLAUDE.md §1` ("Testes verde ≠ feito"):

**Vault A (export):**
- 1 coder humano + 5 codes + 20 markers em 3 sources (P01.md, P02.md, P03.md)
- Abre Compare Coders View → click `↗ exportar contribuição`
- Salva como `mockcoder-{ts}.json`

**Vault B (import):**
- Codebook divergente: 1 code do vault A renomeado local
- 1 source com hash diff (editou P03.md depois do export)
- 1 source ausente (deletou P02.md)
- Click ribbon ICR Import → drop arquivo → rail mostra contribuição
- Visão geral: vê seções codebook (1 row) + sources (2 rows) + ok (1 source clean)
- Resolve: manter local pro code renomeado · skip P02 · trust local pro P03
- Apply → Notice "X markers aplicados, Y skipped"
- Compare Coders View do vault B agora mostra o coder importado

**Não testar via mocks:**
- Drop event do Obsidian (jsdom não reproduz fielmente)
- Re-render after Apply remove da rail
- File save modal (Obsidian-specific)

## 12. Decisões abertas pra plan/implementação

1. **Ícone do ribbon e do view type** — `git-pull-request` é tentativa; consultar `obsidian-design` skill durante implementação pode trocar.
2. **MergePreview recompute** — ao mudar override, recalcula tudo via `mergeCoderContribution(..., { dryRun: true })`. Plan decide se otimiza incremental quando contribuição grande (>500 markers).
3. **Edge: 2 contribuições do mesmo coderId na rail** — bloquear (não adiciona segunda) ou permitir e avisar? Plan decide; default: permitir, avisar no header da contribuição com badge "duplicate coder".

## 13. Dependências

- **Bloqueia:** rollout completo da Fase C (sem UX, motor é só dev tool)
- **Bloqueado por:** Slice 3 ✓ (já entregue)
- **Não acopla com:** LLM coding (ortogonal — quando LLM-as-coder existir, contribui via mesmo PayloadV1 sem mudar nada na UX)
