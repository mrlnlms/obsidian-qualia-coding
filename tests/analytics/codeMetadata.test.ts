import { describe, it, expect } from 'vitest';
import { calculateCodeMetadata } from '../../src/analytics/data/codeMetadata';
import type { ConsolidatedData, FilterConfig, UnifiedMarker, UnifiedCode, SourceType } from '../../src/analytics/data/dataTypes';
import type { CaseVariablesRegistry } from '../../src/core/caseVariables/caseVariablesRegistry';
import type { PropertyType, VariableValue } from '../../src/core/caseVariables/caseVariablesTypes';

function filters(overrides: Partial<FilterConfig> = {}): FilterConfig {
	return {
		sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
		codes: [],
		excludeCodes: [],
		minFrequency: 1,
		...overrides,
	};
}

function mkMarker(id: string, source: SourceType, fileId: string, codes: string[]): UnifiedMarker {
	return { id, source, fileId, codes };
}

function mkCode(name: string, color = '#6200EE'): UnifiedCode {
	return { id: name, name, color, sources: ['markdown'] };
}

function mkData(markers: UnifiedMarker[], codes: UnifiedCode[]): ConsolidatedData {
	return {
		markers,
		codes,
		sources: { markdown: true, csv: false, image: false, pdf: false, audio: false, video: false },
		lastUpdated: Date.now(),
	};
}

/** Mock minimal of CaseVariablesRegistry — apenas a API consumida por calculateCodeMetadata. */
function mkRegistry(
	type: PropertyType,
	fileVars: Record<string, Record<string, VariableValue>>,
): CaseVariablesRegistry {
	return {
		getType: (_name: string) => type,
		getValuesForVariable: (name: string): VariableValue[] => {
			const seen = new Set<string>();
			const out: VariableValue[] = [];
			for (const vars of Object.values(fileVars)) {
				const v = vars[name];
				if (v === undefined) continue;
				const key = JSON.stringify(v);
				if (seen.has(key)) continue;
				seen.add(key);
				out.push(v);
			}
			return out;
		},
		getVariables: (fileId: string) => fileVars[fileId] ?? {},
	} as unknown as CaseVariablesRegistry;
}

describe('calculateCodeMetadata', () => {
	it('builds matrix for text variable (3 values × 2 codes)', () => {
		const data = mkData([
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'markdown', 'f1', ['a']),
			mkMarker('3', 'markdown', 'f2', ['a']),
			mkMarker('4', 'markdown', 'f3', ['b']),
			mkMarker('5', 'markdown', 'f3', ['b']),
		], [mkCode('a'), mkCode('b')]);

		const registry = mkRegistry('text', {
			f1: { region: 'sul' },
			f2: { region: 'sudeste' },
			f3: { region: 'nordeste' },
		});

		const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: true });

		expect(result.values.slice().sort()).toEqual(['nordeste', 'sudeste', 'sul']);
		expect(result.codes).toHaveLength(2);
		expect(result.grandTotal).toBe(5);
		expect(result.isMultitext).toBe(false);
		expect(result.hasMissingColumn).toBe(false);

		const rowA = result.codes.findIndex((c) => c.name === 'a');
		const idxSul = result.values.indexOf('sul');
		const idxNord = result.values.indexOf('nordeste');
		expect(result.matrix[rowA]![idxSul]).toBe(2); // 2 markers de 'a' em f1 (region=sul)
		expect(result.matrix[rowA]![idxNord]).toBe(0);
	});

	it('flattens multitext values into separate columns', () => {
		const data = mkData([
			mkMarker('1', 'markdown', 'f1', ['x']),
			mkMarker('2', 'markdown', 'f2', ['x']),
		], [mkCode('x')]);

		const registry = mkRegistry('multitext', {
			f1: { tags: ['a', 'b'] },
			f2: { tags: ['b', 'c'] },
		});

		const result = calculateCodeMetadata(data, filters(), 'tags', registry, { includeMissing: false });

		// Column labels are flattened tags, not the array stringified
		expect(result.values.slice().sort()).toEqual(['a', 'b', 'c']);
		expect(result.isMultitext).toBe(true);
		expect(result.stats[0]).toBeNull();

		// Marker 1 (f1, tags=[a,b]) contributes 1 to col 'a' and 1 to col 'b'
		// Marker 2 (f2, tags=[b,c]) contributes 1 to col 'b' and 1 to col 'c'
		const idxA = result.values.indexOf('a');
		const idxB = result.values.indexOf('b');
		const idxC = result.values.indexOf('c');
		expect(result.matrix[0]![idxA]).toBe(1);
		expect(result.matrix[0]![idxB]).toBe(2);
		expect(result.matrix[0]![idxC]).toBe(1);
	});

	it('adds (missing) column when includeMissing=true and there are markers without value', () => {
		const data = mkData([
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'markdown', 'f2', ['a']), // f2 sem valor da variável
		], [mkCode('a')]);

		const registry = mkRegistry('text', {
			f1: { region: 'sul' },
			// f2: ausente
		});

		const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: true });

		expect(result.values).toContain('(missing)');
		expect(result.hasMissingColumn).toBe(true);
		const idxMissing = result.values.indexOf('(missing)');
		expect(result.matrix[0]![idxMissing]).toBe(1);
	});

	it('excludes (missing) column when includeMissing=false', () => {
		const data = mkData([
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'markdown', 'f2', ['a']),
		], [mkCode('a')]);

		const registry = mkRegistry('text', {
			f1: { region: 'sul' },
		});

		const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: false });

		expect(result.values).not.toContain('(missing)');
		expect(result.hasMissingColumn).toBe(false);
		expect(result.grandTotal).toBe(1); // marker f2 sem valor é descartado
	});

	it('applies filters before counting', () => {
		const data = mkData([
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'pdf', 'f1', ['a']), // pdf será excluído pelo filtro
		], [mkCode('a')]);

		const registry = mkRegistry('text', {
			f1: { region: 'sul' },
		});

		const result = calculateCodeMetadata(
			data,
			filters({ sources: ['markdown'] }),
			'region',
			registry,
			{ includeMissing: false },
		);

		expect(result.grandTotal).toBe(1);
	});

	it('chi² stats[i] is null when isMultitext', () => {
		const data = mkData([
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'markdown', 'f2', ['a']),
		], [mkCode('a')]);

		const registry = mkRegistry('multitext', {
			f1: { tags: ['x'] },
			f2: { tags: ['y'] },
		});

		const result = calculateCodeMetadata(data, filters(), 'tags', registry, { includeMissing: false });

		expect(result.stats[0]).toBeNull();
	});

	it('chi² stats[i] is null when only 1 column (df=0)', () => {
		const data = mkData([
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'markdown', 'f2', ['a']),
		], [mkCode('a')]);

		const registry = mkRegistry('text', {
			f1: { region: 'sul' },
			f2: { region: 'sul' }, // 1 valor único
		});

		const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: false });

		expect(result.values).toEqual(['sul']);
		expect(result.stats[0]).toBeNull();
	});

	it('numeric variable uses quartile binning', () => {
		const data = mkData(
			Array.from({ length: 8 }, (_, i) => mkMarker(`m${i}`, 'markdown', `f${i}`, ['a'])),
			[mkCode('a')],
		);

		const fileVars: Record<string, Record<string, VariableValue>> = {};
		for (let i = 0; i < 8; i++) {
			fileVars[`f${i}`] = { age: i + 1 }; // 1..8
		}

		const registry = mkRegistry('number', fileVars);
		const result = calculateCodeMetadata(data, filters(), 'age', registry, { includeMissing: false });

		// ≥5 unique → quartile bins (4 columns)
		expect(result.values).toHaveLength(4);
		expect(result.values[0]).toMatch(/\[/); // bin label format "[min-q1]"
	});

	it('chi² rounding matches contract (3 decimals)', () => {
		const data = mkData([
			mkMarker('1', 'markdown', 'f1', ['a']),
			mkMarker('2', 'markdown', 'f1', ['a']),
			mkMarker('3', 'markdown', 'f2', ['a']),
			mkMarker('4', 'markdown', 'f2', ['b']),
			mkMarker('5', 'markdown', 'f2', ['b']),
		], [mkCode('a'), mkCode('b')]);

		const registry = mkRegistry('text', {
			f1: { region: 'sul' },
			f2: { region: 'norte' },
		});

		const result = calculateCodeMetadata(data, filters(), 'region', registry, { includeMissing: false });

		for (const stat of result.stats) {
			if (stat == null) continue;
			// 3 decimals
			expect(stat.chiSquare).toBe(Math.round(stat.chiSquare * 1000) / 1000);
			expect(stat.cramersV).toBe(Math.round(stat.cramersV * 1000) / 1000);
			// 4 decimals
			expect(stat.pValue).toBe(Math.round(stat.pValue * 10000) / 10000);
		}
	});
});
