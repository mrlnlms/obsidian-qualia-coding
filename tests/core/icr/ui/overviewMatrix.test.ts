import { describe, it, expect, beforeEach } from 'vitest';
import { renderOverviewMatrix } from '../../../../src/core/icr/ui/overviewMatrix';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';

const noopApp: any = {
	vault: {
		getAbstractFileByPath: () => null,
		cachedRead: async () => '',
	},
};

function emptyEngineModels(): any {
	return {
		markdown: { getAllMarkers: () => [] },
		pdf: { getAllMarkers: () => [] },
		csv: { getAllMarkers: () => [] },
		audio: { getAllMarkers: () => [] },
		video: { getAllMarkers: () => [] },
	};
}

describe('renderOverviewMatrix', () => {
	let container: HTMLElement;
	let coderRegistry: CoderRegistry;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		coderRegistry = new CoderRegistry();
		coderRegistry.createHuman('A');
		coderRegistry.createHuman('B');
		coderRegistry.createHuman('C');
	});

	it('renderiza grade N×N (N=4 com default coder + 3 humanos = 16 cells)', async () => {
		const state = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
		await renderOverviewMatrix(container, state, {
			coderRegistry, engineModels: emptyEngineModels(), app: noopApp,
		}, () => {});
		const cells = container.querySelectorAll('.qc-cc-matrix-cell');
		const N = coderRegistry.getAll().length;
		expect(cells.length).toBe(N * N);
	});

	it('diagonal renderiza is-diagonal com "—"', async () => {
		const state = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
		await renderOverviewMatrix(container, state, {
			coderRegistry, engineModels: emptyEngineModels(), app: noopApp,
		}, () => {});
		const diagonal = container.querySelectorAll('.qc-cc-matrix-cell.is-diagonal');
		const N = coderRegistry.getAll().length;
		expect(diagonal.length).toBe(N);
		diagonal.forEach(cell => expect(cell.textContent).toBe('—'));
	});

	it('cells off-diagonal sem markers viram qc-kappa-na', async () => {
		const state = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
		await renderOverviewMatrix(container, state, {
			coderRegistry, engineModels: emptyEngineModels(), app: noopApp,
		}, () => {});
		const offDiag = container.querySelectorAll('.qc-cc-matrix-cell:not(.is-diagonal)');
		offDiag.forEach(cell => {
			expect(cell.classList.contains('qc-kappa-na')).toBe(true);
		});
	});

	it('click em célula off-diagonal dispara onSelect com par', async () => {
		const state = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
		let captured: any = null;
		await renderOverviewMatrix(container, state, {
			coderRegistry, engineModels: emptyEngineModels(), app: noopApp,
		}, sel => {
			captured = sel;
		});
		const offDiag = container.querySelector('.qc-cc-matrix-cell:not(.is-diagonal)') as HTMLElement;
		offDiag.click();
		expect(captured).toMatchObject({ kind: 'pair' });
		expect(captured.value).toHaveLength(2);
	});

	it('escopo com 1 coder mostra prompt "Selecione 2+ coders"', async () => {
		const state = createDefaultViewState(['human:default']);
		await renderOverviewMatrix(container, state, {
			coderRegistry, engineModels: emptyEngineModels(), app: noopApp,
		}, () => {});
		expect(container.querySelector('.qc-cc-empty')).toBeTruthy();
	});

	it('com markers de markdown, célula do par concordante mostra κ alto', async () => {
		const allCoders = coderRegistry.getAll().map(c => c.id);
		const state = createDefaultViewState(allCoders);
		// 2 markers no mesmo trecho codificados pelos primeiros 2 coders
		const [coderA, coderB] = allCoders;
		const markersData = [
			{
				markerType: 'markdown', id: 'm1', fileId: 'f1.md',
				range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
				color: '#888', codes: [{ codeId: 'X' }], codedBy: coderA, createdAt: 0, updatedAt: 0,
			},
			{
				markerType: 'markdown', id: 'm2', fileId: 'f1.md',
				range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
				color: '#888', codes: [{ codeId: 'X' }], codedBy: coderB, createdAt: 0, updatedAt: 0,
			},
		];
		const engineModels: any = {
			markdown: { getAllMarkers: () => markersData },
			pdf: { getAllMarkers: () => [] },
			csv: { getAllMarkers: () => [] },
			audio: { getAllMarkers: () => [] },
			video: { getAllMarkers: () => [] },
		};
		const app: any = {
			vault: {
				getAbstractFileByPath: () => ({ extension: 'md' }),
				cachedRead: async () => 'Hello world from a test file',
			},
		};

		await renderOverviewMatrix(container, state, { coderRegistry, engineModels, app }, () => {});

		// Procura célula do par (coderA, coderB) — deve ter cor de high agreement
		const cells = Array.from(container.querySelectorAll('.qc-cc-matrix-cell:not(.is-diagonal)'));
		const highCells = cells.filter(c =>
			c.classList.contains('qc-kappa-high') || c.classList.contains('qc-kappa-mid-high'),
		);
		expect(highCells.length).toBeGreaterThan(0);
	});
});
