/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CompareCoderCoefficientsModal } from '../../../../src/core/icr/ui/compareCoderCoefficientsModal';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';
import { App } from '../../../mocks/obsidian';

function makeMd(opts: { id: string; coderId: string; codeId: string; from?: number; to?: number }): any {
	return {
		markerType: 'markdown', id: opts.id, fileId: 'f.md',
		range: { from: { line: 0, ch: opts.from ?? 0 }, to: { line: 0, ch: opts.to ?? 5 } },
		color: '#888', codes: [{ codeId: opts.codeId }],
		codedBy: opts.coderId, createdAt: 0, updatedAt: 0,
	};
}

function emptyModels(mds: any[] = []): any {
	return {
		markdown: { getAllMarkers: () => mds },
		pdf: { getAllMarkers: () => [], getAllShapes: () => [] },
		csv: { getAllMarkers: () => [] },
		audio: { getAllMarkers: () => [] }, video: { getAllMarkers: () => [] },
		image: { getAllMarkers: () => [] },
	};
}

const mockApp: any = new App();
mockApp.vault.getAbstractFileByPath = () => ({ extension: 'md' });
mockApp.vault.cachedRead = async () => 'Hello world from a test file';

describe('CompareCoderCoefficientsModal', () => {
	let coderRegistry: CoderRegistry;

	beforeEach(() => {
		coderRegistry = new CoderRegistry();
		coderRegistry.createHuman('A');
		coderRegistry.createHuman('B');
		coderRegistry.createHuman('C');
	});

	function ctxFor(mds: any[]): any {
		return { models: emptyModels(mds), app: mockApp, showNarrative: true, coderRegistry };
	}

	it('estado "all-pairs" lista 1 row aggregate por par', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [a, b, c] = allCoders;
		const mds = [
			makeMd({ id: 'm1', coderId: a, codeId: 'X' }),
			makeMd({ id: 'm2', coderId: b, codeId: 'X' }),
			makeMd({ id: 'm3', coderId: c, codeId: 'X' }),
		];
		const m = new CompareCoderCoefficientsModal(
			mockApp,
			{ coderIds: allCoders },
			ctxFor(mds),
			{ initial: 'all-pairs' },
		);
		await m.onOpen();
		const rows = m.contentEl.querySelectorAll('tbody tr');
		expect(rows.length).toBe(3);
	});

	it('estado "single-pair" filtra por pair selecionado e adiciona breakdown per-engine', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [a, b] = allCoders;
		const mds = [
			makeMd({ id: 'm1', coderId: a, codeId: 'X' }),
			makeMd({ id: 'm2', coderId: b, codeId: 'X' }),
		];
		const m = new CompareCoderCoefficientsModal(
			mockApp,
			{ coderIds: allCoders },
			ctxFor(mds),
			{ initial: 'single-pair', pair: [a, b] },
		);
		await m.onOpen();
		const rows = m.contentEl.querySelectorAll('tbody tr');
		// 1 aggregate + 1 per-engine (markdown só)
		expect(rows.length).toBeGreaterThanOrEqual(2);
	});

	it('exportMarkdown gera tabela com header e linhas', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [a, b] = allCoders;
		const mds = [
			makeMd({ id: 'm1', coderId: a, codeId: 'X' }),
			makeMd({ id: 'm2', coderId: b, codeId: 'X' }),
		];
		const m = new CompareCoderCoefficientsModal(
			mockApp,
			{ coderIds: allCoders },
			ctxFor(mds),
			{ initial: 'all-pairs' },
		);
		await m.onOpen();
		const md = m.exportMarkdown();
		expect(md).toContain('# Coeficientes ICR');
		expect(md).toContain('| par');
		expect(md).toContain('Cohen κ');
		expect(md).toContain('|---|');
	});

	it('header tem toggle entre "par único" e "todos os pares"', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [a, b] = allCoders;
		const m = new CompareCoderCoefficientsModal(
			mockApp,
			{ coderIds: allCoders },
			ctxFor([]),
			{ initial: 'all-pairs' },
		);
		await m.onOpen();
		const toggleChips = m.contentEl.querySelectorAll('.qc-cc-modal-toggle .qc-cc-mode-chip');
		expect(toggleChips.length).toBe(2);
	});

	it('caixa de diagnóstico aparece quando padrão reconhecível em single-pair', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [a, b] = allCoders;
		// Markers que produzem cohen baixo + alpha-binary alto (boundary OK / código diferente):
		// 2 markers no mesmo trecho mas codes diferentes
		const mds = [
			makeMd({ id: 'm1', coderId: a, codeId: 'X' }),
			makeMd({ id: 'm2', coderId: b, codeId: 'Y' }),
		];
		const m = new CompareCoderCoefficientsModal(
			mockApp,
			{ coderIds: allCoders },
			ctxFor(mds),
			{ initial: 'single-pair', pair: [a, b] },
		);
		await m.onOpen();
		// Diagnostic box deve aparecer (algum dos 3 padrões dispara)
		const diag = m.contentEl.querySelector('.qc-cc-modal-diagnostic');
		expect(diag).not.toBeNull();
	});

	it('showNarrative=false esconde diagnóstico mesmo com padrão reconhecível', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const [a, b] = allCoders;
		const mds = [
			makeMd({ id: 'm1', coderId: a, codeId: 'X' }),
			makeMd({ id: 'm2', coderId: b, codeId: 'Y' }),
		];
		const m = new CompareCoderCoefficientsModal(
			mockApp,
			{ coderIds: allCoders },
			{ models: emptyModels(mds), app: mockApp, showNarrative: false, coderRegistry },
			{ initial: 'single-pair', pair: [a, b] },
		);
		await m.onOpen();
		expect(m.contentEl.querySelector('.qc-cc-modal-diagnostic')).toBeNull();
	});

	it('footer tem botões exportar markdown + fechar', async () => {
		const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
		const m = new CompareCoderCoefficientsModal(
			mockApp,
			{ coderIds: allCoders },
			ctxFor([]),
			{ initial: 'all-pairs' },
		);
		await m.onOpen();
		const btns = m.contentEl.querySelectorAll('.qc-cc-modal-footer button');
		expect(btns.length).toBe(2);
	});

	// ─── E3b: toggle pré/pós reconciliação ─────────────────────────

	describe('E3b — pré/pós reconciliação toggle', () => {
		it('toggle pré/pós NÃO aparece quando scope só tem humanos', async () => {
			const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
			const m = new CompareCoderCoefficientsModal(
				mockApp, { coderIds: allCoders }, ctxFor([]), { initial: 'all-pairs' },
			);
			await m.onOpen();
			expect(m.contentEl.querySelector('.qc-cc-modal-prepost')).toBeNull();
		});

		it('toggle pré/pós aparece quando há consensus no scope COM markers', async () => {
			const consensus = coderRegistry.createConsensus('default')!;
			const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
			const consensusMd = [makeMd({ id: 'mc', coderId: consensus.id, codeId: 'X' })];
			const m = new CompareCoderCoefficientsModal(
				mockApp, { coderIds: allCoders }, ctxFor(consensusMd), { initial: 'all-pairs' },
			);
			await m.onOpen();
			const toggle = m.contentEl.querySelector('.qc-cc-modal-prepost');
			expect(toggle).not.toBeNull();
			expect(toggle!.textContent).toContain('pré');
			expect(toggle!.textContent).toContain('pós');
		});

		it('toggle NÃO aparece quando consensus existe no scope mas sem markers', async () => {
			coderRegistry.createConsensus('default');
			const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
			const m = new CompareCoderCoefficientsModal(
				mockApp, { coderIds: allCoders }, ctxFor([]), { initial: 'all-pairs' },
			);
			await m.onOpen();
			expect(m.contentEl.querySelector('.qc-cc-modal-prepost')).toBeNull();
		});

		it('default state é "post" (com consensus)', async () => {
			const consensus = coderRegistry.createConsensus('default')!;
			const allCoders = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
			const consensusMd = [makeMd({ id: 'mc', coderId: consensus.id, codeId: 'X' })];
			const m = new CompareCoderCoefficientsModal(
				mockApp, { coderIds: allCoders }, ctxFor(consensusMd), { initial: 'all-pairs' },
			);
			await m.onOpen();
			const chips = m.contentEl.querySelectorAll('.qc-cc-modal-prepost .qc-cc-mode-chip');
			const activePost = Array.from(chips).find(c =>
				c.classList.contains('is-active') && c.textContent?.includes('pós'),
			);
			expect(activePost).toBeDefined();
		});

		it('banner indica visão pré quando ativa', async () => {
			const consensus = coderRegistry.createConsensus('default')!;
			const humanIds = coderRegistry.getAll().filter(c => c.type === 'human' && c.id !== 'human:default').map(c => c.id);
			const [a, b] = humanIds;
			const mds = [
				makeMd({ id: 'm1', coderId: a, codeId: 'X' }),
				makeMd({ id: 'm2', coderId: b, codeId: 'X' }),
				makeMd({ id: 'mc', coderId: consensus.id, codeId: 'X' }),
			];
			const m = new CompareCoderCoefficientsModal(
				mockApp,
				{ coderIds: [...humanIds, consensus.id] },
				ctxFor(mds),
				{ initial: 'all-pairs' },
			);
			await m.onOpen();
			const preChip = Array.from(m.contentEl.querySelectorAll('.qc-cc-modal-prepost .qc-cc-mode-chip'))
				.find(c => c.textContent?.includes('pré')) as HTMLElement;
			expect(preChip).toBeDefined();
			preChip.click();
			await new Promise(r => setTimeout(r, 50));
			const banner = m.contentEl.querySelector('.qc-cc-modal-prepost-banner');
			expect(banner?.textContent).toContain('pré');
		});

		it('exportMarkdown indica visão pós no header', async () => {
			const consensus = coderRegistry.createConsensus('default')!;
			const humanIds = coderRegistry.getAll().filter(c => c.type === 'human' && c.id !== 'human:default').map(c => c.id);
			const consensusMd = [makeMd({ id: 'mc', coderId: consensus.id, codeId: 'X' })];
			const m = new CompareCoderCoefficientsModal(
				mockApp,
				{ coderIds: [...humanIds, consensus.id] },
				ctxFor(consensusMd),
				{ initial: 'all-pairs' },
			);
			await m.onOpen();
			expect(m.exportMarkdown()).toContain('visão pós');
		});

		it('exportMarkdown não inclui visão quando scope sem consensus', async () => {
			const humanIds = coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
			const m = new CompareCoderCoefficientsModal(
				mockApp, { coderIds: humanIds }, ctxFor([]), { initial: 'all-pairs' },
			);
			await m.onOpen();
			expect(m.exportMarkdown()).not.toContain('visão');
		});
	});
});
