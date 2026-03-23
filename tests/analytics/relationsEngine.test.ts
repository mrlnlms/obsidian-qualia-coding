import { describe, it, expect } from 'vitest';
import { extractRelationNodes, extractRelationEdges } from '../../src/analytics/data/relationsEngine';
import type { CodeDefinition, CodeApplication } from '../../src/core/types';
import type { RelationEdge } from '../../src/core/relationHelpers';

function makeDef(id: string, name: string, color: string, relations?: CodeDefinition['relations']): CodeDefinition {
	return { id, name, color, paletteIndex: 0, createdAt: 0, updatedAt: 0, childrenOrder: [], relations };
}

describe('extractRelationEdges', () => {
	it('returns empty array when no relations', () => {
		expect(extractRelationEdges([], [], 'both')).toEqual([]);
	});

	it('returns code-level edges from definitions', () => {
		const defs = [
			makeDef('c1', 'A', '#f00', [{ label: 'causes', target: 'c2', directed: true }]),
			makeDef('c2', 'B', '#0f0'),
		];
		const edges = extractRelationEdges(defs, [], 'code');
		expect(edges).toHaveLength(1);
		expect(edges[0].level).toBe('code');
	});

	it('filters segment-level in code-only mode', () => {
		const defs = [makeDef('c1', 'A', '#f00'), makeDef('c2', 'B', '#0f0')];
		const markers = [{ markerType: 'markdown' as const, id: 'm1', fileId: 'f1', codes: [{ codeId: 'c1', relations: [{ label: 'x', target: 'c2', directed: false }] }], createdAt: 0, updatedAt: 0 }];
		expect(extractRelationEdges(defs, markers, 'code')).toHaveLength(0);
	});
});

describe('extractRelationNodes', () => {
	it('returns nodes for codes involved in edges', () => {
		const defs = [makeDef('c1', 'A', '#f00'), makeDef('c2', 'B', '#0f0'), makeDef('c3', 'C', '#00f')];
		const edges: RelationEdge[] = [{ source: 'c1', target: 'c2', label: 'x', directed: true, level: 'code', weight: 1 }];
		const nodes = extractRelationNodes(defs, edges, new Map([['c1', 5], ['c2', 3]]));
		expect(nodes).toHaveLength(2);
		expect(nodes.find(n => n.id === 'c1')!.weight).toBe(5);
		expect(nodes.find(n => n.id === 'c3')).toBeUndefined();
	});

	it('defaults weight to 0 when not in frequency map', () => {
		const defs = [makeDef('c1', 'A', '#f00'), makeDef('c2', 'B', '#0f0')];
		const edges: RelationEdge[] = [{ source: 'c1', target: 'c2', label: 'x', directed: true, level: 'code', weight: 1 }];
		const nodes = extractRelationNodes(defs, edges, new Map());
		expect(nodes.every(n => n.weight === 0)).toBe(true);
	});
});
