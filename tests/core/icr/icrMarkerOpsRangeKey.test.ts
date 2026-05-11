/**
 * Regression: rangeKey encoding (line * 1M + ch) usado pelo regionDerivation
 * NÃO pode vazar pra range.ch do marker criado. Decodificar antes.
 *
 * Bug observado 2026-05-12: consensus markers eram criados com range.ch = 10000000
 * (rangeKey de line 10 sem decodificar). extractInputsFromScope explodia 2M entries
 * por marker no Map, travando main thread por 60s+.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IcrMarkerOpsImpl } from '../../../src/core/icr/icrMarkerOpsImpl';
import type { Marker } from '../../../src/core/markdown/models/codeMarkerModel';

function makePlugin(insertedMarkers: Marker[]) {
	return {
		app: { workspace: { getLeavesOfType: () => [] } },
		markdownModel: {
			getSettings: () => ({ defaultColor: '#888' }),
			insertMarkerRaw: (m: Marker) => { insertedMarkers.push(m); },
			getMarkersForFile: () => insertedMarkers.filter(m => m.fileId === 'F.md'),
			getMarkerById: () => null,
		},
	} as any;
}

describe('IcrMarkerOpsImpl — rangeKey decoding (regression)', () => {
	it('createMarker decoda bounds.from = line*1M+ch sem editor aberto', () => {
		const inserted: Marker[] = [];
		const plugin = makePlugin(inserted);
		const ops = new IcrMarkerOpsImpl(plugin);

		// rangeKey: line=10, ch=0 → 10000000. Bug pré-fix: ch=10000000 no marker.
		ops.createMarker('markdown', {
			fileId: 'F.md',
			bounds: { kind: 'text', from: 10_000_000, to: 12_000_113 },
			codeIds: ['c_x'],
			codedBy: 'consensus:default',
		});

		expect(inserted.length).toBe(1);
		const m = inserted[0]!;
		expect(m.range.from).toEqual({ line: 10, ch: 0 });
		expect(m.range.to).toEqual({ line: 12, ch: 113 });
	});

	it('createMarker decoda bounds com ch > 0 corretamente', () => {
		const inserted: Marker[] = [];
		const plugin = makePlugin(inserted);
		const ops = new IcrMarkerOpsImpl(plugin);

		// rangeKey: line=5, ch=20 → 5000020. line=8, ch=45 → 8000045.
		ops.createMarker('markdown', {
			fileId: 'F.md',
			bounds: { kind: 'text', from: 5_000_020, to: 8_000_045 },
			codeIds: ['c_y'],
			codedBy: 'consensus:default',
		});

		const m = inserted[0]!;
		expect(m.range.from).toEqual({ line: 5, ch: 20 });
		expect(m.range.to).toEqual({ line: 8, ch: 45 });
	});

	it('findMarkersInRegion decoda rangeKey nos bounds da região', () => {
		const inserted: Marker[] = [{
			markerType: 'markdown',
			id: 'm1',
			fileId: 'F.md',
			range: { from: { line: 10, ch: 0 }, to: { line: 12, ch: 50 } },
			color: '#888',
			codes: [{ codeId: 'c_x' }],
			codedBy: 'human:carla',
			createdAt: 0,
			updatedAt: 0,
		}];
		const plugin = makePlugin(inserted);
		const ops = new IcrMarkerOpsImpl(plugin);

		// Region bounds: rangeKey de line 10 ch 0 → 10M, line 12 ch 40 → 12000040
		const result = ops.findMarkersInRegion({
			fileId: 'F.md',
			engine: 'markdown',
			bounds: { kind: 'text', from: 10_000_000, to: 12_000_040 },
		});
		expect(result.length).toBe(1);
		expect(result[0]!.markerId).toBe('m1');
	});

	it('findMarkersInRegion NÃO retorna markers fora da região decoded', () => {
		const inserted: Marker[] = [{
			markerType: 'markdown',
			id: 'm-far-away',
			fileId: 'F.md',
			range: { from: { line: 50, ch: 0 }, to: { line: 52, ch: 0 } },
			color: '#888',
			codes: [{ codeId: 'c_x' }],
			codedBy: 'human:carla',
			createdAt: 0,
			updatedAt: 0,
		}];
		const plugin = makePlugin(inserted);
		const ops = new IcrMarkerOpsImpl(plugin);

		const result = ops.findMarkersInRegion({
			fileId: 'F.md',
			engine: 'markdown',
			bounds: { kind: 'text', from: 10_000_000, to: 12_000_000 },
		});
		expect(result.length).toBe(0);
	});
});
