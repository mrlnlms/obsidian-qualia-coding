import { Notice } from 'obsidian';
import { CodeMarkerModel, Marker } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';

/**
 * Resolve which single marker the menu is operating on.
 * - Hover menu → marker by hoverMarkerId
 * - Selection menu → marker with exact range match (if any)
 */
function getTargetMarker(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot
): Marker | null {
	if (snapshot.hoverMarkerId) {
		return model.getMarkerById(snapshot.hoverMarkerId) ?? null;
	}
	return model.findMarkerAtExactRange(snapshot) ?? null;
}

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

export function addCodeWithDetailsAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	codeName: string,
	color: string,
	description: string
): boolean {
	const marker = model.findOrCreateMarkerAtSelection(snapshot);
	const added = model.addCodeToMarker(marker.id, codeName, color);
	if (description) {
		model.setCodeDescription(codeName, description);
	}
	return added;
}

export function removeCodeAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	codeName: string
): boolean {
	const marker = getTargetMarker(model, snapshot);
	if (!marker) return false;
	// In hover mode, keep the empty marker alive so the menu stays coherent;
	// cleanup happens when the tooltip closes.
	const keepIfEmpty = !!snapshot.hoverMarkerId;
	return model.removeCodeFromMarker(marker.id, codeName, keepIfEmpty);
}

export function removeAllCodesAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot
): boolean {
	const marker = getTargetMarker(model, snapshot);
	if (!marker) return false;
	return model.removeAllCodesFromMarker(marker.id);
}

export function getCodesAtSelection(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot
): string[] {
	const marker = getTargetMarker(model, snapshot);
	if (!marker) return [];
	return [...marker.codes];
}
