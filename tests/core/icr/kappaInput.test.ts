import { describe, it, expect } from 'vitest';
import {
	explodeMarkersToCharLabels,
	iterateAllUnitKeys,
	type CodedMarker,
	type SourceMeta,
} from '../../../src/core/icr/kappaInput';

describe('explodeMarkersToCharLabels', () => {
	it('returns map of char position → coderId → codeId set', () => {
		const markers: CodedMarker[] = [
			{ coderId: 'human:a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1'] },
			{ coderId: 'human:b', range: { fileId: 'f1', locator: '', from: 3, to: 8 }, codeIds: ['c1'] },
		];
		const map = explodeMarkersToCharLabels(markers);
		// pos 3 has both coders
		const key = 'f1::3';
		expect(map.get(key)?.get('human:a')).toEqual(new Set(['c1']));
		expect(map.get(key)?.get('human:b')).toEqual(new Set(['c1']));
	});

	it('includes all chars in marker range (from inclusive, to exclusive)', () => {
		const markers: CodedMarker[] = [
			{ coderId: 'human:a', range: { fileId: 'f1', locator: '', from: 0, to: 3 }, codeIds: ['c1'] },
		];
		const map = explodeMarkersToCharLabels(markers);
		expect(map.has('f1::0')).toBe(true);
		expect(map.has('f1::1')).toBe(true);
		expect(map.has('f1::2')).toBe(true);
		expect(map.has('f1::3')).toBe(false);
	});

	it('aggregates multiple codeIds per coder per char', () => {
		const markers: CodedMarker[] = [
			{ coderId: 'human:a', range: { fileId: 'f1', locator: '', from: 0, to: 5 }, codeIds: ['c1', 'c2'] },
		];
		const map = explodeMarkersToCharLabels(markers);
		const codes = map.get('f1::2')?.get('human:a');
		expect(codes).toEqual(new Set(['c1', 'c2']));
	});

	it('different locators produce different keys', () => {
		const markers: CodedMarker[] = [
			{ coderId: 'human:a', range: { fileId: 'f1', locator: '', from: 0, to: 3 }, codeIds: ['c1'] },
			{ coderId: 'human:a', range: { fileId: 'f1', locator: 'page:2', from: 0, to: 3 }, codeIds: ['c2'] },
		];
		const map = explodeMarkersToCharLabels(markers);
		expect(map.get('f1::0')?.get('human:a')).toEqual(new Set(['c1']));
		expect(map.get('f1:page:2:0')?.get('human:a')).toEqual(new Set(['c2']));
	});
});

describe('iterateAllUnitKeys', () => {
	it('iterates all char positions across all sources', () => {
		const sources: SourceMeta[] = [
			{ fileId: 'f1', locator: '', totalUnits: 3 },
			{ fileId: 'f1', locator: 'page:1', totalUnits: 2 },
		];
		const keys = Array.from(iterateAllUnitKeys(sources));
		expect(keys).toEqual([
			'f1::0', 'f1::1', 'f1::2',
			'f1:page:1:0', 'f1:page:1:1',
		]);
	});

	it('returns empty for empty source list', () => {
		expect(Array.from(iterateAllUnitKeys([]))).toEqual([]);
	});

	it('returns empty for source with totalUnits=0', () => {
		expect(Array.from(iterateAllUnitKeys([{ fileId: 'f1', locator: '', totalUnits: 0 }]))).toEqual([]);
	});
});
