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
	it.todo('placeholder');
});
