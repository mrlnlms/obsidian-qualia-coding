import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { getAddToGroupCandidates } from '../../src/core/codeGroupsAddPicker';

describe('getAddToGroupCandidates', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('retorna todos groups quando código não é membro de nenhum', () => {
		const c = registry.create('c1');
		const g1 = registry.createGroup('RQ1');
		const g2 = registry.createGroup('RQ2');
		const result = getAddToGroupCandidates(c.id, registry);
		expect(result.map(g => g.id).sort()).toEqual([g1.id, g2.id].sort());
	});

	it('exclui groups dos quais o código já é membro', () => {
		const c = registry.create('c1');
		const g1 = registry.createGroup('RQ1');
		const g2 = registry.createGroup('RQ2');
		registry.addCodeToGroup(c.id, g1.id);
		const result = getAddToGroupCandidates(c.id, registry);
		expect(result.map(g => g.id)).toEqual([g2.id]);
	});

	it('retorna lista vazia quando não há groups', () => {
		const c = registry.create('c1');
		expect(getAddToGroupCandidates(c.id, registry)).toEqual([]);
	});
});
