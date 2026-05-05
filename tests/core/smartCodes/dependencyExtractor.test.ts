import { describe, it, expect } from 'vitest';
import { extractDependencies } from '../../../src/core/smartCodes/dependencyExtractor';

describe('extractDependencies', () => {
	it('empty AND returns empty deps', () => {
		const deps = extractDependencies({ op: 'AND', children: [] });
		expect(deps.codeIds.size).toBe(0);
		expect(deps.caseVarKeys.size).toBe(0);
	});

	it('extracts code deps from hasCode + magnitudeGte', () => {
		const deps = extractDependencies({ op: 'AND', children: [
			{ kind: 'hasCode', codeId: 'c_a' },
			{ kind: 'magnitudeGte', codeId: 'c_b', n: 3 },
		]});
		expect([...deps.codeIds]).toEqual(expect.arrayContaining(['c_a', 'c_b']));
	});

	it('extracts case var keys + folder/group/smartCode ids + flags', () => {
		const deps = extractDependencies({ op: 'AND', children: [
			{ kind: 'caseVarEquals', variable: 'role', value: 'junior' },
			{ kind: 'caseVarRange', variable: 'age', min: 25 },
			{ kind: 'inFolder', folderId: 'f_x' },
			{ kind: 'inGroup', groupId: 'g_y' },
			{ kind: 'smartCode', smartCodeId: 'sc_z' },
			{ kind: 'engineType', engine: 'pdf' },
			{ kind: 'relationExists', codeId: 'c_a' },
		]});
		expect([...deps.caseVarKeys]).toEqual(expect.arrayContaining(['role', 'age']));
		expect([...deps.folderIds]).toEqual(['f_x']);
		expect([...deps.groupIds]).toEqual(['g_y']);
		expect([...deps.smartCodeIds]).toEqual(['sc_z']);
		expect(deps.needsEngineType).toBe(true);
		expect(deps.needsRelations).toBe(true);
	});

	it('walks nested OR/NOT', () => {
		const deps = extractDependencies({ op: 'OR', children: [
			{ op: 'NOT', child: { kind: 'hasCode', codeId: 'c_a' }},
			{ kind: 'hasCode', codeId: 'c_b' },
		]});
		expect([...deps.codeIds].sort()).toEqual(['c_a', 'c_b']);
	});

	it('relationExists com targetCodeId adiciona ambos codes', () => {
		const deps = extractDependencies({ kind: 'relationExists', codeId: 'c_a', targetCodeId: 'c_b' });
		expect([...deps.codeIds].sort()).toEqual(['c_a', 'c_b']);
		expect(deps.needsRelations).toBe(true);
	});
});
