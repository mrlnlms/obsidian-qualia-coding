import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfPageObserver } from '../../src/pdf/pageObserver';
import type { PdfMarker } from '../../src/pdf/pdfCodingTypes';
import { projectPdfMarkerToPage } from '../../src/pdf/pdfMarkerSegments';

afterEach(() => {
	delete (document as Document & { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

function textPage(id: number, text: string, top: number) {
	const div = document.createElement('div');
	div.dataset.loaded = 'true';
	const span = document.createElement('span');
	span.className = 'textLayerNode';
	span.dataset.idx = '0';
	span.textContent = text;
	div.appendChild(span);
	Object.defineProperty(div, 'getBoundingClientRect', {
		value: () => ({ left: 0, right: 500, top, bottom: top + 500, width: 500, height: 500, x: 0, y: top, toJSON() {} }),
	});
	document.body.appendChild(div);
	return {
		id,
		div,
		textLayer: {
			textDivs: [span],
			textContentItems: [{ str: text, hasEOL: false }],
		},
	} as any;
}

describe('PdfPageObserver margin overlay lifecycle', () => {
	it('synchronizes a newly-created overlay with the current scroll position', () => {
		const parent = document.createElement('div');
		const scrollContainer = document.createElement('div');
		const viewerEl = document.createElement('div');
		parent.appendChild(scrollContainer);
		scrollContainer.appendChild(viewerEl);
		Object.defineProperty(scrollContainer, 'scrollTop', { value: 420, writable: true });
		Object.defineProperty(scrollContainer, 'offsetLeft', { value: 148 });
		Object.defineProperty(scrollContainer, 'offsetTop', { value: 12 });
		Object.defineProperty(scrollContainer, 'offsetHeight', { value: 600 });

		const child = {
			pdfViewer: {
				dom: { viewerContainerEl: scrollContainer, viewerEl },
				pdfViewer: { _pages: [] },
			},
		};
		const observer = new PdfPageObserver(child as never, {} as never, {} as never, {} as never);

		(observer as unknown as { ensureLabelOverlay(total: number): void })
			.ensureLabelOverlay(148);

		const overlay = parent.querySelector('.codemarker-pdf-label-overlay') as HTMLElement;
		const scroller = overlay.querySelector('.codemarker-pdf-label-scroller') as HTMLElement;
		expect(scroller.style.transform).toBe('translateY(-420px)');
		expect(overlay.style.left).toBe('0px');
		expect(overlay.style.top).toBe('12px');
		expect(overlay.style.height).toBe('600px');
	});

	it('resolves a document hit on a different loaded page and builds multipage geometry', () => {
		const page1 = textPage(1, 'alpha beta', 0);
		const page2 = textPage(2, 'middle page', 600);
		const marker: PdfMarker = {
			markerType: 'pdf', id: 'marker-1', fileId: 'document.pdf', page: 1,
			beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5, text: 'alpha',
			codes: [], createdAt: 1, updatedAt: 1,
		};
		Object.defineProperty(document, 'caretPositionFromPoint', {
			configurable: true,
			value: vi.fn().mockReturnValue({ offsetNode: page2.div.firstChild!.firstChild!, offset: 6 }),
		});
		const child = {
			file: { path: 'document.pdf' },
			getPage: (page: number) => [page1, page2][page - 1],
			pdfViewer: { pdfViewer: { _pages: [page1, page2] } },
		};
		const model = { findMarkerById: () => marker };
		const observer = new PdfPageObserver(child as never, model as never, {} as never, {} as never);

		const hit = (observer as any).resolveDocumentHit(100, 700);
		expect(hit.endpoint).toEqual({ page: 2, index: 0, offset: 6 });
		const geometry = (observer as any).buildDragGeometry(marker.id, 'end', hit);
		expect(geometry.segments.map((segment: any) => [segment.page, segment.text]))
			.toEqual([[1, 'alpha beta'], [2, 'middle']]);
	});

	it('refreshes every affected margin snapshot during a silent preview', () => {
		const page1 = textPage(1, 'alpha beta', 0);
		const page2 = textPage(2, 'middle page', 600);
		const marker: PdfMarker = {
			markerType: 'pdf', id: 'marker-1', fileId: 'document.pdf', page: 1,
			beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5, text: 'alpha',
			codes: [], createdAt: 1, updatedAt: 1,
		};
		const model = {
			registry: {},
			findMarkerById: vi.fn().mockReturnValue(marker),
			previewMarkerGeometry: vi.fn((_id, geometry) => {
				Object.assign(marker, geometry);
				marker.segments = geometry.segments?.map((segment: any) => ({ ...segment }));
				return true;
			}),
			isMarkerEditable: vi.fn().mockReturnValue(true),
			getMarkerPageProjections: (_file: string, page: number) => projectPdfMarkerToPage(marker, page),
			getShapesForPage: () => [],
		};
		const child = {
			file: { path: 'document.pdf' },
			getPage: (page: number) => [page1, page2][page - 1],
			pdfViewer: { pdfViewer: { _pages: [page1, page2] } },
		};
		const observer = new PdfPageObserver(child as never, model as never, {} as never, {} as never);
		const refreshSnapshot = vi.spyOn(observer as any, 'refreshMarginSnapshotForPage').mockImplementation(() => {});
		const refreshLayout = vi.spyOn(observer as any, 'refreshMarginPanelLayout').mockImplementation(() => {});
		const geometry = {
			page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10,
			text: 'alpha beta\fmiddle',
			segments: [
				{ page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10, text: 'alpha beta' },
				{ page: 2, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 6, text: 'middle' },
			],
		};

		(observer as any).previewDragGeometry(marker.id, geometry, 'end', document.createElement('div'));
		expect(model.previewMarkerGeometry).toHaveBeenCalledOnce();
		expect(refreshSnapshot.mock.calls.map((call) => call[0])).toEqual([1, 2]);
		expect(refreshLayout).toHaveBeenCalledOnce();
	});

	it('uses the drag-start geometry to preserve a segment restored later in the gesture', () => {
		const page1 = textPage(1, 'alpha beta', 0);
		const page2 = textPage(2, 'middle page', 600);
		const page3 = textPage(3, 'gamma delta', 1200);
		const originalSegments = [
			{ page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10, text: 'alpha beta' },
			{ page: 2, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 11, text: 'middle page' },
			{
				page: 3, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5, text: 'gamma',
				importedSelectionGuid: 'page-3-guid',
			},
		];
		const marker: PdfMarker = {
			markerType: 'pdf', id: 'marker-1', fileId: 'document.pdf', page: 1,
			beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10,
			text: 'alpha beta\fmiddle page', codes: [], createdAt: 1, updatedAt: 1,
			// Simulate an earlier preview that temporarily shrank the marker to page 2.
			segments: originalSegments.slice(0, 2),
		};
		const child = {
			file: { path: 'document.pdf' },
			getPage: (page: number) => [page1, page2, page3][page - 1],
			pdfViewer: { pdfViewer: { _pages: [page1, page2, page3] } },
		};
		const observer = new PdfPageObserver(
			child as never,
			{ findMarkerById: () => marker } as never,
			{} as never,
			{} as never,
		);
		const original = {
			page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10,
			text: 'alpha beta\fmiddle page\fgamma', segments: originalSegments,
		};
		const geometry = (observer as any).buildDragGeometry(
			marker.id,
			'end',
			{ endpoint: { page: 3, index: 0, offset: 5 }, pageView: page3 },
			original,
		);
		expect(geometry.segments[2].importedSelectionGuid).toBe('page-3-guid');
	});

	it('defers full page rerenders while a handle owns the live layer', () => {
		const getMarkerPageProjections = vi.fn();
		const observer = new PdfPageObserver(
			{ file: { path: 'document.pdf' } } as never,
			{ getMarkerPageProjections } as never,
			{} as never,
			{} as never,
		);
		(observer as any).activeDragCancel = vi.fn();
		(observer as any).renderPage(1);
		expect(getMarkerPageProjections).not.toHaveBeenCalled();
	});

	it('does not defer another PDF observer while this view is dragging', () => {
		const page = textPage(1, 'alpha beta', 0);
		const getMarkerPageProjections = vi.fn().mockReturnValue([]);
		const child = {
			file: { path: 'other.pdf' },
			getPage: () => page,
			pdfViewer: { dom: null, pdfViewer: { _pages: [page] } },
		};
		const model = {
			registry: {},
			getMarkerPageProjections,
			getMarkersForPage: vi.fn().mockReturnValue([]),
			getShapesForPage: vi.fn().mockReturnValue([]),
		};
		const observer = new PdfPageObserver(child as never, model as never, {} as never, {} as never);
		document.body.classList.add('codemarker-pdf-dragging');
		(observer as any).renderPage(1);
		expect(getMarkerPageProjections).toHaveBeenCalledWith('other.pdf', 1);
	});
});
