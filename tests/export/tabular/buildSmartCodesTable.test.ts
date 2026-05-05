import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { buildSmartCodesCsv } from '../../../src/export/tabular/buildSmartCodesTable';
import type { SmartCodeDefinition } from '../../../src/core/types';

const mkSc = (over: Partial<SmartCodeDefinition> = {}): SmartCodeDefinition => ({
	id: 'sc_1', name: 'X', color: '#abc', paletteIndex: 0, createdAt: 0,
	predicate: { kind: 'hasCode', codeId: 'c_x' },
	...over,
});

describe('buildSmartCodesCsv', () => {
	it('header + 1 row com colunas certas', () => {
		const sc = mkSc({ memo: 'note' });
		const cache = { getMatches: () => Array(7).fill({}) };
		const csv = buildSmartCodesCsv([sc], cache);
		const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
		expect(parsed.data).toEqual([{
			id: 'sc_1', name: 'X', color: '#abc',
			predicate_json: '{"codeId":"c_x","kind":"hasCode"}',
			memo: 'note',
			matches_at_export: '7',
		}]);
	});

	it('escapes RFC 4180 (commas, quotes, newlines)', () => {
		const sc = mkSc({ name: 'A, "B"', memo: 'multi\nline' });
		const csv = buildSmartCodesCsv([sc], { getMatches: () => [] });
		const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
		expect(parsed.data[0]).toMatchObject({ name: 'A, "B"', memo: 'multi\nline' });
	});

	it('memo vazio fica como string vazia', () => {
		const sc = mkSc();
		const csv = buildSmartCodesCsv([sc], { getMatches: () => [] });
		const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
		expect((parsed.data[0] as any).memo).toBe('');
	});

	it('predicate_json é canonical (key order)', () => {
		const sc = mkSc({ predicate: { kind: 'hasCode', codeId: 'c_x' }});
		const csv = buildSmartCodesCsv([sc], { getMatches: () => [] });
		expect(csv).toContain('"{""codeId"":""c_x"",""kind"":""hasCode""}"');
	});
});
