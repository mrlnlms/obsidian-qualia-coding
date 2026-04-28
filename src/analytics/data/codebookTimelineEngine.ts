/**
 * codebookTimelineEngine — helpers puros pro mode "Codebook Timeline" do Analytics.
 *
 * Consome `data.auditLog` (#29) com cronologia cross-código. Distinto do Temporal mode
 * (que mostra `marker.createdAt`) — aqui o eixo é decisões analíticas (`auditEntry.at`).
 *
 * Sem deps de DOM ou Obsidian — testável em isolamento (jsdom).
 */

import type { AuditEntry, CodeDefinition } from '../../core/types';

export type Granularity = 'day' | 'week' | 'month';

/** Filter buckets — `description_edited`+`memo_edited` agregam em "edited" no chart/filtro. */
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

/** Cores fixas neutras (não match com paletteIndex de codes). */
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

/**
 * Resolve nomes de códigos deletados varrendo o log:
 * - registry: nomes vivos (verdade absoluta)
 * - `renamed.to`: último nome conhecido — last-write-wins (varre log em ordem)
 * - `absorbed.absorbedNames[i]` pareado com `absorbedIds[i]`: pra códigos consumidos em merges
 * - Fallback final: codeId.
 */
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

/** Constrói events ordenados por `at` ascending. Filtra hidden por default. */
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
 * Agrupa events por bucket de granularidade. Bucket key:
 * - day: 'YYYY-MM-DD' (componentes locais)
 * - week: 'YYYY-Www' (ISO 8601 — week 1 contém Thursday)
 * - month: 'YYYY-MM'
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
