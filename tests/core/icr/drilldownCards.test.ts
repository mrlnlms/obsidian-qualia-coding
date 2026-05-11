import { describe, it, expect } from 'vitest';
import {
	formatBoundsLabel,
	sameBounds,
	findLatestActiveDecision,
	regionKey,
	__test__ as regionDerivationTest,
} from '../../../src/core/icr/ui/regionDerivation';
import type { AuditEntry } from '../../../src/core/types';

const { clusterMarkdownMarkers } = regionDerivationTest;

function mdM(fileId: string, startLine: number, startCh: number, endLine: number, endCh: number, coderId: string, markerId: string, codes: { codeId: string }[] = []) {
	return { fileId, startLine, startCh, endLine, endCh, coderId, markerId, codes };
}

describe('drilldownCards — clusterMarkdownMarkers', () => {
	it('agrupa markers que se sobrepõem em line/ch (mesma linha)', () => {
		const markers = [
			mdM('F1.md', 5, 100, 5, 200, 'human:alice', 'm1', [{ codeId: 'c_x' }]),
			mdM('F1.md', 5, 150, 5, 250, 'human:bob', 'm2', [{ codeId: 'c_y' }]),
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(1);
		expect(regions[0]!.coderIds.sort()).toEqual(['human:alice', 'human:bob']);
		expect(regions[0]!.markerRefs).toHaveLength(2);
		expect(regions[0]!.displayLabel).toMatch(/linha 6:100–6:250/);
	});

	it('markerRefs preserva codes pra dropdown candidatos', () => {
		const markers = [
			mdM('F.md', 0, 0, 0, 50, 'human:alice', 'm1', [{ codeId: 'c_alpha' }]),
			mdM('F.md', 0, 25, 0, 75, 'human:bob', 'm2', [{ codeId: 'c_beta' }]),
		];
		const regions = clusterMarkdownMarkers(markers);
		const allCodes = new Set<string>();
		for (const m of regions[0]!.markerRefs) for (const c of m.codes) allCodes.add(c.codeId);
		expect(Array.from(allCodes).sort()).toEqual(['c_alpha', 'c_beta']);
	});

	it('separa markers que NÃO se sobrepõem em clusters distintos', () => {
		const markers = [
			mdM('F1.md', 5, 100, 5, 200, 'human:alice', 'm1'),
			mdM('F1.md', 20, 500, 20, 600, 'human:bob', 'm2'),
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(2);
	});

	it('separa por fileId mesmo com bounds idênticos', () => {
		const markers = [
			mdM('F1.md', 5, 100, 5, 200, 'human:alice', 'm1'),
			mdM('F2.md', 5, 100, 5, 200, 'human:bob', 'm2'),
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(2);
		expect(regions.map(r => r.fileId).sort()).toEqual(['F1.md', 'F2.md']);
	});

	it('cluster com 3+ markers transitivamente sobrepostos vira 1 região', () => {
		const markers = [
			mdM('F.md', 0, 0, 0, 100, 'human:alice', 'm1'),
			mdM('F.md', 0, 50, 0, 150, 'human:bob', 'm2'),
			mdM('F.md', 0, 120, 0, 200, 'human:carla', 'm3'),
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(1);
		expect(regions[0]!.coderIds.sort()).toEqual(['human:alice', 'human:bob', 'human:carla']);
		expect(regions[0]!.markerRefs).toHaveLength(3);
	});

	it('dedup coderIds quando mesmo coder tem múltiplos markers no cluster', () => {
		const markers = [
			mdM('F.md', 0, 0, 0, 50, 'human:alice', 'm1'),
			mdM('F.md', 0, 25, 0, 75, 'human:alice', 'm2'),
			mdM('F.md', 0, 60, 0, 100, 'human:bob', 'm3'),
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions).toHaveLength(1);
		expect(regions[0]!.coderIds.sort()).toEqual(['human:alice', 'human:bob']);
		expect(regions[0]!.markerRefs).toHaveLength(3);
	});
});

describe('drilldownCards — classifyDivergence (via cluster)', () => {
	it('detecta code disagreement quando coders aplicam codes diferentes', () => {
		const markers = [
			mdM('F.md', 0, 0, 0, 50, 'human:alice', 'm1', [{ codeId: 'c_alpha' }]),
			mdM('F.md', 0, 0, 0, 50, 'human:bob', 'm2', [{ codeId: 'c_beta' }]),
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions[0]!.divergenceKind).toBe('code');
	});

	it('detecta boundary disagreement quando mesmo code com bounds diferentes', () => {
		const markers = [
			mdM('F.md', 0, 0, 0, 50, 'human:alice', 'm1', [{ codeId: 'c_alpha' }]),
			mdM('F.md', 0, 30, 0, 80, 'human:bob', 'm2', [{ codeId: 'c_alpha' }]),
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions[0]!.divergenceKind).toBe('boundary');
	});

	it('marca existence quando só 1 coder no cluster (não passa pelo filtro >=2 mas o classifier funciona)', () => {
		const markers = [
			mdM('F.md', 0, 0, 0, 50, 'human:alice', 'm1', [{ codeId: 'c_alpha' }]),
		];
		const regions = clusterMarkdownMarkers(markers);
		expect(regions[0]!.divergenceKind).toBe('existence');
	});
});

describe('drilldownCards — sameBounds', () => {
	it('text bounds bate quando from + to iguais', () => {
		expect(sameBounds({ kind: 'text', from: 10, to: 20 }, { kind: 'text', from: 10, to: 20 })).toBe(true);
		expect(sameBounds({ kind: 'text', from: 10, to: 20 }, { kind: 'text', from: 10, to: 21 })).toBe(false);
	});

	it('csvRow bate com column normalizado (undefined ≡ "")', () => {
		expect(sameBounds({ kind: 'csvRow', rowIndex: 1 }, { kind: 'csvRow', rowIndex: 1, column: '' })).toBe(true);
		expect(sameBounds({ kind: 'csvRow', rowIndex: 1, column: 'a' }, { kind: 'csvRow', rowIndex: 1, column: 'b' })).toBe(false);
	});

	it('kinds diferentes nunca batem', () => {
		expect(sameBounds({ kind: 'text', from: 0, to: 10 }, { kind: 'csvRow', rowIndex: 0 })).toBe(false);
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

describe('drilldownCards — resolution tracking (E3a polish)', () => {
	const region = {
		fileId: 'F.md',
		engine: 'markdown' as const,
		bounds: { kind: 'text' as const, from: 100, to: 200 },
	};

	function makeDecided(id: string, regionInput = region): AuditEntry {
		return {
			id,
			codeId: 'c_x',
			at: parseInt(id.replace(/\D/g, '')) || 0,
			entity: 'reconciliation',
			type: 'reconciliation_decided',
			region: regionInput,
			coderIds: ['human:alice', 'human:bob'],
			decision: { kind: 'adopt', codeId: 'c_x', mode: 'consensus-marker' },
			consensusMarkerId: `m_${id}`,
			memoOfReconciliation: 'memo',
		};
	}

	function makeReverted(id: string, originalEntryId: string, at: number): AuditEntry {
		return {
			id,
			codeId: 'c_x',
			at,
			entity: 'reconciliation',
			type: 'reconciliation_reverted',
			originalEntryId,
			restoredMarkerIds: [],
		};
	}

	it('regionKey é estável e único por fileId + engine + bounds', () => {
		const k1 = regionKey(region);
		const k2 = regionKey({ ...region });
		expect(k1).toBe(k2);
		expect(regionKey({ ...region, fileId: 'G.md' })).not.toBe(k1);
		expect(regionKey({ ...region, bounds: { kind: 'text', from: 0, to: 200 } })).not.toBe(k1);
	});

	it('findLatestActiveDecision retorna decisão quando há decided sem revert', () => {
		const log: AuditEntry[] = [makeDecided('a1')];
		expect(findLatestActiveDecision(region, log)?.id).toBe('a1');
	});

	it('findLatestActiveDecision retorna null quando decided foi revertida', () => {
		const log: AuditEntry[] = [makeDecided('a1'), makeReverted('a2', 'a1', 2)];
		expect(findLatestActiveDecision(region, log)).toBeNull();
	});

	it('findLatestActiveDecision retorna decisão MAIS RECENTE quando há múltiplas em sequência (revert+re-decide)', () => {
		const log: AuditEntry[] = [
			makeDecided('a1'),
			makeReverted('a2', 'a1', 2),
			makeDecided('a3'),
		];
		expect(findLatestActiveDecision(region, log)?.id).toBe('a3');
	});

	it('findLatestActiveDecision ignora decisões de outras regiões', () => {
		const otherRegion = { ...region, fileId: 'G.md' };
		const log: AuditEntry[] = [makeDecided('a1', otherRegion)];
		expect(findLatestActiveDecision(region, log)).toBeNull();
	});

	it('findLatestActiveDecision ignora bounds parcialmente sobrepostos', () => {
		const overlappingBounds = { ...region, bounds: { kind: 'text' as const, from: 150, to: 250 } };
		const log: AuditEntry[] = [makeDecided('a1', overlappingBounds)];
		expect(findLatestActiveDecision(region, log)).toBeNull();
	});
});
