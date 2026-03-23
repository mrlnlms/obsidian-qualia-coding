import { describe, it, expect } from 'vitest';
import { collectAllLabels, buildRelationEdges } from '../../src/core/relationHelpers';
import type { CodeDefinition, CodeApplication, BaseMarker, CodeRelation } from '../../src/core/types';

function makeDef(id: string, name: string, relations?: CodeRelation[]): CodeDefinition {
	return { id, name, color: '#000', paletteIndex: 0, createdAt: 0, updatedAt: 0, childrenOrder: [], relations };
}

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
	return { markerType: 'markdown', id, fileId: 'f1', codes, createdAt: 0, updatedAt: 0 };
}

describe('collectAllLabels', () => {
	it('collects labels from definitions and markers', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B'),
		];
		const markers = [
			makeMarker('m1', [
				{ codeId: 'c1', relations: [{ label: 'enables', target: 'c2', directed: false }] },
			]),
		];
		const labels = collectAllLabels(defs, markers);
		expect(labels).toEqual(expect.arrayContaining(['causes', 'enables']));
		expect(labels).toHaveLength(2);
	});

	it('deduplicates labels', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
		];
		const markers = [
			makeMarker('m1', [
				{ codeId: 'c1', relations: [{ label: 'causes', target: 'c3', directed: true }] },
			]),
		];
		const labels = collectAllLabels(defs, markers);
		expect(labels).toEqual(['causes']);
	});
});

describe('buildRelationEdges', () => {
	it('returns code-level edges', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B'),
		];
		const edges = buildRelationEdges(defs, [], 'code');
		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			source: 'c1', target: 'c2', label: 'causes', directed: true, level: 'code', weight: 1,
		});
	});

	it('returns segment-level edges with weight by count', () => {
		const defs = [makeDef('c1', 'A'), makeDef('c2', 'B')];
		const markers = [
			makeMarker('m1', [{ codeId: 'c1', relations: [{ label: 'relates', target: 'c2', directed: false }] }]),
			makeMarker('m2', [{ codeId: 'c1', relations: [{ label: 'relates', target: 'c2', directed: false }] }]),
		];
		const edges = buildRelationEdges(defs, markers, 'both');
		const segEdges = edges.filter(e => e.level === 'segment');
		expect(segEdges).toHaveLength(1);
		expect(segEdges[0].weight).toBe(2);
	});

	it('merges edges when same label+target+directed exists at both levels', () => {
		const defs = [
			makeDef('c1', 'A', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B'),
		];
		const markers = [
			makeMarker('m1', [{ codeId: 'c1', relations: [{ label: 'causes', target: 'c2', directed: true }] }]),
		];
		const edges = buildRelationEdges(defs, markers, 'both');
		expect(edges).toHaveLength(1);
		expect(edges[0].level).toBe('merged');
		expect(edges[0].weight).toBe(1);
	});
});
