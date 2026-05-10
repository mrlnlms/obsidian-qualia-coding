import { describe, it, expect } from 'vitest';
import { parseContribution } from '../../../../src/core/icr/contributions/contributionLoader';

describe('parseContribution', () => {
	it('payload v1.0 válido → retorna { payload, errors: [] }', () => {
		const json = JSON.stringify({
			version: '1.0',
			codebookVersion: 'abc123',
			coder: { id: 'human:carla', name: 'Carla', type: 'human', createdAt: 1700000000000 },
			sources: { 'src_a': { hash: 'h1' } },
			codes: [{ id: 'c1', name: 'TEST', color: '#fff', paletteIndex: 0, createdAt: 1700000000000 }],
			markers: { markdown: {}, pdf: [], csvSegment: [] },
			exportedAt: 1700000000000,
		});
		const result = parseContribution(json);
		expect(result.errors).toEqual([]);
		expect(result.payload).toBeTruthy();
		expect(result.payload?.version).toBe('1.0');
	});

	it('json malformado → erro "parse"', () => {
		const result = parseContribution('{ not json');
		expect(result.payload).toBeNull();
		expect(result.errors[0]).toMatch(/parse/i);
	});

	it('top-level não-objeto → erro', () => {
		const result = parseContribution('"just a string"');
		expect(result.payload).toBeNull();
		expect(result.errors[0]).toMatch(/objeto/i);
	});

	it('version: "2.0" → erro "version não suportada"', () => {
		const json = JSON.stringify({ version: '2.0', codebookVersion: '', coder: {}, sources: {}, codes: [], markers: { markdown: {}, pdf: [], csvSegment: [] }, exportedAt: 0 });
		const result = parseContribution(json);
		expect(result.payload).toBeNull();
		expect(result.errors.join(' ')).toMatch(/version.*não suportada|2\.0/i);
	});

	it('faltando "coder" → erro detalhando campo', () => {
		const json = JSON.stringify({ version: '1.0', codebookVersion: '', sources: {}, codes: [], markers: { markdown: {}, pdf: [], csvSegment: [] }, exportedAt: 0 });
		const result = parseContribution(json);
		expect(result.payload).toBeNull();
		expect(result.errors.join(' ')).toMatch(/coder/);
	});

	it('faltando "markers" → erro', () => {
		const json = JSON.stringify({ version: '1.0', codebookVersion: '', coder: {}, sources: {}, codes: [], exportedAt: 0 });
		const result = parseContribution(json);
		expect(result.payload).toBeNull();
		expect(result.errors.join(' ')).toMatch(/markers/);
	});

	it('markers sem subcampo markdown → erro', () => {
		const json = JSON.stringify({ version: '1.0', codebookVersion: '', coder: {}, sources: {}, codes: [], markers: { pdf: [], csvSegment: [] }, exportedAt: 0 });
		const result = parseContribution(json);
		expect(result.payload).toBeNull();
		expect(result.errors.join(' ')).toMatch(/markers\.markdown/);
	});
});
