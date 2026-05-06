import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVirtualList } from '../../src/core/virtualList';

// jsdom returns 0 for clientHeight on detached/unstyled elements. Force a
// fixed viewport so viewport calculations exercise the row pool diff logic.
function makeContainer(viewportHeight = 300): HTMLElement {
	const el = document.createElement('div');
	Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => viewportHeight });
	let st = 0;
	Object.defineProperty(el, 'scrollTop', {
		configurable: true,
		get: () => st,
		set: (v: number) => { st = v; el.dispatchEvent(new Event('scroll')); },
	});
	document.body.appendChild(el);
	return el;
}

describe('createVirtualList', () => {
	beforeEach(() => { document.body.empty?.(); document.body.innerHTML = ''; });

	it('mounts only viewport rows initially', () => {
		const container = makeContainer(300);
		const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

		const list = createVirtualList<{ id: number }>({
			container,
			rowHeight: 30,
			buffer: 2,
			renderRow: (item) => {
				const el = document.createElement('div');
				el.dataset.id = String(item.id);
				return el;
			},
		});
		list.setItems(items);

		// 300/30 = 10 viewport rows, +2 buffer each side, but min start is 0.
		// Expected: 0..(10+2) = 12 rows mounted.
		const mounted = container.querySelectorAll<HTMLElement>('[data-id]');
		expect(mounted.length).toBeLessThan(20);
		expect(mounted.length).toBeGreaterThanOrEqual(10);
		expect(mounted[0]!.dataset.id).toBe('0');
	});

	it('reserves full virtual height in the spacer', () => {
		const container = makeContainer(300);
		const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

		const list = createVirtualList<{ id: number }>({
			container,
			rowHeight: 30,
			renderRow: (item) => {
				const el = document.createElement('div');
				el.dataset.id = String(item.id);
				return el;
			},
		});
		list.setItems(items);

		const spacer = container.querySelector<HTMLElement>('.qualia-virtual-list-spacer');
		expect(spacer).not.toBeNull();
		expect(spacer!.style.height).toBe('30000px');
	});

	it('mounts new rows on scroll, evicts rows that left viewport', () => {
		const container = makeContainer(300);
		const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

		const list = createVirtualList<{ id: number }>({
			container,
			rowHeight: 30,
			buffer: 2,
			renderRow: (item) => {
				const el = document.createElement('div');
				el.dataset.id = String(item.id);
				return el;
			},
		});
		list.setItems(items);

		// Scroll to row 500 (scrollTop = 500 * 30 = 15000)
		container.scrollTop = 15000;

		const mounted = container.querySelectorAll<HTMLElement>('[data-id]');
		const ids = Array.from(mounted).map(el => Number(el.dataset.id));
		// Row 0 should not be in DOM anymore.
		expect(ids).not.toContain(0);
		// Rows around 500 should be.
		expect(ids).toContain(500);
	});

	it('renderRow is called once per item per (un)mount, not all upfront', () => {
		const container = makeContainer(300);
		const items = Array.from({ length: 10000 }, (_, i) => ({ id: i }));

		const renderRow = vi.fn((item: { id: number }) => {
			const el = document.createElement('div');
			el.dataset.id = String(item.id);
			return el;
		});

		const list = createVirtualList<{ id: number }>({
			container,
			rowHeight: 30,
			buffer: 5,
			renderRow,
		});
		list.setItems(items);

		// Should only be called for visible rows + buffer, not 10k.
		expect(renderRow.mock.calls.length).toBeLessThan(50);
		void list;
	});

	it('setItems replaces the pool and recomputes height', () => {
		const container = makeContainer(300);
		const list = createVirtualList<{ id: number }>({
			container,
			rowHeight: 30,
			renderRow: (item) => {
				const el = document.createElement('div');
				el.dataset.id = String(item.id);
				return el;
			},
		});
		list.setItems([{ id: 0 }, { id: 1 }, { id: 2 }]);
		expect(container.querySelector<HTMLElement>('.qualia-virtual-list-spacer')!.style.height).toBe('90px');

		list.setItems(Array.from({ length: 100 }, (_, i) => ({ id: i + 1000 })));
		expect(container.querySelector<HTMLElement>('.qualia-virtual-list-spacer')!.style.height).toBe('3000px');
		// First mounted row is from new dataset.
		const first = container.querySelector<HTMLElement>('[data-id]');
		expect(first!.dataset.id).toBe('1000');
	});

	it('cleanup removes scroll listener (idempotent)', () => {
		const container = makeContainer(300);
		const renderRow = vi.fn((_item: { id: number }) => {
			const el = document.createElement('div');
			el.dataset.id = '_';
			return el;
		});
		const list = createVirtualList<{ id: number }>({
			container,
			rowHeight: 30,
			renderRow,
		});
		list.setItems(Array.from({ length: 100 }, (_, i) => ({ id: i })));

		const callCountBefore = renderRow.mock.calls.length;
		list.cleanup();
		// Scroll after cleanup must NOT trigger renderRow.
		container.scrollTop = 1000;
		expect(renderRow.mock.calls.length).toBe(callCountBefore);

		// Idempotent — second call doesn't throw.
		expect(() => list.cleanup()).not.toThrow();
	});

	it('re-renders via RAF after setItems for layout-not-yet-settled containers (regression 2026-05-06)', () => {
		// Repro: Code Explorer cria virtualList no onOpen + setItems imediato. Container.clientHeight
		// retorna 0 porque browser não recalculou layout — virtualList montava só buffer default
		// (5 rows) em vez de todas as visíveis. Fix: RAF re-render no setItems.
		// Bug exposto após race fix `dc32ee2` remover caminho de re-render via prepopulate.
		const container = document.createElement('div');
		document.body.appendChild(container);
		// clientHeight inicial = 0; muda pra 300 antes do RAF callback executar.
		let clientHeight = 0;
		Object.defineProperty(container, 'clientHeight', { configurable: true, get: () => clientHeight });
		Object.defineProperty(container, 'scrollTop', { configurable: true, get: () => 0 });

		// Mock RAF pra capturar callback e flush manualmente
		let rafCb: FrameRequestCallback | null = null;
		const origRaf = global.requestAnimationFrame;
		global.requestAnimationFrame = ((cb: FrameRequestCallback) => { rafCb = cb; return 1; }) as any;

		try {
			const list = createVirtualList<{ id: number }>({
				container,
				rowHeight: 30,
				buffer: 5,
				renderRow: (item) => {
					const el = document.createElement('div');
					el.dataset.id = String(item.id);
					return el;
				},
			});
			const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
			list.setItems(items);

			// Render síncrono inicial: clientHeight=0 → só buffer (5) rows mounted.
			expect(container.querySelectorAll('[data-id]').length).toBe(5);

			// Layout settles (clientHeight muda) antes do RAF callback rodar
			clientHeight = 300;
			expect(rafCb).not.toBeNull();
			rafCb!(0);

			// Após RAF, todos os 10 rows mounted.
			expect(container.querySelectorAll('[data-id]').length).toBe(10);
		} finally {
			global.requestAnimationFrame = origRaf;
		}
	});

	it('handles empty item list cleanly', () => {
		const container = makeContainer(300);
		const list = createVirtualList<{ id: number }>({
			container,
			rowHeight: 30,
			renderRow: (item) => {
				const el = document.createElement('div');
				el.dataset.id = String(item.id);
				return el;
			},
		});
		list.setItems([]);

		expect(container.querySelector<HTMLElement>('.qualia-virtual-list-spacer')!.style.height).toBe('0px');
		expect(container.querySelectorAll<HTMLElement>('[data-id]').length).toBe(0);
	});
});
