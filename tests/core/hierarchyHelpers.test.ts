import { describe, it, expect } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { BaseMarker, CodeApplication } from '../../src/core/types';
import {
	buildFlatTree,
	getDirectCount,
	getAggregateCount,
	getCountBreakdown,
	buildCountIndex,
	type FlatTreeNode,
} from '../../src/core/hierarchyHelpers';

// ─── Test helpers ────────────────────────────────────────────────

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
	return {
		markerType: 'markdown',
		id,
		fileId: 'test.md',
		codes,
		createdAt: 0,
		updatedAt: 0,
	};
}

function setupHierarchy(): { registry: CodeDefinitionRegistry; rootA: string; rootB: string; childA1: string; childA2: string; grandA1a: string } {
	const registry = new CodeDefinitionRegistry();
	const rootA = registry.create('Alpha').id;
	const rootB = registry.create('Beta').id;
	const childA1 = registry.create('Alpha-1').id;
	const childA2 = registry.create('Alpha-2').id;
	const grandA1a = registry.create('Alpha-1a').id;

	registry.setParent(childA1, rootA);
	registry.setParent(childA2, rootA);
	registry.setParent(grandA1a, childA1);

	return { registry, rootA, rootB, childA1, childA2, grandA1a };
}

// ─── buildFlatTree ───────────────────────────────────────────────

describe('buildFlatTree', () => {
	it('returns flat codes in creation order when no hierarchy', () => {
		const registry = new CodeDefinitionRegistry();
		registry.create('Zeta');
		registry.create('Alpha');
		registry.create('Mu');

		const nodes = buildFlatTree(registry, new Set());
		expect(nodes.map(n => n.def.name)).toEqual(['Zeta', 'Alpha', 'Mu']);
		expect(nodes.every(n => n.depth === 0)).toBe(true);
		expect(nodes.every(n => !n.hasChildren)).toBe(true);
		expect(nodes.every(n => !n.isExpanded)).toBe(true);
	});

	it('shows only parent when collapsed', () => {
		const { registry, rootA, rootB } = setupHierarchy();
		const nodes = buildFlatTree(registry, new Set());

		// Only root codes visible
		expect(nodes.map(n => n.def.name)).toEqual(['Alpha', 'Beta']);
		const alphaNode = nodes.find(n => n.def.id === rootA)!;
		expect(alphaNode.hasChildren).toBe(true);
		expect(alphaNode.isExpanded).toBe(false);
		expect(alphaNode.depth).toBe(0);

		const betaNode = nodes.find(n => n.def.id === rootB)!;
		expect(betaNode.hasChildren).toBe(false);
	});

	it('shows children when parent is expanded', () => {
		const { registry, rootA, childA1, childA2 } = setupHierarchy();
		const expanded = new Set([rootA]);
		const nodes = buildFlatTree(registry, expanded);

		const names = nodes.map(n => n.def.name);
		expect(names).toContain('Alpha-1');
		expect(names).toContain('Alpha-2');

		const a1Node = nodes.find(n => n.def.id === childA1)!;
		expect(a1Node.depth).toBe(1);
		expect(a1Node.hasChildren).toBe(true);
		expect(a1Node.isExpanded).toBe(false);

		const a2Node = nodes.find(n => n.def.id === childA2)!;
		expect(a2Node.depth).toBe(1);
		expect(a2Node.hasChildren).toBe(false);
	});

	it('respects childrenOrder', () => {
		const { registry, rootA, childA1, childA2 } = setupHierarchy();
		// Reverse the childrenOrder
		const parentDef = registry.getById(rootA)!;
		parentDef.childrenOrder = [childA2, childA1];

		const expanded = new Set([rootA]);
		const nodes = buildFlatTree(registry, expanded);

		const childNames = nodes.filter(n => n.depth === 1).map(n => n.def.name);
		expect(childNames).toEqual(['Alpha-2', 'Alpha-1']);
	});

	it('shows deep nesting with correct depths', () => {
		const { registry, rootA, childA1, grandA1a } = setupHierarchy();
		const expanded = new Set([rootA, childA1]);
		const nodes = buildFlatTree(registry, expanded);

		const grandNode = nodes.find(n => n.def.id === grandA1a)!;
		expect(grandNode.depth).toBe(2);
		expect(grandNode.hasChildren).toBe(false);
	});

	it('does not show grandchildren when only root is expanded', () => {
		const { registry, rootA, grandA1a } = setupHierarchy();
		const expanded = new Set([rootA]);
		const nodes = buildFlatTree(registry, expanded);

		expect(nodes.find(n => n.def.id === grandA1a)).toBeUndefined();
	});

	it('search filter shows match and ancestor path', () => {
		const { registry, rootA, childA1, grandA1a } = setupHierarchy();
		// Search for the grandchild
		const nodes = buildFlatTree(registry, new Set(), 'Alpha-1a');

		// Should include grandchild and its ancestors (Alpha, Alpha-1)
		const ids = nodes.map(n => n.def.id);
		expect(ids).toContain(rootA);
		expect(ids).toContain(childA1);
		expect(ids).toContain(grandA1a);

		// Ancestors should be auto-expanded
		const alphaNode = nodes.find(n => n.def.id === rootA)!;
		expect(alphaNode.isExpanded).toBe(true);

		const a1Node = nodes.find(n => n.def.id === childA1)!;
		expect(a1Node.isExpanded).toBe(true);
	});

	it('search is case-insensitive', () => {
		const { registry, rootB } = setupHierarchy();
		const nodes = buildFlatTree(registry, new Set(), 'beta');
		expect(nodes.map(n => n.def.id)).toContain(rootB);
	});
});

// ─── getDirectCount ──────────────────────────────────────────────

describe('getDirectCount', () => {
	it('counts only markers directly assigned to the code', () => {
		const { rootA, childA1 } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: rootA }]),
			makeMarker('m2', [{ codeId: childA1 }]),
			makeMarker('m3', [{ codeId: rootA }, { codeId: childA1 }]),
		];

		expect(getDirectCount(rootA, markers)).toBe(2);
		expect(getDirectCount(childA1, markers)).toBe(2);
	});

	it('does not count descendant markers', () => {
		const { rootA, childA1 } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: childA1 }]),
		];

		expect(getDirectCount(rootA, markers)).toBe(0);
	});

	it('deduplicates: counts at most once per marker', () => {
		const { rootA } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: rootA }, { codeId: rootA }]),
		];

		expect(getDirectCount(rootA, markers)).toBe(1);
	});
});

// ─── getAggregateCount ───────────────────────────────────────────

describe('getAggregateCount', () => {
	it('includes descendants', () => {
		const { registry, rootA, childA1, grandA1a } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: rootA }]),
			makeMarker('m2', [{ codeId: childA1 }]),
			makeMarker('m3', [{ codeId: grandA1a }]),
		];

		expect(getAggregateCount(rootA, registry, markers)).toBe(3);
	});

	it('returns direct count for leaf code', () => {
		const { registry, grandA1a } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: grandA1a }]),
		];

		expect(getAggregateCount(grandA1a, registry, markers)).toBe(1);
	});

	it('deduplicates markers shared by parent and child', () => {
		const { registry, rootA, childA1 } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: rootA }, { codeId: childA1 }]),
		];

		// m1 appears with both rootA and childA1, but it's one marker
		expect(getAggregateCount(rootA, registry, markers)).toBe(1);
	});
});

// ─── getCountBreakdown ───────────────────────────────────────────

describe('getCountBreakdown', () => {
	it('returns direct and withChildren counts', () => {
		const { registry, rootA, childA1, grandA1a } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: rootA }]),
			makeMarker('m2', [{ codeId: childA1 }]),
			makeMarker('m3', [{ codeId: grandA1a }]),
			makeMarker('m4', [{ codeId: rootA }]),
		];

		const breakdown = getCountBreakdown(rootA, registry, markers);
		expect(breakdown.direct).toBe(2);
		expect(breakdown.withChildren).toBe(4);
	});
});

// ─── buildCountIndex ─────────────────────────────────────────────

describe('buildCountIndex', () => {
	it('computes correct direct/aggregate for multi-level hierarchy', () => {
		const { registry, rootA, rootB, childA1, childA2, grandA1a } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: rootA }]),
			makeMarker('m2', [{ codeId: childA1 }]),
			makeMarker('m3', [{ codeId: grandA1a }]),
			makeMarker('m4', [{ codeId: childA2 }]),
			makeMarker('m5', [{ codeId: rootB }]),
		];

		const index = buildCountIndex(registry, markers);

		expect(index.get(rootA)).toEqual({ direct: 1, aggregate: 4 });
		expect(index.get(childA1)).toEqual({ direct: 1, aggregate: 2 });
		expect(index.get(childA2)).toEqual({ direct: 1, aggregate: 1 });
		expect(index.get(grandA1a)).toEqual({ direct: 1, aggregate: 1 });
		expect(index.get(rootB)).toEqual({ direct: 1, aggregate: 1 });
	});

	it('returns 0/0 for codes with no markers', () => {
		const { registry, rootA, rootB, childA1, childA2, grandA1a } = setupHierarchy();
		const markers: BaseMarker[] = [];

		const index = buildCountIndex(registry, markers);

		expect(index.get(rootA)).toEqual({ direct: 0, aggregate: 0 });
		expect(index.get(rootB)).toEqual({ direct: 0, aggregate: 0 });
		expect(index.get(childA1)).toEqual({ direct: 0, aggregate: 0 });
		expect(index.get(childA2)).toEqual({ direct: 0, aggregate: 0 });
		expect(index.get(grandA1a)).toEqual({ direct: 0, aggregate: 0 });
	});

	it('deduplicates same codeId within a marker', () => {
		const { registry, rootA } = setupHierarchy();
		const markers: BaseMarker[] = [
			makeMarker('m1', [{ codeId: rootA }, { codeId: rootA }]),
		];

		const index = buildCountIndex(registry, markers);
		expect(index.get(rootA)!.direct).toBe(1);
	});
});
