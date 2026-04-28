import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { executeMerge } from '../../src/core/mergeModal';

describe('executeMerge — Groups union', () => {
	let registry: CodeDefinitionRegistry;

	const defaultDecision = {
		nameChoice: { kind: 'target' as const },
		colorChoice: { kind: 'target' as const },
		descriptionPolicy: { kind: 'keep-target' as const },
		memoPolicy: { kind: 'keep-target' as const },
	};

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('target herda groups do source (union) quando target não tinha groups', () => {
		const target = registry.create('target');
		const source = registry.create('source');
		const g1 = registry.createGroup('RQ1');
		registry.addCodeToGroup(source.id, g1.id);

		executeMerge({
			destinationId: target.id,
			sourceIds: [source.id],
			registry,
			markers: [],
			...defaultDecision,
		});

		expect(registry.getById(target.id)?.groups).toEqual([g1.id]);
		expect(registry.getById(source.id)).toBeUndefined();
	});

	it('target herda union (groups de target + source, sem duplicatas)', () => {
		const target = registry.create('target');
		const source = registry.create('source');
		const g1 = registry.createGroup('RQ1');
		const g2 = registry.createGroup('RQ2');
		const g3 = registry.createGroup('Wave1');
		registry.addCodeToGroup(target.id, g1.id);
		registry.addCodeToGroup(target.id, g2.id);
		registry.addCodeToGroup(source.id, g2.id);  // overlap
		registry.addCodeToGroup(source.id, g3.id);

		executeMerge({
			destinationId: target.id,
			sourceIds: [source.id],
			registry,
			markers: [],
			...defaultDecision,
		});

		const finalGroups = registry.getById(target.id)?.groups ?? [];
		expect(finalGroups.sort()).toEqual([g1.id, g2.id, g3.id].sort());
	});

	it('multi-source merge: target herda union de todos os sources', () => {
		const target = registry.create('target');
		const s1 = registry.create('s1');
		const s2 = registry.create('s2');
		const g1 = registry.createGroup('RQ1');
		const g2 = registry.createGroup('RQ2');
		registry.addCodeToGroup(s1.id, g1.id);
		registry.addCodeToGroup(s2.id, g2.id);

		executeMerge({
			destinationId: target.id,
			sourceIds: [s1.id, s2.id],
			registry,
			markers: [],
			...defaultDecision,
		});

		expect(registry.getById(target.id)?.groups?.sort()).toEqual([g1.id, g2.id].sort());
	});
});
