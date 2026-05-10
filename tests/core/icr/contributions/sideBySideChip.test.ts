import { describe, it, expect, vi } from 'vitest';
import { renderSideBySideChip } from '../../../../src/core/icr/contributions/sideBySideChip';
import { createEmptyOverrides, type PendingContribution } from '../../../../src/core/icr/contributions/contributionViewTypes';

function makeContribWithMarkers(count: number): PendingContribution {
	const markers = Array.from({ length: count }, (_, i) => ({
		id: `m${i}`,
		fileId: 'src_a',
		range: { from: { line: 0, ch: i * 10 }, to: { line: 0, ch: i * 10 + 5 } },
		text: `marker ${i}`,
		codes: [{ codeId: 'c_test' }],
	}));
	return {
		id: 'contrib1',
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 0,
			coder: { id: 'h:1', name: 'Carla', type: 'human', createdAt: 0 },
			sources: { 'src_a': { hash: 'h' } },
			codes: [{ id: 'c_test', name: 'TEST', color: '#fff', paletteIndex: 0, createdAt: 0 } as any],
			markers: { markdown: { 'src_a': markers as any }, pdf: [], csvSegment: [] },
		},
		sourcePath: '',
		mergePreview: { added: { markers: count, codes: 1, groups: 0, coder: false }, conflicts: [], warnings: [], fileIdRemap: { 'src_a': 'src_a' }, pendingMarkers: 0 },
		overrides: createEmptyOverrides(),
	};
}

const baseCb = {
	currentIndex: 0,
	filter: 'all' as const,
	filterCodeId: null,
	onSkipMarker: vi.fn(),
	onNavigate: vi.fn(),
	onFilterChange: vi.fn(),
	onClearCodeFilter: vi.fn(),
};

describe('renderSideBySideChip', () => {
	it('renderiza marker card com texto + code + accept/skip buttons', () => {
		const container = document.createElement('div');
		renderSideBySideChip(container, makeContribWithMarkers(5), { localMarkersByFileId: {} }, baseCb);

		expect(container.querySelector('.qc-icr-marker-card')).toBeTruthy();
		expect(container.textContent).toMatch(/marker 0/);
		expect(container.textContent).toMatch(/TEST/);
		const buttons = container.querySelectorAll('button');
		expect(Array.from(buttons).some(b => /accept/i.test(b.textContent ?? ''))).toBe(true);
		expect(Array.from(buttons).some(b => /skip/i.test(b.textContent ?? ''))).toBe(true);
	});

	it('header mostra "marker 1/5"', () => {
		const container = document.createElement('div');
		renderSideBySideChip(container, makeContribWithMarkers(5), { localMarkersByFileId: {} }, baseCb);
		expect(container.textContent).toMatch(/marker 1\/5/);
	});

	it('click Skip invoca onSkipMarker(markerId)', () => {
		const container = document.createElement('div');
		const onSkipMarker = vi.fn();
		renderSideBySideChip(container, makeContribWithMarkers(3), { localMarkersByFileId: {} }, { ...baseCb, currentIndex: 1, onSkipMarker });
		const skipBtn = Array.from(container.querySelectorAll('button')).find(b => /skip/i.test(b.textContent ?? '')) as HTMLElement;
		skipBtn.click();
		expect(onSkipMarker).toHaveBeenCalledWith('m1');
	});

	it('renderiza local markers que sobrepõem (PDF caso, sem sourceText needed)', () => {
		const container = document.createElement('div');
		const contrib: PendingContribution = {
			id: 'contrib1',
			payload: {
				version: '1.0', codebookVersion: '', exportedAt: 0,
				coder: { id: 'h:1', name: 'Carla', type: 'human', createdAt: 0 },
				sources: { 'doc.pdf': { hash: 'h' } },
				codes: [{ id: 'c_test', name: 'TEST', color: '#fff', paletteIndex: 0, createdAt: 0 } as any],
				markers: {
					markdown: {},
					pdf: [{ id: 'i1', markerType: 'pdf', fileId: 'doc.pdf', page: 0, beginIndex: 100, endIndex: 200, text: 'pdf marker text', codes: [{ codeId: 'c_test' }] } as any],
					csvSegment: [],
				},
			},
			sourcePath: '',
			mergePreview: { added: { markers: 1, codes: 1, groups: 0, coder: false }, conflicts: [], warnings: [], fileIdRemap: { 'doc.pdf': 'doc.pdf' }, pendingMarkers: 0 },
			overrides: createEmptyOverrides(),
		};
		const localMarkers = {
			'doc.pdf': [{ id: 'l_local', fileId: 'doc.pdf', page: 0, beginIndex: 150, endIndex: 250, text: 'local pdf', codes: [{ codeId: 'c_test' }] } as any],
		};
		renderSideBySideChip(container, contrib, { localMarkersByFileId: localMarkers }, baseCb);

		const local = container.querySelector('.qc-icr-marker-side-local');
		expect(local).toBeTruthy();
		expect(local!.textContent).not.toMatch(/sem marker/i);
	});

	it('filter chips: 3 chips (todos / só sobrepondo / só novos)', () => {
		const container = document.createElement('div');
		renderSideBySideChip(container, makeContribWithMarkers(3), { localMarkersByFileId: {} }, baseCb);
		const filterChips = container.querySelectorAll('.qc-icr-filter-chip');
		expect(filterChips.length).toBe(3);
	});

	it('filterCodeId: pill "code: cXXX ✕" visível, click invoca onClearCodeFilter', () => {
		const container = document.createElement('div');
		const onClearCodeFilter = vi.fn();
		renderSideBySideChip(container, makeContribWithMarkers(3), { localMarkersByFileId: {} }, { ...baseCb, filterCodeId: 'c_test', onClearCodeFilter });
		const pill = container.querySelector('.qc-icr-filter-pill') as HTMLElement;
		expect(pill).toBeTruthy();
		expect(pill.textContent).toMatch(/c_test/);
		pill.click();
		expect(onClearCodeFilter).toHaveBeenCalled();
	});

	it('filterCodeId restringe markers ao codeId especificado', () => {
		const container = document.createElement('div');
		const contrib = makeContribWithMarkers(3);
		// 1 dos markers tem code diferente
		(contrib.payload.markers.markdown['src_a']![1] as any).codes = [{ codeId: 'c_other' }];
		renderSideBySideChip(container, contrib, { localMarkersByFileId: {} }, { ...baseCb, filterCodeId: 'c_test' });
		// Header deve mostrar 2/2 (não 1/3) porque c_other foi filtrado
		expect(container.textContent).toMatch(/marker 1\/2/);
	});
});
