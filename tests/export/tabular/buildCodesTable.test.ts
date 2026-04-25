import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { buildCodesTable, CODES_HEADER } from '../../../src/export/tabular/buildCodesTable';

let reg: CodeDefinitionRegistry;

beforeEach(() => {
	reg = new CodeDefinitionRegistry();
});

describe('buildCodesTable', () => {
	it('returns header + empty body when no codes', () => {
		const rows = buildCodesTable(reg);
		expect(rows[0]).toEqual(CODES_HEADER);
		expect(rows).toHaveLength(1);
	});

	it('emits one row per code with id, name, color, description', () => {
		const def = reg.create('C1', '#ff0000', 'first');
		const rows = buildCodesTable(reg);
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual([def.id, 'C1', '#ff0000', '', 'first', '', '']);
	});

	it('fills parent_id when code has a parent', () => {
		const parent = reg.create('Parent', '#000');
		const child = reg.create('Child', '#111', undefined, parent.id);
		const rows = buildCodesTable(reg);
		const row = rows.find(r => r[0] === child.id)!;
		expect(row[3]).toBe(parent.id);
	});

	it('serializes magnitude_config as JSON', () => {
		const def = reg.create('M', '#000');
		reg.update(def.id, { magnitude: { type: 'continuous', values: ['1', '2', '3'] } });
		const rows = buildCodesTable(reg);
		const r = rows.find(row => row[0] === def.id)!;
		expect(JSON.parse(r[5] as string)).toEqual({ type: 'continuous', values: ['1', '2', '3'] });
	});

	it('leaves magnitude_config empty when code has no magnitude', () => {
		reg.create('Plain', '#000');
		const rows = buildCodesTable(reg);
		expect(rows[1]![5]).toBe('');
	});
});
