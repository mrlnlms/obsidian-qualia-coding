/**
 * codebookDragDrop — File-explorer-style drag-and-drop for codebook tree.
 *
 * Drop zones per row:
 * - Top edge (30%) → insert as sibling BEFORE target (same parent)
 * - Middle (40%) → make child OF target
 * - Bottom edge (30%) → insert as sibling AFTER target (same parent)
 *
 * Merge mode: any zone → open merge modal.
 */

import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

type DropZone = 'before' | 'inside' | 'after';

export interface DragDropCallbacks {
	/** Reparent with position: newParentId=undefined → root, insertBefore controls order. */
	onReparent(codeId: string, newParentId: string | undefined, insertBefore?: string): void;
	onMergeDrop(sourceId: string, targetId: string): void;
	setDragMode(mode: 'reorganize' | 'merge'): void;
	refresh(): void;
}

export function setupDragDrop(
	container: HTMLElement,
	registry: CodeDefinitionRegistry,
	getMode: () => 'reorganize' | 'merge',
	callbacks: DragDropCallbacks,
): () => void {
	let draggedCodeId: string | null = null;

	const findRow = (el: EventTarget | null): HTMLElement | null => {
		if (!(el instanceof HTMLElement)) return null;
		return el.closest<HTMLElement>('[data-code-id]');
	};

	const getDropZone = (row: HTMLElement, clientY: number): DropZone => {
		const rect = row.getBoundingClientRect();
		const ratio = (clientY - rect.top) / rect.height;
		if (ratio < 0.30) return 'before';
		if (ratio > 0.70) return 'after';
		return 'inside';
	};

	const clearIndicators = () => {
		for (const el of Array.from(container.querySelectorAll('.is-drop-before, .is-drop-inside, .is-drop-after, .is-merge-target'))) {
			el.classList.remove('is-drop-before', 'is-drop-inside', 'is-drop-after', 'is-merge-target');
		}
	};

	const onDragStart = (e: DragEvent) => {
		const row = findRow(e.target);
		if (!row) return;
		draggedCodeId = row.dataset.codeId ?? null;
		if (!draggedCodeId) return;
		row.classList.add('is-dragging');
		e.dataTransfer?.setData('text/plain', draggedCodeId);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	};

	const onDragOver = (e: DragEvent) => {
		if (!draggedCodeId) return;
		e.preventDefault();
		clearIndicators();

		const row = findRow(e.target);
		if (!row) return;
		const targetId = row.dataset.codeId;
		if (!targetId || targetId === draggedCodeId) return;

		const mode = getMode();
		if (mode === 'merge') {
			row.classList.add('is-merge-target');
			return;
		}

		const zone = getDropZone(row, e.clientY);
		row.classList.add(zone === 'before' ? 'is-drop-before' : zone === 'after' ? 'is-drop-after' : 'is-drop-inside');
	};

	const onDrop = (e: DragEvent) => {
		if (!draggedCodeId) return;
		e.preventDefault();

		const row = findRow(e.target);
		const targetId = row?.dataset.codeId;
		if (!row || !targetId || targetId === draggedCodeId) {
			cleanupDrag();
			return;
		}

		const mode = getMode();
		if (mode === 'merge') {
			callbacks.onMergeDrop(draggedCodeId, targetId);
			callbacks.setDragMode('reorganize');
			cleanupDrag();
			return;
		}

		// Validate no descendant cycle
		const descendants = registry.getDescendants(draggedCodeId);
		if (descendants.some(d => d.id === targetId)) {
			cleanupDrag();
			return;
		}

		const zone = getDropZone(row, e.clientY);
		const targetDef = registry.getById(targetId);
		if (!targetDef) { cleanupDrag(); return; }

		if (zone === 'inside') {
			// Make child of target (append at end)
			callbacks.onReparent(draggedCodeId, targetId);
		} else {
			// Insert as sibling — same parent as target
			const siblingParentId = targetDef.parentId ?? undefined;

			if (zone === 'before') {
				// Insert before target among siblings
				callbacks.onReparent(draggedCodeId, siblingParentId, targetId);
			} else {
				// Insert after target — find next sibling to use as insertBefore
				const siblings = siblingParentId
					? (registry.getById(siblingParentId)?.childrenOrder ?? [])
					: registry.rootOrder;
				const targetIdx = siblings.indexOf(targetId);
				// Next sibling that isn't the dragged code itself
				let insertBefore: string | undefined;
				for (let i = targetIdx + 1; i < siblings.length; i++) {
					if (siblings[i] !== draggedCodeId) {
						insertBefore = siblings[i];
						break;
					}
				}
				callbacks.onReparent(draggedCodeId, siblingParentId, insertBefore);
			}
		}

		cleanupDrag();
	};

	const onDragEnd = () => cleanupDrag();

	const cleanupDrag = () => {
		clearIndicators();
		for (const el of Array.from(container.querySelectorAll('.is-dragging'))) {
			el.classList.remove('is-dragging');
		}
		draggedCodeId = null;
	};

	container.addEventListener('dragstart', onDragStart);
	container.addEventListener('dragover', onDragOver);
	container.addEventListener('drop', onDrop);
	container.addEventListener('dragend', onDragEnd);

	return () => {
		container.removeEventListener('dragstart', onDragStart);
		container.removeEventListener('dragover', onDragOver);
		container.removeEventListener('drop', onDrop);
		container.removeEventListener('dragend', onDragEnd);
		cleanupDrag();
	};
}
