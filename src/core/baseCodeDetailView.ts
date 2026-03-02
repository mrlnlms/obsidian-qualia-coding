/**
 * BaseCodeDetailView — Abstract base for Code Detail sidebar views.
 *
 * Shared across all engines: 3 navigation modes (list, code-focused, marker-focused),
 * search filter, back navigation, onChange auto-refresh.
 *
 * Engine subclasses implement hooks:
 *   - getMarkerLabel(marker) — truncated text / time range / page ref
 *   - getMarkerText(marker) — full text for blockquote (null if unavailable)
 *   - navigateToMarker(marker) — scroll / seek / open file
 *   - shortenPath(fileId) — strip .md / .csv / etc.
 *   - renderCustomSection(container, marker) — optional extra section (e.g. memo)
 */

import { ItemView, WorkspaceLeaf, setIcon, SearchComponent } from 'obsidian';
import { BaseMarker, SidebarModelInterface } from './types';

export abstract class BaseCodeDetailView extends ItemView {
	protected model: SidebarModelInterface;
	protected markerId: string | null = null;
	protected codeName: string | null = null;

	/** Whether clicking a segment also navigates to the marker in the document. */
	protected get autoRevealOnSegmentClick(): boolean {
		return this.model.getAutoRevealOnSegmentClick?.() ?? true;
	}
	private searchQuery = '';
	private searchTimeout: ReturnType<typeof setTimeout> | null = null;
	private boundRefresh = () => this.refreshCurrentMode();
	private boundApplyHover = () => this.applyHoverToItems();

	// Persistent DOM for list mode (search survives refreshes)
	private listSearchWrap: HTMLElement | null = null;
	private listContentZone: HTMLElement | null = null;
	private listMode = false;

	constructor(leaf: WorkspaceLeaf, model: SidebarModelInterface) {
		super(leaf);
		this.model = model;
	}

	// ─── Abstract hooks (engine implements) ──────────────────

	abstract getMarkerLabel(marker: BaseMarker): string;
	abstract getMarkerText(marker: BaseMarker): string | null;
	abstract navigateToMarker(marker: BaseMarker): void;
	abstract shortenPath(fileId: string): string;

	/** Optional hook — override to add engine-specific sections (e.g. memo textarea). */
	protected renderCustomSection(_container: HTMLElement, _marker: BaseMarker): void {}

	// ─── ItemView lifecycle ──────────────────────────────────

	getIcon(): string {
		return 'tag';
	}

	async onOpen() {
		this.contentEl.addClass('codemarker-detail-panel');
		this.model.onChange(this.boundRefresh);
		this.model.onHoverChange(this.boundApplyHover);
		this.refreshCurrentMode();
	}

	async onClose() {
		this.model.offChange(this.boundRefresh);
		this.model.offHoverChange(this.boundApplyHover);
		this.contentEl.empty();
	}

	// ─── Navigation API ─────────────────────────────────────

	/** Navigate to the list of all codes */
	showList() {
		this.markerId = null;
		this.codeName = null;
		(this.leaf as any).updateHeader?.();
		this.renderList();
	}

	/** Navigate to a code-focused detail (all markers for a code) */
	showCodeDetail(codeName: string) {
		this.markerId = null;
		this.codeName = codeName;
		(this.leaf as any).updateHeader?.();
		this.renderCodeDetail();
	}

	/** Set context to a specific marker + code (marker-focused detail) */
	setContext(markerId: string, codeName: string) {
		this.markerId = markerId;
		this.codeName = codeName;
		(this.leaf as any).updateHeader?.();
		this.renderMarkerDetail();
	}

	getDisplayText(): string {
		if (this.codeName) return this.codeName;
		return 'Code Detail';
	}

	// ─── Refresh routing ────────────────────────────────────

	protected refreshCurrentMode() {
		if (this.markerId && this.codeName) {
			this.renderMarkerDetail();
		} else if (this.codeName) {
			this.renderCodeDetail();
		} else {
			// In list mode, only rebuild the list content (preserve search input)
			if (this.listMode && this.listContentZone) {
				this.renderListContent();
			} else {
				this.renderList();
			}
		}
	}

	// ─── List Mode ──────────────────────────────────────────

	private renderList() {
		const container = this.contentEl;
		container.empty();
		this.listMode = true;

		const codes = this.model.registry.getAll();
		const counts = this.countSegmentsPerCode();

		// Header
		const header = container.createDiv({ cls: 'codemarker-explorer-header' });
		header.createSpan({ text: 'All Codes', cls: 'codemarker-explorer-title' });
		header.createSpan({ text: `${codes.length}`, cls: 'codemarker-explorer-count' });

		if (codes.length === 0) {
			container.createEl('p', { text: 'No codes yet.', cls: 'codemarker-detail-empty' });
			this.listSearchWrap = null;
			this.listContentZone = null;
			return;
		}

		// Search input (persistent — focus preserved across data refreshes)
		this.listSearchWrap = container.createDiv({ cls: 'codemarker-detail-search-wrap' });
		new SearchComponent(this.listSearchWrap)
			.setPlaceholder('Filter codes...')
			.onChange((value: string) => {
				if (this.searchTimeout) clearTimeout(this.searchTimeout);
				this.searchTimeout = setTimeout(() => {
					this.searchQuery = value;
					this.renderListContent();
				}, 150);
			});

		// Content zone (replaced on search/data refresh, search input stays)
		this.listContentZone = container.createDiv();
		this.renderListContent();
	}

	private renderListContent() {
		if (!this.listContentZone) return;
		this.listContentZone.empty();

		const codes = this.model.registry.getAll();
		const counts = this.countSegmentsPerCode();

		// Filtered codes
		const q = this.searchQuery.toLowerCase();
		const filteredCodes = q
			? codes.filter(def => def.name.toLowerCase().includes(q))
			: codes;

		// List
		const list = this.listContentZone.createDiv({ cls: 'codemarker-explorer-list' });
		for (const def of filteredCodes) {
			const count = counts.get(def.name) ?? 0;
			const row = list.createDiv({ cls: 'codemarker-explorer-row' });

			const swatch = row.createSpan({ cls: 'codemarker-detail-swatch' });
			swatch.style.backgroundColor = def.color;

			const info = row.createDiv({ cls: 'codemarker-explorer-row-info' });
			info.createSpan({ text: def.name, cls: 'codemarker-explorer-row-name' });
			if (def.description) {
				info.createSpan({ text: def.description, cls: 'codemarker-explorer-row-desc' });
			}

			row.createSpan({ text: `${count}`, cls: 'codemarker-explorer-row-count' });

			row.addEventListener('click', () => {
				this.searchQuery = '';
				this.showCodeDetail(def.name);
			});
		}
	}

	private countSegmentsPerCode(): Map<string, number> {
		const counts = new Map<string, number>();
		for (const marker of this.model.getAllMarkers()) {
			for (const code of marker.codes) {
				counts.set(code, (counts.get(code) ?? 0) + 1);
			}
		}
		return counts;
	}

	// ─── Code-Focused Detail ────────────────────────────────

	private renderCodeDetail() {
		const container = this.contentEl;
		container.empty();
		this.listMode = false;
		this.listSearchWrap = null;
		this.listContentZone = null;

		if (!this.codeName) return;

		this.renderBackButton(container);

		const def = this.model.registry.getByName(this.codeName);
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
			swatch.addEventListener('click', (e) => {
				e.stopPropagation();
				this.model.offChange(this.boundRefresh);
				colorInput.click();
			});
			colorInput.addEventListener('input', () => {
				const newColor = colorInput.value;
				swatch.style.backgroundColor = newColor;
				this.model.registry.update(def.id, { color: newColor });
				this.model.saveMarkers();
				// Update decorations for all files with markers using this code
				const affectedFiles = new Set(
					this.model.getAllMarkers()
						.filter(m => m.codes.includes(this.codeName!))
						.map(m => m.fileId)
				);
				for (const fileId of affectedFiles) {
					this.model.updateDecorations(fileId);
				}
			});
			colorInput.addEventListener('change', () => {
				this.model.onChange(this.boundRefresh);
			});
		}

		header.createSpan({ text: this.codeName, cls: 'codemarker-detail-title' });

		// Description — editable textarea
		this.renderCodeDescription(container, def);

		// All markers with this code (across all files)
		const allMarkers = this.model.getAllMarkers()
			.filter(m => m.codes.includes(this.codeName!));

		if (allMarkers.length === 0) {
			container.createEl('p', { text: 'No segments yet.', cls: 'codemarker-detail-empty' });
			if (def) this.renderDeleteCodeButton(container, def.name);
			return;
		}

		const segSection = container.createDiv({ cls: 'codemarker-detail-section' });
		segSection.createEl('h6', { text: `Segments (${allMarkers.length})` });

		const list = segSection.createEl('ul', { cls: 'codemarker-detail-marker-list' });
		for (const marker of allMarkers) {
			const label = this.getMarkerLabel(marker);

			const li = list.createEl('li', { cls: 'codemarker-detail-marker-item' });
			li.dataset.markerId = marker.id;

			// File reference + navigate icon row
			const fileRow = li.createDiv({ cls: 'codemarker-detail-marker-file-row' });
			fileRow.createSpan({ cls: 'codemarker-detail-marker-file', text: this.shortenPath(marker.fileId) });

			// Navigate-to-document icon
			const navIcon = fileRow.createSpan({ cls: 'codemarker-detail-nav-icon' });
			setIcon(navIcon, 'file-search');
			navIcon.title = 'Reveal in document';
			navIcon.addEventListener('click', (e) => {
				e.stopPropagation();
				this.navigateToMarker(marker);
			});

			// Text preview
			li.createEl('span', { text: label });

			// Click item → open marker-focused detail (+ navigate if enabled)
			li.addEventListener('click', () => {
				if (this.autoRevealOnSegmentClick) this.navigateToMarker(marker);
				this.setContext(marker.id, this.codeName!);
			});
			li.addEventListener('mouseenter', () => {
				this.model.setHoverState(marker.id, this.codeName);
			});
			li.addEventListener('mouseleave', () => {
				this.model.setHoverState(null, null);
			});
		}

		// Segments by file (tree grouped by file)
		this.renderSegmentsByFile(container, allMarkers);

		// Delete code — at the bottom, after all content
		if (def) {
			this.renderDeleteCodeButton(container, def.name);
		}
	}

	// ─── Segments by File (tree in code-focused detail) ─────

	private renderSegmentsByFile(container: HTMLElement, allMarkers: BaseMarker[]) {
		// Group markers by fileId
		const byFile = new Map<string, BaseMarker[]>();
		for (const marker of allMarkers) {
			const list = byFile.get(marker.fileId);
			if (list) list.push(marker);
			else byFile.set(marker.fileId, [marker]);
		}

		const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-file-tree' });
		section.createEl('h6', { text: `Segments by file` });

		const treeRoot = section.createDiv({ cls: 'search-results-container' });

		for (const [fileId, markers] of byFile) {
			const fileName = this.shortenPath(fileId);

			// File group
			const fileTreeItem = treeRoot.createDiv({ cls: 'tree-item search-result' });
			const fileSelf = fileTreeItem.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });

			fileSelf.createDiv({ cls: 'tree-item-icon collapse-icon' }, (el) => setIcon(el, 'right-triangle'));
			fileSelf.createSpan({ cls: 'tree-item-inner', text: fileName });
			fileSelf.createSpan({ cls: 'tree-item-flair', text: String(markers.length) });

			const fileChildren = fileTreeItem.createDiv({ cls: 'search-result-file-matches' });

			for (const marker of markers) {
				const label = this.getMarkerLabel(marker);
				const matchEl = fileChildren.createDiv({ cls: 'search-result-file-match' });
				matchEl.dataset.markerId = marker.id;
				matchEl.textContent = label;
				matchEl.addEventListener('click', () => {
					if (this.autoRevealOnSegmentClick) this.navigateToMarker(marker);
					this.setContext(marker.id, this.codeName!);
				});
				matchEl.addEventListener('mouseenter', () => {
					this.model.setHoverState(marker.id, this.codeName);
				});
				matchEl.addEventListener('mouseleave', () => {
					this.model.setHoverState(null, null);
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

	// ─── Marker-Focused Detail ──────────────────────────────

	private renderMarkerDetail() {
		const container = this.contentEl;
		container.empty();
		this.listMode = false;
		this.listSearchWrap = null;
		this.listContentZone = null;

		if (!this.markerId || !this.codeName) return;

		const savedCode = this.codeName;
		this.renderBackButton(container, savedCode, () => this.showCodeDetail(savedCode));

		const marker = this.model.getMarkerById(this.markerId);
		if (!marker) {
			container.createEl('p', { text: 'Marker not found.', cls: 'codemarker-detail-empty' });
			return;
		}

		// ── Text Segment (hero — first thing you see) ──
		const text = this.getMarkerText(marker);
		if (text) {
			const blockquote = container.createEl('blockquote', { cls: 'codemarker-detail-quote' });
			blockquote.createEl('p', { text });
		}

		// ── File ref + reveal link (inline metadata) ──
		const segMeta = container.createDiv({ cls: 'codemarker-detail-seg-meta' });
		segMeta.createSpan({ cls: 'codemarker-detail-marker-file', text: this.shortenPath(marker.fileId) });
		segMeta.createSpan({ cls: 'codemarker-detail-seg-sep', text: '\u00b7' });
		const revealLink = segMeta.createSpan({ cls: 'codemarker-detail-reveal-link' });
		const revealIcon = revealLink.createSpan();
		setIcon(revealIcon, 'file-search');
		revealLink.createSpan({ text: 'Reveal' });
		revealLink.addEventListener('click', () => this.navigateToMarker(marker));

		// ── Engine-specific custom section (e.g. audio/video memo) ──
		this.renderCustomSection(container, marker);

		// ── Memo ──
		const memoSection = container.createDiv({ cls: 'codemarker-detail-section' });
		memoSection.createEl('h6', { text: 'Memo' });
		const memoTextarea = memoSection.createEl('textarea', {
			cls: 'codemarker-detail-memo',
			attr: { placeholder: 'Add a memo...', rows: '3' },
		});
		memoTextarea.value = marker.memo ?? '';
		memoTextarea.addEventListener('input', () => {
			this.model.updateMarkerFields(marker.id, { memo: memoTextarea.value || undefined });
		});
		memoTextarea.addEventListener('focus', () => {
			this.model.offChange(this.boundRefresh);
		});
		memoTextarea.addEventListener('blur', () => {
			this.model.onChange(this.boundRefresh);
		});

		// ── Segment color override ──
		const colorSection = container.createDiv({ cls: 'codemarker-detail-section' });
		colorSection.createEl('h6', { text: 'Color' });
		const colorRow = colorSection.createDiv({ cls: 'codemarker-detail-color-row' });

		const inheritedColor = this.model.registry.getColorForCodes(marker.codes) ?? '#888';
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
			this.model.offChange(this.boundRefresh);
			colorInput.click();
		});
		colorInput.addEventListener('input', () => {
			swatch.style.backgroundColor = colorInput.value;
			resetBtn.style.display = '';
			this.model.updateMarkerFields(marker.id, { colorOverride: colorInput.value });
		});
		colorInput.addEventListener('change', () => {
			this.model.onChange(this.boundRefresh);
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
			this.model.updateMarkerFields(marker.id, { colorOverride: undefined });
		});

		// ── Codes on this segment ──
		if (marker.codes.length > 0) {
			const codesSection = container.createDiv({ cls: 'codemarker-detail-section' });
			codesSection.createEl('h6', { text: 'Codes' });
			const chipList = codesSection.createDiv({ cls: 'codemarker-detail-chips' });
			for (const code of marker.codes) {
				const codeDef = this.model.registry.getByName(code);
				const codeColor = codeDef?.color ?? '#888';
				const chip = chipList.createEl('span', { cls: 'codemarker-detail-chip' });
				const dot = chip.createSpan({ cls: 'codemarker-detail-chip-dot' });
				dot.style.backgroundColor = codeColor;
				chip.createSpan({ text: code });
				if (code === this.codeName) {
					chip.addClass('is-active');
				}
				chip.addEventListener('click', () => {
					this.showCodeDetail(code);
				});
			}
		}

		// ── Delete segment ──
		this.renderDeleteSegmentButton(container, marker);
	}

	// ─── Shared Helpers ─────────────────────────────────────

	private renderCodeDescription(container: HTMLElement, def: import('./types').CodeDefinition | undefined) {
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
			this.model.registry.update(def.id, { description: val });
			this.model.saveMarkers();
		});
		textarea.addEventListener('focus', () => {
			this.model.offChange(this.boundRefresh);
		});
		textarea.addEventListener('blur', () => {
			this.model.onChange(this.boundRefresh);
		});
	}

	private renderDeleteCodeButton(container: HTMLElement, codeName: string) {
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
				this.model.deleteCode(codeName);
				this.showList();
			});
			cancelBtn.addEventListener('click', () => {
				confirmWrap.remove();
				btn.style.display = '';
			});
		});
	}

	private renderDeleteSegmentButton(container: HTMLElement, marker: BaseMarker) {
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
				const code = this.codeName;
				this.model.removeMarker(marker.id);
				if (code) this.showCodeDetail(code);
				else this.showList();
			});
			cancelBtn.addEventListener('click', () => {
				confirmWrap.remove();
				btn.style.display = '';
			});
		});
	}

	private renderBackButton(container: HTMLElement, label?: string, callback?: () => void) {
		const back = container.createDiv({ cls: 'codemarker-detail-back' });
		const icon = back.createSpan();
		setIcon(icon, 'arrow-left');
		back.createSpan({ text: label ?? 'All Codes' });
		back.addEventListener('click', () => {
			if (callback) callback();
			else this.showList();
		});
	}

	// ─── Hover sync (model → sidebar) ───────────────────────

	private applyHoverToItems() {
		const hoveredIds = this.model.getHoverMarkerIds();
		const items = Array.from(this.contentEl.querySelectorAll<HTMLElement>('[data-marker-id]'));
		for (const el of items) {
			el.toggleClass('is-hovered', hoveredIds.includes(el.dataset.markerId!));
		}
	}
}
