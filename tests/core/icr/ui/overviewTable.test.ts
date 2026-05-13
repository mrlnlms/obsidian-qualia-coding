import { describe, it, expect, beforeEach } from 'vitest';
import { renderOverviewTable } from '../../../../src/core/icr/ui/overviewTable';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';
import { CodeDefinitionRegistry } from '../../../../src/core/codeDefinitionRegistry';

const noopApp: any = {
	vault: { getAbstractFileByPath: () => null, cachedRead: async () => '' },
};

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

function modelsWith(markers: any[], app?: any): any {
	return {
		engineModels: {
			markdown: { getAllMarkers: () => markers },
			pdf: { getAllMarkers: () => [], getAllShapes: () => [] },
			csv: { getAllMarkers: () => [] },
			audio: { getAllMarkers: () => [] }, video: { getAllMarkers: () => [] },
			image: { getAllMarkers: () => [] },
		},
		app: app ?? {
			vault: {
				getAbstractFileByPath: () => ({ extension: 'md' }),
				cachedRead: async () => 'Hello world from a test file',
			},
		},
	};
}

describe('renderOverviewTable', () => {
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

	it('escopo sem códigos mostra empty state', async () => {
		const emptyReg = new CodeDefinitionRegistry();
		const state = createDefaultViewState(['human:a', 'human:b']);
		await renderOverviewTable(container, state, {
			coderRegistry, codeRegistry: emptyReg, engineModels: emptyEngineModels(), app: noopApp,
		}, () => {});
		expect(container.querySelector('.qc-cc-empty')).toBeTruthy();
	});

	it('renderiza 1 linha por código com markers', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const codeIds = codeRegistry.getAll().map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust, codeConf] = codeIds;

		const markers = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
			makeMd({ id: 'm3', coderId: coderA, codeId: codeConf, from: 10, to: 15 }),
			makeMd({ id: 'm4', coderId: coderB, codeId: codeConf, from: 10, to: 15 }),
		];
		const state = createDefaultViewState(allCoders);
		await renderOverviewTable(container, state, {
			coderRegistry, codeRegistry, ...modelsWith(markers),
		}, () => {});
		const rows = container.querySelectorAll('tbody tr');
		expect(rows.length).toBe(2);
	});

	it('com 2 coders, Cohen κ aparece e Fleiss "—"', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const markers = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
		];
		const state = createDefaultViewState(allCoders);
		await renderOverviewTable(container, state, {
			coderRegistry, codeRegistry, ...modelsWith(markers),
		}, () => {});
		const cohenCell = container.querySelector('tbody tr td.col-cohen');
		const fleissCell = container.querySelector('tbody tr td.col-fleiss');
		expect(cohenCell?.textContent).not.toBe('—');
		expect(fleissCell?.textContent).toBe('—');
	});

	it('com 3+ coders, Cohen κ mostra média dos C(N,2) pares (pós-C2: binary-per-label naturalmente agregável)', async () => {
		// Pré-C2 era '—' (auto-switch). Pós-C2 Cohen κ caminho A retorna value escalar por par;
		// média dos pares pra N≥3 é o pattern usado em heatmap/matrix (commit 2b894dd).
		coderRegistry.createHuman('C');
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB, coderC] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const markers = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
			makeMd({ id: 'm3', coderId: coderC, codeId: codeFrust }),
		];
		const state = createDefaultViewState(allCoders);
		await renderOverviewTable(container, state, {
			coderRegistry, codeRegistry, ...modelsWith(markers),
		}, () => {});
		const cohenCell = container.querySelector('tbody tr td.col-cohen');
		const fleissCell = container.querySelector('tbody tr td.col-fleiss');
		expect(cohenCell?.textContent).not.toBe('—');
		// 3 coders concordando no mesmo trecho → Cohen κ entre cada par ≈ 1 → média ≈ 1
		const cohenValue = parseFloat(cohenCell?.textContent ?? '');
		expect(cohenValue).toBeGreaterThan(0);
		expect(cohenValue).toBeLessThanOrEqual(1);
		expect(fleissCell?.textContent).not.toBe('—');
	});

	it('click row chama onSelect com kind:code', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const markers = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
		];
		const state = createDefaultViewState(allCoders);
		const calls: any[] = [];
		await renderOverviewTable(container, state, {
			coderRegistry, codeRegistry, ...modelsWith(markers),
		}, sel => calls.push(sel));
		(container.querySelector('tbody tr') as HTMLElement)?.click();
		expect(calls[0]).toEqual({ kind: 'code', value: codeFrust });
	});

	it('códigos sem markers no escopo NÃO entram na tabela', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		// Só Frustração tem markers; Confiança fica ausente
		const markers = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
		];
		const state = createDefaultViewState(allCoders);
		await renderOverviewTable(container, state, {
			coderRegistry, codeRegistry, ...modelsWith(markers),
		}, () => {});
		const rows = container.querySelectorAll('tbody tr');
		expect(rows.length).toBe(1);
	});

	it('header tem 7 colunas (código + #markers + 5 coeficientes)', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [coderA, coderB] = allCoders;
		const [codeFrust] = codeRegistry.getAll().map(c => c.id);
		const markers = [
			makeMd({ id: 'm1', coderId: coderA, codeId: codeFrust }),
			makeMd({ id: 'm2', coderId: coderB, codeId: codeFrust }),
		];
		const state = createDefaultViewState(allCoders);
		await renderOverviewTable(container, state, {
			coderRegistry, codeRegistry, ...modelsWith(markers),
		}, () => {});
		const ths = container.querySelectorAll('thead th');
		expect(ths.length).toBe(7);
	});
});
