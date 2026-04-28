import { describe, it, expect } from 'vitest';
import {
	appendEntry,
	hideEntry,
	unhideEntry,
	getEntriesForCode,
	renderEntryMarkdown,
	renderCodeHistoryMarkdown,
	COALESCE_WINDOW_MS,
} from '../../src/core/auditLog';
import type { AuditEntry } from '../../src/core/types';

describe('auditLog — appendEntry', () => {
	it('appends a new entry with auto-generated id when no id provided', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'created' });
		expect(log).toHaveLength(1);
		expect(log[0]!.id).toMatch(/^audit_/);
		expect(log[0]!.codeId).toBe('c1');
	});

	it('preserves explicit id when provided', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { id: 'fixed_id', codeId: 'c1', at: 1000, type: 'created' });
		expect(log[0]!.id).toBe('fixed_id');
	});

	it('coalesces consecutive description_edited within the window', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'description_edited', from: 'a', to: 'ab' });
		appendEntry(log, { codeId: 'c1', at: 5000, type: 'description_edited', from: 'ab', to: 'abc' });
		appendEntry(log, { codeId: 'c1', at: 9000, type: 'description_edited', from: 'abc', to: 'abcd' });
		expect(log).toHaveLength(1);
		const e = log[0] as Extract<AuditEntry, { type: 'description_edited' }>;
		// `from` permanece o original (a), `to` é o último (abcd), `at` é o último (9000)
		expect(e.from).toBe('a');
		expect(e.to).toBe('abcd');
		expect(e.at).toBe(9000);
	});

	it('coalesces memo_edited the same way', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'memo_edited', from: '', to: 'note v1' });
		appendEntry(log, { codeId: 'c1', at: 30_000, type: 'memo_edited', from: 'note v1', to: 'note v2' });
		expect(log).toHaveLength(1);
		expect((log[0] as any).from).toBe('');
		expect((log[0] as any).to).toBe('note v2');
	});

	it('does NOT coalesce after the window expires', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'description_edited', from: 'a', to: 'b' });
		appendEntry(log, { codeId: 'c1', at: 1000 + COALESCE_WINDOW_MS + 1, type: 'description_edited', from: 'b', to: 'c' });
		expect(log).toHaveLength(2);
		expect((log[0] as any).to).toBe('b');
		expect((log[1] as any).to).toBe('c');
	});

	it('does NOT coalesce across different codeIds', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'description_edited', from: '', to: 'x' });
		appendEntry(log, { codeId: 'c2', at: 2000, type: 'description_edited', from: '', to: 'y' });
		expect(log).toHaveLength(2);
	});

	it('does NOT coalesce across different types (description vs memo)', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'description_edited', from: '', to: 'desc' });
		appendEntry(log, { codeId: 'c1', at: 2000, type: 'memo_edited', from: '', to: 'memo' });
		expect(log).toHaveLength(2);
	});

	it('does NOT coalesce non-edit types (renamed, created, etc.)', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'renamed', from: 'a', to: 'b' });
		appendEntry(log, { codeId: 'c1', at: 2000, type: 'renamed', from: 'b', to: 'c' });
		expect(log).toHaveLength(2);
	});

	it('skips hidden entries when looking for coalesce target', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'description_edited', from: '', to: 'old' });
		hideEntry(log, log[0]!.id);
		// Hidden entry shouldn't be coalesced — new edit creates new entry
		appendEntry(log, { codeId: 'c1', at: 5000, type: 'description_edited', from: 'old', to: 'new' });
		expect(log).toHaveLength(2);
		expect(log[0]!.hidden).toBe(true);
		expect(log[1]!.hidden).toBeUndefined();
	});
});

describe('auditLog — hideEntry / unhideEntry', () => {
	it('marks entry as hidden', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { id: 'e1', codeId: 'c1', at: 1000, type: 'created' });
		hideEntry(log, 'e1');
		expect(log[0]!.hidden).toBe(true);
	});

	it('unhide removes the flag', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { id: 'e1', codeId: 'c1', at: 1000, type: 'created' });
		hideEntry(log, 'e1');
		unhideEntry(log, 'e1');
		expect(log[0]!.hidden).toBeUndefined();
	});

	it('hide is idempotent', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { id: 'e1', codeId: 'c1', at: 1000, type: 'created' });
		hideEntry(log, 'e1');
		hideEntry(log, 'e1');
		expect(log[0]!.hidden).toBe(true);
	});

	it('hide on non-existent id is no-op', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { id: 'e1', codeId: 'c1', at: 1000, type: 'created' });
		hideEntry(log, 'unknown');
		expect(log[0]!.hidden).toBeUndefined();
	});
});

describe('auditLog — getEntriesForCode', () => {
	it('filters by codeId and sorts by at ascending', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 3000, type: 'renamed', from: 'b', to: 'c' });
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'created' });
		appendEntry(log, { codeId: 'c2', at: 2000, type: 'created' });
		const result = getEntriesForCode(log, 'c1');
		expect(result).toHaveLength(2);
		expect(result[0]!.at).toBe(1000);
		expect(result[1]!.at).toBe(3000);
	});

	it('excludes hidden entries by default', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { id: 'e1', codeId: 'c1', at: 1000, type: 'created' });
		appendEntry(log, { id: 'e2', codeId: 'c1', at: 2000, type: 'renamed', from: 'a', to: 'b' });
		hideEntry(log, 'e2');
		const result = getEntriesForCode(log, 'c1');
		expect(result).toHaveLength(1);
		expect(result[0]!.id).toBe('e1');
	});

	it('includes hidden when includeHidden=true', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { id: 'e1', codeId: 'c1', at: 1000, type: 'created' });
		appendEntry(log, { id: 'e2', codeId: 'c1', at: 2000, type: 'renamed', from: 'a', to: 'b' });
		hideEntry(log, 'e2');
		const result = getEntriesForCode(log, 'c1', true);
		expect(result).toHaveLength(2);
	});
});

describe('auditLog — renderEntryMarkdown', () => {
	it('renders created', () => {
		const md = renderEntryMarkdown({ id: 'e1', codeId: 'c1', at: 0, type: 'created' });
		expect(md).toContain('Created');
	});

	it('renders renamed with from/to', () => {
		const md = renderEntryMarkdown({ id: 'e1', codeId: 'c1', at: 0, type: 'renamed', from: 'old', to: 'new' });
		expect(md).toContain('"old"');
		expect(md).toContain('"new"');
	});

	it('renders absorbed with multiple names', () => {
		const md = renderEntryMarkdown({
			id: 'e1', codeId: 'c1', at: 0, type: 'absorbed',
			absorbedNames: ['x', 'y'], absorbedIds: ['c2', 'c3'],
		});
		expect(md).toContain('"x"');
		expect(md).toContain('"y"');
	});
});

describe('auditLog — renderCodeHistoryMarkdown', () => {
	it('produces header with code name', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { codeId: 'c1', at: 1000, type: 'created' });
		const md = renderCodeHistoryMarkdown(log, 'c1', 'Wellbeing');
		expect(md).toContain('# History — Wellbeing');
	});

	it('placeholder when no entries', () => {
		const md = renderCodeHistoryMarkdown([], 'c1', 'Empty');
		expect(md).toContain('No history recorded yet');
	});

	it('includes hidden entries in export (export é documento editável; hide é só visual)', () => {
		const log: AuditEntry[] = [];
		appendEntry(log, { id: 'e1', codeId: 'c1', at: 1000, type: 'created' });
		appendEntry(log, { id: 'e2', codeId: 'c1', at: 2000, type: 'renamed', from: 'a', to: 'b' });
		hideEntry(log, 'e2');
		const md = renderCodeHistoryMarkdown(log, 'c1', 'X');
		expect(md).toContain('Created');
		expect(md).toContain('Renamed');
	});
});
