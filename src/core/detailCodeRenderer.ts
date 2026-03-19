/**
 * detailCodeRenderer — Renders the code-focused detail mode for BaseCodeDetailView.
 *
 * Shows all markers for a single code: header with color picker, description,
 * flat segment list, file-grouped tree, and delete button.
 */

import { setIcon } from 'obsidian';
import type { BaseMarker, CodeDefinition, SidebarModelInterface } from './types';

export interface CodeRendererCallbacks {
	getMarkerLabel(marker: BaseMarker): string;
	navigateToMarker(marker: BaseMarker): void;
	shortenPath(fileId: string): string;
	showList(): void;
	showCodeDetail(codeName: string): void;
	setContext(markerId: string, codeName: string): void;
	autoRevealOnSegmentClick: boolean;
	/** Temporarily suspend/resume model onChange listener during color editing. */
	suspendRefresh(): void;
	resumeRefresh(): void;
}

/**
 * Render the code-focused detail view into the given container.
 */
export function renderCodeDetail(
	container: HTMLElement,
	codeName: string,
	model: SidebarModelInterface,
	callbacks: CodeRendererCallbacks,
): void {
	renderBackButton(container, undefined, () => callbacks.showList());

	const def = model.registry.getByName(codeName);
	const color = def?.color ?? '#888';

	// Header: swatch (clickable color picker) + code name
	const header = container.createDiv({ cls: 'codemarker-detail-header' });
	const swatch = header.createSpan({ cls: 'codemarker-detail-swatch codemarker-detail-swatch-editable' });
	swatch.style.backgroundColor = color;
	swatch.title = 'Change color';

	// Hidden color input behind swatch
	if (def) {
		const colorInput = header.createEl('input', {
			cls: 'codemarker-detail-color-input',
			attr: { type: 'color', value: color },
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
			const newColor = colorInput.value;
			swatch.style.backgroundColor = newColor;
			model.registry.update(def.id, { color: newColor });
			model.saveMarkers();
			const affectedFiles = new Set(
				model.getAllMarkers()
					.filter(m => m.codes.includes(codeName))
					.map(m => m.fileId)
			);
			for (const fileId of affectedFiles) {
				model.updateDecorations(fileId);
			}
		});
		// Resume on both change and blur — change may not fire if picker is cancelled on some platforms
		const doResume = () => { if (refreshSuspended) { refreshSuspended = false; callbacks.resumeRefresh(); } };
		colorInput.addEventListener('change', doResume);
		colorInput.addEventListener('blur', doResume);
	}

	header.createSpan({ text: codeName, cls: 'codemarker-detail-title' });

	// Description — editable textarea
	renderCodeDescription(container, def, model, callbacks);

	// All markers with this code (across all files)
	const allMarkers = model.getAllMarkers()
		.filter(m => m.codes.includes(codeName));

	if (allMarkers.length === 0) {
		container.createEl('p', { text: 'No segments yet.', cls: 'codemarker-detail-empty' });
		if (def) renderDeleteCodeButton(container, def.name, model, callbacks);
		return;
	}

	const segSection = container.createDiv({ cls: 'codemarker-detail-section' });
	segSection.createEl('h6', { text: `Segments (${allMarkers.length})` });

	const list = segSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
	for (const marker of allMarkers) {
		const label = callbacks.getMarkerLabel(marker);

		const li = list.createEl('li', { cls: 'codemarker-detail-marker-item' });
		li.dataset.markerId = marker.id;

		// File reference + navigate icon row
		const fileRow = li.createDiv({ cls: 'codemarker-detail-marker-file-row' });
		fileRow.createSpan({ cls: 'codemarker-detail-marker-file', text: callbacks.shortenPath(marker.fileId) });

		// Navigate-to-document icon
		const navIcon = fileRow.createSpan({ cls: 'codemarker-detail-nav-icon' });
		setIcon(navIcon, 'file-search');
		navIcon.title = 'Reveal in document';
		navIcon.addEventListener('click', (e) => {
			e.stopPropagation();
			callbacks.navigateToMarker(marker);
		});

		// Text preview
		li.createEl('span', { text: label });

		// Click item -> open marker-focused detail (+ navigate if enabled)
		li.addEventListener('click', () => {
			if (callbacks.autoRevealOnSegmentClick) callbacks.navigateToMarker(marker);
			callbacks.setContext(marker.id, codeName);
		});
		li.addEventListener('mouseenter', () => {
			model.setHoverState(marker.id, codeName);
		});
		li.addEventListener('mouseleave', () => {
			model.setHoverState(null, null);
		});
	}

	// Segments by file (tree grouped by file)
	renderSegmentsByFile(container, allMarkers, codeName, model, callbacks);

	// Delete code — at the bottom, after all content
	if (def) {
		renderDeleteCodeButton(container, def.name, model, callbacks);
	}
}

// ─── Segments by File (tree in code-focused detail) ─────

function renderSegmentsByFile(
	container: HTMLElement,
	allMarkers: BaseMarker[],
	codeName: string,
	model: SidebarModelInterface,
	callbacks: CodeRendererCallbacks,
) {
	// Group markers by fileId
	const byFile = new Map<string, BaseMarker[]>();
	for (const marker of allMarkers) {
		const arr = byFile.get(marker.fileId);
		if (arr) arr.push(marker);
		else byFile.set(marker.fileId, [marker]);
	}

	const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-file-tree' });
	section.createEl('h6', { text: `Segments by file` });

	const treeRoot = section.createDiv({ cls: 'search-results-container' });

	for (const [fileId, markers] of byFile) {
		const fileName = callbacks.shortenPath(fileId);

		// File group
		const fileTreeItem = treeRoot.createDiv({ cls: 'tree-item search-result' });
		const fileSelf = fileTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });

		fileSelf.createDiv({ cls: 'tree-item-icon collapse-icon' }, (el) => setIcon(el, 'right-triangle'));
		fileSelf.createSpan({ cls: 'tree-item-inner', text: fileName });
		fileSelf.createSpan({ cls: 'tree-item-flair', text: String(markers.length) });

		const fileChildren = fileTreeItem.createDiv({ cls: 'search-result-file-matches' });

		for (const marker of markers) {
			const label = callbacks.getMarkerLabel(marker);
			const matchEl = fileChildren.createDiv({ cls: 'search-result-file-match' });
			matchEl.dataset.markerId = marker.id;
			matchEl.textContent = label;
			matchEl.addEventListener('click', () => {
				if (callbacks.autoRevealOnSegmentClick) callbacks.navigateToMarker(marker);
				callbacks.setContext(marker.id, codeName);
			});
			matchEl.addEventListener('mouseenter', () => {
				model.setHoverState(marker.id, codeName);
			});
			matchEl.addEventListener('mouseleave', () => {
				model.setHoverState(null, null);
			});
		}

		// Collapse toggle (local, no shared state needed)
		let collapsed = false;
		fileSelf.addEventListener('click', () => {
			collapsed = !collapsed;
			fileChildren.style.display = collapsed ? 'none' : '';
			fileTreeItem.toggleClass('is-collapsed', collapsed);
		});
	}
}

// ─── Shared sub-renderers ───────────────────────────────

function renderCodeDescription(
	container: HTMLElement,
	def: CodeDefinition | undefined,
	model: SidebarModelInterface,
	callbacks: CodeRendererCallbacks,
) {
	const descSection = container.createDiv({ cls: 'codemarker-detail-section' });
	descSection.createEl('h6', { text: 'Description' });
	const textarea = descSection.createEl('textarea', {
		cls: 'codemarker-detail-memo',
		attr: { placeholder: 'Add a description...', rows: '2' },
	});
	textarea.value = def?.description ?? '';
	textarea.addEventListener('input', () => {
		if (!def) return;
		const val = textarea.value.trim() || undefined;
		model.registry.update(def.id, { description: val });
		model.saveMarkers();
	});
	textarea.addEventListener('focus', () => {
		callbacks.suspendRefresh();
	});
	textarea.addEventListener('blur', () => {
		callbacks.resumeRefresh();
	});
}

function renderDeleteCodeButton(
	container: HTMLElement,
	codeName: string,
	model: SidebarModelInterface,
	callbacks: CodeRendererCallbacks,
) {
	const section = container.createDiv({ cls: 'codemarker-detail-danger-zone' });
	const btn = section.createEl('button', { cls: 'codemarker-detail-delete-btn' });
	const iconSpan = btn.createSpan({ cls: 'codemarker-detail-delete-icon' });
	setIcon(iconSpan, 'trash-2');
	btn.createSpan({ text: `Delete "${codeName}"` });
	btn.addEventListener('click', () => {
		btn.style.display = 'none';
		const confirmWrap = section.createDiv({ cls: 'codemarker-detail-confirm-wrap' });
		confirmWrap.createSpan({ text: `Delete "${codeName}" and remove from all markers?`, cls: 'codemarker-detail-confirm-msg' });
		const actions = confirmWrap.createDiv({ cls: 'codemarker-detail-confirm-actions' });
		const confirmBtn = actions.createEl('button', { text: 'Delete', cls: 'mod-warning' });
		const cancelBtn = actions.createEl('button', { text: 'Cancel' });

		confirmBtn.addEventListener('click', () => {
			model.deleteCode(codeName);
			callbacks.showList();
		});
		cancelBtn.addEventListener('click', () => {
			confirmWrap.remove();
			btn.style.display = '';
		});
	});
}

// ─── Shared: back button ────────────────────────────────

/** Render the back-navigation button. Exported for use by marker renderer too. */
export function renderBackButton(container: HTMLElement, label?: string, callback?: () => void) {
	const back = container.createDiv({ cls: 'codemarker-detail-back' });
	const icon = back.createSpan();
	setIcon(icon, 'arrow-left');
	back.createSpan({ text: label ?? 'All Codes' });
	back.addEventListener('click', () => {
		if (callback) callback();
	});
}
