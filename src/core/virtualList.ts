/**
 * virtualList — Generic viewport-windowed list renderer for flat arrays.
 *
 * Only items inside the visible viewport (+ buffer rows) are mounted in the
 * DOM. Scrolling diffs the row pool: rows that stay visible across a scroll
 * event are kept; only newly-entering indexes are rendered, only newly-leaving
 * ones are removed.
 *
 * Intended for marker lists (Code Explorer, Code Detail, evidence lists)
 * where N can reach 10k+. The codebookTreeRenderer follows the same pattern
 * for the codes tree — this helper extracts the mechanics so they can be
 * reused for plain lists without dragging tree-specific concerns along.
 *
 * Usage:
 *   const list = createVirtualList({
 *     container: scrollEl,         // owns layout; must be height-constrained
 *     rowHeight: 30,
 *     renderRow: (item, idx) => buildRowEl(item, idx),
 *   });
 *   list.setItems(markers);
 *   // ...later
 *   list.cleanup();
 */

export interface VirtualListConfig<T> {
	/** Container element. Must have a constrained height (CSS) — owns the scroll. */
	container: HTMLElement;
	/** Fixed row height in pixels. */
	rowHeight: number;
	/** Extra rows rendered outside the viewport in each direction. Default 5. */
	buffer?: number;
	/** Build the DOM element for a given item. Called once per (item, index). */
	renderRow(item: T, index: number): HTMLElement;
}

export interface VirtualListHandle<T> {
	/**
	 * Replace the underlying items. Drops the row pool (since indexes now point
	 * at different content), recomputes the spacer height, and re-renders the
	 * visible window. Cheap to call after model changes.
	 */
	setItems(items: ReadonlyArray<T>): void;
	/** Force-rerender the visible window without changing items. */
	refresh(): void;
	/** Remove the scroll listener and clear DOM. Idempotent. */
	cleanup(): void;
}

export function createVirtualList<T>(config: VirtualListConfig<T>): VirtualListHandle<T> {
	const { container, rowHeight } = config;
	const buffer = config.buffer ?? 5;

	container.empty();
	// Spacer reserves the full virtual height; rows position absolutely inside.
	const spacer = container.createDiv({ cls: 'qualia-virtual-list-spacer' });
	spacer.style.position = 'relative';
	spacer.style.height = '0px';

	let items: ReadonlyArray<T> = [];
	const rowPool = new Map<number, HTMLElement>();
	let lastStart = -1;
	let lastEnd = -1;
	let disposed = false;

	const renderVisibleRows = () => {
		if (disposed) return;
		const scrollTop = container.scrollTop;
		const viewportHeight = container.clientHeight;

		const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
		const endIdx = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer);

		if (startIdx === lastStart && endIdx === lastEnd) return;
		lastStart = startIdx;
		lastEnd = endIdx;

		// Evict rows that left the visible range.
		for (const [idx, el] of rowPool) {
			if (idx < startIdx || idx >= endIdx) {
				el.remove();
				rowPool.delete(idx);
			}
		}

		// Mount rows that entered the visible range.
		for (let i = startIdx; i < endIdx; i++) {
			if (rowPool.has(i)) continue;
			const item = items[i]!;
			const rowEl = config.renderRow(item, i);
			rowEl.style.position = 'absolute';
			rowEl.style.top = `${i * rowHeight}px`;
			rowEl.style.height = `${rowHeight}px`;
			rowEl.style.width = '100%';
			spacer.appendChild(rowEl);
			rowPool.set(i, rowEl);
		}
	};

	container.addEventListener('scroll', renderVisibleRows, { passive: true });

	const setItems = (next: ReadonlyArray<T>) => {
		items = next;
		spacer.style.height = `${items.length * rowHeight}px`;
		// Pool entries reference now-stale items at the same indexes — drop everything.
		for (const el of rowPool.values()) el.remove();
		rowPool.clear();
		lastStart = -1;
		lastEnd = -1;
		renderVisibleRows();
	};

	const refresh = () => {
		// Force-rerender without dropping items (e.g. after a hover state change).
		for (const el of rowPool.values()) el.remove();
		rowPool.clear();
		lastStart = -1;
		lastEnd = -1;
		renderVisibleRows();
	};

	const cleanup = () => {
		if (disposed) return;
		disposed = true;
		container.removeEventListener('scroll', renderVisibleRows);
		for (const el of rowPool.values()) el.remove();
		rowPool.clear();
		spacer.remove();
	};

	return { setItems, refresh, cleanup };
}
