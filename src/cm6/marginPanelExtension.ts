import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { CodeMarkerModel, Marker } from "../models/codeMarkerModel";
import { findFileIdForEditorView, getViewForFile } from "./utils/viewLookupUtils";
import { updateFileMarkersEffect } from "./markerStateField";

/**
 * Margin Panel Extension — MAXQDA-style colored brackets alongside text.
 *
 * Renders vertical colored brackets to the left of the editor content,
 * showing the extent of each coded marker. Each bracket displays:
 * - A vertical colored line spanning the marker's text range
 * - Small horizontal ticks at top and bottom
 * - The code name as a label
 *
 * Brackets from different codes are stacked horizontally (left offset).
 * Only brackets visible in the viewport are rendered.
 */

const BRACKET_WIDTH = 3;
const TICK_LENGTH = 6;
const LABEL_OFFSET = 4;
const COLUMN_WIDTH = 80;  // horizontal space per bracket column
const PANEL_MIN_WIDTH = 0;

interface ResolvedBracket {
	marker: Marker;
	codeName: string;
	color: string;
	top: number;    // px from content top
	bottom: number; // px from content top
	column: number; // horizontal stacking index
}

export const createMarginPanelExtension = (model: CodeMarkerModel) => {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			panel: HTMLElement;
			fileId: string | null = null;
			view: EditorView;
			private scrollHandler: () => void;
			private resizeObserver: ResizeObserver | null = null;
			private rafId: number | null = null;
			private lastViewportFrom = -1;
			private lastViewportTo = -1;

			constructor(view: EditorView) {
				this.view = view;

				// Create the panel container
				this.panel = document.createElement('div');
				this.panel.className = 'codemarker-margin-panel';

				// Insert panel into the scroller, before content
				const scroller = view.scrollDOM;
				scroller.style.position = 'relative';
				scroller.insertBefore(this.panel, scroller.firstChild);

				// Scroll sync
				this.scrollHandler = () => this.scheduleUpdate();
				scroller.addEventListener('scroll', this.scrollHandler, { passive: true });

				// Resize observer on content
				this.resizeObserver = new ResizeObserver(() => this.scheduleUpdate());
				this.resizeObserver.observe(view.contentDOM);

				// Identify file
				this.identifyFile();

				// Initial render (deferred to allow file identification)
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

				// Check for marker update effects
				let needsRender = false;
				for (const tr of update.transactions) {
					for (const effect of tr.effects) {
						if (effect.is(updateFileMarkersEffect) && effect.value.fileId === this.fileId) {
							needsRender = true;
						}
					}
				}

				// Check viewport changes
				const vp = update.view.viewport;
				if (vp.from !== this.lastViewportFrom || vp.to !== this.lastViewportTo) {
					this.lastViewportFrom = vp.from;
					this.lastViewportTo = vp.to;
					needsRender = true;
				}

				// Doc changes
				if (update.docChanged) {
					needsRender = true;
				}

				if (needsRender) {
					this.scheduleUpdate();
				}
			}

			private renderBrackets() {
				// Clear existing
				this.panel.innerHTML = '';

				if (!this.fileId) return;

				const markers = model.getMarkersForFile(this.fileId);
				if (markers.length === 0) {
					this.panel.style.width = '0';
					return;
				}

				const targetView = getViewForFile(this.fileId, model.plugin.app);
				if (!targetView?.editor) return;

				// Resolve pixel positions for each marker+code pair
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

					// Get pixel positions using lineBlockAt
					let topPx: number, bottomPx: number;
					try {
						const startBlock = this.view.lineBlockAt(startOffset);
						const endBlock = this.view.lineBlockAt(endOffset);
						topPx = startBlock.top;
						bottomPx = endBlock.bottom;
					} catch {
						continue;
					}

					// Create one bracket per code on this marker
					for (const codeName of marker.codes) {
						const def = model.registry.getByName(codeName);
						const color = def?.color ?? marker.color;

						brackets.push({
							marker,
							codeName,
							color,
							top: topPx,
							bottom: bottomPx,
							column: 0, // assigned below
						});
					}
				}

				if (brackets.length === 0) {
					this.panel.style.width = '0';
					return;
				}

				// Assign columns: brackets that overlap vertically go in different columns
				this.assignColumns(brackets);

				const maxColumn = Math.max(...brackets.map(b => b.column));
				const panelWidth = (maxColumn + 1) * COLUMN_WIDTH;
				this.panel.style.width = `${Math.max(panelWidth, PANEL_MIN_WIDTH)}px`;

				// Get scroll offset to determine visibility
				const scrollTop = this.view.scrollDOM.scrollTop;
				const viewportHeight = this.view.scrollDOM.clientHeight;
				const viewTop = scrollTop - 100; // buffer
				const viewBottom = scrollTop + viewportHeight + 100;

				// Render each bracket
				for (const bracket of brackets) {
					// Viewport culling
					if (bracket.bottom < viewTop || bracket.top > viewBottom) continue;

					this.renderBracket(bracket, panelWidth);
				}
			}

			private assignColumns(brackets: ResolvedBracket[]) {
				// Sort by start position, then by size (larger first)
				brackets.sort((a, b) => {
					if (a.top !== b.top) return a.top - b.top;
					return (b.bottom - b.top) - (a.bottom - a.top);
				});

				// Greedy column assignment: each bracket goes in the first column
				// where it doesn't overlap with existing brackets
				const columnEnds: number[] = []; // tracks the bottom of the last bracket in each column

				for (const bracket of brackets) {
					let assigned = false;
					for (let col = 0; col < columnEnds.length; col++) {
						if (bracket.top >= columnEnds[col]!) {
							bracket.column = col;
							columnEnds[col] = bracket.bottom;
							assigned = true;
							break;
						}
					}
					if (!assigned) {
						bracket.column = columnEnds.length;
						columnEnds.push(bracket.bottom);
					}
				}
			}

			private renderBracket(bracket: ResolvedBracket, panelWidth: number) {
				const height = bracket.bottom - bracket.top;
				if (height < 1) return;

				// Position from the right side of the panel (closest to text = column 0)
				const x = panelWidth - (bracket.column + 1) * COLUMN_WIDTH + COLUMN_WIDTH / 2;

				const el = document.createElement('div');
				el.className = 'codemarker-margin-bracket';
				el.setAttribute('data-marker-id', bracket.marker.id);
				el.setAttribute('data-code-name', bracket.codeName);

				el.style.position = 'absolute';
				el.style.top = `${bracket.top}px`;
				el.style.left = `${x}px`;
				el.style.height = `${height}px`;
				el.style.width = `${TICK_LENGTH + BRACKET_WIDTH}px`;

				// Vertical line
				const line = document.createElement('div');
				line.className = 'codemarker-margin-line';
				line.style.position = 'absolute';
				line.style.right = '0';
				line.style.top = '0';
				line.style.bottom = '0';
				line.style.width = `${BRACKET_WIDTH}px`;
				line.style.backgroundColor = bracket.color;
				line.style.borderRadius = `${BRACKET_WIDTH / 2}px`;
				el.appendChild(line);

				// Top tick
				const topTick = document.createElement('div');
				topTick.className = 'codemarker-margin-tick';
				topTick.style.position = 'absolute';
				topTick.style.right = '0';
				topTick.style.top = '0';
				topTick.style.width = `${TICK_LENGTH}px`;
				topTick.style.height = `${BRACKET_WIDTH}px`;
				topTick.style.backgroundColor = bracket.color;
				topTick.style.borderRadius = `${BRACKET_WIDTH / 2}px`;
				el.appendChild(topTick);

				// Bottom tick
				const bottomTick = document.createElement('div');
				bottomTick.className = 'codemarker-margin-tick';
				bottomTick.style.position = 'absolute';
				bottomTick.style.right = '0';
				bottomTick.style.bottom = '0';
				bottomTick.style.width = `${TICK_LENGTH}px`;
				bottomTick.style.height = `${BRACKET_WIDTH}px`;
				bottomTick.style.backgroundColor = bracket.color;
				bottomTick.style.borderRadius = `${BRACKET_WIDTH / 2}px`;
				el.appendChild(bottomTick);

				// Label
				const label = document.createElement('div');
				label.className = 'codemarker-margin-label';
				label.textContent = bracket.codeName;
				label.style.position = 'absolute';
				label.style.right = `${BRACKET_WIDTH + LABEL_OFFSET}px`;
				label.style.top = '0';
				label.style.color = bracket.color;
				label.style.whiteSpace = 'nowrap';
				label.style.direction = 'rtl'; // text flows right-to-left so it extends left
				el.appendChild(label);

				this.panel.appendChild(el);
			}

			destroy() {
				if (this.rafId !== null) cancelAnimationFrame(this.rafId);
				this.view.scrollDOM.removeEventListener('scroll', this.scrollHandler);
				if (this.resizeObserver) this.resizeObserver.disconnect();
				this.panel.remove();
			}
		}
	);
};
