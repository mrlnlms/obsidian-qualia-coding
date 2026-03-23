/**
 * detailMarkerRenderer — Renders the marker-focused detail mode for BaseCodeDetailView.
 *
 * Shows detail for a single marker: text blockquote, file reference,
 * memo, color override, code chips, and delete button.
 */

import { setIcon } from 'obsidian';
import type { BaseMarker, SidebarModelInterface } from './types';
import { renderBackButton } from './detailCodeRenderer';
import { getCodeIds } from './codeApplicationHelpers';

export interface MarkerRendererCallbacks {
	getMarkerText(marker: BaseMarker): string | null;
	navigateToMarker(marker: BaseMarker): void;
	shortenPath(fileId: string): string;
	showList(): void;
	showCodeDetail(codeId: string): void;
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
	codeId: string,
	model: SidebarModelInterface,
	callbacks: MarkerRendererCallbacks,
): void {
	const codeDef = model.registry.getById(codeId);
	const codeName = codeDef?.name ?? codeId;
	renderBackButton(container, codeName, () => callbacks.showCodeDetail(codeId));

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

	// -- Magnitude per code --
	renderMagnitudePerCode(container, marker, model);

	// -- Segment color override --
	renderColorSection(container, marker, model, callbacks);

	// -- Codes on this segment --
	if (marker.codes.length > 0) {
		renderCodesSection(container, marker, codeId, model, callbacks);
	}

	// -- Delete segment --
	renderDeleteSegmentButton(container, marker, codeId, model, callbacks);
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

function renderMagnitudePerCode(
	container: HTMLElement,
	marker: BaseMarker,
	model: SidebarModelInterface,
) {
	// Only show if any code on this marker has magnitude defined
	const codesWithMag = marker.codes
		.map(ca => ({ ca, def: model.registry.getById(ca.codeId) }))
		.filter(c => c.def?.magnitude && c.def.magnitude.values.length > 0);

	if (codesWithMag.length === 0) return;

	const rebuildChips = (chipContainer: HTMLElement, ca: { codeId: string; magnitude?: string }, def: { magnitude?: { type: string; values: string[] }; color: string; name: string }) => {
		chipContainer.empty();
		for (const v of def.magnitude!.values) {
			const c = chipContainer.createEl('span', {
				cls: 'codemarker-detail-magnitude-chip',
				text: v,
			});
			if (v === ca.magnitude) c.addClass('is-selected');
			c.addEventListener('click', () => {
				ca.magnitude = v === ca.magnitude ? undefined : v;
				marker.updatedAt = Date.now();
				model.saveMarkers();
				rebuildChips(chipContainer, ca, def);
			});
		}
	};

	const section = container.createDiv({ cls: 'codemarker-detail-section' });
	section.createEl('h6', { text: 'Magnitude' });

	for (const { ca, def } of codesWithMag) {
		const row = section.createDiv({ cls: 'codemarker-detail-magnitude-row' });
		const swatch = row.createSpan({ cls: 'codemarker-detail-chip-dot' });
		swatch.style.backgroundColor = def!.color;
		row.createSpan({ text: def!.name, cls: 'codemarker-detail-magnitude-code-name' });

		const chipContainer = row.createDiv({ cls: 'codemarker-detail-magnitude-chips' });
		rebuildChips(chipContainer, ca, def!);
	}
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

	const inheritedColor = model.registry.getColorForCodeIds(getCodeIds(marker.codes)) ?? '#888';
	const currentColor = marker.colorOverride ?? inheritedColor;

	const swatch = colorRow.createSpan({ cls: 'codemarker-detail-swatch codemarker-detail-swatch-editable' });
	swatch.style.backgroundColor = currentColor;
	swatch.title = 'Change segment color';
	const colorInput = colorRow.createEl('input', {
		cls: 'codemarker-detail-color-input',
		attr: { type: 'color', value: currentColor },
	});
	let refreshSuspended = false;
	swatch.addEventListener('click', (e) => {
		e.stopPropagation();
		if (!refreshSuspended) {
			callbacks.suspendRefresh();
			refreshSuspended = true;
		}
		colorInput.click();
	});
	colorInput.addEventListener('input', () => {
		swatch.style.backgroundColor = colorInput.value;
		resetBtn.style.display = '';
		model.updateMarkerFields(marker.id, { colorOverride: colorInput.value });
	});
	// Resume on both change and blur — change may not fire if picker is cancelled on some platforms
	const doResume = () => { if (refreshSuspended) { refreshSuspended = false; callbacks.resumeRefresh(); } };
	colorInput.addEventListener('change', doResume);
	colorInput.addEventListener('blur', doResume);

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
	activeCodeId: string,
	model: SidebarModelInterface,
	callbacks: MarkerRendererCallbacks,
) {
	const codesSection = container.createDiv({ cls: 'codemarker-detail-section' });
	codesSection.createEl('h6', { text: 'Codes' });
	const chipList = codesSection.createDiv({ cls: 'codemarker-detail-chips' });
	for (const ca of marker.codes) {
		const chipDef = model.registry.getById(ca.codeId);
		const chipName = chipDef?.name ?? ca.codeId;
		const codeColor = chipDef?.color ?? '#888';
		const chip = chipList.createEl('span', { cls: 'codemarker-detail-chip' });
		const dot = chip.createSpan({ cls: 'codemarker-detail-chip-dot' });
		dot.style.backgroundColor = codeColor;
		chip.createSpan({ text: chipName });
		if (ca.codeId === activeCodeId) {
			chip.addClass('is-active');
		}
		chip.addEventListener('click', () => {
			callbacks.showCodeDetail(ca.codeId);
		});
	}
}

function renderDeleteSegmentButton(
	container: HTMLElement,
	marker: BaseMarker,
	codeId: string,
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
			if (codeId) callbacks.showCodeDetail(codeId);
			else callbacks.showList();
		});
		cancelBtn.addEventListener('click', () => {
			confirmWrap.remove();
			btn.style.display = '';
		});
	});
}
