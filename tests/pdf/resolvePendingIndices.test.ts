/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePendingIndices, resolvePendingIndicesInTextContentItems, resolvePendingIndicesWithDiagnostics, diagnosePendingTextSearch, isMarkerPending } from '../../src/pdf/resolvePendingIndices';

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

function rect(left: number, top: number, width: number, height: number): DOMRect {
	return {
		x: left,
		y: top,
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		toJSON: () => ({}),
	} as DOMRect;
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

	it('resolve por janela textual única somente quando o fallback está habilitado', () => {
		const page = makePage(['middle quotation segment appears here with enough lexical content to identify the page']);
		const text = 'prefix from another extraction order middle quotation segment appears here with enough lexical content suffix';

		expect(resolvePendingIndicesWithDiagnostics(page, text).resolved).toBeNull();

		const r = resolvePendingIndicesWithDiagnostics(page, text, {
			allowWindowFallback: true,
			minWindowKeyLength: 48,
		});
		expect(r.resolved).toEqual({ beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 63 });
		expect(r.diagnostics.resolvedBy).toBe('window-text');
		expect(r.diagnostics.bestWindowKeyLength).toBeGreaterThanOrEqual(48);
	});

	it('não resolve janela textual ambígua mesmo com fallback habilitado', () => {
		const page = makePage([
			'middle quotation segment appears here with enough lexical content',
			'middle quotation segment appears here with enough lexical content',
		]);
		const text = 'prefix from another extraction order middle quotation segment appears here with enough lexical content suffix';
		const r = resolvePendingIndicesWithDiagnostics(page, text, {
			allowWindowFallback: true,
			minWindowKeyLength: 48,
		});

		expect(r.resolved).toBeNull();
		expect(r.diagnostics.reason).toBe('not-found');
	});

	it('resolve fragmento curto por contexto de PlainTextSelection exportado', () => {
		const page = makePage([
			'Collaboration and communications among team members can considerably increase by establishing cross-functional teams',
		]);
		const r = resolvePendingIndicesWithDiagnostics(page, 'communica�tions', {
			plainTextContext: {
				source: 'qdpx-plain-text-selection',
				startPosition: 100,
				endPosition: 114,
				before: 'delivery to give the signoff. Collaboration and commun',
				exact: 'ications among',
				after: 'team members can considerably increase by establishing cross-functional teams',
				resolutionStrategy: 'name+length',
			},
		});

		expect(r.resolved).toEqual({ beginIndex: 0, beginOffset: 18, endIndex: 0, endOffset: 32 });
		expect(r.diagnostics.resolvedBy).toBe('plain-text-context');
		expect(r.diagnostics.plainTextContextBestWindowKeyLength).toBeGreaterThanOrEqual(48);
	});

	it('não resolve fragmento curto por contexto quando a janela contextual é ambígua', () => {
		const text = 'Collaboration and communications among team members can considerably increase';
		const page = makePage([text, text]);
		const r = resolvePendingIndicesWithDiagnostics(page, 'communica�tions', {
			plainTextContext: {
				source: 'qdpx-plain-text-selection',
				before: 'Collaboration and commun',
				exact: 'ications among',
				after: 'team members can considerably increase',
				resolutionStrategy: 'offset',
			},
		});

		expect(r.resolved).toBeNull();
		expect(r.diagnostics.plainTextContextAttempted).toBe(true);
	});

	it('usa bbox como pista textual local quando fallback global por chave é ambíguo', () => {
		const page = makePage([
			'Alpha beta gamma delta epsilon zeta eta',
			'unrelated middle text',
			'Alpha beta gamma delta epsilon zeta eta',
		]);
		page.getBoundingClientRect = () => rect(0, 0, 1000, 1000);
		const nodes = Array.from(page.querySelectorAll<HTMLElement>('.textLayerNode'));
		nodes[0]!.getBoundingClientRect = () => rect(100, 100, 200, 20);
		nodes[1]!.getBoundingClientRect = () => rect(100, 300, 200, 20);
		nodes[2]!.getBoundingClientRect = () => rect(100, 500, 200, 20);

		const r = resolvePendingIndicesWithDiagnostics(page, 'Alpha beta gamma, delta epsilon zeta eta.', {
			pageNumber: 1,
			bboxHint: {
				source: 'qdpx-pdf-selection',
				page: 1,
				x: 9,
				y: 49,
				w: 25,
				h: 4,
			},
		});

		expect(r.resolved).toEqual({ beginIndex: 2, beginOffset: 0, endIndex: 2, endOffset: 39 });
		expect(r.diagnostics.resolvedBy).toBe('bbox-text');
		expect(r.diagnostics.bboxTextLayerNodeCount).toBe(1);
	});

	it('permite prefixo único menor dentro da bbox restrita', () => {
		const page = makePage([
			'Infra as development collaborator Not-high table fragment',
			'unrelated middle text',
			'Infra as development collaborator Not-high table fragment',
		]);
		page.getBoundingClientRect = () => rect(0, 0, 1000, 1000);
		const nodes = Array.from(page.querySelectorAll<HTMLElement>('.textLayerNode'));
		nodes[0]!.getBoundingClientRect = () => rect(100, 100, 300, 20);
		nodes[1]!.getBoundingClientRect = () => rect(100, 300, 200, 20);
		nodes[2]!.getBoundingClientRect = () => rect(100, 500, 300, 20);

		const r = resolvePendingIndicesWithDiagnostics(page, 'Infra as development collaborator. The infrastructure team supports products.', {
			pageNumber: 1,
			bboxHint: {
				source: 'qdpx-pdf-selection',
				page: 1,
				x: 9,
				y: 49,
				w: 35,
				h: 4,
			},
		});

		expect(r.resolved).toEqual({ beginIndex: 2, beginOffset: 0, endIndex: 2, endOffset: 30 });
		expect(r.diagnostics.resolvedBy).toBe('bbox-text');
		expect(r.diagnostics.bboxBestPrefixKeyLength).toBeGreaterThanOrEqual(24);
	});

	it('ignora bbox quando a página do hint não corresponde à página resolvida', () => {
		const page = makePage([
			'Alpha beta gamma delta epsilon zeta eta',
			'unrelated middle text',
			'Alpha beta gamma delta epsilon zeta eta',
		]);
		page.getBoundingClientRect = () => rect(0, 0, 1000, 1000);
		const nodes = Array.from(page.querySelectorAll<HTMLElement>('.textLayerNode'));
		nodes[0]!.getBoundingClientRect = () => rect(100, 100, 200, 20);
		nodes[1]!.getBoundingClientRect = () => rect(100, 300, 200, 20);
		nodes[2]!.getBoundingClientRect = () => rect(100, 500, 200, 20);

		const r = resolvePendingIndicesWithDiagnostics(page, 'Alpha beta gamma, delta epsilon zeta eta.', {
			pageNumber: 2,
			bboxHint: {
				source: 'qdpx-pdf-selection',
				page: 1,
				x: 9,
				y: 49,
				w: 25,
				h: 4,
			},
		});

		expect(r.resolved).toBeNull();
		expect(r.diagnostics.resolvedBy).toBeUndefined();
		expect(r.diagnostics.bboxTextLayerNodeCount).toBeUndefined();
	});

	it('diagnostica o texto local da bbox quando a busca na região falha', () => {
		const page = makePage([
			'wrong local text in the hinted rectangle',
			'Alpha beta gamma delta epsilon zeta eta',
			'Alpha beta gamma delta epsilon zeta eta',
		]);
		page.getBoundingClientRect = () => rect(0, 0, 1000, 1000);
		const nodes = Array.from(page.querySelectorAll<HTMLElement>('.textLayerNode'));
		nodes[0]!.getBoundingClientRect = () => rect(100, 100, 200, 20);
		nodes[1]!.getBoundingClientRect = () => rect(100, 300, 200, 20);
		nodes[2]!.getBoundingClientRect = () => rect(100, 500, 200, 20);

		const r = resolvePendingIndicesWithDiagnostics(page, 'Alpha beta gamma, delta epsilon zeta eta.', {
			pageNumber: 1,
			bboxHint: {
				source: 'qdpx-pdf-selection',
				page: 1,
				x: 9,
				y: 9,
				w: 25,
				h: 4,
			},
		});

		expect(r.resolved).toBeNull();
		expect(r.diagnostics.bboxAttempted).toBe(true);
		expect(r.diagnostics.bboxTextLayerNodeCount).toBe(1);
		expect(r.diagnostics.bboxTextPreview).toContain('wrong local text');
		expect(r.diagnostics.bboxBestPrefixKeyLength).toBe(0);
		expect(r.diagnostics.bboxBestWindowKeyLength).toBe(0);
	});
});

describe('resolvePendingIndicesInTextContentItems', () => {
	it('mapeia correspondência exata para índices e offsets dos itens PDF.js', () => {
		const items = [
			{ str: 'Header' },
			{ str: 'The development tools ' },
			{ str: 'are reliable.' },
			{ str: 'Footer' },
		];
		const result = resolvePendingIndicesInTextContentItems(items, 'The development tools are reliable.');

		expect(result.resolved).toEqual({
			beginIndex: 1,
			beginOffset: 0,
			endIndex: 2,
			endOffset: items[2]!.str.indexOf('.'),
		});
		expect(result.diagnostics).toMatchObject({
			reason: 'resolved',
			resolvedBy: 'text-content-items',
			textContentItemsMatchKind: 'exact',
			textContentItemsEditDistance: 0,
		});
	});

	it('tolera uma diferença mínima de glifo depois de um prefixo único', () => {
		const items = [{ str: 'The infrastructure team supports a reliable development workflow.' }];
		const result = resolvePendingIndicesInTextContentItems(
			items,
			'The infrastructure team supports a reliable development workfiow.',
		);

		expect(result.resolved).toEqual({
			beginIndex: 0,
			beginOffset: 0,
			endIndex: 0,
			endOffset: items[0]!.str.indexOf('.'),
		});
		expect(result.diagnostics).toMatchObject({
			resolvedBy: 'text-content-items',
			textContentItemsMatchKind: 'bounded-fuzzy',
			textContentItemsEditDistance: 1,
		});
	});

	it('rejeita fallback difuso quando o prefixo aparece mais de uma vez', () => {
		const repeated = 'The infrastructure team supports a reliable development workflow.';
		const result = resolvePendingIndicesInTextContentItems(
			[{ str: repeated }, { str: repeated }],
			'The infrastructure team supports a reliable development workfiow.',
		);

		expect(result.resolved).toBeNull();
		expect(result.diagnostics.reason).toBe('not-found');
	});

	it('rejeita candidato único que excede a distância de edição permitida', () => {
		const result = resolvePendingIndicesInTextContentItems(
			[{ str: 'Unique infrastructure quotation prefix followed by unrelated table data and numeric columns.' }],
			'Unique infrastructure quotation prefix followed by a completely different narrative conclusion.',
		);

		expect(result.resolved).toBeNull();
		expect(result.diagnostics.reason).toBe('not-found');
	});
});
