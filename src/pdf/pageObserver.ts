/**
 * Manages the lifecycle of highlight rendering across PDF pages.
 * Listens for page render events and model changes to keep highlights in sync.
 *
 * PDF pages publish local margin snapshots. The observer projects them into one
 * document-level panel outside the scroll container, where labels are not clipped.
 */

import type { PDFViewerChild, PDFPageView } from './pdfTypings';
import type { PdfCodingModel } from './pdfCodingModel';
import type { PdfMarker, PdfMarkerPageProjection, PdfMarkerRangeChanges, PdfShapeMarker } from './pdfCodingTypes';
import type { PdfViewState } from './pdfViewState';
import { renderHighlightsForPage, clearHighlightsForPage, updateHighlightRectsForMarker, applyHoverToHighlights, showHandlesForMarker, type HighlightCallbacks } from './highlightRenderer';
import {
	applyHoverToMarginPanel,
	clearPdfMarginPanel,
	collectMarginPanelPageSnapshot,
	pdfMarginPanelBarWidth,
	renderPdfMarginPanel,
	type MarginPanelOwnerLabel,
} from './marginPanelRenderer';
import {
	buildPdfMarginPanelLayout,
	type PdfMarginPagePlacement,
	type PdfMarginPageSnapshot,
} from './pdfMarginPanelLayout';
import { renderDrawLayerForPage, clearDrawLayerForPage, applyHoverToDrawLayer, type DrawLayerCallbacks } from './drawLayer';
import { attachDragHandles } from './dragHandles';
import { diagnosePendingTextSearch, isMarkerPending, resolvePendingIndicesInTextContentItems, resolvePendingIndicesWithDiagnostics, type PendingResolutionDiagnostics } from './resolvePendingIndices';
import { getTextLayerInfo } from './pdfViewerAccess';
import { visibilityEventBus } from '../core/visibilityEventBus';
import { getPdfMarkerSegments, isMultipagePdfMarker } from './pdfMarkerSegments';
import { resolvePendingMultipageProjection } from './resolvePendingMultipage';

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
	segmentIndex: number;
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
		segments: number;
		auditedMarkers: number;
		auditedSegments: number;
		matchingMarkers: number;
		matchingSegments: number;
		mismatchingMarkers: number;
		mismatchingSegments: number;
		unauditedMarkers: number;
		unauditedSegments: number;
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
	private viewerResizeHandler: (() => void) | null = null;
	private layoutResizeObserver: ResizeObserver | null = null;
	private lastPaddingTotal = 0;
	private marginPageSnapshots = new Map<number, PdfMarginPageSnapshot>();

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
			applyHoverToDrawLayer(this.child.containerEl, markerId);
			// The document-level margin panel lives only in the external overlay.
			if (this.labelOverlay) {
				applyHoverToMarginPanel(this.labelOverlay, markerId);
			}
			// Show/hide drag handles (bidirectional: margin panel ↔ handles)
			this.showHandlesForHover(markerId);
		};
		this.model.onHoverChange(this.hoverListener);

		// Subscribe to visibility changes
		this.unsubscribeVisibility = visibilityEventBus.subscribe((ids) => this.refreshVisibility(ids));

		this.viewerResizeHandler = () => this.refreshMarginPanelLayout();
		window.addEventListener('resize', this.viewerResizeHandler);
		if (typeof ResizeObserver !== 'undefined') {
			const dom = this.child.pdfViewer.dom;
			const scrollContainer = dom?.viewerContainerEl;
			const viewerEl = dom?.viewerEl;
			this.layoutResizeObserver = new ResizeObserver(() => this.refreshMarginPanelLayout());
			if (scrollContainer) this.layoutResizeObserver.observe(scrollContainer);
			if (viewerEl) this.layoutResizeObserver.observe(viewerEl);
			if (scrollContainer?.parentElement) {
				this.layoutResizeObserver.observe(scrollContainer.parentElement);
			}
		}

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
		if (this.viewerResizeHandler) {
			window.removeEventListener('resize', this.viewerResizeHandler);
			this.viewerResizeHandler = null;
		}
		if (this.layoutResizeObserver) {
			this.layoutResizeObserver.disconnect();
			this.layoutResizeObserver = null;
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

		this.refreshMarginPanelLayout();
	}

	private renderPage(pageNumber: number): void {
		const filePath = this.child.file?.path;
		if (!filePath) return;

		const pageView = this.getPageView(pageNumber);
		if (!pageView) return;

		// Only render if the page DOM is loaded
		if (!pageView.div.dataset.loaded) return;

		let markers = this.model.getMarkerPageProjections(filePath, pageNumber);
		const hasPendingTextMarkers = markers.some((marker) =>
			(marker.renderSegmentResolution === 'pending' || isMarkerPending(marker))
			&& !!(marker.text || marker.logicalText),
		);
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
			const isLogicalProjection = m.renderSegmentCount > 1;
			if ((m.renderSegmentResolution === 'pending' || isMarkerPending(m)) && (m.text || m.logicalText)) {
				pendingAttempts++;
				if (m.importedPdfSelectionBBox) withBBoxCount++;
				if (m.importedQdpxContinuedBy) withContinuedByCount++;
				let targetPageNumber = pageNumber;
				let resolvedText: string | undefined;
				const boundaryChanges = isLogicalProjection && !m.text
					? resolvePendingMultipageProjection(pageView.div, m)
					: null;
				const textItemsResult = m.text && !m.importedQdpxMultipageFragment && textLayerInfo
					? resolvePendingIndicesInTextContentItems(textLayerInfo.textContentItems, m.text)
					: null;
				let resolved = boundaryChanges ? {
					beginIndex: boundaryChanges.beginIndex!,
					beginOffset: boundaryChanges.beginOffset!,
					endIndex: boundaryChanges.endIndex!,
					endOffset: boundaryChanges.endOffset!,
				} : textItemsResult?.resolved ?? null;
				if (boundaryChanges?.text) resolvedText = boundaryChanges.text;
				const boundaryDiagnostics = diagnosePendingTextSearch(pageView.div, m.logicalText);
				let diagnostics: PendingResolutionDiagnostics | undefined = boundaryChanges || (isLogicalProjection && !m.text)
					? {
						reason: boundaryChanges ? 'resolved' : 'not-found',
						searchTextLength: m.logicalText.length,
						searchTextPreview: m.logicalText.replace(/\s+/g, ' ').trim().slice(0, 160),
						pageTextLength: boundaryDiagnostics.pageTextLength ?? 0,
						textLayerNodeCount: boundaryDiagnostics.textLayerNodeCount ?? 0,
						...boundaryDiagnostics,
					}
					: textItemsResult?.diagnostics;
				if (!resolved && m.text) {
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
				if (!resolved && !isLogicalProjection && !m.importedPdfSelectionBBox && !m.importedQdpxMultipageFragment) {
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
					const changes: PdfMarkerRangeChanges = {
						beginIndex: resolved.beginIndex,
						beginOffset: resolved.beginOffset,
						endIndex: resolved.endIndex,
						endOffset: resolved.endOffset,
						...(resolvedText ? { text: resolvedText } : {}),
					};
					if (isLogicalProjection) {
						this.model.resolveImportedMarkerSegmentRange(m.id, m.renderSegmentIndex, changes);
					} else {
						this.model.resolveImportedMarkerRange(m.id, { page: targetPageNumber, ...changes });
					}
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
						...(isLogicalProjection ? {} : this.diagnoseNeighborPages(pageNumber, m)),
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
		markers = this.model.getMarkerPageProjections(filePath, pageNumber);
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
			if (!this.model.canResizeMarker(info.marker)) continue;
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

		this.marginPageSnapshots.set(pageNumber, collectMarginPanelPageSnapshot(
			pageView,
			renderMarkers,
			this.model.registry,
			shapes,
			(marker) => this.ownerLabelForMarker(marker),
			(marker) => this.model.isMarkerEditable(marker),
		));
		this.refreshMarginPanelLayout();
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
				if (isMultipagePdfMarker(marker)) continue;
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

	private auditMarkerCoverageForPage(filePath: string, pageNumber: number, pageView: PDFPageView, markers: PdfMarkerPageProjection[]): void {
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
				segmentIndex: marker.renderSegmentIndex,
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
			this.coverageAuditRowsByMarker.set(`${marker.id}:${marker.renderSegmentIndex}`, row);
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

		const logicalMarkers = this.model.getAllMarkers();
		const markerCount = logicalMarkers.length;
		const segmentCount = logicalMarkers.reduce((total, marker) => total + (marker.segments?.length ?? 1), 0);
		const auditedMarkerIds = new Set(rows.map((row) => row.markerId));
		const mismatchingMarkerIds = new Set(rows.filter((row) => !row.matches).map((row) => row.markerId));
		const matchingMarkers = [...auditedMarkerIds].filter((id) => !mismatchingMarkerIds.has(id)).length;
		const mismatches = rows.filter((row) => !row.matches);
		const snapshot: PdfMarkerCoverageAuditSnapshot = {
			generatedAt: new Date().toISOString(),
			totals: {
				markers: markerCount,
				segments: segmentCount,
				auditedMarkers: auditedMarkerIds.size,
				auditedSegments: rows.length,
				matchingMarkers,
				matchingSegments: rows.length - mismatches.length,
				mismatchingMarkers: mismatchingMarkerIds.size,
				mismatchingSegments: mismatches.length,
				unauditedMarkers: Math.max(0, markerCount - auditedMarkerIds.size),
				unauditedSegments: Math.max(0, segmentCount - rows.length),
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
		this.marginPageSnapshots.clear();
		if (this.labelScroller) clearPdfMarginPanel(this.labelScroller);

		const pagesCount = this.child.pdfViewer?.pagesCount;
		if (pagesCount) {
			for (let i = 1; i <= pagesCount; i++) {
				const pageView = this.getPageView(i);
				if (pageView) {
					clearHighlightsForPage(pageView.div);
					clearDrawLayerForPage(pageView.div);
				}
			}
		}
		this.refreshMarginPanelLayout();
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
			onScroll();
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

	private refreshMarginPanelLayout(): void {
		const dom = this.child.pdfViewer.dom;
		const scrollContainer = dom?.viewerContainerEl;
		if (!scrollContainer) return;

		const pageViews = this.child.pdfViewer.pdfViewer?._pages ?? [];
		const loadedPageNumbers = new Set<number>();
		const placements: PdfMarginPagePlacement[] = [];
		for (const pageView of pageViews) {
			if (!pageView.div.dataset.loaded) continue;
			loadedPageNumbers.add(pageView.id);
			placements.push({
				pageNumber: pageView.id,
				topPx: pageView.div.offsetTop,
				heightPx: pageView.div.offsetHeight,
			});
		}

		for (const pageNumber of this.marginPageSnapshots.keys()) {
			if (!loadedPageNumbers.has(pageNumber)) this.marginPageSnapshots.delete(pageNumber);
		}

		const snapshots = [...this.marginPageSnapshots.values()]
			.sort((a, b) => a.pageNumber - b.pageNumber);
		placements.sort((a, b) => a.pageNumber - b.pageNumber);
		const rails = buildPdfMarginPanelLayout(snapshots, placements);
		const barWidth = pdfMarginPanelBarWidth(rails);
		const total = barWidth > 0 ? barWidth + 130 : 0;

		if (total === 0) {
			const layoutChanged = this.lastPaddingTotal !== 0;
			if (this.labelScroller) clearPdfMarginPanel(this.labelScroller);
			this.destroyLabelOverlay();
			scrollContainer.style.marginLeft = '';
			this.lastPaddingTotal = 0;
			if (layoutChanged) window.dispatchEvent(new Event('resize'));
			return;
		}

		const layoutChanged = total !== this.lastPaddingTotal;
		if (layoutChanged) {
			this.lastPaddingTotal = total;
			scrollContainer.style.marginLeft = `${total}px`;
		}
		this.ensureLabelOverlay(total);
		if (this.labelScroller) {
			renderPdfMarginPanel(this.labelScroller, rails, {
				onLabelClick: this.callbacks.onMarkerClick,
				onHover: (markerId, codeName) => this.model.setHoverState(markerId, codeName),
			});
		}
		if (layoutChanged) window.dispatchEvent(new Event('resize'));
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
				for (const segment of getPdfMarkerSegments(m)) pages.add(segment.page);
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
