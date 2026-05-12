import { describe, it, expect } from 'vitest';
import { buildCodersTable, CODERS_HEADER } from '../../../src/export/tabular/buildCodersTable';

function makeDm(coders: any[]): any {
	return {
		section: (name: string) => {
			if (name === 'coders') return { coders };
			return null;
		},
	};
}

describe('buildCodersTable', () => {
	it('returns header + empty body when section vazia', () => {
		const rows = buildCodersTable(makeDm([]));
		expect(rows[0]).toEqual(CODERS_HEADER);
		expect(rows).toHaveLength(1);
	});

	it('returns header + empty body when section indefinida', () => {
		const dm = { section: () => null } as any;
		const rows = buildCodersTable(dm);
		expect(rows).toHaveLength(1);
	});

	it('emits one row per coder com createdAt em ISO', () => {
		const t = Date.parse('2026-05-01T12:00:00Z');
		const rows = buildCodersTable(makeDm([
			{ id: 'human:default', name: 'Default', type: 'human', createdAt: t },
			{ id: 'human:carla', name: 'Carla', type: 'human', createdAt: t },
			{ id: 'consensus:c1', name: 'Consensus c1', type: 'consensus', createdAt: t },
		]));
		expect(rows).toHaveLength(4);
		expect(rows[1]).toEqual(['human:default', 'Default', 'human', '2026-05-01T12:00:00.000Z']);
		expect(rows[3]![2]).toBe('consensus');
	});

	it('createdAt não-finito vira vazio', () => {
		const rows = buildCodersTable(makeDm([
			{ id: 'h:x', name: 'X', type: 'human', createdAt: NaN },
		]));
		expect(rows[1]![3]).toBe('');
	});
});
