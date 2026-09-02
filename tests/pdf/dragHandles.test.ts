import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PdfMarkerPageProjection } from '../../src/pdf/pdfCodingTypes';
import type { MarkerRenderInfo } from '../../src/pdf/highlightRenderer';
import {
	attachLogicalDragHandles,
	logicalHandleOptions,
	type DragHandleCallbacks,
} from '../../src/pdf/dragHandles';
import type { PdfMarkerGeometry } from '../../src/pdf/pdfMarkerResize';

function projection(index = 0, count = 1): PdfMarkerPageProjection {
	return {
		markerType: 'pdf',
		id: 'marker-1',
		fileId: 'document.pdf',
		page: index + 1,
		beginIndex: 0,
		beginOffset: 0,
		endIndex: 0,
		endOffset: 5,
		text: 'alpha',
		codes: [],
		createdAt: 1,
		updatedAt: 1,
		renderSegmentIndex: index,
		renderSegmentCount: count,
		renderSegmentResolution: 'resolved',
		logicalText: 'alpha',
	};
}

function renderInfo(marker = projection()): MarkerRenderInfo {
	const layer = document.createElement('div');
	const firstRectEl = document.createElement('div');
	firstRectEl.style.left = '10%';
	firstRectEl.style.top = '20%';
	firstRectEl.style.width = '15%';
	firstRectEl.style.height = '3%';
	const lastRectEl = document.createElement('div');
	lastRectEl.style.left = '30%';
	lastRectEl.style.top = '40%';
	lastRectEl.style.width = '20%';
	lastRectEl.style.height = '3%';
	layer.append(firstRectEl, lastRectEl);
	document.body.appendChild(layer);
	return { marker, firstRectEl, lastRectEl, mergedRects: [], color: '#123456' };
}

function callbacks(overrides: Partial<DragHandleCallbacks> = {}): DragHandleCallbacks {
	return {
		resolveHit: vi.fn().mockReturnValue(null),
		buildGeometry: vi.fn().mockReturnValue(null),
		onGeometryPreview: vi.fn(),
		onGeometryCommit: vi.fn(),
		onGeometryRestore: vi.fn(),
		...overrides,
	};
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('logical PDF drag handles', () => {
	it('maps page projections to exactly their logical endpoint roles', () => {
		expect(logicalHandleOptions(projection(0, 1))).toEqual({ start: true, end: true });
		expect(logicalHandleOptions(projection(0, 3))).toEqual({ start: true, end: false });
		expect(logicalHandleOptions(projection(1, 3))).toEqual({ start: false, end: false });
		expect(logicalHandleOptions(projection(2, 3))).toEqual({ start: false, end: true });
	});

	it.each([
		[{ start: true, end: false }, 1, 0],
		[{ start: false, end: true }, 0, 1],
		[{ start: true, end: true }, 1, 1],
	] as const)('creates only requested handles for %o', (options, starts, ends) => {
		const info = renderInfo();
		attachLogicalDragHandles(info, {} as any, options, callbacks());
		expect(document.querySelectorAll('.codemarker-pdf-handle-start')).toHaveLength(starts);
		expect(document.querySelectorAll('.codemarker-pdf-handle-end')).toHaveLength(ends);
	});

	it('commits the last preview without a second hit-test on mouseup', () => {
		const candidate: PdfMarkerGeometry = {
			page: 1,
			beginIndex: 0,
			beginOffset: 0,
			endIndex: 0,
			endOffset: 8,
			text: 'alpha be',
		};
		const cb = callbacks({
			resolveHit: vi.fn().mockReturnValue({
				endpoint: { page: 1, index: 0, offset: 8 },
				pageView: {},
			}),
			buildGeometry: vi.fn().mockReturnValue(candidate),
		});
		attachLogicalDragHandles(renderInfo(), {} as any, { start: false, end: true }, cb);
		const handle = document.querySelector<HTMLElement>('.codemarker-pdf-handle-end')!;
		handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 20 }));
		document.dispatchEvent(new MouseEvent('mouseup', { clientX: 999, clientY: 999 }));

		expect(cb.resolveHit).toHaveBeenCalledTimes(1);
		expect(cb.onGeometryPreview).toHaveBeenCalledWith('marker-1', candidate, 'end', handle);
		expect(cb.onGeometryCommit).toHaveBeenCalledOnce();
		expect(cb.onGeometryCommit).toHaveBeenCalledWith('marker-1', candidate);
		expect(cb.onGeometryRestore).not.toHaveBeenCalled();
	});

	it('restores an invalid drag and removes global listeners and state', () => {
		const cb = callbacks();
		attachLogicalDragHandles(renderInfo(), {} as any, { start: true, end: false }, cb);
		const handle = document.querySelector<HTMLElement>('.codemarker-pdf-handle-start')!;
		handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 20 }));
		document.dispatchEvent(new MouseEvent('mouseup'));

		expect(cb.onGeometryCommit).not.toHaveBeenCalled();
		expect(cb.onGeometryRestore).toHaveBeenCalledOnce();
		expect(cb.onGeometryRestore).toHaveBeenCalledWith('marker-1', expect.objectContaining({ text: 'alpha' }));
		expect(document.body.classList.contains('codemarker-pdf-dragging')).toBe(false);

		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 40 }));
		expect(cb.resolveHit).toHaveBeenCalledTimes(1);
	});

	it('restores the original geometry when permission changes before commit', () => {
		const candidate: PdfMarkerGeometry = {
			page: 1, beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 8, text: 'alpha be',
		};
		const cb = callbacks({
			resolveHit: vi.fn().mockReturnValue({
				endpoint: { page: 1, index: 0, offset: 8 }, pageView: {},
			}),
			buildGeometry: vi.fn().mockReturnValue(candidate),
			onGeometryCommit: vi.fn().mockReturnValue(false),
		});
		attachLogicalDragHandles(renderInfo(), {} as any, { start: false, end: true }, cb);
		const handle = document.querySelector<HTMLElement>('.codemarker-pdf-handle-end')!;
		handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mousemove'));
		document.dispatchEvent(new MouseEvent('mouseup'));
		expect(cb.onGeometryRestore).toHaveBeenCalledWith(
			'marker-1', expect.objectContaining({ endOffset: 5, text: 'alpha' }),
		);
	});
});
