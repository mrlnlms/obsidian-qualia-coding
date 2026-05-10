import { describe, it, expect, vi } from 'vitest';
import { renderToolbarContent } from '../../../../src/core/icr/contributions/importToolbar';
import { createEmptyOverrides, type PendingContribution, type ChipId } from '../../../../src/core/icr/contributions/contributionViewTypes';

function makeContrib(coderName: string): PendingContribution {
	return {
		id: 'c1',
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 1700000000000,
			coder: { id: 'h:1', name: coderName, type: 'human', createdAt: 0 },
			sources: {}, codes: [],
			markers: { markdown: { 'src': new Array(200).fill({ id: 'm', codes: [] }) }, pdf: [], csvSegment: [] },
		},
		sourcePath: '/tmp/c.json',
		mergePreview: { added: { markers: 200, codes: 0, groups: 0, coder: false }, conflicts: [], warnings: [], fileIdRemap: {}, pendingMarkers: 0 },
		overrides: createEmptyOverrides(),
	};
}

describe('renderToolbarContent', () => {
	it('renderiza 3 chips', () => {
		const container = document.createElement('div');
		renderToolbarContent(container, makeContrib('Carla'), 'overview', () => {});
		const chips = container.querySelectorAll('.qc-cc-mode-chip');
		expect(chips.length).toBe(3);
	});

	it('chip ativo recebe is-active', () => {
		const container = document.createElement('div');
		renderToolbarContent(container, makeContrib('Carla'), 'side-by-side', () => {});
		const chips = container.querySelectorAll('.qc-cc-mode-chip');
		expect(chips[0]!.classList.contains('is-active')).toBe(false);
		expect(chips[1]!.classList.contains('is-active')).toBe(true);
		expect(chips[2]!.classList.contains('is-active')).toBe(false);
	});

	it('sub-pergunta muda conforme chip ativo', () => {
		for (const [chip, expected] of [
			['overview', /batch como um todo/i],
			['side-by-side', /accept.*skip.*marker/i],
			['by-code', /qual código.*divergindo/i],
		] as Array<[ChipId, RegExp]>) {
			const container = document.createElement('div');
			renderToolbarContent(container, makeContrib('Carla'), chip, () => {});
			const q = container.querySelector('.qc-icr-toolbar-question');
			expect(q?.textContent).toMatch(expected);
		}
	});

	it('meta header mostra coder name + count', () => {
		const container = document.createElement('div');
		renderToolbarContent(container, makeContrib('Carla'), 'overview', () => {});
		const meta = container.querySelector('.qc-icr-toolbar-meta');
		expect(meta?.textContent).toMatch(/Carla/);
		expect(meta?.textContent).toMatch(/200/);
	});

	it('click em chip invoca onChipChange', () => {
		const container = document.createElement('div');
		const onChange = vi.fn();
		renderToolbarContent(container, makeContrib('Carla'), 'overview', onChange);
		const chips = container.querySelectorAll('.qc-cc-mode-chip');
		(chips[1] as HTMLElement).click();
		expect(onChange).toHaveBeenCalledWith('side-by-side');
	});
});
