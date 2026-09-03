import { describe, it, expect } from 'vitest';
import { buildPlainText, type PdfLikeDocument } from '../../src/pdf/pdfPlainText';

/**
 * Constrói um doc duck-typed pra teste puro. Não depende do pdfjs real.
 */
function makeDoc(pages: string[][]): PdfLikeDocument {
	return {
		numPages: pages.length,
		getPage: async (n: number) => ({
			getTextContent: async () => ({
				items: pages[n - 1]!.map((str) => ({ str })),
			}),
		}),
	};
}

describe('buildPlainText', () => {
	it('uma página com um item', async () => {
		const { plainText, pageStartOffsets } = await buildPlainText(makeDoc([['hello']]));
		expect(plainText).toBe('hello');
		expect(pageStartOffsets).toEqual([0]);
	});

	it('uma página com múltiplos items junta com espaço', async () => {
		const { plainText } = await buildPlainText(makeDoc([['hello', 'world', 'foo']]));
		expect(plainText).toBe('hello world foo');
	});

	it('duas páginas separadas por \\f', async () => {
		const { plainText, pageStartOffsets } = await buildPlainText(
			makeDoc([['page', 'one'], ['page', 'two']]),
		);
		expect(plainText).toBe('page one\fpage two');
		expect(pageStartOffsets).toEqual([0, 9]);
	});

	it('página vazia retorna string vazia nessa posição', async () => {
		const { plainText, pageStartOffsets } = await buildPlainText(
			makeDoc([['hello'], [], ['world']]),
		);
		expect(plainText).toBe('hello\f\fworld');
		expect(pageStartOffsets).toEqual([0, 6, 7]);
	});

	it('items com str undefined/vazios são filtrados (sem gerar espaços extras)', async () => {
		const doc: PdfLikeDocument = {
			numPages: 1,
			getPage: async () => ({
				getTextContent: async () => ({
					items: [{ str: 'hello' }, {}, { str: 'world' }] as Array<{ str?: string }>,
				}),
			}),
		};
		const { plainText } = await buildPlainText(doc);
		expect(plainText).toBe('hello world');
	});

	it('strip whitespace leading/trailing de cada item — sem duplicar espaços', async () => {
		// Bug real observado: pdfjs retorna items com padding interno
		// ("Language: " + " Evaluating"), que joined por ' ' vira "Language:  Evaluating"
		// e não casa com a versão DOM ("Language: Evaluating")
		const { plainText } = await buildPlainText(makeDoc([['Language: ', ' Evaluating', ' Obsidian']]));
		expect(plainText).toBe('Language: Evaluating Obsidian');
	});

	it('N páginas produzem N offsets', async () => {
		const pages: string[][] = [['a'], ['b'], ['c'], ['d']];
		const { pageStartOffsets } = await buildPlainText(makeDoc(pages));
		expect(pageStartOffsets).toEqual([0, 2, 4, 6]);
	});

	it('normaliza whitespace entre items mas preserva whitespace INTERNO', async () => {
		// Items são trimados nas pontas, mas espaço DENTRO do item sobrevive
		const { plainText } = await buildPlainText(makeDoc([['hello  world', 'foo']]));
		expect(plainText).toBe('hello  world foo');
	});

	it('retém os text items por página no mesmo passe de extração', async () => {
		const result = await buildPlainText(makeDoc([[' page one '], ['page', 'two']]));
		expect(result.pageTextItems).toEqual([
			[{ str: ' page one ' }],
			[{ str: 'page' }, { str: 'two' }],
		]);
	});

	it('retém geometria e caracteres necessários para projeção headless', async () => {
		const result = await buildPlainText({
			numPages: 1,
			getPage: async () => ({
				getTextContent: async () => ({
					items: [{
						str: 'word', dir: 'ltr', width: 40, height: 10,
						transform: [1, 0, 0, 1, 10, 70], hasEOL: false,
						chars: [{ c: 'w', u: 'w', r: [10, 70, 20, 80] }],
					}],
				}),
			}),
		});

		expect(result.pageTextItems[0]![0]).toEqual({
			str: 'word', dir: 'ltr', width: 40, height: 10,
			transform: [1, 0, 0, 1, 10, 70],
			fontName: undefined,
			hasEOL: false,
			chars: [{ c: 'w', u: 'w', r: [10, 70, 20, 80] }],
		});
	});
});
