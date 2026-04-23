import { describe, it, expect } from 'vitest';
import { resolveMarkerOffsets } from '../../src/pdf/resolveMarkerOffsets';

describe('resolveMarkerOffsets', () => {
	it('resolve offset absoluto em página única', () => {
		const result = resolveMarkerOffsets('hello world foo', [0], { page: 0, text: 'world' });
		expect(result).toEqual({ start: 6, end: 11, ambiguous: false });
	});

	it('resolve offset absoluto em página > 0 (adiciona pageStart)', () => {
		const result = resolveMarkerOffsets('page one\fpage two', [0, 9], { page: 1, text: 'two' });
		expect(result).toEqual({ start: 14, end: 17, ambiguous: false });
	});

	it('sinaliza ambiguidade quando text aparece múltiplas vezes na página', () => {
		const result = resolveMarkerOffsets('foo bar foo', [0], { page: 0, text: 'foo' });
		expect(result).toEqual({ start: 0, end: 3, ambiguous: true });
	});

	it('retorna null quando text não existe na página', () => {
		const result = resolveMarkerOffsets('hello', [0], { page: 0, text: 'xyz' });
		expect(result).toBeNull();
	});

	it('retorna null quando page está fora do range', () => {
		const result = resolveMarkerOffsets('hello', [0], { page: 5, text: 'hello' });
		expect(result).toBeNull();
	});

	it('não encontra text de outra página (escopo é por página)', () => {
		// 'two' só existe na page 1, não na page 0
		const result = resolveMarkerOffsets('page one\fpage two', [0, 9], { page: 0, text: 'two' });
		expect(result).toBeNull();
	});

	it('casa mesmo quando plainText tem espaços extras que DOM não tinha', () => {
		// pdfjs joined items geram double spaces: "International  Handbook"
		// DOM capturou como single: "International Handbook"
		const plainText = 'International  Handbook  of Survey';
		const result = resolveMarkerOffsets(plainText, [0], {
			page: 0,
			text: 'nternational Handbook of Survey',
		});
		expect(result).not.toBeNull();
		// offset retorna no plainText original (com doubles)
		expect(plainText.slice(result!.start, result!.end)).toContain('nternational');
		expect(plainText.slice(result!.start, result!.end)).toContain('Survey');
	});

	it('whitespace normalization também funciona com newlines/tabs', () => {
		const plainText = 'hello\n\tworld';
		const result = resolveMarkerOffsets(plainText, [0], { page: 0, text: 'hello world' });
		expect(result).not.toBeNull();
	});
});
