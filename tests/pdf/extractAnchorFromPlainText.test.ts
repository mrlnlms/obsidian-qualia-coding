import { describe, it, expect } from 'vitest';
import { extractAnchorFromPlainText } from '../../src/pdf/extractAnchorFromPlainText';

describe('extractAnchorFromPlainText', () => {
	it('extrai text + page de selection em página única', () => {
		const result = extractAnchorFromPlainText('hello world foo', [0], 6, 11);
		expect(result).toEqual({ page: 0, text: 'world' });
	});

	it('determina page correta em PlainText multi-página', () => {
		const result = extractAnchorFromPlainText('page one\fpage two content', [0, 9], 14, 17);
		expect(result).toEqual({ page: 1, text: 'two' });
	});

	it('retorna null quando startPosition fora do plainText', () => {
		const result = extractAnchorFromPlainText('hello', [0], 100, 105);
		expect(result).toBeNull();
	});

	it('retorna null quando endPosition excede o plainText', () => {
		const result = extractAnchorFromPlainText('hello', [0], 0, 100);
		expect(result).toBeNull();
	});

	it('retorna null quando range é vazio/inverso', () => {
		const result = extractAnchorFromPlainText('hello', [0], 3, 3);
		expect(result).toBeNull();
	});
});
