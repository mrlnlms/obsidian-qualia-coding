import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { MarkdownView } from "obsidian";
import { CodeMarkerModel } from "../models/codeMarkerModel";
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
				const app = model.plugin.app;
				const leaves = app.workspace.getLeavesOfType('markdown');

				for (const leaf of leaves) {
					const leafView = leaf.view;
					if (leafView instanceof MarkdownView && leafView.editor) {
						try {
							// @ts-ignore
							const cmView = leafView.editor.cm;
							if (cmView === view) {
								return leafView.file?.path || null;
							}
						} catch {
							continue;
						}
					}
				}

				return null;
			}

			getMarkerAtPos(view: EditorView, pos: number): string | null {
				if (!this.fileId) return null;

				const markers = model.getMarkersForFile(this.fileId);
				const foundMarkers: Array<{marker: any, size: number}> = [];

				for (const marker of markers) {
					try {
						let startOffset: number, endOffset: number;

						try {
							startOffset = view.state.doc.line(marker.range.from.line + 1).from + marker.range.from.ch;
							endOffset = view.state.doc.line(marker.range.to.line + 1).from + marker.range.to.ch;
						} catch {
							const targetView = this.getViewForFile(this.fileId!);
							if (!targetView?.editor) continue;
							// @ts-ignore
							startOffset = targetView.editor.posToOffset(marker.range.from);
							// @ts-ignore
							endOffset = targetView.editor.posToOffset(marker.range.to);
						}

						if (startOffset === null || endOffset === null ||
							startOffset === undefined || endOffset === undefined) {
							continue;
						}

						if (pos >= startOffset && pos <= endOffset) {
							const size = endOffset - startOffset;
							foundMarkers.push({ marker, size });
						}

					} catch {
						continue;
					}
				}

				if (foundMarkers.length === 0) return null;

				// Return smallest (most specific) marker
				foundMarkers.sort((a, b) => a.size - b.size);
				const smallest = foundMarkers[0];
				return smallest ? smallest.marker.id : null;
			}

			private getViewForFile(fileId: string): MarkdownView | null {
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

			updateMarkerPosition(view: EditorView, markerId: string, newPos: number, type: 'start' | 'end') {
				if (!this.fileId) return;

				const marker = model.getMarkerById(markerId);
				if (!marker || marker.fileId !== this.fileId) return;

				try {
					const targetView = this.getViewForFile(this.fileId);
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

					// Hover logic
					const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
					if (pos !== null) {
						const markerId = this.getMarkerAtPos(view, pos);

						if (markerId !== this.hoveredMarkerId) {
							this.hoveredMarkerId = markerId;
							view.dispatch({
								effects: setHoverEffect.of({ markerId })
							});
						}
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
					if (this.hoveredMarkerId) {
						this.hoveredMarkerId = null;
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
