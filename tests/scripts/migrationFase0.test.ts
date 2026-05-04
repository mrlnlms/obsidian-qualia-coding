/**
 * Tests for Fase 0 source-row-id migration.
 * The script + tests are descartable — delete after Fase 6 closes.
 */
import { describe, it, expect } from 'vitest';
import { migrateData, revertData, isAlreadyMigrated } from '../../scripts/migrationFase0.mjs';

describe('migrationFase0', () => {
	describe('migrateData', () => {
		it('renames row → sourceRowId in segmentMarkers', () => {
			const data = {
				csv: {
					segmentMarkers: [
						{ id: 's1', fileId: 'a.csv', row: 0, column: 'c', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 },
						{ id: 's2', fileId: 'a.csv', row: 7, column: 'c', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 },
					],
					rowMarkers: [],
				},
			};
			const result = migrateData(data);
			expect(result.segMigrated).toBe(2);
			expect(result.rowMigrated).toBe(0);
			expect(data.csv.segmentMarkers[0]).not.toHaveProperty('row');
			expect(data.csv.segmentMarkers[0].sourceRowId).toBe(0);
			expect(data.csv.segmentMarkers[1].sourceRowId).toBe(7);
		});

		it('renames row → sourceRowId in rowMarkers', () => {
			const data = {
				csv: {
					segmentMarkers: [],
					rowMarkers: [
						{ id: 'r1', fileId: 'a.csv', row: 3, column: 'c', codes: [], createdAt: 1, updatedAt: 1 },
					],
				},
			};
			const result = migrateData(data);
			expect(result.rowMigrated).toBe(1);
			expect(data.csv.rowMarkers[0]).not.toHaveProperty('row');
			expect(data.csv.rowMarkers[0].sourceRowId).toBe(3);
		});

		it('is idempotent — second run reports 0 migrated', () => {
			const data = {
				csv: {
					segmentMarkers: [{ id: 's1', fileId: 'a.csv', row: 5, column: 'c', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 }],
					rowMarkers: [{ id: 'r1', fileId: 'a.csv', row: 9, column: 'c', codes: [], createdAt: 1, updatedAt: 1 }],
				},
			};
			migrateData(data);
			const second = migrateData(data);
			expect(second.segMigrated).toBe(0);
			expect(second.rowMigrated).toBe(0);
			expect(data.csv.segmentMarkers[0].sourceRowId).toBe(5);
			expect(data.csv.rowMarkers[0].sourceRowId).toBe(9);
		});

		it('handles missing csv section', () => {
			const data = { other: 'foo' };
			const result = migrateData(data);
			expect(result.segMigrated).toBe(0);
			expect(result.rowMigrated).toBe(0);
		});

		it('handles empty marker arrays', () => {
			const data = { csv: { segmentMarkers: [], rowMarkers: [] } };
			const result = migrateData(data);
			expect(result.segMigrated).toBe(0);
			expect(result.rowMigrated).toBe(0);
		});

		it('preserves all other fields unchanged', () => {
			const data = {
				csv: {
					segmentMarkers: [
						{ id: 's1', fileId: 'a.csv', row: 2, column: 'col1', from: 3, to: 8, codes: [{ codeId: 'k1', magnitude: 4 }], memo: { content: 'note' }, colorOverride: '#abc', createdAt: 1000, updatedAt: 2000 },
					],
					rowMarkers: [],
				},
			};
			migrateData(data);
			const m = data.csv.segmentMarkers[0];
			expect(m.id).toBe('s1');
			expect(m.fileId).toBe('a.csv');
			expect(m.column).toBe('col1');
			expect(m.from).toBe(3);
			expect(m.to).toBe(8);
			expect(m.codes).toEqual([{ codeId: 'k1', magnitude: 4 }]);
			expect(m.memo).toEqual({ content: 'note' });
			expect(m.colorOverride).toBe('#abc');
			expect(m.createdAt).toBe(1000);
			expect(m.updatedAt).toBe(2000);
		});
	});

	describe('isAlreadyMigrated', () => {
		it('returns true if every marker already has sourceRowId and no row', () => {
			const data = {
				csv: {
					segmentMarkers: [{ id: 's1', sourceRowId: 0, fileId: 'a.csv', column: 'c', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 }],
					rowMarkers: [{ id: 'r1', sourceRowId: 1, fileId: 'a.csv', column: 'c', codes: [], createdAt: 1, updatedAt: 1 }],
				},
			};
			expect(isAlreadyMigrated(data)).toBe(true);
		});

		it('returns false if any marker still has row', () => {
			const data = {
				csv: {
					segmentMarkers: [{ id: 's1', row: 0, fileId: 'a.csv', column: 'c', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 }],
					rowMarkers: [],
				},
			};
			expect(isAlreadyMigrated(data)).toBe(false);
		});

		it('returns true for empty data', () => {
			expect(isAlreadyMigrated({})).toBe(true);
			expect(isAlreadyMigrated({ csv: { segmentMarkers: [], rowMarkers: [] } })).toBe(true);
		});
	});

	describe('revertData', () => {
		it('renames sourceRowId → row in segmentMarkers and rowMarkers', () => {
			const data = {
				csv: {
					segmentMarkers: [{ id: 's1', sourceRowId: 5, fileId: 'a.csv', column: 'c', from: 0, to: 5, codes: [], createdAt: 1, updatedAt: 1 }],
					rowMarkers: [{ id: 'r1', sourceRowId: 9, fileId: 'a.csv', column: 'c', codes: [], createdAt: 1, updatedAt: 1 }],
				},
			};
			const result = revertData(data);
			expect(result.segReverted).toBe(1);
			expect(result.rowReverted).toBe(1);
			expect(data.csv.segmentMarkers[0]).not.toHaveProperty('sourceRowId');
			expect(data.csv.segmentMarkers[0].row).toBe(5);
			expect(data.csv.rowMarkers[0].row).toBe(9);
		});

		it('roundtrip migrate → revert produces identical data', () => {
			const original = {
				csv: {
					segmentMarkers: [{ id: 's1', fileId: 'a.csv', row: 5, column: 'c', from: 0, to: 5, codes: [{ codeId: 'k' }], createdAt: 1, updatedAt: 1 }],
					rowMarkers: [{ id: 'r1', fileId: 'a.csv', row: 9, column: 'c', codes: [], createdAt: 1, updatedAt: 1 }],
				},
			};
			const data = JSON.parse(JSON.stringify(original));
			migrateData(data);
			revertData(data);
			expect(data).toEqual(original);
		});
	});
});
