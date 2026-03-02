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
import { Marker } from "../models/codeMarkerModel";

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

interface HandleData {
	x: number; y: number; type: 'start' | 'end';
	markerId: string; color: string; isHovered: boolean;
	shouldShow: boolean; index: number;
	fontSize: number; lineHeight: number;
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

			// Handle overlay — renders handles outside text flow to avoid word-break reflow
			handleOverlay: HTMLDivElement | null = null;
			private handleElements = new Map<string, SVGSVGElement>();
			private _lastFontSize: number = 0;

			constructor(view: EditorView) {
				this.instanceId = Math.random().toString(36).substr(2, 9);
				this.identifyAndSendFileId(view);
				this.createHandleOverlay(view);
			}

			private createHandleOverlay(view: EditorView) {
				this.handleOverlay = document.createElement('div');
				this.handleOverlay.className = 'codemarker-handle-overlay';
				this.handleOverlay.style.position = 'absolute';
				this.handleOverlay.style.top = '0';
				this.handleOverlay.style.left = '0';
				this.handleOverlay.style.width = '100%';
				this.handleOverlay.style.height = '0';
				this.handleOverlay.style.overflow = 'visible';
				this.handleOverlay.style.pointerEvents = 'none';
				this.handleOverlay.style.zIndex = '10000';
				view.scrollDOM.style.position = 'relative';
				view.scrollDOM.appendChild(this.handleOverlay);

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
				this.handleOverlay.addEventListener('mousedown', onMouseDown);
				this.cleanup.push(() => this.handleOverlay?.removeEventListener('mousedown', onMouseDown));

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
				this.handleOverlay.addEventListener('mousemove', onOverlayMouseMove);
				this.cleanup.push(() => this.handleOverlay?.removeEventListener('mousemove', onOverlayMouseMove));
			}

			scheduleHandleOverlayRender(view: EditorView) {
				if (!this.handleOverlay || !this.fileId) return;

				const fileId = this.fileId;
				const hoveredMarkerId = this.hoveredMarkerId;
				const hoveredMarkerIds = [...this.hoveredMarkerIds];

				view.requestMeasure({
					key: 'codemarker-handle-overlay',
					read: (view) => {
						const settings = model.getSettings();
						const markers = model.getMarkersForFile(fileId);
						if (!markers || markers.length === 0) return null;

						const targetView = this.getViewForFileLocal(fileId);
						if (!targetView?.editor) return null;

						const scrollRect = view.scrollDOM.getBoundingClientRect();
						const computedStyle = window.getComputedStyle(view.dom);
						const fontSize = parseFloat(computedStyle.fontSize);
						const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.2;

						const handles: HandleData[] = [];

						for (let i = 0; i < markers.length; i++) {
							const m = markers[i];
							if (!m) continue;
							const isHovered = m.id === hoveredMarkerId || hoveredMarkerIds.includes(m.id);
							const shouldShow = !settings.showHandlesOnHover || isHovered;

							let handleColor = '#999';
							if (m.colorOverride) {
								handleColor = m.colorOverride;
							} else if (m.codes && m.codes.length > 0) {
								const def = model.registry.getByName(m.codes[0]!);
								if (def) handleColor = def.color;
							}

							try {
								// @ts-ignore
								const fromOffset = targetView.editor.posToOffset(m.range.from);
								// @ts-ignore
								const toOffset = targetView.editor.posToOffset(m.range.to);

								const fromCoords = view.coordsAtPos(fromOffset);
								const toCoords = view.coordsAtPos(toOffset);

								if (fromCoords) {
									handles.push({
										x: fromCoords.left - scrollRect.left + view.scrollDOM.scrollLeft,
										y: fromCoords.top - scrollRect.top + view.scrollDOM.scrollTop,
										type: 'start', markerId: m.id, color: handleColor,
										isHovered, shouldShow, index: i,
										fontSize, lineHeight
									});
								}
								if (toCoords) {
									handles.push({
										x: toCoords.left - scrollRect.left + view.scrollDOM.scrollLeft,
										y: toCoords.top - scrollRect.top + view.scrollDOM.scrollTop,
										type: 'end', markerId: m.id, color: handleColor,
										isHovered, shouldShow, index: i,
										fontSize, lineHeight
									});
								}
							} catch { /* skip marker */ }
						}

						return { handles };
					},
					write: (result: { handles: HandleData[] } | null) => {
						if (!this.handleOverlay) return;

						// Invalidate cache when font size changes (e.g. settings update)
						if (result && result.handles.length > 0) {
							const newFontSize = result.handles[0]!.fontSize;
							if (this._lastFontSize && this._lastFontSize !== newFontSize) {
								for (const [, svg] of this.handleElements) {
									svg.remove();
								}
								this.handleElements.clear();
							}
							this._lastFontSize = newFontSize;
						}

						if (!result || result.handles.length === 0) {
							for (const [, svg] of this.handleElements) {
								svg.remove();
							}
							this.handleElements.clear();
							return;
						}

						const seen = new Set<string>();
						for (const h of result.handles) {
							const key = h.markerId + '-' + h.type;
							seen.add(key);
							const existing = this.handleElements.get(key);
							if (existing) {
								this.updateHandlePosition(existing, h);
							} else {
								const svg = this.createHandleSVG(h);
								this.handleElements.set(key, svg);
							}
						}
						// Remove stale handles (deleted markers)
						for (const [key, svg] of this.handleElements) {
							if (!seen.has(key)) {
								svg.remove();
								this.handleElements.delete(key);
							}
						}
					}
				});
			}

			/** Fast path: during drag, only reposition the dragged marker's handles */
			private updateDraggedHandlePosition(view: EditorView) {
				if (!this.dragging || !this.fileId) return;

				const dragMarkerId = this.dragging.markerId;
				const fileId = this.fileId;

				view.requestMeasure({
					key: 'codemarker-handle-overlay',
					read: (view) => {
						const marker = model.getMarkerById(dragMarkerId);
						if (!marker) return null;

						const targetView = this.getViewForFileLocal(fileId);
						if (!targetView?.editor) return null;

						const scrollRect = view.scrollDOM.getBoundingClientRect();

						try {
							// @ts-ignore
							const fromOffset = targetView.editor.posToOffset(marker.range.from);
							// @ts-ignore
							const toOffset = targetView.editor.posToOffset(marker.range.to);
							const fromCoords = view.coordsAtPos(fromOffset);
							const toCoords = view.coordsAtPos(toOffset);

							const computedStyle = window.getComputedStyle(view.dom);
							const fontSize = parseFloat(computedStyle.fontSize);
							const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.2;

							return {
								markerId: dragMarkerId,
								startX: fromCoords ? fromCoords.left - scrollRect.left + view.scrollDOM.scrollLeft : null,
								startY: fromCoords ? fromCoords.top - scrollRect.top + view.scrollDOM.scrollTop : null,
								endX: toCoords ? toCoords.left - scrollRect.left + view.scrollDOM.scrollLeft : null,
								endY: toCoords ? toCoords.top - scrollRect.top + view.scrollDOM.scrollTop : null,
								fontSize, lineHeight
							};
						} catch { return null; }
					},
					write: (result: { markerId: string; startX: number | null; startY: number | null; endX: number | null; endY: number | null; fontSize: number; lineHeight: number } | null) => {
						if (!result) return;

						const ballSize = result.fontSize * 0.75;
						const startSvg = this.handleElements.get(result.markerId + '-start');
						if (startSvg && result.startX !== null && result.startY !== null) {
							startSvg.style.left = `${result.startX - ballSize / 2}px`;
							startSvg.style.top = `${result.startY - result.lineHeight * 0.3}px`;
						}
						const endSvg = this.handleElements.get(result.markerId + '-end');
						if (endSvg && result.endX !== null && result.endY !== null) {
							endSvg.style.left = `${result.endX - ballSize / 2}px`;
							endSvg.style.top = `${result.endY - result.lineHeight * 0.3}px`;
						}
					}
				});
			}

			private updateHandlePosition(svg: SVGSVGElement, h: HandleData) {
				const ballSize = h.fontSize * 0.75;
				svg.style.left = `${h.x - ballSize / 2}px`;
				svg.style.top = `${h.y - h.lineHeight * 0.3}px`;
				svg.style.pointerEvents = h.shouldShow ? 'auto' : 'none';
				svg.style.zIndex = (10000 + h.index).toString();
				svg.classList.toggle('codemarker-handle-hidden', !h.shouldShow);
				svg.classList.toggle('codemarker-handle-visible', h.shouldShow && h.isHovered);
			}

			private createHandleSVG(h: HandleData): SVGSVGElement {
				const { x, y, type, markerId, color, isHovered, shouldShow, index, fontSize, lineHeight } = h;

				const ballSize = fontSize * 0.75;
				const barWidth = fontSize * 0.125;
				const barLength = lineHeight * 1.1;
				const zIndex = 10000 + index;

				let displayColor = color;
				if (color.startsWith('#')) {
					const r = parseInt(color.slice(1, 3), 16);
					const g = parseInt(color.slice(3, 5), 16);
					const b = parseInt(color.slice(5, 7), 16);
					displayColor = `rgb(${r}, ${g}, ${b})`;
				}

				const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				svg.setAttribute("width", `${ballSize}px`);
				svg.setAttribute("height", `${lineHeight * 2}px`);
				svg.style.position = 'absolute';
				svg.style.left = `${x - ballSize / 2}px`;
				svg.style.top = `${y - lineHeight * 0.3}px`;
				svg.style.overflow = 'visible';
				svg.style.pointerEvents = shouldShow ? 'auto' : 'none';
				svg.style.zIndex = zIndex.toString();
				svg.style.transformOrigin = 'center';
				svg.classList.add('codemarker-handle-svg');
				svg.setAttribute('data-marker-id', markerId);
				svg.setAttribute('data-handle-type', type);

				if (!shouldShow) {
					svg.classList.add('codemarker-handle-hidden');
				} else if (isHovered) {
					svg.classList.add('codemarker-handle-visible');
				}

				svg.style.cursor = type === 'start' ? 'w-resize' : 'e-resize';

				const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
				const groupY = type === 'start' ? lineHeight * 0.1 : lineHeight * 0.3;
				group.setAttribute("transform", `translate(${ballSize / 2}, ${groupY})`);

				const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
				line.setAttribute("x", `${-barWidth / 2}`);
				line.setAttribute("y", "0");
				line.setAttribute("width", `${barWidth}`);
				line.setAttribute("height", `${barLength}`);
				line.setAttribute("rx", `${barWidth / 2}`);
				line.setAttribute("fill", displayColor);
				line.classList.add("codemarker-line");
				line.setAttribute('data-marker-id', markerId);
				line.setAttribute('data-handle-type', type);

				const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
				circle.setAttribute("cx", "0");
				circle.setAttribute("cy", type === 'start' ? "0" : `${barLength}`);
				circle.setAttribute("r", `${ballSize / 2}`);
				circle.setAttribute("fill", displayColor);
				circle.setAttribute("stroke", "white");
				circle.setAttribute("stroke-width", `${barWidth * 0.75}`);
				circle.classList.add("codemarker-circle");
				circle.setAttribute('data-marker-id', markerId);
				circle.setAttribute('data-handle-type', type);

				group.appendChild(line);
				group.appendChild(circle);
				svg.appendChild(group);
				this.handleOverlay!.appendChild(svg);
				return svg;
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

				if (this.dragging) {
					// During drag: only reposition the dragged marker's handles (fast path)
					this.updateDraggedHandlePosition(update.view);
				} else {
					// Normal: full handle overlay render
					this.scheduleHandleOverlayRender(update.view);
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
				this.handleElements.clear();
				this.handleOverlay?.remove();
				this.handleOverlay = null;
				document.body.classList.remove('codemarker-dragging', 'codemarker-dragging-start', 'codemarker-dragging-end');
			}
		},
		{
			eventHandlers: {
				// NOTE: mousedown for handle drag is on the overlay div
				// (createHandleOverlay), because SVGs live outside contentDOM.
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
