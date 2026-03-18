/**
 * detailMarkerRenderer — Renders the marker-focused detail mode for BaseCodeDetailView.
 *
 * Shows detail for a single marker: text blockquote, file reference,
 * memo, color override, code chips, and delete button.
 */

import { setIcon } from 'obsidian';
import type { BaseMarker, SidebarModelInterface } from './types';
import { renderBackButton } from './detailCodeRenderer';

export interface MarkerRendererCallbacks {
	getMarkerText(marker: BaseMarker): string | null;
	navigateToMarker(marker: BaseMarker): void;
	shortenPath(fileId: string): string;
	showList(): void;
	showCodeDetail(codeName: string): void;
	renderCustomSection(container: HTMLElement, marker: BaseMarker): void;
	/** Temporarily suspend/resume model onChange listener during editing. */
	suspendRefresh(): void;
	resumeRefresh(): void;
}

/**
 * Render the marker-focused detail view into the given container.
 */
export function renderMarkerDetail(
	container: HTMLElement,
	markerId: string,
	codeName: string,
	model: SidebarModelInterface,
	callbacks: MarkerRendererCallbacks,
): void {
	renderBackButton(container, codeName, () => callbacks.showCodeDetail(codeName));

	const marker = model.getMarkerById(markerId);
	if (!marker) {
		container.createEl('p', { text: 'Marker not found.', cls: 'codemarker-detail-empty' });
		return;
	}

	// -- Text Segment (hero -- first thing you see) --
	const text = callbacks.getMarkerText(marker);
	if (text) {
		const blockquote = container.createEl('blockquote', { cls: 'codemarker-detail-quote' });
		blockquote.createEl('p', { text });
	}

	// -- File ref + reveal link (inline metadata) --
	const segMeta = container.createDiv({ cls: 'codemarker-detail-seg-meta' });
	segMeta.createSpan({ cls: 'codemarker-detail-marker-file', text: callbacks.shortenPath(marker.fileId) });
	segMeta.createSpan({ cls: 'codemarker-detail-seg-sep', text: '\u00b7' });
	const revealLink = segMeta.createSpan({ cls: 'codemarker-detail-reveal-link' });
	const revealIcon = revealLink.createSpan();
	setIcon(revealIcon, 'file-search');
	revealLink.createSpan({ text: 'Reveal' });
	revealLink.addEventListener('click', () => callbacks.navigateToMarker(marker));

	// -- Engine-specific custom section (e.g. audio/video memo) --
	callbacks.renderCustomSection(container, marker);

	// -- Memo --
	renderMemoSection(container, marker, model, callbacks);

	// -- Segment color override --
	renderColorSection(container, marker, model, callbacks);

	// -- Codes on this segment --
	if (marker.codes.length > 0) {
		renderCodesSection(container, marker, codeName, model, callbacks);
	}

	// -- Delete segment --
	renderDeleteSegmentButton(container, marker, codeName, model, callbacks);
}

// ─── Sub-renderers ──────────────────────────────────────

function renderMemoSection(
	container: HTMLElement,
	marker: BaseMarker,
	model: SidebarModelInterface,
	callbacks: MarkerRendererCallbacks,
) {
	const memoSection = container.createDiv({ cls: 'codemarker-detail-section' });
	memoSection.createEl('h6', { text: 'Memo' });
	const memoTextarea = memoSection.createEl('textarea', {
		cls: 'codemarker-detail-memo',
		attr: { placeholder: 'Add a memo...', rows: '3' },
	});
	memoTextarea.value = marker.memo ?? '';
	memoTextarea.addEventListener('input', () => {
		model.updateMarkerFields(marker.id, { memo: memoTextarea.value || undefined });
	});
	memoTextarea.addEventListener('focus', () => {
		callbacks.suspendRefresh();
	});
	memoTextarea.addEventListener('blur', () => {
		callbacks.resumeRefresh();
	});
}

function renderColorSection(
	container: HTMLElement,
	marker: BaseMarker,
	model: SidebarModelInterface,
	callbacks: MarkerRendererCallbacks,
) {
	const colorSection = container.createDiv({ cls: 'codemarker-detail-section' });
	colorSection.createEl('h6', { text: 'Color' });
	const colorRow = colorSection.createDiv({ cls: 'codemarker-detail-color-row' });

	const inheritedColor = model.registry.getColorForCodes(marker.codes) ?? '#888';
	const currentColor = marker.colorOverride ?? inheritedColor;

	const swatch = colorRow.createSpan({ cls: 'codemarker-detail-swatch codemarker-detail-swatch-editable' });
	swatch.style.backgroundColor = currentColor;
	swatch.title = 'Change segment color';
	const colorInput = colorRow.createEl('input', {
		cls: 'codemarker-detail-color-input',
		attr: { type: 'color', value: currentColor },
	});
	swatch.addEventListener('click', (e) => {
		e.stopPropagation();
		callbacks.suspendRefresh();
		colorInput.click();
	});
	colorInput.addEventListener('input', () => {
		swatch.style.backgroundColor = colorInput.value;
		resetBtn.style.display = '';
		model.updateMarkerFields(marker.id, { colorOverride: colorInput.value });
	});
	colorInput.addEventListener('change', () => {
		callbacks.resumeRefresh();
	});

	const resetBtn = colorRow.createEl('button', {
		cls: 'codemarker-detail-color-reset',
		attr: { 'aria-label': 'Reset to code color' },
	});
	setIcon(resetBtn, 'rotate-ccw');
	resetBtn.createSpan({ text: 'Reset' });
	if (!marker.colorOverride) resetBtn.style.display = 'none';
	resetBtn.addEventListener('click', () => {
		swatch.style.backgroundColor = inheritedColor;
		colorInput.value = inheritedColor;
		resetBtn.style.display = 'none';
		model.updateMarkerFields(marker.id, { colorOverride: undefined });
	});
}

function renderCodesSection(
	container: HTMLElement,
	marker: BaseMarker,
	activeCodeName: string,
	model: SidebarModelInterface,
	callbacks: MarkerRendererCallbacks,
) {
	const codesSection = container.createDiv({ cls: 'codemarker-detail-section' });
	codesSection.createEl('h6', { text: 'Codes' });
	const chipList = codesSection.createDiv({ cls: 'codemarker-detail-chips' });
	for (const code of marker.codes) {
		const codeDef = model.registry.getByName(code);
		const codeColor = codeDef?.color ?? '#888';
		const chip = chipList.createEl('span', { cls: 'codemarker-detail-chip' });
		const dot = chip.createSpan({ cls: 'codemarker-detail-chip-dot' });
		dot.style.backgroundColor = codeColor;
		chip.createSpan({ text: code });
		if (code === activeCodeName) {
			chip.addClass('is-active');
		}
		chip.addEventListener('click', () => {
			callbacks.showCodeDetail(code);
		});
	}
}

function renderDeleteSegmentButton(
	container: HTMLElement,
	marker: BaseMarker,
	codeName: string,
	model: SidebarModelInterface,
	callbacks: MarkerRendererCallbacks,
) {
	const section = container.createDiv({ cls: 'codemarker-detail-danger-zone' });
	const btn = section.createEl('button', { cls: 'codemarker-detail-delete-btn' });
	const iconSpan = btn.createSpan({ cls: 'codemarker-detail-delete-icon' });
	setIcon(iconSpan, 'trash-2');
	btn.createSpan({ text: 'Delete Segment' });
	btn.addEventListener('click', () => {
		btn.style.display = 'none';
		const confirmWrap = section.createDiv({ cls: 'codemarker-detail-confirm-wrap' });
		confirmWrap.createSpan({ text: 'Delete this segment? The highlight will be removed from the document.', cls: 'codemarker-detail-confirm-msg' });
		const actions = confirmWrap.createDiv({ cls: 'codemarker-detail-confirm-actions' });
		const confirmBtn = actions.createEl('button', { text: 'Delete', cls: 'mod-warning' });
		const cancelBtn = actions.createEl('button', { text: 'Cancel' });

		confirmBtn.addEventListener('click', () => {
			model.removeMarker(marker.id);
			if (codeName) callbacks.showCodeDetail(codeName);
			else callbacks.showList();
		});
		cancelBtn.addEventListener('click', () => {
			confirmWrap.remove();
			btn.style.display = '';
		});
	});
}
