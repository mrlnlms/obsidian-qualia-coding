import type { QualiaData, MarkerRef, EngineType } from './types';

export interface MarkerWithRef {
	engine: EngineType;
	fileId: string;
	markerId: string;
	/** Marker object — shape depende do engine. Acesso a `codes` é garantido em todos. */
	marker: { id: string; fileId: string; codes: unknown[] };
}

/**
 * Itera markers de todos os 6 engines (markdown, pdf, image, audio, video, csv).
 * Inclui PDF text markers + shapes; CSV segmentMarkers + rowMarkers; audio/video markers nested em files.
 */
export function getAllMarkers(data: QualiaData): MarkerWithRef[] {
	const out: MarkerWithRef[] = [];

	// markdown: data.markdown.markers[fileId][]
	for (const [fileId, markers] of Object.entries(data.markdown?.markers ?? {})) {
		for (const m of markers) out.push({ engine: 'markdown', fileId, markerId: m.id, marker: m as any });
	}

	// pdf: text markers + shape markers (ambos flat com fileId field)
	for (const m of data.pdf?.markers ?? []) out.push({ engine: 'pdf', fileId: m.fileId, markerId: m.id, marker: m as any });
	for (const m of data.pdf?.shapes ?? []) out.push({ engine: 'pdf', fileId: m.fileId, markerId: m.id, marker: m as any });

	// image: flat com fileId
	for (const m of data.image?.markers ?? []) out.push({ engine: 'image', fileId: m.fileId, markerId: m.id, marker: m as any });

	// audio/video: nested em files. file.path é o fileId.
	for (const f of data.audio?.files ?? []) {
		for (const m of f.markers ?? []) out.push({ engine: 'audio', fileId: f.path, markerId: m.id, marker: m as any });
	}
	for (const f of data.video?.files ?? []) {
		for (const m of f.markers ?? []) out.push({ engine: 'video', fileId: f.path, markerId: m.id, marker: m as any });
	}

	// csv: segment + row markers, ambos flat com fileId
	for (const m of data.csv?.segmentMarkers ?? []) out.push({ engine: 'csv', fileId: m.fileId, markerId: m.id, marker: m as any });
	for (const m of data.csv?.rowMarkers ?? []) out.push({ engine: 'csv', fileId: m.fileId, markerId: m.id, marker: m as any });

	return out;
}
