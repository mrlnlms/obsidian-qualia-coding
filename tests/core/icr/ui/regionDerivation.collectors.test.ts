import { describe, it, expect, beforeEach } from 'vitest';
import { collectContestedRegions, __test__, bumpRegionsCacheGeneration } from '../../../../src/core/icr/ui/regionDerivation';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';

// Cache module-level — invalida antes de cada test pra evitar cross-contamination.
beforeEach(() => bumpRegionsCacheGeneration());
import type { CodeApplication } from '../../../../src/core/types';
import type { CoderId } from '../../../../src/core/icr/coderTypes';

/**
 * Slice E5a-2: collectors texto-likes (pdf-text, csv-segment) + temporal (audio, video).
 * Mocks dos engine models são thin — só implementam o método chamado pelos collectors.
 */

function codes(...ids: string[]): CodeApplication[] {
	return ids.map(codeId => ({ codeId }));
}

const A: CoderId = 'human:alice';
const B: CoderId = 'human:bob';

// ─── PDF text ─────────────────────────────────────────────

describe('collectPdfTextRegions', () => {
	it('produz região contestada quando 2 coders sobrepõem na mesma page', () => {
		const pdfModel = {
			getAllMarkers: () => [
				{ id: 'm1', fileId: 'doc.pdf', page: 1, beginIndex: 10, endIndex: 50, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
				{ id: 'm2', fileId: 'doc.pdf', page: 1, beginIndex: 30, endIndex: 70, codes: codes('c_y'), codedBy: B, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions).toHaveLength(1);
		expect(regions[0]!.engine).toBe('pdf');
		expect(regions[0]!.bounds).toEqual({ kind: 'pdfText', page: 1, from: 10, to: 70 });
		expect(regions[0]!.coderIds.sort()).toEqual([A, B]);
		expect(regions[0]!.divergenceKind).toBe('code');
	});

	it('não cruza pages — markers em pages diferentes ficam em clusters separados', () => {
		const pdfModel = {
			getAllMarkers: () => [
				{ id: 'm1', fileId: 'doc.pdf', page: 1, beginIndex: 10, endIndex: 50, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
				{ id: 'm2', fileId: 'doc.pdf', page: 2, beginIndex: 10, endIndex: 50, codes: codes('c_x'), codedBy: B, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions).toHaveLength(0); // cada page tem só 1 coder → não contesta
	});

	it('respeita scope.coderIds — markers de coder fora do scope ficam fora', () => {
		const pdfModel = {
			getAllMarkers: () => [
				{ id: 'm1', fileId: 'doc.pdf', page: 1, beginIndex: 10, endIndex: 50, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
				{ id: 'm2', fileId: 'doc.pdf', page: 1, beginIndex: 30, endIndex: 70, codes: codes('c_y'), codedBy: B, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A]); // B fora
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions).toHaveLength(0);
	});

	it('ignora markers sem codedBy', () => {
		const pdfModel = {
			getAllMarkers: () => [
				{ id: 'm1', fileId: 'doc.pdf', page: 1, beginIndex: 10, endIndex: 50, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
				{ id: 'm2', fileId: 'doc.pdf', page: 1, beginIndex: 30, endIndex: 70, codes: codes('c_y'), markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions).toHaveLength(0);
	});

	it('classifica divergenceKind como boundary quando codes iguais mas bounds diferentes', () => {
		const pdfModel = {
			getAllMarkers: () => [
				{ id: 'm1', fileId: 'doc.pdf', page: 1, beginIndex: 10, endIndex: 50, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
				{ id: 'm2', fileId: 'doc.pdf', page: 1, beginIndex: 30, endIndex: 70, codes: codes('c_x'), codedBy: B, markerType: 'pdf' as const, beginOffset: 0, endOffset: 0, text: '', createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions[0]!.divergenceKind).toBe('boundary');
	});
});

// ─── CSV segment ─────────────────────────────────────────────

describe('collectCsvSegmentRegions', () => {
	it('produz região contestada quando 2 coders sobrepõem na mesma cell', () => {
		const csvModel = {
			getAllMarkers: () => [
				{ id: 's1', fileId: 'data.csv', sourceRowId: 5, column: 'comment', from: 10, to: 50, codes: codes('c_x'), codedBy: A, markerType: 'csv' as const, createdAt: 0, updatedAt: 0 },
				{ id: 's2', fileId: 'data.csv', sourceRowId: 5, column: 'comment', from: 30, to: 70, codes: codes('c_y'), codedBy: B, markerType: 'csv' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { csv: csvModel as any });
		expect(regions.filter(r => r.engine === 'csvSegment')).toHaveLength(1);
		const r = regions.find(r => r.engine === 'csvSegment')!;
		expect(r.bounds).toEqual({ kind: 'csvSegment', rowIndex: 5, column: 'comment', from: 10, to: 70 });
	});

	it('não cruza cells diferentes (row ou column)', () => {
		const csvModel = {
			getAllMarkers: () => [
				{ id: 's1', fileId: 'data.csv', sourceRowId: 5, column: 'a', from: 10, to: 50, codes: codes('c_x'), codedBy: A, markerType: 'csv' as const, createdAt: 0, updatedAt: 0 },
				{ id: 's2', fileId: 'data.csv', sourceRowId: 5, column: 'b', from: 10, to: 50, codes: codes('c_y'), codedBy: B, markerType: 'csv' as const, createdAt: 0, updatedAt: 0 },
				{ id: 's3', fileId: 'data.csv', sourceRowId: 6, column: 'a', from: 10, to: 50, codes: codes('c_z'), codedBy: B, markerType: 'csv' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { csv: csvModel as any });
		expect(regions.filter(r => r.engine === 'csvSegment')).toHaveLength(0);
	});

	it('ignora RowMarker (sem from/to)', () => {
		const csvModel = {
			getAllMarkers: () => [
				{ id: 'r1', fileId: 'data.csv', sourceRowId: 5, column: 'a', codes: codes('c_x'), codedBy: A, markerType: 'csv' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'r2', fileId: 'data.csv', sourceRowId: 5, column: 'a', codes: codes('c_y'), codedBy: B, markerType: 'csv' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { csv: csvModel as any });
		// RowMarkers viram csvRow region; csvSegment fica vazio.
		expect(regions.filter(r => r.engine === 'csvSegment')).toHaveLength(0);
		expect(regions.filter(r => r.engine === 'csvRow')).toHaveLength(1);
	});
});

// ─── Audio / Video temporal ─────────────────────────────────────────────

describe('collectTemporalRegions', () => {
	it('produz região contestada quando 2 coders sobrepõem no tempo (audio)', () => {
		const audioModel = {
			getAllMarkers: () => [
				{ id: 'a1', fileId: 'song.mp3', from: 1000, to: 5000, codes: codes('c_x'), codedBy: A, markerType: 'audio' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'a2', fileId: 'song.mp3', from: 3000, to: 7000, codes: codes('c_y'), codedBy: B, markerType: 'audio' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { audio: audioModel as any });
		expect(regions).toHaveLength(1);
		expect(regions[0]!.engine).toBe('audio');
		expect(regions[0]!.bounds).toEqual({ kind: 'temporal', from: 1000, to: 7000 });
	});

	it('engine="video" quando passado pelo model video', () => {
		const videoModel = {
			getAllMarkers: () => [
				{ id: 'v1', fileId: 'clip.mp4', from: 0, to: 2000, codes: codes('c_x'), codedBy: A, markerType: 'video' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'v2', fileId: 'clip.mp4', from: 1000, to: 3000, codes: codes('c_y'), codedBy: B, markerType: 'video' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { video: videoModel as any });
		expect(regions[0]!.engine).toBe('video');
	});

	it('não cruza files — markers em files diferentes ficam em clusters separados', () => {
		const audioModel = {
			getAllMarkers: () => [
				{ id: 'a1', fileId: 'song1.mp3', from: 1000, to: 5000, codes: codes('c_x'), codedBy: A, markerType: 'audio' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'a2', fileId: 'song2.mp3', from: 1000, to: 5000, codes: codes('c_y'), codedBy: B, markerType: 'audio' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { audio: audioModel as any });
		expect(regions).toHaveLength(0);
	});

	it('displayLabel formata MM:SS humano (valores em segundos)', () => {
		const audioModel = {
			getAllMarkers: () => [
				{ id: 'a1', fileId: 'song.mp3', from: 65, to: 75, codes: codes('c_x'), codedBy: A, markerType: 'audio' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'a2', fileId: 'song.mp3', from: 70, to: 80, codes: codes('c_y'), codedBy: B, markerType: 'audio' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { audio: audioModel as any });
		expect(regions[0]!.displayLabel).toBe('1:05–1:20');
	});
});

describe('collectContestedRegions — wiring 4 engines novos', () => {
	it('chama todos os 4 collectors quando models estão presentes', () => {
		const pdfModel = { getAllMarkers: () => [] };
		const csvModel = { getAllMarkers: () => [] };
		const audioModel = { getAllMarkers: () => [] };
		const videoModel = { getAllMarkers: () => [] };
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, {
			pdf: pdfModel as any, csv: csvModel as any, audio: audioModel as any, video: videoModel as any,
		});
		expect(regions).toEqual([]);
	});
});

// ─── Slice E5b — bbox spatial collector (pdfShape + image) ────

describe('collectBboxRegions — pdfShape', () => {
	it('produz região contestada quando 2 coders têm bboxes IoU ≥ 0.5 na mesma page', () => {
		// Mesmo rect → IoU = 1
		const pdfModel = {
			getAllMarkers: () => [],
			getAllShapes: () => [
				{ id: 's1', fileId: 'doc.pdf', page: 1, shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, createdAt: 0, updatedAt: 0 },
				{ id: 's2', fileId: 'doc.pdf', page: 1, shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.12, y: 0.12, w: 0.28, h: 0.28 }, codes: codes('c_y'), codedBy: B, markerType: 'pdf' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions).toHaveLength(1);
		expect(regions[0]!.engine).toBe('pdfShape');
		expect(regions[0]!.bounds.kind).toBe('bbox');
		const b = regions[0]!.bounds as { kind: 'bbox'; page?: number; x: number; y: number; w: number; h: number };
		expect(b.page).toBe(1);
		// AABB-union: x = min(0.1, 0.12), y = min, w = max-min, h = max-min
		expect(b.x).toBeCloseTo(0.1, 5);
		expect(b.y).toBeCloseTo(0.1, 5);
		expect(b.x + b.w).toBeCloseTo(0.4, 5);
		expect(b.y + b.h).toBeCloseTo(0.4, 5);
		expect(regions[0]!.coderIds.sort()).toEqual([A, B]);
		expect(regions[0]!.divergenceKind).toBe('code');
	});

	it('NÃO cruza pages — markers em pages diferentes ficam em scopes separados', () => {
		const pdfModel = {
			getAllMarkers: () => [],
			getAllShapes: () => [
				{ id: 's1', fileId: 'doc.pdf', page: 1, shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, createdAt: 0, updatedAt: 0 },
				{ id: 's2', fileId: 'doc.pdf', page: 2, shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, codes: codes('c_x'), codedBy: B, markerType: 'pdf' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions).toHaveLength(0);
	});

	it('bboxes com IoU < 0.5 NÃO clusterizam (touching corners apenas)', () => {
		// Dois rects que se tocam num corner mas overlap → IoU < 0.5
		const pdfModel = {
			getAllMarkers: () => [],
			getAllShapes: () => [
				{ id: 's1', fileId: 'doc.pdf', page: 1, shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.0, y: 0.0, w: 0.5, h: 0.5 }, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, createdAt: 0, updatedAt: 0 },
				{ id: 's2', fileId: 'doc.pdf', page: 1, shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.4, y: 0.4, w: 0.5, h: 0.5 }, codes: codes('c_y'), codedBy: B, markerType: 'pdf' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		// IoU = (0.1*0.1) / (0.25 + 0.25 - 0.01) = 0.01/0.49 ≈ 0.02 (muito baixo)
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions).toHaveLength(0);
	});

	it('respeita scope.coderIds — markers de coder fora do scope ficam fora', () => {
		const pdfModel = {
			getAllMarkers: () => [],
			getAllShapes: () => [
				{ id: 's1', fileId: 'doc.pdf', page: 1, shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, codes: codes('c_x'), codedBy: A, markerType: 'pdf' as const, createdAt: 0, updatedAt: 0 },
				{ id: 's2', fileId: 'doc.pdf', page: 1, shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, codes: codes('c_y'), codedBy: B, markerType: 'pdf' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A]); // só A no scope
		const regions = collectContestedRegions(state, { pdf: pdfModel as any });
		expect(regions).toHaveLength(0);
	});
});

describe('collectBboxRegions — image', () => {
	it('produz região contestada quando 2 coders têm overlap ≥ 0.5 (sem page)', () => {
		const imageModel = {
			getAllMarkers: () => [
				{ id: 'i1', fileId: 'pic.png', shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, codes: codes('c_x'), codedBy: A, markerType: 'image' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'i2', fileId: 'pic.png', shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.22, y: 0.22, w: 0.38, h: 0.38 }, codes: codes('c_y'), codedBy: B, markerType: 'image' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { image: imageModel as any });
		expect(regions).toHaveLength(1);
		expect(regions[0]!.engine).toBe('image');
		const b = regions[0]!.bounds as { kind: 'bbox'; page?: number };
		expect(b.kind).toBe('bbox');
		expect(b.page).toBeUndefined();
	});

	it('NÃO cruza fileIds — markers em images diferentes ficam separados', () => {
		const imageModel = {
			getAllMarkers: () => [
				{ id: 'i1', fileId: 'pic.png', shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, codes: codes('c_x'), codedBy: A, markerType: 'image' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'i2', fileId: 'other.png', shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, codes: codes('c_x'), codedBy: B, markerType: 'image' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { image: imageModel as any });
		expect(regions).toHaveLength(0);
	});

	it('polygon + rect com overlap > 0.5 clusterizam (mesma região contestada)', () => {
		// Polygon = quadrado coberto pelo rect. IoU alto.
		const imageModel = {
			getAllMarkers: () => [
				{ id: 'rect1', fileId: 'pic.png', shape: 'rect' as const, coords: { type: 'rect' as const, x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, codes: codes('c_x'), codedBy: A, markerType: 'image' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'poly1', fileId: 'pic.png', shape: 'polygon' as const, coords: { type: 'polygon' as const, points: [{ x: 0.22, y: 0.22 }, { x: 0.58, y: 0.22 }, { x: 0.58, y: 0.58 }, { x: 0.22, y: 0.58 }] }, codes: codes('c_y'), codedBy: B, markerType: 'image' as const, createdAt: 0, updatedAt: 0 },
			],
		};
		const state = createDefaultViewState([A, B]);
		const regions = collectContestedRegions(state, { image: imageModel as any });
		expect(regions).toHaveLength(1);
		expect(regions[0]!.markerRefs.map(r => r.markerId).sort()).toEqual(['poly1', 'rect1']);
	});
});

// Re-exports pra teste direto sem ir pelo collectContestedRegions.
describe('__test__ exports', () => {
	it('expõe os 4 collectors novos', () => {
		expect(typeof __test__.collectPdfTextRegions).toBe('function');
		expect(typeof __test__.collectCsvSegmentRegions).toBe('function');
		expect(typeof __test__.collectTemporalRegions).toBe('function');
		expect(typeof __test__.collectBboxRegions).toBe('function');
	});
});
