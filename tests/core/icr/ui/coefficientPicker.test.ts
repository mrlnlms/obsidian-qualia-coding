/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderCoefficientPicker } from '../../../../src/core/icr/ui/coefficientPicker';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';

const noMulti = { multi: 0, total: 0, pct: 0 };
const withMulti = { multi: 5, total: 10, pct: 50 };

const noop = () => {};

describe('renderCoefficientPicker — coef chips', () => {
	it('renderiza 5 chips com data-coefficient attr', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b', 'human:c']);
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: noMulti }, noop, noop);
		const chips = container.querySelectorAll('.qc-cc-coef-chip');
		expect(chips.length).toBe(5);
		expect([...chips].map(c => (c as HTMLElement).dataset.coefficient)).toEqual([
			'cohen', 'fleiss', 'alpha', 'alpha-binary', 'cu-alpha',
		]);
	});

	it('chip ativo tem is-active class', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: noMulti }, noop, noop);
		const cohenChip = container.querySelector('[data-coefficient="cohen"]');
		expect(cohenChip?.classList.contains('is-active')).toBe(true);
	});

	it('Fleiss disabled com 2 coders', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: noMulti }, noop, noop);
		const fleissChip = container.querySelector('[data-coefficient="fleiss"]') as HTMLElement;
		expect(fleissChip.classList.contains('is-disabled')).toBe(true);
		expect(fleissChip.title).toContain('Fleiss');
	});

	it('alpha-binary disabled com csvRow puro', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b', 'human:c']);
		renderCoefficientPicker(container, state, { enginesInScope: ['csvRow'], multiLabel: noMulti }, noop, noop);
		const chip = container.querySelector('[data-coefficient="alpha-binary"]') as HTMLElement;
		expect(chip.classList.contains('is-disabled')).toBe(true);
	});

	it('click chip aplicável chama onSelectCoefficient com a key', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b', 'human:c']);
		const onSelect = vi.fn();
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: noMulti }, onSelect, noop);
		(container.querySelector('[data-coefficient="fleiss"]') as HTMLElement).click();
		expect(onSelect).toHaveBeenCalledWith('fleiss');
	});

	it('click chip disabled não chama onSelectCoefficient', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		const onSelect = vi.fn();
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: noMulti }, onSelect, noop);
		(container.querySelector('[data-coefficient="fleiss"]') as HTMLElement).click();
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('chip ativo + is-disabled simultaneamente NÃO acontece (active só se applicable)', () => {
		const container = document.createElement('div');
		const state = { ...createDefaultViewState(['human:a', 'human:b']), primaryCoefficient: 'fleiss' as const };
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: noMulti }, noop, noop);
		const fleissChip = container.querySelector('[data-coefficient="fleiss"]') as HTMLElement;
		expect(fleissChip.classList.contains('is-active')).toBe(false);
		expect(fleissChip.classList.contains('is-disabled')).toBe(true);
	});
});

describe('renderCoefficientPicker — chip Distance', () => {
	it('renderiza Jaccard + MASI chips', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b', 'human:c']);
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: withMulti }, noop, noop);
		const chips = container.querySelectorAll('.qc-cc-distance-chip');
		expect(chips.length).toBe(2);
		expect([...chips].map(c => (c as HTMLElement).dataset.distance)).toEqual(['jaccard', 'masi']);
	});

	it('default Jaccard ativo + α coef + multi-label presente', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b', 'human:c']),
			primaryCoefficient: 'alpha' as const,
		};
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: withMulti }, noop, noop);
		const jaccardChip = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(jaccardChip.classList.contains('is-active')).toBe(true);
		expect(jaccardChip.classList.contains('is-disabled')).toBe(false);
	});

	it('chip disabled quando coef = Cohen κ (caminho A no-op)', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		// primaryCoefficient default = 'cohen'
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: withMulti }, noop, noop);
		const jaccardChip = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(jaccardChip.classList.contains('is-disabled')).toBe(true);
		expect(jaccardChip.title).toContain('Cohen κ caminho A');
	});

	it('chip disabled quando coef = α-binary (no-op pra binary)', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b', 'human:c']),
			primaryCoefficient: 'alpha-binary' as const,
		};
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: withMulti }, noop, noop);
		const jaccardChip = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(jaccardChip.classList.contains('is-disabled')).toBe(true);
	});

	it('chip disabled quando coef = α mas escopo sem multi-label', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b']),
			primaryCoefficient: 'alpha' as const,
		};
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: noMulti }, noop, noop);
		const jaccardChip = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(jaccardChip.classList.contains('is-disabled')).toBe(true);
		expect(jaccardChip.title).toContain('single-label');
	});

	it('click MASI chama onSelectDistance com "masi"', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b']),
			primaryCoefficient: 'alpha' as const,
		};
		const onSelectDistance = vi.fn();
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: withMulti }, noop, onSelectDistance);
		(container.querySelector('[data-distance="masi"]') as HTMLElement).click();
		expect(onSelectDistance).toHaveBeenCalledWith('masi');
	});

	it('click chip Distance disabled não chama callback', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		const onSelectDistance = vi.fn();
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: withMulti }, noop, onSelectDistance);
		(container.querySelector('[data-distance="jaccard"]') as HTMLElement).click();
		expect(onSelectDistance).not.toHaveBeenCalled();
	});
});

describe('renderCoefficientPicker — badge densidade', () => {
	it('renderiza badge com N/Total + %', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: { multi: 12, total: 34, pct: 35.29 } }, noop, noop);
		const badge = container.querySelector('.qc-cc-multilabel-badge');
		expect(badge?.textContent).toBe('12/34 markers multi-label (35%)');
	});

	it('badge mostra "0 markers no escopo" quando total = 0', () => {
		const container = document.createElement('div');
		const state = createDefaultViewState(['human:a', 'human:b']);
		renderCoefficientPicker(container, state, { enginesInScope: ['markdown'], multiLabel: { multi: 0, total: 0, pct: 0 } }, noop, noop);
		const badge = container.querySelector('.qc-cc-multilabel-badge');
		expect(badge?.textContent).toContain('0 markers');
	});
});
