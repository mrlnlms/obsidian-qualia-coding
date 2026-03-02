/**
 * Drawing toolbar for PDF pages.
 * Injects mode buttons into the PDF viewer toolbar.
 */

import { setIcon, setTooltip } from 'obsidian';
import type { DrawMode } from '../core/shapeTypes';
import type { DrawInteraction } from './drawInteraction';

interface ToolbarButton {
	mode: DrawMode;
	icon: string;
	tooltip: string;
	el: HTMLElement;
}

export class DrawToolbar {
	private interaction: DrawInteraction;
	private containerEl: HTMLElement | null = null;
	private buttons: ToolbarButton[] = [];
	private deleteBtn: HTMLElement | null = null;

	constructor(interaction: DrawInteraction) {
		this.interaction = interaction;
	}

	/**
	 * Mount the toolbar into the PDF viewer's toolbar area.
	 * The PDF toolbar is the first child of containerEl with class "pdf-toolbar".
	 */
	mount(pdfContainerEl: HTMLElement): void {
		// Find the PDF toolbar
		const toolbar = pdfContainerEl.querySelector('.pdf-toolbar') as HTMLElement | null;
		if (!toolbar) {
			// Fallback: try to find toolbar-like container
			const toolbarLike = pdfContainerEl.querySelector('[class*="toolbar"]') as HTMLElement | null;
			if (!toolbarLike) return;
		}

		const targetToolbar = toolbar ?? pdfContainerEl.querySelector('[class*="toolbar"]') as HTMLElement;
		if (!targetToolbar) return;

		// Create our toolbar container
		const container = document.createElement('div');
		container.className = 'codemarker-pdf-draw-toolbar';

		const modes: Array<{ mode: DrawMode; icon: string; tooltip: string }> = [
			{ mode: 'select', icon: 'mouse-pointer', tooltip: 'Select (V)' },
			{ mode: 'rect', icon: 'square', tooltip: 'Rectangle (R)' },
			{ mode: 'ellipse', icon: 'circle', tooltip: 'Ellipse (E)' },
			{ mode: 'polygon', icon: 'pentagon', tooltip: 'Polygon (P)' },
		];

		for (const { mode, icon, tooltip } of modes) {
			const btn = document.createElement('div');
			btn.className = 'clickable-icon';
			setIcon(btn, icon);
			setTooltip(btn, tooltip);

			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.interaction.setMode(mode);
				this.updateActiveState();
			});

			container.appendChild(btn);
			this.buttons.push({ mode, icon, tooltip, el: btn });
		}

		// Delete button
		const deleteBtn = document.createElement('div');
		deleteBtn.className = 'clickable-icon';
		setIcon(deleteBtn, 'trash-2');
		setTooltip(deleteBtn, 'Delete selected shape (Del)');
		deleteBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.interaction.deleteSelectedShape();
		});
		container.appendChild(deleteBtn);
		this.deleteBtn = deleteBtn;

		targetToolbar.appendChild(container);
		this.containerEl = container;

		this.updateActiveState();
	}

	unmount(): void {
		if (this.containerEl) {
			this.containerEl.remove();
			this.containerEl = null;
		}
		this.buttons = [];
		this.deleteBtn = null;
	}

	updateActiveState(): void {
		const currentMode = this.interaction.getMode();
		for (const btn of this.buttons) {
			if (btn.mode === currentMode) {
				btn.el.classList.add('is-active');
			} else {
				btn.el.classList.remove('is-active');
			}
		}
	}
}
