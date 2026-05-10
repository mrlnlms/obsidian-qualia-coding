# ICR Fase C P1 — UX layer (Import/Export)

**Data:** 2026-05-10
**Status:** Design (pré-spec-review)
**Depende de:** Slice 3 (Fase C P0 transport puro — `extractCoderContribution`, `mergeCoderContribution`, PayloadV1, ConflictRecord)

## 1. Visão geral

Camada UX sobre o motor de transport multi-coder remoto (Slice 3, já entregue). Slice 3 expõe funções puras chamáveis via console DevTools — sem comando, sem menu, sem UI. Esta spec preenche a lacuna.

**Decisão arquitetural cravada:** uma única ItemView "ICR Import" agnóstica ao N de contribuições. Single-coder, multi-coder humano, LLM batch — todos passam pelo mesmo fluxo. Reusa pattern `qc-cc-mode-chip` (`unifiedCompareCodersView.ts:67-114`, `compareCoderCoefficientsModal.ts:78`, `analyticsView.ts viewMode`) pra trocar perspectiva sobre a mesma contribuição.

**Decisão derivada:** sem modal paralelo, sem setting global de merge mode, sem dialog de entrada perguntando "como você quer revisar". O cenário é do user — sistema é agnóstico.

### 1.1. Out of scope nesta spec

- **Persistência da rail** — rail é session-only. Fechou Obsidian, dropa de novo. Arquivo .json no disco é source of truth. (Pode evoluir se demanda real aparecer.)
- **Document Cloning estilo Dedoose** (blind coding sem transport offline serializado).
- **Merge driver via git.**
- **Conflict policy configurável** — default = incoming-wins (atual do motor) com override per-item via UI (manter local). Sem setting global.
- **Marker collision como conflito do motor** — markers de coders diferentes coexistem (mesmo segment com codes diferentes não é conflito; cada um tem seu `codedBy`). Revisão é interpretativa, não merge.

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

`mergePreview` cacheado: ao adicionar contribution, roda merge num clone do `localData`, salva resultado. Re-roda se o user mudar overrides (ou recalcula incrementalmente — decisão do plan).

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
   - `code_overwritten` field=name → "code_42 · name: 'ANSIEDADE' (local) ↔ 'ANSIEDADE-ESCOLAR' (Carla)" + botões `[Manter local]` `[Aceitar Carla (default)]`
   - `code_overwritten` field=color → mostra swatches lado a lado, mesma escolha
   - `code_overwritten` field=description / memo → texto truncado lado a lado, mesma escolha
   - Code novo (existe em payload, não em local) → `[Skip (não importa)]` `[Adicionar ao codebook]`

2. **⚠ Sources com problemas** (border vermelho, expanded por default) — uma row por source affetada:
   - `source_hash_mismatch` → "P03.md · 45 markers · você editou esse arquivo depois" + `[Trust local (offsets podem desalinhar)]` `[Skip source]`
   - `source_not_found` → "P11.md · 42 markers · arquivo não existe local" + `[Map manual...]` `[Skip source]`
   - `multiple_hash_matches` → "X.md · N markers · 2 arquivos local com mesmo hash" + dropdown pra escolher

3. **✓ Pronto pra importar** (border verde, collapsed por default) — counts limpos: "113 markers · 5 codes · 0 conflitos"

### 4.2. Footer

```
[Apply (113 markers — 87 pendentes ficam fora)]  [Discard contribution]
resolva os 87 pendentes acima ou pula eles
```

- "Apply" insere via `mergeCoderContribution` aplicando os `overrides`. Markers sem source resolvido (skip ou ainda pending) ficam fora do count.
- "Discard contribution" remove da rail (não toca data.json).

### 4.3. Edge case — codebook + source perfeitos

Se a contribution não tem nenhuma divergência, seções 1-2 não aparecem. Seção 3 fica expanded. Footer = `[Apply (200)]` direto. Caminho high-trust = 1 click.

## 5. Lado a lado (chip)

Marker-by-marker. Filter chip secundário (segunda linha do toolbar):
- `[todos]` (default)
- `[só sobrepondo local]` — markers da contribuição cujo segment tem marker local existente (mesmo coder ou outro)
- `[só novos]` — markers em segments sem nada local

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
- "Skip all" adiciona codeId ao `overrides.perCodeSkip` → todos markers desse code da contribuição ficam fora do Apply.

Ordenação: codes com mais markers da contribuição primeiro. Codes que existem só na contribuição (não local) marcados "novo".

## 7. Triggers

### 7.1. Export

**Botão no toolbar do Compare Coders View** (modificar `unifiedCompareCodersView.ts:91`, adjacente ao `↗ ver lado a lado`):

```
[↗ exportar contribuição]
```

Click abre file save dialog (Obsidian file modal) → escolhe coder (se >1 humano local; se só 1, skip) → escolhe pasta destino → escreve `<coderName>-<exportedAt>.json`.

**Comando palette (sempre):** `ICR: Export my contribution` (mesmo fluxo).

### 7.2. Import

**Item ribbon (barra esquerda):** ícone `git-pull-request` → label "ICR Import" → click abre/foca a ItemView.

**Comando palette (sempre):** `ICR: Open import` (mesmo).

**Drop arquivo:** drop de `.json` na ItemView (drop zone na rail) carrega e valida. Drop fora da view não dispara nada (evita conflito com outros plugins).

## 8. Componentes / módulos novos

Tudo em `src/core/icr/import/`:

```
src/core/icr/import/
  importViewTypes.ts       — IcrImportViewState, PendingContribution, ResolutionOverrides
  unifiedIcrImportView.ts  — ItemView (rail + toolbar + body re-render)
  importToolbar.ts         — chips + sub-pergunta + meta header
  overviewChip.ts          — Visão geral: seções inline (codebook + sources + ok + footer Apply)
  sideBySideChip.ts        — Lado a lado: marker-by-marker, accept/skip, navegação ←/→
  byCodeChip.ts            — Por código: agrupa, batch actions
  divergenceResolver.ts    — função pura: aplica overrides ao MergeResult / re-roda merge final com overrides
  contributionLoader.ts    — parse + valida arquivo .json como PayloadV1 (rejeita formato inválido com Notice)
  rail.ts                  — lista lateral + drop zone (componente UI)
  exportTrigger.ts         — função de export via file modal (chamada do botão Compare Coders + comando palette)
```

**Modificações em arquivos existentes:**
- `src/core/icr/ui/unifiedCompareCodersView.ts:91` — adicionar segundo botão `↗ exportar contribuição`
- `src/main.ts onload()` — `addRibbonIcon('git-pull-request', 'ICR Import', () => openIcrImportView())` + register view type + register 2 commands

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
- Motor (Slice 3) já entrega tudo. P1 é só UI sobre coisas existentes.
- Lado a lado não é luxo — é o caminho audit, sem ele a ferramenta não cobre o cenário paper-rigor.

**Estimativa de testes:** ~40-60 (em linha com Slice 3 = 26 e E2 = 60+). Detalhamento na §11.

## 11. Testing

### 11.1. Unit (vitest + jsdom)

**`contributionLoader.parse()`:**
- Payload v1.0 válido → retorna `{ payload, errors: [] }`
- Payload com `version: '2.0'` → erro "version não suportada"
- Json malformado → erro "parse"
- Faltando campos required (`coder`, `markers`, etc) → erro detalhando o que falta

**`divergenceResolver.applyOverrides(mergeResult, overrides, payload)`:**
- Override `codebookOverrides[code_42] = 'local'` → resultado não inclui code_overwritten desse code
- Override `sourceOverrides[fid] = 'skip-source'` → markers desse source ficam fora
- Override `perMarkerSkip` → marker específico fica fora
- Override `perCodeSkip` → todos markers do code ficam fora
- Combinação de overrides → idempotente, ordem-independente

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
2. **MergePreview cacheado vs incremental** — ao mudar override, recalcula tudo (simples) ou só o delta (mais rápido)? Default plan: recalcula tudo, otimiza se ficar lento.
3. **Edge: 2 contribuições do mesmo coderId** — bloquear na rail (não adiciona segunda) ou permitir e avisar? Plan decide; default: permitir, avisar no header da contribuição.
4. **Persistência da rail entre sessões** — out of scope desta spec, mas decidir nome do field caso evolua (sugestão: `data.json` em `icrImport.pending` se virar feature).

## 13. Dependências

- **Bloqueia:** rollout completo da Fase C (sem UX, motor é só dev tool)
- **Bloqueado por:** Slice 3 ✓ (já entregue)
- **Não acopla com:** LLM coding (ortogonal — quando LLM-as-coder existir, contribui via mesmo PayloadV1 sem mudar nada na UX)
