# Codebook Timeline Implementation Plan

> **For agentic workers:** **PROJETO OVERRIDE:** per `feedback_sdd_overkill_for_dev_project.md`, default = execução inline. SDD aqui não traz risco worth its weight. Steps usam `- [ ]` syntax.

**Goal:** Adicionar mode "Codebook Timeline" no Analytics que consome `data.auditLog` (#29) com stacked bar chart (granularity day/week/month) + lista cronológica filtrável + click navega pro Code Detail + export markdown agregado.

**Architecture:** Engine puro em `src/analytics/data/codebookTimelineEngine.ts` (testável em isolamento, sem deps de DOM/Obsidian). Mode render em `codebookTimelineMode.ts` orquestra Chart.js + lista. State per-mode no `AnalyticsViewContext`. Click navigation via método novo `revealCodeDetailForCode` exposto na `AnalyticsPluginAPI`.

**Tech Stack:** TypeScript strict · Vitest + jsdom · Chart.js (já dep) · zero novas libs.

**Spec:** `docs/superpowers/specs/2026-04-28-codebook-timeline-design.md`

**Branch:** `feat/codebook-timeline` (já criada).

---

## File Structure

| Arquivo | Operação | Responsabilidade |
|---------|----------|------------------|
| `src/analytics/data/codebookTimelineEngine.ts` | **Create** | Types `Granularity`/`EventTypeFilter`/`TimelineEvent` + helpers puros `buildCodeNameLookup`, `buildTimelineEvents`, `filterEvents`, `bucketByGranularity`, `renderTimelineEntryMarkdown`, constantes `EVENT_COLORS`/`EVENT_TYPE_TO_FILTER`. |
| `src/analytics/views/modes/codebookTimelineMode.ts` | **Create** | `renderCodebookTimeline`, `renderCodebookTimelineOptions`, `exportCodebookTimelineMarkdown`. Chart.js + DOM. |
| `src/analytics/views/modes/modeRegistry.ts` | **Modify** | Adicionar import + entry `"codebook-timeline"` no `MODE_REGISTRY`. |
| `src/analytics/views/analyticsViewContext.ts` | **Modify** | Adicionar `"codebook-timeline"` no `ViewMode` + 4 fields novos no contexto. |
| `src/analytics/views/analyticsView.ts` | **Modify** | Inicializar os 4 fields no constructor. |
| `src/analytics/index.ts` | **Modify** | Adicionar `revealCodeDetailForCode` na `AnalyticsPluginAPI` + wire pra `plugin.revealCodeDetailForCode`. |
| `tests/analytics/data/codebookTimelineEngine.test.ts` | **Create** | ~14 unit tests pros 5 helpers + ISO-week edge cases. |
| `scripts/seed-codebook-timeline-demo.mjs` | **Create** | Seed com ~40 events em 30 dias pra smoke test. |
| `docs/ROADMAP.md` | **Modify** | Marcar item Codebook timeline como ✅ FEITO. Adicionar registro #31. |

---

## Chunk 1: Engine puro (TDD)

### Task 1: Stubs + tipos do engine

**Files:**
- Create: `src/analytics/data/codebookTimelineEngine.ts`
- Create: `tests/analytics/data/codebookTimelineEngine.test.ts`

- [ ] **Step 1.1: Criar arquivo com tipos + constantes + stubs**

```ts
// src/analytics/data/codebookTimelineEngine.ts
import type { AuditEntry, CodeDefinition } from '../../core/types';

export type Granularity = 'day' | 'week' | 'month';

export type EventTypeFilter = 'created' | 'renamed' | 'edited' | 'absorbed' | 'merged_into' | 'deleted';

export const EVENT_TYPE_TO_FILTER: Record<AuditEntry['type'], EventTypeFilter> = {
	created: 'created',
	renamed: 'renamed',
	description_edited: 'edited',
	memo_edited: 'edited',
	absorbed: 'absorbed',
	merged_into: 'merged_into',
	deleted: 'deleted',
};

export const EVENT_COLORS: Record<EventTypeFilter, string> = {
	created: '#76c043',
	renamed: '#3a90cc',
	edited: '#f7d046',
	absorbed: '#7c5cd1',
	merged_into: '#d05ec8',
	deleted: '#888888',
};

export interface TimelineEvent {
	entry: AuditEntry;
	codeId: string;
	codeName: string;
	codeColor: string | null;
	isDeleted: boolean;
	filterBucket: EventTypeFilter;
}

export function buildCodeNameLookup(_log: AuditEntry[], _registry: Map<string, CodeDefinition>): Map<string, string> {
	throw new Error('not implemented');
}

export function buildTimelineEvents(
	_log: AuditEntry[],
	_registry: Map<string, CodeDefinition>,
	_options?: { includeHidden?: boolean },
): TimelineEvent[] {
	throw new Error('not implemented');
}

export function filterEvents(
	_events: TimelineEvent[],
	_enabledBuckets: Set<EventTypeFilter>,
	_codeNameQuery: string,
): TimelineEvent[] {
	throw new Error('not implemented');
}

export function bucketByGranularity(
	_events: TimelineEvent[],
	_gran: Granularity,
): Array<{ bucketKey: string; bucketDate: Date; counts: Record<EventTypeFilter, number> }> {
	throw new Error('not implemented');
}

export function renderTimelineEntryMarkdown(_event: TimelineEvent): string {
	throw new Error('not implemented');
}
```

- [ ] **Step 1.2: tsc passa**

Run: `npm run build`
Expected: PASS (stubs lançam erro mas tsc só verifica tipos).

---

### Task 2: TDD — `buildCodeNameLookup`

**Files:**
- Modify: `tests/analytics/data/codebookTimelineEngine.test.ts`
- Modify: `src/analytics/data/codebookTimelineEngine.ts`

- [ ] **Step 2.1: Tests**

```ts
// tests/analytics/data/codebookTimelineEngine.test.ts
import { describe, it, expect } from 'vitest';
import {
	buildCodeNameLookup, buildTimelineEvents, filterEvents,
	bucketByGranularity, renderTimelineEntryMarkdown,
	type TimelineEvent,
} from '../../../src/analytics/data/codebookTimelineEngine';
import type { AuditEntry, CodeDefinition } from '../../../src/core/types';

function makeCode(over: Partial<CodeDefinition>): CodeDefinition {
	return {
		id: 'c_x', name: 'X', color: '#000', paletteIndex: 0,
		childrenOrder: [], createdAt: 0, updatedAt: 0,
		...over,
	};
}

describe('buildCodeNameLookup', () => {
	it('uses registry name for live codes', () => {
		const reg = new Map([['c_a', makeCode({ id: 'c_a', name: 'Alpha' })]]);
		const log: AuditEntry[] = [];
		const lookup = buildCodeNameLookup(log, reg);
		expect(lookup.get('c_a')).toBe('Alpha');
	});

	it('uses last renamed.to for deleted code with rename history', () => {
		const reg = new Map<string, CodeDefinition>();
		const log: AuditEntry[] = [
			{ id: 'a1', type: 'renamed', codeId: 'c_dead', from: 'old', to: 'new', at: 100 },
		];
		const lookup = buildCodeNameLookup(log, reg);
		expect(lookup.get('c_dead')).toBe('new');
	});

	it('uses absorbed.absorbedNames for codes deleted by merge', () => {
		const reg = new Map<string, CodeDefinition>();
		const log: AuditEntry[] = [
			{ id: 'a1', type: 'absorbed', codeId: 'c_target', absorbedNames: ['Burnout', 'Cansaço'], absorbedIds: ['c_b', 'c_c'], at: 100 },
		];
		const lookup = buildCodeNameLookup(log, reg);
		expect(lookup.get('c_b')).toBe('Burnout');
		expect(lookup.get('c_c')).toBe('Cansaço');
	});

	it('does not overwrite live registry name', () => {
		const reg = new Map([['c_a', makeCode({ id: 'c_a', name: 'Alive' })]]);
		const log: AuditEntry[] = [
			{ id: 'a1', type: 'renamed', codeId: 'c_a', from: 'old', to: 'StaleFromLog', at: 100 },
		];
		const lookup = buildCodeNameLookup(log, reg);
		expect(lookup.get('c_a')).toBe('Alive');
	});
});
```

- [ ] **Step 2.2: Esperar FAIL**

Run: `npx vitest run tests/analytics/data/codebookTimelineEngine.test.ts`
Expected: FAIL com "not implemented".

- [ ] **Step 2.3: Implementar**

Substitui o stub `buildCodeNameLookup`:

```ts
export function buildCodeNameLookup(
	log: AuditEntry[],
	registry: Map<string, CodeDefinition>,
): Map<string, string> {
	const lookup = new Map<string, string>();
	for (const [id, def] of registry) lookup.set(id, def.name);
	for (const entry of log) {
		if (registry.has(entry.codeId)) continue;
		if (entry.type === 'renamed') lookup.set(entry.codeId, entry.to);
		if (entry.type === 'absorbed') {
			for (let i = 0; i < entry.absorbedIds.length; i++) {
				const srcId = entry.absorbedIds[i]!;
				if (!registry.has(srcId)) lookup.set(srcId, entry.absorbedNames[i]!);
			}
		}
	}
	return lookup;
}
```

- [ ] **Step 2.4: PASS**

Run: `npx vitest run tests/analytics/data/codebookTimelineEngine.test.ts -t buildCodeNameLookup`
Expected: 4 PASS.

---

### Task 3: TDD — `buildTimelineEvents`

- [ ] **Step 3.1: Tests**

Adicionar no `codebookTimelineEngine.test.ts`:

```ts
describe('buildTimelineEvents', () => {
	it('produces events sorted by at ascending', () => {
		const reg = new Map([['c_a', makeCode({ id: 'c_a', name: 'A', color: '#aaa' })]]);
		const log: AuditEntry[] = [
			{ id: 'e2', type: 'memo_edited', codeId: 'c_a', from: '', to: 'm', at: 200 },
			{ id: 'e1', type: 'created', codeId: 'c_a', at: 100 },
		];
		const events = buildTimelineEvents(log, reg);
		expect(events.map(e => e.entry.id)).toEqual(['e1', 'e2']);
	});

	it('marks deleted codes (not in registry) and resolves color to null', () => {
		const reg = new Map<string, CodeDefinition>();
		const log: AuditEntry[] = [
			{ id: 'e1', type: 'renamed', codeId: 'c_dead', from: 'a', to: 'b', at: 100 },
		];
		const events = buildTimelineEvents(log, reg);
		expect(events[0]!.isDeleted).toBe(true);
		expect(events[0]!.codeColor).toBeNull();
		expect(events[0]!.codeName).toBe('b');
	});

	it('excludes hidden by default; includes when includeHidden=true', () => {
		const reg = new Map([['c_a', makeCode({ id: 'c_a', name: 'A' })]]);
		const log: AuditEntry[] = [
			{ id: 'e1', type: 'created', codeId: 'c_a', at: 100 },
			{ id: 'e2', type: 'memo_edited', codeId: 'c_a', from: '', to: 'm', at: 200, hidden: true },
		];
		expect(buildTimelineEvents(log, reg)).toHaveLength(1);
		expect(buildTimelineEvents(log, reg, { includeHidden: true })).toHaveLength(2);
	});

	it('maps description_edited and memo_edited to "edited" filterBucket', () => {
		const reg = new Map([['c_a', makeCode({ id: 'c_a', name: 'A' })]]);
		const log: AuditEntry[] = [
			{ id: 'e1', type: 'description_edited', codeId: 'c_a', from: '', to: 'd', at: 100 },
			{ id: 'e2', type: 'memo_edited', codeId: 'c_a', from: '', to: 'm', at: 200 },
		];
		const events = buildTimelineEvents(log, reg);
		expect(events.every(e => e.filterBucket === 'edited')).toBe(true);
	});
});
```

- [ ] **Step 3.2: Implementar**

```ts
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
```

- [ ] **Step 3.3: PASS**

Run: `npx vitest run tests/analytics/data/codebookTimelineEngine.test.ts -t buildTimelineEvents`
Expected: 4 PASS.

---

### Task 4: TDD — `filterEvents`

- [ ] **Step 4.1: Tests**

```ts
describe('filterEvents', () => {
	function makeEvent(over: Partial<TimelineEvent>): TimelineEvent {
		const base: TimelineEvent = {
			entry: { id: 'e', type: 'created', codeId: 'c_a', at: 0 },
			codeId: 'c_a', codeName: 'Alpha', codeColor: '#000', isDeleted: false, filterBucket: 'created',
		};
		return { ...base, ...over };
	}

	it('filters by enabled bucket', () => {
		const events = [
			makeEvent({ filterBucket: 'created' }),
			makeEvent({ filterBucket: 'renamed' }),
		];
		const enabled = new Set(['created' as const]);
		expect(filterEvents(events, enabled, '')).toHaveLength(1);
	});

	it('filters by code name (case insensitive substring)', () => {
		const events = [
			makeEvent({ codeName: 'Frustração' }),
			makeEvent({ codeName: 'Cansaço' }),
		];
		const all = new Set<EventTypeFilter>(['created']);
		expect(filterEvents(events, all, 'frust')).toHaveLength(1);
		expect(filterEvents(events, all, 'CAN')).toHaveLength(1);
	});

	it('empty query passes all', () => {
		const events = [makeEvent({}), makeEvent({})];
		expect(filterEvents(events, new Set(['created']), '')).toHaveLength(2);
		expect(filterEvents(events, new Set(['created']), '   ')).toHaveLength(2);
	});
});
```

(precisa importar `EventTypeFilter` no test file — adicionar ao import existente)

- [ ] **Step 4.2: Implementar**

```ts
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
```

- [ ] **Step 4.3: PASS**

Run: `npx vitest run tests/analytics/data/codebookTimelineEngine.test.ts -t filterEvents`
Expected: 3 PASS.

---

### Task 5: TDD — `bucketByGranularity` (incl. ISO-week edge cases)

- [ ] **Step 5.1: Tests com edge cases ISO-week**

```ts
describe('bucketByGranularity', () => {
	function eventAt(ts: number, bucket: EventTypeFilter = 'created'): TimelineEvent {
		return {
			entry: { id: `e_${ts}`, type: 'created', codeId: 'c', at: ts },
			codeId: 'c', codeName: 'X', codeColor: '#000', isDeleted: false, filterBucket: bucket,
		};
	}

	it('day buckets', () => {
		// 2026-04-28 12:00 e 2026-04-28 23:00 → mesmo bucket; 2026-04-29 00:30 → novo
		const e1 = eventAt(new Date(2026, 3, 28, 12).getTime());
		const e2 = eventAt(new Date(2026, 3, 28, 23).getTime());
		const e3 = eventAt(new Date(2026, 3, 29, 0, 30).getTime());
		const buckets = bucketByGranularity([e1, e2, e3], 'day');
		expect(buckets).toHaveLength(2);
		expect(buckets[0]!.counts.created).toBe(2);
		expect(buckets[1]!.counts.created).toBe(1);
	});

	it('month buckets', () => {
		const e1 = eventAt(new Date(2026, 3, 1).getTime());
		const e2 = eventAt(new Date(2026, 3, 30).getTime());
		const e3 = eventAt(new Date(2026, 4, 1).getTime());
		const buckets = bucketByGranularity([e1, e2, e3], 'month');
		expect(buckets).toHaveLength(2);
		expect(buckets[0]!.bucketKey).toBe('2026-04');
		expect(buckets[1]!.bucketKey).toBe('2026-05');
	});

	it('week ISO — 2025-12-29 (Mon) belongs to week 1 of 2026', () => {
		const e = eventAt(new Date(2025, 11, 29).getTime());
		const buckets = bucketByGranularity([e], 'week');
		expect(buckets[0]!.bucketKey).toBe('2026-W01');
	});

	it('week ISO — 2024-12-30 (Mon) belongs to week 1 of 2025', () => {
		const e = eventAt(new Date(2024, 11, 30).getTime());
		const buckets = bucketByGranularity([e], 'week');
		expect(buckets[0]!.bucketKey).toBe('2025-W01');
	});

	it('week ISO — 2026-12-28 (Mon) belongs to week 53 of 2026', () => {
		const e = eventAt(new Date(2026, 11, 28).getTime());
		const buckets = bucketByGranularity([e], 'week');
		expect(buckets[0]!.bucketKey).toBe('2026-W53');
	});

	it('week ISO — 2027-01-03 (Sun) is last day of week 53/2026', () => {
		const e = eventAt(new Date(2027, 0, 3).getTime());
		const buckets = bucketByGranularity([e], 'week');
		expect(buckets[0]!.bucketKey).toBe('2026-W53');
	});

	it('counts are split per filter bucket', () => {
		const ts = new Date(2026, 3, 28).getTime();
		const events = [eventAt(ts, 'created'), eventAt(ts, 'renamed'), eventAt(ts, 'created')];
		const buckets = bucketByGranularity(events, 'day');
		expect(buckets[0]!.counts.created).toBe(2);
		expect(buckets[0]!.counts.renamed).toBe(1);
		expect(buckets[0]!.counts.edited).toBe(0);
	});

	it('empty events → empty buckets', () => {
		expect(bucketByGranularity([], 'day')).toHaveLength(0);
	});
});
```

- [ ] **Step 5.2: Implementar**

```ts
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
		const yyyy = String(y);
		const mm = String(m + 1).padStart(2, '0');
		const dd = String(d).padStart(2, '0');
		return { key: `${yyyy}-${mm}-${dd}`, anchorDate: anchor };
	}
	if (gran === 'month') {
		const anchor = new Date(y, m, 1);
		return { key: `${y}-${String(m + 1).padStart(2, '0')}`, anchorDate: anchor };
	}
	const anchor = isoWeekStart(date);
	const { isoYear, isoWeek } = isoWeekYearAndNumber(anchor);
	return { key: `${isoYear}-W${String(isoWeek).padStart(2, '0')}`, anchorDate: anchor };
}

function isoWeekStart(date: Date): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const day = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - day);
	return d;
}

function isoWeekYearAndNumber(date: Date): { isoYear: number; isoWeek: number } {
	const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = (target.getUTCDay() + 6) % 7;
	target.setUTCDate(target.getUTCDate() - dayNum + 3);
	const isoYear = target.getUTCFullYear();
	const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
	const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
	firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);
	const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
	return { isoYear, isoWeek: 1 + Math.round(diff / 7) };
}
```

- [ ] **Step 5.3: PASS**

Run: `npx vitest run tests/analytics/data/codebookTimelineEngine.test.ts -t bucketByGranularity`
Expected: 8 PASS.

---

### Task 6: TDD — `renderTimelineEntryMarkdown`

- [ ] **Step 6.1: Tests**

```ts
describe('renderTimelineEntryMarkdown', () => {
	function ev(entry: AuditEntry, codeName = 'Alpha'): TimelineEvent {
		return {
			entry, codeId: entry.codeId, codeName,
			codeColor: '#000', isDeleted: false, filterBucket: 'created',
		};
	}

	it('formats created with code name', () => {
		const at = new Date('2026-04-28T15:32:00Z').getTime();
		const out = renderTimelineEntryMarkdown(ev({ id: 'e1', type: 'created', codeId: 'c', at }));
		expect(out).toBe('- 15:32 — **Alpha** created');
	});

	it('formats renamed with from/to', () => {
		const at = new Date('2026-04-28T15:32:00Z').getTime();
		const out = renderTimelineEntryMarkdown(ev(
			{ id: 'e1', type: 'renamed', codeId: 'c', from: 'old', to: 'new', at },
		));
		expect(out).toBe('- 15:32 — **Alpha** renamed: "old" → "new"');
	});

	it('formats memo_edited and description_edited as distinct labels', () => {
		const at = new Date('2026-04-28T15:32:00Z').getTime();
		const memo = renderTimelineEntryMarkdown(ev(
			{ id: 'e1', type: 'memo_edited', codeId: 'c', from: '', to: 'm', at },
		));
		const desc = renderTimelineEntryMarkdown(ev(
			{ id: 'e2', type: 'description_edited', codeId: 'c', from: '', to: 'd', at },
		));
		expect(memo).toBe('- 15:32 — **Alpha** memo edited');
		expect(desc).toBe('- 15:32 — **Alpha** description edited');
	});

	it('formats absorbed with quoted names', () => {
		const at = new Date('2026-04-28T15:32:00Z').getTime();
		const out = renderTimelineEntryMarkdown(ev(
			{ id: 'e1', type: 'absorbed', codeId: 'c', absorbedNames: ['B', 'C'], absorbedIds: ['cb', 'cc'], at },
		));
		expect(out).toBe('- 15:32 — **Alpha** absorbed: "B", "C"');
	});

	it('formats merged_into with target name', () => {
		const at = new Date('2026-04-28T15:32:00Z').getTime();
		const out = renderTimelineEntryMarkdown(ev(
			{ id: 'e1', type: 'merged_into', codeId: 'c', intoId: 't', intoName: 'Target', at },
		));
		expect(out).toBe('- 15:32 — **Alpha** merged into "Target"');
	});

	it('formats deleted', () => {
		const at = new Date('2026-04-28T15:32:00Z').getTime();
		const out = renderTimelineEntryMarkdown(ev({ id: 'e1', type: 'deleted', codeId: 'c', at }));
		expect(out).toBe('- 15:32 — **Alpha** deleted');
	});
});
```

- [ ] **Step 6.2: Implementar**

```ts
export function renderTimelineEntryMarkdown(event: TimelineEvent): string {
	const date = new Date(event.entry.at);
	const time = date.toISOString().slice(11, 16);
	const name = event.codeName;
	const e = event.entry;
	switch (e.type) {
		case 'created':            return `- ${time} — **${name}** created`;
		case 'renamed':            return `- ${time} — **${name}** renamed: "${e.from}" → "${e.to}"`;
		case 'description_edited': return `- ${time} — **${name}** description edited`;
		case 'memo_edited':        return `- ${time} — **${name}** memo edited`;
		case 'absorbed':           return `- ${time} — **${name}** absorbed: ${e.absorbedNames.map(n => `"${n}"`).join(', ')}`;
		case 'merged_into':        return `- ${time} — **${name}** merged into "${e.intoName}"`;
		case 'deleted':            return `- ${time} — **${name}** deleted`;
	}
}
```

- [ ] **Step 6.3: PASS — todos os tests do engine**

Run: `npx vitest run tests/analytics/data/codebookTimelineEngine.test.ts`
Expected: ~25 PASS no total.

- [ ] **Step 6.4: Commit**

```bash
~/.claude/scripts/commit.sh "feat(analytics): codebookTimelineEngine — helpers puros (TDD)"
```

---

## Chunk 2: ViewMode + Context state + API

### Task 7: Adicionar `"codebook-timeline"` em `ViewMode` + state em `AnalyticsViewContext`

**Files:**
- Modify: `src/analytics/views/analyticsViewContext.ts`

- [ ] **Step 7.1: Estender union `ViewMode`**

Edit linha 10 de `analyticsViewContext.ts`, adicionar `"codebook-timeline"` no fim:

```ts
export type ViewMode = "dashboard" | "frequency" | ... | "memo-view" | "codebook-timeline";
```

- [ ] **Step 7.2: Adicionar import + 4 fields**

Topo do arquivo, adicionar:

```ts
import type { Granularity, EventTypeFilter } from "../data/codebookTimelineEngine";
```

E adicionar 4 fields no `AnalyticsViewContext` (depois de "Memo View state"):

```ts
  // Codebook Timeline state
  ctGranularity: Granularity;                 // default 'day'
  ctEventBuckets: Set<EventTypeFilter>;       // default = all 6
  ctCodeSearch: string;                       // default ''
  ctShowHidden: boolean;                      // default false
```

- [ ] **Step 7.3: tsc fail esperado em `analyticsView.ts`** (constructor não inicializa fields novos)

Run: `npm run build`
Expected: tsc errors em `analyticsView.ts`. OK.

---

### Task 8: Inicializar fields no `analyticsView.ts`

**Files:**
- Modify: `src/analytics/views/analyticsView.ts`

- [ ] **Step 8.1: Achar onde os outros context fields são inicializados**

Run: `grep -n "mvGroupBy\|mvShowTypes" src/analytics/views/analyticsView.ts | head`
(achar o ponto de init dos `mv*` — irmãos diretos dos fields novos.)

- [ ] **Step 8.2: Adicionar inits depois dos `mv*`**

```ts
ctGranularity: 'day',
ctEventBuckets: new Set(['created', 'renamed', 'edited', 'absorbed', 'merged_into', 'deleted']),
ctCodeSearch: '',
ctShowHidden: false,
```

- [ ] **Step 8.3: tsc check**

Run: `npm run build`
Expected: PASS.

---

### Task 9: Expor `revealCodeDetailForCode` na `AnalyticsPluginAPI`

**Files:**
- Modify: `src/analytics/index.ts`

- [ ] **Step 9.1: Adicionar field no interface (linha 19-32)**

```ts
export interface AnalyticsPluginAPI {
  // ... existing ...
  revealCodeDetailForCode(codeId: string): Promise<void>;
}
```

- [ ] **Step 9.2: Wire no `registerAnalyticsEngine`**

No literal `const api: AnalyticsPluginAPI = {`, adicionar:

```ts
revealCodeDetailForCode: (codeId) => plugin.revealCodeDetailForCode(codeId),
```

- [ ] **Step 9.3: tsc check**

Run: `npm run build`
Expected: PASS.

---

### Task 10: Mode entry no `MODE_REGISTRY`

**Files:**
- Modify: `src/analytics/views/modes/modeRegistry.ts`

- [ ] **Step 10.1: Import**

Topo:

```ts
import {
  renderCodebookTimeline,
  renderCodebookTimelineOptions,
  exportCodebookTimelineMarkdown,
} from "./codebookTimelineMode";
```

- [ ] **Step 10.2: Entry no `MODE_REGISTRY`** (no fim do object)

```ts
"codebook-timeline": {
  label: "Codebook Timeline",
  render: renderCodebookTimeline,
  renderOptions: renderCodebookTimelineOptions,
  exportMarkdown: exportCodebookTimelineMarkdown,
},
```

- [ ] **Step 10.3: tsc fail esperado** (`codebookTimelineMode.ts` não existe ainda)

Run: `npm run build`
Expected: errors. Próxima task cria.

---

## Chunk 3: Mode render

### Task 11: Skeleton de `codebookTimelineMode.ts`

**Files:**
- Create: `src/analytics/views/modes/codebookTimelineMode.ts`

- [ ] **Step 11.1: Criar arquivo com 3 funções stub**

```ts
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig } from "../../data/dataTypes";

export function renderCodebookTimeline(_ctx: AnalyticsViewContext, _filters: FilterConfig): void {
	// TODO impl em Task 12
}

export function renderCodebookTimelineOptions(_ctx: AnalyticsViewContext): void {
	// TODO impl em Task 13
}

export async function exportCodebookTimelineMarkdown(_ctx: AnalyticsViewContext, _date: string): Promise<void> {
	// TODO impl em Task 14
}
```

- [ ] **Step 11.2: tsc check**

Run: `npm run build`
Expected: PASS.

---

### Task 12: Implementar `renderCodebookTimeline`

**Files:**
- Modify: `src/analytics/views/modes/codebookTimelineMode.ts`

- [ ] **Step 12.1: Imports + helpers**

Adicionar no topo:

```ts
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig } from "../../data/dataTypes";
import type { AuditEntry } from "../../../core/types";
import {
	buildTimelineEvents, filterEvents, bucketByGranularity, renderTimelineEntryMarkdown,
	EVENT_COLORS,
	type TimelineEvent, type EventTypeFilter,
} from "../../data/codebookTimelineEngine";
import { Chart } from "chart.js";
```

- [ ] **Step 12.2: Implementar render**

Substituir `renderCodebookTimeline` stub:

```ts
export function renderCodebookTimeline(ctx: AnalyticsViewContext, _filters: FilterConfig): void {
	const container = ctx.chartContainer;
	if (!container) return;
	container.empty();

	const log = (ctx.plugin.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
	const codes = ctx.plugin.registry.getAll();
	const registry = new Map(codes.map(c => [c.id, c]));

	const events = buildTimelineEvents(log, registry, { includeHidden: ctx.ctShowHidden });
	const filtered = filterEvents(events, ctx.ctEventBuckets, ctx.ctCodeSearch);

	if (filtered.length === 0) {
		container.createEl('div', {
			cls: 'analytics-empty-state',
			text: log.length === 0
				? 'No codebook events recorded yet.'
				: 'No events match the current filters.',
		});
		return;
	}

	// 1. Stacked bar chart
	const buckets = bucketByGranularity(filtered, ctx.ctGranularity);
	const chartWrap = container.createDiv({ cls: 'codebook-timeline-chart' });
	const canvas = chartWrap.createEl('canvas');
	chartWrap.style.height = '220px';
	chartWrap.style.marginBottom = 'var(--size-4-3)';

	if (ctx.activeChartInstance) {
		ctx.activeChartInstance.destroy();
		ctx.activeChartInstance = null;
	}

	const labels = buckets.map(b => b.bucketKey);
	const filterTypes: EventTypeFilter[] = ['created', 'renamed', 'edited', 'absorbed', 'merged_into', 'deleted'];
	const datasets = filterTypes.map(t => ({
		label: t,
		data: buckets.map(b => b.counts[t]),
		backgroundColor: EVENT_COLORS[t],
		stack: 'events',
	}));

	ctx.activeChartInstance = new Chart(canvas, {
		type: 'bar',
		data: { labels, datasets },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				x: { stacked: true },
				y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
			},
			plugins: {
				legend: { position: 'bottom' },
				tooltip: { mode: 'index', intersect: false },
			},
		},
	});

	// 2. Lista descending
	const listWrap = container.createDiv({ cls: 'codebook-timeline-list' });
	const desc = filtered.slice().reverse();
	let currentDay = '';
	for (const ev of desc) {
		const date = new Date(ev.entry.at);
		const dayKey = date.toISOString().slice(0, 10);
		if (dayKey !== currentDay) {
			listWrap.createEl('h4', { text: dayKey, cls: 'codebook-timeline-day-header' });
			currentDay = dayKey;
		}
		const row = listWrap.createDiv({
			cls: 'codebook-timeline-row' + (ev.isDeleted ? ' is-deleted' : ''),
		});
		const time = date.toISOString().slice(11, 16);
		row.createSpan({ text: time, cls: 'codebook-timeline-time' });
		const dot = row.createSpan({ cls: 'codebook-timeline-dot' });
		dot.style.backgroundColor = ev.codeColor ?? '#888';
		const nameEl = row.createSpan({ text: ev.codeName, cls: 'codebook-timeline-codename' });
		row.createSpan({ text: entryActionLabel(ev), cls: 'codebook-timeline-action' });
		if (!ev.isDeleted) {
			nameEl.style.cursor = 'pointer';
			nameEl.addEventListener('click', () => {
				ctx.plugin.revealCodeDetailForCode(ev.codeId);
			});
		}
	}
}

function entryActionLabel(ev: TimelineEvent): string {
	const e = ev.entry;
	switch (e.type) {
		case 'created': return ' created';
		case 'renamed': return ` renamed: "${e.from}" → "${e.to}"`;
		case 'description_edited': return ' description edited';
		case 'memo_edited': return ' memo edited';
		case 'absorbed': return ` absorbed: ${e.absorbedNames.map(n => `"${n}"`).join(', ')}`;
		case 'merged_into': return ` merged into "${e.intoName}"`;
		case 'deleted': return ' deleted';
	}
}
```

- [ ] **Step 12.3: tsc check**

Run: `npm run build`
Expected: PASS.

---

### Task 13: Implementar `renderCodebookTimelineOptions` (config sidebar)

- [ ] **Step 13.1: Implementar**

Substituir stub:

```ts
export function renderCodebookTimelineOptions(ctx: AnalyticsViewContext): void {
	const container = ctx.configPanelEl;
	if (!container) return;

	// 1. Granularity dropdown
	const granSection = container.createDiv({ cls: 'analytics-config-section' });
	granSection.createEl('label', { text: 'Granularity', cls: 'setting-item-name' });
	const granSelect = granSection.createEl('select');
	for (const g of ['day', 'week', 'month'] as const) {
		const opt = granSelect.createEl('option', { value: g, text: g[0]!.toUpperCase() + g.slice(1) });
		if (ctx.ctGranularity === g) opt.selected = true;
	}
	granSelect.addEventListener('change', () => {
		ctx.ctGranularity = granSelect.value as typeof ctx.ctGranularity;
		ctx.scheduleUpdate();
	});

	// 2. Event type chips (6 buckets)
	const typesSection = container.createDiv({ cls: 'analytics-config-section' });
	typesSection.createEl('label', { text: 'Event types', cls: 'setting-item-name' });
	const types: { id: EventTypeFilter; label: string }[] = [
		{ id: 'created', label: 'Created' },
		{ id: 'renamed', label: 'Renamed' },
		{ id: 'edited', label: 'Edited' },
		{ id: 'absorbed', label: 'Absorbed' },
		{ id: 'merged_into', label: 'Merged into' },
		{ id: 'deleted', label: 'Deleted' },
	];
	const chipWrap = typesSection.createDiv({ cls: 'codebook-timeline-chips' });
	for (const t of types) {
		const chip = chipWrap.createDiv({ cls: 'codebook-timeline-chip' });
		const isOn = ctx.ctEventBuckets.has(t.id);
		if (isOn) chip.addClass('is-on');
		chip.style.borderLeft = `4px solid ${EVENT_COLORS[t.id]}`;
		chip.createSpan({ text: t.label });
		chip.addEventListener('click', () => {
			if (ctx.ctEventBuckets.has(t.id)) ctx.ctEventBuckets.delete(t.id);
			else ctx.ctEventBuckets.add(t.id);
			ctx.scheduleUpdate();
			ctx.renderConfigPanel();
		});
	}

	// 3. Code search
	const searchSection = container.createDiv({ cls: 'analytics-config-section' });
	searchSection.createEl('label', { text: 'Filter by code', cls: 'setting-item-name' });
	const searchInput = searchSection.createEl('input', {
		type: 'text',
		placeholder: 'Search code name...',
		value: ctx.ctCodeSearch,
	});
	searchInput.addEventListener('input', () => {
		ctx.ctCodeSearch = searchInput.value;
		ctx.scheduleUpdate();
	});

	// 4. Show hidden toggle (só aparece se há hidden no log)
	const log = (ctx.plugin.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
	const hiddenCount = log.filter(e => e.hidden).length;
	if (hiddenCount > 0) {
		const hiddenSection = container.createDiv({ cls: 'analytics-config-section' });
		const lbl = hiddenSection.createEl('label', { cls: 'setting-item-name' });
		const cb = lbl.createEl('input', { type: 'checkbox' });
		cb.checked = ctx.ctShowHidden;
		lbl.appendText(` Show hidden (${hiddenCount})`);
		cb.addEventListener('change', () => {
			ctx.ctShowHidden = cb.checked;
			ctx.scheduleUpdate();
		});
	}
}
```

- [ ] **Step 13.2: tsc check**

Run: `npm run build`
Expected: PASS.

---

### Task 14: Implementar `exportCodebookTimelineMarkdown`

- [ ] **Step 14.1: Imports adicionais**

```ts
import { TFile } from 'obsidian';
```

- [ ] **Step 14.2: Implementar**

Substituir stub:

```ts
export async function exportCodebookTimelineMarkdown(ctx: AnalyticsViewContext, date: string): Promise<void> {
	const log = (ctx.plugin.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
	const codes = ctx.plugin.registry.getAll();
	const registry = new Map(codes.map(c => [c.id, c]));

	const events = buildTimelineEvents(log, registry, { includeHidden: ctx.ctShowHidden });
	const filtered = filterEvents(events, ctx.ctEventBuckets, ctx.ctCodeSearch);

	const lines: string[] = [`# Codebook Timeline — ${date}`, '', `_Exportado em ${date}._`, ''];
	if (filtered.length === 0) {
		lines.push('_No events matching current filters._');
	} else {
		// Agrupa por dia desc
		const desc = filtered.slice().reverse();
		let currentDay = '';
		for (const ev of desc) {
			const dayKey = new Date(ev.entry.at).toISOString().slice(0, 10);
			if (dayKey !== currentDay) {
				if (currentDay) lines.push('');
				lines.push(`## ${dayKey}`);
				currentDay = dayKey;
			}
			lines.push(renderTimelineEntryMarkdown(ev));
		}
	}
	const md = lines.join('\n') + '\n';

	const path = `Codebook timeline — ${date}.md`;
	const existing = ctx.plugin.app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await ctx.plugin.app.vault.modify(existing, md);
	} else {
		await ctx.plugin.app.vault.create(path, md);
	}
	const file = ctx.plugin.app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) await ctx.plugin.app.workspace.getLeaf(true).openFile(file);
}
```

- [ ] **Step 14.3: Build + run tests**

```bash
npm run build && npm run test 2>&1 | tail -3
```

Expected: build passes, tests verde (~2425).

- [ ] **Step 14.4: Commit chunk inteiro de UI**

```bash
~/.claude/scripts/commit.sh "feat(analytics): codebook timeline mode — chart + lista + config + export"
```

---

## Chunk 4: CSS + seed + smoke test

### Task 15: CSS pra timeline

**Files:**
- Modify: `styles.css`

- [ ] **Step 15.1: Adicionar bloco no fim**

```css
/* ─── Codebook Timeline (Analytics mode) ─── */

.codebook-timeline-list {
	margin-top: var(--size-4-3);
}

.codebook-timeline-day-header {
	margin: var(--size-4-3) 0 var(--size-2-2) 0;
	font-size: var(--font-ui-small);
	color: var(--text-muted);
	font-weight: 600;
}

.codebook-timeline-row {
	display: flex;
	align-items: center;
	gap: var(--size-4-2);
	padding: var(--size-2-1) 0;
	font-size: var(--font-ui-small);
}

.codebook-timeline-row.is-deleted {
	opacity: 0.5;
	font-style: italic;
}

.codebook-timeline-time {
	color: var(--text-muted);
	font-variant-numeric: tabular-nums;
	min-width: 3.5em;
}

.codebook-timeline-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}

.codebook-timeline-codename {
	font-weight: 600;
	color: var(--text-normal);
}

.codebook-timeline-codename:hover {
	color: var(--interactive-accent);
	text-decoration: underline;
}

.codebook-timeline-action {
	color: var(--text-muted);
}

.codebook-timeline-chips {
	display: flex;
	flex-wrap: wrap;
	gap: var(--size-2-2);
}

.codebook-timeline-chip {
	padding: var(--size-2-1) var(--size-4-2);
	background: var(--background-secondary);
	border-radius: var(--radius-s);
	cursor: pointer;
	font-size: var(--font-ui-small);
	opacity: 0.5;
}

.codebook-timeline-chip.is-on {
	opacity: 1;
	background: var(--background-modifier-hover);
}
```

- [ ] **Step 15.2: Build + commit**

```bash
npm run build
~/.claude/scripts/commit.sh "feat(analytics): CSS pra codebook timeline mode"
```

---

### Task 16: Seed script

**Files:**
- Create: `scripts/seed-codebook-timeline-demo.mjs`

- [ ] **Step 16.1: Criar script**

```js
#!/usr/bin/env node
// Seed pra smoke test do Codebook Timeline mode (Analytics).
// Reusa o seed do audit log #29 quando possível — o demo dele já cria 6 codes
// + 2 tombstones com timeline de 28 dias.
//
// Usage: node scripts/seed-codebook-timeline-demo.mjs
//
// O dataset gerado é o mesmo do seed-audit-log-demo.mjs (idempotente, prefixo "Demo · ").
// Pra limpar: bulk delete em "Demo · *" no codebook.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const target = path.join(__dirname, 'seed-audit-log-demo.mjs');

const result = spawnSync('node', [target], { stdio: 'inherit' });
process.exit(result.status ?? 0);
```

(reusa diretamente o seed existente — single source of truth.)

- [ ] **Step 16.2: Rodar e verificar**

```bash
node scripts/seed-codebook-timeline-demo.mjs
```

Expected: backup criado + demo codes + auditLog populado.

- [ ] **Step 16.3: Commit**

```bash
~/.claude/scripts/commit.sh "chore(scripts): seed-codebook-timeline-demo wrapper"
```

---

### Task 17: Smoke test em vault real

**Vault:** `/Users/mosx/Desktop/obsidian-plugins-workbench/`

> Per CLAUDE.md, smoke test em vault real é checkpoint obrigatório.

- [ ] **Step 17.1: Reload Obsidian** (Cmd+R)

- [ ] **Step 17.2: Roteiro**

| # | Ação | Esperado |
|---|---|---|
| 1 | Abrir Analytics view | Painel padrão |
| 2 | Mode dropdown → "Codebook Timeline" | Stacked bar chart aparece + lista cronológica abaixo |
| 3 | No config sidebar, mudar Granularity → Week | Chart re-renderiza com 4-5 colunas (semanas) |
| 4 | Mudar Granularity → Month | 1-2 colunas (meses) |
| 5 | Voltar pra Day. Click num chip "Renamed" pra desligar | Stack do "Renamed" some do chart, lista filtra |
| 6 | Digitar "Demo" no Filter by code | Lista filtra (todos os demo codes) |
| 7 | Limpar filter. Click no nome de um código vivo na lista | Code Detail abre na sidebar direita |
| 8 | Click no nome de um código deletado (cinza/italic) | No-op (sem cursor pointer) |
| 9 | Apertar Export Markdown (botão na toolbar) | Cria nota `Codebook timeline — YYYY-MM-DD.md` na raiz, abre |
| 10 | Verifica formato do markdown — tem header dia + entries com `**Code Name** action` | OK |

- [ ] **Step 17.3: Se algo quebrar**

Anotar exatamente o que faltou. Voltar à task relevante e ajustar. Re-run `npm run test` antes de commitar.

---

### Task 18: Update ROADMAP + memory

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 18.1: Marcar item Codebook timeline como FEITO**

Linha do ROADMAP §3 Analytics — substituir:

```markdown
| ~~**Codebook timeline central**~~ | 4-5h MVP / 7-9h full | ✅ FEITO 2026-04-28 — ver registro #31. Mode novo no Analytics consumindo `data.auditLog` (#29). Stacked bar chart (day/week/month) + lista filtrável + click navega + export markdown. |
```

E na linha 14 ("O que tem aberto" da área Analytics):

```markdown
| **[Analytics](#3-analytics--melhorias)** | Multi-tab xlsx export |
```

(Codebook timeline central sai da lista de aberto.)

- [ ] **Step 18.2: Adicionar registro #31**

No fim da seção `## ✅ Implementados (registro)`, ANTES do #30:

```markdown
- **#31 Codebook Timeline (Analytics)** — 2026-04-28. Branch `feat/codebook-timeline`. Mode novo no Analytics que consome `data.auditLog` (#29) com cronologia cross-código de TODAS as decisões do codebook. Distinto do Temporal mode (que mostra `marker.createdAt`). **Implementação:** (a) `src/analytics/data/codebookTimelineEngine.ts` (novo) — helpers puros: `buildCodeNameLookup` (resolve nomes de códigos deletados via varredura do log: `renamed.to` + `absorbed.absorbedNames` pareado com `absorbedIds`), `buildTimelineEvents`, `filterEvents`, `bucketByGranularity` (day/week/month com ISO-week year correto — usa Thursday da semana pra determinar ano), `renderTimelineEntryMarkdown`, types/constantes (`EventTypeFilter`, `EVENT_COLORS`, `EVENT_TYPE_TO_FILTER`). (b) `src/analytics/views/modes/codebookTimelineMode.ts` (novo) — Chart.js stacked bar (220px altura) + lista descending agrupada por dia + click no code name navega via `revealCodeDetailForCode`. (c) State per-mode no `AnalyticsViewContext`: `ctGranularity`/`ctEventBuckets`/`ctCodeSearch`/`ctShowHidden`. (d) Config sidebar: dropdown granularity, 6 chips de event types (toggle), input de search, toggle "Show hidden (N)" condicional. (e) `revealCodeDetailForCode` exposto na `AnalyticsPluginAPI`. (f) Export markdown: cria `Codebook timeline — YYYY-MM-DD.md` na raiz do vault (pattern do `exportCodeHistory`). **Decisões de escopo:** chart agrega `description_edited`+`memo_edited` em "edited" (1 cor); lista e markdown mantêm labels específicos (informação barata e útil). 6 cores fixas neutras (não match com paletteIndex de codes). Date range filter, tooltip rico, drill-down no chart e heatmap calendar ficam fora (YAGNI). +25 testes (engine puro). 2412 → ~2437 tests verde.
```

- [ ] **Step 18.3: Atualizar memory `project_next_task.md`** (em `~/.claude/projects/-Users-mosx-Desktop-obsidian-plugins-workbench--obsidian-plugins-obsidian-qualia-coding/memory/`)

Mark ✅ Tier 2 + Codebook timeline como done. Estado atual ficou: "Tier 2 do Coding Management 100% fechado (#30) + Codebook timeline (#31). Próximo natural: Multi-tab xlsx export, ou pivotar pra decisões abertas."

- [ ] **Step 18.4: Commit**

```bash
~/.claude/scripts/commit.sh "docs(roadmap): #31 codebook timeline feito"
```

---

## Chunk 5: Auto-merge

### Task 19: Merge pra main

> Per `feedback_auto_post_task_cleanup.md` — auto-merge sem perguntar (após smoke test passar).

- [ ] **Step 19.1: Verificar tudo verde**

```bash
npm run test 2>&1 | tail -3
npm run build 2>&1 | tail -3
git status
```

Expected: tests passed, build OK, working tree limpo.

- [ ] **Step 19.2: Merge + push + delete branch**

```bash
git checkout main
git merge feat/codebook-timeline --no-ff -m "feat(analytics): codebook timeline central (#31)"
git push origin main
git branch -d feat/codebook-timeline
```

- [ ] **Step 19.3: Final report**

Resumir:
- O que mudou (engine + mode + chart + export)
- Test count antes/depois
- ROADMAP §3 atualizado (Codebook timeline central → done)

---

## Resumo de cobertura

| Camada | Cobertura |
|--------|-----------|
| Engine puro (5 helpers) | `codebookTimelineEngine.test.ts` ~25 tests |
| Mode UI (chart + lista + config) | Smoke test em vault real (Task 17) |
| Export markdown | Smoke test (Task 17 #9) |
| Round-trip QDPX | N/A — schema não muda |

## Riscos do plano

| Risco | Mitigação |
|-------|-----------|
| Chart.js destroy timing leaks instance | `ctx.activeChartInstance` check + destroy antes do render (Task 12) |
| Dia bucket via UTC vs local em fuso UTC+ pode shift dia | Step 5.2 usa `new Date(y, m, d)` (local), bucket key construído via componentes locais — sidesteps |
| ISO-week ano-cruzando | Tests dedicados (Task 5) cobrem 4 edge cases obrigatórios |
| Lista com 5k+ rows | Aceitável (pattern dos outros modes); virtual scroll fica como follow-up se aparecer dor |

## Quando algo dá errado

- **Tests falham em ISO-week:** verificar `isoWeekYearAndNumber` usa `target.getUTCFullYear()` (não `anchor.getFullYear()`).
- **Chart não aparece:** verificar import `Chart` from `chart.js` está correto (Chart.js v4 já é dep do projeto via outros modes).
- **Click no code name não navega:** verificar `plugin.revealCodeDetailForCode` exposto em `AnalyticsPluginAPI` E wire no constructor.
- **Lista mostra `codeId` em vez de nome:** `buildCodeNameLookup` falha em achar — checar log preserva `renamed.to` ou `absorbed.absorbedNames`.
