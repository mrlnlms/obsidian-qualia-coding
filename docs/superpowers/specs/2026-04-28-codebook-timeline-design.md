# Codebook Timeline (Analytics) — Design

**Data:** 2026-04-28
**Status:** Design aprovado, pronto pra plano de implementação
**ROADMAP:** §3 Analytics — "Codebook timeline central" (full version, com stacked bar)

---

## Contexto

`#29 Audit log central` (entregue 2026-04-28 cedo) consolida todas as decisões analíticas do codebook em `data.auditLog: AuditEntry[]` com 7 tipos de events (`created`, `renamed`, `description_edited`, `memo_edited`, `absorbed`, `merged_into`, `deleted`). Hoje só tem visualização **per-code** (section "History" no Code Detail).

**Falta:** view **cross-código** que responda "como o codebook evoluiu como artefato". Útil pra:
- Ver ondas de mexida ("semana passada puxei muito; antes disso ficou 2 semanas frio")
- Auditar decisões em retrospectiva (quando renomei tal código? quando mergeei aquilo?)
- Exportar timeline narrativa pra metodologia da pesquisa

**Distinção do Temporal mode existente:** Temporal mostra `marker.createdAt` (quando aplicou códigos); este mostra `auditEntry.at` (quando decidiu sobre códigos). Eixos completamente distintos.

---

## Decisões de design

| # | Decisão | Resposta |
|---|---------|----------|
| 1 | Layout | Full (B no brainstorm): stacked bar chart no topo + filtros + lista cronológica desc |
| 2 | Granularity do chart | Day / Week / Month (default Day) |
| 3 | Stacking color por type | 6 cores fixas (palette neutra do plugin); not-per-code. `description_edited` e `memo_edited` agrupam em "Edited" |
| 4 | Lista order | Descending (mais recente em cima) — pattern do GitHub activity |
| 5 | Click numa linha | Navega pro Code Detail via `revealCodeDetailForCode(codeId)`. Códigos deletados: row em cinza, `cursor: not-allowed`, click no-op |
| 6 | Resolve nome de code deletado | Engine constrói `Map<codeId, lastKnownName>` a partir do próprio log (`renamed.to`, `absorbed.absorbedNames`, fallback `codeId`) |
| 7 | Hidden entries | Excluídas por default. Toggle "Show hidden (N)" no config — UI dim italic quando exibe |
| 8 | Filter event types | 6 checkboxes (visualmente: 1 chip por type, click toggles). All-on por default. `description_edited`+`memo_edited` ficam num chip único "Edited" |
| 9 | Filter by code name | Input free-text, fuzzy match em `lastKnownName` (incluindo deletados) |
| 10 | Date range filter | Não. YAGNI — granularity + scroll resolvem |
| 11 | Export markdown | Reusa `renderEntryMarkdown` + agrupamento por dia. Cria nota `Codebook timeline — YYYY-MM-DD.md` na raiz do vault e abre |
| 12 | Bucket por week | Semana ISO (segunda → domingo) — consistente com locale internacional |
| 13 | Empty state | Banner "No codebook events recorded yet" quando log vazio |
| 14 | Coalescing | Já vem aplicado no log (60s window). Engine não reprocessa |
| 15 | Performance | Engine puro, sem caching dedicado. Audit log típico < 5k entries — render direto basta |

---

## Arquitetura

### Schema

**Sem mudança de `data.json`.** Consome `data.auditLog` e `data.registry.definitions` direto.

### Engine puro — `src/analytics/data/codebookTimelineEngine.ts` (novo)

```ts
import type { AuditEntry, CodeDefinition } from '../../core/types';

export type Granularity = 'day' | 'week' | 'month';

/** Tipo do filtro de event — agrega description_edited+memo_edited em "edited" */
export type EventTypeFilter = 'created' | 'renamed' | 'edited' | 'absorbed' | 'merged_into' | 'deleted';

/** Mapeamento type real → bucket de filtro */
export const EVENT_TYPE_TO_FILTER: Record<AuditEntry['type'], EventTypeFilter> = {
  created: 'created',
  renamed: 'renamed',
  description_edited: 'edited',
  memo_edited: 'edited',
  absorbed: 'absorbed',
  merged_into: 'merged_into',
  deleted: 'deleted',
};

/** Cores fixas por filter bucket (não match com paletteIndex de codes) */
export const EVENT_COLORS: Record<EventTypeFilter, string> = {
  created: '#76c043',     // verde
  renamed: '#3a90cc',     // azul
  edited: '#f7d046',      // amarelo
  absorbed: '#7c5cd1',    // roxo
  merged_into: '#d05ec8', // rosa
  deleted: '#888',        // cinza
};

export interface TimelineEvent {
  entry: AuditEntry;
  codeId: string;
  codeName: string;          // resolved (live ou last-known)
  codeColor: string | null;  // null se deletado (não está mais no registry)
  isDeleted: boolean;        // true se code não existe mais no registry
  filterBucket: EventTypeFilter;
}

/**
 * Resolve nomes de códigos deletados varrendo o log:
 * - `renamed.to` é o nome final na época do rename
 * - `absorbed.absorbedNames` lista os nomes consumidos
 * - Pra `created`/`deleted` simples sem outras pistas → fallback ao codeId.
 */
export function buildCodeNameLookup(
  log: AuditEntry[],
  registry: Map<string, CodeDefinition>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  // 1. Primeiro: nomes vivos do registry (verdade absoluta pra códigos não deletados)
  for (const [id, def] of registry) lookup.set(id, def.name);
  // 2. Depois: pra deletados, varre log
  for (const entry of log) {
    if (lookup.has(entry.codeId)) continue;  // já resolvido pelo registry
    if (entry.type === 'renamed') lookup.set(entry.codeId, entry.to);
  }
  // 3. Fallback final: codeId
  return lookup;
}

/**
 * Constrói events ordenados por `at` ascending. Filtra hidden por default.
 */
export function buildTimelineEvents(
  log: AuditEntry[],
  registry: Map<string, CodeDefinition>,
  options?: { includeHidden?: boolean },
): TimelineEvent[] {
  const includeHidden = options?.includeHidden ?? false;
  const nameLookup = buildCodeNameLookup(log, registry);

  const events: TimelineEvent[] = [];
  for (const entry of log) {
    if (entry.hidden && !includeHidden) continue;
    const def = registry.get(entry.codeId);
    events.push({
      entry,
      codeId: entry.codeId,
      codeName: nameLookup.get(entry.codeId) ?? entry.codeId,
      codeColor: def?.color ?? null,
      isDeleted: !def,
      filterBucket: EVENT_TYPE_TO_FILTER[entry.type],
    });
  }
  return events.sort((a, b) => a.entry.at - b.entry.at);
}

/**
 * Filtra events por type bucket + code name (case-insensitive substring).
 */
export function filterEvents(
  events: TimelineEvent[],
  enabledBuckets: Set<EventTypeFilter>,
  codeNameQuery: string,
): TimelineEvent[] {
  const q = codeNameQuery.trim().toLowerCase();
  return events.filter(e => {
    if (!enabledBuckets.has(e.filterBucket)) return false;
    if (q && !e.codeName.toLowerCase().includes(q)) return false;
    return true;
  });
}

/**
 * Agrupa events por bucket de granularidade. Retorna array ordenado por bucket asc.
 * Bucket key: 'YYYY-MM-DD' (day), 'YYYY-Www' (week ISO), 'YYYY-MM' (month).
 */
export function bucketByGranularity(
  events: TimelineEvent[],
  gran: Granularity,
): Array<{ bucketKey: string; bucketDate: Date; counts: Record<EventTypeFilter, number> }> {
  const buckets = new Map<string, { bucketDate: Date; counts: Record<EventTypeFilter, number> }>();
  for (const ev of events) {
    const date = new Date(ev.entry.at);
    const { key, anchorDate } = getBucketKey(date, gran);
    if (!buckets.has(key)) {
      buckets.set(key, {
        bucketDate: anchorDate,
        counts: { created: 0, renamed: 0, edited: 0, absorbed: 0, merged_into: 0, deleted: 0 },
      });
    }
    buckets.get(key)!.counts[ev.filterBucket]++;
  }
  return Array.from(buckets.entries())
    .map(([k, v]) => ({ bucketKey: k, ...v }))
    .sort((a, b) => a.bucketDate.getTime() - b.bucketDate.getTime());
}

function getBucketKey(date: Date, gran: Granularity): { key: string; anchorDate: Date } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  if (gran === 'day') {
    const anchor = new Date(y, m, d);
    return { key: anchor.toISOString().slice(0, 10), anchorDate: anchor };
  }
  if (gran === 'month') {
    const anchor = new Date(y, m, 1);
    return { key: `${y}-${String(m + 1).padStart(2, '0')}`, anchorDate: anchor };
  }
  // week: ISO week (segunda como início)
  const anchor = isoWeekStart(date);
  const isoY = anchor.getFullYear();
  const isoW = isoWeekNumber(anchor);
  return { key: `${isoY}-W${String(isoW).padStart(2, '0')}`, anchorDate: anchor };
}

// Helpers ISO-week — devolvem segunda 00:00 da semana e número ISO 1-53
function isoWeekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;  // 0=segunda
  d.setDate(d.getDate() - day);
  return d;
}
function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
```

### Mode render — `src/analytics/views/modes/codebookTimelineMode.ts` (novo)

Estrutura conceitual (não implementação completa — só shape):

```ts
export function renderCodebookTimeline(ctx: AnalyticsViewContext, _filters: FilterConfig): void {
  const log = (ctx.plugin.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
  const registry = new Map(ctx.plugin.registry.getAll().map(c => [c.id, c]));

  const events = buildTimelineEvents(log, registry, { includeHidden: ctx.ctShowHidden });
  const filtered = filterEvents(events, ctx.ctEventBuckets, ctx.ctCodeSearch);
  const buckets = bucketByGranularity(filtered, ctx.ctGranularity);

  // 1. Stacked bar chart (Chart.js) — destrói activeChartInstance antes
  // 2. Lista descending (.slice().reverse()) — virtual scroll YAGNI nessa fase
  //    (audit logs típicos < 5k entries)
  // 3. Empty state se filtered.length === 0
}

export function renderCodebookTimelineOptions(ctx: AnalyticsViewContext): void {
  // Granularity dropdown
  // 6 checkboxes pra event types (chip-style — pattern do groupsFilter)
  // Code search input
  // Toggle "Show hidden (N)" — só aparece se hiddenCount > 0
}

export async function exportCodebookTimelineMarkdown(ctx: AnalyticsViewContext, _date: string): Promise<void> {
  // Cria/abre nota "Codebook timeline — YYYY-MM-DD.md" na raiz do vault
  // Conteúdo: header + grupos por dia (mesma estratégia do exportMemoMarkdown)
}
```

### State em `AnalyticsViewContext`

Adicionar 4 fields novos no `AnalyticsViewContext`:

```ts
// Codebook Timeline state
ctGranularity: 'day' | 'week' | 'month';                  // default 'day'
ctEventBuckets: Set<EventTypeFilter>;                     // default = todos os 6
ctCodeSearch: string;                                     // default ''
ctShowHidden: boolean;                                    // default false
```

### Mode entry no `MODE_REGISTRY`

```ts
"codebook-timeline": {
  label: "Codebook Timeline",
  render: renderCodebookTimeline,
  renderOptions: renderCodebookTimelineOptions,
  exportMarkdown: exportCodebookTimelineMarkdown,
  canExport: true,  // permite snapshot pro Board
},
```

E adicionar `"codebook-timeline"` no type `ViewMode`.

### Click navigation

Expor `revealCodeDetailForCode` na `AnalyticsPluginAPI`:

```ts
// src/analytics/index.ts
export interface AnalyticsPluginAPI {
  // ...existing fields...
  revealCodeDetailForCode(codeId: string): Promise<void>;
}

// no `registerAnalyticsEngine`:
revealCodeDetailForCode: (codeId) => plugin.revealCodeDetailForCode(codeId),
```

Mode usa: `ctx.plugin.revealCodeDetailForCode(ev.codeId)` no click handler. Se `ev.isDeleted` → click é no-op (row já está dimmed).

### Export markdown — formato

```markdown
# Codebook Timeline — 2026-04-28

_Exportado em 2026-04-28._

## 2026-04-28
- 15:32 — **MergeDemo · Cansaço** absorbed "MergeDemo · Burnout"
- 15:32 — **MergeDemo · Burnout** merged into "MergeDemo · Cansaço"
- 15:32 — **MergeDemo · Cansaço** memo edited
- 15:20 — **MergeDemo · Cansaço** created
- ...

## 2026-04-27
- 14:08 — **wellbeing** renamed to "Wellbeing"
- ...
```

Helper `renderTimelineEntryMarkdown(event: TimelineEvent)` no engine — diferente do `renderEntryMarkdown` existente porque inclui o nome do code (cross-código).

### Smoke test seed

`scripts/seed-codebook-timeline-demo.mjs` (novo) — gera ~40 events ao longo de 30 dias com mix dos 6 types pra testar o chart. Idempotente como os outros seeds. Reusa parte do `seed-audit-log-demo.mjs` se possível.

---

## Componentes a tocar

| Arquivo | Mudança |
|---------|---------|
| `src/analytics/data/codebookTimelineEngine.ts` | **Novo.** Engine puro: `buildCodeNameLookup`, `buildTimelineEvents`, `filterEvents`, `bucketByGranularity`, `renderTimelineEntryMarkdown`, types `Granularity`/`EventTypeFilter`/`TimelineEvent`, constantes `EVENT_COLORS`/`EVENT_TYPE_TO_FILTER`. |
| `src/analytics/views/modes/codebookTimelineMode.ts` | **Novo.** `renderCodebookTimeline`, `renderCodebookTimelineOptions`, `exportCodebookTimelineMarkdown`. |
| `src/analytics/views/modes/modeRegistry.ts` | Adiciona import + entry `"codebook-timeline"`. |
| `src/analytics/views/analyticsViewContext.ts` | Adiciona `"codebook-timeline"` no type `ViewMode` + 4 fields no contexto. |
| `src/analytics/views/analyticsView.ts` | Inicializa os 4 fields novos no constructor. |
| `src/analytics/index.ts` | Adiciona `revealCodeDetailForCode` na `AnalyticsPluginAPI`. |
| `tests/analytics/data/codebookTimelineEngine.test.ts` | **Novo.** ~12 tests pros 4 helpers puros. |
| `scripts/seed-codebook-timeline-demo.mjs` | **Novo.** Seed pra smoke test. |

---

## Tests

| Camada | Como |
|--------|------|
| Engine puro | Unit tests (jsdom) — name lookup com deletados, bucket por dia/week/month, filter por type+query, hidden include/exclude, empty log → empty events. ~12 tests. |
| Mode render | Smoke test em vault real (Chart.js + DOM heavy — jsdom não cobre Chart.js confiável). |

**Baseline atual:** 2412 tests. Target pós-feature: ~2424.

---

## Fluxo de dados — exemplo concreto

**Cenário:** audit log com 100 entries cobrindo 14 dias, 1 code deletado, 2 hidden.

1. User abre Analytics → seleciona "Codebook Timeline" no mode dropdown
2. `renderCodebookTimeline(ctx)` carrega `data.auditLog` e `registry.getAll()`
3. `buildTimelineEvents(log, registry)` produz 98 events (2 hidden filtrados); 1 code deletado tem `isDeleted=true` mas `codeName` resolvido via `renamed.to` do log
4. `filterEvents(events, ctx.ctEventBuckets, ctx.ctCodeSearch)` aplica filtros — todos enabled por default → 98 events
5. `bucketByGranularity(events, 'day')` produz 14 buckets, cada um com counts dos 6 types
6. Chart.js renderiza stacked bar (14 colunas × 6 stacks)
7. Lista descending mostra 98 rows abaixo
8. User clica em Granularity = "Week" → re-render com 3 buckets de semana
9. User digita "frust" no Code search → filter aplica, chart e lista atualizam
10. User clica em "Renamed" chip pra desativar → chart re-render sem stacks de rename
11. User clica numa row do code "Cansaço" → `ctx.plugin.revealCodeDetailForCode('c_xxx')` → Code Detail abre na sidebar
12. User clica num row de code deletado → no-op (cinza, sem cursor pointer)
13. User aperta "Export .md" → cria `Codebook timeline — 2026-04-28.md` na raiz do vault

---

## Error handling

- **Audit log vazio**: `buildTimelineEvents` retorna `[]`; mode render mostra empty banner "No codebook events recorded yet."
- **Audit log gigante (>10k)**: render direto, sem virtual scroll. Vitest jsdom não cobre, smoke test em vault real valida (audit log típico < 5k).
- **Code com `codeId` que não existe no registry nem em entries que preservam nome**: fallback `codeName = codeId` (id curto, raro mas defensive).
- **`renderEntryMarkdown` não inclui code name**: novo helper `renderTimelineEntryMarkdown(event)` inclui `**${codeName}**` no início. Não tocar no `renderEntryMarkdown` existente (Code Detail per-code já mostra o code, não duplica).
- **Chart.js destroy timing**: caller seta `ctx.activeChartInstance` antes do render (pattern de outros modes).

---

## Won't do (escopo travado)

- Tooltip rico no chart (basic Chart.js tooltip serve)
- Filtro por range de datas (date picker) — granularity + scroll resolvem
- Group by user/coder (single user, irrelevante)
- Heatmap calendar GitHub-style — YAGNI, stacked bar resolve
- Drill-down: click numa coluna do chart filtra a lista — possível future, fora do MVP-full
- Restore hidden via timeline (já tem na History view per-code)
- Live update via event listener (re-render manual via `scheduleUpdate()` cobre)
- Group `description_edited` e `memo_edited` em "Edited" no chart, mas separar na lista — uniformizar como "Edited" em ambos é mais simples
- Export CSV — markdown é o formato natural pra timeline narrativa

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Chart.js color contrast em theme dark | Usar palette com bom contrast, pattern de outros modes (Frequency, Co-occurrence) |
| ISO week edge cases (semana 53, ano-cruzando) | Implementação stdlib-style, ~12 tests cobrindo edge cases |
| Lista com 5k+ rows degrada scroll | Aceitável (pattern dos outros modes; raramente tem >5k events). Se aparecer dor → virtual scroll fica como follow-up |
| `revealCodeDetailForCode` race se code foi deletado entre render e click | `ev.isDeleted` checado no click handler — early return |
| Audit log inclui `created` de códigos hoje deletados (zumbi) | Engine resolve nome via varredura do log; row aparece em cinza, click no-op. Aceitável e desejável (auditoria fiel) |

---

## Próximos passos após aprovação

1. Spec review loop (subagent)
2. User review do spec escrito
3. Invocar `superpowers:writing-plans` pra plano de implementação
4. Implementação inline (sem SDD)
5. Smoke test em vault real
6. Auto-merge pra main
