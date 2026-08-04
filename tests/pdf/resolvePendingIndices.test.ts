/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePendingIndices, resolvePendingIndicesWithDiagnostics, diagnosePendingTextSearch, isMarkerPending } from '../../src/pdf/resolvePendingIndices';

function makePage(nodes: string[]): HTMLElement {
	const page = document.createElement('div');
	nodes.forEach((t, i) => {
		const s = document.createElement('span');
		s.className = 'textLayerNode';
		s.setAttribute('data-idx', String(i));
		s.textContent = t;
		page.appendChild(s);
	});
	document.body.appendChild(page);
	return page;
}

describe('isMarkerPending', () => {
	it('true quando todos indices são 0', () => {
		expect(isMarkerPending({ beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 0 } as any)).toBe(true);
	});
	it('false se algum indice é não-zero', () => {
		expect(isMarkerPending({ beginIndex: 0, beginOffset: 0, endIndex: 1, endOffset: 0 } as any)).toBe(false);
	});
});

describe('resolvePendingIndices', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('resolve texto único dentro de um layerNode', () => {
		const page = makePage(['hello world foo']);
		const r = resolvePendingIndices(page, 'world');
		expect(r).toEqual({ beginIndex: 0, beginOffset: 6, endIndex: 0, endOffset: 11 });
	});

	it('resolve texto que cruza dois layerNodes', () => {
		const page = makePage(['abc', 'def']);
		// pageText = "abc def"; "c d" vai de node 0 offset 2 até node 1 offset 1
		const r = resolvePendingIndices(page, 'c d');
		expect(r).toEqual({ beginIndex: 0, beginOffset: 2, endIndex: 1, endOffset: 1 });
	});

	it('retorna null quando texto não existe', () => {
		const page = makePage(['hello']);
		expect(resolvePendingIndices(page, 'xyz')).toBeNull();
	});

	it('reporta diagnostico quando texto não existe', () => {
		const page = makePage(['hello world']);
		const r = resolvePendingIndicesWithDiagnostics(page, 'xyz');
		expect(r.resolved).toBeNull();
		expect(r.diagnostics).toMatchObject({
			reason: 'not-found',
			searchTextLength: 3,
			searchTextPreview: 'xyz',
			pageTextLength: 11,
			textLayerNodeCount: 1,
		});
	});

	it('reporta diagnostico de sucesso com tamanho da pagina', () => {
		const page = makePage(['hello world']);
		const r = resolvePendingIndicesWithDiagnostics(page, 'world');
		expect(r.resolved).toEqual({ beginIndex: 0, beginOffset: 6, endIndex: 0, endOffset: 11 });
		expect(r.diagnostics).toMatchObject({
			reason: 'resolved',
			searchTextLength: 5,
			pageTextLength: 11,
			textLayerNodeCount: 1,
		});
	});

	it('tolera whitespace diferente (DOM single space vs texto com newline)', () => {
		const page = makePage(['International Handbook', 'of Survey Methodology']);
		// DOM pageText: "International Handbook of Survey Methodology"
		// Marker text might have \n from cross-line capture
		const r = resolvePendingIndices(page, 'International Handbook\nof Survey');
		expect(r).not.toBeNull();
	});

	it('resolve texto importado com caractere de substituição no meio da palavra', () => {
		const page = makePage(['Product teams may involve those skills related to analysis, architecting and design']);
		const r = resolvePendingIndices(page, 'Product teams may involve those skills re�lated to analysis, architecting and design');
		expect(r).toEqual({ beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 83 });
	});

	it('resolve diferenças de hifenização e pontuação via chave textual única', () => {
		const pageText = 'Developers target faster deliveries while operations target stability and block deliveries';
		const page = makePage([pageText]);
		const r = resolvePendingIndices(page, 'Developers target faster de�liveries, while operations target stability and block de-liveries.');
		expect(r).toEqual({ beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: pageText.length });
	});

	it('não aceita fallback textual ambíguo', () => {
		const page = makePage(['Alpha beta gamma delta alpha beta gamma delta']);
		const r = resolvePendingIndices(page, 'Alpha beta gamma delta');
		expect(r).toEqual({ beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 22 });

		const fallbackAmbiguous = resolvePendingIndices(page, 'Alpha beta gamma, delta.');
		expect(fallbackAmbiguous).toBeNull();
	});

	it('ancora por prefixo textual único quando o texto importado completo não é contíguo na página', () => {
		const page = makePage([
			'This gives autonomy to product teams. We wrote some memos to clarify this meaning as follows: MEMO',
			'unrelated right-column text before the rest of the imported quotation',
		]);
		const r = resolvePendingIndices(
			page,
			'This gives autonomy to product  teams. We wrote some memos to clarify this meaning as  follows:  MEMO: Horizontal (cross) DevOps teams',
		);
		expect(r).toEqual({ beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 90 });
	});

	it('diagnostica melhor janela textual quando o prefixo não aparece', () => {
		const page = makePage(['middle quotation segment appears here with enough lexical content to identify the page']);
		const d = diagnosePendingTextSearch(
			page,
			'prefix from another extraction order middle quotation segment appears here with enough lexical content suffix',
		);
		expect(d.bestPrefixKeyLength).toBe(0);
		expect(d.bestWindowKeyLength).toBeGreaterThanOrEqual(48);
		expect(d.bestWindowTextPreview).toContain('middle quotation segment');
	});
});
