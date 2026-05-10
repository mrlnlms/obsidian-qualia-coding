import { describe, it, expect, beforeEach } from 'vitest';
import { renderDrilldownSpatial } from '../../../../src/core/icr/ui/drilldownSpatial';
import { createDefaultViewState, type CompareCodersViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';
import { CodeDefinitionRegistry } from '../../../../src/core/codeDefinitionRegistry';

function emptyEngineModels(): any {
	return {
		markdown: { getAllMarkers: () => [] },
		pdf: { getAllMarkers: () => [] },
		csv: { getAllMarkers: () => [] },
		audio: { getAllMarkers: () => [] },
		video: { getAllMarkers: () => [] },
	};
}

function makeMarkdownMarker(opts: { fileId: string; codedBy: string; codeId: string }): any {
	return {
		markerType: 'markdown',
		id: `m-${Math.random().toString(36).slice(2)}`,
		fileId: opts.fileId,
		range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } },
		color: '#888',
		codes: [{ codeId: opts.codeId }],
		codedBy: opts.codedBy,
		createdAt: 0,
		updatedAt: 0,
	};
}

describe('renderDrilldownSpatial', () => {
	let container: HTMLElement;
	let coderRegistry: CoderRegistry;
	let codeRegistry: CodeDefinitionRegistry;
	let baseState: CompareCodersViewState;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		coderRegistry = new CoderRegistry();
		coderRegistry.createHuman('A');
		coderRegistry.createHuman('B');
		codeRegistry = new CodeDefinitionRegistry();
		codeRegistry.create({ name: 'theme1', color: '#ff0000' });
		baseState = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
	});

	it('mostra prompt quando currentSelection.kind === "none"', () => {
		renderDrilldownSpatial(container, baseState, {
			coderRegistry, codeRegistry, engineModels: emptyEngineModels(),
		});
		expect(container.querySelector('.qc-cc-drilldown-empty')).toBeTruthy();
		expect(container.textContent).toContain('Selecione');
	});

	it('renderiza pergunta visível com #1 e #2', () => {
		renderDrilldownSpatial(container, baseState, {
			coderRegistry, codeRegistry, engineModels: emptyEngineModels(),
		});
		expect(container.textContent).toContain('onde');
		expect(container.textContent).toContain('tipo');
	});

	it('com seleção pair sem markers no escopo, mostra "nenhum arquivo"', () => {
		const state: CompareCodersViewState = {
			...baseState,
			currentSelection: { kind: 'pair', value: ['human:A', 'human:B'] },
		};
		renderDrilldownSpatial(container, state, {
			coderRegistry, codeRegistry, engineModels: emptyEngineModels(),
		});
		expect(container.querySelector('.qc-cc-drilldown-empty')).toBeTruthy();
		expect(container.textContent?.toLowerCase()).toContain('nenhum');
	});

	it('com seleção pair + markdown markers do par, lista file e renderiza lanes', () => {
		const allCoders = coderRegistry.getAll().map(c => c.id);
		const [coderA, coderB] = allCoders;
		const models = emptyEngineModels();
		models.markdown.getAllMarkers = () => [
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: coderA, codeId: 'theme1' }),
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: coderB, codeId: 'theme1' }),
		];
		const codeId = codeRegistry.getAll()[0]!.id;
		// Replace with real codeId from registry
		models.markdown.getAllMarkers = () => [
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: coderA, codeId }),
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: coderB, codeId }),
		];
		const state: CompareCodersViewState = {
			...baseState,
			currentSelection: { kind: 'pair', value: [coderA, coderB] },
		};
		renderDrilldownSpatial(container, state, { coderRegistry, codeRegistry, engineModels: models });
		expect(container.querySelector('.qc-cc-drilldown-file')).toBeTruthy();
		expect(container.querySelectorAll('.qc-cc-lane').length).toBeGreaterThanOrEqual(2);
	});

	it('lane vazia mostra "—" quando coder não tem markers naquele file', () => {
		const allCoders = coderRegistry.getAll().map(c => c.id);
		const [coderA, coderB] = allCoders;
		const codeId = codeRegistry.getAll()[0]!.id;
		const models = emptyEngineModels();
		models.markdown.getAllMarkers = () => [
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: coderA, codeId }),
			// Sem marker do coderB no f1.md
		];
		const state: CompareCodersViewState = {
			...baseState,
			currentSelection: { kind: 'pair', value: [coderA, coderB] },
		};
		renderDrilldownSpatial(container, state, { coderRegistry, codeRegistry, engineModels: models });
		const empties = container.querySelectorAll('.qc-cc-lane-empty');
		expect(empties.length).toBeGreaterThan(0);
	});

	it('csvRow renderiza hint apontando pra abrir CSV view', () => {
		const allCoders = coderRegistry.getAll().map(c => c.id);
		const [coderA, coderB] = allCoders;
		const codeId = codeRegistry.getAll()[0]!.id;
		const models = emptyEngineModels();
		models.csv.getAllMarkers = () => [
			{
				markerType: 'csv', id: 'r1', fileId: 'f.csv',
				sourceRowId: 1, column: 'col1',
				codes: [{ codeId }], codedBy: coderA,
				createdAt: 0, updatedAt: 0,
			},
		];
		const state: CompareCodersViewState = {
			...baseState,
			currentSelection: { kind: 'pair', value: [coderA, coderB] },
		};
		renderDrilldownSpatial(container, state, { coderRegistry, codeRegistry, engineModels: models });
		expect(container.querySelector('.qc-cc-csv-row-hint')).toBeTruthy();
	});

	it('com filters.visibleCoderIds setado, esconde lanes de coders fora do filtro', () => {
		const allCoders = coderRegistry.getAll().map(c => c.id);
		const [coderA, coderB] = allCoders;
		const codeId = codeRegistry.getAll()[0]!.id;
		const models = emptyEngineModels();
		models.markdown.getAllMarkers = () => [
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: coderA, codeId }),
			makeMarkdownMarker({ fileId: 'f1.md', codedBy: coderB, codeId }),
		];
		const state: CompareCodersViewState = {
			...baseState,
			currentSelection: { kind: 'pair', value: [coderA, coderB] },
			filters: { ...baseState.filters, visibleCoderIds: [coderA] },  // só A visível
		};
		renderDrilldownSpatial(container, state, { coderRegistry, codeRegistry, engineModels: models });
		const lanes = container.querySelectorAll('.qc-cc-lane');
		expect(lanes.length).toBe(1);
	});
});
