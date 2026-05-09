/**
 * extractCoderContribution — função pura.
 *
 * Recebe (data, coderId, sourceHashRegistry?) e retorna ExtractResult com:
 * - Markers do coder em todos engines text-likes (markdown + PDF text + CSV cod segment)
 * - Codes referenciados pelos markers
 * - Groups referenciados pelos codes (opcional)
 * - Sources com hash (do sourceHashRegistry)
 * - Coder full entry do registry
 * - codebookVersion hash
 *
 * Warnings emitidos quando: source sem hash no registry, code referenciado mas
 * ausente do registry, coder ausente do registry.
 */

import type { QualiaData, CodeDefinition, GroupDefinition } from '../../types';
import type { CoderId, Coder } from '../coderTypes';
import type { Marker } from '../../../markdown/models/codeMarkerModel';
import type { PdfMarker } from '../../../pdf/pdfCodingTypes';
import type { SegmentMarker } from '../../../csv/csvCodingTypes';
import type { Payload, ExtractResult } from './payloadTypes';
import type { SourceHashRegistry } from '../sourceHashRegistry';
import { computeCodebookHash } from './computeCodebookHash';

export async function extractCoderContribution(
	data: QualiaData,
	coderId: CoderId,
	sourceHashRegistry?: SourceHashRegistry,
): Promise<ExtractResult> {
	const warnings: string[] = [];

	// 1. Filter markers per engine
	const mdMarkers: Record<string, Marker[]> = {};
	for (const [fileId, markers] of Object.entries(data.markdown.markers ?? {})) {
		const filtered = markers.filter(m => m.codedBy === coderId);
		if (filtered.length > 0) mdMarkers[fileId] = filtered;
	}
	const pdfMarkers: PdfMarker[] = (data.pdf.markers ?? []).filter(m => m.codedBy === coderId);
	const csvSegmentMarkers: SegmentMarker[] = (data.csv.segmentMarkers ?? []).filter(m => m.codedBy === coderId);

	// 2. Collect referenced codeIds
	const codeIds = new Set<string>();
	for (const ms of Object.values(mdMarkers)) for (const m of ms) for (const ca of m.codes) codeIds.add(ca.codeId);
	for (const m of pdfMarkers) for (const ca of m.codes) codeIds.add(ca.codeId);
	for (const m of csvSegmentMarkers) for (const ca of m.codes) codeIds.add(ca.codeId);

	const codes: CodeDefinition[] = [];
	for (const cid of codeIds) {
		const def = data.registry.definitions[cid];
		if (def) codes.push(def);
		else warnings.push(`Code ${cid} referenced by marker but not in registry`);
	}

	// 3. Collect referenced groups
	const groupIds = new Set<string>();
	for (const c of codes) for (const gid of c.groups ?? []) groupIds.add(gid);
	const groups: GroupDefinition[] = [];
	for (const gid of groupIds) {
		const g = data.registry.groups[gid];
		if (g) groups.push(g);
	}

	// 4. Collect source fileIds and hashes
	const fileIds = new Set<string>();
	for (const fileId of Object.keys(mdMarkers)) fileIds.add(fileId);
	for (const m of pdfMarkers) fileIds.add(m.fileId);
	for (const m of csvSegmentMarkers) fileIds.add(m.fileId);

	const sources: Record<string, { hash: string; fileSize?: number }> = {};
	for (const fileId of fileIds) {
		if (sourceHashRegistry) {
			const entry = sourceHashRegistry.getEntry(fileId);
			if (entry) {
				sources[fileId] = { hash: entry.hash, fileSize: entry.fileSize };
				continue;
			}
		}
		warnings.push(`Source ${fileId} has no hash in registry — cross-vault remap won't work for this source`);
	}

	// 5. Codebook hash
	const codebookVersion = await computeCodebookHash({
		codes: Object.values(data.registry.definitions),
		groups: Object.values(data.registry.groups),
		smartCodes: Object.values(data.smartCodes?.definitions ?? {}),
	});

	// 6. Coder entry
	const coderEntry = data.coders?.coders.find(c => c.id === coderId);
	const coder: Coder = coderEntry ?? {
		id: coderId,
		name: coderId,
		type: coderId.startsWith('llm:') ? 'llm' : 'human',
		createdAt: Date.now(),
	};
	if (!coderEntry) warnings.push(`Coder ${coderId} not in registry — minimal stub created in payload`);

	const payload: Payload = {
		version: '1.0',
		codebookVersion,
		coder,
		sources,
		codes,
		groups: groups.length > 0 ? groups : undefined,
		markers: { markdown: mdMarkers, pdf: pdfMarkers, csvSegment: csvSegmentMarkers },
		exportedAt: Date.now(),
	};

	return { payload, warnings };
}
