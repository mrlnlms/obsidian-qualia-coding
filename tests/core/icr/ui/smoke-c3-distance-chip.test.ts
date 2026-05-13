/**
 * @vitest-environment jsdom
 *
 * Smoke C3 — chip Distance state visual + badge densidade + integração com coef picker.
 * Cobre cenários do spec §4.4:
 *   1. α + Jaccard sobre escopo multi-label → chip ativo
 *   2. Trocar pra MASI → chip MASI ativo
 *   3. Trocar pra Cohen κ → chip Distance cinza desabilitado, tooltip explica
 *   4. Trocar pra α-binary → chip continua cinza
 *   5. Escopo sem multi-label → chip cinza, badge "0 markers multi-label"
 */

import { describe, it, expect, vi } from 'vitest';
import { renderCoefficientPicker } from '../../../../src/core/icr/ui/coefficientPicker';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';

const noop = () => {};

describe('Smoke C3 — chip Distance + 5 cenários spec §4.4', () => {
	it('cenário 1: α + multi-label → chip Jaccard ativo', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b']),
			primaryCoefficient: 'alpha' as const,
			distance: 'jaccard' as const,
		};
		renderCoefficientPicker(container, state, {
			enginesInScope: ['markdown'],
			multiLabel: { multi: 12, total: 34, pct: 35.29 },
		}, noop, noop);
		const jaccard = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(jaccard.classList.contains('is-active')).toBe(true);
		expect(jaccard.classList.contains('is-disabled')).toBe(false);
	});

	it('cenário 2: trocar pra MASI → MASI ativo, Jaccard inativo', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b']),
			primaryCoefficient: 'alpha' as const,
			distance: 'masi' as const,
		};
		renderCoefficientPicker(container, state, {
			enginesInScope: ['markdown'],
			multiLabel: { multi: 12, total: 34, pct: 35 },
		}, noop, noop);
		const masi = container.querySelector('[data-distance="masi"]') as HTMLElement;
		const jaccard = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(masi.classList.contains('is-active')).toBe(true);
		expect(jaccard.classList.contains('is-active')).toBe(false);
	});

	it('cenário 3: coef = Cohen κ → chip Distance cinza + tooltip explica', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b']),
			primaryCoefficient: 'cohen' as const,
		};
		renderCoefficientPicker(container, state, {
			enginesInScope: ['markdown'],
			multiLabel: { multi: 12, total: 34, pct: 35 },
		}, noop, noop);
		const jaccard = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(jaccard.classList.contains('is-disabled')).toBe(true);
		expect(jaccard.classList.contains('is-active')).toBe(false);
		expect(jaccard.title).toContain('Cohen κ caminho A');
	});

	it('cenário 4: coef = α-binary → chip continua cinza', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b', 'human:c']),
			primaryCoefficient: 'alpha-binary' as const,
		};
		renderCoefficientPicker(container, state, {
			enginesInScope: ['markdown'],
			multiLabel: { multi: 12, total: 34, pct: 35 },
		}, noop, noop);
		const jaccard = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(jaccard.classList.contains('is-disabled')).toBe(true);
	});

	it('cenário 5: escopo sem multi-label → chip cinza, badge "0 markers"', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b']),
			primaryCoefficient: 'alpha' as const,
		};
		renderCoefficientPicker(container, state, {
			enginesInScope: ['markdown'],
			multiLabel: { multi: 0, total: 22, pct: 0 },
		}, noop, noop);
		const jaccard = container.querySelector('[data-distance="jaccard"]') as HTMLElement;
		expect(jaccard.classList.contains('is-disabled')).toBe(true);
		expect(jaccard.title).toContain('single-label');
		const badge = container.querySelector('.qc-cc-multilabel-badge');
		expect(badge?.textContent).toBe('0/22 markers multi-label (0%)');
	});

	it('cenário 5b: total = 0 (escopo vazio) → badge "0 markers no escopo"', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b']),
			primaryCoefficient: 'alpha' as const,
		};
		renderCoefficientPicker(container, state, {
			enginesInScope: ['markdown'],
			multiLabel: { multi: 0, total: 0, pct: 0 },
		}, noop, noop);
		const badge = container.querySelector('.qc-cc-multilabel-badge');
		expect(badge?.textContent).toBe('0 markers no escopo');
	});

	it('click Jaccard dispara onSelectDistance', () => {
		const container = document.createElement('div');
		const state = {
			...createDefaultViewState(['human:a', 'human:b']),
			primaryCoefficient: 'alpha' as const,
			distance: 'masi' as const,
		};
		const onSelectDistance = vi.fn();
		renderCoefficientPicker(container, state, {
			enginesInScope: ['markdown'],
			multiLabel: { multi: 5, total: 10, pct: 50 },
		}, noop, onSelectDistance);
		(container.querySelector('[data-distance="jaccard"]') as HTMLElement).click();
		expect(onSelectDistance).toHaveBeenCalledWith('jaccard');
	});
});
