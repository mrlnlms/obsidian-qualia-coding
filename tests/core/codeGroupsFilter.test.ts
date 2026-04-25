import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { applyGroupFilterToRowClasses } from '../../src/core/codebookTreeRenderer';
import { applyFilters } from '../../src/analytics/data/statsHelpers';
import type { ConsolidatedData, FilterConfig, UnifiedMarker } from '../../src/analytics/data/dataTypes';
import { renderGroupsFilter } from '../../src/analytics/views/configSections';

describe('codeGroupsFilter — sidebar destaque contextual', () => {
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		registry = new CodeDefinitionRegistry();
	});

	it('applyGroupFilterToRowClasses retorna "member" quando código é membro', () => {
		const c = registry.create('c1');
		const g = registry.createGroup('RQ1');
		registry.addCodeToGroup(c.id, g.id);
		expect(applyGroupFilterToRowClasses(c.id, g.id, registry)).toBe('member');
	});

	it('retorna "non-member" quando código NÃO é membro do group selecionado', () => {
		const c = registry.create('c1');
		const g = registry.createGroup('RQ1');
		expect(applyGroupFilterToRowClasses(c.id, g.id, registry)).toBe('non-member');
	});

	it('retorna "none" quando selectedGroupId é null', () => {
		const c = registry.create('c1');
		expect(applyGroupFilterToRowClasses(c.id, null, registry)).toBe('none');
	});
});

describe('applyFilters — groupFilter', () => {
	function makeData(markers: UnifiedMarker[]): ConsolidatedData {
		return {
			markers,
			codes: [],
			sources: { markdown: true, csv: true, image: true, pdf: true, audio: true, video: true },
			lastUpdated: 0,
		};
	}

	function makeFilter(overrides: Partial<FilterConfig> = {}): FilterConfig {
		return {
			sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
			codes: [],
			excludeCodes: [],
			minFrequency: 0,
			...overrides,
		};
	}

	function marker(id: string, codes: string[]): UnifiedMarker {
		return { id, source: 'markdown', fileId: 'f.md', codes };
	}

	it('quando groupFilter está ausente, não filtra markers', () => {
		const data = makeData([marker('m1', ['c1']), marker('m2', ['c2'])]);
		const result = applyFilters(data, makeFilter());
		expect(result.length).toBe(2);
	});

	it('quando groupFilter está presente, só passam markers com pelo menos 1 código membro', () => {
		const data = makeData([
			marker('m1', ['c1', 'c2']),
			marker('m2', ['c3']),
			marker('m3', ['c2']),
		]);
		const filter = makeFilter({
			groupFilter: { groupId: 'g1', memberCodeIds: ['c1'] },
		});
		const result = applyFilters(data, filter);
		expect(result.map(m => m.id)).toEqual(['m1']);
	});

	it('múltiplos membros no group — marker passa se pelo menos 1 matchea', () => {
		const data = makeData([marker('m1', ['c3']), marker('m2', ['c7'])]);
		const filter = makeFilter({
			groupFilter: { groupId: 'g1', memberCodeIds: ['c1', 'c3', 'c5'] },
		});
		const result = applyFilters(data, filter);
		expect(result.map(m => m.id)).toEqual(['m1']);
	});

	it('groupFilter com memberCodeIds vazio exclui tudo (group sem membros)', () => {
		const data = makeData([marker('m1', ['c1'])]);
		const filter = makeFilter({
			groupFilter: { groupId: 'g1', memberCodeIds: [] },
		});
		const result = applyFilters(data, filter);
		expect(result.length).toBe(0);
	});

	it('combina com excludeCodes (groupFilter + excludeCodes ambos aplicam)', () => {
		const data = makeData([marker('m1', ['c1']), marker('m2', ['c1'])]);
		const filter = makeFilter({
			excludeCodes: ['c1'],
			groupFilter: { groupId: 'g1', memberCodeIds: ['c1'] },
		});
		const result = applyFilters(data, filter);
		expect(result.length).toBe(0);
	});
});

describe('renderGroupsFilter — UI', () => {
	let container: HTMLElement;
	let registry: CodeDefinitionRegistry;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		registry = new CodeDefinitionRegistry();
	});

	afterEach(() => { container.remove(); });

	it('não renderiza nada quando não há groups', () => {
		renderGroupsFilter(container, registry, { filter: null }, () => {});
		expect(container.querySelector('.codemarker-config-section')).toBeFalsy();
	});

	it('renderiza chips quando ≤10 groups', () => {
		for (let i = 0; i < 5; i++) registry.createGroup(`G${i}`);
		renderGroupsFilter(container, registry, { filter: null }, () => {});
		expect(container.querySelectorAll('.codemarker-analytics-group-chip').length).toBe(5);
	});

	it('renderiza dropdown quando >10 groups (fallback)', () => {
		for (let i = 0; i < 15; i++) registry.createGroup(`G${i}`);
		renderGroupsFilter(container, registry, { filter: null }, () => {});
		expect(container.querySelectorAll('.codemarker-analytics-group-chip').length).toBe(0);
		const select = container.querySelector('select');
		expect(select).toBeTruthy();
		expect(select!.options.length).toBe(16);  // "— none —" + 15 groups
	});

	it('click no chip emite onChange com groupId', () => {
		const g = registry.createGroup('RQ1');
		let received: string | null | undefined;
		renderGroupsFilter(container, registry, { filter: null }, (f) => { received = f; });
		(container.querySelector('.codemarker-analytics-group-chip') as HTMLElement).click();
		expect(received).toBe(g.id);
	});

	it('click no chip já selecionado emite null (toggle off)', () => {
		const g = registry.createGroup('RQ1');
		let received: string | null | undefined = 'initial';
		renderGroupsFilter(container, registry, { filter: g.id }, (f) => { received = f; });
		(container.querySelector('.codemarker-analytics-group-chip.is-selected') as HTMLElement).click();
		expect(received).toBeNull();
	});
});
