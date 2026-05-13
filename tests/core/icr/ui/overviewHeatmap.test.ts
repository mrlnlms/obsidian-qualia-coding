import { describe, it, expect, beforeEach } from 'vitest';
import { renderOverviewHeatmap } from '../../../../src/core/icr/ui/overviewHeatmap';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';
import { CodeDefinitionRegistry } from '../../../../src/core/codeDefinitionRegistry';

const noopApp: any = { vault: { getAbstractFileByPath: () => null, cachedRead: async () => '' } };

function emptyEngineModels(): any {
	return {
		markdown: { getAllMarkers: () => [] },
		pdf: { getAllMarkers: () => [], getAllShapes: () => [] },
		csv: { getAllMarkers: () => [] },
		audio: { getAllMarkers: () => [] }, video: { getAllMarkers: () => [] },
		image: { getAllMarkers: () => [] },
	};
}

function makeMd(opts: { id: string; coderId: string; codeId: string; from?: number; to?: number; fileId?: string }): any {
	return {
		markerType: 'markdown', id: opts.id, fileId: opts.fileId ?? 'f.md',
		range: { from: { line: 0, ch: opts.from ?? 0 }, to: { line: 0, ch: opts.to ?? 5 } },
		color: '#888', codes: [{ codeId: opts.codeId }],
		codedBy: opts.coderId, createdAt: 0, updatedAt: 0,
	};
}

function makeShape(opts: { id: string; coderId: string; codeId: string; x?: number; y?: number; w?: number; h?: number; fileId?: string }): any {
	return {
		markerType: 'pdf', id: opts.id, fileId: opts.fileId ?? 'f.pdf', page: 1, shape: 'rect',
		coords: { type: 'rect', x: opts.x ?? 0.1, y: opts.y ?? 0.1, w: opts.w ?? 0.2, h: opts.h ?? 0.2 },
		codes: [{ codeId: opts.codeId }], codedBy: opts.coderId, createdAt: 0, updatedAt: 0,
	};
}

function makeImage(opts: { id: string; coderId: string; codeId: string; x?: number; y?: number; w?: number; h?: number; fileId?: string }): any {
	return {
		markerType: 'image', id: opts.id, fileId: opts.fileId ?? 'f.png', shape: 'rect',
		coords: { type: 'rect', x: opts.x ?? 0.1, y: opts.y ?? 0.1, w: opts.w ?? 0.2, h: opts.h ?? 0.2 },
		codes: [{ codeId: opts.codeId }], codedBy: opts.coderId, createdAt: 0, updatedAt: 0,
	};
}

function modelsWith(opts: { mds?: any[]; shapes?: any[]; imgs?: any[]; app?: any }): any {
	return {
		engineModels: {
			markdown: { getAllMarkers: () => opts.mds ?? [] },
			pdf: { getAllMarkers: () => [], getAllShapes: () => opts.shapes ?? [] },
			csv: { getAllMarkers: () => [] },
			audio: { getAllMarkers: () => [] }, video: { getAllMarkers: () => [] },
			image: { getAllMarkers: () => opts.imgs ?? [] },
		},
		app: opts.app ?? {
			vault: {
				getAbstractFileByPath: () => ({ extension: 'md' }),
				cachedRead: async () => 'Hello world from a test file',
			},
		},
	};
}

describe('renderOverviewHeatmap', () => {
	let container: HTMLElement;
	let coderRegistry: CoderRegistry;
	let codeRegistry: CodeDefinitionRegistry;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		coderRegistry = new CoderRegistry();
		coderRegistry.createHuman('A');
		coderRegistry.createHuman('B');
		codeRegistry = new CodeDefinitionRegistry();
		codeRegistry.create('Frustração', '#c1352e');
		codeRegistry.create('Confiança', '#52b788');
	});

	it('escopo sem códigos mostra empty', async () => {
		const empty = new CodeDefinitionRegistry();
		const state = createDefaultViewState(['human:a', 'human:b']);
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry: empty, engineModels: emptyEngineModels(), app: noopApp,
		}, () => {});
		expect(container.querySelector('.qc-cc-empty')).toBeTruthy();
	});

	it('escopo com 1 coder mostra empty', async () => {
		const state = createDefaultViewState(['human:a']);
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry, engineModels: emptyEngineModels(), app: noopApp,
		}, () => {});
		expect(container.querySelector('.qc-cc-empty')).toBeTruthy();
	});

	it('renderiza grid codes × engines visíveis (default = todas text-likes/temporal/categorical)', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust, codeConf] = codeRegistry.getAll().map(c => c.id);
		const mds = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
			makeMd({ id: 'm3', coderId: coderA, codeId: codeConf, from: 10, to: 15 }),
			makeMd({ id: 'm4', coderId: coderB, codeId: codeConf, from: 10, to: 15 }),
		];
		const state = createDefaultViewState(allCoders);
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry, ...modelsWith({ mds }),
		}, () => {});
		// 6 engines (markdown/pdf/csvSegment/csvRow/audio/video) × 2 codes = 12 cells body
		const bodyTd = container.querySelectorAll('tbody td:not(:first-child)');
		expect(bodyTd.length).toBe(12);
	});

	it('cell vira qc-kappa-na quando code não aparece na engine', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const mds = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
		];
		const state = createDefaultViewState(allCoders);
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry, ...modelsWith({ mds }),
		}, () => {});
		// pdf/csv/audio/video não têm markers de Frustração → todas n/a
		const naCells = container.querySelectorAll('tbody td.qc-kappa-na');
		expect(naCells.length).toBeGreaterThan(0);
		// markdown deve ter cell colorida (não n/a)
		const mdCells = container.querySelectorAll('tbody td[data-engine="markdown"]:not(.qc-kappa-na)');
		expect(mdCells.length).toBeGreaterThan(0);
	});

	it('coluna spatial-bbox aparece quando há bbox markers (mode unified default)', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const shapes = [
			makeShape({ id: 's1', coderId: coderA, codeId: codeFrust }),
			makeShape({ id: 's2', coderId: coderB, codeId: codeFrust }),
		];
		const state = createDefaultViewState(allCoders);
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry, ...modelsWith({ shapes }),
		}, () => {});
		expect(container.querySelector('th[data-engine="spatial-bbox"]')).not.toBeNull();
		expect(container.querySelector('th[data-engine="pdfShape"]')).toBeNull();
	});

	it('split: pdfShape e image como colunas separadas', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const shapes = [
			makeShape({ id: 's1', coderId: coderA, codeId: codeFrust }),
			makeShape({ id: 's2', coderId: coderB, codeId: codeFrust }),
		];
		const imgs = [
			makeImage({ id: 'i1', coderId: coderA, codeId: codeFrust }),
			makeImage({ id: 'i2', coderId: coderB, codeId: codeFrust }),
		];
		const state = {
			...createDefaultViewState(allCoders),
			filters: { hideAgreementTotal: false, highlightConflicts: false, excludeConsensusCoders: false, splitBboxEngines: true } as any,
		};
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry, ...modelsWith({ shapes, imgs }),
		}, () => {});
		expect(container.querySelector('th[data-engine="pdfShape"]')).not.toBeNull();
		expect(container.querySelector('th[data-engine="image"]')).not.toBeNull();
		expect(container.querySelector('th[data-engine="spatial-bbox"]')).toBeNull();
	});

	it('click cell chama onSelect com kind:codeEngine', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const mds = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
		];
		const state = createDefaultViewState(allCoders);
		const calls: any[] = [];
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry, ...modelsWith({ mds }),
		}, sel => calls.push(sel));
		const mdCell = container.querySelector('tbody td[data-engine="markdown"]:not(.qc-kappa-na)') as HTMLElement;
		mdCell.click();
		expect(calls[0]).toMatchObject({ kind: 'codeEngine' });
		expect(calls[0].value).toMatchObject({ codeId: codeFrust, engineId: 'markdown' });
	});

	it('Cohen κ com N=3 coders mostra média dos C(N,2) pares (não vira —)', async () => {
		// Antes: heatmap retornava undefined pra Cohen κ quando N>2 (par indefinido)
		// → todas as cells viravam '—'. Agora: média dos C(N,2) pares, consistente com bbox.
		coderRegistry.createHuman('C');
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB, coderC] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const mds = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
			makeMd({ id: 'm3', coderId: coderC, codeId: codeFrust }),
		];
		const state = {
			...createDefaultViewState(allCoders),
			primaryCoefficient: 'cohen' as const,
		};
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry, ...modelsWith({ mds }),
		}, () => {});
		// Cell markdown deve ter valor numérico (não '—')
		const mdCell = container.querySelector('tbody td[data-engine="markdown"]') as HTMLElement;
		expect(mdCell).toBeTruthy();
		expect(mdCell.classList.contains('qc-kappa-na')).toBe(false);
		expect(mdCell.textContent).not.toBe('—');
		// Valor entre 0 e 1 (3 coders concordando no mesmo trecho)
		const value = parseFloat(mdCell.textContent ?? '');
		expect(value).toBeGreaterThan(0);
		expect(value).toBeLessThanOrEqual(1);
	});

	it('respeita visibleEngineIds do filter (esconde engine off)', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const mds = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
		];
		const state = {
			...createDefaultViewState(allCoders),
			filters: { hideAgreementTotal: false, highlightConflicts: false, excludeConsensusCoders: false, visibleEngineIds: ['markdown'] } as any,
		};
		await renderOverviewHeatmap(container, state, {
			coderRegistry, codeRegistry, ...modelsWith({ mds }),
		}, () => {});
		const headers = container.querySelectorAll('thead th[data-engine]');
		// só markdown
		expect(headers.length).toBe(1);
		expect(headers[0]?.getAttribute('data-engine')).toBe('markdown');
	});
});
