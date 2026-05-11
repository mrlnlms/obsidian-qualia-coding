import { describe, it, expect } from 'vitest';
import { openReconciliation } from '../../../src/core/icr/reconciliation';
import { findLatestActiveOpenedEntry, getRegionStatus } from '../../../src/core/icr/ui/regionDerivation';
import type { AuditEntry } from '../../../src/core/types';

const region = {
	fileId: 'F.md',
	engine: 'markdown' as const,
	bounds: { kind: 'text' as const, from: 100, to: 200 },
};

describe('openReconciliation', () => {
	it('emite reconciliation_opened com codeId vazio', () => {
		const log: AuditEntry[] = [];
		const result = openReconciliation({
			region,
			coderIds: ['human:a', 'human:b'],
			candidateCodeIds: ['c_x', 'c_y'],
			log,
		});
		expect(result.auditEntryId).toBeTruthy();
		expect(log.length).toBe(1);
		const entry = log[0]!;
		expect(entry.type).toBe('reconciliation_opened');
		expect(entry.codeId).toBe('');
		if (entry.type === 'reconciliation_opened') {
			expect(entry.region).toEqual(region);
			expect(entry.coderIds).toEqual(['human:a', 'human:b']);
			expect(entry.candidateCodeIds).toEqual(['c_x', 'c_y']);
		}
	});

	it('região fica inDiscussion após openReconciliation', () => {
		const log: AuditEntry[] = [];
		openReconciliation({
			region,
			coderIds: ['human:a', 'human:b'],
			candidateCodeIds: ['c_x'],
			log,
		});
		expect(getRegionStatus(region, log)).toBe('inDiscussion');
	});

	it('findLatestActiveOpenedEntry retorna a entry emitida', () => {
		const log: AuditEntry[] = [];
		openReconciliation({
			region,
			coderIds: ['human:a', 'human:b'],
			candidateCodeIds: ['c_x'],
			log,
		});
		const found = findLatestActiveOpenedEntry(region, log);
		expect(found).not.toBeNull();
		expect(found?.coderIds).toEqual(['human:a', 'human:b']);
	});

	it('múltiplos openReconciliation criam entries separadas', () => {
		const log: AuditEntry[] = [];
		openReconciliation({ region, coderIds: ['human:a', 'human:b'], candidateCodeIds: ['c_x'], log });
		openReconciliation({ region, coderIds: ['human:a', 'human:b'], candidateCodeIds: ['c_x', 'c_y'], log });
		expect(log.length).toBe(2);
		// Última vence
		const latest = findLatestActiveOpenedEntry(region, log);
		expect(latest?.candidateCodeIds).toEqual(['c_x', 'c_y']);
	});

	it('ids são únicos entre entries', () => {
		const log: AuditEntry[] = [];
		const r1 = openReconciliation({ region, coderIds: ['human:a', 'human:b'], candidateCodeIds: [], log });
		const r2 = openReconciliation({ region, coderIds: ['human:a', 'human:b'], candidateCodeIds: [], log });
		expect(r1.auditEntryId).not.toBe(r2.auditEntryId);
	});
});
