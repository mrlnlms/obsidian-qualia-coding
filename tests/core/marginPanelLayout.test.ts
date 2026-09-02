import { describe, expect, it } from 'vitest';
import { layoutMarginRails, type MarginRailInput } from '../../src/core/marginPanelLayout';

function rail(key: string, top: number, bottom: number): MarginRailInput {
	return {
		key,
		markerId: `m-${key}`,
		codeId: `c-${key}`,
		codeName: key,
		color: '#123456',
		editable: true,
		top,
		bottom,
	};
}

describe('layoutMarginRails', () => {
	it('reuses lane zero for disjoint and adjacent rails', () => {
		const result = layoutMarginRails([
			rail('a', 0, 20), rail('b', 20, 40), rail('c', 50, 70),
		]);
		expect(result.map((item) => [item.key, item.lane])).toEqual([
			['a', 0], ['b', 0], ['c', 0],
		]);
	});

	it('puts overlapping rails in distinct lanes and longer rails inside', () => {
		const result = layoutMarginRails([
			rail('short', 10, 20), rail('long', 0, 100), rail('other', 30, 40),
		]);
		expect(result.map((item) => [item.key, item.lane])).toEqual([
			['long', 0], ['short', 1], ['other', 1],
		]);
	});

	it('keeps coincident rails independent', () => {
		expect(layoutMarginRails([
			rail('coder-a', 100, 200), rail('coder-b', 100, 200),
		]).map((item) => item.lane)).toEqual([0, 1]);
	});

	it('returns exact centers without mutating input', () => {
		const input = [rail('a', 25, 75), rail('b', 100, 120)];
		const before = structuredClone(input);
		expect(layoutMarginRails(input).map((item) => [item.key, item.center]))
			.toEqual([['a', 50], ['b', 110]]);
		expect(input).toEqual(before);
	});

	it('preserves input order when span and top tie', () => {
		expect(layoutMarginRails([
			rail('first', 10, 30), rail('second', 10, 30),
		]).map((item) => item.key)).toEqual(['first', 'second']);
	});
});
