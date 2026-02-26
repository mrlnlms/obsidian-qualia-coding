import { WidgetType, EditorView } from "@codemirror/view";
import { Marker } from "../models/codeMarkerModel";
import { CodeMarkerSettings } from "../models/settings";

/**
 * Widget that shows both start and end handles together (simplified version).
 */
export class CombinedHandleWidget extends WidgetType {
	static BALL_SIZE = 12;
	static BAR_WIDTH = 2;
	static BAR_LENGTH = 20;
	static TOP_OFFSET = 25;

	constructor(
		private marker: Marker,
		private color: string,
		private zIndex: number = 9999
	) {
		super();
	}

	eq(other: CombinedHandleWidget) {
		return this.marker.id === other.marker.id && this.zIndex === other.zIndex;
	}

	toDOM(view: EditorView) {
		const container = document.createElement('div');
		container.className = 'codemarker-handles-container';
		container.setAttribute('data-marker-id', this.marker.id);

		container.style.position = 'relative';
		container.style.display = 'inline-block';
		container.style.width = '0';
		container.style.height = '0';
		container.style.overflow = 'visible';
		container.style.zIndex = this.zIndex.toString();

		let displayColor = this.color;
		if (this.color.startsWith('#')) {
			const r = parseInt(this.color.slice(1, 3), 16);
			const g = parseInt(this.color.slice(3, 5), 16);
			const b = parseInt(this.color.slice(5, 7), 16);
			displayColor = `rgb(${r}, ${g}, ${b})`;
		}

		// Start handle
		const startHandle = document.createElement('div');
		startHandle.className = 'codemarker-handle start-handle';
		startHandle.setAttribute('data-marker-id', this.marker.id);
		startHandle.setAttribute('data-handle-type', 'start');

		startHandle.innerHTML = `
			<svg width="${CombinedHandleWidget.BALL_SIZE}" height="${CombinedHandleWidget.TOP_OFFSET + CombinedHandleWidget.BALL_SIZE}"
				 style="position:absolute; left:-${CombinedHandleWidget.BALL_SIZE/2}px; top:-${CombinedHandleWidget.TOP_OFFSET}px; cursor:w-resize; pointer-events:auto; z-index:${this.zIndex};"
				 class="codemarker-handle-svg" data-marker-id="${this.marker.id}" data-handle-type="start">
				<circle cx="${CombinedHandleWidget.BALL_SIZE/2}" cy="${CombinedHandleWidget.BALL_SIZE/2}"
						r="${CombinedHandleWidget.BALL_SIZE/2}" fill="${displayColor}" stroke="white" stroke-width="1.5"
						class="codemarker-circle" />
				<rect x="${CombinedHandleWidget.BALL_SIZE/2 - CombinedHandleWidget.BAR_WIDTH/2}"
					  y="${CombinedHandleWidget.BALL_SIZE}" width="${CombinedHandleWidget.BAR_WIDTH}"
					  height="${CombinedHandleWidget.BAR_LENGTH}" rx="1" fill="${displayColor}"
					  class="codemarker-line" />
			</svg>
		`;

		// End handle
		const endHandle = document.createElement('div');
		endHandle.className = 'codemarker-handle end-handle';
		endHandle.setAttribute('data-marker-id', this.marker.id);
		endHandle.setAttribute('data-handle-type', 'end');

		endHandle.innerHTML = `
			<svg width="${CombinedHandleWidget.BALL_SIZE}" height="${CombinedHandleWidget.TOP_OFFSET + CombinedHandleWidget.BALL_SIZE}"
				 style="position:absolute; right:-${CombinedHandleWidget.BALL_SIZE/2}px; top:-${CombinedHandleWidget.TOP_OFFSET}px; cursor:e-resize; pointer-events:auto; z-index:${this.zIndex};"
				 class="codemarker-handle-svg" data-marker-id="${this.marker.id}" data-handle-type="end">
				<rect x="${CombinedHandleWidget.BALL_SIZE/2 - CombinedHandleWidget.BAR_WIDTH/2}"
					  y="0" width="${CombinedHandleWidget.BAR_WIDTH}"
					  height="${CombinedHandleWidget.BAR_LENGTH}" rx="1" fill="${displayColor}"
					  class="codemarker-line" />
				<circle cx="${CombinedHandleWidget.BALL_SIZE/2}" cy="${CombinedHandleWidget.BAR_LENGTH + CombinedHandleWidget.BALL_SIZE/2}"
						r="${CombinedHandleWidget.BALL_SIZE/2}" fill="${displayColor}" stroke="white" stroke-width="1.5"
						class="codemarker-circle" />
			</svg>
		`;

		container.appendChild(startHandle);
		container.appendChild(endHandle);

		return container;
	}

	ignoreEvent(event: Event): boolean {
		const target = event.target as Element;
		return !(
			target.tagName === 'svg' ||
			target.tagName === 'rect' ||
			target.tagName === 'circle' ||
			target.classList.contains('codemarker-handle-svg') ||
			target.classList.contains('codemarker-line') ||
			target.classList.contains('codemarker-circle')
		);
	}
}

/**
 * Widget for a single drag handle with dynamic z-index and proportional SVG sizing.
 */
export class HandleWidget extends WidgetType {
	// Proportional sizing ratios relative to font size
	static BASE_FONT_SIZE = 16;
	static BALL_SIZE_RATIO = 0.75;
	static BAR_WIDTH_RATIO = 0.125;
	static BAR_LENGTH_RATIO = 1.1;

	private static resizeObserver: ResizeObserver | null = null;
	private static zoomListener: ((e: Event) => void) | null = null;
	private static fontSizeObserver: MutationObserver | null = null;

	constructor(
		private marker: Marker,
		private type: 'start' | 'end',
		private color: string,
		private settings: CodeMarkerSettings,
		private isHovered: boolean = false,
		private zIndex: number = 9999,
		private docOffset: number = 0
	) {
		super();
	}

	private setupResizeHandling(view: EditorView) {
		if (!HandleWidget.resizeObserver) {
			HandleWidget.resizeObserver = new ResizeObserver(() => {
				this.updateHandleDimensions(view);
			});
			HandleWidget.resizeObserver.observe(view.dom);
		}

		if (!HandleWidget.zoomListener) {
			HandleWidget.zoomListener = () => {
				this.updateHandleDimensions(view);
			};
			window.addEventListener('resize', HandleWidget.zoomListener);
			document.addEventListener('wheel', (e) => {
				if (e.ctrlKey || e.metaKey) {
					this.updateHandleDimensions(view);
				}
			});
		}

		if (!HandleWidget.fontSizeObserver) {
			HandleWidget.fontSizeObserver = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
						this.updateHandleDimensions(view);
					}
				});
			});

			const rootElement = document.documentElement;
			HandleWidget.fontSizeObserver.observe(rootElement, {
				attributes: true,
				attributeFilter: ['style']
			});

			HandleWidget.fontSizeObserver.observe(document.body, {
				attributes: true,
				attributeFilter: ['class', 'style']
			});
		}
	}

	private updateHandleDimensions(view: EditorView) {
		requestAnimationFrame(() => {
			const handles = document.querySelectorAll('.codemarker-handle');

			const computedStyle = window.getComputedStyle(view.dom);
			const currentFontSize = parseFloat(computedStyle.fontSize);
			const lineHeight = parseFloat(computedStyle.lineHeight) || currentFontSize * 1.2;

			const ballSize = currentFontSize * HandleWidget.BALL_SIZE_RATIO;
			const barWidth = currentFontSize * HandleWidget.BAR_WIDTH_RATIO;
			const barLength = lineHeight * HandleWidget.BAR_LENGTH_RATIO;

			handles.forEach(handle => {
				const svg = handle.querySelector('svg');
				const group = svg?.querySelector('g');
				const circle = svg?.querySelector('circle');
				const line = svg?.querySelector('rect');

				if (svg && group && circle && line) {
					svg.setAttribute("width", `${ballSize}px`);
					svg.setAttribute("height", `${lineHeight * 2}px`);
					(svg as SVGElement).style.left = `-${ballSize/2}px`;
					(svg as SVGElement).style.top = `-${lineHeight}px`;

					const isStart = handle.classList.contains('start-handle');
					const yOffset = isStart ? lineHeight * 0.1 : lineHeight * 0.3;
					group.setAttribute("transform", `translate(${ballSize/2}, ${yOffset})`);

					line.setAttribute("x", `-${barWidth/2}`);
					line.setAttribute("width", `${barWidth}`);
					line.setAttribute("height", `${barLength}`);
					line.setAttribute("rx", `${barWidth/2}`);

					circle.setAttribute("r", `${ballSize/2}`);
					circle.setAttribute("stroke-width", `${barWidth * 0.75}`);
					if (!isStart) {
						circle.setAttribute("cy", `${barLength}`);
					}
				}
			});
		});
	}

	destroy(dom: HTMLElement): void {
		if (HandleWidget.resizeObserver) {
			HandleWidget.resizeObserver.disconnect();
			HandleWidget.resizeObserver = null;
		}
		if (HandleWidget.zoomListener) {
			window.removeEventListener('resize', HandleWidget.zoomListener);
			HandleWidget.zoomListener = null;
		}
		if (HandleWidget.fontSizeObserver) {
			HandleWidget.fontSizeObserver.disconnect();
			HandleWidget.fontSizeObserver = null;
		}
	}

	eq(widget: WidgetType): boolean {
		if (!(widget instanceof HandleWidget)) return false;
		return this.marker.id === widget.marker.id &&
			this.type === widget.type &&
			this.isHovered === widget.isHovered &&
			this.zIndex === widget.zIndex;
	}

	updateDOM(dom: HTMLElement, view: EditorView): boolean {
		const svg = dom.querySelector('.codemarker-handle-svg');
		if (!svg) return false;
		if (this.settings.showHandlesOnHover) {
			svg.classList.toggle('codemarker-handle-visible', this.isHovered);
			svg.classList.toggle('codemarker-handle-hidden', !this.isHovered);
		} else {
			svg.classList.remove('codemarker-handle-hidden', 'codemarker-handle-visible');
		}
		// Reposition (coordinates may have shifted)
		try {
			const coords = view.coordsAtPos(this.docOffset);
			if (coords) {
				const domInfo = view.domAtPos(this.docOffset);
				const node = domInfo.node;
				const lineEl = (node instanceof HTMLElement ? node : node.parentElement)?.closest('.cm-line') as HTMLElement | null;
				if (lineEl) {
					const lineRect = lineEl.getBoundingClientRect();
					dom.style.left = `${coords.left - lineRect.left}px`;
					dom.style.top = `${coords.top - lineRect.top}px`;
				}
			}
		} catch { /* keep current position */ }
		return true;
	}

	toDOM(view: EditorView): HTMLElement {
		this.setupResizeHandling(view);

		const handle = document.createElement('div');
		handle.className = `codemarker-handle ${this.type}-handle`;
		handle.setAttribute('data-marker-id', this.marker.id);
		handle.setAttribute('data-handle-type', this.type);

		handle.style.position = 'absolute';
		handle.style.width = '0px';
		handle.style.height = '0px';
		handle.style.overflow = 'visible';
		handle.style.zIndex = this.zIndex.toString();
		handle.style.pointerEvents = 'none';

		// Position handle at the exact text coordinate, relative to .cm-line
		try {
			const coords = view.coordsAtPos(this.docOffset);
			if (coords) {
				const domInfo = view.domAtPos(this.docOffset);
				const node = domInfo.node;
				const lineEl = (node instanceof HTMLElement ? node : node.parentElement)?.closest('.cm-line') as HTMLElement | null;
				if (lineEl) {
					const lineRect = lineEl.getBoundingClientRect();
					handle.style.left = `${coords.left - lineRect.left}px`;
					handle.style.top = `${coords.top - lineRect.top}px`;
				}
			}
		} catch { /* fallback: handle stays at 0,0 of .cm-line */ }

		let displayColor = this.color;
		if (this.color.startsWith('#')) {
			const r = parseInt(this.color.slice(1, 3), 16);
			const g = parseInt(this.color.slice(3, 5), 16);
			const b = parseInt(this.color.slice(5, 7), 16);
			displayColor = `rgb(${r}, ${g}, ${b})`;
		}

		const computedStyle = window.getComputedStyle(view.dom);
		const currentFontSize = parseFloat(computedStyle.fontSize);
		const lineHeight = parseFloat(computedStyle.lineHeight) || currentFontSize * 1.2;

		const ballSize = currentFontSize * HandleWidget.BALL_SIZE_RATIO;
		const barWidth = currentFontSize * HandleWidget.BAR_WIDTH_RATIO;
		const barLength = lineHeight * HandleWidget.BAR_LENGTH_RATIO;

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", `${ballSize}px`);
		svg.setAttribute("height", `${lineHeight * 2}px`);
		svg.style.position = "absolute";
		svg.style.left = `-${ballSize/2}px`;
		svg.style.top = `-${lineHeight * 0.15}px`;
		svg.style.transformOrigin = "center";
		svg.style.overflow = "visible";
		svg.style.pointerEvents = "auto";
		svg.style.zIndex = this.zIndex.toString();
		svg.classList.add("codemarker-handle-svg");
		svg.setAttribute('data-marker-id', this.marker.id);
		svg.setAttribute('data-handle-type', this.type);

		if (this.settings.showHandlesOnHover) {
			if (this.isHovered) {
				svg.classList.add('codemarker-handle-visible');
			} else {
				svg.classList.add('codemarker-handle-hidden');
			}
		}

		const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

		if (this.type === 'start') {
			svg.style.cursor = "w-resize";
			group.setAttribute("transform", `translate(${ballSize/2}, ${lineHeight * 0.1})`);

			const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			line.setAttribute("x", `-${barWidth/2}`);
			line.setAttribute("y", "0");
			line.setAttribute("width", `${barWidth}`);
			line.setAttribute("height", `${barLength}`);
			line.setAttribute("rx", `${barWidth/2}`);
			line.setAttribute("fill", displayColor);
			line.classList.add("codemarker-line");
			line.setAttribute('data-marker-id', this.marker.id);
			line.setAttribute('data-handle-type', this.type);

			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			circle.setAttribute("cx", "0");
			circle.setAttribute("cy", "0");
			circle.setAttribute("r", `${ballSize/2}`);
			circle.setAttribute("fill", displayColor);
			circle.setAttribute("stroke", "white");
			circle.setAttribute("stroke-width", `${barWidth * 0.75}`);
			circle.classList.add("codemarker-circle");
			circle.setAttribute('data-marker-id', this.marker.id);
			circle.setAttribute('data-handle-type', this.type);

			group.appendChild(line);
			group.appendChild(circle);
		} else {
			svg.style.cursor = "e-resize";
			group.setAttribute("transform", `translate(${ballSize/2}, ${lineHeight * 0.3})`);

			const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			line.setAttribute("x", `-${barWidth/2}`);
			line.setAttribute("y", "0");
			line.setAttribute("width", `${barWidth}`);
			line.setAttribute("height", `${barLength}`);
			line.setAttribute("rx", `${barWidth/2}`);
			line.setAttribute("fill", displayColor);
			line.classList.add("codemarker-line");
			line.setAttribute('data-marker-id', this.marker.id);
			line.setAttribute('data-handle-type', this.type);

			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			circle.setAttribute("cx", "0");
			circle.setAttribute("cy", `${barLength}`);
			circle.setAttribute("r", `${ballSize/2}`);
			circle.setAttribute("fill", displayColor);
			circle.setAttribute("stroke", "white");
			circle.setAttribute("stroke-width", `${barWidth * 0.75}`);
			circle.classList.add("codemarker-circle");
			circle.setAttribute('data-marker-id', this.marker.id);
			circle.setAttribute('data-handle-type', this.type);

			group.appendChild(line);
			group.appendChild(circle);
		}

		svg.appendChild(group);
		handle.appendChild(svg);
		return handle;
	}

	ignoreEvent(event: Event): boolean {
		const target = event.target as Element;
		return !(
			target.tagName === 'svg' ||
			target.tagName === 'rect' ||
			target.tagName === 'circle' ||
			target.classList.contains('codemarker-handle-svg') ||
			target.classList.contains('codemarker-line') ||
			target.classList.contains('codemarker-circle')
		);
	}
}
