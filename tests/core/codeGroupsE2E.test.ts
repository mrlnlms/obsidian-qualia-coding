import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { GROUP_PALETTE } from '../../src/core/types';
import { executeMerge } from '../../src/core/mergeModal';
import { buildCodesTable, CODES_HEADER } from '../../src/export/tabular/buildCodesTable';
import { buildGroupsTable } from '../../src/export/tabular/buildGroupsTable';
import { renderGroupsFilter } from '../../src/analytics/views/configSections';

describe('Code Groups — end-to-end fluxo programático', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('fluxo completo: registry com 11 groups → edit color → merge union → tabular export → analytics dropdown', () => {
		// 1. Setup: 11 groups (dispara dropdown threshold no Analytics filter)
		const groups: ReturnType<typeof registry.createGroup>[] = [];
		for (let i = 0; i < 11; i++) groups.push(registry.createGroup(`G${i}`));

		// 2. Setup: 3 códigos com membership cruzada
		const target = registry.create('target');
		const source = registry.create('source');
		const orphan = registry.create('orphan');

		registry.addCodeToGroup(target.id, groups[0]!.id);
		registry.addCodeToGroup(target.id, groups[1]!.id);
		registry.addCodeToGroup(source.id, groups[1]!.id);   // overlap
		registry.addCodeToGroup(source.id, groups[2]!.id);
		registry.addCodeToGroup(orphan.id, groups[10]!.id);

		// 3. Edit color do G0 (substitui pela cor 5 do palette + custom)
		registry.setGroupColor(groups[0]!.id, GROUP_PALETTE[5]!);
		expect(registry.getGroup(groups[0]!.id)?.paletteIndex).toBe(5);

		registry.setGroupColor(groups[1]!.id, '#abcdef');
		expect(registry.getGroup(groups[1]!.id)?.paletteIndex).toBe(-1);

		// 4. Merge: target ← source (target herda union dos groups)
		executeMerge({
			destinationId: target.id,
			sourceIds: [source.id],
			registry,
			markers: [],
			nameChoice: { kind: 'target' },
			colorChoice: { kind: 'target' },
			descriptionPolicy: { kind: 'keep-target' },
			memoPolicy: { kind: 'keep-target' },
		});
		const finalTarget = registry.getById(target.id)!;
		expect(finalTarget.groups?.sort()).toEqual([groups[0]!.id, groups[1]!.id, groups[2]!.id].sort());
		expect(registry.getById(source.id)).toBeUndefined();

		// 5. Tabular export — codes.csv coluna groups + groups.csv standalone
		const codesRows = buildCodesTable(registry);
		const groupsColIdx = CODES_HEADER.indexOf('groups');
		const targetRow = codesRows.find(r => r[0] === target.id)!;
		// target tem 3 groups (union pós-merge)
		expect((targetRow[groupsColIdx] as string).split(';').sort()).toEqual(['G0', 'G1', 'G2'].sort());

		const orphanRow = codesRows.find(r => r[0] === orphan.id)!;
		expect(orphanRow[groupsColIdx]).toBe('G10');

		const groupsRows = buildGroupsTable(registry);
		expect(groupsRows.length).toBe(12);  // header + 11 groups
		const g0Row = groupsRows.find(r => r[0] === groups[0]!.id)!;
		expect(g0Row[2]).toBe(GROUP_PALETTE[5]);  // cor atualizada via setGroupColor

		// 6. Analytics filter UI — 11 groups dispara dropdown fallback (>10)
		const container = document.createElement('div');
		document.body.appendChild(container);
		try {
			renderGroupsFilter(container, registry, { filter: null }, () => {});
			expect(container.querySelectorAll('.codemarker-analytics-group-chip').length).toBe(0);
			const select = container.querySelector('select');
			expect(select).toBeTruthy();
			expect(select!.options.length).toBe(12);  // "— none —" + 11 groups
		} finally {
			container.remove();
		}
	});
});
