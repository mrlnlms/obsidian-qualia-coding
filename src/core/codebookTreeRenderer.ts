/**
 * codebookTreeRenderer — Renders a virtual-scrolled hierarchical tree of codes.
 *
 * Uses buildFlatTree + buildCountIndex from hierarchyHelpers for data.
 * Virtual scroll mechanics delegadas pra createVirtualList (pattern unificado
 * com baseCodeExplorerView, detailCodeRenderer, detailRelationRenderer).
 * Tree-specific concerns (folders, depth, selected state) ficam no renderRow.
 */

import { setIcon } from 'obsidian';
import type { SidebarModelInterface } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import { buildFlatTree, buildCountIndex, type FlatTreeNode, type FlatCodeNode, type FlatFolderNode, type CountIndex, type ExpandedState } from './hierarchyHelpers';
import { createVirtualList } from './virtualList';

// ─── Constants ───────────────────────────────────────────

const ROW_HEIGHT = 30;
const BUFFER_ROWS = 10;
const INDENT_PX = 18;

// ─── Interfaces ──────────────────────────────────────────

export interface CodebookTreeCallbacks {
	/** Recebe o MouseEvent pra que o caller possa decidir baseado em modifiers (ctrl/meta = toggle select; shift = range; bare = navigate). */
	onCodeClick(codeId: string, event: MouseEvent): void;
	onCodeRightClick(codeId: string, event: MouseEvent): void;
	onToggleExpand(codeId: string): void;
	onFolderToggleExpand(folderId: string): void;
	onFolderRightClick(folderId: string, event: MouseEvent): void;
	onToggleVisibility(codeId: string): void;
}

export interface CodebookTreeState {
	expanded: ExpandedState;
	searchQuery: string;
	dragMode: 'reorganize' | 'merge';
	selectedGroupId: string | null;
	/** Ids de códigos selecionados (multi-select via Cmd/Shift+click). Vazio se nenhum. */
	selectedCodeIds: Set<string>;
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

	// scrollEl preserva classe pro layout CSS (.codebook-tree-scroll: flex: 1; overflow-y: auto).
	// Virtual scroll mechanics (rowPool diff, scroll listener, RAF fallback pra clientHeight=0)
	// delegadas pra createVirtualList. Tree-specific concerns (folders, depth, selected state)
	// ficam no renderRow callback.
	const scrollEl = container.createDiv({ cls: 'codebook-tree-scroll' });

	const list = createVirtualList<FlatTreeNode>({
		container: scrollEl,
		rowHeight: ROW_HEIGHT,
		buffer: BUFFER_ROWS,
		renderRow: (node, index) => renderRow(
			node,
			counts,
			index,
			callbacks,
			model.registry,
			state.selectedGroupId,
			state.selectedCodeIds,
		),
	});
	list.setItems(nodes);

	return { cleanup: () => list.cleanup() };
}

// ─── Row renderer ────────────────────────────────────────

function renderRow(
	node: FlatTreeNode,
	counts: CountIndex,
	index: number,
	callbacks: CodebookTreeCallbacks,
	registry: CodeDefinitionRegistry,
	selectedGroupId: string | null,
	selectedCodeIds: Set<string>,
): HTMLElement {
	if (node.type === 'folder') {
		return renderFolderRow(node, index, callbacks);
	}
	return renderCodeRow(node, counts, index, callbacks, registry, selectedGroupId, selectedCodeIds);
}

function renderFolderRow(
	node: FlatFolderNode,
	_index: number,
	callbacks: CodebookTreeCallbacks,
): HTMLElement {
	const row = document.createElement('div');
	row.className = 'codebook-tree-row codebook-folder-row';
	// position/top/height/width vêm de .qc-vlist-row (aplicado pelo virtualList) +
	// CSS vars --qc-row-top/--qc-row-height. paddingLeft fica inline porque varia por depth.
	row.style.paddingLeft = `${node.depth * INDENT_PX}px`;
	row.draggable = true;
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
	_index: number,
	callbacks: CodebookTreeCallbacks,
	registry: CodeDefinitionRegistry,
	selectedGroupId: string | null,
	selectedCodeIds: Set<string>,
): HTMLElement {
	const row = document.createElement('div');
	row.className = 'codebook-tree-row';
	// position/top/height/width vêm de .qc-vlist-row (aplicado pelo virtualList) +
	// CSS vars --qc-row-top/--qc-row-height. paddingLeft fica inline porque varia por depth.
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

	// Eye toggle (global visibility)
	const isHidden = node.def.hidden === true;
	const eye = document.createElement('span');
	eye.className = 'qc-code-row-eye';
	eye.setAttribute('role', 'button');
	eye.setAttribute('aria-label', 'Toggle visibility');
	eye.title = 'Toggle visibility';
	setIcon(eye, isHidden ? 'eye-off' : 'eye');
	eye.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.onToggleVisibility(node.def.id);
	});
	row.appendChild(eye);

	if (isHidden) row.classList.add('qc-code-row-hidden');

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

	// Group chip contador (oculto quando code.groups vazio/undefined)
	const groupChip = computeGroupChipLabel(node.def.id, registry);
	if (groupChip) {
		const chip = document.createElement('span');
		chip.className = 'codebook-tree-group-chip';
		chip.title = groupChip.tooltip;
		setIcon(chip, 'tag');
		const num = document.createElement('span');
		num.className = 'codebook-tree-group-chip-count';
		num.textContent = String(groupChip.count);
		chip.appendChild(num);
		row.appendChild(chip);
	}

	// Group filter contextual (selectedGroupId setado)
	const membership = applyGroupFilterToRowClasses(node.def.id, selectedGroupId, registry);
	if (membership === 'member') row.classList.add('is-group-member');
	else if (membership === 'non-member') row.classList.add('is-group-non-member');

	// Multi-select visual
	if (selectedCodeIds.has(node.def.id)) row.classList.add('is-selected');

	// Click → caller decide o que fazer (bare = navigate, modifiers = select toggle/range)
	row.addEventListener('click', (e) => {
		callbacks.onCodeClick(node.def.id, e);
	});

	// Right-click → context menu
	row.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		callbacks.onCodeRightClick(node.def.id, e);
	});

	return row;
}

/**
 * Decide se o chip contador de groups (`🏷N`) aparece na row de um código
 * e retorna count + tooltip com nomes dos groups. null = sem chip.
 */
export function computeGroupChipLabel(
	codeId: string,
	registry: CodeDefinitionRegistry,
): { count: number; tooltip: string } | null {
	const groups = registry.getGroupsForCode(codeId);
	if (groups.length === 0) return null;
	return {
		count: groups.length,
		tooltip: groups.map(g => g.name).join(', '),
	};
}

/**
 * Decide a classe de filtro contextual de uma row baseada no selectedGroupId.
 * Quando null = sem filtro ativo. Quando setado, retorna 'member' ou 'non-member'.
 */
export function applyGroupFilterToRowClasses(
	codeId: string,
	selectedGroupId: string | null,
	registry: CodeDefinitionRegistry,
): 'member' | 'non-member' | 'none' {
	if (!selectedGroupId) return 'none';
	const code = registry.getById(codeId);
	if (code?.groups?.includes(selectedGroupId)) return 'member';
	return 'non-member';
}
