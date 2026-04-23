import { describe, it, expect } from 'vitest';
import { resolveMarkerOffsets } from '../../src/pdf/resolveMarkerOffsets';

describe('resolveMarkerOffsets', () => {
	it('resolve offset absoluto em página única', () => {
		const plainText = 'hello world foo';
		const pageStartOffsets = [0];
		const result = resolveMarkerOffsets(plainText, pageStartOffsets, {
			page: 0,
			text: 'world',
			contextBefore: 'hello ',
			contextAfter: ' foo',
			occurrenceIndex: 0,
		});
		expect(result).toEqual({ start: 6, end: 11 });
	});

	it('resolve offset absoluto em página > 0 (adiciona pageStart)', () => {
		const plainText = 'page one\fpage two';
		//                 0         10
		// page 1 começa no offset 9 (depois do \f); pageText(1) = 'page two'
		const pageStartOffsets = [0, 9];
		const result = resolveMarkerOffsets(plainText, pageStartOffsets, {
			page: 1,
			text: 'two',
			contextBefore: 'page ',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(result).toEqual({ start: 14, end: 17 });
	});

	it('retorna null quando anchor não casa na página', () => {
		const plainText = 'hello world';
		const pageStartOffsets = [0];
		const result = resolveMarkerOffsets(plainText, pageStartOffsets, {
			page: 0,
			text: 'xyz',
			contextBefore: '',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(result).toBeNull();
	});

	it('retorna null quando page está fora do range', () => {
		const plainText = 'hello';
		const pageStartOffsets = [0];
		const result = resolveMarkerOffsets(plainText, pageStartOffsets, {
			page: 5,
			text: 'hello',
			contextBefore: '',
			contextAfter: '',
			occurrenceIndex: 0,
		});
		expect(result).toBeNull();
	});

	it('respeita occurrenceIndex dentro da página', () => {
		const plainText = 'aaa aaa aaa\fbbb';
		const pageStartOffsets = [0, 12];
		const result = resolveMarkerOffsets(plainText, pageStartOffsets, {
			page: 0,
			text: 'aaa',
			contextBefore: '',
			contextAfter: '',
			occurrenceIndex: 1,
		});
		expect(result).toEqual({ start: 4, end: 7 });
	});
});
