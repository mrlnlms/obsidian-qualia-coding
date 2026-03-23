/**
 * codebookDragDrop — Drag-and-drop for codebook tree rows.
 *
 * File-explorer-style interaction:
 * - Drop on MIDDLE of a row → make child (reparent under target)
 * - Drop on TOP/BOTTOM edge of a row → insert as sibling (same parent as target)
 * - If target is root and drop is on edge → dragged code becomes root
 *
 * Merge mode: drop on any zone → open merge modal.
 */

import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

type DropZone = 'before' | 'inside' | 'after';

export interface DragDropCallbacks {
	/** Reparent: newParentId=undefined means promote to root */
	onReparent(codeId: string, newParentId: string | undefined): void;
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

	/** Detect which zone of the row the cursor is in (top 30%, middle 40%, bottom 30%) */
	const getDropZone = (row: HTMLElement, clientY: number): DropZone => {
		const rect = row.getBoundingClientRect();
		const y = clientY - rect.top;
		const h = rect.height;
		if (y < h * 0.30) return 'before';
		if (y > h * 0.70) return 'after';
		return 'inside';
	};

	const clearIndicators = () => {
		for (const el of Array.from(container.querySelectorAll('.is-drop-before, .is-drop-inside, .is-drop-after, .is-merge-target, .is-dragging'))) {
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
		// Keep is-dragging on source
		const srcRow = container.querySelector<HTMLElement>(`[data-code-id="${draggedCodeId}"]`);
		if (srcRow) srcRow.classList.add('is-dragging');

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
		if (zone === 'before') row.classList.add('is-drop-before');
		else if (zone === 'after') row.classList.add('is-drop-after');
		else row.classList.add('is-drop-inside');
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

		// Reorganize mode — validate no descendant cycle
		const descendants = registry.getDescendants(draggedCodeId);
		if (descendants.some(d => d.id === targetId)) {
			cleanupDrag();
			return;
		}

		const zone = getDropZone(row, e.clientY);
		const targetDef = registry.getById(targetId);

		if (zone === 'inside') {
			// Make child of target
			callbacks.onReparent(draggedCodeId, targetId);
		} else {
			// Insert as sibling: same parent as target
			const newParentId = targetDef?.parentId ?? undefined;
			callbacks.onReparent(draggedCodeId, newParentId);
		}

		cleanupDrag();
	};

	const onDragEnd = () => {
		cleanupDrag();
	};

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
