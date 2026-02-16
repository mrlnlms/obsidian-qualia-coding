import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { Notice } from "obsidian";
import { CodeMarkerModel, Marker } from "../models/codeMarkerModel";
import { findFileIdForEditorView, getViewForFile } from "./utils/viewLookupUtils";
import { updateFileMarkersEffect, setHoverEffect } from "./markerStateField";

/**
 * Margin Panel Extension — MAXQDA-style coded segments alongside text.
 *
 * Rule 1 — Column allocation:
 *   Bars sorted by span (largest first). Each bar goes to the rightmost
 *   (closest to text) column that's free at its vertical range.
 *   Larger bars get inner columns, smaller bars get outer columns.
 *
 * Rule 2 — Label positioning:
 *   Ideal Y = vertical midpoint of the bar.
 *   Weighted collision avoidance: larger bars keep ideal position,
 *   smaller bars get displaced. Connector line drawn when displaced.
 */

const LINE_WIDTH = 2;
const DOT_SIZE = 7;
const TICK_LENGTH = 4;
const COLUMN_WIDTH = 10;
const LABEL_HEIGHT = 16;
const MIN_LABEL_SPACE = 20;
const MAX_LABEL_SPACE = 120;
const LABEL_FONT = '500 11px sans-serif';

interface ResolvedBracket {
	marker: Marker;
	codeName: string;
	color: string;
	top: number;
	bottom: number;
	column: number;
}

interface LabelInfo {
	markerId: string;
	codeName: string;
	color: string;
	idealY: number;
	actualY: number;
	segmentTop: number;
	segmentBottom: number;
	column: number;
	weight: number;
	maxColAtY: number;
}

export const createMarginPanelExtension = (model: CodeMarkerModel) => {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			panel: HTMLElement;
			fileId: string | null = null;
			view: EditorView;
			private hoveredMarkerId: string | null = null;
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

			constructor(view: EditorView) {
				this.view = view;

				this.panel = document.createElement('div');
				this.panel.className = 'codemarker-margin-panel';

				const scroller = view.scrollDOM;
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
					if (this.hoveredMarkerId) {
						this.hoveredMarkerId = null;
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
					if (!hit) return;

					const elementType = this.detectElementType(hit);
					if (elementType !== 'label') return;

					const markerId = hit.getAttribute('data-marker-id');
					const codeName = hit.getAttribute('data-code-name');
					console.log('[CodeMarker] label click:', { markerId, codeName, elementType });
					if (codeName) {
						new Notice(`Code: ${codeName}`);
					}
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
				if (this.rafId !== null) return;
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
						if (effect.is(updateFileMarkersEffect) && effect.value.fileId === this.fileId) {
							needsRender = true;
						}
						// Text-side hover → update panel classes (no re-render)
						if (effect.is(setHoverEffect)) {
							const newId = effect.value.markerId;
							if (newId !== this.hoveredMarkerId) {
								this.hoveredMarkerId = newId;
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

				if (update.docChanged) {
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

					let shouldHover = false;
					if (this.hoveredMarkerId === mid) {
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
				this.panel.innerHTML = '';

				if (!this.fileId) return;

				const markers = model.getMarkersForFile(this.fileId);
				if (markers.length === 0) {
					this.panel.style.width = '0';
					this.view.contentDOM.style.paddingLeft = '';
					return;
				}

				const targetView = getViewForFile(this.fileId, model.plugin.app);
				if (!targetView?.editor) return;

				const contentTop = this.view.contentDOM.offsetTop;

				const brackets: ResolvedBracket[] = [];

				for (const marker of markers) {
					if (marker.codes.length === 0) continue;

					let startOffset: number, endOffset: number;
					try {
						// @ts-ignore
						startOffset = targetView.editor.posToOffset(marker.range.from);
						// @ts-ignore
						endOffset = targetView.editor.posToOffset(marker.range.to);
					} catch {
						continue;
					}

					let topPx: number, bottomPx: number;
					try {
						const startBlock = this.view.lineBlockAt(startOffset);
						const endBlock = this.view.lineBlockAt(endOffset);
						topPx = startBlock.top;
						bottomPx = endBlock.bottom;
					} catch {
						continue;
					}

					for (const codeName of marker.codes) {
						const def = model.registry.getByName(codeName);
						const color = def?.color ?? marker.color;

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
					return;
				}

				// Rule 1: Assign columns — larger bars get rightmost (closest to text)
				this.assignColumns(brackets);

				// Rule 2: Resolve labels with weighted collision avoidance
				const labels = this.resolveLabels(brackets);

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
					const needed = textWidth + barsRight + 4; // 4px padding
					neededLabelSpace = Math.max(neededLabelSpace, needed);
				}

				const maxColumn = Math.max(...brackets.map(b => b.column));
				const linesWidth = (maxColumn + 1) * COLUMN_WIDTH;
				const labelSpace = Math.min(neededLabelSpace - linesWidth, MAX_LABEL_SPACE);
				const panelWidth = linesWidth + Math.max(labelSpace, MIN_LABEL_SPACE);
				const gap = 20;
				this.panel.style.width = `${panelWidth}px`;

				const neededSpace = panelWidth + gap;

				// Reset padding to detect natural space (from RLL or wide margins)
				this.view.contentDOM.style.paddingLeft = '';
				const naturalLeft = this.view.contentDOM.offsetLeft;

				if (naturalLeft >= neededSpace) {
					// Enough natural space — position panel without forcing padding
					this.panel.style.left = `${naturalLeft - panelWidth - gap}px`;
				} else {
					// Not enough space — force padding (discount natural offset), panel at start
					this.view.contentDOM.style.paddingLeft = `${neededSpace - naturalLeft}px`;
					this.panel.style.left = '0px';
				}

				const scrollTop = this.view.scrollDOM.scrollTop;
				const viewportHeight = this.view.scrollDOM.clientHeight;
				const viewTop = scrollTop - 100;
				const viewBottom = scrollTop + viewportHeight + 100;

				// Render bars
				for (const bracket of brackets) {
					if (bracket.bottom < viewTop || bracket.top > viewBottom) continue;
					this.renderBar(bracket, panelWidth);
				}

				// Render labels + connectors
				for (const label of labels) {
					const labelBottom = label.actualY + LABEL_HEIGHT;
					if (labelBottom < viewTop && label.segmentBottom < viewTop) continue;
					if (label.actualY > viewBottom) continue;
					this.renderLabel(label, panelWidth);
				}

				// Re-apply hover classes after DOM rebuild
				this.applyHoverClasses();
			}

			/**
			 * Rule 1: Sort by span descending (largest first).
			 * Allocate each bar to the rightmost free column at its range.
			 */
			private assignColumns(brackets: ResolvedBracket[]) {
				brackets.sort((a, b) => {
					const spanA = a.bottom - a.top;
					const spanB = b.bottom - b.top;
					if (spanB !== spanA) return spanB - spanA; // larger first
					return a.top - b.top; // tiebreak: earlier start first
				});

				// columnRanges[col] = occupied vertical ranges in that column
				const columnRanges: Array<Array<{ top: number; bottom: number }>> = [];

				for (const bracket of brackets) {
					let assigned = false;
					for (let col = 0; col < columnRanges.length; col++) {
						const ranges = columnRanges[col]!;
						const overlaps = ranges.some(
							r => bracket.top < r.bottom && bracket.bottom > r.top
						);
						if (!overlaps) {
							bracket.column = col;
							ranges.push({ top: bracket.top, bottom: bracket.bottom });
							assigned = true;
							break;
						}
					}
					if (!assigned) {
						bracket.column = columnRanges.length;
						columnRanges.push([{ top: bracket.top, bottom: bracket.bottom }]);
					}
				}
			}

			/**
			 * Rule 2: Labels at bar start (top), weighted collision avoidance.
			 * Heavier bars (larger span) get placed first and keep ideal position.
			 * Lighter bars get displaced up/down minimally.
			 */
			private resolveLabels(brackets: ResolvedBracket[]): LabelInfo[] {
				const labels: LabelInfo[] = brackets.map(b => {
					const midY = (b.top + b.bottom) / 2 - LABEL_HEIGHT / 2;
					return {
						markerId: b.marker.id,
						codeName: b.codeName,
						color: b.color,
						idealY: midY,
						actualY: midY,
						segmentTop: b.top,
						segmentBottom: b.bottom,
						column: b.column,
						weight: b.bottom - b.top,
						maxColAtY: b.column,
					};
				});

				// Place leftmost column first (highest column number = outermost)
				labels.sort((a, b) => b.column - a.column);

				const placedYs: number[] = [];

				for (const label of labels) {
					let bestY = label.idealY;

					const collides = (y: number) =>
						placedYs.some(py => Math.abs(y - py) < LABEL_HEIGHT);

					if (collides(bestY)) {
						// Only push down, never up
						for (let step = 1; step <= 50; step++) {
							const yDown = label.idealY + step * LABEL_HEIGHT;
							if (!collides(yDown)) { bestY = yDown; break; }
						}
					}

					label.actualY = bestY;
					placedYs.push(bestY);
				}

				return labels;
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
				el.style.maxWidth = `${leftmostBarEdge - 14}px`;
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
				this.panel.remove();
			}
		}
	);
};
