/**
 * Smoke test Slice 3 — cross-vault merge end-to-end.
 *
 * Cenário realista: Carla coda em vault A (paths `remote/...`), exporta payload,
 * Lead absorve em vault B (paths `local/...`). Verifica que markers chegaram no
 * path remapeado por hash + coder/code/group adicionados + zero pending.
 */

import { describe, it, expect } from 'vitest';
import { extractCoderContribution } from '../../../../src/core/icr/transport/extractCoderContribution';
import { mergeCoderContribution } from '../../../../src/core/icr/transport/mergeCoderContribution';
import { SourceHashRegistry } from '../../../../src/core/icr/sourceHashRegistry';
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

describe('Slice 3 smoke — cross-vault merge end-to-end', () => {
	it('extracts from vault A (remote/ paths) and merges into vault B (local/ paths) with full remap', async () => {
		// === SOURCE: Carla coda em vault A ===
		const sourceData = makeData();
		sourceData.coders!.coders.push({ id: 'human:carla', name: 'Carla', type: 'human', createdAt: Date.now() });
		sourceData.registry.definitions['c1'] = {
			id: 'c1', name: 'Frustração', color: '#6200EE',
			paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [],
		};
		sourceData.registry.definitions['c2'] = {
			id: 'c2', name: 'Estratégia', color: '#FF9800',
			paletteIndex: 1, createdAt: 1, updatedAt: 1, childrenOrder: [],
		};
		sourceData.registry.rootOrder.push('c1', 'c2');

		// 3 markers da Carla em 2 arquivos diferentes
		sourceData.markdown.markers['remote/path/E1.md'] = [
			{ markerType: 'markdown', id: 'mc1', fileId: 'remote/path/E1.md',
			  range: { from: { line: 5, ch: 0 }, to: { line: 5, ch: 80 } },
			  color: '#6200EE', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			  createdAt: 1, updatedAt: 1 },
			{ markerType: 'markdown', id: 'mc2', fileId: 'remote/path/E1.md',
			  range: { from: { line: 10, ch: 0 }, to: { line: 10, ch: 100 } },
			  color: '#FF9800', codes: [{ codeId: 'c2' }], codedBy: 'human:carla',
			  createdAt: 1, updatedAt: 1 },
		];
		sourceData.markdown.markers['remote/path/E2.md'] = [
			{ markerType: 'markdown', id: 'mc3', fileId: 'remote/path/E2.md',
			  range: { from: { line: 3, ch: 0 }, to: { line: 3, ch: 60 } },
			  color: '#6200EE', codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			  createdAt: 1, updatedAt: 1 },
		];

		// Hash registry da Carla: 2 sources
		const sourceVault = makeMockVault({
			'remote/path/E1.md': 'entrevista 1 conteúdo',
			'remote/path/E2.md': 'entrevista 2 conteúdo',
		});
		const sourceReg = new SourceHashRegistry(sourceVault);
		await sourceReg.getOrCompute('remote/path/E1.md');
		await sourceReg.getOrCompute('remote/path/E2.md');

		// === EXTRACT ===
		const { payload, warnings: extractWarnings } = await extractCoderContribution(
			sourceData, 'human:carla', sourceReg,
		);

		expect(payload.version).toBe('1.0');
		expect(payload.coder.id).toBe('human:carla');
		expect(payload.codes.map(c => c.id).sort()).toEqual(['c1', 'c2']);
		expect(Object.keys(payload.sources).sort()).toEqual(['remote/path/E1.md', 'remote/path/E2.md']);
		expect(Object.values(payload.markers.markdown).flat().length).toBe(3);
		expect(payload.codebookVersion).toMatch(/^[0-9a-f]{64}$/);
		expect(extractWarnings.length).toBe(0);

		// === TARGET: Lead em vault B com paths `local/...` mas mesmo conteúdo ===
		const targetData = makeData();
		const targetVault = makeMockVault({
			'local/projects/qda/E1.md': 'entrevista 1 conteúdo',  // mesmo conteúdo, path diferente
			'local/projects/qda/E2.md': 'entrevista 2 conteúdo',
		});
		const targetReg = new SourceHashRegistry(targetVault);
		await targetReg.getOrCompute('local/projects/qda/E1.md');
		await targetReg.getOrCompute('local/projects/qda/E2.md');

		// === MERGE ===
		const result = await mergeCoderContribution(targetData, payload, targetReg);

		// Cross-vault remap aplicado em ambos arquivos
		expect(result.fileIdRemap['remote/path/E1.md']).toBe('local/projects/qda/E1.md');
		expect(result.fileIdRemap['remote/path/E2.md']).toBe('local/projects/qda/E2.md');

		// Adições corretas
		expect(result.added.coder).toBe(true);
		expect(result.added.codes).toBe(2);
		expect(result.added.markers).toBe(3);

		// Sem markers pendentes
		expect(result.pendingMarkers).toBe(0);

		// Sem conflicts (codebook bate porque target estava vazio + payload trouxe os 2 codes)
		expect(result.conflicts.filter(c => c.kind === 'source_not_found').length).toBe(0);
		expect(result.conflicts.filter(c => c.kind === 'source_hash_mismatch').length).toBe(0);

		// Target state: coder + codes + markers nos paths locais
		expect(targetData.coders!.coders.find(c => c.id === 'human:carla')).toBeTruthy();
		expect(targetData.registry.definitions['c1']!.name).toBe('Frustração');
		expect(targetData.registry.definitions['c2']!.name).toBe('Estratégia');
		expect(targetData.markdown.markers['local/projects/qda/E1.md']!.length).toBe(2);
		expect(targetData.markdown.markers['local/projects/qda/E2.md']!.length).toBe(1);
		// Cada marker tem fileId remapped
		const allMergedMarkers = Object.values(targetData.markdown.markers).flat();
		for (const m of allMergedMarkers) {
			expect(m.fileId.startsWith('local/projects/qda/')).toBe(true);
			expect(m.codedBy).toBe('human:carla');
		}
	});

	it('handles partial merge — 1 source missing, others remap', async () => {
		const sourceData = makeData();
		sourceData.coders!.coders.push({ id: 'human:joana', name: 'Joana', type: 'human', createdAt: 1 });
		sourceData.registry.definitions['c1'] = { id: 'c1', name: 'C', color: '#fff', paletteIndex: 0, createdAt: 1, updatedAt: 1, childrenOrder: [] };
		sourceData.markdown.markers['remote/A.md'] = [{
			markerType: 'markdown', id: 'mA', fileId: 'remote/A.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:joana',
			createdAt: 1, updatedAt: 1,
		}];
		sourceData.markdown.markers['remote/MISSING.md'] = [{
			markerType: 'markdown', id: 'mMissing', fileId: 'remote/MISSING.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
			color: '#fff', codes: [{ codeId: 'c1' }], codedBy: 'human:joana',
			createdAt: 1, updatedAt: 1,
		}];
		const sourceVault = makeMockVault({
			'remote/A.md': 'shared',
			'remote/MISSING.md': 'unique content nobody else has',
		});
		const sourceReg = new SourceHashRegistry(sourceVault);
		await sourceReg.getOrCompute('remote/A.md');
		await sourceReg.getOrCompute('remote/MISSING.md');

		const { payload } = await extractCoderContribution(sourceData, 'human:joana', sourceReg);

		// Target só tem A (mesmo conteúdo, path diferente). MISSING.md NÃO existe.
		const targetData = makeData();
		const targetVault = makeMockVault({ 'local/A.md': 'shared' });
		const targetReg = new SourceHashRegistry(targetVault);
		await targetReg.getOrCompute('local/A.md');

		const result = await mergeCoderContribution(targetData, payload, targetReg);

		// A foi remapeado, MISSING ficou pending
		expect(result.fileIdRemap['remote/A.md']).toBe('local/A.md');
		expect(result.fileIdRemap['remote/MISSING.md']).toBeUndefined();
		expect(result.pendingMarkers).toBe(1);
		expect(result.added.markers).toBe(1);
		expect(result.conflicts.some(c => c.kind === 'source_not_found' && c.fileId === 'remote/MISSING.md')).toBe(true);
	});
});
