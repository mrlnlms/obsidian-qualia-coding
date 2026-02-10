import { StateField, EditorState, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { HandleWidget } from "./handleWidget";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { MarkdownView } from "obsidian";

// Effects for CM6 state communication
export const setFileIdEffect = StateEffect.define<{fileId: string}>();
export const setHoverEffect = StateEffect.define<{markerId: string | null}>();
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
	hoveredMarkerId: string | null;
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
				hoveredMarkerId: null,
				fileId: null,
				instanceId
			};
		},

		update(state: MarkerFieldState, tr): MarkerFieldState {
			// Map decorations through document changes (CM6 standard)
			let decorations = state.decorations.map(tr.changes);
			let selectionPreview = state.selectionPreview.map(tr.changes);
			let hoveredMarkerId = state.hoveredMarkerId;
			let fileId = state.fileId;
			let needsRebuild = false;

			for (const effect of tr.effects) {
				if (effect.is(setFileIdEffect)) {
					const { fileId: newFileId } = effect.value;
					if (newFileId !== fileId) {
						fileId = newFileId;
						needsRebuild = true;
					}
				}
				else if (effect.is(setHoverEffect)) {
					const { markerId } = effect.value;

					// Validate marker belongs to this file
					if (markerId) {
						const marker = model.getMarkerById(markerId);
						if (!marker || marker.fileId !== fileId) {
							continue;
						}
					}

					if (markerId !== hoveredMarkerId) {
						hoveredMarkerId = markerId;
						needsRebuild = true;
					}
				}
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
				decorations = buildDecorationsForFile(tr.state, model, fileId, hoveredMarkerId);
			}

			return {
				fileId,
				decorations,
				selectionPreview,
				hoveredMarkerId,
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

function getViewForFile(fileId: string, model: CodeMarkerModel): MarkdownView | null {
	const app = model.plugin.app;
	const leaves = app.workspace.getLeavesOfType('markdown');

	for (const leaf of leaves) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file?.path === fileId) {
			return view;
		}
	}

	return null;
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
	hoveredMarkerId: string | null = null
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();

	if (!fileId) return Decoration.none;

	const markers = model.getMarkersForFile(fileId);
	const settings = model.getSettings();

	if (markers.length === 0) return Decoration.none;

	const targetView = getViewForFile(fileId, model);
	if (!targetView?.editor) return Decoration.none;

	const allDecorations: Array<{from: number, to: number, decoration: Decoration}> = [];

	for (const marker of markers) {
		try {
			// @ts-ignore
			const startOffset = targetView.editor.posToOffset(marker.range.from);
			// @ts-ignore
			const endOffset = targetView.editor.posToOffset(marker.range.to);

			if (startOffset === null || endOffset === null ||
				startOffset === undefined || endOffset === undefined) {
				continue;
			}

			const from = Math.min(startOffset, endOffset);
			const to = Math.max(startOffset, endOffset);

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

			if (marker.color && marker.color.startsWith('#')) {
				const r = parseInt(marker.color.slice(1, 3), 16);
				const g = parseInt(marker.color.slice(3, 5), 16);
				const b = parseInt(marker.color.slice(5, 7), 16);
				bgColor = `rgba(${r}, ${g}, ${b}, ${settings.markerOpacity})`;
				handleColor = marker.color;
			}

			const highlightDecoration = Decoration.mark({
				class: 'codemarker-highlight',
				attributes: {
					'data-marker-id': marker.id,
					'style': `background-color: ${bgColor}; padding: ${paddingValue}px 0;`
				}
			});

			allDecorations.push({ from, to, decoration: highlightDecoration });

			// Handle visibility logic
			const isHovered = marker.id === hoveredMarkerId;
			const shouldShowHandles = !settings.showHandlesOnHover || isHovered;

			if (shouldShowHandles) {
				const startHandle = Decoration.widget({
					widget: new HandleWidget(marker, 'start', handleColor, settings, isHovered),
					side: -1,
					block: false
				});
				allDecorations.push({ from, to: from, decoration: startHandle });

				const endHandle = Decoration.widget({
					widget: new HandleWidget(marker, 'end', handleColor, settings, isHovered),
					side: 1,
					block: false
				});
				allDecorations.push({ from: to, to: to, decoration: endHandle });
			}

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
