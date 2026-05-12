import { describe, it, expect, vi } from 'vitest';
import { CsvCodingModel } from '../../src/csv/csvCodingModel';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

function createMockDm() {
	const store: Record<string, any> = {};
	return {
		section: (k: string) => {
			if (!store[k]) store[k] = { segmentMarkers: [], rowMarkers: [] };
			return store[k];
		},
		setSection: (k: string, v: any) => { store[k] = v; },
		markDirty: vi.fn(),
	};
}

describe('CSV invariant: 1 marker por (file, row, col, codedBy)', () => {
	it('verifica invariante após sequência mista de operações multi-coder', () => {
		const registry = new CodeDefinitionRegistry();
		const dm = createMockDm();
		let activeCoder = 'human:default';
		const plugin = {
			dataManager: dm,
			getActiveCoderId: () => activeCoder,
			sourceHashRegistry: { getHash: () => Promise.resolve(undefined) },
		} as any;
		const model = new CsvCodingModel(plugin, registry);
		const c1 = registry.create('c1').id;
		const c2 = registry.create('c2').id;

		model.findOrCreateRowMarker('a.csv', 0, 'text');
		model.addCodeToMarker(model.findOrCreateRowMarker('a.csv', 0, 'text').id, c1);
		activeCoder = 'human:bob';
		model.findOrCreateRowMarker('a.csv', 0, 'text');
		model.addCodeToMarker(model.findOrCreateRowMarker('a.csv', 0, 'text').id, c2);
		activeCoder = 'human:default';
		model.setCellComment('a.csv', 0, 'text', 'default note');
		activeCoder = 'human:bob';
		model.setCellComment('a.csv', 0, 'text', 'bob note');

		const all = model.getRowMarkersForCell('a.csv', 0, 'text');
		const tuples = all.map(m => `${m.fileId}|${m.sourceRowId}|${m.column}|${m.codedBy ?? 'human:default'}`);
		expect(new Set(tuples).size).toBe(tuples.length);
		const distinctCoders = new Set(all.map(m => m.codedBy ?? 'human:default'));
		expect(distinctCoders.size).toBe(all.length);
	});
});
