import { describe, it, expect } from 'vitest';
import {
	extractRowMarkerUnit,
	makeCategoricalUnitKey,
} from '../../../src/core/icr/categoricalKappaInput';
import type { RowMarker } from '../../../src/csv/csvCodingTypes';

describe('extractRowMarkerUnit', () => {
	it('returns unit with fileId + sourceRowId + column + codeIds + coderId', () => {
		const m: RowMarker = {
			markerType: 'csv', id: 'm1', fileId: 'data.csv',
			sourceRowId: 5, column: 'response',
			codes: [{ codeId: 'c1' }], codedBy: 'human:carla',
			createdAt: 1, updatedAt: 1,
		};
		const unit = extractRowMarkerUnit(m);
		expect(unit.fileId).toBe('data.csv');
		expect(unit.sourceRowId).toBe(5);
		expect(unit.column).toBe('response');
		expect(unit.codeIds).toEqual(['c1']);
		expect(unit.coderId).toBe('human:carla');
	});

	it('falls back to human:default when codedBy absent', () => {
		const m: RowMarker = {
			markerType: 'csv', id: 'm1', fileId: 'data.csv',
			sourceRowId: 0, column: 'r',
			codes: [{ codeId: 'c1' }],
			createdAt: 1, updatedAt: 1,
		};
		const unit = extractRowMarkerUnit(m);
		expect(unit.coderId).toBe('human:default');
	});

	it('handles multiple codeIds', () => {
		const m: RowMarker = {
			markerType: 'csv', id: 'm1', fileId: 'data.csv',
			sourceRowId: 0, column: 'r',
			codes: [{ codeId: 'c1' }, { codeId: 'c2' }],
			codedBy: 'human:a', createdAt: 1, updatedAt: 1,
		};
		const unit = extractRowMarkerUnit(m);
		expect(unit.codeIds).toEqual(['c1', 'c2']);
	});
});

describe('makeCategoricalUnitKey', () => {
	it('creates stable key from fileId + sourceRowId + column', () => {
		expect(makeCategoricalUnitKey('data.csv', 5, 'response')).toBe('data.csv|row:5|col:response');
	});
});
