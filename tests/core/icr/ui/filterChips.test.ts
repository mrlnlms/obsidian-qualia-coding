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

	it('renderiza chip por coder + 2 chips de filtro', () => {
		renderFilterChips(container, baseState, { coderRegistry }, () => {});
		const N = coderRegistry.getAll().length;
		const chips = container.querySelectorAll('.qc-cc-filter-chip');
		expect(chips.length).toBe(N + 2);  // N coders + highlight + hide agreement
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
});
