import { describe, it, expect } from 'vitest';
import { findAnchor } from '../../src/pdf/textAnchor';

describe('findAnchor', () => {
	it('retorna range quando text casa unicamente e contexts conferem', () => {
		const pageText = 'hello world foo';
		expect(findAnchor(pageText, 'world', 'hello ', ' foo', 0)).toEqual({
			start: 6,
			end: 11,
		});
	});

	it('retorna null quando text não existe', () => {
		expect(findAnchor('hello world', 'xyz', '', '', 0)).toBeNull();
	});

	it('desambigua primeira ocorrência via contextAfter', () => {
		const pageText = 'aaa bbb aaa';
		expect(findAnchor(pageText, 'aaa', '', ' bbb', 0)).toEqual({
			start: 0,
			end: 3,
		});
	});

	it('desambigua segunda ocorrência via contextBefore', () => {
		const pageText = 'aaa bbb aaa';
		expect(findAnchor(pageText, 'aaa', 'bbb ', '', 0)).toEqual({
			start: 8,
			end: 11,
		});
	});

	it('quando contexts são idênticos, usa occurrenceIndex pra desambiguar', () => {
		const pageText = 'aaa aaa aaa';
		// context vazio casa com todas 3; occurrenceIndex escolhe
		expect(findAnchor(pageText, 'aaa', '', '', 0)).toEqual({ start: 0, end: 3 });
		expect(findAnchor(pageText, 'aaa', '', '', 1)).toEqual({ start: 4, end: 7 });
		expect(findAnchor(pageText, 'aaa', '', '', 2)).toEqual({ start: 8, end: 11 });
	});

	it('retorna null se occurrenceIndex excede matches', () => {
		expect(findAnchor('aaa aaa', 'aaa', '', '', 5)).toBeNull();
	});

	it('trata contextBefore truncado (text no início da página)', () => {
		const pageText = 'abc def';
		// contextBefore vazio (texto está no início) casa
		expect(findAnchor(pageText, 'abc', '', ' def', 0)).toEqual({ start: 0, end: 3 });
	});

	it('trata contextAfter truncado (text no fim da página)', () => {
		const pageText = 'abc def';
		expect(findAnchor(pageText, 'def', 'abc ', '', 0)).toEqual({ start: 4, end: 7 });
	});

	it('rejeita match cujo contextBefore NÃO casa', () => {
		// text="aaa" aparece 2x; contextBefore casa só com a segunda
		const pageText = 'aaa bbb aaa';
		// contextBefore "zzz " não casa com nenhuma das 2 posições
		expect(findAnchor(pageText, 'aaa', 'zzz ', '', 0)).toBeNull();
	});

	it('rejeita match cujo contextAfter NÃO casa', () => {
		const pageText = 'aaa bbb aaa';
		expect(findAnchor(pageText, 'aaa', '', ' zzz', 0)).toBeNull();
	});

	it('occurrenceIndex conta só matches filtrados por context', () => {
		// "x" aparece 4x; só 2 têm contextBefore="a" e contextAfter="y"
		const pageText = 'axy bxy axy bxy';
		//                 0123 4567 89
		// posições de "x": 1, 5, 9, 13
		// contextBefore="a" casa com posição 1 e 9 (não casa com 5 e 13 porque antes é "b")
		// contextAfter="y" casa com todas
		// filtered: [1, 9]
		expect(findAnchor(pageText, 'x', 'a', 'y', 0)).toEqual({ start: 1, end: 2 });
		expect(findAnchor(pageText, 'x', 'a', 'y', 1)).toEqual({ start: 9, end: 10 });
		expect(findAnchor(pageText, 'x', 'a', 'y', 2)).toBeNull();
	});

	it('funciona com texto multi-char e contexts longos', () => {
		const pageText = 'The quick brown fox jumps over the lazy dog. The quick brown fox rests.';
		// duas ocorrências de "The quick brown fox"
		const text = 'The quick brown fox';
		// contextAfter distingue
		expect(findAnchor(pageText, text, '', ' jumps', 0)).toEqual({
			start: 0,
			end: text.length,
		});
		expect(findAnchor(pageText, text, 'dog. ', ' rests', 0)).toEqual({
			start: 45,
			end: 45 + text.length,
		});
	});
});
