/**
 * detailListRenderer — Renders the "All Codes" list mode for BaseCodeDetailView.
 *
 * Pure rendering functions: receive container + data, produce DOM.
 */

import { SearchComponent } from 'obsidian';
import type { BaseMarker, SidebarModelInterface } from './types';

export interface ListRendererCallbacks {
	onCodeClick(codeName: string): void;
	onSearchChange(query: string): void;
}

/**
 * Render the full list mode shell: header, search input, and content zone.
 * Returns references to the search wrap and content zone for incremental updates.
 */
export function renderListShell(
	container: HTMLElement,
	model: SidebarModelInterface,
	callbacks: ListRendererCallbacks,
): { listSearchWrap: HTMLElement | null; listContentZone: HTMLElement | null } {
	container.empty();

	const codes = model.registry.getAll();

	// Header
	const header = container.createDiv({ cls: 'codemarker-explorer-header' });
	header.createSpan({ text: 'All Codes', cls: 'codemarker-explorer-title' });
	header.createSpan({ text: `${codes.length}`, cls: 'codemarker-explorer-count' });

	if (codes.length === 0) {
		container.createEl('p', { text: 'No codes yet.', cls: 'codemarker-detail-empty' });
		return { listSearchWrap: null, listContentZone: null };
	}

	// Search input (persistent — focus preserved across data refreshes)
	const listSearchWrap = container.createDiv({ cls: 'codemarker-detail-search-wrap' });
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	new SearchComponent(listSearchWrap)
		.setPlaceholder('Filter codes...')
		.onChange((value: string) => {
			if (searchTimeout) clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				callbacks.onSearchChange(value);
			}, 150);
		});

	// Content zone (replaced on search/data refresh, search input stays)
	const listContentZone = container.createDiv();

	return { listSearchWrap, listContentZone };
}

/**
 * Render the filtered code list inside the content zone.
 */
export function renderListContent(
	contentZone: HTMLElement,
	model: SidebarModelInterface,
	searchQuery: string,
	callbacks: ListRendererCallbacks,
): void {
	contentZone.empty();

	const codes = model.registry.getAll();
	const counts = countSegmentsPerCode(model.getAllMarkers());

	// Filtered codes
	const q = searchQuery.toLowerCase();
	const filteredCodes = q
		? codes.filter(def => def.name.toLowerCase().includes(q))
		: codes;

	// List
	const list = contentZone.createDiv({ cls: 'codemarker-explorer-list' });
	for (const def of filteredCodes) {
		const count = counts.get(def.name) ?? 0;
		const row = list.createDiv({ cls: 'codemarker-explorer-row' });

		const swatch = row.createSpan({ cls: 'codemarker-detail-swatch' });
		swatch.style.backgroundColor = def.color;

		const info = row.createDiv({ cls: 'codemarker-explorer-row-info' });
		info.createSpan({ text: def.name, cls: 'codemarker-explorer-row-name' });
		if (def.description) {
			info.createSpan({ text: def.description, cls: 'codemarker-explorer-row-desc' });
		}

		row.createSpan({ text: `${count}`, cls: 'codemarker-explorer-row-count' });

		row.addEventListener('click', () => {
			callbacks.onCodeClick(def.name);
		});
	}
}

/** Count how many segments reference each code name. */
export function countSegmentsPerCode(markers: BaseMarker[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const marker of markers) {
		for (const code of marker.codes) {
			counts.set(code, (counts.get(code) ?? 0) + 1);
		}
	}
	return counts;
}
