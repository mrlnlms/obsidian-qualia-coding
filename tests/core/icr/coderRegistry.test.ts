import { describe, it, expect, beforeEach } from 'vitest';
import { CoderRegistry } from '../../../src/core/icr/coderRegistry';
import { DEFAULT_CODER_ID, type Coder } from '../../../src/core/icr/coderTypes';

let registry: CoderRegistry;

beforeEach(() => {
	registry = new CoderRegistry();
});

describe('CoderRegistry — types', () => {
	it('DEFAULT_CODER_ID is human:default', () => {
		expect(DEFAULT_CODER_ID).toBe('human:default');
	});

	it('Coder type accepts human shape', () => {
		const c: Coder = { id: 'human:carla', name: 'Carla', type: 'human', createdAt: Date.now() };
		expect(c.type).toBe('human');
	});

	it('Coder type accepts llm shape with config', () => {
		const c: Coder = {
			id: 'llm:gpt-4o',
			name: 'GPT-4o',
			type: 'llm',
			model: 'gpt-4o',
			version: '2024-08-06',
			temperature: 0.2,
			seed: 42,
			createdAt: Date.now(),
		};
		expect(c.type).toBe('llm');
		expect(c.model).toBe('gpt-4o');
	});
});

describe('CoderRegistry', () => {
	it('seeds default coder on construct', () => {
		expect(registry.getById(DEFAULT_CODER_ID)).toBeTruthy();
		expect(registry.getById(DEFAULT_CODER_ID)?.name).toBe('Default');
		expect(registry.getById(DEFAULT_CODER_ID)?.type).toBe('human');
	});

	it('createHuman returns coder with human:<id> shape', () => {
		const c = registry.createHuman('Carla');
		expect(c.id).toBe('human:carla');
		expect(c.type).toBe('human');
	});

	it('createHuman lowercases + slug-converts spaces', () => {
		const c = registry.createHuman('Maria Silva');
		expect(c.id).toBe('human:maria-silva');
	});

	it('createLLM accepts model + version + temperature + seed', () => {
		const c = registry.createLLM({ model: 'gpt-4o', version: '2024-08-06', temperature: 0.2, seed: 42 });
		expect(c.id).toBe('llm:gpt-4o');
		expect(c.type).toBe('llm');
		expect(c.temperature).toBe(0.2);
		expect(c.seed).toBe(42);
	});

	it('returns existing coder when id collides', () => {
		const c1 = registry.createHuman('Carla');
		const c2 = registry.createHuman('Carla');
		expect(c1.id).toBe(c2.id);
		expect(registry.getAll().filter(c => c.id === 'human:carla').length).toBe(1);
	});

	it('getAll returns array of all coders including default', () => {
		registry.createHuman('Carla');
		registry.createHuman('Joana');
		const all = registry.getAll();
		expect(all.length).toBe(3);
		expect(all.map(c => c.id).sort()).toEqual(['human:carla', 'human:default', 'human:joana']);
	});

	it('has(id) returns true for existing, false for missing', () => {
		expect(registry.has(DEFAULT_CODER_ID)).toBe(true);
		expect(registry.has('human:nonexistent')).toBe(false);
	});

	it('toJSON / fromJSON round-trip preserves coders', () => {
		registry.createHuman('Carla');
		registry.createLLM({ model: 'gpt-4o', temperature: 0.3 });
		const json = registry.toJSON();
		const restored = CoderRegistry.fromJSON(json);
		expect(restored.getAll().length).toBe(3);
		expect(restored.getById('llm:gpt-4o')?.temperature).toBe(0.3);
	});

	it('fromJSON with null/undefined returns registry with only default', () => {
		const r1 = CoderRegistry.fromJSON(null);
		const r2 = CoderRegistry.fromJSON(undefined);
		expect(r1.getAll().length).toBe(1);
		expect(r2.getAll().length).toBe(1);
		expect(r1.getById(DEFAULT_CODER_ID)).toBeTruthy();
	});

	it('addOnMutate fires on create', () => {
		let count = 0;
		registry.addOnMutate(() => count++);
		registry.createHuman('Carla');
		expect(count).toBe(1);
	});

	it('addOnMutate does NOT fire when returning existing coder', () => {
		registry.createHuman('Carla');
		let count = 0;
		registry.addOnMutate(() => count++);
		registry.createHuman('Carla'); // already exists
		expect(count).toBe(0);
	});

	it('removeOnMutate stops the listener', () => {
		let count = 0;
		const fn = () => count++;
		registry.addOnMutate(fn);
		registry.removeOnMutate(fn);
		registry.createHuman('Carla');
		expect(count).toBe(0);
	});
});
