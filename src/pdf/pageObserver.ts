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
import type { PdfMarker, PdfShapeMarker } from './pdfCodingTypes';
import type { PdfViewState } from './pdfViewState';
import { renderHighlightsForPage, clearHighlightsForPage, updateHighlightRectsForMarker, applyHoverToHighlights, showHandlesForMarker, type HighlightCallbacks } from './highlightRenderer';
import {
	renderMarginPanelForPage,
	clearMarginPanelForPage,
	applyHoverToMarginPanel,
	type MarginPanelOwnerLabel,
} from './marginPanelRenderer';
import { renderDrawLayerForPage, clearDrawLayerForPage, applyHoverToDrawLayer, type DrawLayerCallbacks } from './drawLayer';
import { attachDragHandles } from './dragHandles';
import { diagnosePendingTextSearch, isMarkerPending, resolvePendingIndicesInTextContentItems, resolvePendingIndicesWithDiagnostics, type PendingResolutionDiagnostics } from './resolvePendingIndices';
import { getTextLayerInfo } from './pdfViewerAccess';
import { visibilityEventBus } from '../core/visibilityEventBus';

export interface PageObserverCallbacks {
	onMarkerClick: (markerId: string, codeName: string) => void;
	onMarkerHoverPopover: (marker: PdfMarker, anchorEl: HTMLElement) => void;
	onClosePopover?: () => void;
	onShapeClick: (shapeId: string, codeName: string) => void;
	onShapeDoubleClick: (shape: import('./pdfCodingTypes').PdfShapeMarker, anchorEl: SVGElement) => void;
	onShapeHoverPopover: (shape: import('./pdfCodingTypes').PdfShapeMarker, anchorEl: SVGElement) => void;
	onPdfMarkerCurrentStatus?: (snapshot: PdfMarkerCurrentStatusSnapshot) => void | Promise<void>;
	onPdfMarkerCoverageAudit?: (snapshot: PdfMarkerCoverageAuditSnapshot) => void | Promise<void>;
}

interface PendingResolveFailureSample {
	filePath?: string;
	page?: number;
	markerId: string;
	hasContinuedBy?: boolean;
	continuedByRole?: string;
	continuedByLinkCount?: number;
	continuedByRelatedSelectionGuids?: string;
	shortTextLt64?: boolean;
	reason: PendingResolutionDiagnostics['reason'];
	searchTextLength: number;
	searchTextPreview: string;
	pageTextLength: number;
	textLayerNodeCount: number;
	bboxTextLayerNodeCount?: number;
	hasBBox?: boolean;
	bboxAttempted?: boolean;
	bboxIgnoredPageMismatch?: boolean;
	bboxTextPreview?: string;
	bboxBestPrefixKeyLength?: number;
	bboxBestWindowKeyLength?: number;
	bboxBestWindowTextPreview?: string;
	plainTextContextAttempted?: boolean;
	plainTextContextBestWindowKeyLength?: number;
	plainTextContextWindowTextPreview?: string;
	resolvedBy?: PendingResolutionDiagnostics['resolvedBy'];
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
	withBBox: number;
	withContinuedBy: number;
	continuedByPending: number;
	continuedByShortTextPendingLt64: number;
	bboxAttempted: number;
	bboxIgnoredPageMismatch: number;
	resolvedByPageText: number;
	resolvedByBBoxText: number;
	resolvedByPlainTextContext: number;
	resolvedByTextContentItems: number;
	pending: number;
	pageTextLength: number;
	textLayerNodeCount: number;
	bboxTextLayerNodeCount: number;
	failureReasons: string;
}

interface PdfMarkerCurrentStatusRow {
	filePath: string;
	textMarkers: number;
	resolvedTextMarkers: number;
	pendingTextMarkers: number;
	pendingPages: string;
	textMarkersWithBBox: number;
	pendingTextMarkersWithBBox: number;
	continuedByMarkers: number;
	continuedByPendingMarkers: number;
	continuedByPendingShortTextLt64: number;
	pendingShortTextLt64: number;
	shapeMarkers: number;
}

interface PdfMarkerCurrentStatusSample {
	filePath: string;
	page: number;
	markerId: string;
	textLength: number;
	shortTextLt64?: boolean;
	hasBBox?: boolean;
	hasContinuedBy?: boolean;
	continuedByRole?: string;
	continuedByLinkCount?: number;
	reason?: PendingResolutionDiagnostics['reason'];
	bboxAttempted?: boolean;
	bboxTextPreview?: string;
	bboxBestPrefixKeyLength?: number;
	bboxBestWindowKeyLength?: number;
	plainTextContextAttempted?: boolean;
	plainTextContextBestWindowKeyLength?: number;
	plainTextContextWindowTextPreview?: string;
	bestPrefixKeyLength?: number;
	bestWindowKeyLength?: number;
	prevPageBestPrefixKeyLength?: number;
	prevPageBestWindowKeyLength?: number;
	nextPageBestPrefixKeyLength?: number;
	nextPageBestWindowKeyLength?: number;
	textPreview: string;
}

interface PdfMarkerCurrentStatusTotals {
	pdfFiles: number;
	textMarkers: number;
	resolvedTextMarkers: number;
	pendingTextMarkers: number;
	pendingShortTextLt64: number;
	continuedByPendingMarkers: number;
	shapeMarkers: number;
}

interface PdfMarkerCurrentStatusSnapshot {
	generatedAt: string;
	totals: PdfMarkerCurrentStatusTotals;
	rows: PdfMarkerCurrentStatusRow[];
	samples: PdfMarkerCurrentStatusSample[];
}

export interface PdfMarkerCoverageAuditRow {
	filePath: string;
	page: number;
	markerId: string;
	range: string;
	qdpxPage?: number;
	textLength: number;
	coveredTextLength: number;
	expectedKeyLength: number;
	coveredKeyLength: number;
	coverageRatio: number;
	matches: boolean;
	coverageClass: 'match' | 'covered-prefix' | 'covered-inside-expected' | 'covered-includes-expected-start' | 'wrong-range-or-page' | 'empty-covered-text';
	continuedBy?: boolean;
	codeCount: number;
	expectedPreview: string;
	coveredPreview: string;
	/** Ordered PDF.js text items, captured only for mismatches for offline replay. */
	pageTextItems?: string[];
}

export interface PdfMarkerCoverageAuditSnapshot {
	generatedAt: string;
	totals: {
		markers: number;
		auditedMarkers: number;
		matchingMarkers: number;
		mismatchingMarkers: number;
		unauditedMarkers: number;
	};
	rows: PdfMarkerCoverageAuditRow[];
	mismatches: PdfMarkerCoverageAuditRow[];
}

const MAX_PENDING_TEXT_LAYER_RETRIES = 5;
const NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH = 48;

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
	private pendingResolveDiagnosticSamplesByMarker = new Map<string, PendingResolveFailureSample>();
	private pendingResolveDiagnosticFlushTimer: ReturnType<typeof setTimeout> | null = null;
	private coverageAuditRowsByMarker = new Map<string, PdfMarkerCoverageAuditRow>();
	private coverageAuditFlushTimer: ReturnType<typeof setTimeout> | null = null;
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
		if (this.coverageAuditFlushTimer) {
			clearTimeout(this.coverageAuditFlushTimer);
			this.coverageAuditFlushTimer = null;
			this.flushMarkerCoverageAudit();
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
		let withBBoxCount = 0;
		let withContinuedByCount = 0;
		let continuedByPendingCount = 0;
		let continuedByShortTextPendingLt64Count = 0;
		let bboxAttemptedCount = 0;
		let bboxIgnoredPageMismatchCount = 0;
		let resolvedByPageTextCount = 0;
		let resolvedByBBoxTextCount = 0;
		let resolvedByPlainTextContextCount = 0;
		let resolvedByTextContentItemsCount = 0;
		let stillPendingCount = 0;
		let pageTextLength = 0;
		let textLayerNodeCount = 0;
		let bboxTextLayerNodeCount = 0;
		const failureReasons = new Map<PendingResolutionDiagnostics['reason'], number>();
		const failureSamples: PendingResolveFailureSample[] = [];
		const movedMarkerPages = new Set<number>();
		const textLayerInfo = getTextLayerInfo(pageView);
		for (const m of markers) {
			if (isMarkerPending(m) && m.text) {
				pendingAttempts++;
				if (m.importedPdfSelectionBBox) withBBoxCount++;
				if (m.importedQdpxContinuedBy) withContinuedByCount++;
				let targetPageNumber = pageNumber;
				const textItemsResult = !m.importedQdpxMultipageFragment && textLayerInfo
					? resolvePendingIndicesInTextContentItems(textLayerInfo.textContentItems, m.text)
					: null;
				let resolved = textItemsResult?.resolved ?? null;
				let diagnostics = textItemsResult?.diagnostics;
				if (!resolved) {
					const domResult = resolvePendingIndicesWithDiagnostics(pageView.div, m.text, {
						bboxHint: m.importedPdfSelectionBBox,
						plainTextContext: m.importedPdfTextContext,
						pageNumber,
					});
					resolved = domResult.resolved;
					diagnostics = {
						...domResult.diagnostics,
						textContentItemsAttempted: textItemsResult?.diagnostics.textContentItemsAttempted,
					};
				}
				if (!diagnostics) continue;
				let markerBBoxAttempted = !!diagnostics.bboxAttempted;
				let markerBBoxIgnoredPageMismatch = !!diagnostics.bboxIgnoredPageMismatch;
				let markerBBoxTextLayerNodeCount = diagnostics.bboxTextLayerNodeCount ?? 0;
				// QDPX PDFSelection.page is authoritative after import conversion.
				// Neighbor fallback can otherwise adopt a repeated short label from
				// the wrong page before its own page has rendered.
				if (!resolved && !m.importedPdfSelectionBBox && !m.importedQdpxMultipageFragment) {
					const neighbor = this.resolveOnNeighborPage(pageNumber, m);
					if (neighbor) {
						targetPageNumber = neighbor.pageNumber;
						resolved = neighbor.resolved;
						diagnostics = neighbor.diagnostics;
						markerBBoxAttempted = markerBBoxAttempted || !!neighbor.diagnostics.bboxAttempted;
						markerBBoxIgnoredPageMismatch = markerBBoxIgnoredPageMismatch || !!neighbor.diagnostics.bboxIgnoredPageMismatch;
						markerBBoxTextLayerNodeCount += neighbor.diagnostics.bboxTextLayerNodeCount ?? 0;
					}
				}
				pageTextLength = diagnostics.pageTextLength;
				textLayerNodeCount = diagnostics.textLayerNodeCount;
				bboxTextLayerNodeCount += markerBBoxTextLayerNodeCount;
				if (markerBBoxAttempted) bboxAttemptedCount++;
				if (markerBBoxIgnoredPageMismatch) bboxIgnoredPageMismatchCount++;
				if (resolved) {
					this.model.resolveImportedMarkerRange(m.id, {
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
					if (diagnostics.resolvedBy === 'bbox-text') resolvedByBBoxTextCount++;
					else if (diagnostics.resolvedBy === 'plain-text-context') resolvedByPlainTextContextCount++;
					else if (diagnostics.resolvedBy === 'text-content-items') resolvedByTextContentItemsCount++;
					else resolvedByPageTextCount++;
				} else {
					stillPendingCount++;
					if (m.importedQdpxContinuedBy) {
						continuedByPendingCount++;
						if ((m.text?.length ?? 0) < 64) continuedByShortTextPendingLt64Count++;
					}
					failureReasons.set(diagnostics.reason, (failureReasons.get(diagnostics.reason) ?? 0) + 1);
					failureSamples.push({
						markerId: m.id,
						hasContinuedBy: !!m.importedQdpxContinuedBy || undefined,
						continuedByRole: m.importedQdpxContinuedBy?.role,
						continuedByLinkCount: m.importedQdpxContinuedBy?.linkIds.length,
						continuedByRelatedSelectionGuids: m.importedQdpxContinuedBy?.relatedSelectionGuids.join(', '),
						shortTextLt64: (m.text?.length ?? 0) < 64 || undefined,
						reason: diagnostics.reason,
						searchTextLength: diagnostics.searchTextLength,
						searchTextPreview: diagnostics.searchTextPreview,
						pageTextLength: diagnostics.pageTextLength,
						textLayerNodeCount: diagnostics.textLayerNodeCount,
						bboxTextLayerNodeCount: markerBBoxTextLayerNodeCount || undefined,
						hasBBox: !!m.importedPdfSelectionBBox,
						bboxAttempted: markerBBoxAttempted || undefined,
						bboxIgnoredPageMismatch: markerBBoxIgnoredPageMismatch || undefined,
						bboxTextPreview: diagnostics.bboxTextPreview,
						bboxBestPrefixKeyLength: diagnostics.bboxBestPrefixKeyLength,
						bboxBestWindowKeyLength: diagnostics.bboxBestWindowKeyLength,
						bboxBestWindowTextPreview: diagnostics.bboxBestWindowTextPreview,
						plainTextContextAttempted: diagnostics.plainTextContextAttempted || undefined,
						plainTextContextBestWindowKeyLength: diagnostics.plainTextContextBestWindowKeyLength,
						plainTextContextWindowTextPreview: diagnostics.plainTextContextWindowTextPreview,
						resolvedBy: diagnostics.resolvedBy,
						bestPrefixKeyLength: diagnostics.bestPrefixKeyLength,
						bestWindowKeyLength: diagnostics.bestWindowKeyLength,
						bestWindowTextPreview: diagnostics.bestWindowTextPreview,
						...this.diagnoseNeighborPages(pageNumber, m),
					});
				}
			}
		}
		this.reportPendingResolveDiagnostics({
			filePath,
			pageNumber,
			pendingAttempts,
			resolvedCount,
			resolvedOnNeighborCount,
			withBBoxCount,
			withContinuedByCount,
			continuedByPendingCount,
			continuedByShortTextPendingLt64Count,
			bboxAttemptedCount,
			bboxIgnoredPageMismatchCount,
			resolvedByPageTextCount,
			resolvedByBBoxTextCount,
			resolvedByPlainTextContextCount,
			resolvedByTextContentItemsCount,
			stillPendingCount,
			pageTextLength,
			textLayerNodeCount,
			bboxTextLayerNodeCount,
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
			(marker) => this.model.isMarkerEditable(marker),
		);
		this.auditMarkerCoverageForPage(filePath, pageNumber, pageView, renderMarkers);

		// Attach drag handles to each rendered marker
		for (const info of renderInfos) {
			if (!this.model.isMarkerEditable(info.marker)) continue;
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
		renderDrawLayerForPage(
			pageView,
			shapes,
			this.model.registry,
			drawCallbacks,
			this.state,
			(shape) => this.model.isMarkerEditable(shape),
		);

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
			(marker) => this.ownerLabelForMarker(marker),
			(marker) => this.model.isMarkerEditable(marker),
		);

		// Tag the panel with page number so we can track it in the overlay
		const panel = pageView.div.querySelector('.codemarker-pdf-margin-panel') as HTMLElement | null;
		if (panel) {
			panel.dataset.pageNumber = String(pageNumber);
		}

		this.updateViewerPadding();
	}

	private ownerLabelForMarker(marker: PdfMarker | PdfShapeMarker): MarginPanelOwnerLabel {
		const fullName = marker.codedBy
			? this.model.plugin.coderRegistry.getById(marker.codedBy)?.name ?? marker.codedBy
			: 'importedQdpxSelection' in marker && marker.importedQdpxSelection?.unattributedOwner
				? 'Usuário QDPX não identificado'
				: 'Default';
		return {
			abbreviation: coderInitialism(fullName),
			fullName,
		};
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

	private resolveOnNeighborPage(pageNumber: number, marker: PdfMarker): { pageNumber: number; resolved: NonNullable<ReturnType<typeof resolvePendingIndicesWithDiagnostics>['resolved']>; diagnostics: PendingResolutionDiagnostics } | null {
		for (const candidatePage of [pageNumber - 1, pageNumber + 1]) {
			const pageView = this.getPageView(candidatePage);
			if (!pageView?.div?.dataset.loaded || !this.hasTextLayerNodes(pageView.div)) continue;

			const d = diagnosePendingTextSearch(pageView.div, marker.text);
			const strongEnough = (d.bestPrefixKeyLength ?? 0) >= NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH
				|| (d.bestWindowKeyLength ?? 0) >= NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH;
			if (!strongEnough && !marker.importedPdfTextContext) continue;

			const { resolved, diagnostics } = resolvePendingIndicesWithDiagnostics(pageView.div, marker.text, {
				bboxHint: marker.importedPdfSelectionBBox,
				plainTextContext: marker.importedPdfTextContext,
				pageNumber: candidatePage,
				allowWindowFallback: true,
				minWindowKeyLength: NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH,
			});
			if (resolved) return { pageNumber: candidatePage, resolved, diagnostics };
		}
		return null;
	}

	private resolveAdjacentPendingMarkersOnPage(filePath: string, pageNumber: number, pageView: PDFPageView): boolean {
		let resolvedAny = false;
		for (const sourcePage of [pageNumber - 1, pageNumber + 1]) {
			const candidates = this.model.getMarkersForPage(filePath, sourcePage);
			for (const marker of candidates) {
				if (!isMarkerPending(marker) || !marker.text) continue;
				if (marker.importedPdfSelectionBBox || marker.importedQdpxMultipageFragment) continue;

				const d = diagnosePendingTextSearch(pageView.div, marker.text);
				const strongEnough = (d.bestPrefixKeyLength ?? 0) >= NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH
					|| (d.bestWindowKeyLength ?? 0) >= NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH;
				if (!strongEnough && !marker.importedPdfTextContext) continue;

				const { resolved } = resolvePendingIndicesWithDiagnostics(pageView.div, marker.text, {
					bboxHint: marker.importedPdfSelectionBBox,
					plainTextContext: marker.importedPdfTextContext,
					pageNumber,
					allowWindowFallback: true,
					minWindowKeyLength: NEIGHBOR_PAGE_REANCHOR_MIN_KEY_LENGTH,
				});
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

	private diagnoseNeighborPages(pageNumber: number, marker: PdfMarker): Partial<PendingResolveFailureSample> {
		const out: Partial<PendingResolveFailureSample> = {};
		const prev = this.getPageView(pageNumber - 1);
		if (prev?.div?.dataset.loaded && this.hasTextLayerNodes(prev.div)) {
			const d = diagnosePendingTextSearch(prev.div, marker.text);
			out.prevPageBestPrefixKeyLength = d.bestPrefixKeyLength;
			out.prevPageBestWindowKeyLength = d.bestWindowKeyLength;
		}

		const next = this.getPageView(pageNumber + 1);
		if (next?.div?.dataset.loaded && this.hasTextLayerNodes(next.div)) {
			const d = diagnosePendingTextSearch(next.div, marker.text);
			out.nextPageBestPrefixKeyLength = d.bestPrefixKeyLength;
			out.nextPageBestWindowKeyLength = d.bestWindowKeyLength;
		}
		return out;
	}

	private auditMarkerCoverageForPage(filePath: string, pageNumber: number, pageView: PDFPageView, markers: PdfMarker[]): void {
		const textLayerInfo = getTextLayerInfo(pageView);
		if (!textLayerInfo) return;

		for (const marker of markers) {
			const coveredText = this.extractCoveredTextFromTextLayer(textLayerInfo.textContentItems, marker);
			const expectedKey = this.normalizeAuditKey(marker.text);
			const coveredKey = this.normalizeAuditKey(coveredText);
			const matches = expectedKey === coveredKey;
			const coverageClass = this.classifyCoverage(expectedKey, coveredKey);
			const row: PdfMarkerCoverageAuditRow = {
				filePath,
				page: pageNumber,
				markerId: marker.id,
				range: `${marker.beginIndex}:${marker.beginOffset}-${marker.endIndex}:${marker.endOffset}`,
				qdpxPage: marker.importedPdfSelectionBBox?.page,
				textLength: marker.text.length,
				coveredTextLength: coveredText.length,
				expectedKeyLength: expectedKey.length,
				coveredKeyLength: coveredKey.length,
				coverageRatio: expectedKey.length > 0 ? Number((coveredKey.length / expectedKey.length).toFixed(3)) : 0,
				matches,
				coverageClass,
				continuedBy: !!marker.importedQdpxContinuedBy || undefined,
				codeCount: marker.codes.length,
				expectedPreview: this.previewText(marker.text, 240),
				coveredPreview: this.previewText(coveredText, 240),
				pageTextItems: matches
					? undefined
					: textLayerInfo.textContentItems.map((item) => item.str ?? ''),
			};
			this.coverageAuditRowsByMarker.set(marker.id, row);
		}

		if (this.coverageAuditFlushTimer) clearTimeout(this.coverageAuditFlushTimer);
		this.coverageAuditFlushTimer = setTimeout(() => {
			this.coverageAuditFlushTimer = null;
			this.flushMarkerCoverageAudit();
		}, 750);
	}

	private extractCoveredTextFromTextLayer(textContentItems: Array<{ str?: string }>, marker: PdfMarker): string {
		let endIndex = marker.endIndex;
		let endOffset = marker.endOffset;
		if (endOffset === 0 && endIndex > marker.beginIndex) {
			endIndex--;
			endOffset = textContentItems[endIndex]?.str?.length ?? 0;
		}

		const parts: string[] = [];
		for (let index = marker.beginIndex; index <= endIndex; index++) {
			const text = textContentItems[index]?.str ?? '';
			if (!text) continue;
			const start = index === marker.beginIndex ? marker.beginOffset : 0;
			const end = index === endIndex ? Math.min(endOffset, text.length) : text.length;
			parts.push(text.slice(start, end));
		}
		return parts.join(' ');
	}

	private classifyCoverage(expectedKey: string, coveredKey: string): PdfMarkerCoverageAuditRow['coverageClass'] {
		if (expectedKey === coveredKey) return 'match';
		if (coveredKey.length === 0) return 'empty-covered-text';
		if (expectedKey.startsWith(coveredKey)) return 'covered-prefix';
		if (expectedKey.includes(coveredKey)) return 'covered-inside-expected';
		if (coveredKey.includes(expectedKey.slice(0, Math.min(48, expectedKey.length)))) return 'covered-includes-expected-start';
		return 'wrong-range-or-page';
	}

	private normalizeAuditKey(text: string): string {
		const out: string[] = [];
		for (let i = 0; i < text.length;) {
			const cp = text.codePointAt(i);
			if (cp === undefined) break;
			const raw = String.fromCodePoint(cp);
			i += raw.length;
			if (raw === '\uFFFD' || raw === '\u00AD') continue;
			for (const ch of raw.normalize('NFKC').toLocaleLowerCase()) {
				if (/[\p{L}\p{N}]/u.test(ch)) out.push(ch);
			}
		}
		return out.join('').replace(/fff/g, 'ffi').replace(/ff/g, 'fi');
	}

	private flushMarkerCoverageAudit(): void {
		const rows = [...this.coverageAuditRowsByMarker.values()]
			.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.page - b.page || a.range.localeCompare(b.range));
		if (rows.length === 0) return;

		const markerCount = this.model.getAllMarkers().length;
		const matchingMarkers = rows.filter((row) => row.matches).length;
		const mismatches = rows.filter((row) => !row.matches);
		const snapshot: PdfMarkerCoverageAuditSnapshot = {
			generatedAt: new Date().toISOString(),
			totals: {
				markers: markerCount,
				auditedMarkers: rows.length,
				matchingMarkers,
				mismatchingMarkers: mismatches.length,
				unauditedMarkers: Math.max(0, markerCount - rows.length),
			},
			rows,
			mismatches,
		};
		console.log('[qualia-coding] PDF marker coverage audit', snapshot.totals);
		if (mismatches.length > 0) console.table(mismatches);
		void this.callbacks.onPdfMarkerCoverageAudit?.(snapshot);
	}

	private reportPendingResolveDiagnostics(args: {
		filePath: string;
		pageNumber: number;
		pendingAttempts: number;
		resolvedCount: number;
		resolvedOnNeighborCount: number;
		withBBoxCount: number;
		withContinuedByCount: number;
		continuedByPendingCount: number;
		continuedByShortTextPendingLt64Count: number;
		bboxAttemptedCount: number;
		bboxIgnoredPageMismatchCount: number;
		resolvedByPageTextCount: number;
		resolvedByBBoxTextCount: number;
		resolvedByPlainTextContextCount: number;
		resolvedByTextContentItemsCount: number;
		stillPendingCount: number;
		pageTextLength: number;
		textLayerNodeCount: number;
		bboxTextLayerNodeCount: number;
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
			withBBox: args.withBBoxCount,
			withContinuedBy: args.withContinuedByCount,
			continuedByPending: args.continuedByPendingCount,
			continuedByShortTextPendingLt64: args.continuedByShortTextPendingLt64Count,
			bboxAttempted: args.bboxAttemptedCount,
			bboxIgnoredPageMismatch: args.bboxIgnoredPageMismatchCount,
			resolvedByPageText: args.resolvedByPageTextCount,
			resolvedByBBoxText: args.resolvedByBBoxTextCount,
			resolvedByPlainTextContext: args.resolvedByPlainTextContextCount,
			resolvedByTextContentItems: args.resolvedByTextContentItemsCount,
			pending: args.stillPendingCount,
			pageTextLength: args.pageTextLength,
			textLayerNodeCount: args.textLayerNodeCount,
			bboxTextLayerNodeCount: args.bboxTextLayerNodeCount,
			failureReasons,
		});

		for (const sample of args.failureSamples) {
			const enrichedSample = {
				filePath: args.filePath,
				page: args.pageNumber,
				...sample,
			};
			if (this.pendingResolveDiagnosticSamples.length < 50) {
				this.pendingResolveDiagnosticSamples.push(enrichedSample);
			}
			this.pendingResolveDiagnosticSamplesByMarker.set(sample.markerId, enrichedSample);
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
		this.flushPdfMarkerCurrentStatus(rows.map((row) => row.filePath));
		this.pendingResolveDiagnosticRows.clear();
		this.pendingResolveDiagnosticSamples = [];
	}

	private flushPdfMarkerCurrentStatus(_filePaths: string[]): void {
		const uniqueFilePaths = [...new Set(this.model.getAllMarkers().map((marker) => marker.fileId))].sort();
		const samples: PdfMarkerCurrentStatusSample[] = [];
		const rows: PdfMarkerCurrentStatusRow[] = uniqueFilePaths.map((filePath) => {
			const markers = this.model.getMarkersForFile(filePath);
			const shapes = this.model.getShapesForFile(filePath);
			const pending = markers.filter(isMarkerPending);
			const continuedByMarkers = markers.filter((marker) => !!marker.importedQdpxContinuedBy);
			const continuedByPending = pending.filter((marker) => !!marker.importedQdpxContinuedBy);
			const pendingPages = [...new Set(pending.map((marker) => marker.page))].sort((a, b) => a - b);
			for (const marker of pending) {
				const failure = this.pendingResolveDiagnosticSamplesByMarker.get(marker.id);
				samples.push({
					filePath,
					page: marker.page,
					markerId: marker.id,
					textLength: marker.text?.length ?? 0,
					shortTextLt64: (marker.text?.length ?? 0) < 64 || undefined,
					hasBBox: !!marker.importedPdfSelectionBBox || undefined,
					hasContinuedBy: !!marker.importedQdpxContinuedBy || undefined,
					continuedByRole: marker.importedQdpxContinuedBy?.role,
					continuedByLinkCount: marker.importedQdpxContinuedBy?.linkIds.length,
					...(failure ? {
						reason: failure.reason,
						bboxAttempted: failure.bboxAttempted,
						bboxTextPreview: failure.bboxTextPreview,
						bboxBestPrefixKeyLength: failure.bboxBestPrefixKeyLength,
						bboxBestWindowKeyLength: failure.bboxBestWindowKeyLength,
						plainTextContextAttempted: failure.plainTextContextAttempted,
						plainTextContextBestWindowKeyLength: failure.plainTextContextBestWindowKeyLength,
						plainTextContextWindowTextPreview: failure.plainTextContextWindowTextPreview,
						bestPrefixKeyLength: failure.bestPrefixKeyLength,
						bestWindowKeyLength: failure.bestWindowKeyLength,
						prevPageBestPrefixKeyLength: failure.prevPageBestPrefixKeyLength,
						prevPageBestWindowKeyLength: failure.prevPageBestWindowKeyLength,
						nextPageBestPrefixKeyLength: failure.nextPageBestPrefixKeyLength,
						nextPageBestWindowKeyLength: failure.nextPageBestWindowKeyLength,
					} : {}),
					textPreview: this.previewText(marker.text),
				});
			}
			return {
				filePath,
				textMarkers: markers.length,
				resolvedTextMarkers: markers.length - pending.length,
				pendingTextMarkers: pending.length,
				pendingPages: pendingPages.join(', '),
				textMarkersWithBBox: markers.filter((marker) => !!marker.importedPdfSelectionBBox).length,
				pendingTextMarkersWithBBox: pending.filter((marker) => !!marker.importedPdfSelectionBBox).length,
				continuedByMarkers: continuedByMarkers.length,
				continuedByPendingMarkers: continuedByPending.length,
				continuedByPendingShortTextLt64: continuedByPending.filter((marker) => (marker.text?.length ?? 0) < 64).length,
				pendingShortTextLt64: pending.filter((marker) => (marker.text?.length ?? 0) < 64).length,
				shapeMarkers: shapes.length,
			};
		});
		if (rows.length === 0) return;
		const totals = this.getPdfMarkerCurrentStatusTotals(rows);
		const snapshot: PdfMarkerCurrentStatusSnapshot = {
			generatedAt: new Date().toISOString(),
			totals,
			rows,
			samples,
		};
		console.log(`[qualia-coding] PDF marker current status (${rows.length} PDF files)`, totals);
		console.table(rows);
		if (samples.length > 0) {
			console.log(`[qualia-coding] PDF marker current pending samples (${samples.length} markers)`);
			console.table(samples);
		}
		void this.callbacks.onPdfMarkerCurrentStatus?.(snapshot);
	}

	private getPdfMarkerCurrentStatusTotals(rows: PdfMarkerCurrentStatusRow[]): PdfMarkerCurrentStatusTotals {
		return rows.reduce<PdfMarkerCurrentStatusTotals>((acc, row) => {
			acc.pdfFiles++;
			acc.textMarkers += row.textMarkers;
			acc.resolvedTextMarkers += row.resolvedTextMarkers;
			acc.pendingTextMarkers += row.pendingTextMarkers;
			acc.pendingShortTextLt64 += row.pendingShortTextLt64;
			acc.continuedByPendingMarkers += row.continuedByPendingMarkers;
			acc.shapeMarkers += row.shapeMarkers;
			return acc;
		}, {
			pdfFiles: 0,
			textMarkers: 0,
			resolvedTextMarkers: 0,
			pendingTextMarkers: 0,
			pendingShortTextLt64: 0,
			continuedByPendingMarkers: 0,
			shapeMarkers: 0,
		});
	}

	private previewText(text: string | undefined, maxLength = 120): string {
		const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
		if (normalized.length <= maxLength) return normalized;
		return `${normalized.slice(0, maxLength - 1)}…`;
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

function coderInitialism(fullName: string): string {
	const words = fullName.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '?';
	return words
		.map((word) => Array.from(word)[0] ?? '')
		.join('')
		.toLocaleUpperCase();
}
