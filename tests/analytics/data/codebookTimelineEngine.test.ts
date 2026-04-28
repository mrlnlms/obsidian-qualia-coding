import { describe, it, expect } from 'vitest';
import {
	buildCodeNameLookup, buildTimelineEvents, filterEvents,
	bucketByGranularity, renderTimelineEntryMarkdown,
	type TimelineEvent, type EventTypeFilter,
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

	it('uses LAST renamed.to when deleted code had multiple renames', () => {
		const reg = new Map<string, CodeDefinition>();
		const log: AuditEntry[] = [
			{ id: 'a1', type: 'renamed', codeId: 'c_d', from: 'A', to: 'B', at: 100 },
			{ id: 'a2', type: 'renamed', codeId: 'c_d', from: 'B', to: 'C', at: 200 },
		];
		expect(buildCodeNameLookup(log, reg).get('c_d')).toBe('C');
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
		const enabled = new Set<EventTypeFilter>(['created']);
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
		const enabled = new Set<EventTypeFilter>(['created']);
		expect(filterEvents(events, enabled, '')).toHaveLength(2);
		expect(filterEvents(events, enabled, '   ')).toHaveLength(2);
	});
});

describe('bucketByGranularity', () => {
	function eventAt(ts: number, bucket: EventTypeFilter = 'created'): TimelineEvent {
		return {
			entry: { id: `e_${ts}`, type: 'created', codeId: 'c', at: ts },
			codeId: 'c', codeName: 'X', codeColor: '#000', isDeleted: false, filterBucket: bucket,
		};
	}

	it('day buckets', () => {
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
