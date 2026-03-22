export interface PdfViewState {
	hoverOpenTimer: ReturnType<typeof setTimeout> | null;
	hoverCloseTimer: ReturnType<typeof setTimeout> | null;
	currentHoverMarkerId: string | null;
	shapeHoverTimer: ReturnType<typeof setTimeout> | null;
	currentHoverShapeId: string | null;
	containerEl: HTMLElement;
	/** Cleanup function for selection preview rects (set when preview is rendered). */
	selectionPreviewCleanup: (() => void) | null;
}

const pdfStates = new WeakMap<HTMLElement, PdfViewState>();

export function getPdfViewState(containerEl: HTMLElement): PdfViewState {
	let state = pdfStates.get(containerEl);
	if (!state) {
		state = {
			hoverOpenTimer: null,
			hoverCloseTimer: null,
			currentHoverMarkerId: null,
			shapeHoverTimer: null,
			currentHoverShapeId: null,
			containerEl,
			selectionPreviewCleanup: null,
		};
		pdfStates.set(containerEl, state);
	}
	return state;
}

export function destroyPdfViewState(containerEl: HTMLElement): void {
	const state = pdfStates.get(containerEl);
	if (!state) return;
	if (state.hoverOpenTimer) clearTimeout(state.hoverOpenTimer);
	if (state.hoverCloseTimer) clearTimeout(state.hoverCloseTimer);
	if (state.shapeHoverTimer) clearTimeout(state.shapeHoverTimer);
	if (state.selectionPreviewCleanup) { state.selectionPreviewCleanup(); state.selectionPreviewCleanup = null; }
	pdfStates.delete(containerEl);
}
