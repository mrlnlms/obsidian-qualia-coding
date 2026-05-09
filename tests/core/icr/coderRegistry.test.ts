import { describe, it, expect } from 'vitest';
import { DEFAULT_CODER_ID, type Coder } from '../../../src/core/icr/coderTypes';

describe('coderTypes', () => {
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
