import { describe, expect, it } from 'vitest';
import { PdfPageObserver } from '../../src/pdf/pageObserver';

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
});
