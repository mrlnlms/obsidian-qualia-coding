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
