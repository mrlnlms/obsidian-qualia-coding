/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderDrilldownWorkflow } from '../../../../src/core/icr/ui/drilldownWorkflow';
import { CoderRegistry } from '../../../../src/core/icr/coderRegistry';
import { CodeDefinitionRegistry } from '../../../../src/core/codeDefinitionRegistry';
import { createDefaultViewState } from '../../../../src/core/icr/ui/compareCodersTypes';
import type { AuditEntry } from '../../../../src/core/types';

function makeMd(opts: { id: string; coderId: string; codeId: string; from?: number; to?: number; fileId?: string }): any {
	return {
		markerType: 'markdown', id: opts.id, fileId: opts.fileId ?? 'F.md',
		range: { from: { line: 0, ch: opts.from ?? 0 }, to: { line: 0, ch: opts.to ?? 50 } },
		color: '#888', codes: [{ codeId: opts.codeId }],
		codedBy: opts.coderId, createdAt: 0, updatedAt: 0,
	};
}

function modelsWith(mds: any[]): any {
	return {
		markdown: { getAllMarkers: () => mds },
		pdf: { getAllMarkers: () => [], getAllShapes: () => [] },
		csv: { getAllMarkers: () => [] },
		audio: { getAllMarkers: () => [] }, video: { getAllMarkers: () => [] },
		image: { getAllMarkers: () => [] },
	};
}

function makeDecided(
	id: string,
	at: number,
	fileId: string,
	from: number,
	to: number,
	kind: 'adopt' | 'split' | 'accept-divergence' = 'adopt',
): AuditEntry {
	const decision = kind === 'adopt'
		? { kind: 'adopt' as const, codeId: 'c_x', mode: 'consensus-marker' as const }
		: kind === 'split'
		? { kind: 'split' as const, newCodeId: 'c_split', mode: 'consensus-marker' as const }
		: { kind: 'accept-divergence' as const };
	return {
		id, codeId: kind === 'split' ? 'c_split' : 'c_x', at,
		entity: 'reconciliation', type: 'reconciliation_decided',
		region: { fileId, engine: 'markdown', bounds: { kind: 'text', from, to } },
		coderIds: ['human:a', 'human:b'],
		decision,
		memoOfReconciliation: 'memo test',
	};
}

function makeOpened(id: string, at: number, fileId: string, from: number, to: number): AuditEntry {
	return {
		id, codeId: '', at,
		entity: 'reconciliation', type: 'reconciliation_opened',
		region: { fileId, engine: 'markdown', bounds: { kind: 'text', from, to } },
		coderIds: ['human:a', 'human:b'],
		candidateCodeIds: ['c_x'],
	};
}

describe('renderDrilldownWorkflow', () => {
	let container: HTMLElement;
	let coderRegistry: CoderRegistry;
	let codeRegistry: CodeDefinitionRegistry;
	let auditLog: AuditEntry[];
	let cbs: { onSetSelection: ReturnType<typeof vi.fn>; onSetDrilldownMode: ReturnType<typeof vi.fn>; onAfterReconciliation: ReturnType<typeof vi.fn> };
	let markerOps: any;

	beforeEach(() => {
		container = document.createElement('div');
		coderRegistry = new CoderRegistry();
		coderRegistry.createHuman('A');
		coderRegistry.createHuman('B');
		codeRegistry = new CodeDefinitionRegistry();
		codeRegistry.create('FooCode', '#abc');
		codeRegistry.create('BarCode', '#def');
		auditLog = [];
		cbs = {
			onSetSelection: vi.fn(),
			onSetDrilldownMode: vi.fn(),
			onAfterReconciliation: vi.fn(),
		};
		markerOps = {
			removeMarker: vi.fn(),
			updateMarker: vi.fn(),
			restoreMarker: vi.fn(),
			createMarker: vi.fn(),
			serializeMarker: vi.fn(),
			findMarkersInRegion: vi.fn(() => []),
		};
	});

	function makeDeps(mds: any[]) {
		return {
			coderRegistry,
			codeRegistry,
			engineModels: modelsWith(mds),
			markerOps,
			auditLog,
			persistAuditLog: vi.fn(),
		};
	}

	function ids() {
		return coderRegistry.getAll().filter(c => c.id !== 'human:default').map(c => c.id);
	}

	it('renderiza 4 colunas mesmo sem regiões', () => {
		const state = createDefaultViewState(ids());
		renderDrilldownWorkflow(container, state, makeDeps([]), cbs);
		const cols = container.querySelectorAll('.qc-cc-workflow-column');
		expect(cols.length).toBe(4);
	});

	it('renderiza header com totals', () => {
		const state = createDefaultViewState(ids());
		renderDrilldownWorkflow(container, state, makeDeps([]), cbs);
		const totals = container.querySelector('.qc-cc-workflow-totals');
		expect(totals?.textContent).toContain('0 abertos');
		expect(totals?.textContent).toContain('0 em discussão');
		expect(totals?.textContent).toContain('0 resolvidos');
		expect(totals?.textContent).toContain('0 divergências');
	});

	it('distribui regiões nas colunas conforme audit log', () => {
		const [a, b] = ids();
		const mds = [
			// Região 1 — open (contestada sem audit)
			makeMd({ id: 'r1a', coderId: a, codeId: 'X', from: 0, to: 50, fileId: 'A.md' }),
			makeMd({ id: 'r1b', coderId: b, codeId: 'Y', from: 10, to: 40, fileId: 'A.md' }),
			// Região 2 — inDiscussion
			makeMd({ id: 'r2a', coderId: a, codeId: 'X', from: 0, to: 50, fileId: 'B.md' }),
			makeMd({ id: 'r2b', coderId: b, codeId: 'Y', from: 10, to: 40, fileId: 'B.md' }),
			// Região 3 — resolved
			makeMd({ id: 'r3a', coderId: a, codeId: 'X', from: 0, to: 50, fileId: 'C.md' }),
			makeMd({ id: 'r3b', coderId: b, codeId: 'Y', from: 10, to: 40, fileId: 'C.md' }),
			// Região 4 — divergence accepted
			makeMd({ id: 'r4a', coderId: a, codeId: 'X', from: 0, to: 50, fileId: 'D.md' }),
			makeMd({ id: 'r4b', coderId: b, codeId: 'Y', from: 10, to: 40, fileId: 'D.md' }),
		];

		// audit entries usam bounds em char offset (line=0 ch=0 → 0, line=0 ch=50 → 50)
		auditLog = [
			makeOpened('o1', 1, 'B.md', 0, 50),
			makeDecided('d1', 2, 'C.md', 0, 50, 'adopt'),
			makeDecided('d2', 3, 'D.md', 0, 50, 'accept-divergence'),
		];

		const state = createDefaultViewState(ids());
		renderDrilldownWorkflow(container, state, { ...makeDeps(mds), auditLog }, cbs);

		const cols = container.querySelectorAll('.qc-cc-workflow-column');
		const cards = (c: Element) => c.querySelectorAll('.qc-cc-workflow-card').length;
		expect(cards(cols[0]!)).toBe(1); // open
		expect(cards(cols[1]!)).toBe(1); // inDiscussion
		expect(cards(cols[2]!)).toBe(1); // resolved
		expect(cards(cols[3]!)).toBe(1); // divergenceAccepted
	});

	it('click em card abre P2 (cards mode + selection)', () => {
		const [a, b] = ids();
		const mds = [
			makeMd({ id: 'r1a', coderId: a, codeId: 'X', from: 0, to: 50 }),
			makeMd({ id: 'r1b', coderId: b, codeId: 'Y', from: 10, to: 40 }),
		];
		const state = createDefaultViewState(ids());
		renderDrilldownWorkflow(container, state, makeDeps(mds), cbs);

		const openBtn = container.querySelector('.qc-cc-workflow-card-open') as HTMLButtonElement;
		openBtn.click();
		expect(cbs.onSetDrilldownMode).toHaveBeenCalledWith('cards');
		expect(cbs.onSetSelection).toHaveBeenCalledTimes(1);
		const sel = cbs.onSetSelection.mock.calls[0]![0];
		expect(sel.kind).toBe('region');
	});

	it('botão Reverter aparece só em Resolvidos / Divergência aceita', () => {
		const [a, b] = ids();
		const mds = [
			makeMd({ id: 'r1a', coderId: a, codeId: 'X', from: 0, to: 50, fileId: 'A.md' }),
			makeMd({ id: 'r1b', coderId: b, codeId: 'Y', from: 10, to: 40, fileId: 'A.md' }),
			makeMd({ id: 'r2a', coderId: a, codeId: 'X', from: 0, to: 50, fileId: 'B.md' }),
			makeMd({ id: 'r2b', coderId: b, codeId: 'Y', from: 10, to: 40, fileId: 'B.md' }),
		];
		auditLog = [makeDecided('d1', 1, 'B.md', 0, 50, 'adopt')];
		const state = createDefaultViewState(ids());
		renderDrilldownWorkflow(container, state, { ...makeDeps(mds), auditLog }, cbs);

		const reverts = container.querySelectorAll('.qc-cc-workflow-card-revert');
		expect(reverts.length).toBe(1); // só o resolvido
	});

	it('header inclui botão de exportar (desabilitado quando sem onExportReport)', () => {
		const state = createDefaultViewState(ids());
		renderDrilldownWorkflow(container, state, makeDeps([]), cbs);
		const btn = container.querySelector('.qc-cc-workflow-export') as HTMLButtonElement;
		expect(btn).not.toBeNull();
		expect(btn.disabled).toBe(true);
	});

	it('exportar habilitado quando onExportReport é passado', () => {
		const state = createDefaultViewState(ids());
		const exportFn = vi.fn();
		renderDrilldownWorkflow(container, state, { ...makeDeps([]), onExportReport: exportFn }, cbs);
		const btn = container.querySelector('.qc-cc-workflow-export') as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
		btn.click();
		expect(exportFn).toHaveBeenCalledTimes(1);
	});

	it('exibe summary de decisão em cards de Resolvidos com nome do code', () => {
		const [a, b] = ids();
		const mds = [
			makeMd({ id: 'r1a', coderId: a, codeId: 'X', from: 0, to: 50 }),
			makeMd({ id: 'r1b', coderId: b, codeId: 'Y', from: 10, to: 40 }),
		];
		// usa codeId real do registry
		const code = codeRegistry.getAll()[0]!;
		const decided = makeDecided('d1', 1, 'F.md', 0, 50, 'adopt');
		// override codeId pra match
		if (decided.type === 'reconciliation_decided' && decided.decision.kind === 'adopt') {
			decided.decision.codeId = code.id;
		}
		auditLog = [decided];
		const state = createDefaultViewState(ids());
		renderDrilldownWorkflow(container, state, { ...makeDeps(mds), auditLog }, cbs);

		const decisionSummary = container.querySelector('.qc-cc-workflow-card-decision');
		expect(decisionSummary?.textContent).toContain('adotou');
		expect(decisionSummary?.textContent).toContain(code.name);
	});
});
