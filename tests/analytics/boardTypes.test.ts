import { describe, it, expect } from 'vitest';
import {
	isStickyNode,
	isSnapshotNode,
	isExcerptNode,
	isCodeCardNode,
	isKpiCardNode,
	isClusterFrameNode,
	isArrowLineNode,
	isArrowHeadNode,
	isPathNode,
	isBoardNode,
} from '../../src/analytics/board/boardTypes';

// Minimal mock that satisfies FabricObject shape for type guard checks
function makeFabricObj(extra: Record<string, any> = {}): any {
	return { type: 'object', ...extra };
}

// ── isStickyNode ──

describe('isStickyNode', () => {
	it('returns true for object with boardType "sticky"', () => {
		const obj = makeFabricObj({ boardType: 'sticky', boardId: 's1', boardColor: '#F00' });
		expect(isStickyNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'snapshot' });
		expect(isStickyNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isStickyNode(makeFabricObj())).toBe(false);
	});
});

// ── isSnapshotNode ──

describe('isSnapshotNode', () => {
	it('returns true for object with boardType "snapshot"', () => {
		const obj = makeFabricObj({
			boardType: 'snapshot',
			boardId: 'sn1',
			boardTitle: 'Snapshot',
			boardDataUrl: 'data:...',
			boardViewMode: 'chart',
			boardCreatedAt: 1000,
			boardWidth: 400,
			boardHeight: 300,
		});
		expect(isSnapshotNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'sticky' });
		expect(isSnapshotNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isSnapshotNode(makeFabricObj())).toBe(false);
	});
});

// ── isExcerptNode ──

describe('isExcerptNode', () => {
	it('returns true for object with boardType "excerpt"', () => {
		const obj = makeFabricObj({
			boardType: 'excerpt',
			boardId: 'e1',
			boardText: 'text',
			boardFile: 'file.md',
			boardSource: 'markdown',
			boardLocation: 'L1-L5',
			boardCodes: ['code1'],
			boardCodeColors: ['#F00'],
			boardCreatedAt: 1000,
			boardWidth: 200,
		});
		expect(isExcerptNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'codeCard' });
		expect(isExcerptNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isExcerptNode(makeFabricObj())).toBe(false);
	});
});

// ── isCodeCardNode ──

describe('isCodeCardNode', () => {
	it('returns true for object with boardType "codeCard"', () => {
		const obj = makeFabricObj({
			boardType: 'codeCard',
			boardId: 'cc1',
			boardCodeName: 'Theme A',
			boardColor: '#0F0',
			boardDescription: 'desc',
			boardMarkerCount: 5,
			boardSources: ['markdown'],
			boardCreatedAt: 1000,
		});
		expect(isCodeCardNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'excerpt' });
		expect(isCodeCardNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isCodeCardNode(makeFabricObj())).toBe(false);
	});
});

// ── isKpiCardNode ──

describe('isKpiCardNode', () => {
	it('returns true for object with boardType "kpiCard"', () => {
		const obj = makeFabricObj({
			boardType: 'kpiCard',
			boardId: 'k1',
			boardValue: '42',
			boardLabel: 'Count',
			boardAccent: '#00F',
			boardCreatedAt: 1000,
		});
		expect(isKpiCardNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'sticky' });
		expect(isKpiCardNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isKpiCardNode(makeFabricObj())).toBe(false);
	});
});

// ── isClusterFrameNode ──

describe('isClusterFrameNode', () => {
	it('returns true for object with boardType "cluster-frame"', () => {
		const obj = makeFabricObj({
			boardType: 'cluster-frame',
			boardId: 'cf1',
			boardLabel: 'Cluster',
			boardColor: '#999',
			boardCodeNames: ['c1', 'c2'],
			boardWidth: 500,
			boardHeight: 400,
		});
		expect(isClusterFrameNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'kpiCard' });
		expect(isClusterFrameNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isClusterFrameNode(makeFabricObj())).toBe(false);
	});
});

// ── isArrowLineNode ──

describe('isArrowLineNode', () => {
	it('returns true for object with boardType "arrow-line"', () => {
		const obj = makeFabricObj({
			boardType: 'arrow-line',
			boardId: 'al1',
			boardFromId: 'a',
			boardToId: 'b',
			boardColor: '#000',
			boardLabel: 'link',
		});
		expect(isArrowLineNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'path' });
		expect(isArrowLineNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isArrowLineNode(makeFabricObj())).toBe(false);
	});
});

// ── isArrowHeadNode ──

describe('isArrowHeadNode', () => {
	it('returns true for object with boardType "arrow-head"', () => {
		const obj = makeFabricObj({ boardType: 'arrow-head', boardId: 'ah1' });
		expect(isArrowHeadNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'arrow-line' });
		expect(isArrowHeadNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isArrowHeadNode(makeFabricObj())).toBe(false);
	});
});

// ── isPathNode ──

describe('isPathNode', () => {
	it('returns true for object with boardType "path"', () => {
		const obj = makeFabricObj({ boardType: 'path', boardId: 'p1' });
		expect(isPathNode(obj)).toBe(true);
	});

	it('returns false for object with different boardType', () => {
		const obj = makeFabricObj({ boardType: 'sticky' });
		expect(isPathNode(obj)).toBe(false);
	});

	it('returns false for plain FabricObject', () => {
		expect(isPathNode(makeFabricObj())).toBe(false);
	});
});

// ── isBoardNode ──

describe('isBoardNode', () => {
	it('returns true for sticky node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'sticky' }))).toBe(true);
	});

	it('returns true for snapshot node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'snapshot' }))).toBe(true);
	});

	it('returns true for excerpt node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'excerpt' }))).toBe(true);
	});

	it('returns true for codeCard node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'codeCard' }))).toBe(true);
	});

	it('returns true for kpiCard node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'kpiCard' }))).toBe(true);
	});

	it('returns true for cluster-frame node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'cluster-frame' }))).toBe(true);
	});

	it('returns true for arrow-line node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'arrow-line' }))).toBe(true);
	});

	it('returns true for arrow-head node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'arrow-head' }))).toBe(true);
	});

	it('returns true for path node', () => {
		expect(isBoardNode(makeFabricObj({ boardType: 'path' }))).toBe(true);
	});

	it('returns false for plain FabricObject without boardType', () => {
		expect(isBoardNode(makeFabricObj())).toBe(false);
	});
});
