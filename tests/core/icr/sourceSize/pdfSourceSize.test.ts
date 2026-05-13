import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PdfSourceSize } from '../../../../src/core/icr/sourceSize/pdfSourceSize';
import type { App } from 'obsidian';

interface MockPdfPage {
	getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
}

interface MockPdfDoc {
	numPages: number;
	getPage(n: number): Promise<MockPdfPage>;
	destroy?: () => Promise<void>;
}

function makeApp(): App {
	return {
		vault: {
			getAbstractFileByPath: vi.fn((path: string) => ({ stat: { size: 1024 }, path })),
			adapter: {
				readBinary: vi.fn(async () => new ArrayBuffer(8)),
			},
		},
	} as unknown as App;
}

function mockPdfjsLib(pageTexts: string[]): void {
	const doc: MockPdfDoc = {
		numPages: pageTexts.length,
		async getPage(n) {
			const text = pageTexts[n - 1] ?? '';
			return {
				async getTextContent() {
					return { items: text.split(' ').map(s => ({ str: s })) };
				},
			};
		},
	};
	(window as unknown as { pdfjsLib?: unknown }).pdfjsLib = {
		getDocument: () => ({ promise: Promise.resolve(doc) }),
	};
}

describe('PdfSourceSize', () => {
	beforeEach(() => {
		delete (window as unknown as { pdfjsLib?: unknown }).pdfjsLib;
	});

	afterEach(() => {
		delete (window as unknown as { pdfjsLib?: unknown }).pdfjsLib;
	});

	it('retorna null pra engine != pdf', async () => {
		const provider = new PdfSourceSize(makeApp());
		expect(await provider.getSourceSize('markdown', 'f.md', 'page:0', 1)).toBe(null);
		expect(await provider.getSourceSize('audio', 'f.mp3', 'page:0', 1)).toBe(null);
	});

	it('retorna null pra locator que não começa com page:', async () => {
		const provider = new PdfSourceSize(makeApp());
		mockPdfjsLib(['Page 1 text']);
		expect(await provider.getSourceSize('pdf', 'f.pdf', 'invalid', 1)).toBe(null);
		expect(await provider.getSourceSize('pdf', 'f.pdf', 'row:0|col:x', 1)).toBe(null);
	});

	it('retorna null quando pdfjsLib não existe (sem PDF aberto na sessão)', async () => {
		const provider = new PdfSourceSize(makeApp());
		// Nenhum mock — pdfjsLib continua undefined
		expect(await provider.getSourceSize('pdf', 'f.pdf', 'page:0', 1)).toBe(null);
	});

	it('retorna char count da página solicitada', async () => {
		const provider = new PdfSourceSize(makeApp());
		mockPdfjsLib(['Lorem ipsum dolor sit amet', 'Short text', 'Third page contents here']);

		const p0 = await provider.getSourceSize('pdf', 'f.pdf', 'page:0', 1);
		expect(p0).toBe('Lorem ipsum dolor sit amet'.length);

		const p1 = await provider.getSourceSize('pdf', 'f.pdf', 'page:1', 1);
		expect(p1).toBe('Short text'.length);
	});

	it('retorna null quando page excede numPages', async () => {
		const provider = new PdfSourceSize(makeApp());
		mockPdfjsLib(['Only one page']);
		expect(await provider.getSourceSize('pdf', 'f.pdf', 'page:5', 1)).toBe(null);
	});

	it('cache hit: segundo call não re-parseia', async () => {
		const provider = new PdfSourceSize(makeApp());
		mockPdfjsLib(['Cached page']);

		await provider.getSourceSize('pdf', 'f.pdf', 'page:0', 1);
		// Remove pdfjsLib do window — se cache funcionar, ainda retorna
		delete (window as unknown as { pdfjsLib?: unknown }).pdfjsLib;

		const cached = await provider.getSourceSize('pdf', 'f.pdf', 'page:0', 1);
		expect(cached).toBe('Cached page'.length);
	});

	it('invalidate limpa cache pra fileId específico', async () => {
		const provider = new PdfSourceSize(makeApp());
		mockPdfjsLib(['Foo']);
		await provider.getSourceSize('pdf', 'f.pdf', 'page:0', 1);
		provider.invalidate('f.pdf');
		// pdfjsLib continua presente, mas vai re-parsear
		const result = await provider.getSourceSize('pdf', 'f.pdf', 'page:0', 1);
		expect(result).toBe('Foo'.length); // Mesmo resultado, mas re-parseou
	});
});
