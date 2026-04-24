/**
 * VisibilityEventBus — coalesces visibility change notifications within a single
 * animation frame (or microtask fallback for jsdom tests).
 *
 * Each engine subscribes once per VIEW INSTANCE (not per file). Multiple views
 * of the same doc each subscribe and each re-render.
 */

export class VisibilityEventBus {
	private subscribers: Set<(codeIds: Set<string>) => void> = new Set();
	private pending: Set<string> = new Set();
	private scheduled = false;

	subscribe(fn: (codeIds: Set<string>) => void): () => void {
		this.subscribers.add(fn);
		return () => this.subscribers.delete(fn);
	}

	notify(codeIds: Set<string>): void {
		codeIds.forEach(id => this.pending.add(id));
		if (this.scheduled) return;
		this.scheduled = true;
		// Use requestAnimationFrame no browser; fallback sync para jsdom
		const schedule = typeof requestAnimationFrame !== 'undefined'
			? requestAnimationFrame
			: (cb: () => void) => queueMicrotask(() => cb());
		schedule(() => this.flush());
	}

	/** Immediate flush — para testes e emergency sync. */
	flush(): void {
		if (this.pending.size === 0) {
			this.scheduled = false;
			return;
		}
		const batch = this.pending;
		this.pending = new Set();
		this.scheduled = false;
		for (const fn of this.subscribers) fn(batch);
	}
}

/** Singleton — usado em todo o plugin. */
export const visibilityEventBus = new VisibilityEventBus();
