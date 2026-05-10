import { describe, it, expect, vi } from 'vitest';
import { renderByCodeChip, groupMarkersByCode } from '../../../../src/core/icr/contributions/byCodeChip';
import { createEmptyOverrides, type PendingContribution } from '../../../../src/core/icr/contributions/contributionViewTypes';

function makeContrib(markersByCode: Record<string, number>): PendingContribution {
	const allMarkers: any[] = [];
	let i = 0;
	for (const [codeId, count] of Object.entries(markersByCode)) {
		for (let j = 0; j < count; j++) {
			allMarkers.push({ id: `m${i++}`, fileId: 'src', codes: [{ codeId }] });
		}
	}
	return {
		id: 'c1',
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 0,
			coder: { id: 'h:1', name: 'Carla', type: 'human', createdAt: 0 },
			sources: {},
			codes: Object.keys(markersByCode).map(id => ({ id, name: id.toUpperCase(), color: '#fff', paletteIndex: 0, createdAt: 0 } as any)),
			markers: { markdown: { 'src': allMarkers }, pdf: [], csvSegment: [] },
		},
		sourcePath: '',
		mergePreview: { added: { markers: allMarkers.length, codes: 0, groups: 0, coder: false }, conflicts: [], warnings: [], fileIdRemap: { 'src': 'src' }, pendingMarkers: 0 },
		overrides: createEmptyOverrides(),
	};
}

const baseCb = {
	onAcceptAllCode: vi.fn(),
	onSkipAllCode: vi.fn(),
	onRevise: vi.fn(),
};

const emptyCtx = { localCountByCode: {}, overlapCountByCode: {} };

describe('groupMarkersByCode', () => {
	it('agrupa markers por codeId, ordena desc por count', () => {
		const contrib = makeContrib({ 'c1': 47, 'c2': 18, 'c3': 23 });
		const groups = groupMarkersByCode(contrib);
		expect(groups.map(g => g.codeId)).toEqual(['c1', 'c3', 'c2']);
		expect(groups.find(g => g.codeId === 'c1')!.incomingCount).toBe(47);
	});

	it('marker sem codes não aparece em group nenhum', () => {
		const contrib = makeContrib({});
		contrib.payload.markers.markdown = { 'src': [{ id: 'm0', fileId: 'src', codes: [] } as any] };
		const groups = groupMarkersByCode(contrib);
		expect(groups.length).toBe(0);
	});
});

describe('renderByCodeChip', () => {
	it('renderiza um bloco por code', () => {
		const container = document.createElement('div');
		renderByCodeChip(container, makeContrib({ 'c1': 47, 'c2': 18 }), emptyCtx, baseCb);
		const blocks = container.querySelectorAll('.qc-icr-code-block');
		expect(blocks.length).toBe(2);
	});

	it('header usa coder.name dinâmico (não hardcoded "Carla")', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({ 'c1': 47 });
		contrib.payload.coder.name = 'Bruno';
		renderByCodeChip(container, contrib, { localCountByCode: { 'c1': 12 }, overlapCountByCode: { 'c1': 8 } }, baseCb);
		const header = container.querySelector('.qc-icr-code-block-header');
		expect(header?.textContent).toMatch(/Bruno.*47/i);
		expect(header?.textContent).toMatch(/você.*12/i);
		expect(header?.textContent).toMatch(/overlap.*8/i);
	});

	it('code novo (você 0x) marcado', () => {
		const container = document.createElement('div');
		renderByCodeChip(container, makeContrib({ 'c_new': 23 }), emptyCtx, baseCb);
		const block = container.querySelector('.qc-icr-code-block');
		expect(block?.textContent).toMatch(/novo/i);
	});

	it('click "Skip all" invoca onSkipAllCode(codeId)', () => {
		const container = document.createElement('div');
		const onSkipAllCode = vi.fn();
		renderByCodeChip(container, makeContrib({ 'c1': 5 }), emptyCtx, { ...baseCb, onSkipAllCode });
		const skipBtn = Array.from(container.querySelectorAll('button')).find(b => /skip all/i.test(b.textContent ?? '')) as HTMLElement;
		skipBtn.click();
		expect(onSkipAllCode).toHaveBeenCalledWith('c1');
	});

	it('click "Revisar 1-a-1" invoca onRevise(codeId)', () => {
		const container = document.createElement('div');
		const onRevise = vi.fn();
		renderByCodeChip(container, makeContrib({ 'c1': 5 }), emptyCtx, { ...baseCb, onRevise });
		const reviseBtn = Array.from(container.querySelectorAll('button')).find(b => /revisar/i.test(b.textContent ?? '')) as HTMLElement;
		reviseBtn.click();
		expect(onRevise).toHaveBeenCalledWith('c1');
	});

	it('click "Accept all" invoca onAcceptAllCode(codeId)', () => {
		const container = document.createElement('div');
		const onAcceptAllCode = vi.fn();
		renderByCodeChip(container, makeContrib({ 'c1': 5 }), emptyCtx, { ...baseCb, onAcceptAllCode });
		const acceptBtn = Array.from(container.querySelectorAll('button')).find(b => /accept all/i.test(b.textContent ?? '')) as HTMLElement;
		acceptBtn.click();
		expect(onAcceptAllCode).toHaveBeenCalledWith('c1');
	});
});
