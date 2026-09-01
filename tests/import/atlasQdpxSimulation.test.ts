import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
	parseSources,
	resolveImportedPdfPage,
	resolveImportedPdfText,
	type ParsedSelection,
	type ParsedSource,
} from '../../src/import/qdpxImporter';
import { parseXml } from '../../src/import/xmlParser';

const DEFAULT_FIXTURE_DIR = resolve(
	process.cwd(),
	'../../..',
	'QUALIA-QDPX/QDPX Tests/UnifiedDevOps Selective Coding ITE5 ICA',
);
const FIXTURE_DIR = process.env.ATLAS_QDPX_FIXTURE_DIR ?? DEFAULT_FIXTURE_DIR;
const XML_PATH = join(FIXTURE_DIR, 'UnifiedDevOps Selective Coding ITE5 IC.xml');
const HAS_FIXTURE = existsSync(XML_PATH);

function computePageStartOffsets(plainText: string): number[] {
	const offsets = [0];
	for (let i = 0; i < plainText.length; i++) {
		if (plainText[i] === '\f') offsets.push(i + 1);
	}
	return offsets;
}

function mergePdfSelections(src: ParsedSource): ParsedSelection[] {
	const byGuid = new Map<string, { pdf?: ParsedSelection; text?: ParsedSelection }>();
	for (const sel of src.selections) {
		if (!sel.guid) continue;
		const entry = byGuid.get(sel.guid) ?? {};
		if (sel.type === 'PDFSelection') entry.pdf = { ...sel };
		else if (sel.type === 'PlainTextSelection') entry.text = { ...sel };
		byGuid.set(sel.guid, entry);
	}

	const merged: ParsedSelection[] = [];
	for (const pair of byGuid.values()) {
		if (pair.pdf && pair.text) {
			const combined: ParsedSelection = {
				...pair.pdf,
				startPosition: pair.text.startPosition,
				endPosition: pair.text.endPosition,
				name: pair.pdf.name ?? pair.text.name,
				codeGuids: [...new Set([...(pair.pdf.codeGuids ?? []), ...(pair.text.codeGuids ?? [])])],
				noteGuids: [...new Set([...(pair.pdf.noteGuids ?? []), ...(pair.text.noteGuids ?? [])])],
			};
			merged.push(combined);
		} else if (pair.pdf) {
			merged.push(pair.pdf);
		} else if (pair.text) {
			merged.push(pair.text);
		}
	}
	return merged;
}

if (!HAS_FIXTURE) {
	describe.skip('Atlas QDPX simulation', () => {
		it('requires ATLAS_QDPX_FIXTURE_DIR to point at the extracted fixture', () => {
			expect(HAS_FIXTURE).toBe(true);
		});
	});
} else {
	describe('Atlas QDPX simulation', () => {
		const xml = readFileSync(XML_PATH, 'utf8');
		const doc = parseXml(xml);
		const sources = parseSources(doc).filter((src) => src.type === 'pdf');

		it('reconstructs the D1 multi-column quotation as text on the expected page', () => {
			const src = sources.find((s) => s.name === 'D1 2021 UPM Paper');
			expect(src).toBeDefined();
			const merged = mergePdfSelections(src!);
			const sel = merged.find((s) => s.guid === '8130FD04-8515-4DDE-A161-4D2B0741B4B2');
			expect(sel).toBeDefined();

			const plainTextPath = join(FIXTURE_DIR, 'sources', '2ED57296-5E0B-4669-B50C-D0DD89226003.txt');
			const plainText = readFileSync(plainTextPath, 'utf8');
			const resolution = resolveImportedPdfText(sel!, plainText);
			const page = resolveImportedPdfPage(sel!, computePageStartOffsets(plainText));

			expect(page).toBe(6);
			expect(resolution.text).toContain('Evangelization and mentoring on DevOps practices');
			expect(resolution.text).toContain('knowledge sharing');
			expect(resolution.strategy).toBe('name+length');
		});

		it('reanchors the D12 drifted offset selection to the correct text and page', () => {
			const src = sources.find((s) => s.name.startsWith('D12 2022 A Cross-Company'));
			expect(src).toBeDefined();
			const merged = mergePdfSelections(src!);
			const sel = merged.find((s) => s.guid === '3EC299BF-FEE8-4679-A30C-D91018BCE4CB');
			expect(sel).toBeDefined();

			const plainTextPath = join(FIXTURE_DIR, 'sources', '14BA425D-9790-4100-BB03-A6E9AD58D562.txt');
			const plainText = readFileSync(plainTextPath, 'utf8');
			const resolution = resolveImportedPdfText(sel!, plainText);
			const page = resolveImportedPdfPage(sel!, computePageStartOffsets(plainText));

			expect(page).toBe(6);
			expect(resolution.text).toBe('The development tools for the virtual  team were not unified');
			expect(resolution.strategy).toBe('name+length');
		});

		it('preserves Atlas PDFSelection bbox fields when merging with PlainTextSelection', () => {
			let paired = 0;
			let pairedWithBBox = 0;
			for (const src of sources) {
				for (const sel of mergePdfSelections(src)) {
					if (sel.type !== 'PDFSelection' || sel.startPosition === undefined || sel.endPosition === undefined) continue;
					paired++;
					if (
						sel.firstX !== undefined &&
						sel.firstY !== undefined &&
						sel.secondX !== undefined &&
						sel.secondY !== undefined
					) {
						pairedWithBBox++;
					}
				}
			}

			expect(paired).toBeGreaterThan(0);
			expect(pairedWithBBox).toBe(paired);
		});

		it('covers every coded PDF source with at least one reconstructable text marker', () => {
			const perSource = sources.map((src) => {
				const merged = mergePdfSelections(src);
				const reprGuid = src.plainTextPath?.replace('internal://', '');
				expect(reprGuid, `plainTextPath missing for ${src.name}`).toBeTruthy();
				const plainText = readFileSync(join(FIXTURE_DIR, 'sources', reprGuid!), 'utf8');
				const pageStartOffsets = computePageStartOffsets(plainText);

				let resolved = 0;
				let unresolved = 0;
				for (const sel of merged) {
					if (!sel.name && sel.startPosition === undefined) continue;
					const text = resolveImportedPdfText(sel, plainText);
					const page = resolveImportedPdfPage(sel, pageStartOffsets);
					if (text.text && page !== null) resolved++;
					else unresolved++;
				}
				return { name: src.name, total: merged.length, resolved, unresolved };
			});

			expect(perSource).toHaveLength(10);
			for (const row of perSource) {
				expect(row.resolved, `${row.name} should have at least one reconstructed marker`).toBeGreaterThan(0);
				expect(row.unresolved, `${row.name} should not leave unresolved coded selections`).toBe(0);
			}
		});
	});
}
