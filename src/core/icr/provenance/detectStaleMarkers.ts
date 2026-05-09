/**
 * detectStaleMarkers — função pura.
 *
 * Itera markers em todas 6 engines (markdown / pdf / csv segment / csv row /
 * image / audio / video) e classifica cada um:
 *
 * - `fresh`: marker tem `sourceHashAtCoding` e bate com hash atual do source
 * - `stale`: snapshot diverge do hash atual → adicionado em report.stale[]
 * - `inconclusive`: sem snapshot OU source não acessível
 *
 * Hash atual via `hashRegistry.getOrCompute(fileId)` (lazy). Read errors viram
 * `inconclusive` em vez de propagar exceção.
 */

import type { QualiaData } from '../../types';
import type { SourceHashRegistry } from '../sourceHashRegistry';

export type StaleEngine = 'markdown' | 'pdf' | 'csvSegment' | 'csvRow' | 'image' | 'audio' | 'video';

export interface StaleEntry {
	markerId: string;
	fileId: string;
	engine: StaleEngine;
	snapshotHash: string;
	currentHash: string;
}

export interface StaleReport {
	fresh: number;
	stale: StaleEntry[];
	inconclusive: number;
}

interface MarkerWithSnapshot {
	id: string;
	fileId: string;
	sourceHashAtCoding?: string;
}

async function classify(
	marker: MarkerWithSnapshot,
	engine: StaleEngine,
	hashRegistry: SourceHashRegistry,
	report: StaleReport,
): Promise<void> {
	if (!marker.sourceHashAtCoding) {
		report.inconclusive++;
		return;
	}
	let currentHash: string;
	try {
		currentHash = await hashRegistry.getOrCompute(marker.fileId);
	} catch {
		report.inconclusive++;
		return;
	}
	if (currentHash === marker.sourceHashAtCoding) {
		report.fresh++;
	} else {
		report.stale.push({
			markerId: marker.id,
			fileId: marker.fileId,
			engine,
			snapshotHash: marker.sourceHashAtCoding,
			currentHash,
		});
	}
}

export async function detectStaleMarkers(
	data: QualiaData,
	hashRegistry: SourceHashRegistry,
): Promise<StaleReport> {
	const report: StaleReport = { fresh: 0, stale: [], inconclusive: 0 };

	for (const markers of Object.values(data.markdown.markers ?? {})) {
		for (const m of markers) await classify(m, 'markdown', hashRegistry, report);
	}
	for (const m of data.pdf.markers ?? []) await classify(m, 'pdf', hashRegistry, report);
	for (const s of data.pdf.shapes ?? []) await classify(s, 'pdf', hashRegistry, report);
	for (const m of data.csv.segmentMarkers ?? []) await classify(m, 'csvSegment', hashRegistry, report);
	for (const m of data.csv.rowMarkers ?? []) await classify(m, 'csvRow', hashRegistry, report);
	for (const m of data.image.markers ?? []) await classify(m, 'image', hashRegistry, report);
	for (const f of data.audio.files ?? []) {
		for (const m of f.markers) await classify(m, 'audio', hashRegistry, report);
	}
	for (const f of data.video.files ?? []) {
		for (const m of f.markers) await classify(m, 'video', hashRegistry, report);
	}

	return report;
}
