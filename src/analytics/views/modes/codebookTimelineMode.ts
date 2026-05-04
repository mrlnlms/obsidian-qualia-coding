/**
 * codebookTimelineMode — mode "Codebook Timeline" do Analytics.
 *
 * Consome `data.auditLog` (#29) com cronologia cross-código:
 * - Stacked bar chart (granularity day/week/month)
 * - Lista descending agrupada por dia
 * - Click no code name navega pro Code Detail
 * - Export markdown na raiz do vault
 */

import { TFile } from "obsidian";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import type { FilterConfig } from "../../data/dataTypes";
import type { AuditEntry } from "../../../core/types";
import {
	buildTimelineEvents, filterEvents, bucketByGranularity, renderTimelineEntryMarkdown,
	EVENT_COLORS,
	type TimelineEvent, type EventTypeFilter,
} from "../../data/codebookTimelineEngine";

function loadAuditLog(ctx: AnalyticsViewContext): AuditEntry[] {
	return (ctx.plugin.dataManager.section('auditLog') as AuditEntry[] | undefined) ?? [];
}

function buildRegistry(ctx: AnalyticsViewContext): Map<string, import("../../../core/types").CodeDefinition> {
	return new Map(ctx.plugin.registry.getAll().map(c => [c.id, c]));
}

export async function renderCodebookTimeline(ctx: AnalyticsViewContext, _filters: FilterConfig): Promise<void> {
	const container = ctx.chartContainer;
	if (!container) return;
	container.empty();

	const log = loadAuditLog(ctx);
	const registry = buildRegistry(ctx);
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
	await renderChart(ctx, container, filtered);

	// 2. Lista descending agrupada por dia
	renderList(ctx, container, filtered);
}

async function renderChart(
	ctx: AnalyticsViewContext,
	container: HTMLElement,
	filtered: TimelineEvent[],
): Promise<void> {
	const { Chart, registerables } = await import("chart.js");
	Chart.register(...registerables);

	if (ctx.activeChartInstance) {
		ctx.activeChartInstance.destroy();
		ctx.activeChartInstance = null;
	}

	const buckets = bucketByGranularity(filtered, ctx.ctGranularity);
	const chartWrap = container.createDiv({ cls: 'codebook-timeline-chart' });
	chartWrap.style.height = '220px';
	chartWrap.style.position = 'relative';
	chartWrap.style.marginBottom = 'var(--size-4-3)';
	const canvas = chartWrap.createEl('canvas');

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
}

function renderList(
	ctx: AnalyticsViewContext,
	container: HTMLElement,
	filtered: TimelineEvent[],
): void {
	const listWrap = container.createDiv({ cls: 'codebook-timeline-list' });
	const desc = filtered.slice().reverse();
	let currentDay = '';
	for (const ev of desc) {
		const date = new Date(ev.entry.at);
		const dayKey = formatLocalDate(date);
		if (dayKey !== currentDay) {
			listWrap.createEl('h4', { text: dayKey, cls: 'codebook-timeline-day-header' });
			currentDay = dayKey;
		}
		const row = listWrap.createDiv({
			cls: 'codebook-timeline-row' + (ev.isDeleted ? ' is-deleted' : ''),
		});
		const time = formatLocalTime(date);
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

function formatLocalDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function formatLocalTime(date: Date): string {
	const h = String(date.getHours()).padStart(2, '0');
	const m = String(date.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
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
		case 'sc_created': return ' created (smart code)';
		case 'sc_predicate_edited': return ' predicate edited';
		case 'sc_memo_edited': return ' memo edited';
		case 'sc_auto_rewritten_on_merge': return ` predicate auto-rewritten (${e.sourceCodeId} → ${e.targetCodeId})`;
		case 'sc_deleted': return ' deleted (smart code)';
	}
}

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
	const log = loadAuditLog(ctx);
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

export async function exportCodebookTimelineMarkdown(ctx: AnalyticsViewContext, date: string): Promise<void> {
	const log = loadAuditLog(ctx);
	const registry = buildRegistry(ctx);
	const events = buildTimelineEvents(log, registry, { includeHidden: ctx.ctShowHidden });
	const filtered = filterEvents(events, ctx.ctEventBuckets, ctx.ctCodeSearch);

	const lines: string[] = [`# Codebook Timeline — ${date}`, '', `_Exportado em ${date}._`, ''];
	if (filtered.length === 0) {
		lines.push('_No events matching current filters._');
	} else {
		const desc = filtered.slice().reverse();
		let currentDay = '';
		for (const ev of desc) {
			const dayKey = formatLocalDate(new Date(ev.entry.at));
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
