import type { QualiaData } from '../../../../src/core/types';
import { createDefaultData } from '../../../../src/core/types';

export interface FixtureSize {
	codes: number;
	markers: number;
	smartCodes: number;
	caseVars?: number;
}

/** Gera fixture programático: N codes (todos magnitude continuous), markers distribuídos
 *  entre markdown/pdf/csv com 1-5 codes cada (30% com magnitude), smart codes variados (30% nesting). */
export function buildLargeFixture(size: FixtureSize): QualiaData {
	const data = createDefaultData();
	for (let i = 0; i < size.codes; i++) {
		const id = `c_${i}`;
		(data.registry.definitions as any)[id] = {
			id, name: `Code ${i}`, color: '#888888',
			paletteIndex: i, createdAt: 0, updatedAt: 0,
			childrenOrder: [],
			magnitude: { type: 'continuous', values: ['1', '5'] },
		};
		data.registry.rootOrder.push(id);
	}

	for (let i = 0; i < size.markers; i++) {
		const fileIdx = Math.floor(i / 100);
		const numCodes = 1 + (i % 5);
		const codes = Array.from({ length: numCodes }, (_, k) => ({
			codeId: `c_${(i + k) % size.codes}`,
			...(i % 3 === 0 ? { magnitude: String(Math.floor((i * 7) % 5) + 1) } : {}),
		}));
		if (i % 10 < 5) {
			const file = `note_${fileIdx}.md`;
			(data.markdown.markers as any)[file] = (data.markdown.markers as any)[file] ?? [];
			(data.markdown.markers as any)[file].push({ id: `mk_${i}`, fileId: file, codes, range: {} });
		} else if (i % 10 < 8) {
			const file = `doc_${fileIdx}.pdf`;
			(data.pdf.markers as any).push({ id: `pdf_${i}`, fileId: file, codes });
		} else {
			(data.csv.rowMarkers as any).push({ id: `row_${i}`, fileId: 'data.csv', codes, sourceRowId: i });
		}
	}

	for (let i = 0; i < size.smartCodes; i++) {
		const id = `sc_${i}`;
		const useNesting = i % 3 === 0 && i > 5;
		const predicate: any = useNesting
			? { op: 'AND', children: [
				{ kind: 'hasCode', codeId: `c_${i % size.codes}` },
				{ kind: 'smartCode', smartCodeId: `sc_${i - 5}` },
			]}
			: { op: 'AND', children: [
				{ kind: 'hasCode', codeId: `c_${i % size.codes}` },
				{ kind: 'magnitudeGte', codeId: `c_${(i + 1) % size.codes}`, n: 3 },
			]};
		(data.smartCodes.definitions as any)[id] = {
			id, name: `Smart ${i}`, color: '#aaaaaa', paletteIndex: i, createdAt: 0, predicate,
		};
		data.smartCodes.order.push(id);
	}
	return data;
}
