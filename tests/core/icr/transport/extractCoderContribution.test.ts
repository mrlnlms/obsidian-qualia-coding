import { describe, it, expect, beforeEach } from 'vitest';
import { extractCoderContribution } from '../../../../src/core/icr/transport/extractCoderContribution';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';
import type { QualiaData } from '../../../../src/core/types';

function makeMockData(): QualiaData {
	return {
		registry: {
			definitions: {
				'c1': { id: 'c1', name: 'Frustração', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] },
				'c2': { id: 'c2', name: 'Confiança', color: '#000', paletteIndex: 1, createdAt: 1, updatedAt: 1, childrenOrder: [] },
			},
			nextPaletteIndex: 2,
			folders: {}, folderOrder: [], rootOrder: ['c1', 'c2'],
			groups: {}, groupOrder: [], nextGroupPaletteIndex: 0,
		},
		smartCodes: { definitions: {}, order: [], nextPaletteIndex: 0 },
		general: {} as any,
		markdown: {
			markers: {
				'f1.md': [
					{ markerType: 'markdown', id: 'm1', fileId: 'f1.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
					{ markerType: 'markdown', id: 'm2', fileId: 'f1.md', range: { from: { line: 1, ch: 0 }, to: { line: 1, ch: 5 } }, color: '#fff', codes: [{ codeId: 'c2' }], codedBy: 'human:joana', createdAt: 1, updatedAt: 1 },
				],
			},
			settings: {} as any,
		},
		csv: { segmentMarkers: [], rowMarkers: [], settings: {} as any },
		image: { markers: [], settings: {} as any },
		pdf: { markers: [], shapes: [], settings: {} as any },
		audio: { files: [], settings: {} as any },
		video: { files: [], settings: {} as any },
		caseVariables: { values: {}, types: {} },
		coders: {
			coders: [
				{ id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1 },
				{ id: 'human:joana', name: 'Joana', type: 'human', createdAt: 1 },
			],
		},
		visibilityOverrides: {},
		auditLog: [],
	};
}

function makeMockVault(files: Record<string, string>) {
	return { adapter: { async readBinary(p: string) { return new TextEncoder().encode(files[p] ?? '').buffer; } } } as any;
}

describe('extractCoderContribution', () => {
	it('extracts only markers with matching coderId', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:carla');
		const allMarkers = Object.values(payload.markers.markdown).flat();
		expect(allMarkers.length).toBe(1);
		expect(allMarkers[0]!.id).toBe('m1');
		expect(allMarkers[0]!.codedBy).toBe('human:carla');
	});

	it('includes only codes referenced by extracted markers', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:carla');
		expect(payload.codes.map(c => c.id)).toEqual(['c1']);
	});

	it('includes coder entry from registry', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:carla');
		expect(payload.coder.id).toBe('human:carla');
		expect(payload.coder.name).toBe('Carla');
	});

	it('emits warning when source has no hash in registry', async () => {
		const data = makeMockData();
		const { warnings } = await extractCoderContribution(data, 'human:carla');
		expect(warnings.some(w => w.includes('f1.md'))).toBe(true);
	});

	it('payload includes sources with hash when registry passed', async () => {
		const data = makeMockData();
		const vault = makeMockVault({ 'f1.md': 'content' });
		const reg = new SourceHashRegistry(vault);
		await reg.getOrCompute('f1.md');
		const { payload, warnings } = await extractCoderContribution(data, 'human:carla', reg);
		expect(payload.sources['f1.md']).toBeDefined();
		expect(payload.sources['f1.md']!.hash).toMatch(/^[0-9a-f]{64}$/);
		expect(warnings.some(w => w.includes('f1.md'))).toBe(false);
	});

	it('payload includes codebookVersion hash', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:carla');
		expect(payload.codebookVersion).toMatch(/^[0-9a-f]{64}$/);
	});

	it('returns empty markers when no markers match coderId', async () => {
		const data = makeMockData();
		const { payload } = await extractCoderContribution(data, 'human:nonexistent');
		expect(Object.values(payload.markers.markdown).flat().length).toBe(0);
		expect(payload.codes.length).toBe(0);
	});

	it('handles PDF + CSV markers in extraction', async () => {
		const data = makeMockData();
		data.pdf.markers.push({
			markerType: 'pdf', id: 'p1', fileId: 'doc.pdf', page: 1,
			beginIndex: 0, beginOffset: 0, endIndex: 50, endOffset: 0,
			text: '...', codes: [{ codeId: 'c2' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		});
		data.csv.segmentMarkers.push({
			markerType: 'csv', id: 's1', fileId: 'data.csv',
			sourceRowId: 0, column: 'r', from: 0, to: 10,
			codes: [{ codeId: 'c2' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		});
		const { payload } = await extractCoderContribution(data, 'human:carla');
		expect(payload.markers.pdf.length).toBe(1);
		expect(payload.markers.csvSegment.length).toBe(1);
		// Codes referenced now include c1 (md) AND c2 (pdf+csv)
		expect(payload.codes.map(c => c.id).sort()).toEqual(['c1', 'c2']);
	});
});
