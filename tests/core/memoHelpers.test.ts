import { describe, it, expect } from 'vitest';
import { getMemoContent, setMemoContent, hasContent } from '../../src/core/memoHelpers';

describe('getMemoContent', () => {
	it('returns empty string when memo is undefined', () => {
		expect(getMemoContent(undefined)).toBe('');
	});

	it('returns content when memo has content', () => {
		expect(getMemoContent({ content: 'hello' })).toBe('hello');
	});

	it('returns empty string when content is empty', () => {
		expect(getMemoContent({ content: '' })).toBe('');
	});
});

describe('setMemoContent', () => {
	it('returns undefined when content is empty and no materialized ref', () => {
		expect(setMemoContent(undefined, '')).toBeUndefined();
		expect(setMemoContent({ content: 'old' }, '')).toBeUndefined();
	});

	it('preserves materialized ref when content empties', () => {
		const result = setMemoContent({ content: 'old', materialized: { path: 'a.md', mtime: 1 } }, '');
		expect(result).toEqual({ content: '', materialized: { path: 'a.md', mtime: 1 } });
	});

	it('creates fresh record when starting from undefined', () => {
		expect(setMemoContent(undefined, 'new')).toEqual({ content: 'new' });
	});

	it('updates content and preserves materialized', () => {
		const result = setMemoContent({ content: 'old', materialized: { path: 'a.md', mtime: 1 } }, 'new');
		expect(result).toEqual({ content: 'new', materialized: { path: 'a.md', mtime: 1 } });
	});
});

describe('hasContent', () => {
	it('false for undefined', () => { expect(hasContent(undefined)).toBe(false); });
	it('false for empty content with no materialized', () => { expect(hasContent({ content: '' })).toBe(false); });
	it('true for non-empty content', () => { expect(hasContent({ content: 'x' })).toBe(true); });
	it('true for empty content but materialized', () => {
		expect(hasContent({ content: '', materialized: { path: 'a.md', mtime: 1 } })).toBe(true);
	});
});
