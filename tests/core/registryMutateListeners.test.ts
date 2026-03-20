import { describe, it, expect, vi } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('CodeDefinitionRegistry multi-listener onMutate', () => {
	it('calls all registered listeners on mutation', () => {
		const registry = new CodeDefinitionRegistry();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		registry.addOnMutate(fn1);
		registry.addOnMutate(fn2);

		registry.create('Test Code');

		expect(fn1).toHaveBeenCalledTimes(1);
		expect(fn2).toHaveBeenCalledTimes(1);
	});

	it('removeOnMutate stops calling that listener', () => {
		const registry = new CodeDefinitionRegistry();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		registry.addOnMutate(fn1);
		registry.addOnMutate(fn2);
		registry.removeOnMutate(fn1);

		registry.create('Test Code');

		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).toHaveBeenCalledTimes(1);
	});
});
