import { describe, it, expect } from 'vitest';
import { extractInputsFromScope, type EngineModelsForExtraction } from '../../../../src/core/icr/ui/scopeExtraction';
import type { Marker } from '../../../../src/markdown/models/codeMarkerModel';
import type { RowMarker, SegmentMarker } from '../../../../src/csv/csvCodingTypes';

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
});
