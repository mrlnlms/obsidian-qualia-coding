import { describe, it, expect } from 'vitest';
import { mergeCoderContribution } from '../../../../src/core/icr/transport/mergeCoderContribution';
import { extractCoderContribution } from '../../../../src/core/icr/transport/extractCoderContribution';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';
import { createEmptyOverrides } from '../../../../src/core/icr/contributions/contributionViewTypes';
import type { QualiaData } from '../../../../src/core/types';

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
		coders: { coders: [{ id: 'human:default', name: 'Default', type: 'human', createdAt: 1 }] },
		visibilityOverrides: {},
		auditLog: [],
	};
}

function makeMockVault(files: Record<string, string>) {
	return { adapter: { async readBinary(p: string) { return new TextEncoder().encode(files[p] ?? '').buffer; } } } as any;
}

async function setup(sourceFiles: Record<string, string>, targetFiles: Record<string, string>) {
	const sourceData = makeData();
	const targetData = makeData();
	sourceData.coders!.coders.push({ id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1 });
	sourceData.registry.definitions['c1'] = { id: 'c1', name: 'Frustração', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
	sourceData.registry.rootOrder.push('c1');

	const sourceVault = makeMockVault(sourceFiles);
	const sourceReg = new SourceHashRegistry(sourceVault);
	for (const path of Object.keys(sourceFiles)) await sourceReg.getOrCompute(path);

	const targetVault = makeMockVault(targetFiles);
	const targetReg = new SourceHashRegistry(targetVault);
	for (const path of Object.keys(targetFiles)) await targetReg.getOrCompute(path);

	return { sourceData, targetData, sourceReg, targetReg };
}

describe('mergeCoderContribution', () => {
	it('adds coder to local registry if not present', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'shared content' },
			{ 'shared.md': 'shared content' },
		);
		sourceData.markdown.markers['shared.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'shared.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.added.coder).toBe(true);
		expect(targetData.coders!.coders.find(c => c.id === 'human:carla')).toBeTruthy();
	});

	it('cross-vault remaps marker fileId by hash (paths divergem)', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'remote/shared.md': 'shared content' },
			{ 'local/different/shared.md': 'shared content' },
		);
		sourceData.markdown.markers['remote/shared.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'remote/shared.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.fileIdRemap['remote/shared.md']).toBe('local/different/shared.md');
		const merged = targetData.markdown.markers['local/different/shared.md'];
		expect(merged).toBeDefined();
		expect(merged!.length).toBe(1);
		expect(merged![0]!.fileId).toBe('local/different/shared.md');
		expect(merged![0]!.codedBy).toBe('human:carla');
	});

	it('emits codebook_diverged when local codebook hash differs', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'x' },
			{ 'shared.md': 'x' },
		);
		// Target has DIFFERENT codebook content (same id, different name)
		targetData.registry.definitions['c1'] = { id: 'c1', name: 'F-changed', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['shared.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'shared.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.conflicts.some(c => c.kind === 'codebook_diverged')).toBe(true);
		expect(result.conflicts.some(c => c.kind === 'code_overwritten')).toBe(true);
		expect(targetData.registry.definitions['c1']!.name).toBe('Frustração'); // incoming wins
	});

	it('counts pending markers when source not found in target', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'unknown.md': 'unknown content' },
			{}, // target vault has no sources
		);
		sourceData.markdown.markers['unknown.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'unknown.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.pendingMarkers).toBe(1);
		expect(result.conflicts.some(c => c.kind === 'source_not_found')).toBe(true);
		expect(Object.keys(targetData.markdown.markers).length).toBe(0);
	});

	it('adds new code to local registry when not present', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'x' },
			{ 'shared.md': 'x' },
		);
		sourceData.markdown.markers['shared.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'shared.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(result.added.codes).toBe(1);
		expect(targetData.registry.definitions['c1']).toBeDefined();
		expect(targetData.registry.rootOrder).toContain('c1');
	});

	it('inserts PDF and CSV markers with remap', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'remote/doc.pdf': 'pdf content', 'remote/data.csv': 'csv content' },
			{ 'local/doc.pdf': 'pdf content', 'local/data.csv': 'csv content' },
		);
		sourceData.pdf.markers.push({
			markerType: 'pdf', id: 'p1', fileId: 'remote/doc.pdf', page: 1,
			beginIndex: 0, beginOffset: 0, endIndex: 50, endOffset: 0,
			text: '...', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		});
		sourceData.csv.segmentMarkers.push({
			markerType: 'csv', id: 's1', fileId: 'remote/data.csv',
			sourceRowId: 0, column: 'r', from: 0, to: 10,
			codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		});
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const result = await mergeCoderContribution(targetData, payload, targetReg);

		expect(targetData.pdf.markers.length).toBe(1);
		expect(targetData.pdf.markers[0]!.fileId).toBe('local/doc.pdf');
		expect(targetData.csv.segmentMarkers.length).toBe(1);
		expect(targetData.csv.segmentMarkers[0]!.fileId).toBe('local/data.csv');
		expect(result.added.markers).toBe(2); // 1 pdf + 1 csv
	});
});

describe('mergeCoderContribution dryRun', () => {
	it('dryRun: true não muta targetData (registries, markers, coders)', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'shared content' },
			{ 'shared.md': 'shared content' },
		);
		sourceData.markdown.markers['shared.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'shared.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

		const beforeCodes = JSON.stringify(targetData.registry.definitions);
		const beforeMarkers = JSON.stringify(targetData.markdown.markers);
		const beforeCoders = JSON.stringify(targetData.coders);

		const result = await mergeCoderContribution(targetData, payload, targetReg, { dryRun: true });

		// Counts ainda computados
		expect(result.added.markers).toBe(1);
		expect(result.added.codes).toBe(1);
		expect(result.added.coder).toBe(true);
		expect(result.fileIdRemap['shared.md']).toBe('shared.md');

		// targetData NÃO mutou
		expect(JSON.stringify(targetData.registry.definitions)).toBe(beforeCodes);
		expect(JSON.stringify(targetData.markdown.markers)).toBe(beforeMarkers);
		expect(JSON.stringify(targetData.coders)).toBe(beforeCoders);
	});

	it('dryRun: false (default) muta normalmente — regression', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'shared content' },
			{ 'shared.md': 'shared content' },
		);
		sourceData.markdown.markers['shared.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'shared.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

		const beforeCodeCount = Object.keys(targetData.registry.definitions).length;
		await mergeCoderContribution(targetData, payload, targetReg);

		expect(Object.keys(targetData.registry.definitions).length).toBeGreaterThan(beforeCodeCount);
	});

	it('dryRun: true não muta com markers PDF + CSV (cobertura todas engines)', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'remote/doc.pdf': 'pdf-content', 'remote/data.csv': 'csv,content\n1,a' },
			{ 'local/doc.pdf': 'pdf-content', 'local/data.csv': 'csv,content\n1,a' },
		);
		sourceData.pdf.markers.push({
			markerType: 'pdf', id: 'pm1', fileId: 'remote/doc.pdf',
			page: 0, beginIndex: 0, endIndex: 5, text: 'hello',
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		} as any);
		sourceData.csv.segmentMarkers.push({
			markerType: 'csv-segment', id: 'sm1', fileId: 'remote/data.csv',
			sourceRowId: 0, column: 'r', from: 0, to: 5,
			codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		} as any);
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

		const beforePdf = targetData.pdf.markers.length;
		const beforeCsv = targetData.csv.segmentMarkers.length;

		const result = await mergeCoderContribution(targetData, payload, targetReg, { dryRun: true });

		expect(targetData.pdf.markers.length).toBe(beforePdf);
		expect(targetData.csv.segmentMarkers.length).toBe(beforeCsv);
		expect(result.added.markers).toBe(2); // contou os 2 mesmo sem mutar
	});
});

describe('mergeCoderContribution overrides', () => {
	it('codebookOverrides[codeId] = "local" skipa overwrite desse code', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'shared' },
			{ 'shared.md': 'shared' },
		);
		// Local tem code com nome OLD
		targetData.registry.definitions['c1'] = { id: 'c1', name: 'OLD-NAME', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		targetData.registry.rootOrder.push('c1');
		// Source tenta renomear pra NEW
		sourceData.registry.definitions['c1'] = { id: 'c1', name: 'NEW-NAME', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['shared.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'shared.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const overrides = createEmptyOverrides();
		overrides.codebookOverrides.set('c1', 'local');

		await mergeCoderContribution(targetData, payload, targetReg, { overrides });

		expect(targetData.registry.definitions['c1']!.name).toBe('OLD-NAME');
	});

	it('codebookOverrides[codeId] = "skip" pra code novo: não adiciona ao registry', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'shared' },
			{ 'shared.md': 'shared' },
		);
		// Source tem code que local não tem
		sourceData.registry.definitions['c999'] = { id: 'c999', name: 'BRAND-NEW', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['shared.md'] = [{
			markerType: 'markdown', id: 'm1', fileId: 'shared.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c999' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		}];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const overrides = createEmptyOverrides();
		overrides.codebookOverrides.set('c999', 'skip');

		await mergeCoderContribution(targetData, payload, targetReg, { overrides });

		expect(targetData.registry.definitions['c999']).toBeUndefined();
	});

	it('sourceOverrides[fid] = "skip-source": markers desse source ficam fora (somam em pendingMarkers)', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'shared' },
			{ 'shared.md': 'shared' },
		);
		sourceData.markdown.markers['shared.md'] = [
			{ markerType: 'markdown', id: 'm1', fileId: 'shared.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
			{ markerType: 'markdown', id: 'm2', fileId: 'shared.md', range: { from: { line: 0, ch: 1 }, to: { line: 0, ch: 2 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
		];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const overrides = createEmptyOverrides();
		overrides.sourceOverrides.set('shared.md', 'skip-source');

		const result = await mergeCoderContribution(targetData, payload, targetReg, { overrides });

		expect(result.added.markers).toBe(0);
		expect(result.pendingMarkers).toBe(2);
		expect(targetData.markdown.markers['shared.md']).toBeUndefined();
	});

	it('perMarkerSkip: skipa marker individual', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'shared' },
			{ 'shared.md': 'shared' },
		);
		sourceData.markdown.markers['shared.md'] = [
			{ markerType: 'markdown', id: 'm1', fileId: 'shared.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
			{ markerType: 'markdown', id: 'm2', fileId: 'shared.md', range: { from: { line: 0, ch: 1 }, to: { line: 0, ch: 2 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
			{ markerType: 'markdown', id: 'm3', fileId: 'shared.md', range: { from: { line: 0, ch: 2 }, to: { line: 0, ch: 3 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
		];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const overrides = createEmptyOverrides();
		overrides.perMarkerSkip.add('m2');

		const result = await mergeCoderContribution(targetData, payload, targetReg, { overrides });

		expect(result.added.markers).toBe(2);
		const ids = (targetData.markdown.markers['shared.md'] ?? []).map(m => m.id);
		expect(ids).toEqual(['m1', 'm3']);
	});

	it('perCodeSkip: skipa todos markers desse code', async () => {
		const { sourceData, targetData, sourceReg, targetReg } = await setup(
			{ 'shared.md': 'shared' },
			{ 'shared.md': 'shared' },
		);
		sourceData.registry.definitions['cX'] = { id: 'cX', name: 'X', color: '#fff', paletteIndex: 1, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['shared.md'] = [
			{ markerType: 'markdown', id: 'm1', fileId: 'shared.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } }, color: '#fff', codes: [{ codeId: 'cX' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
			{ markerType: 'markdown', id: 'm2', fileId: 'shared.md', range: { from: { line: 0, ch: 1 }, to: { line: 0, ch: 2 } }, color: '#fff', codes: [{ codeId: 'cX' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
		];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);
		const overrides = createEmptyOverrides();
		overrides.perCodeSkip.add('cX');

		const result = await mergeCoderContribution(targetData, payload, targetReg, { overrides });

		expect(result.added.markers).toBe(0);
	});

	it('combinação ordem-independente: (skipMarker, skipSource) ou (skipSource, skipMarker)', async () => {
		const { sourceData, targetData: t1, sourceReg, targetReg: r1 } = await setup(
			{ 'shared.md': 'shared' },
			{ 'shared.md': 'shared' },
		);
		const { targetData: t2, targetReg: r2 } = await setup(
			{ 'shared.md': 'shared' },
			{ 'shared.md': 'shared' },
		);
		sourceData.markdown.markers['shared.md'] = [
			{ markerType: 'markdown', id: 'm1', fileId: 'shared.md', range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
			{ markerType: 'markdown', id: 'm2', fileId: 'shared.md', range: { from: { line: 0, ch: 1 }, to: { line: 0, ch: 2 } }, color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:carla', createdAt: 1, updatedAt: 1 },
		];
		const { payload } = await extractCoderContribution(sourceData, 'human:carla', sourceReg);

		const overridesA = createEmptyOverrides();
		overridesA.perMarkerSkip.add('m1');
		overridesA.sourceOverrides.set('shared.md', 'skip-source');

		const overridesB = createEmptyOverrides();
		overridesB.sourceOverrides.set('shared.md', 'skip-source');
		overridesB.perMarkerSkip.add('m1');

		const rA = await mergeCoderContribution(t1, payload, r1, { overrides: overridesA });
		const rB = await mergeCoderContribution(t2, payload, r2, { overrides: overridesB });

		expect(rA.added.markers).toBe(rB.added.markers);
		expect(rA.pendingMarkers).toBe(rB.pendingMarkers);
	});
});
