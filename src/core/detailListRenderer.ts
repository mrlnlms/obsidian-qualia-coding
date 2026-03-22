/**
 * detailListRenderer — Renders the "All Codes" list mode for BaseCodeDetailView.
 *
 * Uses codebookTreeRenderer for hierarchical virtual-scrolled tree display.
 */

import { SearchComponent } from 'obsidian';
import type { BaseMarker, SidebarModelInterface } from './types';
import { renderCodebookTree, type CodebookTreeCallbacks, type CodebookTreeState } from './codebookTreeRenderer';

export interface ListRendererCallbacks extends CodebookTreeCallbacks {
	onSearchChange(query: string): void;
	onDragModeChange(mode: 'reorganize' | 'merge'): void;
}

/**
 * Render the full list mode shell: header, search input, and content zone.
 * Returns references to the search wrap and content zone for incremental updates,
 * plus a cleanup function that cancels any pending search timeout.
 */
export function renderListShell(
	container: HTMLElement,
	model: SidebarModelInterface,
	callbacks: ListRendererCallbacks,
): { listSearchWrap: HTMLElement | null; listContentZone: HTMLElement | null; cleanup: () => void } {
	container.empty();

	const codes = model.registry.getAll();

	// Header
	const header = container.createDiv({ cls: 'codemarker-explorer-header' });
	header.createSpan({ text: 'All Codes', cls: 'codemarker-explorer-title' });
	header.createSpan({ text: `${codes.length}`, cls: 'codemarker-explorer-count' });

	if (codes.length === 0) {
		container.createEl('p', { text: 'No codes yet.', cls: 'codemarker-detail-empty' });
		return { listSearchWrap: null, listContentZone: null, cleanup: () => {} };
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

	const cleanup = () => {
		if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null; }
	};

	return { listSearchWrap, listContentZone, cleanup };
}

/**
 * Render the hierarchical code tree inside the content zone.
 */
export function renderListContent(
	contentZone: HTMLElement,
	model: SidebarModelInterface,
	treeState: CodebookTreeState,
	callbacks: ListRendererCallbacks,
): void {
	contentZone.empty();
	renderCodebookTree(contentZone, model, treeState, callbacks);
}

/** Count how many segments reference each code (by codeId). */
export function countSegmentsPerCode(markers: BaseMarker[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const marker of markers) {
		for (const ca of marker.codes) {
			counts.set(ca.codeId, (counts.get(ca.codeId) ?? 0) + 1);
		}
	}
	return counts;
}
