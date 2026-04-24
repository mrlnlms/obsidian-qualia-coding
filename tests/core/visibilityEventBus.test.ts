import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VisibilityEventBus } from '../../src/core/visibilityEventBus';

describe('VisibilityEventBus', () => {
	let bus: VisibilityEventBus;

	beforeEach(() => {
		bus = new VisibilityEventBus();
	});

	it('coalesces multiple notify calls into single callback batch', () => {
		const cb = vi.fn();
		bus.subscribe(cb);

		bus.notify(new Set(['c1']));
		bus.notify(new Set(['c2', 'c3']));
		bus.notify(new Set(['c1']));  // dup

		expect(cb).not.toHaveBeenCalled();  // ainda não rodou rAF
		bus.flush();

		expect(cb).toHaveBeenCalledOnce();
		expect(cb.mock.calls[0][0]).toEqual(new Set(['c1', 'c2', 'c3']));
	});

	it('subscribe returns an unsubscribe function', () => {
		const cb = vi.fn();
		const unsub = bus.subscribe(cb);
		unsub();
		bus.notify(new Set(['c1']));
		bus.flush();
		expect(cb).not.toHaveBeenCalled();
	});

	it('independently notifies multiple subscribers', () => {
		const a = vi.fn();
		const b = vi.fn();
		bus.subscribe(a);
		bus.subscribe(b);

		bus.notify(new Set(['c1']));
		bus.flush();

		expect(a).toHaveBeenCalledOnce();
		expect(b).toHaveBeenCalledOnce();
	});

	it('flush is no-op when nothing pending', () => {
		const cb = vi.fn();
		bus.subscribe(cb);
		bus.flush();
		expect(cb).not.toHaveBeenCalled();
	});
});
