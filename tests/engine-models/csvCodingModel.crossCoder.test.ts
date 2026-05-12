import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CsvCodingModel } from '../../src/csv/csvCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { RowMarker } from '../../src/csv/csvCodingTypes';

function createMockDm(initial: Record<string, any> = {}) {
	const store: Record<string, any> = { ...initial };
	return {
		section: (k: string) => {
			if (!store[k]) store[k] = { segmentMarkers: [], rowMarkers: [] };
			return store[k];
		},
		setSection: (k: string, v: any) => { store[k] = v; },
		markDirty: vi.fn(),
	};
}

let model: CsvCodingModel;
let registry: CodeDefinitionRegistry;
let dm: ReturnType<typeof createMockDm>;
let activeCoder: string;

beforeEach(() => {
	registry = new CodeDefinitionRegistry();
	dm = createMockDm();
	activeCoder = 'human:default';
	const plugin = {
		dataManager: dm,
		getActiveCoderId: () => activeCoder,
		sourceHashRegistry: { getHash: () => Promise.resolve(undefined) },
	} as any;
	model = new CsvCodingModel(plugin, registry);
});

function insertRowMarker(opts: { file: string; row: number; column: string; coder?: string; codeIds?: string[]; comment?: string }): RowMarker {
	const marker: RowMarker = {
		markerType: 'csv',
		id: `csv-row-${opts.file}-${opts.row}-${opts.column}-${opts.coder ?? 'nocoder'}`,
		fileId: opts.file,
		sourceRowId: opts.row,
		column: opts.column,
		codes: (opts.codeIds ?? []).map(codeId => ({ codeId })),
		...(opts.coder !== undefined && { codedBy: opts.coder }),
		...(opts.comment !== undefined && { comment: opts.comment }),
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
	model.insertMarkerRaw(marker);
	return marker;
}

describe('CSV cross-coder: getRowMarkerForActiveCoder', () => {
	it('retorna marker do active coder quando cell tem múltiplos coders', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c1'] });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c2'] });
		const result = model.getRowMarkerForActiveCoder('a.csv', 0, 'text');
		expect(result?.codedBy).toBe('human:default');
		expect(result?.codes.map(c => c.codeId)).toEqual(['c1']);
	});

	it('retorna undefined quando active não tem marker mas alheio tem', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c2'] });
		const result = model.getRowMarkerForActiveCoder('a.csv', 0, 'text');
		expect(result).toBeUndefined();
	});

	it('trata marker legado sem codedBy como human:default (defensive ??)', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: undefined, codeIds: ['c1'] });
		activeCoder = 'human:default';
		const result = model.getRowMarkerForActiveCoder('a.csv', 0, 'text');
		expect(result?.codes.map(c => c.codeId)).toEqual(['c1']);
	});
});

describe('CSV cross-coder: findOrCreateRowMarker', () => {
	it('cria marker novo do active coder quando alheio existe na cell', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		activeCoder = 'human:default';
		const m = model.findOrCreateRowMarker('a.csv', 0, 'text');
		expect(m.codedBy).toBe('human:default');
		expect(m.codes).toEqual([]);
		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(all).toHaveLength(2);
	});

	it('retorna marker existente do active coder quando já existe', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c1'] });
		const m = model.findOrCreateRowMarker('a.csv', 0, 'text');
		expect(m.codedBy).toBe('human:default');
		expect(m.codes.map(c => c.codeId)).toEqual(['c1']);
		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(all).toHaveLength(1);
	});
});

describe('CSV cross-coder: setCellComment', () => {
	it('cria marker novo do active coder quando alheio já tem comment na cell', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', comment: 'bob comment' });
		activeCoder = 'human:default';
		model.setCellComment('a.csv', 0, 'text', 'default comment');
		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(all).toHaveLength(2);
		const defaultMarker = all.find(m => m.codedBy === 'human:default');
		expect(defaultMarker?.comment).toBe('default comment');
		const bobMarker = all.find(m => m.codedBy === 'human:bob');
		expect(bobMarker?.comment).toBe('bob comment');
	});

	it('GC remove marker do active sem codes e comment vazio (não toca no de outro coder)', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		model.setCellComment('a.csv', 0, 'text', 'default note');
		model.setCellComment('a.csv', 0, 'text', '');
		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(all).toHaveLength(1);
		expect(all[0]?.codedBy).toBe('human:bob');
	});
});

describe('CSV cross-coder: addCodeToManyRows', () => {
	it('opera apenas em markers do active coder, ignora alheios', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		insertRowMarker({ file: 'a.csv', row: 1, column: 'text', coder: 'human:default', codeIds: ['c2'] });
		registry.create('newCode');
		const newCodeId = registry.getByName('newCode')!.id;
		model.addCodeToManyRows('a.csv', [0, 1], 'text', newCodeId);
		const r0 = model.getRowMarkersForCell('a.csv', 0, 'text');
		const bobMarker = r0.find(m => m.codedBy === 'human:bob');
		expect(bobMarker?.codes.map(c => c.codeId)).toEqual(['c1']);
		const defaultMarker0 = r0.find(m => m.codedBy === 'human:default');
		expect(defaultMarker0?.codes.map(c => c.codeId)).toEqual([newCodeId]);
		const r1 = model.getRowMarkersForCell('a.csv', 1, 'text');
		expect(r1[0]?.codes.map(c => c.codeId).sort()).toEqual(['c2', newCodeId].sort());
	});
});

describe('CSV cross-coder: removeAllRowMarkersFromMany', () => {
	it('deleta apenas markers do active coder', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c2'] });
		insertRowMarker({ file: 'a.csv', row: 1, column: 'text', coder: 'human:default', codeIds: ['c3'] });
		model.removeAllRowMarkersFromMany('a.csv', [0, 1], 'text');
		const r0 = model.getRowMarkersForCell('a.csv', 0, 'text');
		expect(r0).toHaveLength(1);
		expect(r0[0]?.codedBy).toBe('human:bob');
		const r1 = model.getRowMarkersForCell('a.csv', 1, 'text');
		expect(r1).toHaveLength(0);
	});
});

describe('CSV cross-coder: getCodeIntersectionForRows', () => {
	it('calcula intersect apenas sobre markers do active coder', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c1', 'c2'] });
		insertRowMarker({ file: 'a.csv', row: 1, column: 'text', coder: 'human:default', codeIds: ['c2', 'c3'] });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1', 'c4'] });
		insertRowMarker({ file: 'a.csv', row: 1, column: 'text', coder: 'human:bob', codeIds: ['c4', 'c5'] });
		const intersect = model.getCodeIntersectionForRows('a.csv', [0, 1], 'text');
		expect([...intersect]).toEqual(['c2']);
	});
});

describe('CSV cross-coder: getCellComment', () => {
	it('retorna comment do active coder, ignora alheio', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', comment: 'bob comment' });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', comment: 'default comment' });
		activeCoder = 'human:default';
		expect(model.getCellComment('a.csv', 0, 'text')).toBe('default comment');
		activeCoder = 'human:bob';
		expect(model.getCellComment('a.csv', 0, 'text')).toBe('bob comment');
	});

	it('retorna vazio quando active não tem marker (mas alheio tem comment)', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', comment: 'bob' });
		activeCoder = 'human:default';
		expect(model.getCellComment('a.csv', 0, 'text')).toBe('');
	});
});

describe('CSV cross-coder: getCodesForCell (branch row)', () => {
	it('retorna codes do marker do active coder, ignora alheios', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1', 'c2'] });
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:default', codeIds: ['c3'] });
		activeCoder = 'human:default';
		expect(model.getCodesForCell('a.csv', 0, 'text', 'row').sort()).toEqual(['c3']);
		activeCoder = 'human:bob';
		expect(model.getCodesForCell('a.csv', 0, 'text', 'row').sort()).toEqual(['c1', 'c2'].sort());
	});

	it('retorna vazio quando active não tem marker mas alheio tem codes', () => {
		insertRowMarker({ file: 'a.csv', row: 0, column: 'text', coder: 'human:bob', codeIds: ['c1'] });
		activeCoder = 'human:default';
		expect(model.getCodesForCell('a.csv', 0, 'text', 'row')).toEqual([]);
	});
});
