/**
 * Coding popover menu for PDF text selections.
 * Adapted from codemarker-csv codingMenu.ts.
 */

import { App, TextComponent, ToggleComponent, setIcon } from 'obsidian';
import type { PdfCodingModel } from '../coding/pdfCodingModel';
import type { PdfSelectionResult } from '../pdf/selectionCapture';
import { CodeFormModal } from './codeFormModal';

/**
 * Opens a coding popover menu near the mouse event location.
 * Shows input for new code, toggles for existing codes, and action buttons.
 */
export function openPdfCodingPopover(
	mouseEvent: MouseEvent,
	model: PdfCodingModel,
	selectionResult: PdfSelectionResult,
	onHighlightRefresh: () => void,
	savedPos?: { x: number; y: number },
	app?: App,
): void {
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

	const pos = savedPos ?? { x: mouseEvent.clientX, y: mouseEvent.clientY };

	const rebuild = () => {
		close();
		openPdfCodingPopover(mouseEvent, model, selectionResult, onHighlightRefresh, pos, app);
	};

	// Get or create the marker for this selection
	const getMarker = () =>
		model.findOrCreateMarker(
			selectionResult.file,
			selectionResult.page,
			selectionResult.beginIndex,
			selectionResult.beginOffset,
			selectionResult.endIndex,
			selectionResult.endOffset,
			selectionResult.text,
		);

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
				const marker = getMarker();
				model.addCodeToMarker(marker.id, name);
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
	// Check existing marker WITHOUT creating one — avoids phantom markers
	const existingMarker = model.findExistingMarker(
		selectionResult.file,
		selectionResult.page,
		selectionResult.beginIndex,
		selectionResult.beginOffset,
		selectionResult.endIndex,
		selectionResult.endOffset,
	);
	const activeCodes = existingMarker ? existingMarker.codes : [];

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
			const m = getMarker();
			if (value) {
				model.addCodeToMarker(m.id, codeDef.name);
			} else {
				model.removeCodeFromMarker(m.id, codeDef.name, true);
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
				const m = getMarker();
				model.addCodeToMarker(m.id, name);
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
					const m = getMarker();
					model.addCodeToMarker(m.id, name);
					onHighlightRefresh();
				}).open();
			}),
		);
	}

	container.appendChild(
		createActionItem('Remove All Codes', 'trash', () => {
			if (!existingMarker) return;
			model.removeAllCodesFromMarker(existingMarker.id);
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
