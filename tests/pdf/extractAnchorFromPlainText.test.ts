import { describe, it, expect } from 'vitest';
import { extractAnchorFromPlainText } from '../../src/pdf/extractAnchorFromPlainText';

describe('extractAnchorFromPlainText', () => {
	it('extrai anchor de PlainTextSelection em página única', () => {
		const plainText = 'hello world foo';
		const pageStartOffsets = [0];
		const result = extractAnchorFromPlainText(plainText, pageStartOffsets, 6, 11);
		expect(result).toEqual({
			page: 0,
			anchor: {
				text: 'world',
				contextBefore: 'hello ',
				contextAfter: ' foo',
				occurrenceIndex: 0,
			},
		});
	});

	it('determina page correta em PlainText multi-página', () => {
		const plainText = 'page one\fpage two content';
		// pageStart = [0, 9]
		const pageStartOffsets = [0, 9];
		// "two content" começa no offset 14, ocupa "two" = 14..17
		const result = extractAnchorFromPlainText(plainText, pageStartOffsets, 14, 17);
		expect(result).not.toBeNull();
		expect(result!.page).toBe(1);
		expect(result!.anchor.text).toBe('two');
		expect(result!.anchor.contextBefore).toBe('page ');
		expect(result!.anchor.contextAfter).toBe(' content');
	});

	it('occurrenceIndex=0 quando contexts já desambiguam', () => {
		const plainText = 'aaa bbb aaa\fccc';
		const pageStartOffsets = [0, 12];
		// Segundo "aaa" em page 0 tem contextBefore='bbb ' único
		const result = extractAnchorFromPlainText(plainText, pageStartOffsets, 8, 11);
		expect(result!.page).toBe(0);
		expect(result!.anchor.text).toBe('aaa');
		expect(result!.anchor.contextBefore).toBe('aaa bbb ');
		expect(result!.anchor.occurrenceIndex).toBe(0);
	});

	it('occurrenceIndex reseta por página (não conta de páginas anteriores)', () => {
		const plainText = 'aaa\faaa';
		const pageStartOffsets = [0, 4];
		// Na página 1, "aaa" está no offset 4 (localStart=0)
		const result = extractAnchorFromPlainText(plainText, pageStartOffsets, 4, 7);
		expect(result!.page).toBe(1);
		expect(result!.anchor.occurrenceIndex).toBe(0);
	});

	it('retorna null quando startPosition fora do plainText', () => {
		const result = extractAnchorFromPlainText('hello', [0], 100, 105);
		expect(result).toBeNull();
	});
});
