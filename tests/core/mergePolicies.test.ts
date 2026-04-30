import { describe, it, expect } from 'vitest';
import { resolveName, resolveColor, applyTextPolicy } from '../../src/core/mergePolicies';
import type { CodeDefinition } from '../../src/core/types';

function makeCode(over: Partial<CodeDefinition>): CodeDefinition {
	return {
		id: 'c_x',
		name: 'X',
		color: '#000',
		paletteIndex: 0,
		childrenOrder: [],
		createdAt: 0,
		updatedAt: 0,
		...over,
	};
}

describe('resolveName', () => {
	const target = makeCode({ id: 't', name: 'Target' });
	const srcA = makeCode({ id: 'a', name: 'SourceA' });
	const srcB = makeCode({ id: 'b', name: 'SourceB' });

	it('returns target name when choice is target', () => {
		expect(resolveName({ kind: 'target' }, target, [srcA, srcB])).toBe('Target');
	});

	it('returns source name when choice is source', () => {
		expect(resolveName({ kind: 'source', codeId: 'a' }, target, [srcA, srcB])).toBe('SourceA');
	});

	it('returns custom value (trimmed) when choice is custom', () => {
		expect(resolveName({ kind: 'custom', value: '  Foo  ' }, target, [srcA, srcB])).toBe('Foo');
	});

	it('falls back to target when source codeId not in sources list (defensive)', () => {
		expect(resolveName({ kind: 'source', codeId: 'z' }, target, [srcA, srcB])).toBe('Target');
	});
});

describe('resolveColor', () => {
	const target = makeCode({ id: 't', name: 'T', color: '#aaa' });
	const srcA = makeCode({ id: 'a', name: 'A', color: '#bbb' });

	it('returns target color when choice is target', () => {
		expect(resolveColor({ kind: 'target' }, target, [srcA])).toBe('#aaa');
	});

	it('returns source color when choice is source', () => {
		expect(resolveColor({ kind: 'source', codeId: 'a' }, target, [srcA])).toBe('#bbb');
	});

	it('falls back to target when source not found', () => {
		expect(resolveColor({ kind: 'source', codeId: 'z' }, target, [srcA])).toBe('#aaa');
	});
});

describe('applyTextPolicy', () => {
	const target = makeCode({ id: 't', name: 'T', memo: { content: 'target memo' } });
	const srcA = makeCode({ id: 'a', name: 'A', memo: { content: 'memo from A' } });
	const srcB = makeCode({ id: 'b', name: 'B', memo: { content: 'memo from B' } });

	it('keep-target returns target value', () => {
		expect(applyTextPolicy({ kind: 'keep-target' }, target, [srcA, srcB], 'memo')).toBe('target memo');
	});

	it('discard returns undefined', () => {
		expect(applyTextPolicy({ kind: 'discard' }, target, [srcA, srcB], 'memo')).toBeUndefined();
	});

	it('keep-only returns the chosen entity value', () => {
		expect(applyTextPolicy({ kind: 'keep-only', codeId: 'a' }, target, [srcA, srcB], 'memo')).toBe('memo from A');
		expect(applyTextPolicy({ kind: 'keep-only', codeId: 't' }, target, [srcA, srcB], 'memo')).toBe('target memo');
	});

	it('concatenate joins target first, then sources with header', () => {
		expect(applyTextPolicy({ kind: 'concatenate' }, target, [srcA, srcB], 'memo')).toBe(
			'target memo\n\n--- From A ---\nmemo from A\n\n--- From B ---\nmemo from B',
		);
	});

	it('concatenate skips empty entries', () => {
		const noMemoTarget = makeCode({ id: 't', name: 'T', memo: undefined });
		const emptyA = makeCode({ id: 'a', name: 'A', memo: { content: '   ' } });
		expect(applyTextPolicy({ kind: 'concatenate' }, noMemoTarget, [emptyA, srcB], 'memo')).toBe(
			'--- From B ---\nmemo from B',
		);
	});

	it('concatenate with all empty returns undefined', () => {
		const empty = makeCode({ id: 't', name: 'T', memo: undefined });
		const empty2 = makeCode({ id: 'a', name: 'A', memo: '' });
		expect(applyTextPolicy({ kind: 'concatenate' }, empty, [empty2], 'memo')).toBeUndefined();
	});

	it('keep-only with empty target returns undefined (signals no update)', () => {
		const empty = makeCode({ id: 't', name: 'T', memo: undefined });
		expect(applyTextPolicy({ kind: 'keep-only', codeId: 't' }, empty, [], 'memo')).toBeUndefined();
	});

	it('works for description field too', () => {
		const t = makeCode({ id: 't', name: 'T', description: 'desc' });
		expect(applyTextPolicy({ kind: 'keep-target' }, t, [], 'description')).toBe('desc');
	});
});
