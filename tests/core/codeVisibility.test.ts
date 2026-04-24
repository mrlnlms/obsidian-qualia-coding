import { describe, it, expect } from 'vitest';
import {
	isCodeVisibleInFile,
	shouldStoreOverride,
	cleanOverridesAfterGlobalChange,
} from '../../src/core/codeVisibility';

describe('isCodeVisibleInFile', () => {
	const overrides = { 'doc.md': { c1: true, c2: false } };

	it('returns override when present (true)', () => {
		expect(isCodeVisibleInFile('c1', 'doc.md', false, overrides)).toBe(true);
	});

	it('returns override when present (false)', () => {
		expect(isCodeVisibleInFile('c2', 'doc.md', false, overrides)).toBe(false);
	});

	it('override wins over global hidden', () => {
		expect(isCodeVisibleInFile('c1', 'doc.md', true, overrides)).toBe(true);
	});

	it('no override falls back to !global', () => {
		expect(isCodeVisibleInFile('c3', 'doc.md', false, overrides)).toBe(true);
		expect(isCodeVisibleInFile('c3', 'doc.md', true, overrides)).toBe(false);
	});

	it('no override and no entry for fileId', () => {
		expect(isCodeVisibleInFile('c1', 'other.md', true, overrides)).toBe(false);
	});
});

describe('shouldStoreOverride', () => {
	it('returns false when override equals !global (coincides)', () => {
		expect(shouldStoreOverride(true, false)).toBe(false);  // visible + global visible
		expect(shouldStoreOverride(false, true)).toBe(false);  // hidden + global hidden
	});

	it('returns true when override diverges from global', () => {
		expect(shouldStoreOverride(true, true)).toBe(true);   // visible override + global hidden
		expect(shouldStoreOverride(false, false)).toBe(true); // hidden override + global visible
	});
});

describe('cleanOverridesAfterGlobalChange', () => {
	it('removes entries that now coincide with new global state', () => {
		const overrides = {
			'a.md': { c1: true, c2: false },
			'b.md': { c1: false, c3: true },
		};
		// c1 global goes from hidden → visible. Entries c1: true now coincide (redundant).
		const result = cleanOverridesAfterGlobalChange(overrides, 'c1', false);
		expect(result['a.md']).toEqual({ c2: false });
		expect(result['b.md']).toEqual({ c1: false, c3: true });  // c1: false still diverges
	});

	it('deletes the fileId key if its map becomes empty', () => {
		const overrides = { 'a.md': { c1: true } };
		const result = cleanOverridesAfterGlobalChange(overrides, 'c1', false);
		expect(result['a.md']).toBeUndefined();
	});

	it('returns unchanged when no entries coincide', () => {
		const overrides = { 'a.md': { c1: false } };
		// c1 stays globally visible (hidden=false). override c1:false diverges still.
		const result = cleanOverridesAfterGlobalChange(overrides, 'c1', false);
		expect(result).toEqual(overrides);
	});
});
