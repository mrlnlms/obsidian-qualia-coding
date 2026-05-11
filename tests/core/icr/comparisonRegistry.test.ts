import { describe, it, expect, beforeEach } from 'vitest';
import { ComparisonRegistry } from '../../../src/core/icr/comparisonRegistry';
import { createDefaultData } from '../../../src/core/types';
import type { QualiaData } from '../../../src/core/types';
import type {
	ComparisonScope,
	ComparisonFilters,
	SavedComparisonView,
} from '../../../src/core/icr/ui/compareCodersTypes';

function makeScope(overrides: Partial<ComparisonScope> = {}): ComparisonScope {
	return { coderIds: ['marlon', 'joana'], ...overrides };
}

function makeView(): SavedComparisonView {
	return { overviewMode: 'matrix', drilldownMode: 'spatial', primaryCoefficient: 'cohen' };
}

function makeFilters(overrides: Partial<ComparisonFilters> = {}): ComparisonFilters {
	return {
		hideAgreementTotal: false,
		highlightConflicts: false,
		excludeConsensusCoders: false,
		...overrides,
	};
}

describe('ComparisonRegistry CRUD', () => {
	let data: QualiaData;
	let mutateCalls: string[];
	let registry: ComparisonRegistry;

	beforeEach(() => {
		data = createDefaultData();
		mutateCalls = [];
		registry = ComparisonRegistry.fromJSON(data.comparisons);
		registry.addOnMutate((id) => mutateCalls.push(id));
	});

	it('fromJSON aceita undefined e cria section vazia', () => {
		const r = ComparisonRegistry.fromJSON(undefined);
		expect(r.getAll()).toEqual([]);
		expect(r.toJSON()).toEqual({ definitions: {}, order: [] });
	});

	it('create adiciona ao section + emite mutate com id', () => {
		const cmp = registry.create({
			name: 'Piloto 2026',
			scope: makeScope(),
			view: makeView(),
			filters: makeFilters(),
		});
		expect(cmp.id.startsWith('sc_cmp_')).toBe(true);
		expect(cmp.createdAt).toBe(cmp.updatedAt);
		expect(registry.getById(cmp.id)).toEqual(cmp);
		expect(registry.getAll()).toHaveLength(1);
		expect(mutateCalls).toEqual([cmp.id]);
	});

	it('create clona scope/filters — mutações externas não vazam', () => {
		const scope = makeScope({ codeIds: ['c_a', 'c_b'] });
		const filters = makeFilters({ visibleCoderIds: ['marlon'] });
		const cmp = registry.create({ name: 'X', scope, view: makeView(), filters });
		scope.codeIds!.push('c_c');
		filters.visibleCoderIds!.push('joana');
		expect(cmp.scope.codeIds).toEqual(['c_a', 'c_b']);
		expect(cmp.filters.visibleCoderIds).toEqual(['marlon']);
	});

	it('rename atualiza name + updatedAt + emite mutate', () => {
		const cmp = registry.create({ name: 'A', scope: makeScope(), view: makeView(), filters: makeFilters() });
		const beforeUpdate = cmp.updatedAt;
		mutateCalls.length = 0;
		// Avança o relógio (Date.now é monotônico mas pode bater no mesmo ms)
		const newName = 'B';
		const ok = registry.rename(cmp.id, newName);
		expect(ok).toBe(true);
		expect(registry.getById(cmp.id)!.name).toBe('B');
		expect(registry.getById(cmp.id)!.updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
		expect(mutateCalls).toEqual([cmp.id]);
	});

	it('rename retorna false em id inexistente', () => {
		expect(registry.rename('nope', 'X')).toBe(false);
	});

	it('update aceita patch parcial e atualiza só os campos passados', () => {
		const cmp = registry.create({
			name: 'X',
			scope: makeScope(),
			view: makeView(),
			filters: makeFilters(),
		});
		registry.update(cmp.id, { name: 'Y' });
		expect(registry.getById(cmp.id)!.name).toBe('Y');
		expect(registry.getById(cmp.id)!.scope.coderIds).toEqual(['marlon', 'joana']);

		registry.update(cmp.id, { view: { overviewMode: 'heatmap', drilldownMode: 'workflow', primaryCoefficient: 'alpha' }});
		expect(registry.getById(cmp.id)!.view.overviewMode).toBe('heatmap');

		registry.update(cmp.id, { filters: makeFilters({ hideAgreementTotal: true }) });
		expect(registry.getById(cmp.id)!.filters.hideAgreementTotal).toBe(true);
	});

	it('update retorna undefined em id inexistente', () => {
		expect(registry.update('nope', { name: 'X' })).toBeUndefined();
	});

	it('delete remove do definitions + order + emite mutate', () => {
		const cmp = registry.create({ name: 'X', scope: makeScope(), view: makeView(), filters: makeFilters() });
		mutateCalls.length = 0;
		expect(registry.delete(cmp.id)).toBe(true);
		expect(registry.getById(cmp.id)).toBeUndefined();
		expect(registry.toJSON().order).not.toContain(cmp.id);
		expect(mutateCalls).toEqual([cmp.id]);
	});

	it('delete retorna false em id inexistente', () => {
		expect(registry.delete('nope')).toBe(false);
	});

	it('duplicate cria cópia com sufixo "(copy)" e id próprio', () => {
		const src = registry.create({
			name: 'Piloto',
			scope: makeScope({ codeIds: ['c_a'] }),
			view: makeView(),
			filters: makeFilters({ hideAgreementTotal: true }),
		});
		const dup = registry.duplicate(src.id)!;
		expect(dup.id).not.toBe(src.id);
		expect(dup.name).toBe('Piloto (copy)');
		expect(dup.scope.codeIds).toEqual(['c_a']);
		expect(dup.filters.hideAgreementTotal).toBe(true);
		expect(registry.getAll()).toHaveLength(2);
	});

	it('duplicate retorna undefined em id inexistente', () => {
		expect(registry.duplicate('nope')).toBeUndefined();
	});

	it('getAll respeita order', () => {
		const a = registry.create({ name: 'A', scope: makeScope(), view: makeView(), filters: makeFilters() });
		const b = registry.create({ name: 'B', scope: makeScope(), view: makeView(), filters: makeFilters() });
		const c = registry.create({ name: 'C', scope: makeScope(), view: makeView(), filters: makeFilters() });
		expect(registry.getAll().map(x => x.id)).toEqual([a.id, b.id, c.id]);
	});

	it('roundtrip toJSON/fromJSON preserva state', () => {
		registry.create({ name: 'A', scope: makeScope({ codeIds: ['c_a'] }), view: makeView(), filters: makeFilters() });
		registry.create({ name: 'B', scope: makeScope(), view: makeView(), filters: makeFilters({ hideAgreementTotal: true }) });
		const serialized = JSON.parse(JSON.stringify(registry.toJSON()));
		const rebuilt = ComparisonRegistry.fromJSON(serialized);
		expect(rebuilt.getAll()).toHaveLength(2);
		expect(rebuilt.getAll().map(x => x.name)).toEqual(['A', 'B']);
		expect(rebuilt.getAll()[1]!.filters.hideAgreementTotal).toBe(true);
	});

	it('addOnMutate retorna unsubscribe', () => {
		const calls: string[] = [];
		const unsub = registry.addOnMutate(id => calls.push(id));
		const cmp = registry.create({ name: 'X', scope: makeScope(), view: makeView(), filters: makeFilters() });
		unsub();
		registry.rename(cmp.id, 'Y');
		// 'X' criação dispara mutate, 'Y' rename não (unsub'd)
		expect(calls).toEqual([cmp.id]);
	});

	it('createDefaultData inclui comparisons section vazia', () => {
		expect(data.comparisons).toEqual({ definitions: {}, order: [] });
	});
});
