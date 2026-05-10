/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderCoefficientPicker } from '../../../../src/core/icr/ui/coefficientPicker';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';

describe('renderCoefficientPicker', () => {
	it('renderiza 5 chips com data-coefficient attr', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b', 'human:c']);
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'] }, () => {});
		const chips = container.querySelectorAll('.qc-cc-coef-chip');
		expect(chips.length).toBe(5);
		expect([...chips].map(c => (c as HTMLElement).dataset.coefficient)).toEqual([
			'cohen', 'fleiss', 'alpha', 'alpha-binary', 'cu-alpha',
		]);
	});

	it('chip ativo tem is-active class', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		// default primaryCoefficient = 'cohen'
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'] }, () => {});
		const cohenChip = container.querySelector('[data-coefficient="cohen"]');
		expect(cohenChip?.classList.contains('is-active')).toBe(true);
	});

	it('Fleiss disabled com 2 coders', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'] }, () => {});
		const fleissChip = container.querySelector('[data-coefficient="fleiss"]') as HTMLElement;
		expect(fleissChip.classList.contains('is-disabled')).toBe(true);
		expect(fleissChip.title).toContain('Fleiss');
	});

	it('alpha-binary disabled com csvRow puro', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b', 'human:c']);
		renderCoefficientPicker(container, state, { enginesInScope: ['csvRow'] }, () => {});
		const chip = container.querySelector('[data-coefficient="alpha-binary"]') as HTMLElement;
		expect(chip.classList.contains('is-disabled')).toBe(true);
	});

	it('click chip aplicável chama onSelect com a key', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b', 'human:c']);
		const onSelect = vi.fn();
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'] }, onSelect);
		(container.querySelector('[data-coefficient="fleiss"]') as HTMLElement).click();
		expect(onSelect).toHaveBeenCalledWith('fleiss');
	});

	it('click chip disabled não chama onSelect', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		const onSelect = vi.fn();
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'] }, onSelect);
		(container.querySelector('[data-coefficient="fleiss"]') as HTMLElement).click();
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('chip ativo + is-disabled simultaneamente NÃO acontece (active só se applicable)', () => {
		const container = document.createElement('div');
		const state = { ...createDefaultViewState(['human:a', 'human:b']), primaryCoefficient: 'fleiss' as const };
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'] }, () => {});
		const fleissChip = container.querySelector('[data-coefficient="fleiss"]') as HTMLElement;
		expect(fleissChip.classList.contains('is-active')).toBe(false);
		expect(fleissChip.classList.contains('is-disabled')).toBe(true);
	});
});
