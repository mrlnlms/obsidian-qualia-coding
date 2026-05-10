import { describe, it, expect } from 'vitest';
import { computeRowGradient, computeRowMarkersByCell } from '../../../../src/core/icr/ui/compareModeColoring';
import type { RowMarker } from '../../../../src/csv/csvCodingTypes';

describe('computeRowGradient', () => {
	it('zero coders → string vazia', () => {
		expect(computeRowGradient([])).toBe('');
	});

	it('1 coder → cor sólida com transparência (sem gradient)', () => {
		const result = computeRowGradient([{ coderId: 'a', codeColor: '#ff0000' }]);
		expect(result).toMatch(/rgba\(255,\s*0,\s*0,\s*0\.4\)/);
		expect(result).not.toMatch(/linear-gradient/);
	});

	it('2 coders → linear-gradient com 50/50', () => {
		const result = computeRowGradient([
			{ coderId: 'a', codeColor: '#ff0000' },
			{ coderId: 'b', codeColor: '#00ff00' },
		]);
		expect(result).toMatch(/linear-gradient/);
		expect(result).toMatch(/0\.00%/);
		expect(result).toMatch(/50\.00%/);
		expect(result).toMatch(/100\.00%/);
	});

	it('3 coders → 33.33% stripes', () => {
		const result = computeRowGradient([
			{ coderId: 'a', codeColor: '#ff0000' },
			{ coderId: 'b', codeColor: '#00ff00' },
			{ coderId: 'c', codeColor: '#0000ff' },
		]);
		expect(result).toMatch(/33\.33%/);
		expect(result).toMatch(/66\.67%/);
	});

	it('hex inválido cai em fallback cinza', () => {
		const result = computeRowGradient([{ coderId: 'a', codeColor: 'not-a-hex' }]);
		expect(result).toMatch(/rgba\(136,\s*136,\s*136/);
	});
});

describe('computeRowMarkersByCell', () => {
	it('agrupa markers por (sourceRowId, column)', () => {
		const markers: RowMarker[] = [
			{ markerType: 'csv', id: '1', fileId: 'f', sourceRowId: 1, column: 'col1', codes: [{ codeId: 'X' }], codedBy: 'a', createdAt: 0, updatedAt: 0 },
			{ markerType: 'csv', id: '2', fileId: 'f', sourceRowId: 1, column: 'col1', codes: [{ codeId: 'Y' }], codedBy: 'b', createdAt: 0, updatedAt: 0 },
			{ markerType: 'csv', id: '3', fileId: 'f', sourceRowId: 2, column: 'col1', codes: [{ codeId: 'X' }], codedBy: 'a', createdAt: 0, updatedAt: 0 },
		];
		const map = computeRowMarkersByCell(markers);
		expect(map.get('1::col1')).toHaveLength(2);
		expect(map.get('2::col1')).toHaveLength(1);
	});

	it('separa por column', () => {
		const markers: RowMarker[] = [
			{ markerType: 'csv', id: '1', fileId: 'f', sourceRowId: 1, column: 'col1', codes: [{ codeId: 'X' }], codedBy: 'a', createdAt: 0, updatedAt: 0 },
			{ markerType: 'csv', id: '2', fileId: 'f', sourceRowId: 1, column: 'col2', codes: [{ codeId: 'Y' }], codedBy: 'a', createdAt: 0, updatedAt: 0 },
		];
		const map = computeRowMarkersByCell(markers);
		expect(map.get('1::col1')).toHaveLength(1);
		expect(map.get('1::col2')).toHaveLength(1);
		expect(map.size).toBe(2);
	});

	it('input vazio retorna Map vazio', () => {
		expect(computeRowMarkersByCell([]).size).toBe(0);
	});
});
