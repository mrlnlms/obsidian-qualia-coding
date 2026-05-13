import { describe, it, expect, beforeEach } from 'vitest';
import { renderPerEngineTable } from '../../../../src/core/icr/ui/overviewPerEngineTable';
import type { PairwiseReport } from '../../../../src/core/icr/reporter';

function makeReport(byEngine: Parameters<typeof renderPerEngineTable>[1][number]['report']['byEngine']): PairwiseReport {
	return {
		pair: ['c1', 'c2'],
		report: {
			byEngine,
			aggregate: { cohenKappa: {}, fleissKappa: 0, alphaNominal: 0, alphaBinary: 0, cuAlpha: 0 },
			weights: {},
			aggregateWarnings: [],
		},
	};
}

describe('renderPerEngineTable', () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	it('renderiza linhas só pra engines presentes no byEngine de algum par', () => {
		const reports: PairwiseReport[] = [
			makeReport({
				markdown: {
					cohenKappa: { 'c1|c2': { value: 0.7, perCode: {} } },
					fleissKappa: 0.7, alphaNominal: 0.7, alphaBinary: 0.7, cuAlpha: 0.7,
				},
				audio: {
					cohenKappa: { 'c1|c2': { value: 0.5, perCode: {} } },
					fleissKappa: 0.5, alphaNominal: 0.5, alphaBinary: 0.5, cuAlpha: 0.5,
				},
			}),
		];

		renderPerEngineTable(container, reports);

		const rows = container.querySelectorAll('.qc-cc-per-engine-table tbody tr');
		expect(rows.length).toBe(2);
		const labels = Array.from(rows).map(r => r.querySelector('td')?.textContent);
		expect(labels).toEqual(['markdown', 'audio']);
	});

	it('Cohen κ por linha = média dos pares', () => {
		const reports: PairwiseReport[] = [
			makeReport({
				markdown: {
					cohenKappa: { 'c1|c2': { value: 0.8, perCode: {} } },
					fleissKappa: 0.8, alphaNominal: 0.8, alphaBinary: 0.8, cuAlpha: 0.8,
				},
			}),
			makeReport({
				markdown: {
					cohenKappa: { 'c1|c2': { value: 0.4, perCode: {} } },
					fleissKappa: 0.4, alphaNominal: 0.4, alphaBinary: 0.4, cuAlpha: 0.4,
				},
			}),
		];

		renderPerEngineTable(container, reports);

		const tds = container.querySelectorAll('.qc-cc-per-engine-table tbody tr td');
		// linha markdown: [label, cohen, fleiss, alpha, alphaBinary, cuAlpha]
		expect(tds[0]?.textContent).toBe('markdown');
		expect(tds[1]?.textContent).toBe('0.60'); // média (0.8 + 0.4) / 2
	});

	it('bbox unified linha "spatial-bbox" agregando spatialBbox values', () => {
		const reports: PairwiseReport[] = [];
		const valuesByPair = new Map([
			['c1|c2', { spatialBbox: 0.6 }],
			['c1|c3', { spatialBbox: 0.4 }],
		]);

		renderPerEngineTable(container, reports, { mode: 'unified', valuesByPair });

		const rows = container.querySelectorAll('.qc-cc-per-engine-table tbody tr');
		expect(rows.length).toBe(1);
		const tds = rows[0]?.querySelectorAll('td');
		expect(tds?.[0]?.textContent).toBe('spatial-bbox');
		expect(tds?.[1]?.textContent).toBe('0.50');
	});

	it('bbox split: linhas separadas pdfShape + image', () => {
		const reports: PairwiseReport[] = [];
		const valuesByPair = new Map([
			['c1|c2', { pdfShape: 0.7, image: 0.3 }],
		]);

		renderPerEngineTable(container, reports, { mode: 'split', valuesByPair });

		const rows = container.querySelectorAll('.qc-cc-per-engine-table tbody tr');
		expect(rows.length).toBe(2);
		const labels = Array.from(rows).map(r => r.querySelector('td')?.textContent);
		expect(labels).toEqual(['pdfShape', 'image']);
	});

	it('sem dados em nenhuma engine renderiza fallback empty', () => {
		renderPerEngineTable(container, []);
		expect(container.querySelector('.qc-cc-empty')?.textContent).toContain('Sem dados');
	});

	it('csvRow: α-binary e cu-α viram "—" (vacuous em categorical sem boundary)', () => {
		const reports: PairwiseReport[] = [
			makeReport({
				csvRow: {
					cohenKappa: { 'c1|c2': { value: 0.5, perCode: {} } },
					fleissKappa: 0.5, alphaNominal: 0.5,
					alphaBinary: 1, // sentinel "não aplicável"
					cuAlpha: 1,     // sentinel "não aplicável"
				},
			}),
		];

		renderPerEngineTable(container, reports);

		const tds = container.querySelectorAll('.qc-cc-per-engine-table tbody tr td');
		// linha csv-row: [label, cohen, fleiss, alpha, alphaBinary, cuAlpha]
		expect(tds[0]?.textContent).toBe('csv-row');
		expect(tds[1]?.textContent).toBe('0.50');   // cohen
		expect(tds[2]?.textContent).toBe('0.50');   // fleiss
		expect(tds[3]?.textContent).toBe('0.50');   // alpha
		expect(tds[4]?.textContent).toBe('—');      // alphaBinary vacuous
		expect(tds[5]?.textContent).toBe('—');      // cuAlpha vacuous
		expect(tds[4]?.classList.contains('qc-kappa-na')).toBe(true);
		expect(tds[5]?.classList.contains('qc-kappa-na')).toBe(true);
	});

	it('markdown: α-binary e cu-α renderizam valor (boundary engine)', () => {
		const reports: PairwiseReport[] = [
			makeReport({
				markdown: {
					cohenKappa: { 'c1|c2': { value: 0.7, perCode: {} } },
					fleissKappa: 0.7, alphaNominal: 0.7, alphaBinary: 0.8, cuAlpha: 0.9,
				},
			}),
		];

		renderPerEngineTable(container, reports);

		const tds = container.querySelectorAll('.qc-cc-per-engine-table tbody tr td');
		expect(tds[4]?.textContent).toBe('0.80'); // alphaBinary
		expect(tds[5]?.textContent).toBe('0.90'); // cuAlpha
	});

	it('título indica "fonte de verdade"', () => {
		renderPerEngineTable(container, [makeReport({
			markdown: {
				cohenKappa: { 'c1|c2': { value: 0.7, perCode: {} } },
				fleissKappa: 0.7, alphaNominal: 0.7, alphaBinary: 0.7, cuAlpha: 0.7,
			},
		})]);
		const title = container.querySelector('.qc-cc-per-engine-title');
		expect(title?.textContent).toContain('apresentação primária');
		expect(title?.textContent).toContain('fonte de verdade');
	});
});
