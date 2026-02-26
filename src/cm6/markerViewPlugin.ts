import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { findFileIdForEditorView, getViewForFile } from "./utils/viewLookupUtils";
import { findSmallestMarkerAtPos, classifyMarkersAtPos } from "./utils/markerPositionUtils";
import {
	setFileIdEffect,
	setHoverEffect,
	startDragEffect,
	updateDragEffect,
	endDragEffect
} from "./markerStateField";

// Custom event dispatched when user makes a text selection (for menu trigger)
export const SELECTION_EVENT = 'codemarker-selection-made';

export interface SelectionEventDetail {
	from: number;
	to: number;
	text: string;
	fileId: string;
	editorView: EditorView;
	mouseX: number;
	mouseY: number;
}

export const createMarkerViewPlugin = (model: CodeMarkerModel) => {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			public instanceId: string;
			public fileId: string | null = null;
			private fileIdSent = false;

			// Drag state
			dragging: { markerId: string, type: 'start' | 'end' } | null = null;
			private cleanup: Array<() => void> = [];

			// Local hover state
			hoveredMarkerId: string | null = null;
			isInPartialOverlap = false;

			constructor(view: EditorView) {
				this.instanceId = Math.random().toString(36).substr(2, 9);
				this.identifyAndSendFileId(view);
			}

			private identifyAndSendFileId(view: EditorView, retryCount = 0) {
				const fileId = this.identifyFileForView(view);

				if (fileId) {
					this.fileId = fileId;

					requestAnimationFrame(() => {
						try {
							if (!view.dom || !view.dom.isConnected) return;

							view.dispatch({
								effects: setFileIdEffect.of({ fileId })
							});

							this.fileIdSent = true;
						} catch (e) {
							if (retryCount < 3) {
								setTimeout(() => {
									this.identifyAndSendFileId(view, retryCount + 1);
								}, 200);
							}
						}
					});

				} else if (retryCount < 5) {
					setTimeout(() => {
						this.identifyAndSendFileId(view, retryCount + 1);
					}, 300);
				}
			}

			private identifyFileForView(view: EditorView): string | null {
				return findFileIdForEditorView(view, model.plugin.app);
			}

			getMarkerAtPos(view: EditorView, pos: number): string | null {
				if (!this.fileId) return null;
				return findSmallestMarkerAtPos(pos, this.fileId, model, view, model.plugin.app);
			}

			private getViewForFileLocal(fileId: string) {
				return getViewForFile(fileId, model.plugin.app);
			}

			updateMarkerPosition(view: EditorView, markerId: string, newPos: number, type: 'start' | 'end') {
				if (!this.fileId) return;

				const marker = model.getMarkerById(markerId);
				if (!marker || marker.fileId !== this.fileId) return;

				try {
					const targetView = this.getViewForFileLocal(this.fileId);
					if (!targetView?.editor) return;

					// @ts-ignore
					const newPosConverted = targetView.editor.offsetToPos(newPos);
					if (!newPosConverted) return;

					const updatedMarker = { ...marker };

					if (type === 'start') {
						if (model.isPositionBefore(newPosConverted, marker.range.to) ||
							(newPosConverted.line === marker.range.to.line && newPosConverted.ch === marker.range.to.ch)) {
							updatedMarker.range.from = newPosConverted;
						}
					} else {
						if (model.isPositionAfter(newPosConverted, marker.range.from) ||
							(newPosConverted.line === marker.range.from.line && newPosConverted.ch === marker.range.from.ch)) {
							updatedMarker.range.to = newPosConverted;
						}
					}

					updatedMarker.updatedAt = Date.now();
					model.updateMarker(updatedMarker);
					model.updateMarkersForFile(this.fileId);

				} catch (e) {
					console.warn(`CodeMarker: Error updating marker position`, e);
				}
			}

			update(update: ViewUpdate) {
				if (!this.fileId || !this.fileIdSent) {
					setTimeout(() => {
						this.identifyAndSendFileId(update.view);
					}, 0);
				}
			}

			destroy() {
				this.cleanup.forEach(cleanupFn => cleanupFn());
				this.dragging = null;
				this.hoveredMarkerId = null;
				this.fileIdSent = false;
				document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
			}
		},
		{
			eventHandlers: {
				// MOUSEDOWN: Detect handle drag start
				mousedown(event: MouseEvent, view: EditorView) {
					const target = event.target as HTMLElement;

					if (target.tagName === 'svg' ||
						target.tagName === 'rect' ||
						target.tagName === 'circle' ||
						target.classList.contains('codemarker-circle') ||
						target.classList.contains('codemarker-line') ||
						target.classList.contains('codemarker-handle-svg')) {

						const markerId = target.getAttribute('data-marker-id') ||
							target.closest('[data-marker-id]')?.getAttribute('data-marker-id');
						const handleType = target.getAttribute('data-handle-type') ||
							target.closest('[data-handle-type]')?.getAttribute('data-handle-type');

						if (markerId && handleType && (handleType === 'start' || handleType === 'end')) {
							event.preventDefault();
							event.stopPropagation();

							this.dragging = { markerId, type: handleType as 'start' | 'end' };

							document.body.classList.add('codemarker-dragging');
							if (handleType === 'start') {
								document.body.classList.add('codemarker-dragging-start');
							} else {
								document.body.classList.add('codemarker-dragging-end');
							}

							view.dispatch({
								effects: startDragEffect.of({ markerId, type: handleType as 'start' | 'end' })
							});

							return true;
						}
					}

					return false;
				},

				// MOUSEMOVE: Drag + Hover
				mousemove(event: MouseEvent, view: EditorView) {
					if (this.dragging) {
						event.preventDefault();

						const coords = { x: event.clientX, y: event.clientY };
						let pos = view.posAtCoords(coords);

						if (pos === null) {
							pos = view.posAtCoords(coords, false);
						}

						if (pos !== null) {
							this.updateMarkerPosition(view, this.dragging.markerId, pos, this.dragging.type);

							view.dispatch({
								effects: updateDragEffect.of({
									markerId: this.dragging.markerId,
									pos,
									type: this.dragging.type
								})
							});
						}

						return true;
					}

					// Hover logic — use DOM element for precise hit-testing
					// (highlight spans only cover actual text, respecting word-wrap)
					const hoverTarget = (event.target as HTMLElement)?.closest?.('.codemarker-highlight');
					const targetMarkerId = hoverTarget?.getAttribute('data-marker-id') ?? null;

					if (targetMarkerId && this.fileId) {
						const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
						if (pos !== null) {
							const hit = classifyMarkersAtPos(pos, this.fileId, model, view, model.plugin.app);
							if (hit.isPartialOverlap) {
								// Partial overlap — hover visual on all, no winner for menu
								if (!this.isInPartialOverlap || this.hoveredMarkerId !== null) {
									this.hoveredMarkerId = null;
									this.isInPartialOverlap = true;
									view.dispatch({
										effects: setHoverEffect.of({ markerId: null, hoveredIds: hit.hoveredIds })
									});
								}
							} else {
								this.isInPartialOverlap = false;
								if (hit.markerId !== this.hoveredMarkerId) {
									this.hoveredMarkerId = hit.markerId;
									view.dispatch({
										effects: setHoverEffect.of({ markerId: hit.markerId })
									});
								}
							}
						}
					} else if (targetMarkerId !== this.hoveredMarkerId || this.isInPartialOverlap) {
						// No marker or no fileId — standard dispatch
						this.hoveredMarkerId = targetMarkerId;
						this.isInPartialOverlap = false;
						view.dispatch({
							effects: setHoverEffect.of({ markerId: targetMarkerId })
						});
					}

					return false;
				},

				// MOUSEUP: End drag + detect text selection for menu
				mouseup(event: MouseEvent, view: EditorView) {
					if (this.dragging) {
						const markerId = this.dragging.markerId;
						this.dragging = null;

						document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');

						view.dispatch({
							effects: endDragEffect.of({ markerId })
						});

						return true;
					}

					// Detect text selection for menu trigger
					if (this.fileId && model.getSettings().showMenuOnSelection) {
						setTimeout(() => {
							const sel = view.state.selection.main;
							if (sel.from !== sel.to) {
								const text = view.state.sliceDoc(sel.from, sel.to);
								if (text.trim()) {
									const detail: SelectionEventDetail = {
										from: sel.from,
										to: sel.to,
										text,
										fileId: this.fileId!,
										editorView: view,
										mouseX: event.clientX,
										mouseY: event.clientY,
									};
									view.dom.dispatchEvent(new CustomEvent(SELECTION_EVENT, {
										detail,
										bubbles: true
									}));
								}
							}
						}, 50);
					}

					return false;
				},

				// MOUSELEAVE: Clear hover
				mouseleave(event: MouseEvent, view: EditorView) {
					if (this.hoveredMarkerId || this.isInPartialOverlap) {
						this.hoveredMarkerId = null;
						this.isInPartialOverlap = false;
						view.dispatch({
							effects: setHoverEffect.of({ markerId: null })
						});
					}
					return false;
				}
			}
		}
	);
};
