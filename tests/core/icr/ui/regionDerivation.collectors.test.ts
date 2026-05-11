import { describe, it, expect } from 'vitest';
import { collectContestedRegions, __test__ } from '../../../../src/core/icr/ui/regionDerivation';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
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
		expect(regions[0]!.bounds).toEqual({ kind: 'temporal', fromMs: 1000, toMs: 7000 });
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

	it('displayLabel formata MM:SS humano', () => {
		const audioModel = {
			getAllMarkers: () => [
				{ id: 'a1', fileId: 'song.mp3', from: 65000, to: 75000, codes: codes('c_x'), codedBy: A, markerType: 'audio' as const, createdAt: 0, updatedAt: 0 },
				{ id: 'a2', fileId: 'song.mp3', from: 70000, to: 80000, codes: codes('c_y'), codedBy: B, markerType: 'audio' as const, createdAt: 0, updatedAt: 0 },
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

// Re-exports pra teste direto sem ir pelo collectContestedRegions.
describe('__test__ exports', () => {
	it('expõe os 3 collectors novos', () => {
		expect(typeof __test__.collectPdfTextRegions).toBe('function');
		expect(typeof __test__.collectCsvSegmentRegions).toBe('function');
		expect(typeof __test__.collectTemporalRegions).toBe('function');
	});
});
