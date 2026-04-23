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

	it('items com str undefined são tratados como vazios', async () => {
		const doc: PdfLikeDocument = {
			numPages: 1,
			getPage: async () => ({
				getTextContent: async () => ({
					items: [{ str: 'hello' }, {}, { str: 'world' }] as Array<{ str?: string }>,
				}),
			}),
		};
		const { plainText } = await buildPlainText(doc);
		expect(plainText).toBe('hello  world');
	});

	it('N páginas produzem N offsets', async () => {
		const pages: string[][] = [['a'], ['b'], ['c'], ['d']];
		const { pageStartOffsets } = await buildPlainText(makeDoc(pages));
		expect(pageStartOffsets).toEqual([0, 2, 4, 6]);
	});

	it('preserva whitespace interno dos items', async () => {
		const { plainText } = await buildPlainText(makeDoc([['  hello  ', 'world']]));
		expect(plainText).toBe('  hello   world');
	});
});
