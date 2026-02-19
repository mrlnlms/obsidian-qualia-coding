/**
 * Manages the lifecycle of highlight rendering across PDF pages.
 * Listens for page render events and model changes to keep highlights in sync.
 */

import type { PDFViewerChild, PDFPageView } from '../pdfTypings';
import type { PdfCodingModel } from '../coding/pdfCodingModel';
import type { PdfMarker } from '../coding/pdfCodingTypes';
import { renderHighlightsForPage, clearHighlightsForPage, applyHoverToHighlights, type HighlightCallbacks } from './highlightRenderer';
import { renderMarginPanelForPage, clearMarginPanelForPage, applyHoverToMarginPanel } from './marginPanelRenderer';

export interface PageObserverCallbacks {
	onMarkerClick: (markerId: string, codeName: string) => void;
	onMarkerDblClick: (marker: PdfMarker, evt: MouseEvent) => void;
}

export class PdfPageObserver {
	private child: PDFViewerChild;
	private model: PdfCodingModel;
	private callbacks: PageObserverCallbacks;
	private changeListener: (() => void) | null = null;
	private hoverListener: ((markerId: string | null, codeName: string | null) => void) | null = null;
	private textLayerRenderedHandler: ((data: any) => void) | null = null;
	private pageRenderedHandler: ((data: any) => void) | null = null;
	private started = false;

	constructor(
		child: PDFViewerChild,
		model: PdfCodingModel,
		callbacks: PageObserverCallbacks,
	) {
		this.child = child;
		this.model = model;
		this.callbacks = callbacks;
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
			// Small delay to let text layer rebuild after zoom
			setTimeout(() => this.renderPage(pageNumber), 100);
		};
		this.child.pdfViewer.eventBus.on('pagerendered', this.pageRenderedHandler);

		// Listen for hover state changes → apply/remove hover class on highlights + margin panel
		this.hoverListener = (markerId) => {
			applyHoverToHighlights(this.child.containerEl, markerId);
			applyHoverToMarginPanel(this.child.containerEl, markerId);
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
			this.child.pdfViewer.eventBus.off('textlayerrendered', this.textLayerRenderedHandler);
			this.textLayerRenderedHandler = null;
		}

		if (this.pageRenderedHandler) {
			this.child.pdfViewer.eventBus.off('pagerendered', this.pageRenderedHandler);
			this.pageRenderedHandler = null;
		}

		// Clear all highlight layers
		this.clearAll();
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
			onDblClick: this.callbacks.onMarkerDblClick,
			onHover: (markerId, codeName) => this.model.setHoverState(markerId, codeName),
		};

		renderHighlightsForPage(
			pageView,
			markers,
			this.model.registry,
			highlightCallbacks,
		);

		renderMarginPanelForPage(
			pageView,
			markers,
			this.model.registry,
			{
				onLabelClick: this.callbacks.onMarkerClick,
				onHover: (markerId, codeName) => this.model.setHoverState(markerId, codeName),
			},
		);
	}

	private clearAll(): void {
		const pagesCount = this.child.pdfViewer.pagesCount;
		for (let i = 1; i <= pagesCount; i++) {
			const pageView = this.getPageView(i);
			if (pageView) {
				clearHighlightsForPage(pageView.div);
				clearMarginPanelForPage(pageView.div);
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
