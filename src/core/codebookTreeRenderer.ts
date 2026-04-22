/**
 * codebookTreeRenderer — Renders a virtual-scrolled hierarchical tree of codes.
 *
 * Uses buildFlatTree + buildCountIndex from hierarchyHelpers for data.
 * Virtual scroll: only rows in viewport (+buffer) are rendered as DOM nodes.
 */

import { setIcon } from 'obsidian';
import type { SidebarModelInterface } from './types';
import { buildFlatTree, buildCountIndex, type FlatTreeNode, type FlatCodeNode, type FlatFolderNode, type CountIndex, type ExpandedState } from './hierarchyHelpers';

// ─── Constants ───────────────────────────────────────────

const ROW_HEIGHT = 30;
const BUFFER_ROWS = 10;
const INDENT_PX = 18;

// ─── Interfaces ──────────────────────────────────────────

export interface CodebookTreeCallbacks {
	onCodeClick(codeId: string): void;
	onCodeRightClick(codeId: string, event: MouseEvent): void;
	onToggleExpand(codeId: string): void;
	onFolderToggleExpand(folderId: string): void;
	onFolderRightClick(folderId: string, event: MouseEvent): void;
}

export interface CodebookTreeState {
	expanded: ExpandedState;
	searchQuery: string;
	dragMode: 'reorganize' | 'merge';
}

// ─── Main render function ────────────────────────────────

export function renderCodebookTree(
	container: HTMLElement,
	model: SidebarModelInterface,
	state: CodebookTreeState,
	callbacks: CodebookTreeCallbacks,
): { cleanup: () => void } {
	container.empty();

	const nodes = buildFlatTree(model.registry, state.expanded, state.searchQuery);
	const counts = buildCountIndex(model.registry, model.getAllMarkers());
	const totalHeight = nodes.length * ROW_HEIGHT;

	// Scroll container
	const scrollEl = container.createDiv({ cls: 'codebook-tree-scroll' });

	// Spacer for total virtual height
	const spacer = scrollEl.createDiv({ cls: 'codebook-tree-spacer' });
	spacer.style.height = `${totalHeight}px`;
	spacer.style.position = 'relative';

	let lastStart = -1;
	let lastEnd = -1;
	const rowEls: HTMLElement[] = [];

	const renderVisibleRows = () => {
		const scrollTop = scrollEl.scrollTop;
		const viewportHeight = scrollEl.clientHeight;

		const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
		const endIdx = Math.min(nodes.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

		if (startIdx === lastStart && endIdx === lastEnd) return;
		lastStart = startIdx;
		lastEnd = endIdx;

		// Remove old rows
		for (const el of rowEls) el.remove();
		rowEls.length = 0;

		// Render visible rows
		for (let i = startIdx; i < endIdx; i++) {
			const node = nodes[i]!;
			const rowEl = renderRow(node, counts, i, callbacks);
			spacer.appendChild(rowEl);
			rowEls.push(rowEl);
		}
	};

	renderVisibleRows();
	scrollEl.addEventListener('scroll', renderVisibleRows, { passive: true });

	const cleanup = () => {
		scrollEl.removeEventListener('scroll', renderVisibleRows);
	};

	return { cleanup };
}

// ─── Row renderer ────────────────────────────────────────

function renderRow(
	node: FlatTreeNode,
	counts: CountIndex,
	index: number,
	callbacks: CodebookTreeCallbacks,
): HTMLElement {
	if (node.type === 'folder') {
		return renderFolderRow(node, index, callbacks);
	}
	return renderCodeRow(node, counts, index, callbacks);
}

function renderFolderRow(
	node: FlatFolderNode,
	index: number,
	callbacks: CodebookTreeCallbacks,
): HTMLElement {
	const row = document.createElement('div');
	row.className = 'codebook-tree-row codebook-folder-row';
	row.style.position = 'absolute';
	row.style.top = `${index * ROW_HEIGHT}px`;
	row.style.height = `${ROW_HEIGHT}px`;
	row.style.width = '100%';
	row.dataset.folderId = node.folderId;

	// Chevron
	const chevron = document.createElement('span');
	chevron.className = 'codebook-tree-chevron';
	if (node.isExpanded) chevron.classList.add('is-expanded');
	setIcon(chevron, 'chevron-right');
	chevron.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onFolderToggleExpand(node.folderId);
	});
	row.appendChild(chevron);

	// Folder icon (distinct from code's color swatch)
	const icon = document.createElement('span');
	icon.className = 'codebook-tree-folder-icon';
	setIcon(icon, node.isExpanded ? 'folder-open' : 'folder');
	row.appendChild(icon);

	// Name
	const name = document.createElement('span');
	name.className = 'codebook-tree-name codebook-folder-name';
	name.textContent = node.name;
	row.appendChild(name);

	// Code count badge
	if (node.codeCount > 0) {
		const badge = document.createElement('span');
		badge.className = 'codebook-tree-count';
		badge.textContent = `${node.codeCount}`;
		badge.title = `${node.codeCount} codes in folder`;
		row.appendChild(badge);
	}

	// Right-click → folder context menu
	row.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		callbacks.onFolderRightClick(node.folderId, e);
	});

	// Click → toggle expand
	row.addEventListener('click', () => {
		callbacks.onFolderToggleExpand(node.folderId);
	});

	return row;
}

function renderCodeRow(
	node: FlatCodeNode,
	counts: CountIndex,
	index: number,
	callbacks: CodebookTreeCallbacks,
): HTMLElement {
	const row = document.createElement('div');
	row.className = 'codebook-tree-row';
	row.style.position = 'absolute';
	row.style.top = `${index * ROW_HEIGHT}px`;
	row.style.height = `${ROW_HEIGHT}px`;
	row.style.width = '100%';
	row.style.paddingLeft = `${node.depth * INDENT_PX}px`;
	row.draggable = true;
	row.dataset.codeId = node.def.id;

	// Chevron (expand/collapse) or spacer
	if (node.hasChildren) {
		const chevron = document.createElement('span');
		chevron.className = 'codebook-tree-chevron';
		if (node.isExpanded) chevron.classList.add('is-expanded');
		setIcon(chevron, 'chevron-right');
		chevron.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.onToggleExpand(node.def.id);
		});
		row.appendChild(chevron);
	} else {
		const spacer = document.createElement('span');
		spacer.className = 'codebook-tree-chevron-spacer';
		row.appendChild(spacer);
	}

	// Color swatch
	const swatch = document.createElement('span');
	swatch.className = 'codebook-tree-swatch';
	swatch.style.backgroundColor = node.def.color;
	row.appendChild(swatch);

	// Name
	const name = document.createElement('span');
	name.className = 'codebook-tree-name';
	name.textContent = node.def.name;
	row.appendChild(name);

	// Count badge
	const countEntry = counts.get(node.def.id);
	if (countEntry) {
		const displayCount = node.isExpanded ? countEntry.direct : countEntry.aggregate;
		const badge = document.createElement('span');
		badge.className = 'codebook-tree-count';
		badge.textContent = `${displayCount}`;

		// Tooltip with breakdown
		if (node.hasChildren) {
			badge.title = node.isExpanded
				? `Direct: ${countEntry.direct} (expanded — showing direct only)`
				: `Total: ${countEntry.aggregate} (direct: ${countEntry.direct})`;
		}

		row.appendChild(badge);
	}

	// Click → navigate to code detail
	row.addEventListener('click', () => {
		callbacks.onCodeClick(node.def.id);
	});

	// Right-click → context menu
	row.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		callbacks.onCodeRightClick(node.def.id, e);
	});

	return row;
}
