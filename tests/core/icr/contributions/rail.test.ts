import { describe, it, expect, vi } from 'vitest';
import { renderRailContent } from '../../../../src/core/icr/contributions/rail';
import { createEmptyOverrides, type PendingContribution } from '../../../../src/core/icr/contributions/contributionViewTypes';

function makeContribution(id: string, coderName: string, markerCount: number, conflicts: number): PendingContribution {
	return {
		id,
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 0,
			coder: { id: `h:${id}`, name: coderName, type: 'human', createdAt: 0 },
			sources: {}, codes: [],
			markers: { markdown: {}, pdf: [], csvSegment: [] },
		},
		sourcePath: `/tmp/${id}.json`,
		mergePreview: {
			added: { markers: markerCount, codes: 0, groups: 0, coder: false },
			conflicts: Array(conflicts).fill({ kind: 'codebook_diverged', localHash: 'a', payloadHash: 'b' }) as any,
			warnings: [], fileIdRemap: {}, pendingMarkers: 0,
		},
		overrides: createEmptyOverrides(),
	};
}

describe('renderRailContent', () => {
	it('estado vazio: mostra label "Pending (0)" + drop zone full-height', () => {
		const container = document.createElement('div');
		renderRailContent(container, [], null, () => {});

		expect(container.textContent).toMatch(/Pending \(0\)/);
		expect(container.querySelector('.qc-icr-rail-drop')).toBeTruthy();
		expect(container.querySelector('.qc-icr-rail-item')).toBeNull();
	});

	it('com 3 contribuições: 3 items + drop zone compact', () => {
		const container = document.createElement('div');
		const contribs = [
			makeContribution('1', 'Carla', 200, 2),
			makeContribution('2', 'Bruno', 87, 0),
			makeContribution('3', 'llm:gpt-4', 450, 1),
		];
		renderRailContent(container, contribs, '1', () => {});

		expect(container.textContent).toMatch(/Pending \(3\)/);
		const items = container.querySelectorAll('.qc-icr-rail-item');
		expect(items.length).toBe(3);
		expect(items[0]!.classList.contains('is-active')).toBe(true);
		expect(items[1]!.classList.contains('is-active')).toBe(false);
	});

	it('item mostra meta com count + badge de conflicts se >0', () => {
		const container = document.createElement('div');
		renderRailContent(container, [makeContribution('1', 'Carla', 200, 2)], '1', () => {});

		const item = container.querySelector('.qc-icr-rail-item')!;
		expect(item.textContent).toMatch(/Carla/);
		expect(item.textContent).toMatch(/200/);
		expect(item.querySelector('.qc-icr-rail-badge')).toBeTruthy();
	});

	it('item sem conflicts: sem badge', () => {
		const container = document.createElement('div');
		renderRailContent(container, [makeContribution('1', 'Bruno', 50, 0)], '1', () => {});

		const item = container.querySelector('.qc-icr-rail-item')!;
		expect(item.querySelector('.qc-icr-rail-badge')).toBeNull();
	});

	it('click em item invoca onSelect com id', () => {
		const container = document.createElement('div');
		const onSelect = vi.fn();
		renderRailContent(container, [makeContribution('1', 'Carla', 200, 0), makeContribution('2', 'Bruno', 50, 0)], '1', onSelect);

		const items = container.querySelectorAll('.qc-icr-rail-item');
		(items[1] as HTMLElement).click();
		expect(onSelect).toHaveBeenCalledWith('2');
	});
});
