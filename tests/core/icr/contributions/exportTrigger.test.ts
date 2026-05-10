import { describe, it, expect } from 'vitest';
import { sanitizeFilename, filterHumanCoders } from '../../../../src/core/icr/contributions/exportTrigger';
import type { Coder } from '../../../../src/core/icr/coderTypes';

describe('sanitizeFilename', () => {
	it('substitui ":" por "-" (Windows compat)', () => {
		const out = sanitizeFilename('Carla', '2026-05-10T14:32:00.000Z');
		expect(out).not.toMatch(/:/);
		expect(out).toMatch(/Carla|carla/);
		expect(out).toMatch(/2026-05-10T14-32-00\.000Z\.json/);
	});

	it('slug do nome: espaços → -, lowercase, sem acentos', () => {
		const out = sanitizeFilename('Maria José Silva', '2026-01-01T00:00:00.000Z');
		expect(out).toMatch(/^maria-jose-silva-/);
	});

	it('trim "-" leading/trailing', () => {
		const out = sanitizeFilename('___X___', '2026-01-01T00:00:00.000Z');
		expect(out).not.toMatch(/^-/);
	});
});

describe('filterHumanCoders', () => {
	it('filtra type === "human"', () => {
		const coders: Coder[] = [
			{ id: 'h:1', name: 'A', type: 'human', createdAt: 0 },
			{ id: 'l:1', name: 'B', type: 'llm', createdAt: 0 },
			{ id: 'h:2', name: 'C', type: 'human', createdAt: 0 },
		];
		const out = filterHumanCoders(coders);
		expect(out.map(c => c.id)).toEqual(['h:1', 'h:2']);
	});

	it('lista vazia → array vazio', () => {
		expect(filterHumanCoders([])).toEqual([]);
	});

	it('só LLMs → array vazio', () => {
		const coders: Coder[] = [{ id: 'l:1', name: 'X', type: 'llm', createdAt: 0 }];
		expect(filterHumanCoders(coders)).toEqual([]);
	});
});
