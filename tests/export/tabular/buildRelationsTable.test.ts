import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataManager } from '../../../src/core/dataManager';
import { CodeDefinitionRegistry } from '../../../src/core/codeDefinitionRegistry';
import { buildRelationsTable, RELATIONS_HEADER } from '../../../src/export/tabular/buildRelationsTable';
import type { Plugin } from 'obsidian';

function mockPlugin(): Plugin {
	let stored: any = null;
	return { loadData: vi.fn(async () => stored), saveData: vi.fn(async (d) => { stored = d; }) } as unknown as Plugin;
}

let dm: DataManager;
let reg: CodeDefinitionRegistry;

beforeEach(async () => {
	dm = new DataManager(mockPlugin());
	await dm.load();
	reg = new CodeDefinitionRegistry();
});

describe('buildRelationsTable', () => {
	it('returns header + empty body when no relations', () => {
		const { rows } = buildRelationsTable(dm, reg);
		expect(rows[0]).toEqual(RELATIONS_HEADER);
		expect(rows).toHaveLength(1);
	});

	it('emits code-level relations with scope=code and empty origin_segment_id', () => {
		const c1 = reg.create('C1', '#000');
		const c2 = reg.create('C2', '#000');
		reg.update(c1.id, { relations: [{ label: 'parent-of', target: c2.id, directed: true }] });

		const { rows } = buildRelationsTable(dm, reg);
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual(['code', c1.id, '', c2.id, 'parent-of', 'true']);
	});

	it('emits application-level relations with scope=application', () => {
		const c1 = reg.create('C1', '#000');
		const c2 = reg.create('C2', '#000');
		const section = dm.section('markdown');
		section.markers['x.md'] = [{
			markerType: 'markdown', id: 's1', fileId: 'x.md',
			range: { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 } },
			color: '#000',
			codes: [{ codeId: c1.id, relations: [{ label: 'contradicts', target: c2.id, directed: false }] }],
			createdAt: 0, updatedAt: 0,
		}];
		dm.setSection('markdown', section);

		const { rows } = buildRelationsTable(dm, reg);
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual(['application', c1.id, 's1', c2.id, 'contradicts', 'false']);
	});

	it('returns no warnings (pure projection)', () => {
		const c1 = reg.create('C1', '#000');
		const c2 = reg.create('C2', '#000');
		reg.update(c1.id, { relations: [{ label: 'x', target: c2.id, directed: true }] });
		const { warnings } = buildRelationsTable(dm, reg);
		expect(warnings).toEqual([]);
	});
});
