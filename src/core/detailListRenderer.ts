/**
 * detailListRenderer — Renders the "All Codes" list mode for BaseCodeDetailView.
 *
 * Uses codebookTreeRenderer for hierarchical virtual-scrolled tree display.
 */

import { SearchComponent, setIcon } from 'obsidian';
import type { BaseMarker, SidebarModelInterface } from './types';
import type { MemoMaterializerAccess } from './baseCodeDetailView';
import { renderCodebookTree, type CodebookTreeCallbacks, type CodebookTreeState } from './codebookTreeRenderer';
import { renderCodeGroupsPanel } from './codeGroupsPanel';

export interface ListRendererCallbacks extends CodebookTreeCallbacks {
	onSearchChange(query: string): void;
	onDragModeChange(mode: 'reorganize' | 'merge'): void;
	// Groups
	onSelectGroup(groupId: string | null): void;
	onCreateGroup(): void;
	onGroupChipContextMenu(groupId: string, event: MouseEvent): void;
	onEditGroupDescription(groupId: string): void;
	onEditGroupMemo(groupId: string): void;
	/** Drop de código na chip de um group → adicionar membership. Optional. */
	onDropCodeOnGroup?(codeId: string, groupId: string): void;
	/** Memo materialization access — habilita botão "Convert to note" + card no group memo. Optional. */
	memoAccess?: MemoMaterializerAccess;
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
): { listSearchWrap: HTMLElement | null; listContentZone: HTMLElement | null; cleanup: () => void; updateHeaderCount: (searchQuery?: string) => void } {
	container.empty();

	const codes = model.registry.getAll();
	const total = codes.length;

	// Header
	const header = container.createDiv({ cls: 'codemarker-explorer-header' });
	header.createSpan({ text: 'All Codes', cls: 'codemarker-explorer-title' });
	const countSpan = header.createSpan({ text: `${total}`, cls: 'codemarker-explorer-count' });

	const updateHeaderCount = (searchQuery?: string) => {
		const q = searchQuery?.trim().toLowerCase() ?? '';
		if (!q) { countSpan.setText(`${total}`); return; }
		const filtered = codes.filter(c => c.name.toLowerCase().includes(q)).length;
		countSpan.setText(`${filtered}/${total}`);
	};

	// Toolbar: drag mode toggle + New Code button
	renderCodebookToolbar(container, model, callbacks);

	if (codes.length === 0) {
		container.createEl('p', { text: 'No codes yet.', cls: 'codemarker-detail-empty' });
		return { listSearchWrap: null, listContentZone: null, cleanup: () => {}, updateHeaderCount };
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

	return { listSearchWrap, listContentZone, cleanup, updateHeaderCount };
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

	// Sub-divs separados — renderCodebookTree chama container.empty() e apagaria o painel.
	const panelDiv = contentZone.createDiv();
	const treeDiv = contentZone.createDiv();

	renderCodeGroupsPanel(panelDiv, model.registry, {
		selectedGroupId: treeState.selectedGroupId,
		onSelectGroup: callbacks.onSelectGroup,
		onCreateGroup: callbacks.onCreateGroup,
		onChipContextMenu: callbacks.onGroupChipContextMenu,
		onEditDescription: callbacks.onEditGroupDescription,
		onEditMemo: callbacks.onEditGroupMemo,
		onDropCodeOnGroup: callbacks.onDropCodeOnGroup,
		memoAccess: callbacks.memoAccess,
	});

	renderCodebookTree(treeDiv, model, treeState, callbacks);
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

// ─── Toolbar ─────────────────────────────────────────────

function renderCodebookToolbar(
	container: HTMLElement,
	model: SidebarModelInterface,
	callbacks: ListRendererCallbacks,
): void {
	const toolbar = container.createDiv({ cls: 'codebook-toolbar' });

	// Drag mode toggle
	const toggle = toolbar.createDiv({ cls: 'codebook-toolbar-toggle' });
	const reorgBtn = toggle.createEl('button', { text: 'Reorganize', cls: 'codebook-toggle-btn' });
	const mergeBtn = toggle.createEl('button', { text: 'Merge', cls: 'codebook-toggle-btn' });

	const updateToggle = (mode: 'reorganize' | 'merge') => {
		reorgBtn.toggleClass('is-active', mode === 'reorganize');
		mergeBtn.toggleClass('is-active', mode === 'merge');
	};
	updateToggle('reorganize');

	reorgBtn.addEventListener('click', () => {
		callbacks.onDragModeChange('reorganize');
		updateToggle('reorganize');
	});
	mergeBtn.addEventListener('click', () => {
		callbacks.onDragModeChange('merge');
		updateToggle('merge');
	});

	// New Code button
	const newCodeBtn = toolbar.createEl('button', { cls: 'codebook-new-code-btn' });
	const plusIcon = newCodeBtn.createSpan();
	setIcon(plusIcon, 'plus');
	newCodeBtn.createSpan({ text: 'New Code' });
	newCodeBtn.addEventListener('click', () => {
		showNewCodeInput(toolbar, model);
	});

	// New Folder button
	const newFolderBtn = toolbar.createEl('button', { cls: 'codebook-new-folder-btn' });
	const folderIcon = newFolderBtn.createSpan();
	setIcon(folderIcon, 'folder-plus');
	newFolderBtn.createSpan({ text: 'New Folder' });
	newFolderBtn.addEventListener('click', () => {
		showNewFolderInput(toolbar, model);
	});
}

function showNewCodeInput(toolbar: HTMLElement, model: SidebarModelInterface): void {
	// Check if input already open
	if (toolbar.querySelector('.codebook-new-code-input-wrap')) return;

	const wrap = toolbar.createDiv({ cls: 'codebook-new-code-input-wrap' });
	const input = wrap.createEl('input', {
		cls: 'codebook-new-code-input',
		attr: { type: 'text', placeholder: 'Code name...' },
	});
	input.focus();

	const submit = () => {
		const name = input.value.trim();
		if (name) {
			model.registry.create(name);
			model.saveMarkers();
		}
		wrap.remove();
	};

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); submit(); }
		if (e.key === 'Escape') { wrap.remove(); }
	});
	input.addEventListener('blur', () => {
		// Small delay to allow Enter to fire first
		setTimeout(() => { if (wrap.isConnected) wrap.remove(); }, 150);
	});
}

function showNewFolderInput(toolbar: HTMLElement, model: SidebarModelInterface): void {
	if (toolbar.querySelector('.codebook-new-folder-input-wrap')) return;

	const wrap = toolbar.createDiv({ cls: 'codebook-new-folder-input-wrap' });
	const input = wrap.createEl('input', {
		cls: 'codebook-new-code-input',
		attr: { type: 'text', placeholder: 'Folder name...' },
	});
	input.focus();

	const submit = () => {
		const name = input.value.trim();
		if (name) {
			model.registry.createFolder(name);
			model.saveMarkers();
		}
		wrap.remove();
	};

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); submit(); }
		if (e.key === 'Escape') { wrap.remove(); }
	});
	input.addEventListener('blur', () => {
		setTimeout(() => { if (wrap.isConnected) wrap.remove(); }, 150);
	});
}
