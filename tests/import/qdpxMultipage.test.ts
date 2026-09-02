import { describe, expect, it } from 'vitest';
import type { ParsedQdpxCoding } from '../../src/import/qdpxAuthoring';
import type { ParsedSelection } from '../../src/import/qdpxImporter';
import {
	detectQdpxPdfMultipageGroups,
	resolveQdpxLogicalText,
	resolveQdpxMultipageRange,
} from '../../src/import/qdpxMultipage';

function coding(user: string, codeGuid: string): ParsedQdpxCoding {
	return {
		guid: `${user}-${codeGuid}`,
		creatingUserGuid: user,
		codeGuid,
		noteGuids: [],
		sourceCodingGuids: [`${user}-${codeGuid}`],
	};
}

function pdf(
	guid: string,
	page: number,
	codings: ParsedQdpxCoding[] = [coding('user-a', 'code-x')],
	name = 'A quotation spanning pages',
): ParsedSelection {
	return {
		guid,
		type: 'PDFSelection',
		page,
		name,
		createdAt: '2026-01-01T00:00:00Z',
		codings,
		codeGuids: codings.map((item) => item.codeGuid),
		noteGuids: [],
	};
}

function plain(guid: string, startPosition = 7, endPosition = 120): ParsedSelection {
	const codings = [coding('user-a', 'code-x')];
	return {
		guid,
		type: 'PlainTextSelection',
		startPosition,
		endPosition,
		codings,
		codeGuids: codings.map((item) => item.codeGuid),
		noteGuids: [],
	};
}

function pageItems(pages: string[][]): Array<Array<{ str?: string }>> {
	return pages.map((items) => items.map((str) => ({ str })));
}

describe('detectQdpxPdfMultipageGroups', () => {
	it('recognizes adjacent fragments with exactly one PlainText anchor', () => {
		const groups = detectQdpxPdfMultipageGroups([
			pdf('anchor', 5),
			pdf('continuation', 6),
			plain('anchor'),
		]);

		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			groupId: 'anchor',
			anchorGuid: 'anchor',
			selectionGuids: ['anchor', 'continuation'],
			viewerPages: [6, 7],
		});
	});

	it('rejects non-adjacent pages and duplicate page fragments', () => {
		expect(detectQdpxPdfMultipageGroups([
			pdf('anchor', 5), pdf('other', 7), plain('anchor'),
		])).toEqual([]);
		expect(detectQdpxPdfMultipageGroups([
			pdf('anchor', 5), pdf('other', 5), plain('anchor'),
		])).toEqual([]);
	});

	it('includes creating user in the semantic Coding multiset', () => {
		expect(detectQdpxPdfMultipageGroups([
			pdf('anchor', 5, [coding('user-a', 'code-x')]),
			pdf('continuation', 6, [coding('user-b', 'code-x')]),
			plain('anchor'),
		])).toEqual([]);
	});

	it('does not require or inspect a continued-by link', () => {
		const groups = detectQdpxPdfMultipageGroups([
			pdf('anchor', 5), pdf('continuation', 6), plain('anchor'),
		]);
		expect(groups).toHaveLength(1);
	});
});

describe('resolveQdpxMultipageRange', () => {
	it.each([
		['Figure 2', 5, '\r\nM', 'EMO: next marker'],
		['3.2.5 Autonomy', 7, ' ', 'For example, next paragraph'],
		['Developers with infra background', 7, '\r\n', 'No infra background'],
		['Which approach to use', 1, '\r\nA', 's for Approach 2'],
		['Giving developers operational responsibilities', 4, '', '8 Many organizations'],
		['People downstream', 5, '\r\n', '3. Automating all aspects'],
	])('reanchors the drifted Atlas endpoints for %s', (opening, drift, leakedTail, following) => {
		const target = `${opening} with enough distinctive content to identify the quotation and its intended final sentence.`;
		const before = 'unrelated preceding content ';
		const actualStart = before.length;
		const qdpxPlainText = `${before}${target}${leakedTail}${following}`;
		const group = detectQdpxPdfMultipageGroups([
			pdf('anchor', 0, undefined, `${opening} with enough distinctive content…`),
			pdf('continuation', 1, undefined, `${opening} with enough distinctive content…`),
			plain('anchor', actualStart + drift, actualStart + drift + target.length + leakedTail.length),
		])[0]!;

		expect(resolveQdpxLogicalText(group, qdpxPlainText)).toBe(target);
	});

	it('projects one complete logical range into DOM-aligned page segments', () => {
		const first = 'The quotation begins with a sufficiently distinctive sentence and reaches the page ending';
		const second = 'Running header continuation text remains in native order until the quotation finishes distinctly';
		const logical = 'The quotation begins with a sufficiently distinctive sentence and reaches the page ending continuation text remains in native order until the quotation finishes distinctly';
		const qdpxPlainText = `prefix ${logical} suffix`;
		const pdfPlainText = `intro ${first}\f${second} after`;
		const group = detectQdpxPdfMultipageGroups([
			pdf('anchor', 0), pdf('continuation', 1),
			plain('anchor', 7, 7 + logical.length),
		])[0]!;

		const result = resolveQdpxMultipageRange({
			group,
			qdpxPlainText,
			pdfPlainText,
			pdfPageStartOffsets: [0, pdfPlainText.indexOf('\f') + 1],
			pdfPageTextItems: pageItems([
				['intro', first],
				['Running header', 'continuation text remains in native order until the quotation finishes distinctly', 'after'],
			]),
		});

		expect(result.strategy).toBe('resolved');
		expect(result.segments).toEqual([
			expect.objectContaining({ page: 1, text: first, resolution: 'resolved', beginIndex: 1 }),
			expect.objectContaining({ page: 2, text: second, resolution: 'resolved', beginIndex: 0 }),
		]);
		expect(result.text).toBe(`${first}\f${second}`);
	});

	it('tolerates whitespace, soft hyphens, replacement characters, and NFKC ligatures', () => {
		const logical = 'Efficient office workflow starts here and continues until the distinctive final boundary';
		const pdfFirst = 'Eﬃcient  of\u00ADfice workflow starts here';
		const pdfSecond = 'Header and continues until the distinctive fi\uFFFDnal boundary';
		const qdpxPlainText = `x${logical}y`;
		const pdfPlainText = `${pdfFirst}\f${pdfSecond}`;
		const group = detectQdpxPdfMultipageGroups([
			pdf('anchor', 0), pdf('continuation', 1), plain('anchor', 1, 1 + logical.length),
		])[0]!;

		const result = resolveQdpxMultipageRange({
			group,
			qdpxPlainText,
			pdfPlainText,
			pdfPageStartOffsets: [0, pdfFirst.length + 1],
			pdfPageTextItems: pageItems([[pdfFirst], [pdfSecond]]),
		});

		expect(result.strategy).toBe('resolved');
		expect(result.text).toBe(`${pdfFirst}\f${pdfSecond}`);
	});

	it('preserves ordered pending segments when endpoints are ambiguous', () => {
		const logical = 'Repeated opening boundary with enough characters and a distinctive ending boundary for the quote';
		const repeated = 'Repeated opening boundary with enough characters';
		const pdfPlainText = `${repeated} filler ${repeated}\fending boundary for the quote`;
		const group = detectQdpxPdfMultipageGroups([
			pdf('anchor', 0), pdf('continuation', 1), plain('anchor', 0, logical.length),
		])[0]!;

		const result = resolveQdpxMultipageRange({
			group,
			qdpxPlainText: logical,
			pdfPlainText,
			pdfPageStartOffsets: [0, pdfPlainText.indexOf('\f') + 1],
			pdfPageTextItems: pageItems([[repeated, 'filler', repeated], ['ending boundary for the quote']]),
		});

		expect(result.strategy).toBe('pending');
		expect(result.reason).toBe('ambiguous');
		expect(result.segments).toEqual([
			expect.objectContaining({ page: 1, text: '', resolution: 'pending', importedSelectionGuid: 'anchor' }),
			expect.objectContaining({ page: 2, text: '', resolution: 'pending', importedSelectionGuid: 'continuation' }),
		]);
		expect(result.text).toBe(logical);
	});

	it('keeps the logical group pending when PDF.js text is unavailable', () => {
		const logical = 'A complete logical quotation remains available from the QDPX representation';
		const group = detectQdpxPdfMultipageGroups([
			pdf('anchor', 0), pdf('continuation', 1), plain('anchor', 0, logical.length),
		])[0]!;

		const result = resolveQdpxMultipageRange({
			group,
			qdpxPlainText: logical,
			pdfPlainText: null,
			pdfPageStartOffsets: null,
			pdfPageTextItems: null,
		});

		expect(result).toMatchObject({ strategy: 'pending', reason: 'pdf-unavailable', text: logical });
		expect(result.segments).toHaveLength(2);
	});
});
