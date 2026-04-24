import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { GROUP_PALETTE } from '../../src/core/types';

describe('CodeDefinitionRegistry — Groups CRUD', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	describe('createGroup', () => {
		it('cria group com id estável (g_XX), cor auto-atribuída do palette e adiciona ao groupOrder', () => {
			const g = registry.createGroup('RQ1');
			expect(g.id).toMatch(/^g_[a-z0-9]+$/);
			expect(g.name).toBe('RQ1');
			expect(g.color).toBe(GROUP_PALETTE[0]);
			expect(g.paletteIndex).toBe(0);
			expect(g.description).toBeUndefined();
			expect(registry.getGroupOrder()).toEqual([g.id]);
		});

		it('auto-atribui cores em round-robin do GROUP_PALETTE', () => {
			const colors: string[] = [];
			for (let i = 0; i < 10; i++) {
				colors.push(registry.createGroup(`G${i}`).color);
			}
			expect(colors[0]).toBe(GROUP_PALETTE[0]);
			expect(colors[7]).toBe(GROUP_PALETTE[7]);
			expect(colors[8]).toBe(GROUP_PALETTE[0]);  // wrap
			expect(colors[9]).toBe(GROUP_PALETTE[1]);
		});
	});

	describe('renameGroup', () => {
		it('altera name atomicamente mantendo id estável', () => {
			const g = registry.createGroup('RQ1');
			const ok = registry.renameGroup(g.id, 'Research Question 1');
			expect(ok).toBe(true);
			expect(registry.getGroup(g.id)?.name).toBe('Research Question 1');
		});

		it('retorna false pra id inexistente', () => {
			expect(registry.renameGroup('g_999', 'foo')).toBe(false);
		});
	});

	describe('deleteGroup', () => {
		it('remove group de definitions, groupOrder, e do code.groups[] de todos os códigos membros', () => {
			const c1 = registry.create('code1');
			const c2 = registry.create('code2');
			const g = registry.createGroup('RQ1');
			registry.addCodeToGroup(c1.id, g.id);
			registry.addCodeToGroup(c2.id, g.id);

			const ok = registry.deleteGroup(g.id);
			expect(ok).toBe(true);
			expect(registry.getGroup(g.id)).toBeNull();
			expect(registry.getGroupOrder()).toEqual([]);
			expect(registry.getById(c1.id)?.groups ?? []).toEqual([]);
			expect(registry.getById(c2.id)?.groups ?? []).toEqual([]);
		});

		it('nunca deleta códigos (apenas membership)', () => {
			const c1 = registry.create('code1');
			const g = registry.createGroup('RQ1');
			registry.addCodeToGroup(c1.id, g.id);
			registry.deleteGroup(g.id);
			expect(registry.getById(c1.id)).toBeDefined();
		});
	});

	describe('addCodeToGroup idempotency', () => {
		it('chamar 2x com mesmo (code, group) não duplica membership', () => {
			const c = registry.create('c');
			const g = registry.createGroup('RQ1');
			registry.addCodeToGroup(c.id, g.id);
			registry.addCodeToGroup(c.id, g.id);
			expect(registry.getById(c.id)?.groups).toEqual([g.id]);
		});
	});

	describe('removeCodeFromGroup', () => {
		it('remove membership existente', () => {
			const c = registry.create('c');
			const g = registry.createGroup('RQ1');
			registry.addCodeToGroup(c.id, g.id);
			registry.removeCodeFromGroup(c.id, g.id);
			expect(registry.getById(c.id)?.groups).toBeUndefined();
		});

		it('no-op quando código não é membro (sem throw, sem fire listener)', () => {
			const c = registry.create('c');
			const g = registry.createGroup('RQ1');
			let fires = 0;
			registry.addOnMutate(() => fires++);
			fires = 0;  // reset após create listeners
			registry.removeCodeFromGroup(c.id, g.id);
			expect(fires).toBe(0);
		});
	});

	describe('queries', () => {
		it('getCodesInGroup retorna só códigos membros', () => {
			const c1 = registry.create('c1');
			registry.create('c2');
			const c3 = registry.create('c3');
			const g = registry.createGroup('RQ1');
			registry.addCodeToGroup(c1.id, g.id);
			registry.addCodeToGroup(c3.id, g.id);
			const members = registry.getCodesInGroup(g.id);
			expect(members.map(c => c.id).sort()).toEqual([c1.id, c3.id].sort());
		});

		it('getGroupsForCode retorna só groups do código', () => {
			const c = registry.create('c');
			const g1 = registry.createGroup('RQ1');
			registry.createGroup('RQ2');
			const g3 = registry.createGroup('Wave1');
			registry.addCodeToGroup(c.id, g1.id);
			registry.addCodeToGroup(c.id, g3.id);
			const groups = registry.getGroupsForCode(c.id);
			expect(groups.map(g => g.id).sort()).toEqual([g1.id, g3.id].sort());
		});

		it('getGroupMemberCount retorna número de códigos membros', () => {
			const g = registry.createGroup('RQ1');
			expect(registry.getGroupMemberCount(g.id)).toBe(0);
			const c1 = registry.create('c1');
			const c2 = registry.create('c2');
			registry.addCodeToGroup(c1.id, g.id);
			registry.addCodeToGroup(c2.id, g.id);
			expect(registry.getGroupMemberCount(g.id)).toBe(2);
		});
	});

	describe('setGroupColor', () => {
		it('atualiza paletteIndex quando cor matchea palette', () => {
			const g = registry.createGroup('RQ1');
			registry.setGroupColor(g.id, GROUP_PALETTE[3]!);
			expect(registry.getGroup(g.id)?.color).toBe(GROUP_PALETTE[3]);
			expect(registry.getGroup(g.id)?.paletteIndex).toBe(3);
		});

		it('seta paletteIndex = -1 quando cor é custom (fora do palette)', () => {
			const g = registry.createGroup('RQ1');
			registry.setGroupColor(g.id, '#123456');
			expect(registry.getGroup(g.id)?.color).toBe('#123456');
			expect(registry.getGroup(g.id)?.paletteIndex).toBe(-1);
		});

		it('match case-insensitive contra GROUP_PALETTE (color picker pode emitir lowercase)', () => {
			const g = registry.createGroup('RQ1');
			registry.setGroupColor(g.id, GROUP_PALETTE[3]!.toLowerCase());
			expect(registry.getGroup(g.id)?.paletteIndex).toBe(3);
		});
	});

	describe('setGroupOrder', () => {
		it('reordena groups mantendo apenas ids existentes', () => {
			const g1 = registry.createGroup('A');
			const g2 = registry.createGroup('B');
			const g3 = registry.createGroup('C');
			registry.setGroupOrder([g3.id, g1.id, g2.id]);
			expect(registry.getGroupOrder()).toEqual([g3.id, g1.id, g2.id]);
		});

		it('ignora ids inexistentes sem crashar; preserva os válidos', () => {
			const g1 = registry.createGroup('A');
			const g2 = registry.createGroup('B');
			registry.setGroupOrder([g2.id, 'g_nonexistent', g1.id]);
			expect(registry.getGroupOrder()).toEqual([g2.id, g1.id]);
		});
	});

	describe('setGroupDescription', () => {
		it('seta e remove description', () => {
			const g = registry.createGroup('RQ1');
			registry.setGroupDescription(g.id, 'Research question 1');
			expect(registry.getGroup(g.id)?.description).toBe('Research question 1');
			registry.setGroupDescription(g.id, undefined);
			expect(registry.getGroup(g.id)?.description).toBeUndefined();
		});
	});

	describe('nextGroupPaletteIndex preservation', () => {
		it('NUNCA decrementa no deleteGroup (pattern do nextPaletteIndex dos códigos)', () => {
			const g1 = registry.createGroup('A');  // index 0
			const g2 = registry.createGroup('B');  // index 1
			registry.createGroup('C');             // index 2
			registry.deleteGroup(g1.id);
			registry.deleteGroup(g2.id);
			const g4 = registry.createGroup('D');
			expect(g4.color).toBe(GROUP_PALETTE[3 % GROUP_PALETTE.length]);
		});
	});
});
