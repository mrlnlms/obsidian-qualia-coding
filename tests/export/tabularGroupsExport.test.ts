import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildCodesTable, CODES_HEADER } from '../../src/export/tabular/buildCodesTable';
import { buildGroupsTable, GROUPS_HEADER } from '../../src/export/tabular/buildGroupsTable';

describe('Tabular export — Groups', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	describe('codes.csv — coluna groups', () => {
		it('inclui coluna "groups" no header', () => {
			expect(CODES_HEADER).toContain('groups');
		});

		it('valor da coluna groups é ";"-separated com nomes dos groups', () => {
			const c = registry.create('c1');
			const g1 = registry.createGroup('RQ1');
			const g2 = registry.createGroup('Wave1');
			registry.addCodeToGroup(c.id, g1.id);
			registry.addCodeToGroup(c.id, g2.id);

			const rows = buildCodesTable(registry);
			const dataRow = rows[1]!;
			const groupsColIdx = CODES_HEADER.indexOf('groups');
			expect(dataRow[groupsColIdx]).toBe('RQ1;Wave1');
		});

		it('valor vazio quando código não tem groups', () => {
			registry.create('c1');
			const rows = buildCodesTable(registry);
			const groupsColIdx = CODES_HEADER.indexOf('groups');
			expect(rows[1]![groupsColIdx]).toBe('');
		});
	});

	describe('groups.csv standalone', () => {
		it('header correto', () => {
			expect(GROUPS_HEADER).toEqual(['id', 'name', 'color', 'description', 'memo']);
		});

		it('1 linha por group com metadata', () => {
			const g = registry.createGroup('RQ1');
			registry.setGroupDescription(g.id, 'Research Q1');
			const rows = buildGroupsTable(registry);
			expect(rows.length).toBe(2);
			expect(rows[1]).toEqual([g.id, 'RQ1', g.color, 'Research Q1', '']);
		});

		it('description vazio quando undefined', () => {
			registry.createGroup('RQ1');
			const rows = buildGroupsTable(registry);
			expect(rows[1]![3]).toBe('');
		});

		it('header-only quando não há groups', () => {
			const rows = buildGroupsTable(registry);
			expect(rows.length).toBe(1);
			expect(rows[0]).toEqual(GROUPS_HEADER);
		});
	});
});
