/**
 * Manages the lifecycle of highlight rendering across PDF pages.
 * Listens for page render events and model changes to keep highlights in sync.
 *
 * Margin panels are rendered inside page divs (by marginPanelRenderer) and then
 * moved to an external overlay so they remain visible when the scroll container
 * is narrowed to make space for the panel.
 */

import type { PDFViewerChild, PDFPageView } from './pdfTypings';
import type { PdfCodingModel } from './pdfCodingModel';
import type { PdfMarker } from './pdfCodingTypes';
import type { PdfViewState } from './pdfViewState';
import { renderHighlightsForPage, clearHighlightsForPage, updateHighlightRectsForMarker, applyHoverToHighlights, showHandlesForMarker, type HighlightCallbacks } from './highlightRenderer';
import { renderMarginPanelForPage, clearMarginPanelForPage, applyHoverToMarginPanel } from './marginPanelRenderer';
import { renderDrawLayerForPage, clearDrawLayerForPage, applyHoverToDrawLayer, type DrawLayerCallbacks } from './drawLayer';
import { attachDragHandles } from './dragHandles';

export interface PageObserverCallbacks {
	onMarkerClick: (markerId: string, codeName: string) => void;
	onMarkerHoverPopover: (marker: PdfMarker, anchorEl: HTMLElement) => void;
	onClosePopover?: () => void;
	onShapeClick: (shapeId: string, codeName: string) => void;
	onShapeDoubleClick: (shape: import('./pdfCodingTypes').PdfShapeMarker, anchorEl: SVGElement) => void;
	onShapeHoverPopover: (shape: import('./pdfCodingTypes').PdfShapeMarker, anchorEl: SVGElement) => void;
}

export class PdfPageObserver {
	private child: PDFViewerChild;
	private model: PdfCodingModel;
	private callbacks: PageObserverCallbacks;
	private state: PdfViewState;
	private changeListener: (() => void) | null = null;
	private hoverListener: ((markerId: string | null, codeName: string | null) => void) | null = null;
	private textLayerRenderedHandler: ((data: any) => void) | null = null;
	private pageRenderedHandler: ((data: any) => void) | null = null;
	private pageRenderTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
	private started = false;

	// Overlay for margin panels (lives outside the scroll container so labels aren't clipped)
	private labelOverlay: HTMLElement | null = null;
	private labelScroller: HTMLElement | null = null;
	private scrollSyncCleanup: (() => void) | null = null;
	private lastPaddingTotal = 0;

	constructor(
		child: PDFViewerChild,
		model: PdfCodingModel,
		callbacks: PageObserverCallbacks,
		state: PdfViewState,
	) {
		this.child = child;
		this.model = model;
		this.callbacks = callbacks;
		this.state = state;
	}

	start(): void {
		if (this.started) return;
		this.started = true;

		// Listen for model changes
		this.changeListener = () => this.refreshAll();
		this.model.onChange(this.changeListener);

		// Listen for text layer rendered events (pages becoming visible)
		this.textLayerRenderedHandler = (data: any) => {
			const pageNumber: number = data.pageNumber;
			this.renderPage(pageNumber);
		};
		this.child.pdfViewer.eventBus.on('textlayerrendered', this.textLayerRenderedHandler);

		// Listen for page re-render (zoom changes)
		this.pageRenderedHandler = (data: any) => {
			const pageNumber: number = data.pageNumber;
			// Cancel previous timeout for same page (zoom may fire multiple times)
			const prev = this.pageRenderTimeouts.get(pageNumber);
			if (prev) clearTimeout(prev);
			const id = setTimeout(() => {
				this.pageRenderTimeouts.delete(pageNumber);
				this.renderPage(pageNumber);
			}, 100);
			this.pageRenderTimeouts.set(pageNumber, id);
		};
		this.child.pdfViewer.eventBus.on('pagerendered', this.pageRenderedHandler);

		// Listen for hover state changes → apply/remove hover class on highlights + margin panel + draw layer + handles
		this.hoverListener = (markerId) => {
			applyHoverToHighlights(this.child.containerEl, markerId);
			applyHoverToMarginPanel(this.child.containerEl, markerId);
			applyHoverToDrawLayer(this.child.containerEl, markerId);
			// Panels live in the overlay after being moved — apply hover there too
			if (this.labelOverlay) {
				applyHoverToMarginPanel(this.labelOverlay, markerId);
			}
			// Show/hide drag handles (bidirectional: margin panel ↔ handles)
			this.showHandlesForHover(markerId);
		};
		this.model.onHoverChange(this.hoverListener);

		// Render highlights on already-loaded pages
		this.refreshAll();
	}

	stop(): void {
		if (!this.started) return;
		this.started = false;

		if (this.changeListener) {
			this.model.offChange(this.changeListener);
			this.changeListener = null;
		}

		if (this.hoverListener) {
			this.model.offHoverChange(this.hoverListener);
			this.hoverListener = null;
		}

		if (this.textLayerRenderedHandler) {
			this.child.pdfViewer?.eventBus?.off('textlayerrendered', this.textLayerRenderedHandler);
			this.textLayerRenderedHandler = null;
		}

		if (this.pageRenderedHandler) {
			this.child.pdfViewer?.eventBus?.off('pagerendered', this.pageRenderedHandler);
			this.pageRenderedHandler = null;
		}

		// Cancel all pending page render timeouts
		for (const id of this.pageRenderTimeouts.values()) {
			clearTimeout(id);
		}
		this.pageRenderTimeouts.clear();

		// Clear all highlight layers + overlay
		this.clearAll();
		this.destroyLabelOverlay();
		this.resetViewerLayout();
	}

	refreshAll(): void {
		const filePath = this.child.file?.path;
		if (!filePath) return;

		// Only iterate pages that have been loaded (have `data-loaded` attr).
		// This avoids O(N) work on 50+ page PDFs where most pages are off-screen.
		const pdfViewer = this.child.pdfViewer.pdfViewer;
		const pages = pdfViewer?._pages;
		if (pages) {
			for (const pageView of pages) {
				if (pageView.div.dataset.loaded) {
					this.renderPage(pageView.id);
				}
			}
		} else {
			// Fallback: iterate all pages (should be rare)
			const pagesCount = this.child.pdfViewer.pagesCount;
			for (let i = 1; i <= pagesCount; i++) {
				this.renderPage(i);
			}
		}

		this.updateViewerPadding();
	}

	private renderPage(pageNumber: number): void {
		const filePath = this.child.file?.path;
		if (!filePath) return;

		const pageView = this.getPageView(pageNumber);
		if (!pageView) return;

		// Only render if the page DOM is loaded
		if (!pageView.div.dataset.loaded) return;

		const markers = this.model.getMarkersForPage(filePath, pageNumber);

		const highlightCallbacks: HighlightCallbacks = {
			onClick: this.callbacks.onMarkerClick,
			onMarkerHoverPopover: this.callbacks.onMarkerHoverPopover,
			onClosePopover: this.callbacks.onClosePopover,
			onHover: (markerId, codeName) => this.model.setHoverState(markerId, codeName),
		};

		const renderInfos = renderHighlightsForPage(
			pageView,
			markers,
			this.model.registry,
			highlightCallbacks,
			this.state,
		);

		// Attach drag handles to each rendered marker
		for (const info of renderInfos) {
			attachDragHandles(info, pageView, {
				onRangeUpdate: (markerId, changes) => {
					this.model.updateMarkerRange(markerId, changes);
				},
				onRangePreview: (markerId, changes) => {
					// Silent update (no save/notify) + partial re-render (rects only, handles preserved)
					this.model.updateMarkerRangeSilent(markerId, changes);
					const marker = this.model.findMarkerById(markerId);
					if (marker) {
						updateHighlightRectsForMarker(pageView, marker, this.model.registry);
					}
				},
				onHandleHover: (markerId) => {
					this.model.setHoverState(markerId, null);
				},
			});
		}

		// Render drawn shapes (SVG overlay)
		const shapes = this.model.getShapesForPage(filePath, pageNumber);
		const drawCallbacks: DrawLayerCallbacks = {
			onClick: this.callbacks.onShapeClick,
			onDoubleClick: this.callbacks.onShapeDoubleClick,
			onHover: (shapeId, codeName) => this.model.setHoverState(shapeId, codeName),
			onShapeHoverPopover: this.callbacks.onShapeHoverPopover,
		};
		renderDrawLayerForPage(pageView, shapes, this.model.registry, drawCallbacks, this.state);

		// Clear stale overlay panel for this page before re-rendering
		if (this.labelScroller) {
			const stale = this.labelScroller.querySelector(`[data-page-number="${pageNumber}"]`);
			if (stale) stale.remove();
		}

		renderMarginPanelForPage(
			pageView,
			markers,
			this.model.registry,
			{
				onLabelClick: this.callbacks.onMarkerClick,
				onHover: (markerId, codeName) => this.model.setHoverState(markerId, codeName),
			},
			shapes,
		);

		// Tag the panel with page number so we can track it in the overlay
		const panel = pageView.div.querySelector('.codemarker-pdf-margin-panel') as HTMLElement | null;
		if (panel) {
			panel.dataset.pageNumber = String(pageNumber);
		}

		this.updateViewerPadding();
	}

	private clearAll(): void {
		// Clear panels from overlay
		if (this.labelScroller) {
			this.labelScroller.innerHTML = '';
		}

		const pagesCount = this.child.pdfViewer?.pagesCount;
		if (!pagesCount) return;
		for (let i = 1; i <= pagesCount; i++) {
			const pageView = this.getPageView(i);
			if (pageView) {
				clearHighlightsForPage(pageView.div);
				clearDrawLayerForPage(pageView.div);
				clearMarginPanelForPage(pageView.div);
			}
		}
		this.updateViewerPadding();
	}

	// ── Overlay Management ──

	/**
	 * Creates (or updates) a label overlay outside the scroll container.
	 * The overlay holds margin panels so they aren't clipped by the scroll container's overflow.
	 */
	private ensureLabelOverlay(total: number): void {
		const dom = this.child.pdfViewer.dom;
		const scrollContainer = dom?.viewerContainerEl;
		if (!scrollContainer) return;

		const parentEl = scrollContainer.parentElement;
		if (!parentEl) return;

		if (!this.labelOverlay) {
			// Ensure parent can contain absolute children
			if (getComputedStyle(parentEl).position === 'static') {
				parentEl.style.position = 'relative';
			}

			const overlay = document.createElement('div');
			overlay.className = 'codemarker-pdf-label-overlay';

			const scroller = document.createElement('div');
			scroller.className = 'codemarker-pdf-label-scroller';
			overlay.appendChild(scroller);

			parentEl.insertBefore(overlay, scrollContainer);

			// Sync overlay scroll with the PDF scroll container
			const onScroll = () => {
				scroller.style.transform = `translateY(${-scrollContainer.scrollTop}px)`;
			};
			scrollContainer.addEventListener('scroll', onScroll);
			this.scrollSyncCleanup = () => scrollContainer.removeEventListener('scroll', onScroll);

			this.labelOverlay = overlay;
			this.labelScroller = scroller;
		}

		// Position overlay immediately to the left of the scroll container.
		// scrollContainer.offsetLeft includes both the sidebar width (if open)
		// and our margin-left, so subtracting `total` gives us the correct position.
		const overlayLeft = scrollContainer.offsetLeft - total;
		this.labelOverlay.style.left = `${Math.max(0, overlayLeft)}px`;
		this.labelOverlay.style.top = `${scrollContainer.offsetTop}px`;
		this.labelOverlay.style.height = `${scrollContainer.offsetHeight}px`;
		this.labelOverlay.style.width = `${total}px`;
	}

	private destroyLabelOverlay(): void {
		if (this.scrollSyncCleanup) {
			this.scrollSyncCleanup();
			this.scrollSyncCleanup = null;
		}
		if (this.labelOverlay) {
			this.labelOverlay.remove();
			this.labelOverlay = null;
			this.labelScroller = null;
		}
	}

	private resetViewerLayout(): void {
		const dom = this.child.pdfViewer?.dom;
		const scrollContainer = dom?.viewerContainerEl;
		if (scrollContainer) {
			scrollContainer.style.marginLeft = '';
		}
		this.lastPaddingTotal = 0;
	}

	/**
	 * Measure the widest margin panel, create/update the overlay,
	 * move panels from page divs into the overlay, and shrink the
	 * scroll container to make room.
	 */
	private updateViewerPadding(): void {
		const dom = this.child.pdfViewer.dom;
		const scrollContainer = dom?.viewerContainerEl;
		const viewerEl = dom?.viewerEl;
		if (!scrollContainer || !viewerEl) return;

		// Measure panel widths from both page divs (just rendered) and overlay (previously moved)
		const panelsInPages = Array.from(viewerEl.querySelectorAll<HTMLElement>('.codemarker-pdf-margin-panel'));
		const panelsInOverlay = this.labelScroller
			? Array.from(this.labelScroller.querySelectorAll<HTMLElement>('.codemarker-pdf-margin-panel'))
			: [];

		let maxPanelWidth = 0;
		for (const p of [...panelsInPages, ...panelsInOverlay]) {
			const w = parseFloat(p.style.width) || 0;
			if (w > maxPanelWidth) maxPanelWidth = w;
		}

		// Total space: bars width + label area (120px max-width) + gap
		const total = maxPanelWidth > 0 ? maxPanelWidth + 130 : 0;

		if (total > 0) {
			// 1. Apply margin first so offsetLeft is correct when positioning overlay
			const layoutChanged = total !== this.lastPaddingTotal;
			if (layoutChanged) {
				this.lastPaddingTotal = total;
				scrollContainer.style.marginLeft = `${total}px`;
				// Don't set explicit width — let flex/block layout determine it
				// naturally (accounts for sidebar when thumbnails are open)
			}

			// 2. Create/update overlay (reads scrollContainer.offsetLeft)
			this.ensureLabelOverlay(total);

			// 3. Move newly-rendered panels from page divs into the overlay
			for (const panel of panelsInPages) {
				const pageDiv = panel.parentElement;
				if (!pageDiv) continue;
				const pageNum = panel.dataset.pageNumber;
				if (!pageNum) continue;

				// Remove stale overlay panel for this page
				const stale = this.labelScroller!.querySelector(`[data-page-number="${pageNum}"]`);
				if (stale && stale !== panel) stale.remove();

				// Reposition for overlay context:
				// top = page's Y offset within the viewer (scroll-relative)
				// height = page height
				// right: 0 = bars flush against the overlay's right edge (adjacent to pages)
				panel.style.top = `${pageDiv.offsetTop}px`;
				panel.style.height = `${pageDiv.offsetHeight}px`;
				panel.style.right = '0';

				this.labelScroller!.appendChild(panel);
			}

			// 4. Trigger PDF.js resize only when layout changed
			if (layoutChanged) {
				window.dispatchEvent(new Event('resize'));
			}
		} else if (this.lastPaddingTotal !== 0) {
			this.lastPaddingTotal = 0;
			this.destroyLabelOverlay();
			scrollContainer.style.marginLeft = '';
			window.dispatchEvent(new Event('resize'));
		}
	}

	/** Show/hide drag handles across all loaded pages for a given marker ID. */
	private showHandlesForHover(markerId: string | null): void {
		const pdfViewer = this.child.pdfViewer.pdfViewer;
		const pages = pdfViewer?._pages;
		if (!pages) return;
		for (const pageView of pages) {
			if (pageView.div.dataset.loaded) {
				showHandlesForMarker(pageView.div, markerId);
			}
		}
	}

	private getPageView(pageNumber: number): PDFPageView | null {
		try {
			// PDFViewerChild.getPage uses 1-based page numbers
			return this.child.getPage(pageNumber) ?? null;
		} catch {
			return null;
		}
	}
}
