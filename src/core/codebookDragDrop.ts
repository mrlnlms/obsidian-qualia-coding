/**
 * codebookDragDrop — File-explorer-style drag-and-drop for codebook tree.
 *
 * Drop zones per row:
 * - Top edge (30%) → insert as sibling BEFORE target (same parent)
 * - Middle (40%) → make child OF target
 * - Bottom edge (30%) → insert as sibling AFTER target (same parent)
 *
 * Merge mode: any zone → open merge modal.
 *
 * Sibling inserts (before/after) use a single floating indicator element that
 * animates between positions (stylesheet transition on `top`). Nested/merge
 * drops still use row classes (background overlay). Folder rows auto-expand
 * when hovered for 600ms during a drag.
 */

import { Notice } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

type DropZone = 'before' | 'inside' | 'after';

const FOLDER_HOVER_EXPAND_MS = 600;
const DROP_INDICATOR_CLASS = 'codebook-drop-indicator';
const BODY_DRAGGING_CLASS = 'codebook-dragging';

export interface DragDropCallbacks {
	/** Reparent with position: newParentId=undefined → root, insertBefore controls order. */
	onReparent(codeId: string, newParentId: string | undefined, insertBefore?: string): void;
	onMergeDrop(sourceId: string, targetId: string): void;
	onMoveToFolder(codeId: string, folderId: string | undefined): void;
	setDragMode(mode: 'reorganize' | 'merge'): void;
	refresh(): void;
	/** Expand a collapsed folder when the cursor hovers it during a drag. Optional — if omitted, auto-expand is disabled. */
	onFolderHoverExpand?(folderId: string): void;
	/**
	 * Optional. Drop em zona vazia do tree (sem hover row, sem hover folder) com callback presente
	 * dispara remoção do group ativo. Caller decide se há group selected; se não houver, no-op.
	 */
	onDropOnEmptySpace?(codeId: string): void;
}

export function setupDragDrop(
	container: HTMLElement,
	registry: CodeDefinitionRegistry,
	getMode: () => 'reorganize' | 'merge',
	callbacks: DragDropCallbacks,
): () => void {
	let draggedCodeId: string | null = null;
	let draggedFolderId: string | null = null;
	let folderHoverTimer: number | null = null;
	let folderHoverId: string | null = null;
	// Last valid hover state, captured during onDragOver. Used by onDrop because
	// e.target during drop may be the floating indicator or container gap rather
	// than the row under the cursor — memoization is more reliable than re-hit-testing.
	let lastHoverRow: HTMLElement | null = null;
	let lastHoverZone: DropZone | null = null;
	let lastHoverFolderRow: HTMLElement | null = null;

	// Container needs relative positioning to host the absolute drop indicator.
	const previousPosition = container.style.position;
	if (getComputedStyle(container).position === 'static') {
		container.style.position = 'relative';
	}

	const dropIndicator = container.createDiv({ cls: DROP_INDICATOR_CLASS });
	dropIndicator.style.display = 'none';

	const findRow = (el: EventTarget | null): HTMLElement | null => {
		if (!(el instanceof HTMLElement)) return null;
		return el.closest<HTMLElement>('[data-code-id]');
	};

	const findFolderRow = (el: EventTarget | null): HTMLElement | null => {
		if (!(el instanceof HTMLElement)) return null;
		return el.closest<HTMLElement>('[data-folder-id]');
	};

	const getDropZone = (row: HTMLElement, clientY: number): DropZone => {
		const rect = row.getBoundingClientRect();
		const ratio = (clientY - rect.top) / rect.height;
		if (ratio < 0.30) return 'before';
		if (ratio > 0.70) return 'after';
		return 'inside';
	};

	const hideIndicator = () => {
		dropIndicator.style.display = 'none';
	};

	const showIndicatorAt = (row: HTMLElement, side: 'top' | 'bottom') => {
		const rect = row.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		const y = (side === 'top' ? rect.top : rect.bottom) - containerRect.top + container.scrollTop;
		dropIndicator.style.top = `${y}px`;
		dropIndicator.style.display = 'block';
	};

	const clearIndicators = () => {
		hideIndicator();
		for (const el of Array.from(container.querySelectorAll('.is-drop-inside, .is-merge-target, .is-folder-drop-target'))) {
			el.classList.remove('is-drop-inside', 'is-merge-target', 'is-folder-drop-target');
		}
	};

	const cancelFolderHoverTimer = () => {
		if (folderHoverTimer !== null) {
			window.clearTimeout(folderHoverTimer);
			folderHoverTimer = null;
		}
		folderHoverId = null;
	};

	const scheduleFolderHoverExpand = (folderId: string) => {
		if (!callbacks.onFolderHoverExpand) return;
		if (folderHoverId === folderId) return;
		cancelFolderHoverTimer();
		folderHoverId = folderId;
		folderHoverTimer = window.setTimeout(() => {
			callbacks.onFolderHoverExpand?.(folderId);
			folderHoverTimer = null;
		}, FOLDER_HOVER_EXPAND_MS);
	};

	/** Apply a brief highlight on the row with the given id after the tree re-renders. */
	const highlightAfterRefresh = (codeId: string) => {
		requestAnimationFrame(() => requestAnimationFrame(() => {
			const row = container.querySelector<HTMLElement>(`[data-code-id="${CSS.escape(codeId)}"]`);
			if (!row) return;
			row.classList.add('is-just-dropped');
			setTimeout(() => row.classList.remove('is-just-dropped'), 650);
		}));
	};

	/** Shake the target row and surface a Notice when a drop is rejected. */
	const rejectDrop = (targetRow: HTMLElement, message: string) => {
		targetRow.classList.add('is-drop-rejected');
		setTimeout(() => targetRow.classList.remove('is-drop-rejected'), 300);
		new Notice(message);
	};

	/** Capture the scroll position before a refresh and restore it after render settles. */
	const preserveScroll = (fn: () => void) => {
		const scrollTop = container.scrollTop;
		fn();
		requestAnimationFrame(() => {
			if (container.scrollTop !== scrollTop) container.scrollTop = scrollTop;
		});
	};

	const onDragStart = (e: DragEvent) => {
		const row = findRow(e.target);
		if (row) {
			draggedCodeId = row.dataset.codeId ?? null;
			if (!draggedCodeId) return;
			row.classList.add('is-dragging');
			document.body.classList.add(BODY_DRAGGING_CLASS);
			e.dataTransfer?.setData('text/plain', draggedCodeId);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
			return;
		}
		// Folder drag (only in reorganize mode — merge mode is for code-on-code merge)
		const folderRow = findFolderRow(e.target);
		if (folderRow && getMode() === 'reorganize') {
			draggedFolderId = folderRow.dataset.folderId ?? null;
			if (!draggedFolderId) return;
			folderRow.classList.add('is-dragging');
			document.body.classList.add(BODY_DRAGGING_CLASS);
			e.dataTransfer?.setData('text/plain', draggedFolderId);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
		}
	};

	const resetHoverMemo = () => {
		lastHoverRow = null;
		lastHoverZone = null;
		lastHoverFolderRow = null;
	};

	const onDragOver = (e: DragEvent) => {
		// Folder being dragged — own branch (nest/reorder/promote)
		if (draggedFolderId) {
			e.preventDefault();
			clearIndicators();
			resetHoverMemo();

			const folderRow = findFolderRow(e.target);
			if (!folderRow || folderRow.dataset.folderId === draggedFolderId) {
				cancelFolderHoverTimer();
				return;
			}
			const targetFolderId = folderRow.dataset.folderId;
			if (!targetFolderId) {
				cancelFolderHoverTimer();
				return;
			}

			// Cycle detection: target cannot be a descendant of the dragged folder
			const descendants = registry.getFolderDescendants(draggedFolderId);
			if (descendants.some(d => d.id === targetFolderId)) {
				cancelFolderHoverTimer();
				return;
			}

			const zone = getDropZone(folderRow, e.clientY);
			lastHoverZone = zone;
			lastHoverFolderRow = folderRow;

			if (zone === 'inside') {
				folderRow.classList.add('is-folder-drop-target');
				scheduleFolderHoverExpand(targetFolderId);
			} else {
				cancelFolderHoverTimer();
				showIndicatorAt(folderRow, zone === 'before' ? 'top' : 'bottom');
			}
			return;
		}

		if (!draggedCodeId) return;
		e.preventDefault();
		clearIndicators();
		resetHoverMemo();

		// Check folder row
		const folderRow = findFolderRow(e.target);
		if (folderRow && getMode() === 'reorganize') {
			folderRow.classList.add('is-folder-drop-target');
			lastHoverFolderRow = folderRow;
			const folderId = folderRow.dataset.folderId;
			if (folderId) scheduleFolderHoverExpand(folderId);
			return;
		}
		cancelFolderHoverTimer();

		const row = findRow(e.target);
		if (!row) return;
		const targetId = row.dataset.codeId;
		if (!targetId || targetId === draggedCodeId) return;

		const mode = getMode();
		if (mode === 'merge') {
			row.classList.add('is-merge-target');
			lastHoverRow = row;
			lastHoverZone = 'inside'; // zone is irrelevant in merge mode
			return;
		}

		const zone = getDropZone(row, e.clientY);
		if (zone === 'before') showIndicatorAt(row, 'top');
		else if (zone === 'after') showIndicatorAt(row, 'bottom');
		else row.classList.add('is-drop-inside');
		lastHoverRow = row;
		lastHoverZone = zone;
	};

	const onDrop = (e: DragEvent) => {
		// Folder drop branch
		if (draggedFolderId) {
			e.preventDefault();
			const folderRow = lastHoverFolderRow ?? findFolderRow(e.target);
			if (!folderRow || folderRow.dataset.folderId === draggedFolderId) {
				cleanupFolderDrag();
				return;
			}
			const targetFolderId = folderRow.dataset.folderId;
			if (!targetFolderId) {
				cleanupFolderDrag();
				return;
			}

			const zone = lastHoverZone ?? getDropZone(folderRow, e.clientY);
			const movedFolderId = draggedFolderId;
			let success = false;

			if (zone === 'inside') {
				success = registry.setFolderParent(movedFolderId, targetFolderId);
			} else {
				const targetParent = registry.getFolderById(targetFolderId)?.parentId;
				let insertBeforeFinal: string | undefined;
				if (zone === 'before') {
					insertBeforeFinal = targetFolderId;
				} else {
					const siblings = targetParent
						? registry.getChildFolders(targetParent)
						: registry.getRootFolders();
					const idx = siblings.findIndex(f => f.id === targetFolderId);
					// Skip the dragged folder itself when scanning for the next sibling
					let next: string | undefined;
					for (let i = idx + 1; i < siblings.length; i++) {
						const sibling = siblings[i];
						if (sibling && sibling.id !== movedFolderId) {
							next = sibling.id;
							break;
						}
					}
					insertBeforeFinal = next;
				}
				success = registry.setFolderParent(movedFolderId, targetParent, insertBeforeFinal);
			}

			if (!success) {
				rejectDrop(folderRow, 'Cannot move folder there.');
			} else {
				preserveScroll(() => callbacks.refresh());
				requestAnimationFrame(() => requestAnimationFrame(() => {
					const row = container.querySelector<HTMLElement>(`[data-folder-id="${CSS.escape(movedFolderId)}"]`);
					if (!row) return;
					row.classList.add('is-just-dropped');
					setTimeout(() => row.classList.remove('is-just-dropped'), 650);
				}));
			}

			cleanupFolderDrag();
			return;
		}

		if (!draggedCodeId) return;
		e.preventDefault();

		// Drop on folder row — prefer memoized hover, fall back to hit-test on e.target.
		const folderRow = lastHoverFolderRow ?? findFolderRow(e.target);
		if (folderRow && getMode() === 'reorganize') {
			const folderId = folderRow.dataset.folderId;
			if (folderId && draggedCodeId) {
				const movedId = draggedCodeId;
				preserveScroll(() => callbacks.onMoveToFolder(movedId, folderId));
				highlightAfterRefresh(movedId);
			}
			cleanupDrag();
			return;
		}

		// Prefer memoized row from onDragOver; fall back to hit-test on e.target.
		const row = lastHoverRow ?? findRow(e.target);
		const targetId = row?.dataset.codeId;
		if (!row || !targetId || targetId === draggedCodeId) {
			// Drop em zona vazia (sem row sob cursor, sem folder hover): se caller registrou
			// callback de "empty space drop", repassa o codeId. Usado pra remover do group ativo.
			if (!folderRow && callbacks.onDropOnEmptySpace) {
				const codeId = draggedCodeId;
				callbacks.onDropOnEmptySpace(codeId);
			}
			cleanupDrag();
			return;
		}

		const mode = getMode();
		if (mode === 'merge') {
			const src = draggedCodeId;
			preserveScroll(() => {
				callbacks.onMergeDrop(src, targetId);
				callbacks.setDragMode('reorganize');
			});
			highlightAfterRefresh(targetId);
			cleanupDrag();
			return;
		}

		// Validate no descendant cycle
		const descendants = registry.getDescendants(draggedCodeId);
		if (descendants.some(d => d.id === targetId)) {
			clearIndicators();
			rejectDrop(row, 'Cannot move a code into one of its descendants.');
			cleanupDrag();
			return;
		}

		const zone = lastHoverZone ?? getDropZone(row, e.clientY);
		const targetDef = registry.getById(targetId);
		if (!targetDef) { cleanupDrag(); return; }

		const movedId = draggedCodeId;
		preserveScroll(() => {
			if (zone === 'inside') {
				// Make child of target (append at end)
				callbacks.onReparent(movedId, targetId);
			} else {
				// Insert as sibling — same parent as target
				const siblingParentId = targetDef.parentId ?? undefined;

				if (zone === 'before') {
					// Insert before target among siblings
					callbacks.onReparent(movedId, siblingParentId, targetId);
				} else {
					// Insert after target — find next sibling to use as insertBefore
					const siblings = siblingParentId
						? (registry.getById(siblingParentId)?.childrenOrder ?? [])
						: registry.rootOrder;
					const targetIdx = siblings.indexOf(targetId);
					// Next sibling that isn't the dragged code itself
					let insertBefore: string | undefined;
					for (let i = targetIdx + 1; i < siblings.length; i++) {
						if (siblings[i] !== movedId) {
							insertBefore = siblings[i];
							break;
						}
					}
					callbacks.onReparent(movedId, siblingParentId, insertBefore);
				}
			}
		});
		highlightAfterRefresh(movedId);

		cleanupDrag();
	};

	const onDragEnd = () => {
		if (draggedFolderId) cleanupFolderDrag();
		cleanupDrag();
	};

	const cleanupDrag = () => {
		clearIndicators();
		cancelFolderHoverTimer();
		resetHoverMemo();
		for (const el of Array.from(container.querySelectorAll('.is-dragging'))) {
			el.classList.remove('is-dragging');
		}
		document.body.classList.remove(BODY_DRAGGING_CLASS);
		draggedCodeId = null;
	};

	const cleanupFolderDrag = () => {
		if (draggedFolderId) {
			const row = container.querySelector<HTMLElement>(`[data-folder-id="${CSS.escape(draggedFolderId)}"]`);
			row?.classList.remove('is-dragging');
		}
		draggedFolderId = null;
		document.body.classList.remove(BODY_DRAGGING_CLASS);
		clearIndicators();
		resetHoverMemo();
		cancelFolderHoverTimer();
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
		dropIndicator.remove();
		container.style.position = previousPosition;
		cleanupDrag();
	};
}
