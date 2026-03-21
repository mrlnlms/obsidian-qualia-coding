export interface PdfViewState {
	hoverOpenTimer: ReturnType<typeof setTimeout> | null;
	hoverCloseTimer: ReturnType<typeof setTimeout> | null;
	currentHoverMarkerId: string | null;
	shapeHoverTimer: ReturnType<typeof setTimeout> | null;
	currentHoverShapeId: string | null;
	containerEl: HTMLElement;
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
	pdfStates.delete(containerEl);
}
