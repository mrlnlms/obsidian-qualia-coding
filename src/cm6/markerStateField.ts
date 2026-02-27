import { StateField, EditorState, StateEffect, Text } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

import { CodeMarkerModel } from "../models/codeMarkerModel";
import { getViewForFile } from "./utils/viewLookupUtils";
import { cm6OffsetToPos } from "./utils/markerPositionUtils";

// Effects for CM6 state communication
export const setFileIdEffect = StateEffect.define<{fileId: string}>();
export const setHoverEffect = StateEffect.define<{markerId: string | null, hoveredIds?: string[]}>();
export const startDragEffect = StateEffect.define<{markerId: string, type: 'start' | 'end'}>();
export const updateDragEffect = StateEffect.define<{markerId: string, pos: number, type: 'start' | 'end'}>();
export const endDragEffect = StateEffect.define<{markerId: string}>();
export const updateFileMarkersEffect = StateEffect.define<{fileId: string}>();

// Selection preview effect: creates a visual highlight that mimics native selection
// Used by Approach A (Obsidian native menu) to keep selection visible while menu is open
export const setSelectionPreviewEffect = StateEffect.define<{from: number, to: number} | null>();

interface MarkerFieldState {
	decorations: DecorationSet;
	selectionPreview: DecorationSet;
	fileId: string | null;
	instanceId: string;
}

export const createMarkerStateField = (model: CodeMarkerModel) => {
	const instanceId = Math.random().toString(36).substr(2, 9);

	return StateField.define<MarkerFieldState>({
		create(): MarkerFieldState {
			return {
				decorations: Decoration.none,
				selectionPreview: Decoration.none,
				fileId: null,
				instanceId
			};
		},

		update(state: MarkerFieldState, tr): MarkerFieldState {
			// Map decorations through document changes (CM6 standard)
			let decorations = state.decorations.map(tr.changes);
			let selectionPreview = state.selectionPreview.map(tr.changes);
			let fileId = state.fileId;
			let needsRebuild = false;

			// Sync mapped decoration positions back to model (prevents snap-back)
			if (tr.docChanged && fileId) {
				syncDecorationsToModel(decorations, tr.state.doc, model, fileId);
			}

			for (const effect of tr.effects) {
				if (effect.is(setFileIdEffect)) {
					const { fileId: newFileId } = effect.value;
					if (newFileId !== fileId) {
						fileId = newFileId;
						needsRebuild = true;
					}
				}
				// NOTE: setHoverEffect is intentionally NOT handled here.
				// Hover state is managed by ViewPlugins (markerViewPlugin + marginPanelExtension)
				// which read the effect directly in their update() methods.
				// No decoration rebuild needed for hover changes.
				else if (effect.is(updateFileMarkersEffect)) {
					const { fileId: effectFileId } = effect.value;
					if (effectFileId === fileId) {
						needsRebuild = true;
					}
				}
				else if (effect.is(setSelectionPreviewEffect)) {
					const value = effect.value;
					if (value) {
						const builder = new RangeSetBuilder<Decoration>();
						const previewDeco = Decoration.mark({
							class: 'codemarker-selection-preview',
						});
						builder.add(value.from, value.to, previewDeco);
						selectionPreview = builder.finish();
					} else {
						selectionPreview = Decoration.none;
					}
				}
			}

			if (needsRebuild && fileId) {
				decorations = buildDecorationsForFile(tr.state, model, fileId);
			}

			return {
				fileId,
				decorations,
				selectionPreview,
				instanceId: state.instanceId
			};
		},

		// Provide both decoration sets to the editor
		provide: field => [
			EditorView.decorations.from(field, state => state.decorations),
			EditorView.decorations.from(field, state => state.selectionPreview)
		]
	});
};

/**
 * Sync CM6 decoration positions back to the model after document changes.
 * CM6 decorations are mapped through ChangeSet automatically, but the model
 * still holds the old {line, ch} positions. This function reads the current
 * decoration offsets and updates the model in-memory (no disk save).
 */
function syncDecorationsToModel(
	decorations: DecorationSet,
	doc: Text,
	model: CodeMarkerModel,
	fileId: string
) {
	// Collect decoration ranges grouped by marker ID.
	// CM6 splits marks at formatting boundaries, so one marker may have
	// multiple decoration spans — we need min(from) and max(to).
	const ranges = new Map<string, { from: number; to: number }>();

	decorations.between(0, doc.length, (from, to, deco) => {
		const markerId = deco.spec?.attributes?.['data-marker-id'];
		if (!markerId) return;

		const existing = ranges.get(markerId);
		if (existing) {
			existing.from = Math.min(existing.from, from);
			existing.to = Math.max(existing.to, to);
		} else {
			ranges.set(markerId, { from, to });
		}
	});

	// Update model markers in-memory
	const markers = model.getMarkersForFile(fileId);
	for (const marker of markers) {
		const range = ranges.get(marker.id);
		if (!range) continue;

		const newFrom = cm6OffsetToPos(doc, range.from);
		const newTo = cm6OffsetToPos(doc, range.to);

		// Only update if position actually changed (avoid churn)
		if (
			newFrom.line !== marker.range.from.line ||
			newFrom.ch !== marker.range.from.ch ||
			newTo.line !== marker.range.to.line ||
			newTo.ch !== marker.range.to.ch
		) {
			marker.range.from = newFrom;
			marker.range.to = newTo;
		}
	}
}

function getViewForFileFromModel(fileId: string, model: CodeMarkerModel) {
	return getViewForFile(fileId, model.plugin.app);
}

function calculatePaddingRatio(fontSize: number, lineHeight: number): number {
	const baseRatio = 0.1875;
	const idealSpacing = fontSize * 1.2;
	const actualSpacing = lineHeight;
	const spacingAdjustment = (actualSpacing / idealSpacing - 1) * 0.001;
	const fontSizeAdjustment = (fontSize - 16) * 0.001;
	return Math.max(baseRatio - fontSizeAdjustment - spacingAdjustment, 0.05);
}

function buildDecorationsForFile(
	state: EditorState,
	model: CodeMarkerModel,
	fileId: string,
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();

	if (!fileId) return Decoration.none;

	const markers = model.getMarkersForFile(fileId);
	const settings = model.getSettings();

	if (markers.length === 0) return Decoration.none;

	const targetView = getViewForFileFromModel(fileId, model);
	if (!targetView?.editor) return Decoration.none;

	const allDecorations: Array<{from: number, to: number, decoration: Decoration}> = [];

	// Resolve offsets for all markers first, then sort for visual stacking
	const resolved: Array<{marker: typeof markers[0], from: number, to: number}> = [];
	for (const marker of markers) {
		try {
			// @ts-ignore
			const startOffset = targetView.editor.posToOffset(marker.range.from);
			// @ts-ignore
			const endOffset = targetView.editor.posToOffset(marker.range.to);
			if (startOffset == null || endOffset == null) continue;
			resolved.push({ marker, from: Math.min(startOffset, endOffset), to: Math.max(startOffset, endOffset) });
		} catch (e) {
			console.warn(`CodeMarker: Error resolving offset for marker ${marker.id}`, e);
		}
	}

	// Sort for visual stacking: markers rendered last appear on top in the DOM.
	// Containers (larger markers that contain others) go first (render underneath).
	// For partial intersections, the one starting earlier goes first (later start = on top).
	resolved.sort((a, b) => {
		const aContainsB = a.from <= b.from && a.to >= b.to;
		const bContainsA = b.from <= a.from && b.to >= a.to;

		if (aContainsB) return -1; // A contains B → A renders first (underneath)
		if (bContainsA) return 1;  // B contains A → B renders first (underneath)

		// Partial intersection: earlier start renders first (later start = on top)
		return a.from - b.from;
	});

	for (let markerIndex = 0; markerIndex < resolved.length; markerIndex++) {
		const entry = resolved[markerIndex]!;
		const { marker, from, to } = entry;
		try {

			// Calculate padding based on font size
			// @ts-ignore
			const editorElement = targetView.editor.cm.dom;
			const computedStyle = window.getComputedStyle(editorElement);
			const currentFontSize = parseFloat(computedStyle.fontSize);
			const lineHeight = parseFloat(computedStyle.lineHeight) || currentFontSize * 1.2;

			const paddingRatio = calculatePaddingRatio(currentFontSize, lineHeight);
			const paddingValue = Math.max(currentFontSize * paddingRatio, 1);

			let bgColor = 'rgba(98, 0, 238, 0.4)';
			let handleColor = '#6200EE';

			// Derive color from registry (first code wins), fall back to marker.color
			let effectiveColor = marker.color;
			if (marker.codes.length > 0) {
				const registryColor = model.registry.getColorForCodes(marker.codes);
				if (registryColor) effectiveColor = registryColor;
			}

			if (effectiveColor && effectiveColor.startsWith('#')) {
				const r = parseInt(effectiveColor.slice(1, 3), 16);
				const g = parseInt(effectiveColor.slice(3, 5), 16);
				const b = parseInt(effectiveColor.slice(5, 7), 16);
				bgColor = `rgba(${r}, ${g}, ${b}, ${settings.markerOpacity})`;
				handleColor = effectiveColor;
			}

			const highlightDecoration = Decoration.mark({
				class: 'codemarker-highlight',
				attributes: {
					'data-marker-id': marker.id,
					'style': `background-color: ${bgColor}; padding: ${paddingValue}px 0;`
				}
			});

			allDecorations.push({ from, to, decoration: highlightDecoration });

			// NOTE: Handles are rendered via overlay in markerViewPlugin.ts (not as Decoration.widget)
			// This avoids inline DOM insertion that causes text reflow / word-break artifacts

		} catch (e) {
			console.warn(`CodeMarker: Error building decorations for marker ${marker.id}`, e);
		}
	}

	// Sort decorations (CM6 requirement)
	allDecorations.sort((a, b) => {
		if (a.from !== b.from) return a.from - b.from;
		if (a.to !== b.to) return a.to - b.to;

		const aIsMark = a.from !== a.to;
		const bIsMark = b.from !== b.to;

		if (aIsMark && !bIsMark) return 1;
		if (!aIsMark && bIsMark) return -1;

		return 0;
	});

	for (const deco of allDecorations) {
		builder.add(deco.from, deco.to, deco.decoration);
	}

	return builder.finish();
}
