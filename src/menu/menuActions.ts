import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';

export function addCodeAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	codeName: string,
	color?: string
): boolean {
	const marker = model.findOrCreateMarkerAtSelection(snapshot);
	return model.addCodeToMarker(marker.id, codeName, color);
}

export function removeCodeAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	codeName: string
): boolean {
	const markers = model.getMarkersInRange(snapshot.fileId, snapshot.from, snapshot.to);
	let removed = false;
	for (const marker of markers) {
		if (model.removeCodeFromMarker(marker.id, codeName)) {
			removed = true;
		}
	}
	return removed;
}

export function removeAllCodesAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot
): boolean {
	const markers = model.getMarkersInRange(snapshot.fileId, snapshot.from, snapshot.to);
	let removed = false;
	for (const marker of markers) {
		if (model.removeAllCodesFromMarker(marker.id)) {
			removed = true;
		}
	}
	return removed;
}

export function getCodesAtSelection(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot
): string[] {
	const markers = model.getMarkersInRange(snapshot.fileId, snapshot.from, snapshot.to);
	const codes = new Set<string>();
	for (const marker of markers) {
		for (const code of marker.codes) {
			codes.add(code);
		}
	}
	return Array.from(codes);
}
