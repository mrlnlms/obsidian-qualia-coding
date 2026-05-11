import { describe, it, expect } from 'vitest';
import {
	getRegionStatus,
	categorizeRegionsByStatus,
	findLatestActiveOpenedEntry,
	regionKey,
	type ContestedRegion,
} from '../../../../src/core/icr/ui/regionDerivation';
import type { AuditEntry, ReconciliationBounds } from '../../../../src/core/types';

const region = {
	fileId: 'F1.md',
	engine: 'markdown' as const,
	bounds: { kind: 'text' as const, from: 100, to: 200 },
};

function makeOpened(id: string, at: number, regionInput = region): AuditEntry {
	return {
		id,
		codeId: '',
		at,
		entity: 'reconciliation',
		type: 'reconciliation_opened',
		region: regionInput,
		coderIds: ['human:alice', 'human:bob'],
		candidateCodeIds: ['c_x', 'c_y'],
	};
}

function makeDecided(
	id: string,
	at: number,
	kind: 'adopt' | 'split' | 'accept-divergence' = 'adopt',
	regionInput = region,
): AuditEntry {
	const decision = kind === 'adopt'
		? { kind: 'adopt' as const, codeId: 'c_x', mode: 'consensus-marker' as const }
		: kind === 'split'
		? { kind: 'split' as const, newCodeId: 'c_split', mode: 'consensus-marker' as const }
		: { kind: 'accept-divergence' as const };
	return {
		id,
		codeId: kind === 'split' ? 'c_split' : 'c_x',
		at,
		entity: 'reconciliation',
		type: 'reconciliation_decided',
		region: regionInput,
		coderIds: ['human:alice', 'human:bob'],
		decision,
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

function makeRegion(
	fileId: string,
	bounds: ReconciliationBounds = { kind: 'text', from: 0, to: 100 },
): ContestedRegion {
	return {
		fileId,
		engine: 'markdown',
		bounds,
		coderIds: ['human:alice', 'human:bob'],
		displayLabel: 'test',
		markerRefs: [],
		divergenceKind: 'code',
	};
}

describe('regionDerivation — findLatestActiveOpenedEntry', () => {
	it('retorna null quando nunca houve opened', () => {
		expect(findLatestActiveOpenedEntry(region, [])).toBeNull();
	});

	it('retorna entry quando há opened', () => {
		const log: AuditEntry[] = [makeOpened('o1', 1)];
		expect(findLatestActiveOpenedEntry(region, log)?.id).toBe('o1');
	});

	it('retorna o último quando há múltiplos opened', () => {
		const log: AuditEntry[] = [makeOpened('o1', 1), makeOpened('o2', 2)];
		expect(findLatestActiveOpenedEntry(region, log)?.id).toBe('o2');
	});

	it('ignora opened de outras regiões', () => {
		const other = { ...region, fileId: 'OUT.md' };
		const log: AuditEntry[] = [makeOpened('o1', 1, other)];
		expect(findLatestActiveOpenedEntry(region, log)).toBeNull();
	});
});

describe('regionDerivation — getRegionStatus', () => {
	it('open quando log vazio', () => {
		expect(getRegionStatus(region, [])).toBe('open');
	});

	it('inDiscussion quando há opened sem decided', () => {
		const log: AuditEntry[] = [makeOpened('o1', 1)];
		expect(getRegionStatus(region, log)).toBe('inDiscussion');
	});

	it('resolved quando há decided adopt ativo', () => {
		const log: AuditEntry[] = [makeDecided('d1', 1, 'adopt')];
		expect(getRegionStatus(region, log)).toBe('resolved');
	});

	it('resolved quando há decided split ativo', () => {
		const log: AuditEntry[] = [makeDecided('d1', 1, 'split')];
		expect(getRegionStatus(region, log)).toBe('resolved');
	});

	it('divergenceAccepted quando há decided accept-divergence ativo', () => {
		const log: AuditEntry[] = [makeDecided('d1', 1, 'accept-divergence')];
		expect(getRegionStatus(region, log)).toBe('divergenceAccepted');
	});

	it('decided ativo SUPERA opened anterior', () => {
		const log: AuditEntry[] = [makeOpened('o1', 1), makeDecided('d1', 2, 'adopt')];
		expect(getRegionStatus(region, log)).toBe('resolved');
	});

	it('decided revertido + opened ainda presente → inDiscussion', () => {
		const log: AuditEntry[] = [
			makeOpened('o1', 1),
			makeDecided('d1', 2, 'adopt'),
			makeReverted('r1', 'd1', 3),
		];
		expect(getRegionStatus(region, log)).toBe('inDiscussion');
	});

	it('decided revertido sem opened pendente → open', () => {
		const log: AuditEntry[] = [makeDecided('d1', 1, 'adopt'), makeReverted('r1', 'd1', 2)];
		expect(getRegionStatus(region, log)).toBe('open');
	});

	it('ignora entries de outras regiões', () => {
		const other = { ...region, fileId: 'OUT.md' };
		const log: AuditEntry[] = [makeDecided('d1', 1, 'adopt', other)];
		expect(getRegionStatus(region, log)).toBe('open');
	});

	it('última decisão não-revertida vence quando há múltiplas', () => {
		const log: AuditEntry[] = [
			makeDecided('d1', 1, 'adopt'),
			makeReverted('r1', 'd1', 2),
			makeDecided('d2', 3, 'accept-divergence'),
		];
		expect(getRegionStatus(region, log)).toBe('divergenceAccepted');
	});
});

describe('regionDerivation — categorizeRegionsByStatus', () => {
	it('distribui regiões nas 4 colunas', () => {
		const r1 = makeRegion('A.md', { kind: 'text', from: 0, to: 50 });
		const r2 = makeRegion('B.md', { kind: 'text', from: 0, to: 60 });
		const r3 = makeRegion('C.md', { kind: 'text', from: 0, to: 70 });
		const r4 = makeRegion('D.md', { kind: 'text', from: 0, to: 80 });
		const log: AuditEntry[] = [
			makeOpened('o1', 1, { fileId: 'B.md', engine: 'markdown', bounds: r2.bounds }),
			makeDecided('d1', 2, 'adopt', { fileId: 'C.md', engine: 'markdown', bounds: r3.bounds }),
			makeDecided('d2', 3, 'accept-divergence', { fileId: 'D.md', engine: 'markdown', bounds: r4.bounds }),
		];
		const out = categorizeRegionsByStatus([r1, r2, r3, r4], log);
		expect(out.open.map(r => r.fileId)).toEqual(['A.md']);
		expect(out.inDiscussion.map(r => r.fileId)).toEqual(['B.md']);
		expect(out.resolved.map(r => r.fileId)).toEqual(['C.md']);
		expect(out.divergenceAccepted.map(r => r.fileId)).toEqual(['D.md']);
	});

	it('preserva ordem original dentro de cada coluna', () => {
		const r1 = makeRegion('A.md', { kind: 'text', from: 0, to: 50 });
		const r2 = makeRegion('B.md', { kind: 'text', from: 0, to: 60 });
		const out = categorizeRegionsByStatus([r1, r2], []);
		expect(out.open.map(r => r.fileId)).toEqual(['A.md', 'B.md']);
	});

	it('lida com input vazio', () => {
		const out = categorizeRegionsByStatus([], []);
		expect(out.open).toEqual([]);
		expect(out.inDiscussion).toEqual([]);
		expect(out.resolved).toEqual([]);
		expect(out.divergenceAccepted).toEqual([]);
	});
});

describe('regionDerivation — regionKey collision check', () => {
	it('regions com mesmo file/engine mas bounds diferentes têm keys diferentes', () => {
		const r1 = makeRegion('A.md', { kind: 'text', from: 0, to: 50 });
		const r2 = makeRegion('A.md', { kind: 'text', from: 50, to: 100 });
		expect(regionKey(r1)).not.toBe(regionKey(r2));
	});

	it('csvRow regions distintas por rowIndex', () => {
		const r1 = makeRegion('A.csv', { kind: 'csvRow', rowIndex: 1, column: 'resp' });
		const r2 = makeRegion('A.csv', { kind: 'csvRow', rowIndex: 2, column: 'resp' });
		expect(regionKey(r1)).not.toBe(regionKey(r2));
	});

	it('csvRow regions com column undefined vs vazio são equivalentes', () => {
		const r1 = makeRegion('A.csv', { kind: 'csvRow', rowIndex: 1, column: undefined });
		const r2 = makeRegion('A.csv', { kind: 'csvRow', rowIndex: 1, column: '' });
		expect(regionKey(r1)).toBe(regionKey(r2));
	});
});
