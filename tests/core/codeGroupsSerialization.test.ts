import { describe, it, expect } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { QualiaData } from '../../src/core/types';
import { createDefaultData, GROUP_PALETTE } from '../../src/core/types';

describe('Code Groups serialization', () => {
	it('save → load preserva groups, groupOrder, nextGroupPaletteIndex', () => {
		const r1 = new CodeDefinitionRegistry();
		const c = r1.create('code1');
		const g1 = r1.createGroup('RQ1');
		const g2 = r1.createGroup('RQ2');
		r1.addCodeToGroup(c.id, g1.id);
		r1.setGroupDescription(g2.id, 'Question 2');
		r1.setGroupColor(g2.id, '#123456');  // custom

		const json = r1.toJSON();

		// fromJSON é static, retorna novo registry
		const r2 = CodeDefinitionRegistry.fromJSON(json);

		expect(r2.getAllGroups().length).toBe(2);
		expect(r2.getGroup(g1.id)?.name).toBe('RQ1');
		expect(r2.getGroup(g1.id)?.color).toBe(GROUP_PALETTE[0]);
		expect(r2.getGroup(g1.id)?.paletteIndex).toBe(0);
		expect(r2.getGroup(g2.id)?.description).toBe('Question 2');
		expect(r2.getGroup(g2.id)?.color).toBe('#123456');
		expect(r2.getGroup(g2.id)?.paletteIndex).toBe(-1);
		expect(r2.getGroupOrder()).toEqual([g1.id, g2.id]);
		expect(r2.getById(c.id)?.groups).toEqual([g1.id]);
	});

	it('load de data.json legado (sem groups/groupOrder/nextGroupPaletteIndex) não crasha, inicializa vazio', () => {
		const legacy: QualiaData = createDefaultData();
		// Simula legacy: delete os campos novos
		delete (legacy.registry as any).groups;
		delete (legacy.registry as any).groupOrder;
		delete (legacy.registry as any).nextGroupPaletteIndex;

		let r: CodeDefinitionRegistry;
		expect(() => { r = CodeDefinitionRegistry.fromJSON(legacy.registry); }).not.toThrow();
		expect(r!.getAllGroups()).toEqual([]);
		expect(r!.getGroupOrder()).toEqual([]);
	});
});
