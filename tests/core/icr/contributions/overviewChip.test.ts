import { describe, it, expect, vi } from 'vitest';
import { renderOverviewChip } from '../../../../src/core/icr/contributions/overviewChip';
import { createEmptyOverrides, type PendingContribution } from '../../../../src/core/icr/contributions/contributionViewTypes';
import type { ConflictRecord } from '../../../../src/core/icr/transport/payloadTypes';

function makeContrib(opts: { conflicts?: ConflictRecord[]; pendingMarkers?: number; addedMarkers?: number; markdown?: any }): PendingContribution {
	return {
		id: 'c1',
		payload: {
			version: '1.0', codebookVersion: '', exportedAt: 0,
			coder: { id: 'h:1', name: 'Carla', type: 'human', createdAt: 0 },
			sources: {}, codes: [],
			markers: { markdown: opts.markdown ?? { 'src': new Array(opts.addedMarkers ?? 0).fill({ id: 'm', codes: [] }) }, pdf: [], csvSegment: [] },
		},
		sourcePath: '',
		mergePreview: {
			added: { markers: opts.addedMarkers ?? 0, codes: 0, groups: 0, coder: false },
			conflicts: opts.conflicts ?? [],
			warnings: [], fileIdRemap: {},
			pendingMarkers: opts.pendingMarkers ?? 0,
		},
		overrides: createEmptyOverrides(),
	};
}

const noopCb = { onApply: vi.fn(), onDiscard: vi.fn(), onOverridesChange: vi.fn() };

describe('overviewChip — seção codebook', () => {
	it('sem code_overwritten conflict: seção codebook não aparece', () => {
		const container = document.createElement('div');
		renderOverviewChip(container, makeContrib({}), noopCb);
		expect(container.querySelector('.qc-icr-section-codebook')).toBeNull();
	});

	it('com code_overwritten field=name: row mostra valores antigo/novo + 2 botões', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({
			conflicts: [{ kind: 'code_overwritten', codeId: 'c1', field: 'name', from: 'OLD', to: 'NEW' }],
		});
		renderOverviewChip(container, contrib, noopCb);

		const section = container.querySelector('.qc-icr-section-codebook');
		expect(section).toBeTruthy();
		expect(section!.textContent).toMatch(/OLD/);
		expect(section!.textContent).toMatch(/NEW/);
		const buttons = section!.querySelectorAll('button');
		expect(buttons.length).toBeGreaterThanOrEqual(2);
	});

	it('botão "Manter local" registra override codebookOverrides[id] = "local"', () => {
		const container = document.createElement('div');
		const onOverridesChange = vi.fn();
		const contrib = makeContrib({
			conflicts: [{ kind: 'code_overwritten', codeId: 'c42', field: 'name', from: 'OLD', to: 'NEW' }],
		});
		renderOverviewChip(container, contrib, { ...noopCb, onOverridesChange });

		const localBtn = Array.from(container.querySelectorAll('button')).find(b => /manter local/i.test(b.textContent ?? '')) as HTMLElement;
		expect(localBtn).toBeTruthy();
		localBtn.click();
		const arg = onOverridesChange.mock.calls[0]![0];
		expect(arg.codebookOverrides.get('c42')).toBe('local');
	});

	it('botão "Aceitar Carla" usa coder.name dinâmico (não hardcoded)', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({
			conflicts: [{ kind: 'code_overwritten', codeId: 'c1', field: 'name', from: 'OLD', to: 'NEW' }],
		});
		// Substitui coder name
		contrib.payload.coder.name = 'Bruno';
		renderOverviewChip(container, contrib, noopCb);

		const incomingBtn = Array.from(container.querySelectorAll('button')).find(b => /aceitar bruno/i.test(b.textContent ?? ''));
		expect(incomingBtn).toBeTruthy();
	});
});

describe('overviewChip — seção sources', () => {
	it('source_hash_mismatch: row mostra fileId + 2 botões (trust local / skip)', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({
			conflicts: [{ kind: 'source_hash_mismatch', fileId: 'P03.md', localHash: 'a', payloadHash: 'b' }],
		});
		renderOverviewChip(container, contrib, noopCb);
		const section = container.querySelector('.qc-icr-section-sources');
		expect(section).toBeTruthy();
		expect(section!.textContent).toMatch(/P03\.md/);
		expect(section!.textContent).toMatch(/hash mismatch/i);
	});

	it('source_not_found: row mostra fileId + opção skip', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({
			conflicts: [{ kind: 'source_not_found', fileId: 'P11.md', payloadHash: 'b' }],
		});
		renderOverviewChip(container, contrib, noopCb);
		expect(container.querySelector('.qc-icr-section-sources')!.textContent).toMatch(/P11\.md/);
	});

	it('botão "Skip source" registra override sourceOverrides[fid] = "skip-source"', () => {
		const container = document.createElement('div');
		const onOverridesChange = vi.fn();
		const contrib = makeContrib({
			conflicts: [{ kind: 'source_hash_mismatch', fileId: 'X.md', localHash: 'a', payloadHash: 'b' }],
		});
		renderOverviewChip(container, contrib, { ...noopCb, onOverridesChange });
		const skipBtn = Array.from(container.querySelectorAll('button')).find(b => /skip source/i.test(b.textContent ?? '')) as HTMLElement;
		skipBtn.click();
		const arg = onOverridesChange.mock.calls[0]![0];
		expect(arg.sourceOverrides.get('X.md')).toBe('skip-source');
	});

	it('seção OK aparece sempre, com counts visíveis', () => {
		const container = document.createElement('div');
		renderOverviewChip(container, makeContrib({ addedMarkers: 113 }), noopCb);
		const ok = container.querySelector('.qc-icr-section-ok');
		expect(ok).toBeTruthy();
		expect(ok!.textContent).toMatch(/113/);
	});
});

describe('overviewChip — footer Apply', () => {
	it('footer mostra "Apply (N_in markers — N_out ficam fora)" via divergenceResolver', () => {
		const container = document.createElement('div');
		const contrib = makeContrib({
			markdown: { 'src': [
				...new Array(150).fill({ id: 'm1', codes: [{ codeId: 'c_keep' }] }),
				...new Array(50).fill({ id: 'm2', codes: [{ codeId: 'c_skipped' }] }),
			] },
			addedMarkers: 200,
		});
		contrib.overrides.perCodeSkip.add('c_skipped');
		renderOverviewChip(container, contrib, noopCb);

		const apply = Array.from(container.querySelectorAll('button')).find(b => /apply/i.test(b.textContent ?? ''))!;
		expect(apply.textContent).toMatch(/150/);
		expect(apply.textContent).toMatch(/50/);
	});

	it('subtitle "resolva os N_out pendentes" ausente quando N_out=0', () => {
		const container = document.createElement('div');
		renderOverviewChip(container, makeContrib({ addedMarkers: 200 }), noopCb);
		expect(container.textContent).not.toMatch(/resolva os/i);
	});

	it('click Apply invoca onApply', () => {
		const container = document.createElement('div');
		const onApply = vi.fn();
		renderOverviewChip(container, makeContrib({ addedMarkers: 5 }), { ...noopCb, onApply });
		const apply = Array.from(container.querySelectorAll('button')).find(b => /apply/i.test(b.textContent ?? '')) as HTMLElement;
		apply.click();
		expect(onApply).toHaveBeenCalled();
	});

	it('click Discard invoca onDiscard', () => {
		const container = document.createElement('div');
		const onDiscard = vi.fn();
		renderOverviewChip(container, makeContrib({ addedMarkers: 5 }), { ...noopCb, onDiscard });
		const discard = Array.from(container.querySelectorAll('button')).find(b => /discard/i.test(b.textContent ?? '')) as HTMLElement;
		discard.click();
		expect(onDiscard).toHaveBeenCalled();
	});
});
