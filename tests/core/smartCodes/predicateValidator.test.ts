import { describe, it, expect } from 'vitest';
import { validateForSave } from '../../../src/core/smartCodes/predicateValidator';
import type { CodeDefinition, SmartCodeDefinition } from '../../../src/core/types';

const mkCode = (id: string, name: string, magType?: 'nominal' | 'ordinal' | 'continuous'): CodeDefinition => ({
	id, name, color: '#fff', paletteIndex: 0, createdAt: 0, updatedAt: 0, childrenOrder: [],
	...(magType ? { magnitude: { type: magType, values: [] } } : {}),
});

const emptyRegistry = () => ({ definitions: {} as Record<string, CodeDefinition>, smartCodes: {} as Record<string, SmartCodeDefinition>, folders: {}, groups: {} });

describe('validateForSave', () => {
	it('rejects empty root AND', () => {
		const r = validateForSave({ id: 'sc_1', name: 'X' }, { op: 'AND', children: [] }, emptyRegistry());
		expect(r.errors).toContainEqual(expect.objectContaining({ code: 'empty' }));
		expect(r.valid).toBe(false);
	});

	it('rejects empty root OR', () => {
		const r = validateForSave({ id: 'sc_1', name: 'X' }, { op: 'OR', children: [] }, emptyRegistry());
		expect(r.errors).toContainEqual(expect.objectContaining({ code: 'empty' }));
	});

	it('rejects empty group nested (NOT of empty AND)', () => {
		const r = validateForSave({ id: 'sc_1', name: 'X' }, { op: 'NOT', child: { op: 'AND', children: [] }}, emptyRegistry());
		expect(r.errors).toContainEqual(expect.objectContaining({ code: 'empty' }));
	});

	it('accepts root-level single leaf como predicate válido', () => {
		const reg = emptyRegistry();
		reg.definitions['c_a'] = mkCode('c_a', 'a');
		const r = validateForSave({ id: 'sc_1', name: 'X' }, { kind: 'hasCode', codeId: 'c_a' }, reg);
		expect(r.errors).toEqual([]);
		expect(r.valid).toBe(true);
	});

	it('rejects name collision (case-insensitive)', () => {
		const reg = emptyRegistry();
		reg.smartCodes['sc_a'] = { id: 'sc_a', name: 'Frustração', color: '#aaa', paletteIndex: 0, predicate: { op: 'AND', children: [] }, createdAt: 0 };
		reg.definitions['c_a'] = mkCode('c_a', 'a');
		const r = validateForSave({ id: 'sc_new', name: 'frustração' }, { kind: 'hasCode', codeId: 'c_a' }, reg);
		expect(r.errors).toContainEqual(expect.objectContaining({ code: 'name-collision' }));
	});

	it('warns on broken hasCode ref', () => {
		const r = validateForSave({ id: 'sc_1', name: 'X' }, { kind: 'hasCode', codeId: 'c_deleted' }, emptyRegistry());
		expect(r.warnings.length).toBeGreaterThan(0);
		expect(r.warnings[0]).toMatchObject({ code: 'broken-ref' });
		expect(r.valid).toBe(true);  // warning não bloqueia save
	});

	it('rejects magnitudeGte on code com magnitude type ordinal', () => {
		const reg = emptyRegistry();
		reg.definitions['c_a'] = mkCode('c_a', 'a', 'ordinal');
		const r = validateForSave({ id: 'sc_1', name: 'X' }, { kind: 'magnitudeGte', codeId: 'c_a', n: 3 }, reg);
		expect(r.errors).toContainEqual(expect.objectContaining({ code: 'magnitude-not-continuous' }));
	});

	it('aceita magnitudeGte em code com magnitude continuous', () => {
		const reg = emptyRegistry();
		reg.definitions['c_a'] = mkCode('c_a', 'a', 'continuous');
		const r = validateForSave({ id: 'sc_1', name: 'X' }, { kind: 'magnitudeGte', codeId: 'c_a', n: 3 }, reg);
		expect(r.errors).toEqual([]);
	});

	it('rejects cycle (smartCode → smartCode → original)', () => {
		const reg = emptyRegistry();
		const target: SmartCodeDefinition = {
			id: 'sc_b', name: 'B', color: '#bbb', paletteIndex: 0, createdAt: 0,
			predicate: { kind: 'smartCode', smartCodeId: 'sc_new' },
		};
		reg.smartCodes['sc_b'] = target;
		const r = validateForSave({ id: 'sc_new', name: 'A' }, { kind: 'smartCode', smartCodeId: 'sc_b' }, reg);
		expect(r.errors).toContainEqual(expect.objectContaining({ code: 'cycle' }));
	});

	it('warning em case var ausente quando caseVarsKeys provided', () => {
		const r = validateForSave({ id: 'sc_1', name: 'X' }, { kind: 'caseVarEquals', variable: 'role', value: 'jr' }, emptyRegistry(), new Set(['age']));
		expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'broken-ref' }));
	});
});
