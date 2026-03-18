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
import { HandleOverlayRenderer } from "./handleOverlayRenderer";

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
			_lastDragUpdate: number = 0;

			// Local hover state
			hoveredMarkerId: string | null = null;
			hoveredMarkerIds: string[] = [];
			isInPartialOverlap = false;
			_hoverClearTimeout: ReturnType<typeof setTimeout> | null = null;

			// Handle overlay renderer
			private renderer: HandleOverlayRenderer;

			constructor(view: EditorView) {
				this.instanceId = Math.random().toString(36).substr(2, 9);
				this.identifyAndSendFileId(view);
				this.renderer = new HandleOverlayRenderer(model, view.scrollDOM);
				this.setupOverlayListeners(view);
			}

			private setupOverlayListeners(view: EditorView) {
				// Handle drag initiation from overlay SVGs
				const onMouseDown = (event: MouseEvent) => {
					const target = event.target as Element;
					if (!target.closest('.codemarker-handle-svg')) return;

					const markerId = target.getAttribute('data-marker-id') ||
						target.closest('[data-marker-id]')?.getAttribute('data-marker-id');
					const handleType = target.getAttribute('data-handle-type') ||
						target.closest('[data-handle-type]')?.getAttribute('data-handle-type');

					if (markerId && handleType && (handleType === 'start' || handleType === 'end')) {
						event.preventDefault();
						event.stopPropagation();

						this.dragging = { markerId, type: handleType as 'start' | 'end' };

						document.body.classList.add('codemarker-dragging');
						document.body.classList.add(handleType === 'start' ? 'codemarker-dragging-start' : 'codemarker-dragging-end');

						view.dispatch({
							effects: startDragEffect.of({ markerId, type: handleType as 'start' | 'end' })
						});

						// Document-level mouseup to ensure drag always ends,
						// even if mouse is released outside the editor
						const onDocMouseUp = () => {
							document.removeEventListener('mouseup', onDocMouseUp, true);
							if (this.dragging) {
								const endMarkerId = this.dragging.markerId;
								this.dragging = null;
								document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
								view.dispatch({
									effects: endDragEffect.of({ markerId: endMarkerId })
								});
							}
						};
						document.addEventListener('mouseup', onDocMouseUp, true);
					}
				};
				this.renderer.overlayEl.addEventListener('mousedown', onMouseDown);
				this.cleanup.push(() => this.renderer.overlayEl.removeEventListener('mousedown', onMouseDown));

				// Hover maintenance on overlay — CM6 eventHandlers are on
				// contentDOM, so mouse events on overlay SVGs (sibling of
				// contentDOM inside scrollDOM) never reach them. This listener
				// keeps hover alive when the mouse is on a handle.
				const onOverlayMouseMove = (event: MouseEvent) => {
					const target = event.target as Element;
					const handleSvg = target.closest?.('.codemarker-handle-svg');
					if (!handleSvg) return;

					const handleMarkerId = handleSvg.getAttribute('data-marker-id');
					if (!handleMarkerId) return;

					// Cancel any pending debounce clear
					if (this._hoverClearTimeout) {
						clearTimeout(this._hoverClearTimeout);
						this._hoverClearTimeout = null;
					}

					// Only dispatch if marker changed
					if (handleMarkerId !== this.hoveredMarkerId) {
						this.hoveredMarkerId = handleMarkerId;
						this.hoveredMarkerIds = [handleMarkerId];
						this.isInPartialOverlap = false;
						view.dispatch({
							effects: setHoverEffect.of({ markerId: handleMarkerId })
						});
					}
				};
				this.renderer.overlayEl.addEventListener('mousemove', onOverlayMouseMove);
				this.cleanup.push(() => this.renderer.overlayEl.removeEventListener('mousemove', onOverlayMouseMove));
			}

			private identifyAndSendFileId(view: EditorView, retryCount = 0) {
				const fileId = findFileIdForEditorView(view, model.plugin.app);

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

			getMarkerAtPos(view: EditorView, pos: number): string | null {
				if (!this.fileId) return null;
				return findSmallestMarkerAtPos(pos, this.fileId, model, view, model.plugin.app);
			}

			updateMarkerPosition(view: EditorView, markerId: string, newPos: number, type: 'start' | 'end') {
				if (!this.fileId) return;

				const marker = model.getMarkerById(markerId);
				if (!marker || marker.fileId !== this.fileId) return;

				try {
					const targetView = getViewForFile(this.fileId, model.plugin.app);
					if (!targetView?.editor) return;

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
					model.updateMarkersForFile(this.fileId!);

				} catch (e) {
					console.warn(`QualiaCoding: Error updating marker position`, e);
				}
			}

			update(update: ViewUpdate) {
				if (!this.fileId || !this.fileIdSent) {
					setTimeout(() => {
						this.identifyAndSendFileId(update.view);
					}, 0);
				}

				// When text changes, schedule a debounced save of synced positions
				if (update.docChanged && this.fileId) {
					model.markDirtyForSave();
				}

				// Sync fileId, hover state from external dispatchers (margin panel, rename, etc.)
				for (const tr of update.transactions) {
					for (const effect of tr.effects) {
						if (effect.is(setFileIdEffect)) {
							this.fileId = effect.value.fileId;
							this.fileIdSent = true;
						}
						if (effect.is(setHoverEffect)) {
							const { markerId, hoveredIds } = effect.value;
							this.hoveredMarkerId = markerId;
							this.hoveredMarkerIds = hoveredIds ?? (markerId ? [markerId] : []);
							this.isInPartialOverlap = (hoveredIds?.length ?? 0) > 1 && markerId === null;
						}
					}
				}

				if (this.fileId) {
					if (this.dragging) {
						// During drag: only reposition the dragged marker's handles (fast path)
						this.renderer.scheduleDragRender(update.view, this.fileId, this.dragging.markerId);
					} else {
						// Normal: full handle overlay render
						this.renderer.scheduleRender(update.view, {
							fileId: this.fileId,
							hoveredMarkerId: this.hoveredMarkerId,
							hoveredMarkerIds: [...this.hoveredMarkerIds],
						});
					}
				}
			}

			destroy() {
				if (this._hoverClearTimeout) {
					clearTimeout(this._hoverClearTimeout);
					this._hoverClearTimeout = null;
				}
				this.cleanup.forEach(cleanupFn => cleanupFn());
				this.dragging = null;
				this.hoveredMarkerId = null;
				this.hoveredMarkerIds = [];
				this.fileIdSent = false;
				this.renderer.destroy();
				document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
			}
		},
		{
			eventHandlers: {
				// NOTE: mousedown for handle drag is on the overlay div
				// (setupOverlayListeners), because SVGs live outside contentDOM.
				// CM6 eventHandlers only see contentDOM events.

				// MOUSEMOVE: Drag + Hover
				mousemove(event: MouseEvent, view: EditorView) {
					if (this.dragging) {
						event.preventDefault();

						// Throttle drag updates to ~60fps (16ms)
						const now = Date.now();
						if (now - this._lastDragUpdate < 16) return true;
						this._lastDragUpdate = now;

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
					let targetMarkerId = hoverTarget?.getAttribute('data-marker-id') ?? null;

					// If not on a highlight but hover is active,
					// debounce the clear — CM6 splits highlights at formatting
					// boundaries so the mouse briefly sees null between sub-spans
					// of the same marker. 30ms bridges that gap.
					if (!targetMarkerId && (this.hoveredMarkerId || this.hoveredMarkerIds.length > 0)) {
						if (!this._hoverClearTimeout) {
							this._hoverClearTimeout = setTimeout(() => {
								this._hoverClearTimeout = null;
								this.hoveredMarkerId = null;
								this.hoveredMarkerIds = [];
								this.isInPartialOverlap = false;
								try {
									view.dispatch({
										effects: setHoverEffect.of({ markerId: null })
									});
								} catch { /* view may be destroyed */ }
							}, 30);
						}
						return false;
					}

					// Mouse is on a highlight (or no hover active) — cancel any
					// pending clear since we re-entered a marker span
					if (this._hoverClearTimeout) {
						clearTimeout(this._hoverClearTimeout);
						this._hoverClearTimeout = null;
					}

					if (targetMarkerId && this.fileId) {
						const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
						if (pos !== null) {
							const hit = classifyMarkersAtPos(pos, this.fileId, model, view, model.plugin.app);
							if (hit.isPartialOverlap) {
								// Partial overlap — hover visual on all, no winner for menu
								if (!this.isInPartialOverlap || this.hoveredMarkerId !== null) {
									this.hoveredMarkerId = null;
									this.hoveredMarkerIds = hit.hoveredIds;
									this.isInPartialOverlap = true;
									view.dispatch({
										effects: setHoverEffect.of({ markerId: null, hoveredIds: hit.hoveredIds })
									});
								}
							} else {
								this.isInPartialOverlap = false;
								if (hit.markerId !== this.hoveredMarkerId) {
									this.hoveredMarkerId = hit.markerId;
									this.hoveredMarkerIds = hit.markerId ? [hit.markerId] : [];
									view.dispatch({
										effects: setHoverEffect.of({ markerId: hit.markerId })
									});
								}
							}
						}
					} else if (targetMarkerId !== this.hoveredMarkerId || this.isInPartialOverlap) {
						this.hoveredMarkerId = targetMarkerId;
						this.hoveredMarkerIds = targetMarkerId ? [targetMarkerId] : [];
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
						this.hoveredMarkerIds = [];
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
