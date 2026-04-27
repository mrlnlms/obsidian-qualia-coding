import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { buildGroupsTable, GROUPS_HEADER } from '../../../src/export/tabular/buildGroupsTable';

let reg: CodeDefinitionRegistry;

beforeEach(() => {
	reg = new CodeDefinitionRegistry();
});

describe('buildGroupsTable', () => {
	it('returns header + empty body when no groups', () => {
		const rows = buildGroupsTable(reg);
		expect(rows[0]).toEqual(GROUPS_HEADER);
		expect(rows).toHaveLength(1);
	});

	it('emits one row per group', () => {
		const g = reg.createGroup('Theme');
		reg.setGroupDescription(g.id, 'theme description');
		const rows = buildGroupsTable(reg);
		expect(rows).toHaveLength(2);
		const row = rows[1]!;
		expect(row[0]).toBe(g.id);
		expect(row[1]).toBe('Theme');
		expect(row[3]).toBe('theme description');
	});

	it('memo column populated when group has memo', () => {
		const g = reg.createGroup('Theme');
		reg.setGroupMemo(g.id, 'group memo');
		const rows = buildGroupsTable(reg);
		const memoIdx = GROUPS_HEADER.indexOf('memo');
		expect(rows[1]![memoIdx]).toBe('group memo');
	});

	it('memo column empty when group has no memo', () => {
		reg.createGroup('Plain');
		const rows = buildGroupsTable(reg);
		const memoIdx = GROUPS_HEADER.indexOf('memo');
		expect(rows[1]![memoIdx]).toBe('');
	});
});
