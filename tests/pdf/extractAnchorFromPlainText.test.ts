import { describe, it, expect } from 'vitest';
import { extractAnchorFromPlainText } from '../../src/pdf/extractAnchorFromPlainText';

describe('extractAnchorFromPlainText', () => {
	it('extrai text e retorna page 1-based (primeira página)', () => {
		const result = extractAnchorFromPlainText('hello world foo', [0], 6, 11);
		expect(result).toEqual({ page: 1, text: 'world' });
	});

	it('retorna page 2 (1-based) pra selection na segunda página', () => {
		const result = extractAnchorFromPlainText('page one\fpage two content', [0, 9], 14, 17);
		expect(result).toEqual({ page: 2, text: 'two' });
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
