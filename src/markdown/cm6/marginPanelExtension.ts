import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { findFileIdForEditorView, getViewForFile } from "./utils/viewLookupUtils";
import { updateFileMarkersEffect, setHoverEffect, setFileIdEffect } from "./markerStateField";
import {
	LINE_WIDTH, DOT_SIZE, TICK_LENGTH, COLUMN_WIDTH, LABEL_HEIGHT,
	MIN_LABEL_SPACE, MAX_LABEL_SPACE, LABEL_FONT, PANEL_LEFT_MARGIN,
	assignColumns, resolveLabels,
	type ResolvedBracket, type LabelInfo,
} from "./marginPanelLayout";

export const createMarginPanelExtension = (model: CodeMarkerModel) => {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			panel: HTMLElement;
			fileId: string | null = null;
			view: EditorView;
			private hoveredMarkerId: string | null = null;
			private hoveredMarkerIds: string[] = [];
			private hoveredCodeName: string | null = null;
			private hoveredElementType: 'bar' | 'label' | 'dot' | 'tick' | null = null;
			private scrollHandler: () => void;
			private panelMoveHandler: (e: MouseEvent) => void;
			private panelLeaveHandler: () => void;
			private panelClickHandler: (e: MouseEvent) => void;
			private resizeObserver: ResizeObserver | null = null;
			private mutationObserver: MutationObserver | null = null;
			private rafId: number | null = null;
			private lastViewportFrom = -1;
			private lastViewportTo = -1;
			private suppressMutationUntil = 0;
			private _origScrollPosition = '';

			constructor(view: EditorView) {
				this.view = view;

				this.panel = document.createElement('div');
				this.panel.className = 'codemarker-margin-panel';

				const scroller = view.scrollDOM;
				this._origScrollPosition = scroller.style.position;
				scroller.style.position = 'relative';
				scroller.insertBefore(this.panel, scroller.firstChild);

				// Panel hover: mousemove + mouseleave on the panel container
				// (same pattern as markerViewPlugin on the editor)
				this.panelMoveHandler = (e: MouseEvent) => {
					const target = e.target as HTMLElement;
					const hit = target.closest?.('[data-marker-id]') as HTMLElement | null;

					const markerId = hit?.getAttribute('data-marker-id') ?? null;
					const codeName = hit?.getAttribute('data-code-name') ?? null;
					const elementType = this.detectElementType(hit);

					// Dispatch setHoverEffect when marker changes (including to null)
					// Suppress mutation-triggered re-renders briefly — the hover dispatch
					// causes decoration rebuilds in the editor DOM which the MutationObserver
					// would pick up, destroying and recreating panel elements under the cursor.
					if (markerId !== this.hoveredMarkerId) {
						this.suppressMutationUntil = Date.now() + 150;
						this.view.dispatch({
							effects: setHoverEffect.of({ markerId })
						});
					}

					if (markerId !== this.hoveredMarkerId || codeName !== this.hoveredCodeName || elementType !== this.hoveredElementType) {
						this.hoveredMarkerId = markerId;
						this.hoveredCodeName = codeName;
						this.hoveredElementType = elementType;
						this.applyHoverClasses();
					}
				};
				this.panelLeaveHandler = () => {
					if (this.hoveredMarkerId || this.hoveredMarkerIds.length > 0) {
						this.hoveredMarkerId = null;
						this.hoveredMarkerIds = [];
						this.hoveredCodeName = null;
						this.hoveredElementType = null;
						this.applyHoverClasses();
						this.suppressMutationUntil = Date.now() + 150;
						this.view.dispatch({
							effects: setHoverEffect.of({ markerId: null })
						});
					}
				};
				this.panelClickHandler = (e: MouseEvent) => {
					const target = e.target as HTMLElement;
					const hit = target.closest?.('[data-marker-id]') as HTMLElement | null;

					let markerId: string | null = null;
					let codeName: string | null = null;
					let elementType: 'bar' | 'label' | 'dot' | 'tick' | null = null;

					if (hit) {
						elementType = this.detectElementType(hit);
						markerId = hit.getAttribute('data-marker-id');
						codeName = hit.getAttribute('data-code-name');
					} else if (this.hoveredElementType === 'label') {
						// Fallback: DOM foi rebuiltado, usar hover state
						elementType = this.hoveredElementType;
						markerId = this.hoveredMarkerId;
						codeName = this.hoveredCodeName;
					}

					if (elementType !== 'label' || !markerId || !codeName) return;

					this.suppressMutationUntil = Date.now() + 200;
					// Dispatch custom event for sidebar integration (Camada 6)
					document.dispatchEvent(new CustomEvent('codemarker:label-click', {
						detail: { markerId, codeName }
					}));
				};
				this.panel.addEventListener('mousemove', this.panelMoveHandler);
				this.panel.addEventListener('mouseleave', this.panelLeaveHandler);
				this.panel.addEventListener('click', this.panelClickHandler);

				this.scrollHandler = () => this.scheduleUpdate();
				scroller.addEventListener('scroll', this.scrollHandler, { passive: true });

				this.resizeObserver = new ResizeObserver(() => this.scheduleUpdate());
				this.resizeObserver.observe(view.contentDOM);

				this.mutationObserver = new MutationObserver(() => {
					if (Date.now() < this.suppressMutationUntil) return;
					this.scheduleUpdate();
				});
				this.mutationObserver.observe(view.dom, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ['style', 'class'],
				});

				this.identifyFile();
				setTimeout(() => this.renderBrackets(), 100);
			}

			private identifyFile(retryCount = 0) {
				const fileId = findFileIdForEditorView(this.view, model.plugin.app);
				if (fileId) {
					this.fileId = fileId;
					return;
				}
				if (retryCount < 5) {
					setTimeout(() => this.identifyFile(retryCount + 1), 300);
				}
			}

			private scheduleUpdate() {
				if (this.rafId !== null) cancelAnimationFrame(this.rafId);
				this.rafId = requestAnimationFrame(() => {
					this.rafId = null;
					this.renderBrackets();
				});
			}

			update(update: ViewUpdate) {
				if (!this.fileId) this.identifyFile();

				let needsRender = false;
				for (const tr of update.transactions) {
					for (const effect of tr.effects) {
						if (effect.is(setFileIdEffect)) {
							this.fileId = effect.value.fileId;
							needsRender = true;
						}
						if (effect.is(updateFileMarkersEffect) && effect.value.fileId === this.fileId) {
							needsRender = true;
						}
						// Text-side hover → update panel classes (no re-render)
						if (effect.is(setHoverEffect)) {
							const newId = effect.value.markerId;
							const newIds = effect.value.hoveredIds ?? (newId ? [newId] : []);
							if (newId !== this.hoveredMarkerId || newIds.length !== this.hoveredMarkerIds.length) {
								this.hoveredMarkerId = newId;
								this.hoveredMarkerIds = newIds;
								this.hoveredCodeName = null; // text hover → all codes
								this.hoveredElementType = null;
								this.applyHoverClasses();
							}
						}
					}
				}

				const vp = update.view.viewport;
				if (vp.from !== this.lastViewportFrom || vp.to !== this.lastViewportTo) {
					this.lastViewportFrom = vp.from;
					this.lastViewportTo = vp.to;
					needsRender = true;
				}

				if (update.docChanged || update.geometryChanged) {
					needsRender = true;
				}

				if (needsRender) {
					this.scheduleUpdate();
				}
			}

			/**
			 * Detect which type of margin element was hit.
			 */
			private detectElementType(el: HTMLElement | null): 'bar' | 'label' | 'dot' | 'tick' | null {
				if (!el) return null;
				if (el.classList.contains('codemarker-margin-line')) return 'bar';
				if (el.classList.contains('codemarker-margin-label')) return 'label';
				if (el.classList.contains('codemarker-margin-dot')) return 'dot';
				if (el.classList.contains('codemarker-margin-tick')) return 'tick';
				return null;
			}

			/**
			 * Toggle hover classes directly on existing DOM (no re-render).
			 *
			 * Underline logic:
			 * - Hover on bar/dot/tick → all labels of that marker get underline
			 * - Hover on label → only that specific label gets underline
			 * - Text-side hover (hoveredElementType null) → all codes of marker
			 */
			private applyHoverClasses() {
				const els = Array.from(this.panel.querySelectorAll('[data-marker-id]'));
				for (const el of els) {
					const mid = el.getAttribute('data-marker-id') || '';
					const cname = el.getAttribute('data-code-name') || '';
					const isLabel = el.classList.contains('codemarker-margin-label');

					// Check if this marker is in the multi-hover list (partial overlap)
					const isMultiHovered = this.hoveredMarkerIds.length > 1 && this.hoveredMarkerIds.includes(mid);

					let shouldHover = false;
					if (isMultiHovered) {
						// Partial overlap: all elements of all hovered markers get hover visual
						shouldHover = true;
					} else if (this.hoveredMarkerId === mid) {
						if (isLabel) {
							if (this.hoveredElementType === 'label') {
								// Hover on label → only that label
								shouldHover = this.hoveredCodeName === cname;
							} else if (this.hoveredElementType !== null) {
								// Hover on bar/dot/tick → all labels of marker
								shouldHover = true;
							} else {
								// Text-side hover (elementType null) → all codes
								shouldHover = true;
							}
						} else {
							// Bars, dots, ticks: hover if code matches or all
							shouldHover = this.hoveredCodeName === null || this.hoveredCodeName === cname;
						}
					}
					el.classList.toggle('codemarker-margin-hovered', shouldHover);
				}
			}

			private renderBrackets() {
				this.suppressMutationUntil = Date.now() + 50;
				this.panel.innerHTML = '';

				if (!this.fileId) return;

				const markers = model.getMarkersForFile(this.fileId);
				if (markers.length === 0) {
					this.panel.style.width = '0';
					this.view.contentDOM.style.paddingLeft = '';
					const g = this.view.dom.querySelector('.cm-gutters') as HTMLElement | null;
					if (g) g.style.marginLeft = '';
					return;
				}

				const targetView = getViewForFile(this.fileId, model.plugin.app);
				if (!targetView?.editor) return;

				const contentTop = this.view.contentDOM.offsetTop;

				const brackets: ResolvedBracket[] = [];

				for (const marker of markers) {
					if (marker.codes.length === 0) continue;

					// Use Obsidian's posToOffset for correct visual-line positioning.
					// posToOffset handles multi-byte/emoji chars and returns the exact
					// CM6 offset that lineBlockAt needs for wrapped-line accuracy.
					// Safety clamp: if ch exceeds line length (text edited after marker
					// creation), posToOffset overflows into the next line — detect this
					// and pull back to the end of the intended line.
					let startOffset: number, endOffset: number;
					try {
						startOffset = targetView.editor.posToOffset(marker.range.from);
						endOffset = targetView.editor.posToOffset(marker.range.to);

						// Clamp overflows: if offset landed past the intended line, pull back
						const doc = this.view.state.doc;
						const fromLineObj = doc.line(Math.min(marker.range.from.line + 1, doc.lines));
						const toLineObj = doc.line(Math.min(marker.range.to.line + 1, doc.lines));
						if (startOffset > fromLineObj.to) startOffset = fromLineObj.to;
						if (endOffset > toLineObj.to) endOffset = toLineObj.to;
					} catch {
						continue;
					}

					let topPx: number, bottomPx: number;
					try {
						// Use coordsAtPos for visual-line precision within wrapped paragraphs.
						// lineBlockAt returns the ENTIRE logical line block, so for wrapped
						// paragraphs the bar would span all visual lines instead of only the
						// ones containing the marker text.
						const startCoords = this.view.coordsAtPos(startOffset);
						const endCoords = this.view.coordsAtPos(endOffset);

						if (startCoords && endCoords) {
							const scrollRect = this.view.scrollDOM.getBoundingClientRect();
							const scrollTop = this.view.scrollDOM.scrollTop;
							topPx = startCoords.top - scrollRect.top + scrollTop - contentTop;
							bottomPx = endCoords.bottom - scrollRect.top + scrollTop - contentTop;
						} else {
							// Fallback for off-screen positions where coordsAtPos returns null
							const startBlock = this.view.lineBlockAt(startOffset);
							const endBlock = this.view.lineBlockAt(endOffset);
							topPx = startBlock.top;
							bottomPx = endBlock.bottom;
						}
					} catch {
						continue;
					}

					for (const codeApp of marker.codes) {
						const def = model.registry.getById(codeApp.codeId);
						const color = def?.color ?? marker.color;
						const codeName = def?.name ?? codeApp.codeId;

						brackets.push({
							marker,
							codeName,
							color,
							top: topPx + contentTop,
							bottom: bottomPx + contentTop,
							column: 0,
						});
					}
				}

				if (brackets.length === 0) {
					this.panel.style.width = '0';
					this.view.contentDOM.style.paddingLeft = '';
					const g = this.view.dom.querySelector('.cm-gutters') as HTMLElement | null;
					if (g) g.style.marginLeft = '';
					return;
				}

				// Rule 1: Assign columns — larger bars get rightmost (closest to text)
				assignColumns(brackets);

				// Rule 2: Resolve labels with weighted collision avoidance
				const labels = resolveLabels(brackets);

				// Compute max column at each label's ideal Y (bar center), so displaced labels keep same X
				for (const label of labels) {
					let maxColAtY = label.column;
					for (const bracket of brackets) {
						if (bracket.top < label.idealY + LABEL_HEIGHT && bracket.bottom > label.idealY) {
							maxColAtY = Math.max(maxColAtY, bracket.column);
						}
					}
					label.maxColAtY = maxColAtY;
				}

				// Measure label text widths to compute dynamic panel width
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d')!;
				ctx.font = LABEL_FONT;

				let neededLabelSpace = MIN_LABEL_SPACE;
				for (const label of labels) {
					const textWidth = ctx.measureText(label.codeName).width;
					const barsRight = (label.maxColAtY + 1) * COLUMN_WIDTH;
					const needed = textWidth + barsRight + PANEL_LEFT_MARGIN;
					neededLabelSpace = Math.max(neededLabelSpace, needed);
				}

				const maxColumn = Math.max(...brackets.map(b => b.column));
				const linesWidth = (maxColumn + 1) * COLUMN_WIDTH;
				const labelSpace = Math.min(neededLabelSpace - linesWidth, MAX_LABEL_SPACE);
				const panelWidth = linesWidth + Math.max(labelSpace, MIN_LABEL_SPACE) + PANEL_LEFT_MARGIN;
				const gap = 20;

				const neededSpace = panelWidth + gap;

				// Reset adjustments to detect natural space (from RLL or wide margins)
				this.view.contentDOM.style.paddingLeft = '';
				const gutterEl = this.view.dom.querySelector('.cm-gutters') as HTMLElement | null;
				if (gutterEl) gutterEl.style.marginLeft = '';
				const naturalLeft = this.view.contentDOM.offsetLeft;
				const gutterWidth = gutterEl ? gutterEl.offsetWidth : 0;

				let effectivePanelWidth = panelWidth;

				if (naturalLeft >= neededSpace) {
					// Enough natural space — expand panel to use all extra space for labels
					const extraSpace = naturalLeft - neededSpace;
					effectivePanelWidth = panelWidth + extraSpace;
					this.panel.style.left = `${naturalLeft - effectivePanelWidth - gap}px`;
				} else if (gutterEl && gutterWidth > 0) {
					// Line numbers present — push gutter right (content follows in flex layout)
					gutterEl.style.marginLeft = `${neededSpace - (naturalLeft - gutterWidth)}px`;
					this.panel.style.left = '0px';
				} else {
					// No line numbers — push content right
					this.view.contentDOM.style.paddingLeft = `${neededSpace - naturalLeft}px`;
					this.panel.style.left = '0px';
				}

				this.panel.style.width = `${effectivePanelWidth}px`;

				const scrollTop = this.view.scrollDOM.scrollTop;
				const viewportHeight = this.view.scrollDOM.clientHeight;
				const viewTop = scrollTop - 100;
				const viewBottom = scrollTop + viewportHeight + 100;

				// Render bars
				for (const bracket of brackets) {
					if (bracket.bottom < viewTop || bracket.top > viewBottom) continue;
					this.renderBar(bracket, effectivePanelWidth);
				}

				// Render labels + connectors
				for (const label of labels) {
					const labelBottom = label.actualY + LABEL_HEIGHT;
					if (labelBottom < viewTop && label.segmentBottom < viewTop) continue;
					if (label.actualY > viewBottom) continue;
					this.renderLabel(label, effectivePanelWidth);
				}

				// Re-apply hover classes after DOM rebuild
				this.applyHoverClasses();
			}

			/**
			 * Render a bar: vertical colored line.
			 * Column 0 = rightmost (closest to text).
			 */
			private renderBar(bracket: ResolvedBracket, panelWidth: number) {
				const height = bracket.bottom - bracket.top;
				if (height < 1) return;

				const colCenter = panelWidth - (bracket.column + 1) * COLUMN_WIDTH + COLUMN_WIDTH / 2;

				// Vertical line
				const line = document.createElement('div');
				line.className = 'codemarker-margin-line';
				line.setAttribute('data-marker-id', bracket.marker.id);
				line.setAttribute('data-code-name', bracket.codeName);
				line.style.position = 'absolute';
				line.style.top = `${bracket.top}px`;
				line.style.left = `${colCenter - LINE_WIDTH / 2}px`;
				line.style.width = `${LINE_WIDTH}px`;
				line.style.height = `${height}px`;
				line.style.backgroundColor = bracket.color;
				line.style.borderRadius = `${LINE_WIDTH / 2}px`;
				this.panel.appendChild(line);

				// Top tick (extends left)
				const topTick = document.createElement('div');
				topTick.className = 'codemarker-margin-tick';
				topTick.setAttribute('data-marker-id', bracket.marker.id);
				topTick.setAttribute('data-code-name', bracket.codeName);
				topTick.style.position = 'absolute';
				topTick.style.top = `${bracket.top}px`;
				topTick.style.left = `${colCenter}px`;
				topTick.style.width = `${TICK_LENGTH}px`;
				topTick.style.height = `${LINE_WIDTH}px`;
				topTick.style.backgroundColor = bracket.color;
				this.panel.appendChild(topTick);

				// Bottom tick (extends left)
				const bottomTick = document.createElement('div');
				bottomTick.className = 'codemarker-margin-tick';
				bottomTick.setAttribute('data-marker-id', bracket.marker.id);
				bottomTick.setAttribute('data-code-name', bracket.codeName);
				bottomTick.style.position = 'absolute';
				bottomTick.style.top = `${bracket.bottom - LINE_WIDTH}px`;
				bottomTick.style.left = `${colCenter}px`;
				bottomTick.style.width = `${TICK_LENGTH}px`;
				bottomTick.style.height = `${LINE_WIDTH}px`;
				bottomTick.style.backgroundColor = bracket.color;
				this.panel.appendChild(bottomTick);
			}

			/**
			 * Render a label to the left of all bars at its Y height,
			 * plus a filled dot on the bar's own column.
			 */
			private renderLabel(label: LabelInfo, panelWidth: number) {
				// Label goes to the left of ALL bars active at this Y height
				const leftmostBarEdge = panelWidth - (label.maxColAtY + 1) * COLUMN_WIDTH;
				const labelRightPx = (label.maxColAtY + 1) * COLUMN_WIDTH + 2;

				const el = document.createElement('div');
				el.className = 'codemarker-margin-label';
				el.setAttribute('data-marker-id', label.markerId);
				el.setAttribute('data-code-name', label.codeName);
				el.textContent = label.codeName;
				el.style.position = 'absolute';
				el.style.top = `${label.actualY}px`;
				el.style.right = `${labelRightPx}px`;
				el.style.left = 'auto';
				el.style.width = 'auto';
				el.style.maxWidth = `${leftmostBarEdge - PANEL_LEFT_MARGIN}px`;
				el.style.color = label.color;
				el.style.fontSize = '11px';
				el.style.lineHeight = `${LABEL_HEIGHT}px`;
				el.style.whiteSpace = 'nowrap';
				el.style.textAlign = 'right';
				el.style.overflow = 'hidden';
				el.style.textOverflow = 'ellipsis';
				this.panel.appendChild(el);

				// Filled dot on the bar's own column, always at bar's vertical center
				const colCenter = panelWidth - (label.column + 1) * COLUMN_WIDTH + COLUMN_WIDTH / 2;
				const dotY = (label.segmentTop + label.segmentBottom) / 2;

				const dot = document.createElement('div');
				dot.className = 'codemarker-margin-dot';
				dot.setAttribute('data-marker-id', label.markerId);
				dot.setAttribute('data-code-name', label.codeName);
				dot.style.position = 'absolute';
				dot.style.top = `${dotY - DOT_SIZE / 2}px`;
				dot.style.left = `${colCenter - DOT_SIZE / 2}px`;
				dot.style.width = `${DOT_SIZE}px`;
				dot.style.height = `${DOT_SIZE}px`;
				dot.style.borderRadius = '50%';
				dot.style.backgroundColor = label.color;
				this.panel.appendChild(dot);
			}

			destroy() {
				if (this.rafId !== null) cancelAnimationFrame(this.rafId);
				this.view.scrollDOM.removeEventListener('scroll', this.scrollHandler);
				this.panel.removeEventListener('mousemove', this.panelMoveHandler);
				this.panel.removeEventListener('mouseleave', this.panelLeaveHandler);
				this.panel.removeEventListener('click', this.panelClickHandler);
				if (this.resizeObserver) this.resizeObserver.disconnect();
				if (this.mutationObserver) this.mutationObserver.disconnect();
				this.view.contentDOM.style.paddingLeft = '';
				const g = this.view.dom.querySelector('.cm-gutters') as HTMLElement | null;
				if (g) g.style.marginLeft = '';
				this.panel.remove();
				this.view.scrollDOM.style.position = this._origScrollPosition;
			}
		}
	);
};
