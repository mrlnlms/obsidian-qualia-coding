import { describe, it, expect } from 'vitest';
import {
	hasCode,
	getCodeIds,
	findCodeApplication,
	addCodeApplication,
	removeCodeApplication,
	getMagnitude,
	setMagnitude,
	normalizeCodeApplications,
} from '../../src/core/codeApplicationHelpers';
import type { CodeApplication, CodeDefinition } from '../../src/core/types';
import type { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('codeApplicationHelpers', () => {
	const codes: CodeApplication[] = [
		{ codeId: 'code_a' },
		{ codeId: 'code_b', magnitude: 'ALTA' },
	];

	describe('hasCode', () => {
		it('returns true when codeId present', () => {
			expect(hasCode(codes, 'code_a')).toBe(true);
		});
		it('returns false when codeId absent', () => {
			expect(hasCode(codes, 'code_z')).toBe(false);
		});
	});

	describe('getCodeIds', () => {
		it('extracts all codeIds', () => {
			expect(getCodeIds(codes)).toEqual(['code_a', 'code_b']);
		});
		it('returns empty array for empty input', () => {
			expect(getCodeIds([])).toEqual([]);
		});
	});

	describe('findCodeApplication', () => {
		it('finds by codeId', () => {
			expect(findCodeApplication(codes, 'code_b')).toEqual({ codeId: 'code_b', magnitude: 'ALTA' });
		});
		it('returns undefined when not found', () => {
			expect(findCodeApplication(codes, 'code_z')).toBeUndefined();
		});
	});

	describe('addCodeApplication', () => {
		it('adds new code returning new array', () => {
			const original: CodeApplication[] = [{ codeId: 'code_a' }];
			const result = addCodeApplication(original, 'code_c');
			expect(result).toHaveLength(2);
			expect(result[1]).toEqual({ codeId: 'code_c' });
			expect(original).toHaveLength(1); // original unchanged
		});
		it('returns same array if duplicate', () => {
			const original: CodeApplication[] = [{ codeId: 'code_a' }];
			const result = addCodeApplication(original, 'code_a');
			expect(result).toHaveLength(1);
		});
	});

	describe('removeCodeApplication', () => {
		it('removes by codeId', () => {
			const result = removeCodeApplication([...codes], 'code_a');
			expect(result).toHaveLength(1);
			expect(result[0].codeId).toBe('code_b');
		});
		it('returns unchanged if not found', () => {
			const result = removeCodeApplication([...codes], 'code_z');
			expect(result).toHaveLength(2);
		});
	});

	describe('getMagnitude', () => {
		it('returns value when present', () => {
			expect(getMagnitude(codes, 'code_b')).toBe('ALTA');
		});
		it('returns undefined when code has no magnitude', () => {
			expect(getMagnitude(codes, 'code_a')).toBeUndefined();
		});
		it('returns undefined when codeId not found', () => {
			expect(getMagnitude(codes, 'code_z')).toBeUndefined();
		});
	});

	describe('setMagnitude', () => {
		it('sets value on existing code', () => {
			const result = setMagnitude(codes, 'code_a', 'MEDIA');
			expect(result).not.toBe(codes);
			expect(findCodeApplication(result, 'code_a')?.magnitude).toBe('MEDIA');
		});
		it('clears magnitude with undefined', () => {
			const result = setMagnitude(codes, 'code_b', undefined);
			expect(findCodeApplication(result, 'code_b')?.magnitude).toBeUndefined();
		});
		it('returns same array when codeId not found', () => {
			const result = setMagnitude(codes, 'code_z', 'ALTA');
			expect(result).toBe(codes);
		});
		it('preserves other code applications', () => {
			const result = setMagnitude(codes, 'code_a', 'BAIXA');
			expect(findCodeApplication(result, 'code_b')?.magnitude).toBe('ALTA');
		});
	});

	describe('normalizeCodeApplications', () => {
		function makeRegistry(defs: CodeDefinition[]): CodeDefinitionRegistry {
			const byId = new Map(defs.map(d => [d.id, d]));
			const byName = new Map(defs.map(d => [d.name, d]));
			return {
				getById: (id: string) => byId.get(id),
				getByName: (name: string) => byName.get(name),
			} as unknown as CodeDefinitionRegistry;
		}

		const defs: CodeDefinition[] = [
			{ id: 'c_1', name: 'Hierarquia', color: '#000' } as CodeDefinition,
			{ id: 'c_2', name: 'Frustração', color: '#111' } as CodeDefinition,
		];

		it('keeps applications already referencing a valid id', () => {
			const reg = makeRegistry(defs);
			const result = normalizeCodeApplications([{ codeId: 'c_1' }], reg);
			expect(result.normalized).toEqual([{ codeId: 'c_1' }]);
			expect(result.changed).toBe(false);
		});

		it('rewrites name-based legacy codeId to id', () => {
			const reg = makeRegistry(defs);
			const result = normalizeCodeApplications([{ codeId: 'Hierarquia' }], reg);
			expect(result.normalized).toEqual([{ codeId: 'c_1' }]);
			expect(result.changed).toBe(true);
		});

		it('drops orphan applications (codeId matches neither id nor name)', () => {
			const reg = makeRegistry(defs);
			const result = normalizeCodeApplications([{ codeId: 'ghost' }], reg);
			expect(result.normalized).toEqual([]);
			expect(result.changed).toBe(true);
		});

		it('preserves magnitude and relations when rewriting id', () => {
			const reg = makeRegistry(defs);
			const input = [{
				codeId: 'Frustração',
				magnitude: 'ALTA',
				relations: [{ label: 'causa', target: 'Hierarquia', directed: true }],
			}];
			const result = normalizeCodeApplications(input, reg);
			expect(result.normalized).toEqual([{
				codeId: 'c_2',
				magnitude: 'ALTA',
				relations: [{ label: 'causa', target: 'Hierarquia', directed: true }],
			}]);
			expect(result.changed).toBe(true);
		});

		it('handles mixed array: valid + legacy + orphan', () => {
			const reg = makeRegistry(defs);
			const result = normalizeCodeApplications(
				[{ codeId: 'c_1' }, { codeId: 'Frustração' }, { codeId: 'ghost' }],
				reg,
			);
			expect(result.normalized).toEqual([{ codeId: 'c_1' }, { codeId: 'c_2' }]);
			expect(result.changed).toBe(true);
		});

		it('returns empty with changed=false for empty input', () => {
			const reg = makeRegistry(defs);
			const result = normalizeCodeApplications([], reg);
			expect(result.normalized).toEqual([]);
			expect(result.changed).toBe(false);
		});

		it('returns same reference (not a copy) when nothing changed', () => {
			const reg = makeRegistry(defs);
			const input: CodeApplication[] = [{ codeId: 'c_1' }, { codeId: 'c_2' }];
			const result = normalizeCodeApplications(input, reg);
			expect(result.normalized).toBe(input);
			expect(result.changed).toBe(false);
		});
	});
});
