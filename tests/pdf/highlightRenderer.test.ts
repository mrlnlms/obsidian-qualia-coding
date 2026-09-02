import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfMarkerPageProjection } from '../../src/pdf/pdfCodingTypes';

vi.mock('../../src/pdf/pdfViewerAccess', () => ({
	getTextLayerInfo: vi.fn().mockReturnValue({ textDivs: [], textContentItems: [] }),
}));

vi.mock('../../src/pdf/highlightGeometry', () => ({
	computeMergedHighlightRects: vi.fn().mockReturnValue([
		{ rect: [10, 10, 30, 20], beginIndex: 0, endIndex: 0 },
	]),
}));

import {
	getOrCreateHighlightLayer,
	moveHandleToRenderInfo,
	updateHighlightProjectionForMarker,
} from '../../src/pdf/highlightRenderer';

function projection(): PdfMarkerPageProjection {
	return {
		markerType: 'pdf',
		id: 'marker-1',
		fileId: 'document.pdf',
		page: 1,
		beginIndex: 0,
		beginOffset: 0,
		endIndex: 0,
		endOffset: 5,
		text: 'alpha',
		codes: [{ codeId: 'code-1', appliedAt: 1 }],
		createdAt: 1,
		updatedAt: 1,
		renderSegmentIndex: 0,
		renderSegmentCount: 1,
		renderSegmentResolution: 'resolved',
		logicalText: 'alpha',
	};
}

function pageView() {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return {
		div,
		pdfPage: { view: [0, 0, 100, 100] },
	} as any;
}

const registry = {
	isCodeVisibleInFile: vi.fn().mockReturnValue(true),
	getById: vi.fn().mockReturnValue({ id: 'code-1', name: 'Code', color: '#00aa00' }),
} as any;

beforeEach(() => {
	document.body.replaceChildren();
	vi.clearAllMocks();
	registry.isCodeVisibleInFile.mockReturnValue(true);
	registry.getById.mockReturnValue({ id: 'code-1', name: 'Code', color: '#00aa00' });
});

describe('PDF highlight preview fast path', () => {
	it('replaces only the requested marker projection and can clear it', () => {
		const view = pageView();
		const layer = getOrCreateHighlightLayer(view.div);
		const old = document.createElement('div');
		old.className = 'codemarker-pdf-highlight';
		old.dataset.markerId = 'marker-1';
		const sibling = document.createElement('div');
		sibling.className = 'codemarker-pdf-highlight';
		sibling.dataset.markerId = 'marker-2';
		layer.append(old, sibling);

		const info = updateHighlightProjectionForMarker(
			view, 'marker-1', projection(), registry, 'document.pdf', true,
		);
		expect(info?.marker.id).toBe('marker-1');
		expect(layer.querySelectorAll('[data-marker-id="marker-1"]')).toHaveLength(1);
		expect(layer.querySelectorAll('[data-marker-id="marker-2"]')).toHaveLength(1);

		expect(updateHighlightProjectionForMarker(
			view, 'marker-1', null, registry, 'document.pdf', true,
		)).toBeNull();
		expect(layer.querySelectorAll('[data-marker-id="marker-1"]')).toHaveLength(0);
		expect(layer.querySelectorAll('[data-marker-id="marker-2"]')).toHaveLength(1);
	});

	it('reparents and positions the active logical handle', () => {
		const oldLayer = document.createElement('div');
		const handle = document.createElement('div');
		oldLayer.appendChild(handle);
		const view = pageView();
		getOrCreateHighlightLayer(view.div);
		const info = updateHighlightProjectionForMarker(
			view, 'marker-1', projection(), registry, 'document.pdf', true,
		)!;

		moveHandleToRenderInfo(handle, info, 'end');
		expect(handle.parentElement).toBe(info.firstRectEl.parentElement);
		expect(handle.style.left).toContain('30%');
		expect(handle.style.top).toContain(info.lastRectEl.style.top);
	});

	it('uses the non-editable appearance in the same fast path', () => {
		const view = pageView();
		getOrCreateHighlightLayer(view.div);
		const info = updateHighlightProjectionForMarker(
			view, 'marker-1', projection(), registry, 'document.pdf', false,
		)!;
		expect(info.firstRectEl.style.backgroundColor).not.toBe('rgb(0, 170, 0)');
	});
});
