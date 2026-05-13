import { describe, it, expect, beforeEach } from 'vitest';
import { renderFilterChips } from '../../../../src/core/icr/ui/filterChips';
import { createDefaultViewState, type CompareCodersViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';

describe('renderFilterChips', () => {
	let container: HTMLElement;
	let coderRegistry: CoderRegistry;
	let baseState: CompareCodersViewState;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		coderRegistry = new CoderRegistry();
		coderRegistry.createHuman('A');
		coderRegistry.createHuman('B');
		baseState = createDefaultViewState(coderRegistry.getAll().map(c => c.id));
	});

	it('renderiza chip por coder + 6 engines + 4 toggles (highlight + hide + splitBbox + includeEmpty)', () => {
		renderFilterChips(container, baseState, { coderRegistry }, () => {});
		const N = coderRegistry.getAll().length;
		const chips = container.querySelectorAll('.qc-cc-filter-chip');
		expect(chips.length).toBe(N + 6 + 4);
	});

	it('chip de coder começa com is-active quando visibleCoderIds undefined', () => {
		renderFilterChips(container, baseState, { coderRegistry }, () => {});
		const coderChips = container.querySelectorAll('.qc-cc-coder-chip');
		coderChips.forEach(chip => {
			expect(chip.classList.contains('is-active')).toBe(true);
		});
	});

	it('click em coder chip dispara onUpdate com visibleCoderIds reduzido', () => {
		const updates: Partial<CompareCodersViewState>[] = [];
		renderFilterChips(container, baseState, { coderRegistry }, p => updates.push(p));
		const firstCoder = baseState.scope.coderIds[0]!;
		const chips = Array.from(container.querySelectorAll<HTMLElement>('.qc-cc-coder-chip'));
		const chip = chips.find(c => c.dataset.coderId === firstCoder)!;
		chip.click();
		expect(updates).toHaveLength(1);
		const visible = updates[0]!.filters!.visibleCoderIds!;
		expect(visible).not.toContain(firstCoder);
	});

	it('click em chip "destacar conflitos" toggle highlightConflicts', () => {
		const updates: Partial<CompareCodersViewState>[] = [];
		renderFilterChips(container, baseState, { coderRegistry }, p => updates.push(p));
		const chip = container.querySelector('[data-filter="highlight-conflicts"]') as HTMLElement;
		chip.click();
		expect(updates[0]!.filters!.highlightConflicts).toBe(true);
	});

	it('click em chip "esconder agreement total" toggle hideAgreementTotal', () => {
		const updates: Partial<CompareCodersViewState>[] = [];
		renderFilterChips(container, baseState, { coderRegistry }, p => updates.push(p));
		const chip = container.querySelector('[data-filter="hide-agreement"]') as HTMLElement;
		chip.click();
		expect(updates[0]!.filters!.hideAgreementTotal).toBe(true);
	});

	it('engine chips começam ativos quando visibleEngineIds undefined', () => {
		renderFilterChips(container, baseState, { coderRegistry }, () => {});
		const engineChips = container.querySelectorAll('.qc-cc-engine-chip');
		expect(engineChips.length).toBe(6);
		engineChips.forEach(c => expect(c.classList.contains('is-active')).toBe(true));
	});

	it('click em engine chip remove engine de visibleEngineIds', () => {
		const updates: Partial<CompareCodersViewState>[] = [];
		renderFilterChips(container, baseState, { coderRegistry }, p => updates.push(p));
		const csvChip = container.querySelector('[data-engine-id="csvRow"]') as HTMLElement;
		csvChip.click();
		expect(updates[0]!.filters!.visibleEngineIds).not.toContain('csvRow');
		expect(updates[0]!.filters!.visibleEngineIds).toContain('markdown');
	});

	it('click em engine inactive readiciona engine', () => {
		const updates: Partial<CompareCodersViewState>[] = [];
		const stateWithoutCsv = {
			...baseState,
			filters: { ...baseState.filters, visibleEngineIds: ['markdown', 'pdf'] as any },
		};
		renderFilterChips(container, stateWithoutCsv, { coderRegistry }, p => updates.push(p));
		const csvChip = container.querySelector('[data-engine-id="csvRow"]') as HTMLElement;
		expect(csvChip.classList.contains('is-active')).toBe(false);
		csvChip.click();
		expect(updates[0]!.filters!.visibleEngineIds).toContain('csvRow');
	});

	it('click em chip "split bbox engines" toggle splitBboxEngines', () => {
		const updates: Partial<CompareCodersViewState>[] = [];
		renderFilterChips(container, baseState, { coderRegistry }, p => updates.push(p));
		const chip = container.querySelector('[data-filter="split-bbox"]') as HTMLElement;
		chip.click();
		expect(updates[0]!.filters!.splitBboxEngines).toBe(true);
	});

	it('click em chip "incluir coders sem markers" toggle includeCodersWithoutMarkers', () => {
		const updates: Partial<CompareCodersViewState>[] = [];
		renderFilterChips(container, baseState, { coderRegistry }, p => updates.push(p));
		const chip = container.querySelector('[data-filter="include-empty-coders"]') as HTMLElement;
		chip.click();
		expect(updates[0]!.filters!.includeCodersWithoutMarkers).toBe(true);
	});

	it('coder sem markers + filter off → is-empty + is-no-markers + sufixo "· 0"', () => {
		const coderA = baseState.scope.coderIds[0]!;
		const coderB = baseState.scope.coderIds[1]!;
		const codersWithMarkers = new Set([coderA]);
		renderFilterChips(container, baseState, { coderRegistry, codersWithMarkers }, () => {});

		const chipB = container.querySelector(`[data-coder-id="${coderB}"]`) as HTMLElement;
		expect(chipB.classList.contains('is-empty')).toBe(true);
		expect(chipB.classList.contains('is-no-markers')).toBe(true);
		expect(chipB.textContent).toContain('· 0');
		expect(chipB.title).toContain('Habilite o filter');

		const chipA = container.querySelector(`[data-coder-id="${coderA}"]`) as HTMLElement;
		expect(chipA.classList.contains('is-empty')).toBe(false);
		expect(chipA.classList.contains('is-no-markers')).toBe(false);
		expect(chipA.textContent).not.toContain('· 0');
	});

	it('coder sem markers + filter on → is-no-markers sem is-empty, sem sufixo "· 0"', () => {
		const coderB = baseState.scope.coderIds[1]!;
		const codersWithMarkers = new Set([baseState.scope.coderIds[0]!]);
		const stateWithFilter: CompareCodersViewState = {
			...baseState,
			filters: { ...baseState.filters, includeCodersWithoutMarkers: true },
		};
		renderFilterChips(container, stateWithFilter, { coderRegistry, codersWithMarkers }, () => {});

		const chipB = container.querySelector(`[data-coder-id="${coderB}"]`) as HTMLElement;
		expect(chipB.classList.contains('is-empty')).toBe(false);
		expect(chipB.classList.contains('is-no-markers')).toBe(true);
		expect(chipB.textContent).not.toContain('· 0');
		expect(chipB.title).toContain('incluído pelo filter');
	});

	it('coder com markers → sem is-empty nem is-no-markers, sem sufixo', () => {
		const coderA = baseState.scope.coderIds[0]!;
		const codersWithMarkers = new Set([coderA, baseState.scope.coderIds[1]!]);
		renderFilterChips(container, baseState, { coderRegistry, codersWithMarkers }, () => {});

		const chipA = container.querySelector(`[data-coder-id="${coderA}"]`) as HTMLElement;
		expect(chipA.classList.contains('is-empty')).toBe(false);
		expect(chipA.classList.contains('is-no-markers')).toBe(false);
		expect(chipA.textContent).not.toContain('· 0');
		expect(chipA.title).toBe('');
	});
});
