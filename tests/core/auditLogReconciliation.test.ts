import { describe, it, expect } from 'vitest';
import { renderEntryMarkdown, getEntriesForCode, appendEntry } from '../../src/core/auditLog';
import type { AuditEntry, ReconciliationBounds, ReconciliationDecision } from '../../src/core/types';

const TEXT_BOUNDS: ReconciliationBounds = { kind: 'text', from: 100, to: 250 };

function makeOpened(codeId: string, at: number, candidates: string[] = ['c_x']): AuditEntry {
	return {
		id: `a_${at}`,
		codeId,
		at,
		entity: 'reconciliation',
		type: 'reconciliation_opened',
		region: { fileId: 'F1', engine: 'markdown', bounds: TEXT_BOUNDS },
		coderIds: ['human:alice', 'human:bob'],
		candidateCodeIds: candidates,
	};
}

function makeDecided(codeId: string, at: number, decision: ReconciliationDecision, memo = 'memo'): AuditEntry {
	return {
		id: `a_${at}`,
		codeId,
		at,
		entity: 'reconciliation',
		type: 'reconciliation_decided',
		region: { fileId: 'F1', engine: 'markdown', bounds: TEXT_BOUNDS },
		coderIds: ['human:alice', 'human:bob'],
		decision,
		memoOfReconciliation: memo,
		consensusMarkerId: decision.kind === 'adopt' || decision.kind === 'split' ? 'm_consensus' : undefined,
	};
}

function makeReverted(codeId: string, at: number, originalEntryId: string, restored: string[] = []): AuditEntry {
	return {
		id: `a_${at}`,
		codeId,
		at,
		entity: 'reconciliation',
		type: 'reconciliation_reverted',
		originalEntryId,
		restoredMarkerIds: restored,
	};
}

describe('auditLog reconciliation entries', () => {
	describe('renderEntryMarkdown', () => {
		it('renderiza reconciliation_opened com count de coders e bounds', () => {
			const md = renderEntryMarkdown(makeOpened('c_x', 0));
			expect(md).toMatch(/Reconciliation opened/);
			expect(md).toMatch(/2 coders/);
			expect(md).toMatch(/chars 100.*250/);
		});

		it('renderiza reconciliation_decided adopt/consensus-marker', () => {
			const decision: ReconciliationDecision = { kind: 'adopt', codeId: 'c_x', mode: 'consensus-marker' };
			const md = renderEntryMarkdown(makeDecided('c_x', 0, decision));
			expect(md).toMatch(/adopted code c_x/);
			expect(md).toMatch(/consensus marker/);
		});

		it('renderiza reconciliation_decided adopt/overwrite-originals', () => {
			const decision: ReconciliationDecision = { kind: 'adopt', codeId: 'c_x', mode: 'overwrite-originals', preStateSnapshot: [] };
			const md = renderEntryMarkdown(makeDecided('c_x', 0, decision));
			expect(md).toMatch(/overwrite originals/);
		});

		it('renderiza reconciliation_decided split com newCodeId', () => {
			const decision: ReconciliationDecision = { kind: 'split', newCodeId: 'c_new', mode: 'consensus-marker' };
			const md = renderEntryMarkdown(makeDecided('c_new', 0, decision));
			expect(md).toMatch(/split into new code c_new/);
		});

		it('renderiza reconciliation_decided accept-divergence', () => {
			const decision: ReconciliationDecision = { kind: 'accept-divergence' };
			const md = renderEntryMarkdown(makeDecided('c_x', 0, decision));
			expect(md).toMatch(/accept divergence/);
		});

		it('renderiza reconciliation_reverted com originalEntryId e count', () => {
			const md = renderEntryMarkdown(makeReverted('c_x', 0, 'orig_123', ['m_a', 'm_b']));
			expect(md).toMatch(/Reconciliation reverted/);
			expect(md).toMatch(/orig_123/);
			expect(md).toMatch(/restored 2 markers/);
		});

		it('formata bounds csvRow com coluna opcional', () => {
			const entry: AuditEntry = {
				id: 'a1', codeId: 'c_x', at: 0, entity: 'reconciliation', type: 'reconciliation_opened',
				region: { fileId: 'F1', engine: 'csvRow', bounds: { kind: 'csvRow', rowIndex: 42, column: 'response' } },
				coderIds: ['human:alice'],
				candidateCodeIds: [],
			};
			expect(renderEntryMarkdown(entry)).toMatch(/row 42 · response/);
		});

		it('formata bounds temporal', () => {
			const entry: AuditEntry = {
				id: 'a1', codeId: 'c_x', at: 0, entity: 'reconciliation', type: 'reconciliation_opened',
				region: { fileId: 'F1', engine: 'audio', bounds: { kind: 'temporal', fromMs: 1500, toMs: 3200 } },
				coderIds: ['human:alice'],
				candidateCodeIds: [],
			};
			expect(renderEntryMarkdown(entry)).toMatch(/1500ms.*3200ms/);
		});
	});

	describe('getEntriesForCode com reconciliation entries', () => {
		it('inclui reconciliation entries cujo anchor codeId bate', () => {
			const log: AuditEntry[] = [
				{ id: 'a1', codeId: 'c_x', at: 1, type: 'created' },
				makeDecided('c_x', 2, { kind: 'adopt', codeId: 'c_x', mode: 'consensus-marker' }),
				makeDecided('c_y', 3, { kind: 'adopt', codeId: 'c_y', mode: 'consensus-marker' }),
			];
			const entries = getEntriesForCode(log, 'c_x');
			expect(entries).toHaveLength(2);
			expect(entries.map(e => e.type)).toEqual(['created', 'reconciliation_decided']);
		});

		it('exclui reconciliation entries de outros anchor codes', () => {
			const log: AuditEntry[] = [
				makeDecided('c_x', 1, { kind: 'adopt', codeId: 'c_x', mode: 'consensus-marker' }),
				makeDecided('c_y', 2, { kind: 'adopt', codeId: 'c_y', mode: 'consensus-marker' }),
			];
			expect(getEntriesForCode(log, 'c_x')).toHaveLength(1);
			expect(getEntriesForCode(log, 'c_y')).toHaveLength(1);
		});

		it('exclui smart code entries mesmo com codeId compartilhado', () => {
			const log: AuditEntry[] = [
				{ id: 'a1', codeId: 'shared', at: 1, type: 'created' },
				{ id: 'a2', codeId: 'shared', at: 2, entity: 'smartCode', type: 'sc_created' },
				makeDecided('shared', 3, { kind: 'adopt', codeId: 'shared', mode: 'consensus-marker' }),
			];
			const entries = getEntriesForCode(log, 'shared');
			expect(entries.map(e => e.type)).toEqual(['created', 'reconciliation_decided']);
		});

		it('respeita hidden flag pra reconciliation entries', () => {
			const decided = makeDecided('c_x', 1, { kind: 'adopt', codeId: 'c_x', mode: 'consensus-marker' });
			decided.hidden = true;
			const log: AuditEntry[] = [decided];
			expect(getEntriesForCode(log, 'c_x')).toHaveLength(0);
			expect(getEntriesForCode(log, 'c_x', true)).toHaveLength(1);
		});

		it('reconciliation com anchor codeId="" não aparece em nenhuma timeline (accept-divergence sem candidatos)', () => {
			const log: AuditEntry[] = [
				makeDecided('', 1, { kind: 'accept-divergence' }, 'memo'),
			];
			expect(getEntriesForCode(log, 'c_x')).toHaveLength(0);
			expect(getEntriesForCode(log, '')).toHaveLength(1); // ainda recuperável via empty anchor (caso edge — P3 query)
		});
	});

	describe('appendEntry shape contracts', () => {
		it('aceita reconciliation_opened sem coalescing (sempre append)', () => {
			const log: AuditEntry[] = [];
			appendEntry(log, makeOpened('c_x', 1000));
			appendEntry(log, makeOpened('c_x', 2000));
			expect(log).toHaveLength(2);
		});

		it('aceita reconciliation_decided sequencial sem coalescing', () => {
			const log: AuditEntry[] = [];
			const memo1 = 'first';
			const memo2 = 'second';
			appendEntry(log, makeDecided('c_x', 1000, { kind: 'accept-divergence' }, memo1));
			appendEntry(log, makeDecided('c_x', 5000, { kind: 'accept-divergence' }, memo2));
			expect(log).toHaveLength(2);
			expect((log[0] as any).memoOfReconciliation).toBe(memo1);
			expect((log[1] as any).memoOfReconciliation).toBe(memo2);
		});

		it('preserva preStateSnapshot dentro de decision.adopt/overwrite-originals', () => {
			const snapshot = [{
				markerId: 'm1', engine: 'markdown' as const, fileId: 'F1',
				serialized: { id: 'm1', codes: [{ codeId: 'c_old' }], from: 100, to: 200 },
			}];
			const decision: ReconciliationDecision = {
				kind: 'adopt', codeId: 'c_x', mode: 'overwrite-originals',
				preStateSnapshot: snapshot,
			};
			const entry = makeDecided('c_x', 1, decision);
			const log: AuditEntry[] = [];
			appendEntry(log, entry);
			expect(log[0]).toMatchObject(entry);
			const stored = log[0] as Extract<AuditEntry, { type: 'reconciliation_decided' }>;
			expect(stored.decision.kind).toBe('adopt');
			if (stored.decision.kind === 'adopt') {
				expect(stored.decision.preStateSnapshot).toEqual(snapshot);
			}
		});
	});
});
