/**
 * Coding popover menu for PDF text selections.
 * Adapted from codemarker-csv codingMenu.ts.
 */

import { App, TextComponent, ToggleComponent, setIcon } from 'obsidian';
import type { PdfCodingModel } from '../coding/pdfCodingModel';
import type { PdfSelectionResult } from '../pdf/selectionCapture';
import type { PdfMarker } from '../coding/pdfCodingTypes';
import { CodeFormModal } from './codeFormModal';
import { cancelHoverCloseTimer, startHoverCloseTimer } from '../pdf/highlightRenderer';

/**
 * Opens a coding popover menu near the mouse event location.
 * Supports single or multiple selection results (cross-page).
 */
export function openPdfCodingPopover(
	mouseEvent: MouseEvent | null,
	model: PdfCodingModel,
	selectionResults: PdfSelectionResult | PdfSelectionResult[],
	onHighlightRefresh: () => void,
	savedPos?: { x: number; y: number },
	app?: App,
): void {
	const results = Array.isArray(selectionResults) ? selectionResults : [selectionResults];

	// Remove any existing popover
	document.querySelector('.codemarker-popover')?.remove();

	const container = document.createElement('div');
	container.className = 'menu codemarker-popover';
	applyThemeColors(container);

	container.addEventListener('mousedown', (e) => {
		e.stopPropagation();
	});

	const close = () => {
		container.remove();
		document.removeEventListener('mousedown', outsideHandler);
		document.removeEventListener('keydown', escHandler);
	};

	// Hover-aware: keep popover open while mouse is over it
	container.addEventListener('mouseenter', () => {
		cancelHoverCloseTimer();
	});
	container.addEventListener('mouseleave', () => {
		startHoverCloseTimer(close);
	});

	const pos = savedPos ?? (mouseEvent ? { x: mouseEvent.clientX, y: mouseEvent.clientY } : { x: 0, y: 0 });

	const rebuild = () => {
		close();
		openPdfCodingPopover(mouseEvent, model, results, onHighlightRefresh, pos, app);
	};

	// Cross-page badge
	if (results.length > 1) {
		const badge = document.createElement('div');
		badge.className = 'menu-item codemarker-popover-badge';
		badge.textContent = `Selection spans ${results.length} pages`;
		container.appendChild(badge);
	}

	// Get or create markers for all selection results
	const getMarkers = (): PdfMarker[] =>
		results.map(r =>
			model.findOrCreateMarker(r.file, r.page, r.beginIndex, r.beginOffset, r.endIndex, r.endOffset, r.text),
		);

	// For toggle state, use the first result's existing marker
	const firstResult = results[0];
	const existingMarker = model.findExistingMarker(
		firstResult.file,
		firstResult.page,
		firstResult.beginIndex,
		firstResult.beginOffset,
		firstResult.endIndex,
		firstResult.endOffset,
	);
	const activeCodes = existingMarker ? existingMarker.codes : [];

	// ── TextComponent input ──
	const inputWrapper = document.createElement('div');
	inputWrapper.className = 'menu-item menu-item-textfield';

	const textComponent = new TextComponent(inputWrapper);
	textComponent.setPlaceholder('New code name...');
	applyInputTheme(textComponent.inputEl);

	inputWrapper.addEventListener('click', (evt: MouseEvent) => {
		evt.stopPropagation();
		textComponent.inputEl.focus();
	});

	textComponent.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
		if (evt.key === 'Enter') {
			evt.stopPropagation();
			evt.preventDefault();
			const name = textComponent.inputEl.value.trim();
			if (name) {
				for (const m of getMarkers()) {
					model.addCodeToMarker(m.id, name);
				}
				onHighlightRefresh();
				rebuild();
			}
		} else if (evt.key === 'Escape') {
			close();
		}
	});

	container.appendChild(inputWrapper);

	// ── Toggle list for existing codes ──
	const allCodes = model.getAllCodes();

	if (allCodes.length > 0) {
		container.appendChild(createSeparator());
	}

	for (const codeDef of allCodes) {
		const isActive = activeCodes.includes(codeDef.name);

		const itemEl = document.createElement('div');
		itemEl.className = 'menu-item menu-item-toggle';

		const swatch = document.createElement('span');
		swatch.className = 'codemarker-popover-swatch';
		swatch.style.backgroundColor = codeDef.color;
		itemEl.appendChild(swatch);

		const toggle = new ToggleComponent(itemEl);
		toggle.setValue(isActive);
		toggle.toggleEl.addEventListener('click', (evt) => {
			evt.stopPropagation();
		});
		toggle.onChange((value) => {
			for (const m of getMarkers()) {
				if (value) {
					model.addCodeToMarker(m.id, codeDef.name);
				} else {
					model.removeCodeFromMarker(m.id, codeDef.name, true);
				}
			}
			onHighlightRefresh();
		});

		const titleEl = document.createElement('span');
		titleEl.className = 'menu-item-title';
		titleEl.textContent = codeDef.name;
		itemEl.appendChild(titleEl);

		itemEl.addEventListener('click', (evt: MouseEvent) => {
			evt.stopPropagation();
			const currentValue = toggle.getValue();
			toggle.setValue(!currentValue);
		});

		container.appendChild(itemEl);
	}

	// ── Action buttons ──
	container.appendChild(createSeparator());

	container.appendChild(
		createActionItem('Add New Code', 'plus-circle', () => {
			const name = textComponent.inputEl.value.trim();
			if (name) {
				for (const m of getMarkers()) {
					model.addCodeToMarker(m.id, name);
				}
				onHighlightRefresh();
				rebuild();
			} else {
				textComponent.inputEl.focus();
			}
		}),
	);

	if (app) {
		container.appendChild(
			createActionItem('New Code...', 'palette', () => {
				close();
				new CodeFormModal(app, model.registry, (name, color, description) => {
					model.registry.create(name, color, description);
					for (const m of getMarkers()) {
						model.addCodeToMarker(m.id, name);
					}
					onHighlightRefresh();
				}).open();
			}),
		);
	}

	container.appendChild(
		createActionItem('Remove All Codes', 'trash', () => {
			// Collect all existing markers for these results
			for (const r of results) {
				const existing = model.findExistingMarker(r.file, r.page, r.beginIndex, r.beginOffset, r.endIndex, r.endOffset);
				if (existing) {
					model.removeAllCodesFromMarker(existing.id);
				}
			}
			onHighlightRefresh();
			rebuild();
		}),
	);

	// ── Position and show ──
	document.body.appendChild(container);

	container.style.top = `${pos.y + 4}px`;
	container.style.left = `${pos.x}px`;

	// Clamp to viewport
	requestAnimationFrame(() => {
		const cr = container.getBoundingClientRect();
		if (cr.right > window.innerWidth) {
			container.style.left = `${window.innerWidth - cr.width - 8}px`;
		}
		if (cr.bottom > window.innerHeight) {
			container.style.top = `${pos.y - cr.height - 4}px`;
		}
	});

	// Auto-focus input
	setTimeout(() => textComponent.inputEl.focus(), 50);

	// ── Close handlers ──
	const outsideHandler = (e: MouseEvent) => {
		if (!container.contains(e.target as Node)) {
			close();
		}
	};

	const escHandler = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			close();
		}
	};

	setTimeout(() => {
		document.addEventListener('mousedown', outsideHandler);
		document.addEventListener('keydown', escHandler);
	}, 10);
}

// ── Helpers ──

function createActionItem(title: string, iconName: string, onClick: () => void): HTMLElement {
	const item = document.createElement('div');
	item.className = 'menu-item';

	const iconEl = document.createElement('div');
	iconEl.className = 'menu-item-icon';
	setIcon(iconEl, iconName);

	const titleEl = document.createElement('div');
	titleEl.className = 'menu-item-title';
	titleEl.textContent = title;

	item.appendChild(iconEl);
	item.appendChild(titleEl);

	item.addEventListener('click', (e) => {
		e.stopPropagation();
		onClick();
	});

	return item;
}

function createSeparator(): HTMLElement {
	const sep = document.createElement('div');
	sep.className = 'menu-separator';
	return sep;
}

function applyThemeColors(container: HTMLElement) {
	const s = getComputedStyle(document.body);
	const get = (v: string) => s.getPropertyValue(v).trim();

	container.style.backgroundColor = get('--background-secondary');
	container.style.borderColor = get('--background-modifier-border');
	container.style.color = get('--text-normal');

	const vars = [
		'--background-primary', '--background-secondary',
		'--background-modifier-border', '--background-modifier-hover',
		'--text-normal', '--text-muted',
		'--interactive-accent',
		'--font-ui-small',
		'--size-2-1', '--size-4-1', '--size-4-2',
		'--radius-s', '--radius-m',
		'--shadow-s',
		'--toggle-border-width', '--toggle-width', '--toggle-radius',
		'--toggle-thumb-color-off', '--toggle-thumb-color-on',
		'--toggle-background-off', '--toggle-background-on',
	];
	for (const v of vars) {
		const val = get(v);
		if (val) container.style.setProperty(v, val);
	}
}

function applyInputTheme(input: HTMLInputElement) {
	const s = getComputedStyle(document.body);
	input.style.backgroundColor = s.getPropertyValue('--background-primary').trim();
	input.style.color = s.getPropertyValue('--text-normal').trim();
	input.style.borderColor = s.getPropertyValue('--background-modifier-border').trim();
}
