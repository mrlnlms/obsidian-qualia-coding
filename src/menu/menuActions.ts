import { Notice } from 'obsidian';
import { CodeMarkerModel } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';

/**
 * Alias used by the "Add New Code" button — same as addCodeAction but
 * accepts name from the TextComponent input.
 */
export function addNewCodeAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	codeName: string,
	color?: string
): boolean {
	return addCodeAction(model, snapshot, codeName, color);
}

/**
 * Placeholder — mirrors mqda/src/Codings.ts:14-16.
 * In the original plugin this opened a picker; for now it shows a notice.
 */
export function addExistingCodeAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot
): void {
	new Notice('Add Existing Code — coming soon');
}

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
