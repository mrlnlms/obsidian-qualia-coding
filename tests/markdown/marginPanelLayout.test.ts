import { describe, expect, it } from 'vitest';
import {
	assignColumns,
	resolveLabels,
	type ResolvedBracket,
} from '../../src/markdown/cm6/marginPanelLayout';

function bracket(id: string, top: number, bottom: number): ResolvedBracket {
	return {
		marker: { id } as ResolvedBracket['marker'],
		codeId: `code-${id}`,
		codeName: id,
		color: '#abcdef',
		top,
		bottom,
		column: 0,
	};
}

describe('Markdown margin layout parity', () => {
	it('keeps legacy ordering and columns', () => {
		const items = [
			bracket('short', 10, 20),
			bracket('long', 0, 100),
			bracket('other', 30, 40),
		];
		assignColumns(items);
		expect(items.map((item) => [item.marker.id, item.column]))
			.toEqual([['long', 0], ['short', 1], ['other', 1]]);
	});

	it('keeps label ideal positions', () => {
		const items = [bracket('a', 0, 40), bracket('b', 80, 120)];
		assignColumns(items);
		expect(resolveLabels(items).map((label) => [label.markerId, label.idealY]))
			.toEqual([['a', 12], ['b', 92]]);
	});

	it('keeps multiple codes as separate brackets', () => {
		const first = bracket('marker', 0, 40);
		first.codeId = 'code-a';
		const items = [first, { ...first, codeId: 'code-b', codeName: 'B' }];
		assignColumns(items);
		expect(items.map((item) => item.column)).toEqual([0, 1]);
		expect(resolveLabels(items)).toHaveLength(2);
	});
});
