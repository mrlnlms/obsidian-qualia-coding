import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { findFileIdForEditorView } from "./utils/viewLookupUtils";
import { findSmallestMarkerAtPos, classifyMarkersAtPos } from "./utils/markerPositionUtils";
import { setFileIdEffect, setHoverEffect } from "./markerStateField";
import { HandleOverlayRenderer } from "./handleOverlayRenderer";
import { DragManager } from "./dragManager";

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

			drag: DragManager;
			private cleanup: Array<() => void> = [];

			// Local hover state
			hoveredMarkerId: string | null = null;
			hoveredMarkerIds: string[] = [];
			isInPartialOverlap = false;
			_hoverClearTimeout: ReturnType<typeof setTimeout> | null = null;

			// Handle overlay renderer
			private renderer: HandleOverlayRenderer;

			constructor(view: EditorView) {
				this.instanceId = Math.random().toString(36).substr(2, 9);
				this.drag = new DragManager(model);
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
						this.drag.start(view, markerId, handleType as 'start' | 'end');
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
					if (this.drag.current) {
						// During drag: only reposition the dragged marker's handles (fast path)
						this.renderer.scheduleDragRender(update.view, this.fileId, this.drag.current.markerId);
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
					if (this.drag.current) {
						return this.drag.move(view, event, this.fileId!);
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
					if (this.drag.current) {
						const markerId = this.drag.current.markerId;
						this.drag.end(view, markerId);
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
