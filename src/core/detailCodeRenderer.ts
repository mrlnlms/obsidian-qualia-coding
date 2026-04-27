/**
 * detailCodeRenderer — Renders the code-focused detail mode for BaseCodeDetailView.
 *
 * Shows all markers for a single code: header with color picker, description,
 * hierarchy (parent/children), flat segment list, file-grouped tree, audit trail, and delete button.
 */

import { App, setIcon, ToggleComponent } from 'obsidian';
import type { BaseMarker, CodeDefinition, SidebarModelInterface } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import { hasCode } from './codeApplicationHelpers';
import { getCountBreakdown } from './hierarchyHelpers';
import { collectAllLabels } from './relationHelpers';
import { renderAddRelationRow } from './relationUI';
import { generateContinuousRange } from './magnitudeRange';

export interface CodeRendererCallbacks {
	getMarkerLabel(marker: BaseMarker): string;
	navigateToMarker(marker: BaseMarker): void;
	shortenPath(fileId: string): string;
	showList(): void;
	showCodeDetail(codeId: string): void;
	setContext(markerId: string, codeId: string): void;
	/** Temporarily suspend/resume model onChange listener during color editing. */
	suspendRefresh(): void;
	resumeRefresh(): void;
	// Groups (Tier 1.5)
	onAddToGroup(codeId: string): void;
	onRemoveFromGroup(codeId: string, groupId: string): void;
}

export interface GroupsSectionCallbacks {
	onAddGroup(codeId: string): void;
	onRemoveGroup(codeId: string, groupId: string): void;
}

export function renderGroupsSection(
	container: HTMLElement,
	codeId: string,
	registry: CodeDefinitionRegistry,
	callbacks: GroupsSectionCallbacks,
): void {
	const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-groups' });

	const header = section.createDiv({ cls: 'codemarker-detail-groups-header' });
	header.createEl('h6', { text: 'Groups' });
	const addBtn = header.createEl('button', {
		cls: 'codemarker-detail-groups-add-btn',
		attr: { 'aria-label': 'Add to group', title: 'Add to group' },
	});
	setIcon(addBtn, 'plus');
	addBtn.addEventListener('click', () => callbacks.onAddGroup(codeId));

	const groups = registry.getGroupsForCode(codeId);
	if (groups.length === 0) return;

	const chipsWrap = section.createDiv({ cls: 'codemarker-detail-groups-chips' });
	for (const g of groups) {
		const chip = chipsWrap.createDiv({ cls: 'codemarker-detail-group-chip' });
		const dot = chip.createSpan({ cls: 'codemarker-detail-group-chip-dot' });
		dot.style.backgroundColor = g.color;
		chip.createSpan({ cls: 'codemarker-detail-group-chip-name', text: g.name });
		const remove = chip.createEl('button', {
			cls: 'codemarker-detail-group-chip-remove',
			attr: { 'aria-label': `Remove from ${g.name}`, title: `Remove from ${g.name}` },
		});
		setIcon(remove, 'x');
		remove.addEventListener('click', () => callbacks.onRemoveGroup(codeId, g.id));
	}

	// Descriptions dos groups (cada uma com bullet do nome)
	const groupsWithDesc = groups.filter(g => g.description);
	if (groupsWithDesc.length > 0) {
		const descList = section.createDiv({ cls: 'codemarker-detail-group-descriptions' });
		for (const g of groupsWithDesc) {
			const row = descList.createDiv({ cls: 'codemarker-detail-group-description-row' });
			const dot = row.createSpan({ cls: 'codemarker-detail-group-description-dot' });
			dot.style.backgroundColor = g.color;
			row.createSpan({ cls: 'codemarker-detail-group-description-name', text: g.name + ': ' });
			row.createSpan({ cls: 'codemarker-detail-group-description-text', text: g.description! });
		}
	}
}

/**
 * Render the code-focused detail view into the given container.
 */
export function renderCodeDetail(
	container: HTMLElement,
	codeId: string,
	model: SidebarModelInterface,
	callbacks: CodeRendererCallbacks,
	app: App,
): void {
	renderBreadcrumb(container, codeId, model.registry, callbacks);

	const def = model.registry.getById(codeId);
	const codeName = def?.name ?? codeId;
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
					.filter(m => hasCode(m.codes, def.id))
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

	// Memo — reflexão analítica processual (separado de description)
	renderCodeMemo(container, def, model, callbacks);

	// Groups (Tier 1.5) — entre Description e Hierarchy
	if (def) {
		renderGroupsSection(container, def.id, model.registry, {
			onAddGroup: callbacks.onAddToGroup,
			onRemoveGroup: callbacks.onRemoveFromGroup,
		});
	}

	// Hierarchy section (parent + children)
	if (def) renderHierarchySection(container, def, model.registry, callbacks);

	// Magnitude config
	if (def) renderMagnitudeConfigSection(container, def, model, callbacks);

	// Relations code-level
	if (def) renderRelationsSection(container, def, model, callbacks, app);

	// All markers with this code (across all files)
	const allMarkers = def
		? model.getAllMarkers().filter(m => hasCode(m.codes, def.id))
		: [];

	if (allMarkers.length === 0) {
		container.createEl('p', { text: 'No segments yet.', cls: 'codemarker-detail-empty' });
		if (def) {
			renderAuditSection(container, def);
			renderDeleteCodeButton(container, codeId, codeName, model, callbacks);
		}
		return;
	}

	// Segment count — hierarchy-aware
	const segSection = container.createDiv({ cls: 'codemarker-detail-section' });
	const children = model.registry.getChildren(codeId);
	if (children.length > 0) {
		const breakdown = getCountBreakdown(codeId, model.registry, model.getAllMarkers());
		segSection.createEl('h6', {
			text: `Segments (${breakdown.direct} diretos \u00b7 ${breakdown.withChildren} com filhos)`,
		});
	} else {
		segSection.createEl('h6', { text: `Segments (${allMarkers.length})` });
	}

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

		// Click item -> drill-down to marker-focused detail (no navigation)
		li.addEventListener('click', () => {
			callbacks.setContext(marker.id, codeId);
		});
		li.addEventListener('mouseenter', () => {
			model.setHoverState(marker.id, codeName);
		});
		li.addEventListener('mouseleave', () => {
			model.setHoverState(null, null);
		});
	}

	// Segments by file (tree grouped by file)
	renderSegmentsByFile(container, allMarkers, codeId, codeName, model, callbacks);

	// Audit trail (mergedFrom)
	if (def) renderAuditSection(container, def);

	// Delete code — at the bottom, after all content
	if (def) {
		renderDeleteCodeButton(container, codeId, codeName, model, callbacks);
	}
}

// ─── Segments by File (tree in code-focused detail) ─────

function renderSegmentsByFile(
	container: HTMLElement,
	allMarkers: BaseMarker[],
	codeId: string,
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
				callbacks.setContext(marker.id, codeId);
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
	let descSaveTimer: ReturnType<typeof setTimeout> | null = null;
	textarea.addEventListener('input', () => {
		if (!def) return;
		if (descSaveTimer) clearTimeout(descSaveTimer);
		descSaveTimer = setTimeout(() => {
			descSaveTimer = null;
			const val = textarea.value.trim() || undefined;
			model.registry.update(def.id, { description: val });
			model.saveMarkers();
		}, 500);
	});
	textarea.addEventListener('focus', () => {
		callbacks.suspendRefresh();
	});
	textarea.addEventListener('blur', () => {
		callbacks.resumeRefresh();
	});
}

function renderCodeMemo(
	container: HTMLElement,
	def: CodeDefinition | undefined,
	model: SidebarModelInterface,
	callbacks: CodeRendererCallbacks,
) {
	const memoSection = container.createDiv({ cls: 'codemarker-detail-section' });
	memoSection.createEl('h6', { text: 'Memo' });
	const textarea = memoSection.createEl('textarea', {
		cls: 'codemarker-detail-memo',
		attr: { placeholder: 'Reflexão analítica…', rows: '3' },
	});
	textarea.value = def?.memo ?? '';
	let memoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	textarea.addEventListener('input', () => {
		if (!def) return;
		if (memoSaveTimer) clearTimeout(memoSaveTimer);
		memoSaveTimer = setTimeout(() => {
			memoSaveTimer = null;
			const val = textarea.value.trim() || undefined;
			model.registry.update(def.id, { memo: val });
			model.saveMarkers();
		}, 500);
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
	codeId: string,
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
			model.deleteCode(codeId);
			callbacks.showList();
		});
		cancelBtn.addEventListener('click', () => {
			confirmWrap.remove();
			btn.style.display = '';
		});
	});
}

// ─── Breadcrumb ─────────────────────────────────────────

/**
 * Render hierarchy-aware breadcrumb: ← Codebook › Parent Name
 * Current code name is shown in the header below, not repeated here.
 */
export function renderBreadcrumb(
	container: HTMLElement,
	codeId: string,
	registry: CodeDefinitionRegistry,
	callbacks: Pick<CodeRendererCallbacks, 'showList' | 'showCodeDetail'>,
): void {
	const nav = container.createDiv({ cls: 'codemarker-detail-breadcrumb' });

	// ← Codebook (always)
	const rootLink = nav.createSpan({ cls: 'codemarker-detail-breadcrumb-link' });
	const icon = rootLink.createSpan();
	setIcon(icon, 'arrow-left');
	rootLink.createSpan({ text: 'Codebook' });
	rootLink.addEventListener('click', () => callbacks.showList());

	// › Parent (if has parent)
	const def = registry.getById(codeId);
	if (def?.parentId) {
		const parentDef = registry.getById(def.parentId);
		if (parentDef) {
			nav.createSpan({ cls: 'codemarker-detail-breadcrumb-sep', text: '\u203a' });
			const parentLink = nav.createSpan({
				cls: 'codemarker-detail-breadcrumb-link',
				text: parentDef.name,
			});
			parentLink.addEventListener('click', () => callbacks.showCodeDetail(parentDef.id));
		}
	}
}

/** Render the back-navigation button. Exported for use by marker renderer too. */
export function renderBackButton(container: HTMLElement, label?: string, callback?: () => void) {
	const back = container.createDiv({ cls: 'codemarker-detail-back' });
	back.setAttribute('aria-label', `Back to ${label ?? 'All Codes'}`);
	const icon = back.createSpan();
	setIcon(icon, 'arrow-left');
	back.createSpan({ text: label ?? 'All Codes' });
	back.addEventListener('click', () => {
		if (callback) callback();
	});
}

// ─── Hierarchy section ──────────────────────────────────

function renderHierarchySection(
	container: HTMLElement,
	def: CodeDefinition,
	registry: CodeDefinitionRegistry,
	callbacks: Pick<CodeRendererCallbacks, 'showCodeDetail'>,
): void {
	const parentDef = def.parentId ? registry.getById(def.parentId) : undefined;
	const children = registry.getChildren(def.id);

	// Only render if there is hierarchy to show
	if (!parentDef && children.length === 0) return;

	const section = container.createDiv({ cls: 'codemarker-detail-section' });
	section.createEl('h6', { text: 'Hierarchy' });

	if (parentDef) {
		const parentRow = section.createDiv({ cls: 'codemarker-detail-hierarchy-row' });
		parentRow.createSpan({ cls: 'codemarker-detail-hierarchy-label', text: 'Parent:' });
		const parentLink = parentRow.createSpan({ cls: 'codemarker-detail-hierarchy-link' });
		const dot = parentLink.createSpan({ cls: 'codemarker-detail-chip-dot' });
		dot.style.backgroundColor = parentDef.color;
		parentLink.createSpan({ text: parentDef.name });
		parentLink.addEventListener('click', () => callbacks.showCodeDetail(parentDef.id));
	}

	if (children.length > 0) {
		const childRow = section.createDiv({ cls: 'codemarker-detail-hierarchy-row' });
		childRow.createSpan({ cls: 'codemarker-detail-hierarchy-label', text: 'Children:' });
		const chips = childRow.createDiv({ cls: 'codemarker-detail-chips' });
		for (const child of children) {
			const chip = chips.createEl('span', { cls: 'codemarker-detail-chip' });
			const dot = chip.createSpan({ cls: 'codemarker-detail-chip-dot' });
			dot.style.backgroundColor = child.color;
			chip.createSpan({ text: child.name });
			chip.addEventListener('click', () => callbacks.showCodeDetail(child.id));
		}
	}
}

// ─── Magnitude config section ────────────────────────────

function renderMagnitudeConfigSection(
	container: HTMLElement,
	def: CodeDefinition,
	model: SidebarModelInterface,
	callbacks: Pick<CodeRendererCallbacks, 'suspendRefresh' | 'resumeRefresh'>,
): void {
	const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-magnitude-config' });

	// Header: "Magnitude" with toggle
	const headerRow = section.createDiv({ cls: 'codemarker-detail-magnitude-header' });
	headerRow.createEl('h6', { text: 'Magnitude' });

	const enabled = !!def.magnitude;

	const toggleEl = new ToggleComponent(headerRow);
	toggleEl.setValue(enabled);

	// Config body (only if enabled)
	const body = section.createDiv({ cls: 'codemarker-detail-magnitude-body' });
	body.style.display = enabled ? '' : 'none';

	const saveMagnitude = () => {
		def.updatedAt = Date.now();
		model.registry.update(def.id, { magnitude: def.magnitude });
		model.saveMarkers();
	};

	const renderBody = () => {
		body.empty();
		if (!def.magnitude) return;

		// Type selector
		const typeRow = body.createDiv({ cls: 'codemarker-detail-magnitude-type-row' });
		typeRow.createSpan({ text: 'Type:', cls: 'codemarker-detail-magnitude-label' });
		const select = typeRow.createEl('select', { cls: 'dropdown codemarker-detail-magnitude-select' });
		for (const t of ['nominal', 'ordinal', 'continuous'] as const) {
			const opt = select.createEl('option', { text: t, attr: { value: t } });
			if (t === def.magnitude.type) opt.selected = true;
		}
		select.addEventListener('change', () => {
			if (!def.magnitude) return;
			def.magnitude.type = select.value as 'nominal' | 'ordinal' | 'continuous';
			def.magnitude.values = []; // clear values on type change
			saveMagnitude();
			renderBody();
		});

		// Type-specific value editor
		if (def.magnitude.type === 'continuous') {
			renderContinuousEditor(body, def, saveMagnitude, renderBody, callbacks);
		} else {
			renderChipEditor(body, def, def.magnitude.type === 'ordinal', saveMagnitude, renderBody, callbacks);
		}
	};

	function renderChipEditor(
		parent: HTMLElement,
		def: CodeDefinition,
		showOrder: boolean,
		save: () => void,
		rerender: () => void,
		cb: Pick<CodeRendererCallbacks, 'suspendRefresh' | 'resumeRefresh'>,
	) {
		const label = showOrder ? 'Levels (in order):' : 'Categories:';
		const placeholder = showOrder ? 'Add level...' : 'Add category...';

		const valuesSection = parent.createDiv({ cls: 'codemarker-detail-magnitude-values' });
		valuesSection.createSpan({ text: label, cls: 'codemarker-detail-magnitude-label' });

		const chipList = valuesSection.createDiv({ cls: 'codemarker-detail-chips' });
		for (let i = 0; i < def.magnitude!.values.length; i++) {
			const val = def.magnitude!.values[i];
			const chip = chipList.createEl('span', { cls: 'codemarker-detail-chip codemarker-detail-magnitude-value-chip' });
			if (showOrder) chip.createSpan({ text: `${i + 1}. `, cls: 'codemarker-detail-magnitude-order' });
			chip.createSpan({ text: val });
			const removeBtn = chip.createSpan({ cls: 'codemarker-detail-magnitude-remove' });
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (!def.magnitude) return;
				def.magnitude.values = def.magnitude.values.filter(v => v !== val);
				save();
				rerender();
			});
		}

		const addRow = valuesSection.createDiv({ cls: 'codemarker-detail-magnitude-add-row' });
		const addInput = addRow.createEl('input', {
			cls: 'codemarker-detail-magnitude-add-input',
			attr: { type: 'text', placeholder },
		});
		addInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const val = addInput.value.trim();
				if (!val || !def.magnitude) return;
				if (def.magnitude.values.includes(val)) return;
				def.magnitude.values.push(val);
				save();
				rerender();
			}
			e.stopPropagation();
		});
		addInput.addEventListener('focus', () => cb.suspendRefresh());
		addInput.addEventListener('blur', () => cb.resumeRefresh());
	}

	function renderContinuousEditor(
		parent: HTMLElement,
		def: CodeDefinition,
		save: () => void,
		rerender: () => void,
		cb: Pick<CodeRendererCallbacks, 'suspendRefresh' | 'resumeRefresh'>,
	) {
		const valuesSection = parent.createDiv({ cls: 'codemarker-detail-magnitude-values' });
		valuesSection.createSpan({ text: 'Scale points:', cls: 'codemarker-detail-magnitude-label' });

		// Quick-fill: min, max, step → generate
		const quickFill = valuesSection.createDiv({ cls: 'codemarker-detail-magnitude-quickfill' });
		const minInput = quickFill.createEl('input', {
			cls: 'codemarker-detail-magnitude-range-input',
			attr: { type: 'number', placeholder: 'Min', step: 'any' },
		});
		const maxInput = quickFill.createEl('input', {
			cls: 'codemarker-detail-magnitude-range-input',
			attr: { type: 'number', placeholder: 'Max', step: 'any' },
		});
		const stepInput = quickFill.createEl('input', {
			cls: 'codemarker-detail-magnitude-range-input',
			attr: { type: 'number', placeholder: 'Step', step: 'any', value: '1' },
		});
		const genBtn = quickFill.createEl('button', { text: 'Generate', cls: 'codemarker-detail-magnitude-gen-btn' });
		genBtn.addEventListener('click', () => {
			if (!def.magnitude) return;
			const values = generateContinuousRange(minInput.value, maxInput.value, stepInput.value);
			if (!values) return;
			def.magnitude.values = values;
			save();
			rerender();
		});

		// Prevent popover/panel refresh during input
		for (const inp of [minInput, maxInput, stepInput]) {
			inp.addEventListener('focus', () => cb.suspendRefresh());
			inp.addEventListener('blur', () => cb.resumeRefresh());
			inp.addEventListener('keydown', (e) => e.stopPropagation());
		}

		// Show current values as chips (editable)
		if (def.magnitude!.values.length > 0) {
			const chipList = valuesSection.createDiv({ cls: 'codemarker-detail-chips' });
			for (const val of def.magnitude!.values) {
				const chip = chipList.createEl('span', { cls: 'codemarker-detail-chip codemarker-detail-magnitude-value-chip' });
				chip.createSpan({ text: val });
				const removeBtn = chip.createSpan({ cls: 'codemarker-detail-magnitude-remove' });
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					if (!def.magnitude) return;
					def.magnitude.values = def.magnitude.values.filter(v => v !== val);
					save();
					rerender();
				});
			}
		}

		// Also allow individual add
		const addRow = valuesSection.createDiv({ cls: 'codemarker-detail-magnitude-add-row' });
		const addInput = addRow.createEl('input', {
			cls: 'codemarker-detail-magnitude-add-input',
			attr: { type: 'text', placeholder: 'Add scale point...' },
		});
		addInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const val = addInput.value.trim();
				if (!val || !def.magnitude) return;
				if (def.magnitude.values.includes(val)) return;
				def.magnitude.values.push(val);
				save();
				rerender();
			}
			e.stopPropagation();
		});
		addInput.addEventListener('focus', () => cb.suspendRefresh());
		addInput.addEventListener('blur', () => cb.resumeRefresh());
	}

	toggleEl.onChange((value) => {
		if (value) {
			model.registry.update(def.id, { magnitude: { type: 'nominal', values: [] } });
		} else {
			// Clear magnitude from all markers that use this code
			for (const marker of model.getAllMarkers()) {
				const ca = marker.codes.find(c => c.codeId === def.id);
				if (ca?.magnitude !== undefined) {
					ca.magnitude = undefined;
					marker.updatedAt = Date.now();
				}
			}
			model.registry.update(def.id, { magnitude: undefined });
		}
		model.saveMarkers();
		body.style.display = value ? '' : 'none';
		// Re-read def since update() modified it
		const updated = model.registry.getById(def.id);
		if (updated) Object.assign(def, updated);
		renderBody();
	});

	if (enabled) renderBody();
}

// ─── Relations section ───────────────────────────────────

function renderRelationsSection(
	container: HTMLElement,
	def: CodeDefinition,
	model: SidebarModelInterface,
	callbacks: Pick<CodeRendererCallbacks, 'showCodeDetail' | 'suspendRefresh' | 'resumeRefresh'>,
	app: App,
): void {
	const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-relations' });

	const headerRow = section.createDiv({ cls: 'codemarker-detail-relations-header' });
	headerRow.createEl('h6', { text: 'Relations' });

	const body = section.createDiv({ cls: 'codemarker-detail-relations-body' });

	const saveRelations = () => {
		model.registry.update(def.id, { relations: def.relations && def.relations.length > 0 ? def.relations : undefined });
		model.saveMarkers();
	};

	const allLabels = collectAllLabels(model.registry.getAll(), model.getAllMarkers());

	const renderRows = () => {
		body.empty();
		const currentRelations = def.relations ?? [];

		for (const rel of currentRelations) {
			const row = body.createDiv({ cls: 'codemarker-detail-relation-row' });

			const dirIcon = row.createSpan({ cls: 'codemarker-detail-relation-dir' });
			setIcon(dirIcon, rel.directed ? 'arrow-right' : 'minus');
			dirIcon.title = rel.directed ? 'Directed' : 'Symmetric';

			row.createSpan({ cls: 'codemarker-detail-relation-label', text: rel.label });

			const targetDef = model.registry.getById(rel.target);
			if (targetDef) {
				const chip = row.createSpan({ cls: 'codemarker-detail-chip' });
				const dot = chip.createSpan({ cls: 'codemarker-detail-chip-dot' });
				dot.style.backgroundColor = targetDef.color;
				chip.createSpan({ text: targetDef.name });
				chip.addEventListener('click', () => callbacks.showCodeDetail(targetDef.id));
			} else {
				row.createSpan({ cls: 'codemarker-detail-relation-target-missing', text: '(deleted)' });
			}

			const removeBtn = row.createSpan({ cls: 'codemarker-detail-magnitude-remove' });
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (!def.relations) return;
				def.relations = def.relations.filter(r => !(r.label === rel.label && r.target === rel.target));
				saveRelations();
				renderRows();
			});
		}

		renderAddRelationRow(body, def, model.registry, allLabels, () => {
			saveRelations();
			renderRows();
		}, callbacks, app);
	};

	renderRows();
}

// ─── Audit section ──────────────────────────────────────

function renderAuditSection(container: HTMLElement, def: CodeDefinition): void {
	const hasMerged = def.mergedFrom && def.mergedFrom.length > 0;
	if (!hasMerged) return;

	const section = container.createDiv({ cls: 'codemarker-detail-section' });
	section.createEl('h6', { text: 'Audit' });
	section.createEl('p', {
		text: `Merged from ${def.mergedFrom!.length} code(s)`,
		cls: 'codemarker-detail-audit-text',
	});
	if (def.createdAt) {
		section.createEl('p', {
			text: `Created: ${new Date(def.createdAt).toLocaleDateString()}`,
			cls: 'codemarker-detail-audit-text',
		});
	}
}
