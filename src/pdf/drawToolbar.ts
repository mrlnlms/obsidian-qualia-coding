/**
 * Drawing toolbar for PDF pages.
 * Uses the shared drawToolbarFactory for consistent UX with Image engine.
 */

import type { DrawInteraction } from './drawInteraction';
import { DRAW_TOOL_BUTTONS } from '../core/shapeTypes';
import { createDrawToolbar, type DrawToolbarHandle } from '../core/drawToolbarFactory';

export class DrawToolbar {
	private interaction: DrawInteraction;
	private handle: DrawToolbarHandle | null = null;

	constructor(interaction: DrawInteraction) {
		this.interaction = interaction;
	}

	mount(pdfContainerEl: HTMLElement): void {
		const toolbar = pdfContainerEl.querySelector('.pdf-toolbar') as HTMLElement
			?? pdfContainerEl.querySelector('[class*="toolbar"]') as HTMLElement;
		if (!toolbar) return;

		// PDF uses: select, rect, ellipse, polygon (no freeform)
		this.handle = createDrawToolbar(toolbar, DRAW_TOOL_BUTTONS, {
			modes: ['select', 'rect', 'ellipse', 'polygon'],
			containerClass: 'codemarker-pdf-draw-toolbar',
			onModeChange: (mode) => this.interaction.setMode(mode),
			onDelete: () => this.interaction.deleteSelectedShape(),
			enableKeyboard: false, // PDF has its own keyboard handling in drawInteraction
		});
	}

	unmount(): void {
		this.handle?.destroy();
		this.handle = null;
	}

	updateActiveState(): void {
		this.handle?.setActiveMode(this.interaction.getMode());
	}
}
