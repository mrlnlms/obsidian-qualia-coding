import { describe, it, expect } from 'vitest';
import { detectStaleMarkers } from '../../../../src/core/icr/provenance/detectStaleMarkers';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';
import type { QualiaData } from '../../../../src/core/types';

function makeMockVault(files: Record<string, string>) {
	return { adapter: { async readBinary(p: string) {
		const c = files[p];
		if (c === undefined) throw new Error('Not found: ' + p);
		return new TextEncoder().encode(c).buffer;
	} } } as any;
}

function makeData(): QualiaData {
	return {
		registry: { definitions: {}, nextPaletteIndex: 0, folders: {}, folderOrder: [], rootOrder: [], groups: {}, groupOrder: [], nextGroupPaletteIndex: 0 },
		smartCodes: { definitions: {}, order: [], nextPaletteIndex: 0 },
		general: {} as any,
		markdown: { markers: {}, settings: {} as any },
		csv: { segmentMarkers: [], rowMarkers: [], settings: {} as any },
		image: { markers: [], settings: {} as any },
		pdf: { markers: [], shapes: [], settings: {} as any },
		audio: { files: [], settings: {} as any },
		video: { files: [], settings: {} as any },
		caseVariables: { values: {}, types: {} },
		visibilityOverrides: {}, auditLog: [],
	};
}

describe('detectStaleMarkers', () => {
	it('classifies marker as fresh when snapshot matches current hash', async () => {
		const vault = makeMockVault({ 'f.md': 'content' });
		const reg = new SourceHashRegistry(vault);
		const currentHash = await reg.getOrCompute('f.md');

		const data = makeData();
		data.markdown.markers['f.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'f.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [],
			sourceHashAtCoding: currentHash,
			createdAt: 1, updatedAt: 1,
		}];

		const report = await detectStaleMarkers(data, reg);
		expect(report.fresh).toBe(1);
		expect(report.stale.length).toBe(0);
		expect(report.inconclusive).toBe(0);
	});

	it('classifies marker as stale when snapshot diverges from current hash', async () => {
		const vault = makeMockVault({ 'f.md': 'NEW content' });
		const reg = new SourceHashRegistry(vault);
		await reg.getOrCompute('f.md');

		const data = makeData();
		data.markdown.markers['f.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'f.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [],
			sourceHashAtCoding: 'old-hash-from-different-content',
			createdAt: 1, updatedAt: 1,
		}];

		const report = await detectStaleMarkers(data, reg);
		expect(report.stale.length).toBe(1);
		expect(report.stale[0]!.markerId).toBe('m1');
		expect(report.stale[0]!.engine).toBe('markdown');
		expect(report.stale[0]!.snapshotHash).toBe('old-hash-from-different-content');
		expect(report.stale[0]!.currentHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('classifies marker as inconclusive when no snapshot', async () => {
		const reg = new SourceHashRegistry(makeMockVault({ 'f.md': 'x' }));

		const data = makeData();
		data.markdown.markers['f.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'f.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [],
			createdAt: 1, updatedAt: 1,
		}];

		const report = await detectStaleMarkers(data, reg);
		expect(report.inconclusive).toBe(1);
		expect(report.fresh).toBe(0);
		expect(report.stale.length).toBe(0);
	});

	it('classifies as inconclusive when source not accessible', async () => {
		const reg = new SourceHashRegistry(makeMockVault({}));

		const data = makeData();
		data.markdown.markers['missing.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'missing.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [],
			sourceHashAtCoding: 'some-hash',
			createdAt: 1, updatedAt: 1,
		}];

		const report = await detectStaleMarkers(data, reg);
		expect(report.inconclusive).toBe(1);
	});

	it('iterates all engines (md + pdf + csv segment + csv row + image + audio)', async () => {
		const vault = makeMockVault({});
		const reg = new SourceHashRegistry(vault);
		const data = makeData();
		data.markdown.markers['md.md'] = [{ markerType: 'markdown', id: 'm1', fileId: 'md.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }, color: '#fff', codes: [], createdAt: 1, updatedAt: 1 }];
		data.pdf.markers.push({ markerType: 'pdf', id: 'p1', fileId: 'p.pdf', page: 1, beginIndex: 0, beginOffset: 0, endIndex: 5, endOffset: 0, text: '...', codes: [], createdAt: 1, updatedAt: 1 });
		data.csv.segmentMarkers.push({ markerType: 'csv', id: 's1', fileId: 'd.csv', sourceRowId: 0, column: 'r', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 });
		data.csv.rowMarkers.push({ markerType: 'csv', id: 'r1', fileId: 'd.csv', sourceRowId: 0, column: 'r', codes: [], createdAt: 1, updatedAt: 1 });
		data.image.markers.push({ markerType: 'image', id: 'i1', fileId: 'i.png', shape: 'rect', coords: { type: 'rect', x: 0, y: 0, w: 1, h: 1 }, codes: [], createdAt: 1, updatedAt: 1 } as any);
		data.audio.files.push({ path: 'a.mp3', markers: [{ markerType: 'audio', id: 'a1', fileId: 'a.mp3', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 }] });

		const report = await detectStaleMarkers(data, reg);
		expect(report.inconclusive).toBe(6);
	});
});
