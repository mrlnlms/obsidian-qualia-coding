import type { QualiaData, MarkerRef, EngineType, AnyMarker } from './types';

export interface MarkerWithRef {
	engine: EngineType;
	fileId: string;
	markerId: string;
	marker: AnyMarker;
}

/**
 * Itera markers de todos os 6 engines (markdown, pdf, image, audio, video, csv).
 * Inclui PDF text markers + shapes; CSV segmentMarkers + rowMarkers; audio/video markers nested em files.
 */
export function getAllMarkers(data: QualiaData): MarkerWithRef[] {
	const out: MarkerWithRef[] = [];
	// Cast `as unknown as AnyMarker` consistente: engine markers têm shape de BaseMarker em runtime
	// mas não declaram markerType na interface (legacy cross-cutting; ver NOTA types.ts).
	const cast = (m: unknown): AnyMarker => m as AnyMarker;

	for (const [fileId, markers] of Object.entries(data.markdown?.markers ?? {})) {
		for (const m of markers) out.push({ engine: 'markdown', fileId, markerId: m.id, marker: cast(m) });
	}

	for (const m of data.pdf?.markers ?? []) out.push({ engine: 'pdf', fileId: m.fileId, markerId: m.id, marker: cast(m) });
	for (const m of data.pdf?.shapes ?? []) out.push({ engine: 'pdf', fileId: m.fileId, markerId: m.id, marker: cast(m) });

	for (const m of data.image?.markers ?? []) out.push({ engine: 'image', fileId: m.fileId, markerId: m.id, marker: cast(m) });

	for (const f of data.audio?.files ?? []) {
		for (const m of f.markers ?? []) out.push({ engine: 'audio', fileId: f.path, markerId: m.id, marker: cast(m) });
	}
	for (const f of data.video?.files ?? []) {
		for (const m of f.markers ?? []) out.push({ engine: 'video', fileId: f.path, markerId: m.id, marker: cast(m) });
	}

	for (const m of data.csv?.segmentMarkers ?? []) out.push({ engine: 'csv', fileId: m.fileId, markerId: m.id, marker: cast(m) });
	for (const m of data.csv?.rowMarkers ?? []) out.push({ engine: 'csv', fileId: m.fileId, markerId: m.id, marker: cast(m) });

	return out;
}
