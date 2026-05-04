import { describe, it, expect } from 'vitest';
import { renderEntryMarkdown, getEntriesForSmartCode, getEntriesForCode, appendEntry } from '../../src/core/auditLog';
import type { AuditEntry } from '../../src/core/types';

describe('auditLog smart code entries', () => {
	it('renders sc_created markdown', () => {
		const entry: AuditEntry = { id: 'a1', codeId: 'sc_x', at: 0, entity: 'smartCode', type: 'sc_created' };
		const md = renderEntryMarkdown(entry);
		expect(md).toMatch(/Smart code created/);
	});

	it('renders sc_predicate_edited com leaves diff', () => {
		const entry: AuditEntry = {
			id: 'a1', codeId: 'sc_x', at: 0, entity: 'smartCode',
			type: 'sc_predicate_edited',
			addedLeafKinds: ['hasCode'], removedLeafKinds: ['inFolder'], changedLeafCount: 1,
		};
		expect(renderEntryMarkdown(entry)).toMatch(/predicate.*edited/i);
	});

	it('coalesces sc_predicate_edited dentro de 60s (Set union dos kinds)', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'sc_x', at: 1000, entity: 'smartCode', type: 'sc_predicate_edited', addedLeafKinds: ['hasCode'], removedLeafKinds: [], changedLeafCount: 1 });
		appendEntry(log, { codeId: 'sc_x', at: 30000, entity: 'smartCode', type: 'sc_predicate_edited', addedLeafKinds: ['inFolder'], removedLeafKinds: [], changedLeafCount: 1 });
		expect(log).toHaveLength(1);
		expect((log[0] as any).addedLeafKinds.sort()).toEqual(['hasCode', 'inFolder']);
		expect((log[0] as any).changedLeafCount).toBe(2);
	});

	it('coalesces sc_memo_edited (text edit pattern)', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'sc_x', at: 1000, entity: 'smartCode', type: 'sc_memo_edited', from: '', to: 'a' });
		appendEntry(log, { codeId: 'sc_x', at: 5000, entity: 'smartCode', type: 'sc_memo_edited', from: 'a', to: 'ab' });
		expect(log).toHaveLength(1);
		expect((log[0] as any).to).toBe('ab');
	});

	it('NÃO coalesce entries com entity diferentes', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'x', at: 1000, type: 'memo_edited', from: '', to: 'a' });
		appendEntry(log, { codeId: 'x', at: 5000, entity: 'smartCode', type: 'sc_memo_edited', from: '', to: 'b' });
		expect(log).toHaveLength(2);
	});

	it('getEntriesForSmartCode filtra por entity + codeId', () => {
		const log: AuditEntry[] = [
			{ id: 'a1', codeId: 'c_x', at: 0, type: 'created' },
			{ id: 'a2', codeId: 'sc_x', at: 0, entity: 'smartCode', type: 'sc_created' },
			{ id: 'a3', codeId: 'sc_y', at: 0, entity: 'smartCode', type: 'sc_created' },
		];
		const result = getEntriesForSmartCode(log, 'sc_x');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('a2');
	});

	it('getEntriesForCode exclui smart code entries (entity discriminator)', () => {
		const log: AuditEntry[] = [
			{ id: 'a1', codeId: 'c_x', at: 0, type: 'created' },
			{ id: 'a2', codeId: 'c_x', at: 0, entity: 'smartCode', type: 'sc_created' },  // mesmo codeId mas entity smart
		];
		const result = getEntriesForCode(log, 'c_x');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('a1');
	});
});
