import { describe, it, expect } from 'vitest';
import { extractInputsFromScope, bumpInputsCacheGeneration, type EngineModelsForExtraction } from '../../../../src/core/icr/ui/scopeExtraction';
import type { Marker } from '../../../../src/markdown/models/codeMarkerModel';
import type { RowMarker, SegmentMarker } from '../../../../src/csv/csvCodingTypes';
import type { MediaMarker } from '../../../../src/media/mediaTypes';

const noopApp: any = {
	vault: {
		getAbstractFileByPath: () => null,
		cachedRead: async () => '',
	},
};

function emptyModels(): EngineModelsForExtraction {
	return {
		markdown: { getAllMarkers: () => [] },
		pdf: { getAllMarkers: () => [] },
		csv: { getAllMarkers: () => [] },
		audio: { getAllMarkers: () => [] },
		video: { getAllMarkers: () => [] },
	};
}

function makeMarkdownMarker(opts: { fileId: string; codedBy: string; codeId: string; line?: number }): Marker {
	return {
		markerType: 'markdown',
		id: `m-${Math.random().toString(36).slice(2)}`,
		fileId: opts.fileId,
		range: {
			from: { line: opts.line ?? 0, ch: 0 },
			to: { line: opts.line ?? 0, ch: 5 },
		},
		color: '#888',
		codes: [{ codeId: opts.codeId }],
		codedBy: opts.codedBy,
		createdAt: 0,
		updatedAt: 0,
	};
}

function makeRowMarker(opts: { fileId: string; codedBy: string; codeId: string; sourceRowId: number; column: string }): RowMarker {
	return {
		markerType: 'csv',
		id: `r-${Math.random().toString(36).slice(2)}`,
		fileId: opts.fileId,
		sourceRowId: opts.sourceRowId,
		column: opts.column,
		codes: [{ codeId: opts.codeId }],
		codedBy: opts.codedBy,
		createdAt: 0,
		updatedAt: 0,
	};
}

function makeSegmentMarker(opts: { fileId: string; codedBy: string; codeId: string; sourceRowId: number; column: string; from: number; to: number }): SegmentMarker {
	return {
		markerType: 'csv',
		id: `s-${Math.random().toString(36).slice(2)}`,
		fileId: opts.fileId,
		sourceRowId: opts.sourceRowId,
		column: opts.column,
		from: opts.from,
		to: opts.to,
		codes: [{ codeId: opts.codeId }],
		codedBy: opts.codedBy,
		createdAt: 0,
		updatedAt: 0,
	};
}

describe('extractInputsFromScope', () => {
	it('retorna [] quando engineIds vazio explicitamente', async () => {
		const result = await extractInputsFromScope(
			{ coderIds: ['human:a'], engineIds: [] },
			{ models: emptyModels(), app: noopApp },
		);
		expect(result).toEqual([]);
	});

	it('inclui markdown e popula coders no KappaInput', async () => {
		const models = emptyModels();
		models.markdown!.getAllMarkers = () => [
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: 'human:a', codeId: 'X' }),
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: 'human:b', codeId: 'X' }),
		];
		const app = {
			vault: {
				getAbstractFileByPath: (p: string) => ({ extension: 'md', path: p }),
				cachedRead: async () => 'Hello world from a markdown file',
			},
		};
		const result = await extractInputsFromScope(
			{ coderIds: ['human:a', 'human:b'] },
			{ models, app: app as any },
		);
		const md = result.find(r => r.engine === 'markdown');
		expect(md).toBeTruthy();
		expect(md!.kappaInput.coders).toContain('human:a');
		expect(md!.kappaInput.coders).toContain('human:b');
	});

	it('filtra markers por scope.codeIds quando definido', async () => {
		const models = emptyModels();
		models.markdown!.getAllMarkers = () => [
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: 'human:a', codeId: 'code-1' }),
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: 'human:a', codeId: 'code-2' }),
		];
		const app: any = {
			vault: {
				getAbstractFileByPath: () => ({ extension: 'md' }),
				cachedRead: async () => 'Some markdown source.',
			},
		};
		const result = await extractInputsFromScope(
			{ coderIds: ['human:a'], codeIds: ['code-1'] },
			{ models, app },
		);
		const md = result.find(r => r.engine === 'markdown');
		expect(md).toBeTruthy();
		expect((md!.kappaInput as { markers: unknown[] }).markers).toHaveLength(1);
	});

	it('csvRow produz CategoricalKappaInput com units', async () => {
		const models = emptyModels();
		models.csv!.getAllMarkers = () => [
			makeRowMarker({ fileId: 'f.csv', codedBy: 'human:a', codeId: 'X', sourceRowId: 1, column: 'col1' }),
			makeRowMarker({ fileId: 'f.csv', codedBy: 'human:b', codeId: 'Y', sourceRowId: 1, column: 'col1' }),
		];
		const result = await extractInputsFromScope(
			{ coderIds: ['human:a', 'human:b'] },
			{ models, app: noopApp },
		);
		const csvRow = result.find(r => r.engine === 'csvRow');
		expect(csvRow).toBeTruthy();
		expect('units' in csvRow!.kappaInput).toBe(true);
	});

	it('csvSegment e csvRow ficam separados via discriminação por field shape', async () => {
		const models = emptyModels();
		models.csv!.getAllMarkers = () => [
			makeSegmentMarker({ fileId: 'f.csv', codedBy: 'human:a', codeId: 'S', sourceRowId: 1, column: 'col1', from: 0, to: 5 }),
			makeRowMarker({ fileId: 'f.csv', codedBy: 'human:a', codeId: 'R', sourceRowId: 1, column: 'col1' }),
		];
		const result = await extractInputsFromScope(
			{ coderIds: ['human:a'] },
			{ models, app: noopApp },
		);
		const seg = result.find(r => r.engine === 'csvSegment');
		const row = result.find(r => r.engine === 'csvRow');
		expect(seg).toBeTruthy();
		expect(row).toBeTruthy();
		expect((seg!.kappaInput as { markers: unknown[] }).markers).toHaveLength(1);
		expect((row!.kappaInput as { units: unknown[] }).units).toHaveLength(1);
	});

	it('bbox engines (pdfShape/image) são pulados em E1 mesmo se requisitados', async () => {
		const result = await extractInputsFromScope(
			{ coderIds: ['human:a'], engineIds: ['pdfShape', 'image'] },
			{ models: emptyModels(), app: noopApp },
		);
		expect(result).toEqual([]);
	});

	it('temporalResolution propaga até extractMediaRange — sub-segundo agreement varia entre 1s e 100ms', async () => {
		// Gap #2 (intra-modality): resolução temporal parametrizável.
		// Coders A e B marcam segmentos disjuntos por 600ms (A: 0-0.5s, B: 0.6-1.0s).
		// Em resolution=1: ambos viram [0,1) → falso agreement total no unit space.
		// Em resolution=0.1: A vira [0,5) e B vira [6,10) → disagreement visível.
		const audioMarkers: MediaMarker[] = [
			{ markerType: 'audio', id: 'm1', fileId: 'sample.mp3', from: 0.0, to: 0.5, codes: [{ codeId: 'c1' }], codedBy: 'human:a', createdAt: 1, updatedAt: 1 },
			{ markerType: 'audio', id: 'm2', fileId: 'sample.mp3', from: 0.6, to: 1.0, codes: [{ codeId: 'c1' }], codedBy: 'human:b', createdAt: 1, updatedAt: 1 },
		];
		const models: EngineModelsForExtraction = {
			...emptyModels(),
			audio: { getAllMarkers: () => audioMarkers },
		};

		// Cache pode estar quente de tests anteriores rodando no mesmo arquivo — bump pra garantir miss.
		bumpInputsCacheGeneration();
		const at1s = await extractInputsFromScope(
			{ coderIds: ['human:a', 'human:b'], engineIds: ['audio'], temporalResolution: 1 },
			{ models, app: noopApp },
		);
		const audioInput1s = at1s.find(r => r.engine === 'audio');
		expect(audioInput1s).toBeTruthy();
		const markers1s = (audioInput1s!.kappaInput as { markers: { range: { from: number; to: number } }[] }).markers;
		// Cada marker [0,1) — overlap total no unit space
		expect(markers1s).toHaveLength(2);
		expect(markers1s.every(m => m.range.from === 0 && m.range.to === 1)).toBe(true);

		bumpInputsCacheGeneration();
		const at100ms = await extractInputsFromScope(
			{ coderIds: ['human:a', 'human:b'], engineIds: ['audio'], temporalResolution: 0.1 },
			{ models, app: noopApp },
		);
		const audioInput100ms = at100ms.find(r => r.engine === 'audio');
		const markers100ms = (audioInput100ms!.kappaInput as { markers: { range: { from: number; to: number } }[] }).markers;
		expect(markers100ms).toHaveLength(2);
		// A: [0,5), B: [6,10) — disjuntos
		const sortedFroms = markers100ms.map(m => m.range.from).sort((a, b) => a - b);
		const sortedTos = markers100ms.map(m => m.range.to).sort((a, b) => a - b);
		expect(sortedFroms).toEqual([0, 6]);
		expect(sortedTos).toEqual([5, 10]);
	});
});
