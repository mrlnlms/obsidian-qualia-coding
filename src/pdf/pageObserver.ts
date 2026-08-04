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
import { diagnosePendingTextSearch, isMarkerPending, resolvePendingIndicesWithDiagnostics, type PendingResolutionDiagnostics } from './resolvePendingIndices';
import { visibilityEventBus } from '../core/visibilityEventBus';

export interface PageObserverCallbacks {
	onMarkerClick: (markerId: string, codeName: string) => void;
	onMarkerHoverPopover: (marker: PdfMarker, anchorEl: HTMLElement) => void;
	onClosePopover?: () => void;
	onShapeClick: (shapeId: string, codeName: string) => void;
	onShapeDoubleClick: (shape: import('./pdfCodingTypes').PdfShapeMarker, anchorEl: SVGElement) => void;
	onShapeHoverPopover: (shape: import('./pdfCodingTypes').PdfShapeMarker, anchorEl: SVGElement) => void;
}

interface PendingResolveFailureSample {
	filePath?: string;
	page?: number;
	markerId: string;
	reason: PendingResolutionDiagnostics['reason'];
	searchTextLength: number;
	searchTextPreview: string;
	pageTextLength: number;
	textLayerNodeCount: number;
	bestPrefixKeyLength?: number;
	bestWindowKeyLength?: number;
	bestWindowTextPreview?: string;
	prevPageBestPrefixKeyLength?: number;
	prevPageBestWindowKeyLength?: number;
	nextPageBestPrefixKeyLength?: number;
	nextPageBestWindowKeyLength?: number;
}

interface PendingResolveDiagnosticRow {
	filePath: string;
	page: number;
	attempted: number;
	resolved: number;
	resolvedOnNeighbor: number;
	pending: number;
	pageTextLength: number;
	textLayerNodeCount: number;
	failureReasons: string;
}

const MAX_PENDING_TEXT_LAYER_RETRIES = 5;
const NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH = 96;

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
	private reportedPendingResolveDiagnostics = new Set<string>();
	private pendingResolveDiagnosticRows = new Map<string, PendingResolveDiagnosticRow>();
	private pendingResolveDiagnosticSamples: PendingResolveFailureSample[] = [];
	private pendingResolveDiagnosticFlushTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingTextLayerRetryCounts = new Map<string, number>();
	private started = false;
	private unsubscribeVisibility: (() => void) | null = null;

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

		// Subscribe to visibility changes
		this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));

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

		if (this.unsubscribeVisibility) {
			this.unsubscribeVisibility();
			this.unsubscribeVisibility = null;
		}

		// Cancel all pending page render timeouts
		for (const id of this.pageRenderTimeouts.values()) {
			clearTimeout(id);
		}
		this.pageRenderTimeouts.clear();
		if (this.pendingResolveDiagnosticFlushTimer) {
			clearTimeout(this.pendingResolveDiagnosticFlushTimer);
			this.pendingResolveDiagnosticFlushTimer = null;
		}
		this.pendingTextLayerRetryCounts.clear();

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
		const hasPendingTextMarkers = markers.some((m) => isMarkerPending(m) && m.text);
		if (hasPendingTextMarkers && !this.hasTextLayerNodes(pageView.div)) {
			this.schedulePendingTextLayerRetry(filePath, pageNumber);
			return;
		}
		this.pendingTextLayerRetryCounts.delete(`${filePath}::${pageNumber}`);

		// Resolve placeholder indices on imported markers (indices = 0,0,0,0)
		// via DOM text-search. Once resolved, the normal render path paints them.
		let resolvedAny = false;
		let pendingAttempts = 0;
		let resolvedCount = 0;
		let resolvedOnNeighborCount = 0;
		let stillPendingCount = 0;
		let pageTextLength = 0;
		let textLayerNodeCount = 0;
		const failureReasons = new Map<PendingResolutionDiagnostics['reason'], number>();
		const failureSamples: PendingResolveFailureSample[] = [];
		const movedMarkerPages = new Set<number>();
		for (const m of markers) {
			if (isMarkerPending(m) && m.text) {
				pendingAttempts++;
				let targetPageNumber = pageNumber;
				let { resolved, diagnostics } = resolvePendingIndicesWithDiagnostics(pageView.div, m.text);
				if (!resolved) {
					const neighbor = this.resolveOnNeighborPage(pageNumber, m.text);
					if (neighbor) {
						targetPageNumber = neighbor.pageNumber;
						resolved = neighbor.resolved;
					}
				}
				pageTextLength = diagnostics.pageTextLength;
				textLayerNodeCount = diagnostics.textLayerNodeCount;
				if (resolved) {
					this.model.updateMarkerRangeSilent(m.id, {
						page: targetPageNumber,
						beginIndex: resolved.beginIndex,
						beginOffset: resolved.beginOffset,
						endIndex: resolved.endIndex,
						endOffset: resolved.endOffset,
					});
					if (targetPageNumber !== pageNumber) {
						movedMarkerPages.add(targetPageNumber);
						resolvedOnNeighborCount++;
					}
					resolvedAny = true;
					resolvedCount++;
				} else {
					stillPendingCount++;
					failureReasons.set(diagnostics.reason, (failureReasons.get(diagnostics.reason) ?? 0) + 1);
					if (failureSamples.length < 5) {
						failureSamples.push({
							markerId: m.id,
							reason: diagnostics.reason,
							searchTextLength: diagnostics.searchTextLength,
							searchTextPreview: diagnostics.searchTextPreview,
							pageTextLength: diagnostics.pageTextLength,
							textLayerNodeCount: diagnostics.textLayerNodeCount,
							bestPrefixKeyLength: diagnostics.bestPrefixKeyLength,
							bestWindowKeyLength: diagnostics.bestWindowKeyLength,
							bestWindowTextPreview: diagnostics.bestWindowTextPreview,
							...this.diagnoseNeighborPages(pageNumber, m.text),
						});
					}
				}
			}
		}
		this.reportPendingResolveDiagnostics({
			filePath,
			pageNumber,
			pendingAttempts,
			resolvedCount,
			resolvedOnNeighborCount,
			stillPendingCount,
			pageTextLength,
			textLayerNodeCount,
			failureReasons,
			failureSamples,
		});
		if (resolvedAny) this.model.save();
		for (const movedPage of movedMarkerPages) {
			setTimeout(() => this.renderPage(movedPage), 0);
		}
		const adoptedAny = this.resolveAdjacentPendingMarkersOnPage(filePath, pageNumber, pageView);
		if (adoptedAny) this.model.save();
		const renderMarkers = markers.filter((m) => m.page === pageNumber);

		const highlightCallbacks: HighlightCallbacks = {
			onClick: this.callbacks.onMarkerClick,
			onMarkerHoverPopover: this.callbacks.onMarkerHoverPopover,
			onClosePopover: this.callbacks.onClosePopover,
			onHover: (markerId, codeName) => this.model.setHoverState(markerId, codeName),
		};

		const renderInfos = renderHighlightsForPage(
			pageView,
			renderMarkers,
			this.model.registry,
			highlightCallbacks,
			this.state,
			filePath,
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
						updateHighlightRectsForMarker(pageView, marker, this.model.registry, filePath);
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
			renderMarkers,
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

	private hasTextLayerNodes(pageEl: HTMLElement): boolean {
		return pageEl.querySelector('.textLayerNode') !== null;
	}

	private schedulePendingTextLayerRetry(filePath: string, pageNumber: number): void {
		const key = `${filePath}::${pageNumber}`;
		const count = this.pendingTextLayerRetryCounts.get(key) ?? 0;
		if (count >= MAX_PENDING_TEXT_LAYER_RETRIES) return;

		this.pendingTextLayerRetryCounts.set(key, count + 1);
		const delay = 150 * (count + 1);
		const prev = this.pageRenderTimeouts.get(pageNumber);
		if (prev) clearTimeout(prev);
		const id = setTimeout(() => {
			this.pageRenderTimeouts.delete(pageNumber);
			this.renderPage(pageNumber);
		}, delay);
		this.pageRenderTimeouts.set(pageNumber, id);
	}

	private resolveOnNeighborPage(pageNumber: number, text: string): { pageNumber: number; resolved: NonNullable<ReturnType<typeof resolvePendingIndicesWithDiagnostics>['resolved']> } | null {
		for (const candidatePage of [pageNumber - 1, pageNumber + 1]) {
			const pageView = this.getPageView(candidatePage);
			if (!pageView?.div?.dataset.loaded || !this.hasTextLayerNodes(pageView.div)) continue;

			const d = diagnosePendingTextSearch(pageView.div, text);
			const strongEnough = (d.bestPrefixKeyLength ?? 0) >= NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH
				|| (d.bestWindowKeyLength ?? 0) >= NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH;
			if (!strongEnough) continue;

			const { resolved } = resolvePendingIndicesWithDiagnostics(pageView.div, text);
			if (resolved) return { pageNumber: candidatePage, resolved };
		}
		return null;
	}

	private resolveAdjacentPendingMarkersOnPage(filePath: string, pageNumber: number, pageView: PDFPageView): boolean {
		let resolvedAny = false;
		for (const sourcePage of [pageNumber - 1, pageNumber + 1]) {
			const candidates = this.model.getMarkersForPage(filePath, sourcePage);
			for (const marker of candidates) {
				if (!isMarkerPending(marker) || !marker.text) continue;

				const d = diagnosePendingTextSearch(pageView.div, marker.text);
				const strongEnough = (d.bestPrefixKeyLength ?? 0) >= NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH
					|| (d.bestWindowKeyLength ?? 0) >= NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH;
				if (!strongEnough) continue;

				const { resolved } = resolvePendingIndicesWithDiagnostics(pageView.div, marker.text);
				if (!resolved) continue;
				this.model.updateMarkerRangeSilent(marker.id, {
					page: pageNumber,
					beginIndex: resolved.beginIndex,
					beginOffset: resolved.beginOffset,
					endIndex: resolved.endIndex,
					endOffset: resolved.endOffset,
				});
				resolvedAny = true;
			}
		}
		return resolvedAny;
	}

	private diagnoseNeighborPages(pageNumber: number, text: string): Partial<PendingResolveFailureSample> {
		const out: Partial<PendingResolveFailureSample> = {};
		const prev = this.getPageView(pageNumber - 1);
		if (prev?.div?.dataset.loaded && this.hasTextLayerNodes(prev.div)) {
			const d = diagnosePendingTextSearch(prev.div, text);
			out.prevPageBestPrefixKeyLength = d.bestPrefixKeyLength;
			out.prevPageBestWindowKeyLength = d.bestWindowKeyLength;
		}

		const next = this.getPageView(pageNumber + 1);
		if (next?.div?.dataset.loaded && this.hasTextLayerNodes(next.div)) {
			const d = diagnosePendingTextSearch(next.div, text);
			out.nextPageBestPrefixKeyLength = d.bestPrefixKeyLength;
			out.nextPageBestWindowKeyLength = d.bestWindowKeyLength;
		}
		return out;
	}

	private reportPendingResolveDiagnostics(args: {
		filePath: string;
		pageNumber: number;
		pendingAttempts: number;
		resolvedCount: number;
		resolvedOnNeighborCount: number;
		stillPendingCount: number;
		pageTextLength: number;
		textLayerNodeCount: number;
		failureReasons: Map<PendingResolutionDiagnostics['reason'], number>;
		failureSamples: PendingResolveFailureSample[];
	}): void {
		if (args.pendingAttempts === 0) return;

		const key = `${args.filePath}::${args.pageNumber}`;
		if (this.reportedPendingResolveDiagnostics.has(key)) return;
		this.reportedPendingResolveDiagnostics.add(key);

		const failureReasons = Array.from(args.failureReasons.entries())
			.map(([reason, count]) => `${reason}:${count}`)
			.join(', ');
		this.pendingResolveDiagnosticRows.set(key, {
			filePath: args.filePath,
			page: args.pageNumber,
			attempted: args.pendingAttempts,
			resolved: args.resolvedCount,
			resolvedOnNeighbor: args.resolvedOnNeighborCount,
			pending: args.stillPendingCount,
			pageTextLength: args.pageTextLength,
			textLayerNodeCount: args.textLayerNodeCount,
			failureReasons,
		});

		for (const sample of args.failureSamples) {
			if (this.pendingResolveDiagnosticSamples.length >= 20) break;
			this.pendingResolveDiagnosticSamples.push({
				filePath: args.filePath,
				page: args.pageNumber,
				...sample,
			});
		}

		if (this.pendingResolveDiagnosticFlushTimer) {
			clearTimeout(this.pendingResolveDiagnosticFlushTimer);
		}
		this.pendingResolveDiagnosticFlushTimer = setTimeout(() => {
			this.pendingResolveDiagnosticFlushTimer = null;
			this.flushPendingResolveDiagnostics();
		}, 750);
	}

	private flushPendingResolveDiagnostics(): void {
		if (this.pendingResolveDiagnosticRows.size === 0) return;

		const rows = Array.from(this.pendingResolveDiagnosticRows.values())
			.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.page - b.page);
		const samples = this.pendingResolveDiagnosticSamples.slice();

		console.groupCollapsed(`[qualia-coding] PDF pending marker re-anchor diagnostics (${rows.length} rendered pages)`);
		console.table(rows);
		if (samples.length > 0) {
			console.table(samples);
		}
		console.groupEnd();
		this.pendingResolveDiagnosticRows.clear();
		this.pendingResolveDiagnosticSamples = [];
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

	/** Re-render only the pages that contain markers for any of the affected codes. */
	refreshVisibility(affectedCodeIds: Set<string>): void {
		const filePath = this.child.file?.path;
		if (!filePath) return;
		const pages = this.findPagesWithCodes(filePath, affectedCodeIds);
		for (const pageNumber of pages) {
			this.renderPage(pageNumber);
		}
	}

	private findPagesWithCodes(filePath: string, codeIds: Set<string>): Set<number> {
		const pages = new Set<number>();
		const markers = this.model.getMarkersForFile(filePath);
		for (const m of markers) {
			if (m.codes.some(app => codeIds.has(app.codeId))) {
				pages.add(m.page);
			}
		}
		return pages;
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
