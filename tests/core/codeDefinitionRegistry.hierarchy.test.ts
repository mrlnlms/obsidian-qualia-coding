import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('CodeDefinitionRegistry — hierarchy fields', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('new code has no parentId by default', () => {
		const code = registry.create('Alpha');
		expect(code.parentId).toBeUndefined();
	});

	it('new code has empty childrenOrder by default', () => {
		const code = registry.create('Beta');
		expect(code.childrenOrder).toEqual([]);
	});

	it('new code has no mergedFrom by default', () => {
		const code = registry.create('Gamma');
		expect(code.mergedFrom).toBeUndefined();
	});
});
