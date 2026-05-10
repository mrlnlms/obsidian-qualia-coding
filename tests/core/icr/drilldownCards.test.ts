import { describe, it, expect } from 'vitest';
import { __test__ } from '../../../src/core/icr/ui/drilldownCards';

const { clusterMarkdownMarkers, formatBoundsLabel } = __test__;

describe('drilldownCards — clusterMarkdownMarkers', () => {
	it('agrupa markers que se sobrepõem em char offsets', () => {
		const markers = [
			{ fileId: 'F1.md', bounds: { kind: 'text' as const, from: 100, to: 200 }, coderId: 'human:alice', markerId: 'm1' },
			{ fileId: 'F1.md', bounds: { kind: 'text' as const, from: 150, to: 250 }, coderId: 'human:bob', markerId: 'm2' },
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(1);
		expect(regions[0]!.coderIds.sort()).toEqual(['human:alice', 'human:bob']);
		expect(regions[0]!.bounds).toEqual({ kind: 'text', from: 100, to: 250 });
	});

	it('separa markers que NÃO se sobrepõem em clusters distintos', () => {
		const markers = [
			{ fileId: 'F1.md', bounds: { kind: 'text' as const, from: 100, to: 200 }, coderId: 'human:alice', markerId: 'm1' },
			{ fileId: 'F1.md', bounds: { kind: 'text' as const, from: 500, to: 600 }, coderId: 'human:bob', markerId: 'm2' },
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(2);
	});

	it('separa por fileId mesmo com bounds idênticos', () => {
		const markers = [
			{ fileId: 'F1.md', bounds: { kind: 'text' as const, from: 100, to: 200 }, coderId: 'human:alice', markerId: 'm1' },
			{ fileId: 'F2.md', bounds: { kind: 'text' as const, from: 100, to: 200 }, coderId: 'human:bob', markerId: 'm2' },
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(2);
		expect(regions.map(r => r.fileId).sort()).toEqual(['F1.md', 'F2.md']);
	});

	it('cluster com 3+ markers transitivamente sobrepostos vira 1 região', () => {
		const markers = [
			{ fileId: 'F.md', bounds: { kind: 'text' as const, from: 0, to: 100 }, coderId: 'human:alice', markerId: 'm1' },
			{ fileId: 'F.md', bounds: { kind: 'text' as const, from: 50, to: 150 }, coderId: 'human:bob', markerId: 'm2' },
			{ fileId: 'F.md', bounds: { kind: 'text' as const, from: 120, to: 200 }, coderId: 'human:carla', markerId: 'm3' },
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(1);
		expect(regions[0]!.coderIds.sort()).toEqual(['human:alice', 'human:bob', 'human:carla']);
		expect(regions[0]!.bounds).toEqual({ kind: 'text', from: 0, to: 200 });
	});

	it('dedup coderIds quando mesmo coder tem múltiplos markers no cluster', () => {
		const markers = [
			{ fileId: 'F.md', bounds: { kind: 'text' as const, from: 0, to: 50 }, coderId: 'human:alice', markerId: 'm1' },
			{ fileId: 'F.md', bounds: { kind: 'text' as const, from: 25, to: 75 }, coderId: 'human:alice', markerId: 'm2' },
			{ fileId: 'F.md', bounds: { kind: 'text' as const, from: 60, to: 100 }, coderId: 'human:bob', markerId: 'm3' },
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(1);
		expect(regions[0]!.coderIds.sort()).toEqual(['human:alice', 'human:bob']);
	});
});

describe('drilldownCards — formatBoundsLabel', () => {
	it('text bounds → chars', () => {
		expect(formatBoundsLabel({ kind: 'text', from: 100, to: 250 })).toBe('chars 100–250');
	});

	it('csvRow bounds com column → row N · col', () => {
		expect(formatBoundsLabel({ kind: 'csvRow', rowIndex: 42, column: 'response' })).toBe('row 42 · response');
	});

	it('csvRow bounds sem column → row N', () => {
		expect(formatBoundsLabel({ kind: 'csvRow', rowIndex: 42 })).toBe('row 42');
	});

	it('temporal bounds → fromMs–toMs', () => {
		expect(formatBoundsLabel({ kind: 'temporal', fromMs: 1500, toMs: 3200 })).toBe('1500ms–3200ms');
	});
});
