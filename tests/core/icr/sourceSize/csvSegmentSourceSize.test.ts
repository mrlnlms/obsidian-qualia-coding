import { describe, it, expect } from 'vitest';
import { CsvSegmentSourceSize } from '../../../../src/core/icr/sourceSize/csvSegmentSourceSize';
import type { CsvCodingModel } from '../../../../src/csv/csvCodingModel';
import type { RowProvider, MarkerRef } from '../../../../src/csv/duckdb';

function makeMockRowProvider(rows: Record<number, Record<string, string>>): RowProvider {
	return {
		async getMarkerText(ref: MarkerRef): Promise<string | null> {
			return rows[ref.sourceRowId]?.[ref.column] ?? null;
		},
		async batchGetMarkerText() {
			return new Map();
		},
		async getRowCount() {
			return Object.keys(rows).length;
		},
		async dispose() {},
	};
}

function makeMockCsvModel(opts: {
	lazyProviders?: Record<string, RowProvider>;
	rowDataCache?: Map<string, Record<string, string>[]>;
}): CsvCodingModel {
	return {
		rowDataCache: opts.rowDataCache ?? new Map(),
		getLazyProvider(fileId: string): RowProvider | undefined {
			return opts.lazyProviders?.[fileId];
		},
	} as unknown as CsvCodingModel;
}

describe('CsvSegmentSourceSize', () => {
	it('retorna null pra engine != csvSegment', async () => {
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({}));
		expect(await provider.getSourceSize('markdown', 'f.csv', 'row:0|col:x', 1)).toBe(null);
		expect(await provider.getSourceSize('csvRow', 'f.csv', 'row:0|col:x', 1)).toBe(null);
	});

	it('retorna null pra locator que não bate regex', async () => {
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({}));
		expect(await provider.getSourceSize('csvSegment', 'f.csv', 'invalid', 1)).toBe(null);
		expect(await provider.getSourceSize('csvSegment', 'f.csv', 'page:0', 1)).toBe(null);
	});

	it('retorna null quando nem eager nem lazy existem (CSV fechado)', async () => {
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({}));
		expect(await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:title', 1)).toBe(null);
	});

	it('eager: retorna char count via rowDataCache (CSV pequeno em memória)', async () => {
		const rowDataCache = new Map([
			['f.csv', [
				{ title: 'Lorem ipsum', body: 'Longer body text here' },
				{ title: 'Short', body: '' },
			]],
		]);
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({ rowDataCache }));

		const titleR0 = await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:title', 1);
		expect(titleR0).toBe('Lorem ipsum'.length);

		const bodyR0 = await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:body', 1);
		expect(bodyR0).toBe('Longer body text here'.length);
	});

	it('lazy: fallback pro RowProvider quando rowDataCache sem o file', async () => {
		const rowProvider = makeMockRowProvider({
			0: { title: 'Lazy text' },
		});
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({
			lazyProviders: { 'big.csv': rowProvider },
		}));

		const result = await provider.getSourceSize('csvSegment', 'big.csv', 'row:0|col:title', 1);
		expect(result).toBe('Lazy text'.length);
	});

	it('eager tem precedência sobre lazy quando ambos existem', async () => {
		const rowDataCache = new Map([
			['f.csv', [{ title: 'EAGER' }]],
		]);
		const lazyProvider = makeMockRowProvider({ 0: { title: 'LAZY (não deveria ser usado)' } });
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({
			rowDataCache,
			lazyProviders: { 'f.csv': lazyProvider },
		}));

		expect(await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:title', 1)).toBe('EAGER'.length);
	});

	it('retorna null quando célula não existe (eager)', async () => {
		const rowDataCache = new Map([['f.csv', [{ title: 'X' }]]]);
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({ rowDataCache }));
		expect(await provider.getSourceSize('csvSegment', 'f.csv', 'row:99|col:title', 1)).toBe(null);
		expect(await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:ghost', 1)).toBe(null);
	});

	it('cache hit: segundo call não consulta rowDataCache/provider', async () => {
		let calls = 0;
		const rowProvider: RowProvider = {
			async getMarkerText() {
				calls++;
				return 'cached text';
			},
			async batchGetMarkerText() { return new Map(); },
			async getRowCount() { return 1; },
			async dispose() {},
		};
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({
			lazyProviders: { 'f.csv': rowProvider },
		}));

		await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:title', 1);
		await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:title', 1);
		expect(calls).toBe(1);
	});

	it('invalidate limpa cache pra fileId', async () => {
		let calls = 0;
		const rowProvider: RowProvider = {
			async getMarkerText() { calls++; return 'X'; },
			async batchGetMarkerText() { return new Map(); },
			async getRowCount() { return 1; },
			async dispose() {},
		};
		const provider = new CsvSegmentSourceSize(makeMockCsvModel({
			lazyProviders: { 'f.csv': rowProvider },
		}));

		await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:title', 1);
		provider.invalidate('f.csv');
		await provider.getSourceSize('csvSegment', 'f.csv', 'row:0|col:title', 1);
		expect(calls).toBe(2);
	});
});
