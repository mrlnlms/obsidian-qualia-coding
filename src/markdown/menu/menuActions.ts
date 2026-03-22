import { Notice } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { CodeMarkerModel, Marker } from '../models/codeMarkerModel';
import { SelectionSnapshot } from './menuTypes';
import type { MenuController } from './menuController';
import { setSelectionPreviewEffect } from '../cm6/markerStateField';

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

export function addCodeAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	codeName: string,
	color?: string
): boolean {
	// Resolve name → id via registry; create if needed
	let def = model.registry.getByName(codeName);
	if (!def) def = model.registry.create(codeName, color);
	const marker = model.findOrCreateMarkerAtSelection(snapshot);
	return model.addCodeToMarker(marker.id, def.id, color);
}

export function addCodeWithDetailsAction(
	model: CodeMarkerModel,
	snapshot: SelectionSnapshot,
	codeName: string,
	color: string,
	description: string
): boolean {
	let def = model.registry.getByName(codeName);
	if (!def) def = model.registry.create(codeName, color);
	const marker = model.findOrCreateMarkerAtSelection(snapshot);
	const added = model.addCodeToMarker(marker.id, def.id, color);
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
	const def = model.registry.getByName(codeName);
	if (!def) return false;
	// In hover mode, keep the empty marker alive so the menu stays coherent;
	// cleanup happens when the tooltip closes.
	const keepIfEmpty = !!snapshot.hoverMarkerId;
	return model.removeCodeFromMarker(marker.id, def.id, keepIfEmpty);
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
	// Resolve codeIds → names for UI display
	return marker.codes
		.map(c => model.registry.getById(c.codeId)?.name)
		.filter((n): n is string => !!n);
}

/**
 * Open the coding menu for the current editor selection.
 * Shared by: command, context menu, ribbon button.
 */
export function openMenuFromEditorSelection(
	editorView: EditorView,
	fileId: string,
	selection: string,
	menuController: MenuController,
): void {
	const sel = editorView.state.selection.main;
	const snapshot: SelectionSnapshot = {
		from: sel.from,
		to: sel.to,
		text: selection,
		fileId,
	};
	editorView.dispatch({
		effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to }),
	});
	const coords = editorView.coordsAtPos(sel.from);
	menuController.openMenu(editorView, snapshot, {
		x: coords?.left ?? 0,
		y: coords?.top ?? 0,
	});
}
