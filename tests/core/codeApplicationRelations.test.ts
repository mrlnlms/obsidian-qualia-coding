import { describe, it, expect } from 'vitest';
import type { CodeApplication, CodeRelation } from '../../src/core/types';

describe('CodeRelation type', () => {
	it('CodeApplication accepts relations array', () => {
		const ca: CodeApplication = {
			codeId: 'c1',
			relations: [{ label: 'causes', target: 'c2', directed: true }],
		};
		expect(ca.relations).toHaveLength(1);
		expect(ca.relations![0].directed).toBe(true);
	});
});

import {
	getRelations,
	addRelation,
	removeRelation,
} from '../../src/core/codeApplicationHelpers';

describe('relation helpers', () => {
	const codes: CodeApplication[] = [
		{ codeId: 'c1', relations: [{ label: 'causes', target: 'c2', directed: true }] },
		{ codeId: 'c2' },
	];

	describe('getRelations', () => {
		it('returns relations for code with relations', () => {
			expect(getRelations(codes, 'c1')).toEqual([{ label: 'causes', target: 'c2', directed: true }]);
		});
		it('returns empty array for code without relations', () => {
			expect(getRelations(codes, 'c2')).toEqual([]);
		});
		it('returns empty array for unknown code', () => {
			expect(getRelations(codes, 'c99')).toEqual([]);
		});
	});

	describe('addRelation', () => {
		it('adds relation to code that has none', () => {
			const result = addRelation(codes, 'c2', { label: 'relates-to', target: 'c1', directed: false });
			const c2 = result.find(c => c.codeId === 'c2')!;
			expect(c2.relations).toHaveLength(1);
			expect(c2.relations![0].label).toBe('relates-to');
		});
		it('appends relation to existing array', () => {
			const result = addRelation(codes, 'c1', { label: 'enables', target: 'c3', directed: true });
			const c1 = result.find(c => c.codeId === 'c1')!;
			expect(c1.relations).toHaveLength(2);
		});
		it('does not duplicate identical relation', () => {
			const result = addRelation(codes, 'c1', { label: 'causes', target: 'c2', directed: true });
			const c1 = result.find(c => c.codeId === 'c1')!;
			expect(c1.relations).toHaveLength(1);
		});
		it('returns original array for unknown code', () => {
			const result = addRelation(codes, 'c99', { label: 'x', target: 'c1', directed: false });
			expect(result).toBe(codes);
		});
	});

	describe('removeRelation', () => {
		it('removes relation by label+target', () => {
			const result = removeRelation(codes, 'c1', 'causes', 'c2');
			const c1 = result.find(c => c.codeId === 'c1')!;
			expect(c1.relations).toEqual([]);
		});
		it('returns original array when no match', () => {
			const result = removeRelation(codes, 'c1', 'unknown', 'c2');
			expect(result).toBe(codes);
		});
	});
});
