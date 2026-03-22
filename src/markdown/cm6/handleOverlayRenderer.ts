import { EditorView } from "@codemirror/view";
import type { CodeMarkerModel } from "../models/codeMarkerModel";
import { getViewForFile } from "./utils/viewLookupUtils";

export interface HandleData {
	x: number; y: number; type: 'start' | 'end';
	markerId: string; color: string; isHovered: boolean;
	shouldShow: boolean; index: number;
	fontSize: number; lineHeight: number;
}

export interface HandleRenderState {
	fileId: string;
	hoveredMarkerId: string | null;
	hoveredMarkerIds: string[];
}

export class HandleOverlayRenderer {
	readonly overlayEl: HTMLDivElement;
	private handleElements = new Map<string, SVGSVGElement>();
	private _lastFontSize = 0;
	private scrollDOM: HTMLElement;
	private originalPosition: string;

	constructor(private model: CodeMarkerModel, scrollDOM: HTMLElement) {
		this.scrollDOM = scrollDOM;
		this.originalPosition = scrollDOM.style.position;
		this.overlayEl = document.createElement('div');
		this.overlayEl.className = 'codemarker-handle-overlay';
		this.overlayEl.style.position = 'absolute';
		this.overlayEl.style.top = '0';
		this.overlayEl.style.left = '0';
		this.overlayEl.style.width = '100%';
		this.overlayEl.style.height = '0';
		this.overlayEl.style.overflow = 'visible';
		this.overlayEl.style.pointerEvents = 'none';
		this.overlayEl.style.zIndex = '1000';
		scrollDOM.style.position = 'relative';
		scrollDOM.appendChild(this.overlayEl);
	}

	/** Full render — used when NOT dragging */
	scheduleRender(view: EditorView, state: HandleRenderState): void {
		const { fileId, hoveredMarkerId, hoveredMarkerIds } = state;

		view.requestMeasure({
			key: 'codemarker-handle-overlay',
			read: (view) => {
				const settings = this.model.getSettings();
				const markers = this.model.getMarkersForFile(fileId);
				if (!markers || markers.length === 0) return null;

				const targetView = getViewForFile(fileId, this.model.plugin.app);
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
						const def = this.model.registry.getById(m.codes[0]!.codeId);
						if (def) handleColor = def.color;
					}

					try {
						const fromOffset = targetView.editor.posToOffset(m.range.from);
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
				this.applyHandles(result);
			}
		});
	}

	/** Fast path — during drag, only reposition the dragged marker's handles */
	scheduleDragRender(view: EditorView, fileId: string, dragMarkerId: string): void {
		view.requestMeasure({
			key: 'codemarker-handle-overlay',
			read: (view) => {
				const marker = this.model.getMarkerById(dragMarkerId);
				if (!marker) return null;

				const targetView = getViewForFile(fileId, this.model.plugin.app);
				if (!targetView?.editor) return null;

				const scrollRect = view.scrollDOM.getBoundingClientRect();

				try {
					const fromOffset = targetView.editor.posToOffset(marker.range.from);
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

	destroy(): void {
		this.handleElements.clear();
		this.overlayEl.remove();
		this.scrollDOM.style.position = this.originalPosition;
	}

	// ─── Private rendering ────────────────────────────────────

	private applyHandles(result: { handles: HandleData[] } | null): void {
		// Invalidate cache when font size changes
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
		// Remove stale handles
		for (const [key, svg] of this.handleElements) {
			if (!seen.has(key)) {
				svg.remove();
				this.handleElements.delete(key);
			}
		}
	}

	private updateHandlePosition(svg: SVGSVGElement, h: HandleData): void {
		const ballSize = h.fontSize * 0.75;
		svg.style.left = `${h.x - ballSize / 2}px`;
		svg.style.top = `${h.y - h.lineHeight * 0.3}px`;
		svg.style.pointerEvents = h.shouldShow ? 'auto' : 'none';
		svg.style.zIndex = (1000 + h.index).toString();
		svg.classList.toggle('codemarker-handle-hidden', !h.shouldShow);
		svg.classList.toggle('codemarker-handle-visible', h.shouldShow && h.isHovered);
	}

	private createHandleSVG(h: HandleData): SVGSVGElement {
		const { x, y, type, markerId, color, isHovered, shouldShow, index, fontSize, lineHeight } = h;

		const ballSize = fontSize * 0.75;
		const barWidth = fontSize * 0.125;
		const barLength = lineHeight * 1.1;
		const zIndex = 1000 + index;

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
		this.overlayEl.appendChild(svg);
		return svg;
	}
}
