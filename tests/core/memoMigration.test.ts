import { describe, it, expect } from 'vitest';
import { migrateLegacyMemos, migrateMarkerMemo } from '../../src/core/memoMigration';

describe('migrateLegacyMemos', () => {
	it('converts string memo to MemoRecord on CodeDefinition', () => {
		const data: any = {
			registry: {
				definitions: { c1: { id: 'c1', name: 'X', memo: 'hello' } },
				groups: {},
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.definitions.c1.memo).toEqual({ content: 'hello' });
	});

	it('converts string memo on GroupDefinition', () => {
		const data: any = {
			registry: {
				definitions: {},
				groups: { g1: { id: 'g1', name: 'G', memo: 'group memo' } },
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.groups.g1.memo).toEqual({ content: 'group memo' });
	});

	it('converts string memo on CodeRelation inside CodeDefinition', () => {
		const data: any = {
			registry: {
				definitions: { c1: { id: 'c1', relations: [{ label: 'L', target: 'T', directed: true, memo: 'rel memo' }] } },
				groups: {},
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.definitions.c1.relations[0].memo).toEqual({ content: 'rel memo' });
	});

	it('idempotent: already-migrated MemoRecord stays untouched', () => {
		const data: any = {
			registry: {
				definitions: { c1: { id: 'c1', memo: { content: 'already' } } },
				groups: {},
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.definitions.c1.memo).toEqual({ content: 'already' });
	});

	it('drops empty string memo (becomes undefined)', () => {
		const data: any = {
			registry: {
				definitions: { c1: { id: 'c1', memo: '' } },
				groups: {},
			},
		};
		const out = migrateLegacyMemos(data);
		expect(out.registry.definitions.c1.memo).toBeUndefined();
	});

	it('handles missing registry sections gracefully', () => {
		const data: any = { registry: { definitions: {}, groups: {} } };
		expect(() => migrateLegacyMemos(data)).not.toThrow();
	});
});

describe('migrateMarkerMemo', () => {
	it('converts string memo to MemoRecord', () => {
		const m = { id: 'm1', memo: 'hello' } as any;
		migrateMarkerMemo(m);
		expect(m.memo).toEqual({ content: 'hello' });
	});

	it('idempotent on MemoRecord', () => {
		const m = { id: 'm1', memo: { content: 'hello' } } as any;
		migrateMarkerMemo(m);
		expect(m.memo).toEqual({ content: 'hello' });
	});

	it('drops empty string', () => {
		const m = { id: 'm1', memo: '' } as any;
		migrateMarkerMemo(m);
		expect(m.memo).toBeUndefined();
	});

	it('preserves marker structure', () => {
		const m = { id: 'm1', memo: 'hello', codes: [], createdAt: 1 } as any;
		migrateMarkerMemo(m);
		expect(m.id).toBe('m1');
		expect(m.codes).toEqual([]);
	});
});
