import { ViewPlugin, EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { CodeMarkerModel } from "../models/codeMarkerModel";
import { showCodingMenuEffect } from "./selectionMenuField";
import { SelectionSnapshot } from "../menu/menuTypes";
import { findFileIdForEditorView, getViewForFile } from "./utils/viewLookupUtils";
import { findSmallestMarkerAtPos } from "./utils/markerPositionUtils";

const HOVER_DELAY = 350;
const CLOSE_DELAY = 200;

const TOOLTIP_ENTER_EVENT = 'codemarker-tooltip-mouseenter';
const TOOLTIP_LEAVE_EVENT = 'codemarker-tooltip-mouseleave';

export const createHoverMenuExtension = (model: CodeMarkerModel) => {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			hoverTimer: ReturnType<typeof setTimeout> | null = null;
			closeTimer: ReturnType<typeof setTimeout> | null = null;
			currentHoverMarkerId: string | null = null;
			pendingMarkerId: string | null = null; // tracks which marker the hover timer is for
			isMenuOpen = false;
			fileId: string | null = null;
			view: EditorView;
			lastMousePos: { x: number; y: number } | null = null;

			boundTooltipEnter: () => void;
			boundTooltipLeave: () => void;
			boundHandleMouseDown: (e: Event) => void;

			constructor(view: EditorView) {
				this.view = view;
				this.boundTooltipEnter = () => this.onTooltipMouseEnter();
				this.boundTooltipLeave = () => this.onTooltipMouseLeave();

				// Capture-phase listener to detect handle clicks
				// (markerViewPlugin's stopPropagation blocks normal handlers)
				this.boundHandleMouseDown = (e: Event) => {
					const target = e.target as HTMLElement;
					if (target.closest?.('.codemarker-handle-svg') ||
						target.classList?.contains('codemarker-circle') ||
						target.classList?.contains('codemarker-line')) {
						this.cancelAll();
						// Defer close so event propagates to markerViewPlugin first (drag init)
						if (this.isMenuOpen) setTimeout(() => this.closeHoverMenu(), 0);
					}
				};
				document.addEventListener('mousedown', this.boundHandleMouseDown, true);

				this.identifyFile();
			}

			identifyFile(retryCount = 0) {
				const fileId = findFileIdForEditorView(this.view, model.plugin.app);
				if (fileId) {
					this.fileId = fileId;
					return;
				}
				if (retryCount < 5) {
					setTimeout(() => this.identifyFile(retryCount + 1), 300);
				}
			}

			getMarkerAtPos(pos: number): string | null {
				if (!this.fileId) return null;
				return findSmallestMarkerAtPos(pos, this.fileId, model, this.view, model.plugin.app);
			}

			getViewForFileLocal() {
				if (!this.fileId) return null;
				return getViewForFile(this.fileId, model.plugin.app);
			}

			cancelAll() {
				if (this.hoverTimer) { clearTimeout(this.hoverTimer); this.hoverTimer = null; }
				if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
				this.pendingMarkerId = null;
			}

			clearCloseTimer() {
				if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
			}

			startCloseTimer() {
				this.clearCloseTimer();
				this.closeTimer = setTimeout(() => {
					this.closeHoverMenu();
				}, CLOSE_DELAY);
			}

			openHoverMenu(markerId: string) {
				this.hoverTimer = null;
				this.pendingMarkerId = null;

				// Re-verify: is the mouse still over this marker?
				if (this.lastMousePos) {
					const pos = this.view.posAtCoords(this.lastMousePos);
					if (pos === null) return;
					const currentMarkerId = this.getMarkerAtPos(pos);
					if (currentMarkerId !== markerId) return;
				}

				if (!this.fileId) return;

				// Guard: active text selection = selection menu has priority
				const sel = this.view.state.selection.main;
				if (sel.from !== sel.to) return;

				// Guard: don't open if tooltip already visible
				const existing = this.view.dom.ownerDocument.querySelector('.codemarker-tooltip-menu');
				if (existing) return;

				// Guard: drag in progress
				if (document.body.classList.contains('codemarker-dragging')) return;

				const marker = model.getMarkerById(markerId);
				if (!marker || marker.fileId !== this.fileId) return;
				if (marker.codes.length === 0) return;

				const targetView = this.getViewForFileLocal();
				if (!targetView?.editor) return;

				let startOffset: number, endOffset: number;
				try {
					// @ts-ignore
					startOffset = targetView.editor.posToOffset(marker.range.from);
					// @ts-ignore
					endOffset = targetView.editor.posToOffset(marker.range.to);
				} catch { return; }

				const text = this.view.state.sliceDoc(startOffset, endOffset);

				const snapshot: SelectionSnapshot = {
					from: startOffset,
					to: endOffset,
					text,
					fileId: this.fileId,
					hoverMarkerId: markerId,
				};

				this.view.dispatch({
					effects: [
						showCodingMenuEffect.of({
							pos: startOffset,
							end: endOffset,
							snapshot
						}),
					]
				});

				this.isMenuOpen = true;
				this.currentHoverMarkerId = markerId;

				document.addEventListener(TOOLTIP_ENTER_EVENT, this.boundTooltipEnter);
				document.addEventListener(TOOLTIP_LEAVE_EVENT, this.boundTooltipLeave);
			}

			closeHoverMenu() {
				if (!this.isMenuOpen) return;

				this.view.dispatch({
					effects: [
						showCodingMenuEffect.of(null),
					]
				});

				this.isMenuOpen = false;
				this.currentHoverMarkerId = null;
				this.cancelAll();

				document.removeEventListener(TOOLTIP_ENTER_EVENT, this.boundTooltipEnter);
				document.removeEventListener(TOOLTIP_LEAVE_EVENT, this.boundTooltipLeave);
			}

			onTooltipMouseEnter() {
				this.clearCloseTimer();
			}

			onTooltipMouseLeave() {
				this.startCloseTimer();
			}

			update(update: ViewUpdate) {
				if (!this.fileId) this.identifyFile();

				// Detect external tooltip close (e.g. modal's onClose, command palette)
				// and reset hover state so future hovers aren't blocked.
				if (this.isMenuOpen) {
					for (const tr of update.transactions) {
						for (const effect of tr.effects) {
							if (effect.is(showCodingMenuEffect) && effect.value === null) {
								this.isMenuOpen = false;
								this.currentHoverMarkerId = null;
								this.cancelAll();
								document.removeEventListener(TOOLTIP_ENTER_EVENT, this.boundTooltipEnter);
								document.removeEventListener(TOOLTIP_LEAVE_EVENT, this.boundTooltipLeave);
								return;
							}
						}
					}
				}
			}

			destroy() {
				this.cancelAll();
				document.removeEventListener(TOOLTIP_ENTER_EVENT, this.boundTooltipEnter);
				document.removeEventListener(TOOLTIP_LEAVE_EVENT, this.boundTooltipLeave);
				document.removeEventListener('mousedown', this.boundHandleMouseDown, true);
			}
		},
		{
			eventHandlers: {
				mousemove(event: MouseEvent, view: EditorView) {
					this.lastMousePos = { x: event.clientX, y: event.clientY };

					// Drag in progress — kill everything
					if (document.body.classList.contains('codemarker-dragging')) {
						this.cancelAll();
						if (this.isMenuOpen) this.closeHoverMenu();
						return false;
					}

					const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
					if (pos === null) {
						// Mouse is outside text area — treat as leaving
						this.cancelAll();
						if (this.isMenuOpen) this.startCloseTimer();
						return false;
					}

					const markerId = this.getMarkerAtPos(pos);

					if (markerId) {
						// Mouse is on a marker
						this.clearCloseTimer();

						if (this.isMenuOpen && markerId !== this.currentHoverMarkerId) {
							// Different marker — close current, start timer for new one
							this.closeHoverMenu();
							this.pendingMarkerId = markerId;
							this.hoverTimer = setTimeout(() => {
								this.openHoverMenu(markerId);
							}, HOVER_DELAY);
						} else if (!this.isMenuOpen && markerId !== this.pendingMarkerId) {
							// No menu open — start fresh hover timer
							this.cancelAll();
							this.pendingMarkerId = markerId;
							this.hoverTimer = setTimeout(() => {
								this.openHoverMenu(markerId);
							}, HOVER_DELAY);
						}
					} else {
						// Mouse is not on any marker
						if (this.hoverTimer) {
							// Cancel pending open — mouse left before timer fired
							this.cancelAll();
						}
						if (this.isMenuOpen) {
							this.startCloseTimer();
						}
					}

					return false;
				},

				mousedown(_event: MouseEvent, _view: EditorView) {
					this.cancelAll();
					if (this.isMenuOpen) {
						const tooltip = _view.dom.ownerDocument.querySelector('.codemarker-tooltip-menu');
						if (tooltip && tooltip.contains(_event.target as Node)) {
							return false;
						}
						this.closeHoverMenu();
					}
					return false;
				},

				mouseleave(_event: MouseEvent, _view: EditorView) {
					this.cancelAll();
					if (this.isMenuOpen) {
						this.startCloseTimer();
					}
					return false;
				}
			}
		}
	);
};
