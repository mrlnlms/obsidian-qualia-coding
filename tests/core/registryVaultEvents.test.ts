import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

let registry: CodeDefinitionRegistry;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
});

describe('migrateFilePathForOverrides', () => {
	it('moves overrides from old path to new path', () => {
		const c1 = registry.create('c1');
		registry.visibilityOverrides = { 'old.md': { [c1.id]: false } };

		registry.migrateFilePathForOverrides('old.md', 'new.md');

		expect(registry.visibilityOverrides['old.md']).toBeUndefined();
		expect(registry.visibilityOverrides['new.md']).toEqual({ [c1.id]: false });
	});

	it('no-op when old path has no overrides', () => {
		registry.migrateFilePathForOverrides('none.md', 'new.md');
		expect(registry.visibilityOverrides).toEqual({});
	});

	it('emits visibility-changed so views of the new path re-render', () => {
		const c1 = registry.create('c1');
		registry.visibilityOverrides = { 'old.md': { [c1.id]: false } };
		const spy = vi.fn();
		registry.addVisibilityListener(spy);

		registry.migrateFilePathForOverrides('old.md', 'new.md');

		expect(spy).toHaveBeenCalledOnce();
		expect(spy.mock.calls[0][0]).toMatchObject({
			codeIds: new Set([c1.id]),
			fileIds: new Set(['new.md']),
		});
	});
});

describe('clearFilePathForOverrides', () => {
	it('deletes overrides for path', () => {
		const c1 = registry.create('c1');
		registry.visibilityOverrides = { 'gone.md': { [c1.id]: false } };

		registry.clearFilePathForOverrides('gone.md');

		expect(registry.visibilityOverrides['gone.md']).toBeUndefined();
	});

	it('no-op when path has no overrides (no event)', () => {
		const spy = vi.fn();
		registry.addVisibilityListener(spy);
		registry.clearFilePathForOverrides('none.md');
		expect(spy).not.toHaveBeenCalled();
	});
});
