# Parquet Lazy — Fase 0: sourceRowId estável (Spec)

> Esta é uma **spec implementável**, não um plan de execução bite-sized. O próximo passo após aprovação é invocar `superpowers:writing-plans` pra produzir o plan executável (cada arquivo vira task com test → implement → verify → commit).

**Goal:** Trocar `CsvMarker.row` (índice posicional) por `CsvMarker.sourceRowId` (identidade estável) sem mudar comportamento visível, preparando o esquema pras fases 1-6 e pro LLM coding em tabular.

**Architecture:** Schema rename + migração one-shot do `data.json` no vault workbench. Em modo eager (que é o único modo da Fase 0), `sourceRowId ≡ índice posicional do papaparse` — valor numérico idêntico ao `row` antigo pro mesmo conteúdo de arquivo. UX, comportamento, exports e analytics todos inalterados.

**Tech Stack:** TS strict, DataManager (existente), papaparse (existente), Vitest+jsdom.

**Estimativa de execução:** 1-2 sessões conforme §8 Fase 0 do design doc.

---

## 1. Contexto autoritativo

Spec deriva de:

- `docs/parquet-lazy-design.md`:
  - §6.10 — descrição do problema (sort SQL invalida índice posicional em modo lazy)
  - §7.1 — escopo de arquivos previsto inicialmente (6 arquivos)
  - §8 Fase 0 — entrega esperada
  - §9 #7 — decisão cravada: `ROW_NUMBER() OVER ()` persistido como `__source_row`
  - §14 — spike findings empíricos (2026-05-03)

Premissa empiricamente validada §14.2: `ROW_NUMBER() OVER ()` é determinístico em parquet, **incluindo o caso patológico** de 297MB MERGED concatenado (0 divergent em 2.38M rows). Essa validação remove o "cone de dúvida" original do §10 sobre parquet multi-worker e habilita esta fase a confiar no esquema escolhido sem fallback de parquet sidecar.

**Dual purpose:** mesmo se as Fases 1-6 forem postas em pausa, sourceRowId já libera LLM coding em tabular (batch review precisa de identidade estável pra diff entre runs e anchoring pós-sort). Esta fase entrega valor independente.

---

## 2. Schema changes

### 2.1 SegmentMarker e RowMarker

**Antes** (`src/csv/csvCodingTypes.ts`):

```ts
export interface SegmentMarker {
  id: string;
  fileId: string;
  row: number;        // 0-based row index (excluding header)
  column: string;
  from: number;
  to: number;
  codes: CodeApplication[];
  memo?: MemoRecord;
  colorOverride?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RowMarker {
  id: string;
  fileId: string;
  row: number;
  column: string;
  codes: CodeApplication[];
  /* … resto idêntico … */
}
```

**Depois:**

```ts
export interface SegmentMarker {
  id: string;
  fileId: string;
  sourceRowId: number;   // stable row identity. Em modo eager (Fase 0) == papaparse row index.
  column: string;
  from: number;
  to: number;
  /* … resto idêntico … */
}

export interface RowMarker {
  id: string;
  fileId: string;
  sourceRowId: number;
  column: string;
  /* … resto idêntico … */
}
```

### 2.2 CodingSnapshot

Mesma alteração: campo `row: number` → `sourceRowId: number`.

### 2.3 Persistence (data.json)

`DataManager.section('csv')` continua salvando `CodingData = { segmentMarkers, rowMarkers }`. Após migração, todos markers carregam `sourceRowId` (não `row`).

**Sem versionamento de schema (`csv.codingVersion` ou similar).** Justificativa: zero usuários (CLAUDE.md). Migração one-shot direta. Versionamento explícito é overkill nesta fase.

---

## 3. File structure

**8 arquivos do plugin + 1 script descartável.** ~110 LOC editadas + ~50 LOC de script.

| Arquivo | LOC | Mudança |
|---|---|---|
| `src/csv/csvCodingTypes.ts` | ~3 | Rename `row` → `sourceRowId` em 3 interfaces (SegmentMarker, RowMarker, CodingSnapshot) |
| `src/csv/csvCodingModel.ts` | ~15 | Rename refs internas a `m.row` → `m.sourceRowId` em CRUD, `getMarkerText`, dedupe lookups (ver §3.1) |
| `src/csv/csvCodingMenu.ts` | ~15 | Param `row: number` → `sourceRowId: number` em `openCsvCodingPopover`, `openBatchCodingPopover` (e callers) |
| `src/csv/csvCodingView.ts` | ~5 | Quando popula a grid via papaparse, atribui `sourceRowId = papaparseRowIndex`. CodingSnapshot e callbacks atualizados |
| `src/csv/views/csvSidebarAdapter.ts` | ~3 | Lê `m.sourceRowId` em vez de `m.row`. **Output (`rowIndex: ...`) preservado** pra não propagar mudança pro `core/unifiedExplorerView.ts` e `core/unifiedDetailView.ts` (decisão #2) |
| `src/export/tabular/buildSegmentsTable.ts` | ~3 | Lê `m.sourceRowId` em vez de `m.row`. **Coluna do CSV de output mantém nome `row`** (decisão #1) |
| `src/export/tabular/tabularExporter.ts` | ~5 | `parsed.data[m.sourceRowId]` em vez de `parsed.data[m.row]` |
| `src/analytics/data/dataConsolidator.ts` | ~5 | Lê `m.sourceRowId`. **Output `meta: { row, fromLine, toLine, ... }` mantém nomes externos** (decisão #2) |
| `scripts/migrate-fase-0-source-row-id.ts` | ~50 | **Descartável.** Backup + transform `data.json` (ver §5) |
| `scripts/revert-fase-0-source-row-id.ts` | ~30 | **Descartável.** Reverse migration ou restore from backup |

(QDPX exporter `qdpxExporter.ts` foi inspecionado — não acessa `m.row` diretamente, só passa marker IDs na lista. Sem alteração.)

(Os 2 arquivos em `src/core/unified{Explorer,Detail}View.ts` consomem `marker.rowIndex` proveniente do sidebar adapter — não consomem `m.row` direto. Como o adapter preserva o nome `rowIndex` no output, esses arquivos NÃO precisam mudar.)

### 3.1 Dedupe lookups em csvCodingModel.ts

Hoje (`csvCodingModel.ts:109-134`), 4 lookups e o `findOrCreateRowMarker` filtram por tupla `(fileId, row, column)`. Após o rename, viram `(fileId, sourceRowId, column)`. Comportamento idêntico — só semântica do field muda.

---

## 4. Behavioral guarantees (o que NÃO muda)

Esta fase é **rename + migration only**. Tudo abaixo deve continuar idêntico:

- ✅ Codificar célula via popover (cell + batch)
- ✅ Sidebar adapter exibe markers com mesma ordenação e labels
- ✅ Detail view: label `Row N · column` (em modo eager, `m.sourceRowId + 1` == `m.row + 1` antigo)
- ✅ AG Grid client-side sort/filter/search inalterados
- ✅ Tabular CSV export produz arquivo binariamente idêntico pra mesmo set de markers (decisões #1 + #2 garantem isso)
- ✅ QDPX export não muda
- ✅ Analytics (Frequency, Co-occurrence, Evolution, Sequential, Inferential, Memo View, Codebook Timeline, Network) inalterados
- ✅ Round-trip data.json (post-migration): markers carregam, comportamento igual
- ✅ Existing wdio e2e specs (66 testes) passam sem modificação

A spec é **VOID** se algum teste e2e ou unit existente quebrar — significa que algum consumidor não foi atualizado.

---

## 5. Migration plan

### 5.1 Script one-shot — `scripts/migrate-fase-0-source-row-id.ts`

Caminho: `<vault>/.obsidian/plugins/qualia-coding/data.json`. Default = vault workbench.

Comportamento:

1. Resolve path do `data.json`. Default: `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/qualia-coding/data.json`.
2. Verifica que existe e é JSON parseável.
3. **Backup**: `cp data.json data.json.pre-fase-0.bak` (skip se backup já existe).
4. Lê data.json.
5. Pra cada marker em `csv.segmentMarkers` e `csv.rowMarkers`: rename field `row` → `sourceRowId` (mesmo valor numérico).
6. Pra `csv.codingSnapshot` (se existir): idem.
7. Salva data.json com formatting `JSON.stringify(data, null, 2)`.
8. Reporta:
   ```
   Backup created: data.json.pre-fase-0.bak
   Migrated: 245 segment markers, 17 row markers, 0 snapshots
   ```

**Idempotente:** detecta markers que já têm `sourceRowId` (e não têm `row`). Reporta `0 markers migrated` e não toca o arquivo.

**Comando:**
```bash
npx tsx scripts/migrate-fase-0-source-row-id.ts
# ou path customizado:
npx tsx scripts/migrate-fase-0-source-row-id.ts /caminho/explicito/data.json
```

### 5.2 Backout — `scripts/revert-fase-0-source-row-id.ts`

Comportamento:
- Se `data.json.pre-fase-0.bak` existe, restaura (`cp .bak data.json`)
- Se não existe, faz transform inverso (`sourceRowId` → `row`)

Ambos scripts mantidos no repo até Fase 6 fechar. Deletados depois.

### 5.3 Workflow de bring-up

Sequência ao mergear:

1. Plugin desabilitado no Obsidian (evita race com auto-save da versão antiga).
2. `npx tsx scripts/migrate-fase-0-source-row-id.ts`
3. Confirma output: backup criado + N markers migrados.
4. `npm run build`
5. `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/` (sync demo).
6. Habilita plugin.
7. Smoke test manual (§6.3).

---

## 6. Testing strategy

### 6.1 Unit tests novos

`src/csv/__tests__/migration-fase-0.test.ts` (descartável, deletado na Fase 6):

- Input fixture com schema antigo (`{ segmentMarkers: [{ row: 5, ... }] }`)
- Output esperado: schema novo (`{ segmentMarkers: [{ sourceRowId: 5, ... }] }`)
- **Idempotência**: rodar 2x produz output idêntico, contagem na 2ª = 0
- **Backup atômico**: garante que `.bak` é criado antes de modificar
- **Edge cases**: data.json sem section `csv`, markers vazios, snapshot ausente

### 6.2 Atualizar testes existentes

Trocar `row` → `sourceRowId` em fixtures de:
- `src/csv/__tests__/csvCodingModel.test.ts` (e todos demais em `src/csv/__tests__/`)
- `src/export/__tests__/buildSegmentsTable.test.ts` (se existir)
- Outros que usem fixture de `SegmentMarker`/`RowMarker`

Critério: `npm run test` passa com **2479+ testes verdes** (contagem atual). Diff deve ser puramente field rename em fixtures, não mudança de assertions.

### 6.3 Smoke test manual (obrigatório antes de merge)

No vault workbench (`/Users/mosx/Desktop/obsidian-plugins-workbench/`):

1. Pre-Fase 0 (versão atual de main): codifica 1 row em CSV qualquer (ex: `safe-mode-test/COB-W1_dist-base.csv` mas filtrando pra arquivo < 50MB pra não bater no banner). Confirma marker salvo em data.json.
2. Roda migration script. Confirma backup + count.
3. Build novo + reabre Obsidian.
4. Marker existente aparece na UI com mesmo label, mesma row visual.
5. Codifica nova row. Salva. Reabre. Persistiu com `sourceRowId`.
6. Export tabular CSV. Compara output: número de linhas idêntico ao pre-migração; coluna `row` tem mesmos valores.
7. Export QDPX. Round-trip back via importer. Markers reidentificados.

### 6.4 e2e tests

`npm run test:e2e` (66 testes em 19 specs) deve passar **sem modificação**. Se algum quebrar, indica regressão real (não cobertura do rename).

---

## 7. Acceptance criteria

- [ ] `npm run build` passa (tsc -noEmit + esbuild)
- [ ] `npm run test` passa (2479+ testes verdes)
- [ ] `npm run test:e2e` passa (66 testes verdes)
- [ ] Migration script executa sem erro no vault workbench
- [ ] Backup `data.json.pre-fase-0.bak` é criado
- [ ] Smoke test manual (§6.3) completo com sucesso
- [ ] **Tabular CSV export** produz arquivo idêntico pre/post-migration pro mesmo set de markers (`diff` retorna 0)
- [ ] **Grep audit**: `grep -rn "marker\.row\b\|m\.row\b\|row:\s*m\.row" src/` retorna **0 hits** após rename
- [ ] Revert script funciona (testado uma vez no smoke test)
- [ ] CHANGELOG.md atualizado com entrada Fase 0

---

## 8. Out-of-scope (NÃO tocar nesta fase)

- Async `getMarkerText` — Fase 1
- DuckDB-Wasm worker bootstrap + 2 shims do §14.5.1 — Fase 2
- OPFS streaming via Node `fs.createReadStream` — Fase 3
- RowProvider + AG Grid Infinite Row Model + lazy threshold (50 MB parquet / 100 MB CSV) — Fase 4
- Pre-compute display_row mapping ao mudar sort (adendo §14.5.2) — Fase 4
- Batch coding modal SQL — Fase 5
- Habilitar feature flag + tabularExporter streaming + UI Manage Cache — Fase 6
- Versionamento de schema do data.json (`csv.codingVersion`) — overkill enquanto zero usuários
- Refator analytics views pra usar `sourceRowId` direto — Fase 4 ou backlog (§9 decisão #2)

---

## 9. Decisões cravadas (2026-05-03)

Duas decisões cosméticas (não afetam arquitetura, afetam código). Ambas resolvidas pelo critério "mais simples / zero ripple downstream".

### Decisão 1: Nome da coluna `row` no tabular CSV export — **A. Manter `row`**

`buildSegmentsTable.ts` linha 20 declara header `'row'`. Após migração, **header continua `row`, valor passa a ser `m.sourceRowId`**. Em modo eager (Fase 0) o valor numérico é idêntico ao antigo. Pipelines R/Python downstream do Marlon não precisam adaptar.

### Decisão 2: Nome dos fields em `dataConsolidator.ts` — **A. Manter nomes externos**

`meta: { row: m.sourceRowId, fromLine: m.sourceRowId, toLine: m.sourceRowId, ... }` — nomes externos preservados, valor lido de `m.sourceRowId`. Os ~10 modes de analytics em `src/analytics/views/modes/` continuam consumindo `meta.row` sem mudança. Renomear é refactor ortogonal (vai pro backlog).

---

## 10. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Consumidor de `marker.row` não previsto descobrir tarde | Baixo | Médio | TS compile time pega tudo após field rename. Acceptance check (§7): grep retorna 0 hits. |
| Migration script tem bug e corrompe data.json | Baixo | Alto | Backup automático + reverse script. CLAUDE.md autoriza editar data.json direto sem perguntar. |
| Field rename quebra teste oculto | Médio | Baixo | Atualizar fixtures dos testes faz parte do escopo. `npm run test` é gate. |
| Smoke test passa mas alguma analytics view quebra silenciosamente | Baixo | Médio | Decisão #2 (manter nomes externos) zera esse risco. |
| Vault workbench tem dado de teste valioso que dá pena perder | Baixo | Baixo | Vault de dev; reproduzível em < 5min. |
| Entrar em loop de "rename + ajustar mais um arquivo" sem fim | Baixo | Médio | Lista fechada em §3 (8 arquivos). Audit grep ao final é checkpoint. |

---

## 11. Backout strategy explícita

Se qualquer coisa der ruim no smoke test (§6.3) ou em produção do dev:

1. Plugin desabilitado.
2. `npx tsx scripts/revert-fase-0-source-row-id.ts` → restaura `data.json` do backup.
3. `git revert <hash-do-merge-da-fase-0>` no repo.
4. Build + reload.

Tempo total de revert: < 5 minutos. Por isso a fase é segura pra mergear em main direto (sem branch longa, conforme §8 do design doc).

---

## 12. Próximo passo após esta spec

1. ✅ Decisões #1 e #2 do §9 cravadas (2026-05-03).
2. Invocar `superpowers:writing-plans` com esta spec como input. Output: plan executável bite-sized (write failing test → run → implement → verify → commit, por arquivo).
3. Plan vira input do `superpowers:subagent-driven-development` (ou `executing-plans` se preferir inline) pra execução real.

Estimativa de execução do plan resultante: 1-2 sessões.
