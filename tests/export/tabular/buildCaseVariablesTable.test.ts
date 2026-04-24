import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../../src/core/dataManager';
import { buildCaseVariablesTable, CASE_VARS_HEADER } from '../../../src/export/tabular/buildCaseVariablesTable';
import type { Plugin } from 'obsidian';
import type { CaseVariablesSection } from '../../../src/core/caseVariables/caseVariablesTypes';

function createMockPlugin(initialData: any = null) {
	let stored = initialData;
	return {
		loadData: vi.fn(async () => stored),
		saveData: vi.fn(async (data: any) => { stored = data; }),
	} as unknown as Plugin;
}

async function setupDm(values: Record<string, Record<string, any>>, types: Record<string, string>): Promise<DataManager> {
	const dm = new DataManager(createMockPlugin());
	await dm.load();
	dm.setSection('caseVariables', { values, types } as CaseVariablesSection);
	return dm;
}

describe('buildCaseVariablesTable', () => {
	it('returns header + empty body when no vars', async () => {
		const dm = await setupDm({}, {});
		const { rows } = buildCaseVariablesTable(dm);
		expect(rows[0]).toEqual(CASE_VARS_HEADER);
		expect(rows).toHaveLength(1);
	});

	it('emits one row per (fileId, variable) pair', async () => {
		const dm = await setupDm({ 'a.md': { age: 30, group: 'A' } }, { age: 'number', group: 'text' });
		const { rows } = buildCaseVariablesTable(dm);
		expect(rows).toHaveLength(3);
	});

	it('serializes multitext as JSON array', async () => {
		const dm = await setupDm({ 'a.md': { tags: ['x', 'y'] } }, { tags: 'multitext' });
		const { rows } = buildCaseVariablesTable(dm);
		expect(JSON.parse(rows[1]![2] as string)).toEqual(['x', 'y']);
		expect(rows[1]![3]).toBe('multitext');
	});

	it('serializes checkbox false as "false" (not empty)', async () => {
		const dm = await setupDm({ 'a.md': { consent: false } }, { consent: 'checkbox' });
		const { rows } = buildCaseVariablesTable(dm);
		expect(rows[1]![2]).toBe('false');
	});

	it('emits empty string for null, keeps row', async () => {
		const dm = await setupDm({ 'a.md': { age: null } }, { age: 'number' });
		const { rows } = buildCaseVariablesTable(dm);
		expect(rows).toHaveLength(2);
		expect(rows[1]![2]).toBe('');
	});

	it('falls back to text with warning for unknown type', async () => {
		const dm = await setupDm({ 'a.md': { weird: 'x' } }, { weird: 'unknown_type' });
		const { rows, warnings } = buildCaseVariablesTable(dm);
		expect(rows[1]![3]).toBe('text');
		expect(warnings.some(w => /unknown.*type/i.test(w))).toBe(true);
	});
});
