import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

let registry: CodeDefinitionRegistry;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
});

describe('setGlobalHidden', () => {
	it('toggles code.hidden and emits visibility-changed with codeIds', () => {
		const c1 = registry.create('c1');
		const spy = vi.fn();
		registry.addVisibilityListener(spy);

		registry.setGlobalHidden(c1.id, true);

		expect(registry.getById(c1.id)!.hidden).toBe(true);
		expect(spy).toHaveBeenCalledOnce();
		expect(spy.mock.calls[0][0]).toMatchObject({
			codeIds: new Set([c1.id]),
		});
	});

	it('self-cleans overrides that now coincide with new global state', () => {
		const c1 = registry.create('c1');
		registry.visibilityOverrides = {
			'a.md': { [c1.id]: true },  // override visible + global vai virar visible (coincide)
			'b.md': { [c1.id]: false }, // override hidden + global vai virar visible (diverge)
		};
		registry.setGlobalHidden(c1.id, false);  // global visible (hidden=false)

		expect(registry.visibilityOverrides['a.md']).toBeUndefined();  // removido
		expect(registry.visibilityOverrides['b.md']).toEqual({ [c1.id]: false });
	});
});

describe('setDocOverride', () => {
	it('stores override when it diverges from global', () => {
		const c1 = registry.create('c1');
		// global visible. Set hidden override on file.
		registry.setDocOverride('a.md', c1.id, false);

		expect(registry.visibilityOverrides['a.md']).toEqual({ [c1.id]: false });
	});

	it('does NOT store override when it coincides with global (entry side self-clean)', () => {
		const c1 = registry.create('c1');
		registry.setDocOverride('a.md', c1.id, true);  // override visible + global already visible

		expect(registry.visibilityOverrides['a.md']).toBeUndefined();
	});

	it('removes existing override if new value coincides with global', () => {
		const c1 = registry.create('c1');
		registry.visibilityOverrides = { 'a.md': { [c1.id]: false } };  // existing hidden override
		registry.setDocOverride('a.md', c1.id, true);  // set visible; now coincides with global visible

		expect(registry.visibilityOverrides['a.md']).toBeUndefined();
	});

	it('emits visibility-changed with both codeIds and fileIds', () => {
		const c1 = registry.create('c1');
		const spy = vi.fn();
		registry.addVisibilityListener(spy);

		registry.setDocOverride('a.md', c1.id, false);

		expect(spy).toHaveBeenCalledOnce();
		expect(spy.mock.calls[0][0]).toMatchObject({
			codeIds: new Set([c1.id]),
			fileIds: new Set(['a.md']),
		});
	});
});

describe('clearDocOverrides', () => {
	it('deletes all overrides for the file and emits event with its codeIds', () => {
		const c1 = registry.create('c1');
		const c2 = registry.create('c2');
		registry.visibilityOverrides = { 'a.md': { [c1.id]: false, [c2.id]: true } };
		const spy = vi.fn();
		registry.addVisibilityListener(spy);

		registry.clearDocOverrides('a.md');

		expect(registry.visibilityOverrides['a.md']).toBeUndefined();
		expect(spy.mock.calls[0][0]).toMatchObject({
			codeIds: new Set([c1.id, c2.id]),
			fileIds: new Set(['a.md']),
		});
	});

	it('no-op when file has no overrides (no event)', () => {
		const spy = vi.fn();
		registry.addVisibilityListener(spy);
		registry.clearDocOverrides('nonexistent.md');
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('isCodeVisibleInFile', () => {
	it('integrates with code.hidden and overrides', () => {
		const c1 = registry.create('c1');
		registry.setGlobalHidden(c1.id, true);
		expect(registry.isCodeVisibleInFile(c1.id, 'a.md')).toBe(false);

		registry.setDocOverride('a.md', c1.id, true);  // diverge: visible
		expect(registry.isCodeVisibleInFile(c1.id, 'a.md')).toBe(true);
		expect(registry.isCodeVisibleInFile(c1.id, 'b.md')).toBe(false);  // still hidden globally
	});
});

describe('hasAnyOverrideForFile', () => {
	it('returns true if fileId has any override', () => {
		const c1 = registry.create('c1');
		registry.setDocOverride('a.md', c1.id, false);
		expect(registry.hasAnyOverrideForFile('a.md')).toBe(true);
		expect(registry.hasAnyOverrideForFile('b.md')).toBe(false);
	});
});
