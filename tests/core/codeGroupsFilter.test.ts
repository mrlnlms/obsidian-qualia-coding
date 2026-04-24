import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { applyGroupFilterToRowClasses } from '../../src/core/codebookTreeRenderer';

describe('codeGroupsFilter — sidebar destaque contextual', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('applyGroupFilterToRowClasses retorna "member" quando código é membro', () => {
		const c = registry.create('c1');
		const g = registry.createGroup('RQ1');
		registry.addCodeToGroup(c.id, g.id);
		expect(applyGroupFilterToRowClasses(c.id, g.id, registry)).toBe('member');
	});

	it('retorna "non-member" quando código NÃO é membro do group selecionado', () => {
		const c = registry.create('c1');
		const g = registry.createGroup('RQ1');
		expect(applyGroupFilterToRowClasses(c.id, g.id, registry)).toBe('non-member');
	});

	it('retorna "none" quando selectedGroupId é null', () => {
		const c = registry.create('c1');
		expect(applyGroupFilterToRowClasses(c.id, null, registry)).toBe('none');
	});
});
