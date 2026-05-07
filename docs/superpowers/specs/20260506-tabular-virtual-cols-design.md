# Tabular Virtual Cols — Persist + Filter + Export — Design

**Data:** 2026-05-06 (rev 0 — primeira escrita pós-discussão)
**Status:** spec em revisão
**Owner:** Marlon Lemes

## Contexto

Tabular engine (CSV/Parquet) tem dois modos de runtime, herdados da Fase 6 (parquet-lazy):

- **Eager** (CSV ≤ 100MB / Parquet ≤ 50MB): file inteiro em memória, AG Grid Client-Side Row Model, filtro/sort 100% client-side via JS.
- **Lazy** (acima dos thresholds): file em OPFS, queries vão pra DuckDB-Wasm, AG Grid Infinite Row Model. Filtro AG Grid → `filterModelToSql.buildWhereClause` → SQL WHERE pro DuckDB.

Plugin injeta **3 colunas virtuais** por coluna source quando user habilita via `ColumnToggleModal` (`<source>_cod-frow`, `<source>_cod-seg`, `<source>_comment`):

- `cod-frow` — códigos aplicados à row inteira nessa coluna source
- `cod-seg` — códigos aplicados a um segmento da célula
- `comment` — texto livre escrito pelo usuário pra essa célula

Essas colunas **não existem no parquet/CSV original** — são derivadas de markers persistidos em `data.json`. A separação `data.json (canônico) + parquet (source read-only)` é correta: markers sobrevivem a re-import, rename, QDPX round-trip.

A consequência é que em modo lazy, virtual cols **não existem no schema do DuckDB**, e o pipeline de filter atual não consegue alcançá-las — `columnToggleModal.ts:186/200` força `filter: !lazy` nessas 3 colunas pra evitar `Binder Error: column not found` quando o `filterModel` chega ao DuckDB.

Em paralelo, o `ColumnToggleModal` não persiste seu estado: toggle ON em `Texto_cod-frow` só vive no `ColumnApi` da sessão atual; fecha o file → reabre → todas as virtuais somem, user precisa re-toggle.

## Problema

Três defeitos interrelacionados na UX de tabular coding em modo lazy:

**P1 — Visibilidade de virtual cols não persiste cross-session.** Toggle das colunas virtuais (cod-frow/cod-seg/comment) sumir entre fecha-reabre é incômodo recorrente. Os códigos persistem (vivem em data.json), mas a *exposição* delas no grid não.

**P2 — Filtro AG Grid não chega nas virtuais em lazy.** Em eager, popover "Contains/Equals/StartsWith…" funciona em todas. Em lazy, ícone some nessas 3. Paridade quebrada entre os modos.

**P3 — Export "Parquet enriquecido" não existe.** User que quer um snapshot derivado (parquet original + colunas com códigos aplicados) precisa reconstruir manualmente. Plugin tem QDPX e Tabular CSV zip, mas ambos separam dados e códigos em arquivos distintos. Nenhum produz parquet enriquecido single-file.

Os três compartilham infra: solução pra P2 expõe markers em DuckDB query plane, e essa mesma exposição é o vetor natural pra P3.

## Goals

- **P1:** virtual cols ligadas pelo user persistem em data.json per-file e re-aplicam automaticamente no file open.
- **P2:** popover AG Grid nativo funciona em virtual cols em lazy. Mesmo UX do eager (Text Filter: contains/equals/startsWith/endsWith/blank/notBlank). Pipeline interno traduz pra SQL contra temp table de markers.
- **P3:** export "Parquet enriquecido" no menu de export. Single parquet com colunas originais + colunas virtuais materializadas (concatenação de códigos aplicados).
- Schema da temp table preparada pra futuras features LLM-driven (status accepted/suggested, provenance human/llm) sem DDL change posterior.
- Sync DuckDB temp table reusa canal `onMarkerMutation` existente (SC3).

## Non-goals

- Migrar eager mode pra usar DuckDB. Eager continua client-side (AG Grid Client-Side Row Model). Só lazy ganha temp table.
- Mutar o parquet original em disco. Source data permanece intocado. Export é o único caminho pra artefato derivado.
- Cross-file query SQL ("rows com código X em qualquer parquet do vault"). Code Explorer já resolve esse caso analítico.
- Number filter / Date filter pra virtual cols na primeira aterrissagem. Text Filter cobre 100% do uso atual; magnitude range vira extensão depois.
- LLM features de fato (suggestion workflow, batch accept, provenance UI). Schema fica pronta, features ficam pra plan próprio.
- Re-import de "Parquet enriquecido" como source-of-truth alternativo. Export é one-way snapshot — re-import readiciona códigos pelas vias normais (QDPX import).

## Design overview

Em uma frase: **virtual cols passam a ter três representações sincronizadas — visibility config em `data.json`, AG Grid colDef no client, e markers projetados como temp table DuckDB no file open. Filter pipeline bifurca por origem da coluna; export reusa a temp table.**

### Decisões consolidadas (cravadas em discussão prévia)

| Decisão | Razão |
|---|---|
| Long format na temp table (não wide) | LLM aggregation precisa unnest de qualquer jeito; long é o formato natural pra `GROUP BY code_id, column_name` |
| Per-file scope | Cross-file já tem dono (Code Explorer); per-vault cresce sem teto e não tem caso de uso real |
| 3 virtual cols separadas (cod-frow/cod-seg/comment) | Paridade com mental model atual; filter por tipo tem valor (só comment, só frow) |
| JS-side resolve de code definitions | Registry é pequeno e muta diferente de markers; rename/recolor não precisa invalidar temp table |
| rAF-batched bulk apply, modo único | Simples e cobre ambos: human-pace (1 row/batch) e LLM-batch (5k rows/batch) |
| Schema com `status`/`created_by`/`created_at` | Alta probabilidade de uso em UX LLM canonical; custo de defer = DDL change + invalidação de queries |
| Sem `confidence`/`model_version` agora | Speculation, defer até feature concreta pedir |
| Export reusa a temp table via `COPY ... TO ... (FORMAT PARQUET)` | DuckDB-Wasm já tem capability; sem pipeline JS→Arrow→parquet duplicado |

## Arquitetura

### P1 — Persistência de virtual cols visibility

**Schema em data.json (per-file):**

```typescript
// CsvFileData (existente) ganha:
interface CsvFileData {
  // ... fields existentes (markers, etc.)
  enabledVirtualColumns?: string[];
  // Lista de field names completos: ['Texto_cod-frow', 'Texto_comment', 'Resposta_cod-seg']
  // Default: undefined (interpretado como []) — fresh file não exibe virtuais
}
```

Forma simples (lista de field names completos) em vez de estrutura por source col + kinds. Razão: o consumer é `ColumnToggleModal.applyToggle(field, true)` — já trabalha em field name.

**Apply on file open:**

`csvCodingView.onOpen()` → após criação do gridApi e injection das original headers → invoca `ColumnToggleModal.restoreEnabledColumns(model, filePath, gridApi)`. Esse helper:
1. Lê `model.getEnabledVirtualColumns(filePath)` (novo método)
2. Filtra contra `originalHeaders` atuais (descarta entries cuja source col não existe mais — parquet schema mudou)
3. Pra cada field válido, monta o ColDef como o modal faria e insere via `applyColumnState`/`updateGridOptions`

**Persist on toggle:**

Toggle ON → após `gridApi.applyColumnState(...)` que adiciona a col → `model.addEnabledVirtualColumn(filePath, field)` → triggers save em data.json (mesmo flow que marker mutation, debounced).

Toggle OFF → simétrico: `model.removeEnabledVirtualColumn(filePath, field)`.

**Edge cases:**
- Source col removida do parquet (re-import com schema diferente): entries stale ficam em data.json até user re-abrir o modal e ver que sumiram. Garbage collect lazy: na próxima persist, re-validar contra `originalHeaders` e drop entries inválidas.
- Migration: data.json sem `enabledVirtualColumns` → undefined → tratado como []. Zero migration code.

### P2 — Filter unification via temp table DuckDB

#### Novo módulo: `src/csv/duckdb/qualiaMarkersTable.ts`

Classe `QualiaMarkersTable` instanciada per-lazy-file no `setupLazyMode` do `csvCodingView`. Lifecycle alinhado ao `DuckDBRowProvider`: criada após provider boot, dropada antes de `provider.dispose()`.

**Schema (DuckDB temp table):**

```sql
CREATE TEMP TABLE qualia_markers_<fileIdSafe> (
  marker_id     TEXT NOT NULL,
  source_row    INTEGER NOT NULL,
  kind          TEXT NOT NULL,           -- 'frow' | 'seg' | 'comment'
  column_name   TEXT NOT NULL,           -- nome da source column ('Texto', 'Resposta_Aberta')
  code_id       TEXT,                    -- FK pra CodeDefinition.id; NULL quando kind='comment'
  magnitude     TEXT,                    -- valor (number ou label); NULL quando não tem
  comment_text  TEXT,                    -- só populado quando kind='comment'
  segment_start INTEGER,                 -- só seg
  segment_end   INTEGER,                 -- só seg
  status        TEXT NOT NULL DEFAULT 'accepted',  -- 'accepted' | 'suggested' | 'rejected'
  created_by    TEXT NOT NULL DEFAULT 'human',     -- 'human' | 'llm:<model_id>'
  created_at    TEXT                                -- ISO timestamp (BaseMarker.createdAt)
);
CREATE INDEX idx_<fileIdSafe>_source_row ON qualia_markers_<fileIdSafe>(source_row);
CREATE INDEX idx_<fileIdSafe>_code_id    ON qualia_markers_<fileIdSafe>(code_id);
CREATE INDEX idx_<fileIdSafe>_kind_col   ON qualia_markers_<fileIdSafe>(kind, column_name);
```

`fileIdSafe` = `fileId` sanitizado pra identifier SQL (replace non-alnum por `_`). Per-file naming evita colisão entre files lazy abertos simultaneamente.

**API pública:**

```typescript
export class QualiaMarkersTable {
  constructor(
    private db: AsyncDuckDB,
    private conn: AsyncDuckDBConnection,
    private fileId: string,
    private model: CsvCodingModel
  );

  /** Build inicial: monta Arrow IPC stream a partir de model.getMarkers(fileId) e ingere. */
  async build(): Promise<void>;

  /** Drop completo (CREATE INDEX + CREATE TABLE são session-scoped, mas explicit drop é safe). */
  async dispose(): Promise<void>;

  /** Apply uma batch de mutation events. Chamado pelo BatchedMutationApplier. */
  async applyBatch(events: MarkerMutationEvent[]): Promise<void>;

  /**
   * Resolve filter clause pra virtual cols. Retorna SQL fragment ou null se vazio.
   * Pré-resolve nomes de código contra registry JS-side; envia só code_ids resolvidos.
   */
  buildVirtualFilterClause(
    virtualFilterModel: AgFilterModel,
    codeRegistry: CodeDefinitionRegistry
  ): string | null;

  /** Pra export: SELECT que projeta long → wide (codes_frow_text, codes_seg_text, comment_text). */
  buildExportProjection(opts: { sourceColumns: string[] }): string;

  /** Identifier SQL escapado da temp table (pra queries externas que precisam JOIN). */
  get tableName(): string;
}
```

**Build inicial:**
1. `markers = model.getMarkers(fileId)` (existente)
2. Pra cada marker, projeta uma row por (code application × kind aplicável). Marker com 3 codes em frow + 1 comment = 4 rows.
3. Constrói Arrow Table via `apache-arrow` (já dependency do projeto via DuckDB-Wasm)
4. `db.registerFileBuffer(name, arrowBytes)` + `conn.insertArrowFromIPCStream(...)`
5. CREATE INDEX statements

Custo: 10k markers ≈ 30k temp table rows ≈ <100ms ingest (DuckDB-Wasm Arrow path é rápido).

**`buildVirtualFilterClause` — algoritmo:**

```
Pra cada (field, condition) no virtualFilterModel:
  parse field → { sourceColumn, kind } via regex /^(.+)_(cod-frow|cod-seg|comment)$/
  
  if kind == 'comment':
    SQL fragment direto:
      __source_row IN (
        SELECT source_row FROM <tableName>
        WHERE kind='comment' 
          AND column_name='<sourceColumn>'
          AND comment_text <op> <value>
      )
  
  if kind == 'cod-frow' or 'cod-seg':
    JS pre-resolve:
      pattern = condition.filter (string do user)
      code_ids = codeRegistry.getAll()
        .filter(c => c.name matches <op> pattern)
        .map(c => c.id)
    if code_ids vazio: clause = "1=0"  (filtro impossível)
    else:
      SQL fragment:
        __source_row IN (
          SELECT source_row FROM <tableName>
          WHERE kind='<short_kind>'
            AND column_name='<sourceColumn>'
            AND code_id IN ('<id1>', '<id2>', ...)
            AND status='accepted'   -- LLM suggestions filtradas por padrão; toggle UX vira mais tarde
        )

Concat múltiplos fragments com AND.
Retorna concat ou null se vazio.
```

`<op>` mapeamento: `contains` → `ILIKE '%X%'`, `equals` → `=`, `startsWith` → `ILIKE 'X%'`, etc. (mesma matriz do `filterModelToSql`).

#### Modificação: `csvCodingView.onFilterChanged` + `getRows`

Hoje:
```typescript
const filterModel = this.gridApi.getFilterModel();
const whereClause = buildWhereClause(filterModel) ?? undefined;
```

Refatorado:
```typescript
const fullFilterModel = this.gridApi.getFilterModel();
const { real, virtual } = splitFilterModel(fullFilterModel, this.originalHeaders);
const realClause = buildWhereClause(real);
const virtualClause = this.qualiaMarkersTable?.buildVirtualFilterClause(virtual, this.codeRegistry) ?? null;
const whereClause = combineClauses([realClause, virtualClause]); // AND join
```

`splitFilterModel(model, originalHeaders)`: separa entries cujo field é original header (real) das que matcham `<header>_(cod-frow|cod-seg|comment)` (virtual).

`combineClauses(clauses)`: filtra null, retorna `(c1) AND (c2) AND ...` ou null se todas vazias.

#### Sync via `BatchedMutationApplier`

**Novo módulo: `src/csv/duckdb/batchedMutationApplier.ts`**

Subscribe ao `onMarkerMutation` do model. rAF-debounced bulk apply:

```typescript
class BatchedMutationApplier {
  private queue: MarkerMutationEvent[] = [];
  private rafHandle: number | null = null;

  constructor(private table: QualiaMarkersTable, private fileId: string);

  enqueue(event: MarkerMutationEvent) {
    if (event.fileId !== this.fileId) return;  // só nosso file
    this.queue.push(event);
    if (this.rafHandle === null) {
      this.rafHandle = requestAnimationFrame(() => this.drain());
    }
  }

  private async drain() {
    const batch = this.queue.splice(0);
    this.rafHandle = null;
    if (batch.length === 0) return;
    try {
      await this.table.applyBatch(batch);
    } catch (err) {
      console.error('[qualia-markers-tmp] sync failed, rebuilding', err);
      await this.table.dispose();
      await this.table.build();  // recovery
    }
    // Disparar refresh do grid pra invalidar page cache (filter pode mudar resultado)
    this.gridApi.purgeInfiniteCache();
  }

  dispose() {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
    this.queue = [];
  }
}
```

**`applyBatch` strategy:** translate cada event pra SQL DML, concat em prepared statement único. Pra batch de 5k events, resulta em 1-3 queries (INSERT bulk, DELETE bulk, UPDATE individuais).

```sql
-- ADD code applications (collected from batch)
INSERT INTO qualia_markers_<fid> (marker_id, source_row, kind, column_name, code_id, ...)
VALUES (...), (...), (...);

-- REMOVE code applications
DELETE FROM qualia_markers_<fid>
WHERE (marker_id, code_id) IN (('m1', 'c1'), ('m2', 'c2'), ...);

-- UPDATE comment_text
UPDATE qualia_markers_<fid> SET comment_text = CASE marker_id 
  WHEN 'm1' THEN 'new1' WHEN 'm2' THEN 'new2' ... END
WHERE marker_id IN ('m1', 'm2', ...);

-- DELETE marker (e todas suas rows)
DELETE FROM qualia_markers_<fid> WHERE marker_id IN ('m1', 'm2', ...);
```

#### Lifecycle integration

`csvCodingView.setupLazyMode()`:
1. ... (boot DuckDB, register file, create grid — existente)
2. `this.qualiaMarkersTable = new QualiaMarkersTable(db, conn, fileId, model)`
3. `await this.qualiaMarkersTable.build()`
4. `this.batchedMutationApplier = new BatchedMutationApplier(qualiaMarkersTable, fileId)`
5. `this.unsubscribeMutation = model.onMarkerMutation(e => this.batchedMutationApplier.enqueue(e))`

`csvCodingView.onunload()` (lazy path):
1. `this.unsubscribeMutation?.()`
2. `this.batchedMutationApplier?.dispose()`
3. `await this.qualiaMarkersTable?.dispose()`
4. ... (provider dispose existente)

### P3 — Export Parquet enriquecido

#### Novo módulo: `src/csv/exportParquetEnriched.ts`

Adiciona modo "Parquet enriquecido" no menu de export existente (`tabular-export-design.md` referenced architecture).

**SQL único pra export:**

```sql
COPY (
  SELECT p.*,
         COALESCE(m.codes_frow, '') AS "<col1>_cod-frow",
         COALESCE(m.codes_seg, '')  AS "<col1>_cod-seg",
         COALESCE(m.comment, '')    AS "<col1>_comment",
         -- ... repete por source col com virtual habilitada
  FROM '<original.parquet>' p
  LEFT JOIN (
    SELECT source_row, column_name,
           STRING_AGG(CASE WHEN kind='frow' THEN code_name END, ';') AS codes_frow,
           STRING_AGG(CASE WHEN kind='seg'  THEN code_name END, ';') AS codes_seg,
           MAX(CASE WHEN kind='comment' THEN comment_text END)        AS comment
    FROM (
      SELECT m.*, c.name AS code_name
      FROM qualia_markers_<fid> m
      LEFT JOIN code_definitions_view c ON m.code_id = c.id
      WHERE m.status = 'accepted'
    )
    GROUP BY source_row, column_name
  ) m ON p.__source_row = m.source_row
) TO '<output.parquet>' (FORMAT PARQUET, COMPRESSION ZSTD)
```

`code_definitions_view` é uma view materializada on-the-fly via Arrow IPC (mesmo pattern do build inicial da temp table) com `(id, name)` do `CodeDefinitionRegistry` em JS. Existe só durante export.

**Includer set:**

Default = mesma lista que `enabledVirtualColumns` em data.json. User vê todas as virtuais que ele tinha visíveis no grid materializadas no parquet.

**Output destination:**

Default: vault path adjacente ao original (`<original-stem>.qualia-enriched.parquet`). Modal de export oferece "Save to vault" / "Download" como hoje em outros export modes.

**Limitação documentada:**
- Round-trip de "Parquet enriquecido" como source de re-import NÃO é caminho suportado. Re-importação de códigos é via QDPX. Documentar no disclaimer do modal.

## Data flow

### Filter (lazy mode com virtual cols ligadas)

```
User digita "violência" no popover de Texto_cod-frow
 │
 ▼
AG Grid emite onFilterChanged
 │
 ▼
csvCodingView.refreshLazyFilter()
 │   ┌─ getFilterModel() → { Texto_cod-frow: { type:'contains', filter:'violência' } }
 │   ├─ splitFilterModel → real={}, virtual={Texto_cod-frow: ...}
 │   ├─ buildWhereClause(real) → null
 │   └─ qualiaMarkersTable.buildVirtualFilterClause(virtual, codeRegistry)
 │         │
 │         ├─ JS: codeRegistry.getAll().filter(c => c.name.toLowerCase().includes('violência'))
 │         │       → [code_001, code_042]
 │         └─ SQL: __source_row IN (SELECT source_row FROM qualia_markers_xyz 
 │                  WHERE kind='frow' AND column_name='Texto'
 │                    AND code_id IN ('code_001','code_042') AND status='accepted')
 │
 ▼
csvCodingView passa whereClause pra refreshLazyDisplayMap (rebuild display_row mapping)
 │
 ▼
gridApi.purgeInfiniteCache + scrollbar reflete novo total
 │
 ▼
getRows do datasource consulta DuckDB com WHERE clause + new sort/page → DuckDB filtra → AG Grid renderiza
```

### Marker mutation (LLM batch scenario)

```
User clica "Accept all 5000 suggestions" na UI LLM
 │
 ▼
LLM accept handler → model.applyBatchSuggestions(...)
 │
 ▼
Pra cada marker accepted:
  model.addCode(...) → emite onMarkerMutation event
                       (5000 eventos disparam em microsegundos)
 │
 ▼
BatchedMutationApplier.enqueue(event) (5000x)
  └─ primeira chamada agenda RAF; demais só apendam à queue
 │
 ▼
RAF tick (~16ms depois)
 │
 ▼
applier.drain():
  ├─ splice queue (5000 events)
  ├─ qualiaMarkersTable.applyBatch(batch)
  │     ├─ classify ADDs/REMOVEs/UPDATEs
  │     ├─ INSERT bulk values (...)
  │     ├─ (DELETE/UPDATE conforme presente)
  │     └─ ~5-50ms dependendo do volume
  └─ gridApi.purgeInfiniteCache → grid re-fetch páginas com markers atualizados
```

## Error handling

| Cenário | Estratégia |
|---|---|
| `qualiaMarkersTable.build()` falha (DuckDB DDL error, OOM) | Log error + `qualiaMarkersTable = null`. View opera sem virtual filter (paridade com estado atual: virtuais sem filtro). User vê banner: "Filtro de colunas virtuais indisponível — recarregue o arquivo". |
| `applyBatch` falha mid-batch | Catch → `dispose()` + `build()` recovery (rebuild from data.json). Log warn. Grid state continua válido (data.json é fonte). |
| `buildVirtualFilterClause` recebe field name não-parseable | Skip silenciosamente, retorna null pra essa entry. |
| Code registry resolve `name → []` (zero matches) | Emit `1=0` clause → filter retorna 0 rows (semantically correto: "Contains 'xyz' onde nenhum code matcha 'xyz'" = vazio). |
| Source col em `enabledVirtualColumns` não existe mais no parquet | Skip silently no apply, GC lazy na próxima persist. |
| `BatchedMutationApplier` enqueue após dispose | Guard com flag `disposed` → no-op. |

## Testing strategy

### Unit tests

**`tests/csv/qualiaMarkersTable.test.ts`** (mock DuckDB connection):
- `build()` cria temp table com schema correto (DESCRIBE)
- `build()` ingere markers projetando long format certo (1 marker × 3 codes frow = 3 rows)
- `applyBatch` ADD: INSERT correto pra cada (marker × code) novo
- `applyBatch` REMOVE: DELETE correto
- `applyBatch` mixed: ADD + REMOVE + UPDATE numa só batch
- `buildVirtualFilterClause` Contains com pattern que matcha 2 codes → IN clause com 2 ids
- `buildVirtualFilterClause` pattern sem match → `1=0`
- `buildVirtualFilterClause` comment Contains → SQL direto sem JS resolve
- `buildExportProjection` produz SELECT com 1 join + STRING_AGG correto

**`tests/csv/batchedMutationApplier.test.ts`** (mock RAF):
- Single enqueue dispara 1 RAF, drain aplica 1 batch
- 100 enqueues em <16ms drenados em 1 batch único
- Enqueue durante drain agenda novo RAF
- enqueue de event com `fileId` errado é descartado
- `dispose()` cancela RAF pendente, drena queue não-aplicada

**`tests/csv/columnVisibilityPersistence.test.ts`**:
- `addEnabledVirtualColumn(file, field)` salva em data.json
- `removeEnabledVirtualColumn` simétrico
- `getEnabledVirtualColumns` filtra entries cuja source col não existe em headers atuais
- Re-apply on file open injeta colDefs corretas

### Integration tests

**`tests/csv/lazyFilterE2E.test.ts`** (DuckDB real, parquet fixture):
- Filter virtual `Texto_cod-frow Contains 'violência'` retorna apenas rows com markers desses códigos
- Filter combo virtual + real (`__source_row > 100 AND Texto_cod-frow Contains 'X'`) funciona
- Mutation marker → temp table atualiza → refresh → filter reflete

### Smoke checkpoints (Obsidian real, OBRIGATÓRIO antes de marcar como done)

1. **P1 baseline:** abrir parquet >50MB em vault workbench, ligar Texto_cod-frow + Texto_comment via modal, fechar parquet, reabrir → ambas colunas visíveis sem ação manual.
2. **P2 baseline:** com parquet aberto e códigos aplicados, clicar ícone de filtro em `Texto_cod-frow`, digitar nome de código existente, ver rows filtradas. Limpar filtro, ver rows voltarem.
3. **P2 + mutation:** com filtro ativo em `Texto_cod-frow`, aplicar código novo numa row visível → row some/aparece corretamente conforme matche.
4. **P2 com comment:** filtrar `Texto_comment Contains 'palavra'` → só rows com comments contendo 'palavra'.
5. **P3 export:** menu Export → "Parquet enriquecido" → save to vault → abrir o output em DuckDB CLI ou outro tool → confirmar colunas originais + virtuais com códigos como ';'-separated strings.
6. **Combinação:** filter ativo + export → export reflete os filtros? *Decisão pro plan:* exportar só rows visíveis, ou tudo? Sugestão: tudo (export é snapshot total, filtros são UI state).

## Implementation notes

### Arquivos afetados

**Novos:**
- `src/csv/duckdb/qualiaMarkersTable.ts`
- `src/csv/duckdb/batchedMutationApplier.ts`
- `src/csv/duckdb/virtualFilterResolver.ts` (extrai a lógica `buildVirtualFilterClause` se ficar grande)
- `src/csv/exportParquetEnriched.ts`
- Tests correspondentes

**Modificados:**
- `src/csv/csvCodingView.ts` — setupLazyMode (boot/dispose temp table), refreshLazyFilter (split + combine clauses)
- `src/csv/columnToggleModal.ts` — `filter: !lazy` → `filter: true` nas virtuais; persist on toggle on/off; `applyEnabledColumns` helper pra restore on open
- `src/csv/csvCodingModel.ts` — `getEnabledVirtualColumns/addEnabledVirtualColumn/removeEnabledVirtualColumn` + persist em data.json
- `src/csv/duckdb/filterModelToSql.ts` — sem mudança (continua puro pra real cols); só adicionar export de helper de splitFilterModel se ficar útil compartilhar
- Menu de export (existente) — adicionar opção "Parquet enriquecido"

### Decisões técnicas pro plan

**D-plan-1:** Onde mora o `splitFilterModel`? Standalone util em `src/csv/duckdb/filterSplit.ts`, ou inline no `csvCodingView`? Sugestão: standalone, mais testável.

**D-plan-2:** `applyBatch` deve usar prepared statements ou string interpolation? DuckDB-Wasm não tem prepared statements maduros pra DML em batch. Provavelmente string interpolation com escape rigoroso (mesma estratégia do `filterModelToSql.escapeLike`/`quoteString`).

**D-plan-3:** Filter chip "Inclusão de suggestions" (status='accepted' vs todos) na UI vai junto agora ou defer? Sugestão: defer. Por padrão filtra `status='accepted'`; toggle UX vira plan da feature LLM.

**D-plan-4:** `code_definitions_view` (Arrow IPC do registry) — vive durante export ou permanente? Sugestão: durante export apenas. Permanente exigiria sync no rename/delete de código.

## Migration / Rollout

- Zero migration code. Plugin status é "EM DESENVOLVIMENTO — ZERO USUÁRIOS" (CLAUDE.md). data.json sem `enabledVirtualColumns` → undefined → tratado como [].
- Vault workbench tem alguns parquets lazy. Após implementação, primeira abertura: persistência ainda vazia, comportamento idêntico ao pré-feature. User toggle → persiste daí em diante.
- Sem feature flag. Filter virtual em lazy entra direto.
- Sem fallback. Caminho com temp table substitui o `filter: !lazy`.

## Decisões fechadas no brainstorm + revisão

| ID | Decisão | Status |
|---|---|---|
| D1 | 3 virtual cols separadas (cod-frow, cod-seg, comment) | Cravada |
| D2 | Per-file scope da temp table | Cravada (cross-file fica em Code Explorer) |
| D3 | rAF-batched bulk apply, modo único pra sync | Cravada (sem incremental vs full rebuild) |
| Schema | `+ status + created_by + created_at` (LLM-ready) | Cravada |
| Schema | Sem `confidence`/`model_version` agora | Cravada (defer até feature concreta) |
| Export | Parquet enriquecido reusa temp table | Cravada |
| Persistência | Lista flat de field names em data.json | Cravada (vs estrutura por source col) |
| Resolve | Code definitions ficam JS-side | Cravada (não materializa em DuckDB) |

## Open questions pro plan

- **OQ1** — Status indicator durante build inicial da temp table (10k markers, ~100ms): mostrar "Carregando filtros…" ou silencioso? Sugestão: silencioso (build é rápido + acontece junto com o boot da view, que já tem feedback).
- **OQ2** — Se export Parquet enriquecido falhar mid-COPY (OPFS quota, IO error), output parcial deve ser deletado? Sugestão: try/finally cleanup.
- **OQ3** — Naming exato do output: `<stem>.qualia-enriched.parquet` ou `<stem>+codes.parquet`? Trivial, decisão de UX.
- **OQ4** — Pra parquet com 270 colunas, virtual cols ligadas em todas seria 810 cols extras na temp table — vale cap default? Sugestão: não cap, mas documentar que ligar tudo em parquet wide é caso de uso atípico.
