import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { computeGroupChipLabel } from '../../src/core/codebookTreeRenderer';

describe('codebookTreeRenderer — chip contador de groups', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('retorna null quando código não tem groups (chip oculto)', () => {
		const c = registry.create('c1');
		expect(computeGroupChipLabel(c.id, registry)).toBeNull();
	});

	it('retorna null quando code.groups é array vazio', () => {
		const c = registry.create('c1');
		(registry.getById(c.id) as any).groups = [];
		expect(computeGroupChipLabel(c.id, registry)).toBeNull();
	});

	it('retorna count + tooltip com nomes quando há groups', () => {
		const c = registry.create('c1');
		const g1 = registry.createGroup('RQ1');
		const g2 = registry.createGroup('Wave1');
		registry.addCodeToGroup(c.id, g1.id);
		registry.addCodeToGroup(c.id, g2.id);

		const label = computeGroupChipLabel(c.id, registry);
		expect(label).not.toBeNull();
		expect(label!.count).toBe(2);
		expect(label!.tooltip).toContain('RQ1');
		expect(label!.tooltip).toContain('Wave1');
	});
});
