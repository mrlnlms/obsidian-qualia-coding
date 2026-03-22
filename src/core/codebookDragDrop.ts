/**
 * codebookDragDrop — Drag-and-drop for codebook tree rows.
 *
 * Supports two modes:
 * - reorganize: reparent a code under a new parent (or promote to root)
 * - merge: drop a code onto another to merge them
 *
 * Returns a cleanup function to remove all event listeners.
 */

import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

export interface DragDropCallbacks {
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

	const clearDropIndicators = () => {
		for (const el of Array.from(container.querySelectorAll('.is-drop-target, .is-merge-target'))) {
			el.classList.remove('is-drop-target', 'is-merge-target');
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

		clearDropIndicators();

		const row = findRow(e.target);
		if (!row) return;
		const targetId = row.dataset.codeId;
		if (!targetId || targetId === draggedCodeId) return;

		const mode = getMode();
		if (mode === 'reorganize') {
			row.classList.add('is-drop-target');
		} else {
			row.classList.add('is-merge-target');
		}
	};

	const onDrop = (e: DragEvent) => {
		if (!draggedCodeId) return;
		e.preventDefault();

		const row = findRow(e.target);
		if (!row) { cleanup(); return; }
		const targetId = row.dataset.codeId;
		if (!targetId || targetId === draggedCodeId) { cleanupDrag(); return; }

		const mode = getMode();

		if (mode === 'reorganize') {
			// Validate: cannot reparent under own descendant
			const descendants = registry.getDescendants(draggedCodeId);
			const isDescendant = descendants.some(d => d.id === targetId);
			if (!isDescendant) {
				callbacks.onReparent(draggedCodeId, targetId);
			}
		} else {
			callbacks.onMergeDrop(draggedCodeId, targetId);
			callbacks.setDragMode('reorganize');
		}

		cleanupDrag();
	};

	const onDragEnd = () => {
		cleanupDrag();
	};

	const cleanupDrag = () => {
		if (draggedCodeId) {
			for (const el of Array.from(container.querySelectorAll('.is-dragging'))) {
				el.classList.remove('is-dragging');
			}
		}
		clearDropIndicators();
		draggedCodeId = null;
	};

	container.addEventListener('dragstart', onDragStart);
	container.addEventListener('dragover', onDragOver);
	container.addEventListener('drop', onDrop);
	container.addEventListener('dragend', onDragEnd);

	const cleanup = () => {
		container.removeEventListener('dragstart', onDragStart);
		container.removeEventListener('dragover', onDragOver);
		container.removeEventListener('drop', onDrop);
		container.removeEventListener('dragend', onDragEnd);
		cleanupDrag();
	};

	return cleanup;
}
